import { ConstructionStage } from '../../../Buildings/types'
import { SettlerState } from '../../../Population/types'
import { RoadType } from '../../../Roads/types'
import type { Position } from '../../../types'
import { calculateDistance } from '../../../utils'
import { WorkAction, WorkActionType, WorkStepType } from '../types'
import type { StepHandler } from './types'
import { ReservationBag } from '../reservations'
import { MoveTargetType } from '../../../Movement/types'
import { assignRecipientsToRouteSegments, buildRouteSegments } from './routeDeliveryPlanner'

type TilePosition = { x: number, y: number }

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
	for (let radius = 1; radius <= maxRadius; radius++) {
		for (let dx = -radius; dx <= radius; dx++) {
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

const isRoadTile = (roadData: { width: number, height: number, data: Array<RoadType | null> } | null, tile: TilePosition): boolean => {
	if (!roadData) {
		return false
	}
	if (tile.x < 0 || tile.y < 0 || tile.x >= roadData.width || tile.y >= roadData.height) {
		return false
	}
	const index = tile.y * roadData.width + tile.x
	const roadType = roadData.data[index] ?? RoadType.None
	return roadType !== RoadType.None
}

const findClosestRoadTile = (roadData: { width: number, height: number, data: Array<RoadType | null> } | null, origin: TilePosition, maxRadius: number): TilePosition | null => {
	if (!roadData) {
		return null
	}
	if (isRoadTile(roadData, origin)) {
		return origin
	}
	for (let radius = 1; radius <= maxRadius; radius++) {
		for (let dx = -radius; dx <= radius; dx++) {
			const dy = radius - Math.abs(dx)
			const candidates = [
				{ x: origin.x + dx, y: origin.y + dy },
				{ x: origin.x + dx, y: origin.y - dy }
			]
			for (const candidate of candidates) {
				if (isRoadTile(roadData, candidate)) {
					return candidate
				}
			}
		}
	}
	return null
}

const getRoadNeighbors = (roadData: { width: number, height: number, data: Array<RoadType | null> }, tile: TilePosition): TilePosition[] => {
	const neighbors = [
		{ x: tile.x, y: tile.y - 1 },
		{ x: tile.x + 1, y: tile.y },
		{ x: tile.x, y: tile.y + 1 },
		{ x: tile.x - 1, y: tile.y }
	]
	return neighbors.filter(neighbor => isRoadTile(roadData, neighbor))
}

const tileKey = (tile: TilePosition): string => `${tile.x},${tile.y}`

const sortRoadTilesByStartDistance = (tiles: TilePosition[], start: TilePosition): TilePosition[] => {
	return [...tiles].sort((a, b) => {
		const da = Math.abs(a.x - start.x) + Math.abs(a.y - start.y)
		const db = Math.abs(b.x - start.x) + Math.abs(b.y - start.y)
		if (da !== db) {
			return da - db
		}
		if (a.y !== b.y) {
			return a.y - b.y
		}
		return a.x - b.x
	})
}

const findShortestRoadPath = (
	roadData: { width: number, height: number, data: Array<RoadType | null> },
	start: TilePosition,
	goal: TilePosition
): TilePosition[] => {
	if (start.x === goal.x && start.y === goal.y) {
		return [start]
	}

	const startKey = tileKey(start)
	const goalKey = tileKey(goal)
	const queue: TilePosition[] = [start]
	let head = 0
	const visited = new Set<string>([startKey])
	const parentByKey = new Map<string, string>()
	const tileByKey = new Map<string, TilePosition>([[startKey, start]])

	while (head < queue.length) {
		const current = queue[head]
		head += 1
		const neighbors = getRoadNeighbors(roadData, current)
		for (const neighbor of neighbors) {
			const neighborKey = tileKey(neighbor)
			if (visited.has(neighborKey)) {
				continue
			}
			visited.add(neighborKey)
			parentByKey.set(neighborKey, tileKey(current))
			tileByKey.set(neighborKey, neighbor)
			queue.push(neighbor)
			if (neighborKey === goalKey) {
				const reversedPath: TilePosition[] = []
				let cursor = goalKey
				while (true) {
					const tile = tileByKey.get(cursor)
					if (!tile) {
						return []
					}
					reversedPath.push(tile)
					if (cursor === startKey) {
						break
					}
					const parent = parentByKey.get(cursor)
					if (!parent) {
						return []
					}
					cursor = parent
				}
				return reversedPath.reverse()
			}
		}
	}

	return []
}

const buildBreadthFirstRoadWalk = (roadData: { width: number, height: number, data: Array<RoadType | null> } | null, start: TilePosition | null, maxSteps: number): TilePosition[] => {
	if (!roadData || !start || maxSteps <= 0) {
		return []
	}

	const route: TilePosition[] = [start]
	const discovered = new Set<string>([tileKey(start)])
	const queue: TilePosition[] = [start]
	let queueHead = 0
	let currentTile = start
	let stepsLeft = maxSteps

	while (queueHead < queue.length && stepsLeft > 0) {
		const targetTile = queue[queueHead]
		queueHead += 1

		const neighbors = sortRoadTilesByStartDistance(getRoadNeighbors(roadData, targetTile), start)
		for (const neighbor of neighbors) {
			const neighborKey = tileKey(neighbor)
			if (discovered.has(neighborKey)) {
				continue
			}
			discovered.add(neighborKey)
			queue.push(neighbor)
		}

		if (targetTile.x === currentTile.x && targetTile.y === currentTile.y) {
			continue
		}

		const shortestPath = findShortestRoadPath(roadData, currentTile, targetTile)
		if (shortestPath.length <= 1) {
			continue
		}

		const travelSteps = Math.min(stepsLeft, shortestPath.length - 1)
		for (let pathIndex = 1; pathIndex <= travelSteps; pathIndex += 1) {
			route.push(shortestPath[pathIndex])
		}
		currentTile = shortestPath[travelSteps]
		stepsLeft -= travelSteps

		if (travelSteps < shortestPath.length - 1) {
			break
		}
	}

	return route
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
				return { actions: [{ type: WorkActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
			}
			itemType = allowedTypes[0]
		}

		const resolvedItemType = itemType

		const houses = managers.buildings.getAllBuildings()
			.filter(building => building.mapId === market.mapId && building.playerId === market.playerId)
			.filter(building => building.stage === ConstructionStage.Completed)
			.filter(building => managers.buildings.getBuildingDefinition(building.buildingId)?.spawnsSettlers)
			.map(building => ({ building, tile: toTile(building.position, tileSize) }))
			.filter(entry => managers.storage.acceptsItemType(entry.building.id, resolvedItemType))
			.filter(entry => managers.storage.hasAvailableStorage(entry.building.id, resolvedItemType, deliveryQuantity))

		const roadData = managers.roads.getRoadData(market.mapId)
		const marketTile = toTile(market.position, tileSize)
		const startRoad = findClosestRoadTile(roadData, marketTile, roadSearchRadius)
		const roadRoute = buildBreadthFirstRoadWalk(roadData, startRoad, Math.max(1, maxDistanceTiles))

		const actions: WorkAction[] = []
		const reservations = new ReservationBag()

		let remaining = carriedQuantity
		if (!carriedType || carriedQuantity <= 0) {
			const maxCarryConfig = config.carryQuantity ?? managers.items.getItemMetadata(resolvedItemType)?.maxStackSize ?? DEFAULT_CARRY_QUANTITY
			const maxCarry = Math.max(1, Math.min(carryCapacity, maxCarryConfig))
			const available = managers.storage.getAvailableQuantity(market.id, resolvedItemType)
			remaining = Math.min(maxCarry, available)
			if (remaining > 0) {
				let reservation = reservationSystem.reserveStorageOutgoingInternal(market.id, resolvedItemType, remaining, assignment.assignmentId)
				if (!reservation && remaining > 1) {
					reservation = reservationSystem.reserveStorageOutgoingInternal(market.id, resolvedItemType, 1, assignment.assignmentId)
				}

				if (reservation) {
					const reservationId = reservation.reservationId
					const reservedQuantity = reservation.quantity
					reservations.add(() => reservationSystem.releaseStorageReservation(reservationId))
					remaining = reservedQuantity
					const withdrawPosition = resolveWalkablePosition(collision, market.position, tileSize) ?? market.position
					actions.push(
						{ type: WorkActionType.Move, position: withdrawPosition, targetType: MoveTargetType.Building, targetId: market.id, setState: SettlerState.MovingToBuilding },
						{ type: WorkActionType.WithdrawStorage, buildingInstanceId: market.id, itemType: resolvedItemType, quantity: reservedQuantity, reservationId, setState: SettlerState.CarryingItem }
					)
				} else {
					remaining = 0
				}
			}
		}

		if (remaining <= 0) {
			return { actions: [{ type: WorkActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
		}

		if (startRoad) {
			actions.push({
				type: WorkActionType.Move,
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
		const houseAssignmentsBySegment = assignRecipientsToRouteSegments(
			routeSegments,
			houses.map(entry => ({
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
				type: WorkActionType.FollowPath,
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

			const candidates = houseAssignmentsBySegment[segment.index] ?? []
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
				const reservation = reservationSystem.reserveStorageIncoming(
					candidate.payload.building.id,
					resolvedItemType,
					deliverQty,
					assignment.assignmentId
				)
				if (!reservation) {
					continue
				}

				reservations.add(() => reservationSystem.releaseStorageReservation(reservation.reservationId))
				actions.push({
					type: WorkActionType.DeliverStorage,
					buildingInstanceId: candidate.payload.building.id,
					itemType: resolvedItemType,
					quantity: reservation.quantity,
					reservationId: reservation.reservationId,
					setState: SettlerState.Working
				})

				remaining -= reservation.quantity
				delivered.add(candidate.recipientId)
				stops += 1
				deliveredOnSegment = true
			}

			if (deliveredOnSegment && patrolPauseMs > 0) {
				actions.push({
					type: WorkActionType.Wait,
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
				type: WorkActionType.Move,
				position: approachPosition,
				targetType: MoveTargetType.Building,
				targetId: market.id,
				setState: SettlerState.MovingToBuilding
			})
		}

		if (remaining > 0) {
			const returnReservation = reservationSystem.reserveStorageIncoming(market.id, resolvedItemType, remaining, assignment.assignmentId)
			if (returnReservation) {
				reservations.add(() => reservationSystem.releaseStorageReservation(returnReservation.reservationId))
				const deliverPosition = resolveWalkablePosition(collision, market.position, tileSize) ?? market.position
				actions.push(
					{ type: WorkActionType.Move, position: deliverPosition, targetType: MoveTargetType.Building, targetId: market.id, setState: SettlerState.CarryingItem },
					{ type: WorkActionType.DeliverStorage, buildingInstanceId: market.id, itemType: resolvedItemType, quantity: remaining, reservationId: returnReservation.reservationId, setState: SettlerState.Working }
				)
			} else {
				actions.push({
					type: WorkActionType.Move,
					position: market.position,
					targetType: MoveTargetType.Building,
					targetId: market.id,
					setState: SettlerState.MovingToBuilding
				})
			}
		}

		if (actions.length === 0) {
			return { actions: [{ type: WorkActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
		}

		return {
			actions,
			releaseReservations: () => reservations.releaseAll()
		}
	}
}
