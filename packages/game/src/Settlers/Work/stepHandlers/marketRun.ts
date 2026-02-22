import { ConstructionStage } from '../../../Buildings/types'
import {
	buildMarketRoadBlockadeTiles,
	buildRoadNetworkWalk,
	findClosestRoadTile,
	type TilePosition
} from '../../../Buildings/marketRoadReach'
import { SettlerState } from '../../../Population/types'
import type { Position } from '../../../types'
import { calculateDistance } from '../../../utils'
import { WorkStepType } from '../types'
import { SettlerActionType } from '../../Actions/types'
import type { SettlerAction } from '../../Actions/types'
import type { StepHandler } from './types'
import { MoveTargetType } from '../../../Movement/types'
import { assignRecipientsToRouteSegments, buildRouteSegments } from './routeDeliveryPlanner'
import { ReservationKind, type ReservationRef } from '../../../Reservation'

const DEFAULT_MAX_DISTANCE_TILES = 25
const DEFAULT_MAX_STOPS = 8
const DEFAULT_ROAD_SEARCH_RADIUS = 8
const DEFAULT_HOUSE_SEARCH_RADIUS = 3
const DEFAULT_CARRY_QUANTITY = 8
const DEFAULT_DELIVERY_QUANTITY = 1
const DEFAULT_PATROL_STRIDE_TILES = 4
const DEFAULT_PATROL_PAUSE_MS = 300
const DEFAULT_PATROL_SPEED_MULTIPLIER = 0.75
const DEFAULT_WALKABLE_SEARCH_RADIUS = 4

const toTile = (position: Position, tileSize: number): TilePosition => ({
	x: Math.floor(position.x / tileSize),
	y: Math.floor(position.y / tileSize)
})

const toWorld = (tile: TilePosition, tileSize: number): Position => ({
	x: tile.x * tileSize + tileSize / 2,
	y: tile.y * tileSize + tileSize / 2
})

const findNearestWalkableTile = (
	collision: { width: number, height: number, data: number[] } | undefined,
	origin: TilePosition,
	maxRadius: number
): TilePosition | null => {
	if (!collision) {
		return origin
	}
	const isWalkable = (tile: TilePosition) => {
		if (tile.x < 0 || tile.y < 0 || tile.x >= collision.width || tile.y >= collision.height) {
			return false
		}
		const index = tile.y * collision.width + tile.x
		return collision.data[index] === 0
	}
	if (isWalkable(origin)) {
		return origin
	}
	for (let radius = 1; radius <= maxRadius; radius += 1) {
		for (let dx = -radius; dx <= radius; dx += 1) {
			const dy = radius - Math.abs(dx)
			const candidates = [
				{ x: origin.x + dx, y: origin.y + dy },
				{ x: origin.x + dx, y: origin.y - dy }
			]
			for (const candidate of candidates) {
				if (isWalkable(candidate)) {
					return candidate
				}
			}
		}
	}
	return null
}

const resolveWalkablePosition = (
	collision: { width: number, height: number, data: number[] } | undefined,
	position: Position,
	tileSize: number
): Position | null => {
	const origin = toTile(position, tileSize)
	const walkable = findNearestWalkableTile(collision, origin, DEFAULT_WALKABLE_SEARCH_RADIUS)
	if (!walkable) {
		return null
	}
	return toWorld(walkable, tileSize)
}

const getAllowedMarketItemTypes = (definition: { storageSlots?: Array<{ itemType: string }>, marketDistribution?: { itemTypes?: string[] } }): string[] => {
	if (definition.marketDistribution?.itemTypes && definition.marketDistribution.itemTypes.length > 0) {
		return definition.marketDistribution.itemTypes
	}
	const fromSlots = (definition.storageSlots || []).map(slot => slot.itemType)
	return Array.from(new Set(fromSlots))
}

export const MarketRunHandler: StepHandler = {
	type: WorkStepType.MarketRun,
	build: ({ settlerId, assignment, step, managers, reservationSystem }) => {
		if (step.type !== WorkStepType.MarketRun) {
			return { actions: [] }
		}

		const market = managers.buildings.getBuildingInstance(step.buildingInstanceId)
		if (!market) {
			return { actions: [] }
		}

		const definition = managers.buildings.getBuildingDefinition(market.buildingId)
		if (!definition?.marketDistribution) {
			return { actions: [] }
		}

		const map = managers.map.getMap(market.mapId)
		if (!map) {
			return { actions: [] }
		}

		const tileSize = map.tiledMap.tilewidth || 32
		const config = definition.marketDistribution
		const maxDistanceTiles = config.maxDistanceTiles ?? DEFAULT_MAX_DISTANCE_TILES
		const maxStops = config.maxStops ?? DEFAULT_MAX_STOPS
		const roadSearchRadius = config.roadSearchRadiusTiles ?? DEFAULT_ROAD_SEARCH_RADIUS
		const houseSearchRadius = config.houseSearchRadiusTiles ?? DEFAULT_HOUSE_SEARCH_RADIUS
		const deliveryTarget = config.deliveryTarget ?? 'houses'
		const deliveryQuantity = Math.max(1, config.deliveryQuantity ?? DEFAULT_DELIVERY_QUANTITY)
		const patrolStrideTiles = Math.max(1, config.patrolStrideTiles ?? DEFAULT_PATROL_STRIDE_TILES)
		const patrolPauseMs = Math.max(0, Math.floor(config.patrolPauseMs ?? DEFAULT_PATROL_PAUSE_MS))
		const patrolSpeedMultiplier = Math.max(0.2, Math.min(1, config.patrolSpeedMultiplier ?? DEFAULT_PATROL_SPEED_MULTIPLIER))
		const collision = map.collision

		const settler = managers.population.getSettler(settlerId)
		if (!settler) {
			return { actions: [] }
		}
		const carryCapacity = managers.population.getSettlerCarryCapacity(settlerId)

		const allowedTypes = getAllowedMarketItemTypes(definition)
		const carriedType = settler.stateContext.carryingItemType
		const carriedQuantity = settler.stateContext.carryingQuantity ?? 0
		const isCarrying = Boolean(carriedType && carriedQuantity > 0)
		const candidateTypes = allowedTypes.length > 0 ? allowedTypes : (carriedType ? [carriedType] : [])

		let itemType = carriedType
		if (!itemType) {
			let bestType: string | undefined
			let bestQuantity = 0
			for (const candidate of candidateTypes) {
				const available = managers.storage.getAvailableQuantity(market.id, candidate)
				if (available > bestQuantity) {
					bestQuantity = available
					bestType = candidate
				}
			}
			itemType = bestType
		}

		if (!itemType) {
			if (allowedTypes.length === 0) {
				return { actions: [{ type: SettlerActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
			}
			itemType = allowedTypes[0]
		}

		const resolvedItemType = itemType

		const recipients = managers.buildings.getAllBuildings()
			.filter(building => building.mapId === market.mapId && building.playerId === market.playerId)
			.filter(building => building.stage === ConstructionStage.Completed)
			.filter(building => building.id !== market.id)
			.map(building => ({
				building,
				definition: managers.buildings.getBuildingDefinition(building.buildingId),
				tile: toTile(building.position, tileSize)
			}))
			.filter(entry => Boolean(entry.definition))
			.filter(entry => {
				const isHouse = Boolean(entry.definition?.spawnsSettlers)
				if (deliveryTarget === 'houses') {
					return isHouse
				}
				if (deliveryTarget === 'buildings') {
					return !isHouse
				}
				return true
			})
			.filter(entry => managers.storage.acceptsItemType(entry.building.id, resolvedItemType))
			.filter(entry => managers.storage.hasAvailableStorage(entry.building.id, resolvedItemType, deliveryQuantity))

		const roadData = managers.roads.getRoadData(market.mapId)
		const marketTile = toTile(market.position, tileSize)
		const blockedRoadTiles = buildMarketRoadBlockadeTiles(
			managers.buildings.getAllBuildings(),
			(buildingId) => managers.buildings.getBuildingDefinition(buildingId),
			market.mapId,
			market.playerId,
			tileSize
		)
		const startRoad = findClosestRoadTile(roadData, marketTile, roadSearchRadius, blockedRoadTiles)
		const roadRoute = buildRoadNetworkWalk(
			roadData,
			startRoad,
			Math.max(1, maxDistanceTiles),
			blockedRoadTiles
		)

		if (!startRoad && !isCarrying) {
			return { actions: [{ type: SettlerActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
		}

		const actions: SettlerAction[] = []
		const reservationRefs: ReservationRef[] = []
		const releaseReservations = () => reservationSystem.releaseMany(reservationRefs)

		let remaining = carriedQuantity
		if (!isCarrying) {
			const maxCarryConfig = config.carryQuantity ?? managers.items.getItemMetadata(resolvedItemType)?.maxStackSize ?? DEFAULT_CARRY_QUANTITY
			const maxCarry = Math.max(1, Math.min(carryCapacity, maxCarryConfig))
			const available = managers.storage.getAvailableQuantity(market.id, resolvedItemType)
			remaining = Math.min(maxCarry, available)
			if (remaining > 0) {
				let reservation = reservationSystem.reserve({
					kind: ReservationKind.Storage,
					direction: 'outgoing',
					buildingInstanceId: market.id,
					itemType: resolvedItemType,
					quantity: remaining,
					ownerId: assignment.assignmentId,
					allowInternal: true
				})
				if ((!reservation || reservation.kind !== ReservationKind.Storage) && remaining > 1) {
					reservation = reservationSystem.reserve({
						kind: ReservationKind.Storage,
						direction: 'outgoing',
						buildingInstanceId: market.id,
						itemType: resolvedItemType,
						quantity: 1,
						ownerId: assignment.assignmentId,
						allowInternal: true
					})
				}

				if (reservation && reservation.kind === ReservationKind.Storage) {
					const reservationId = reservation.reservationId
					const reservedQuantity = reservation.quantity
					const reservationRef = reservation.ref
					reservationRefs.push(reservationRef)
					remaining = reservedQuantity
					const withdrawPosition = resolveWalkablePosition(collision, market.position, tileSize) ?? market.position
					actions.push(
						{ type: SettlerActionType.Move, position: withdrawPosition, targetType: MoveTargetType.Building, targetId: market.id, setState: SettlerState.MovingToBuilding },
						{
							type: SettlerActionType.WithdrawStorage,
							buildingInstanceId: market.id,
							itemType: resolvedItemType,
							quantity: reservedQuantity,
							reservationId,
							reservationRefs: [reservationRef],
							setState: SettlerState.CarryingItem
						}
					)
				} else {
					remaining = 0
				}
			}
		}

		if (remaining <= 0) {
			releaseReservations()
			return { actions: [{ type: SettlerActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
		}

		if (startRoad) {
			actions.push({
				type: SettlerActionType.Move,
				position: toWorld(startRoad, tileSize),
				targetType: MoveTargetType.Road,
				targetId: `${startRoad.x},${startRoad.y}`,
				speedMultiplier: patrolSpeedMultiplier,
				setState: SettlerState.Moving
			})
		}

		const delivered = new Set<string>()
		let stops = 0

		const fallbackTile = startRoad ?? marketTile
		const routeTiles = roadRoute.length > 0 ? roadRoute : [fallbackTile]
		const lastRoadTile = routeTiles[routeTiles.length - 1] ?? fallbackTile
		const routeSegments = buildRouteSegments(routeTiles, patrolStrideTiles)
		const recipientAssignmentsBySegment = assignRecipientsToRouteSegments(
			routeSegments,
			recipients.map(entry => ({
				recipientId: entry.building.id,
				tile: entry.tile,
				payload: entry
			})),
			houseSearchRadius
		)

		let bufferedPatrolTiles: TilePosition[] = []
		const appendPatrolTiles = (tiles: TilePosition[]) => {
			for (const tile of tiles) {
				const last = bufferedPatrolTiles[bufferedPatrolTiles.length - 1]
				if (last && last.x === tile.x && last.y === tile.y) {
					continue
				}
				bufferedPatrolTiles.push(tile)
			}
		}
		const flushPatrolTiles = () => {
			if (bufferedPatrolTiles.length <= 1) {
				return
			}
			const endTile = bufferedPatrolTiles[bufferedPatrolTiles.length - 1]
			actions.push({
				type: SettlerActionType.FollowPath,
				path: bufferedPatrolTiles.map(tile => toWorld(tile, tileSize)),
				targetType: MoveTargetType.Road,
				targetId: `${endTile.x},${endTile.y}`,
				speedMultiplier: patrolSpeedMultiplier,
				setState: SettlerState.Moving
			})
			bufferedPatrolTiles = [endTile]
		}

		for (const segment of routeSegments) {
			appendPatrolTiles(segment.tiles)

			if (remaining <= 0 || stops >= maxStops) {
				continue
			}

			const candidates = recipientAssignmentsBySegment[segment.index] ?? []
			let deliveredOnSegment = false
			for (const candidate of candidates) {
				if (remaining <= 0 || stops >= maxStops) {
					break
				}
				if (delivered.has(candidate.recipientId)) {
					continue
				}

				flushPatrolTiles()

				const deliverQty = Math.min(deliveryQuantity, remaining)
				const reservation = reservationSystem.reserve({
					kind: ReservationKind.Storage,
					direction: 'incoming',
					buildingInstanceId: candidate.payload.building.id,
					itemType: resolvedItemType,
					quantity: deliverQty,
					ownerId: assignment.assignmentId
				})
				if (!reservation || reservation.kind !== ReservationKind.Storage) {
					continue
				}

				reservationRefs.push(reservation.ref)
				actions.push({
					type: SettlerActionType.DeliverStorage,
					buildingInstanceId: candidate.payload.building.id,
					itemType: resolvedItemType,
					quantity: reservation.quantity,
					reservationId: reservation.reservationId,
					reservationRefs: [reservation.ref],
					setState: SettlerState.Working
				})

				remaining -= reservation.quantity
				delivered.add(candidate.recipientId)
				stops += 1
				deliveredOnSegment = true
			}

			if (deliveredOnSegment && patrolPauseMs > 0) {
				actions.push({
					type: SettlerActionType.Wait,
					durationMs: patrolPauseMs,
					setState: SettlerState.Moving
				})
			}
		}
		flushPatrolTiles()

		const returnPosition = lastRoadTile ? toWorld(lastRoadTile, tileSize) : market.position
		if (calculateDistance(returnPosition, market.position) > tileSize) {
			const approachPosition = resolveWalkablePosition(collision, market.position, tileSize) ?? market.position
			actions.push({
				type: SettlerActionType.Move,
				position: approachPosition,
				targetType: MoveTargetType.Building,
				targetId: market.id,
				setState: SettlerState.MovingToBuilding
			})
		}

		if (remaining > 0) {
			const returnReservation = reservationSystem.reserve({
				kind: ReservationKind.Storage,
				direction: 'incoming',
				buildingInstanceId: market.id,
				itemType: resolvedItemType,
				quantity: remaining,
				ownerId: assignment.assignmentId
			})
			if (returnReservation && returnReservation.kind === ReservationKind.Storage) {
				reservationRefs.push(returnReservation.ref)
				const deliverPosition = resolveWalkablePosition(collision, market.position, tileSize) ?? market.position
				actions.push(
					{ type: SettlerActionType.Move, position: deliverPosition, targetType: MoveTargetType.Building, targetId: market.id, setState: SettlerState.CarryingItem },
					{
						type: SettlerActionType.DeliverStorage,
						buildingInstanceId: market.id,
						itemType: resolvedItemType,
						quantity: remaining,
						reservationId: returnReservation.reservationId,
						reservationRefs: [returnReservation.ref],
						setState: SettlerState.Working
					}
				)
			} else {
				actions.push({
					type: SettlerActionType.Move,
					position: market.position,
					targetType: MoveTargetType.Building,
					targetId: market.id,
					setState: SettlerState.MovingToBuilding
				})
			}
		}

		if (actions.length === 0) {
			releaseReservations()
			return { actions: [{ type: SettlerActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
		}

		return {
			actions
		}
	}
}
