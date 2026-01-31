import { ConstructionStage } from '../../../Buildings/types'
import { SettlerState } from '../../../Population/types'
import { RoadType } from '../../../Roads/types'
import type { Position } from '../../../types'
import { calculateDistance } from '../../../utils'
import { WorkAction, WorkActionType, WorkStepType } from '../types'
import type { StepHandler } from './types'

type TilePosition = { x: number, y: number }

const DEFAULT_MAX_DISTANCE_TILES = 25
const DEFAULT_MAX_STOPS = 8
const DEFAULT_ROAD_SEARCH_RADIUS = 8
const DEFAULT_HOUSE_SEARCH_RADIUS = 3
const DEFAULT_CARRY_QUANTITY = 8
const DEFAULT_DELIVERY_QUANTITY = 2

const toTile = (position: Position, tileSize: number): TilePosition => ({
	x: Math.floor(position.x / tileSize),
	y: Math.floor(position.y / tileSize)
})

const toWorld = (tile: TilePosition, tileSize: number): Position => ({
	x: tile.x * tileSize + tileSize / 2,
	y: tile.y * tileSize + tileSize / 2
})

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

const buildRoadWalk = (roadData: { width: number, height: number, data: Array<RoadType | null> } | null, start: TilePosition | null, maxSteps: number): TilePosition[] => {
	if (!roadData || !start || maxSteps <= 0) {
		return []
	}
	const route: TilePosition[] = [start]
	const visited = new Set<string>([`${start.x},${start.y}`])
	let current = start

	for (let i = 0; i < maxSteps; i++) {
		const neighbors = getRoadNeighbors(roadData, current)
		if (neighbors.length === 0) {
			break
		}
		const unvisited = neighbors.filter(neighbor => !visited.has(`${neighbor.x},${neighbor.y}`))
		const candidates = unvisited.length > 0 ? unvisited : neighbors
		const next = candidates[Math.floor(Math.random() * candidates.length)]
		if (!next) {
			break
		}
		route.push(next)
		visited.add(`${next.x},${next.y}`)
		current = next
	}

	return route
}

const getAllowedMarketItemTypes = (definition: { storage?: { capacities: Record<string, number>, slots?: Array<{ itemType: string }> }, marketDistribution?: { itemTypes?: string[] } }): string[] => {
	if (definition.marketDistribution?.itemTypes && definition.marketDistribution.itemTypes.length > 0) {
		return definition.marketDistribution.itemTypes
	}
	const fromCapacity = Object.keys(definition.storage?.capacities || {})
	const fromSlots = (definition.storage?.slots || []).map(slot => slot.itemType)
	return Array.from(new Set([...fromCapacity, ...fromSlots]))
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

		const map = managers.map.getMap(market.mapName)
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

		const settler = managers.population.getSettler(settlerId)
		if (!settler) {
			return { actions: [] }
		}

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
			return { actions: [{ type: WorkActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
		}

		const resolvedItemType = itemType

		const houses = managers.buildings.getAllBuildings()
			.filter(building => building.mapName === market.mapName && building.playerId === market.playerId)
			.filter(building => building.stage === ConstructionStage.Completed)
			.filter(building => managers.buildings.getBuildingDefinition(building.buildingId)?.spawnsSettlers)
			.map(building => ({ building, tile: toTile(building.position, tileSize) }))
			.filter(entry => managers.storage.acceptsItemType(entry.building.id, resolvedItemType))
			.filter(entry => managers.storage.hasAvailableStorage(entry.building.id, resolvedItemType, deliveryQuantity))

		if (houses.length === 0) {
			return { actions: [{ type: WorkActionType.Wait, durationMs: 1500, setState: SettlerState.WaitingForWork }] }
		}

		const roadData = managers.roads.getRoadData(market.mapName)
		const marketTile = toTile(market.position, tileSize)
		const startRoad = findClosestRoadTile(roadData, marketTile, roadSearchRadius)
		const roadRoute = buildRoadWalk(roadData, startRoad, Math.max(1, maxDistanceTiles))

		const actions: WorkAction[] = []
		const releaseFns: Array<() => void> = []

		let remaining = carriedQuantity
		if (!carriedType || carriedQuantity <= 0) {
			const maxCarry = Math.max(1, config.carryQuantity ?? managers.items.getItemMetadata(resolvedItemType)?.maxStackSize ?? DEFAULT_CARRY_QUANTITY)
			const available = managers.storage.getAvailableQuantity(market.id, resolvedItemType)
			remaining = Math.min(maxCarry, available)
			if (remaining <= 0) {
				return { actions: [{ type: WorkActionType.Wait, durationMs: 1200, setState: SettlerState.WaitingForWork }] }
			}

			const reservation = reservationSystem.reserveStorageOutgoing(market.id, resolvedItemType, remaining, assignment.assignmentId)
			if (!reservation) {
				return { actions: [{ type: WorkActionType.Wait, durationMs: 1200, setState: SettlerState.WaitingForWork }] }
			}
			releaseFns.push(() => reservationSystem.releaseStorageReservation(reservation.reservationId))

			actions.push(
				{ type: WorkActionType.Move, position: reservation.position, targetType: 'storage_slot', targetId: reservation.reservationId, setState: SettlerState.MovingToBuilding },
				{ type: WorkActionType.WithdrawStorage, buildingInstanceId: market.id, itemType: resolvedItemType, quantity: remaining, reservationId: reservation.reservationId, setState: SettlerState.CarryingItem }
			)
		}

		if (startRoad) {
			actions.push({
				type: WorkActionType.Move,
				position: toWorld(startRoad, tileSize),
				targetType: 'road',
				targetId: `${startRoad.x},${startRoad.y}`,
				setState: SettlerState.Moving
			})
		}

		const delivered = new Set<string>()
		let stops = 0

		const fallbackTile = startRoad ?? marketTile
		const routeTiles = roadRoute.length > 0 ? roadRoute : [fallbackTile]
		let lastRoadTile = routeTiles[routeTiles.length - 1] ?? fallbackTile

		for (let index = 0; index < routeTiles.length; index++) {
			const roadTile = routeTiles[index]

			if (!(index === 0 && startRoad)) {
				actions.push({
					type: WorkActionType.Move,
					position: toWorld(roadTile, tileSize),
					targetType: 'road',
					targetId: `${roadTile.x},${roadTile.y}`,
					setState: SettlerState.Moving
				})
			}

			if (remaining <= 0 || stops >= maxStops) {
				continue
			}

			const houseCandidate = houses
				.filter(entry => !delivered.has(entry.building.id))
				.filter(entry => Math.abs(entry.tile.x - roadTile.x) <= houseSearchRadius && Math.abs(entry.tile.y - roadTile.y) <= houseSearchRadius)
				.sort((a, b) => {
					const aDist = Math.abs(a.tile.x - roadTile.x) + Math.abs(a.tile.y - roadTile.y)
					const bDist = Math.abs(b.tile.x - roadTile.x) + Math.abs(b.tile.y - roadTile.y)
					return aDist - bDist
				})[0]

			if (!houseCandidate) {
				continue
			}

			const deliverQty = Math.min(deliveryQuantity, remaining)
			const reservation = reservationSystem.reserveStorageIncoming(houseCandidate.building.id, resolvedItemType, deliverQty, assignment.assignmentId)
			if (!reservation) {
				continue
			}

			const path = managers.map.findPath(market.mapName, toWorld(roadTile, tileSize), reservation.position, {
				roadData: roadData || undefined,
				allowDiagonal: true
			})
			if (!path || path.length === 0) {
				reservationSystem.releaseStorageReservation(reservation.reservationId)
				continue
			}

			releaseFns.push(() => reservationSystem.releaseStorageReservation(reservation.reservationId))

			actions.push(
				{ type: WorkActionType.Move, position: reservation.position, targetType: 'storage_slot', targetId: reservation.reservationId, setState: SettlerState.CarryingItem },
				{ type: WorkActionType.DeliverStorage, buildingInstanceId: houseCandidate.building.id, itemType: resolvedItemType, quantity: deliverQty, reservationId: reservation.reservationId, setState: SettlerState.Working }
			)

			if (roadTile) {
				actions.push({
					type: WorkActionType.Move,
					position: toWorld(roadTile, tileSize),
					targetType: 'road',
					targetId: `${roadTile.x},${roadTile.y}`,
					setState: SettlerState.Moving
				})
			}

			remaining -= deliverQty
			delivered.add(houseCandidate.building.id)
			stops += 1
		}

		const returnPosition = lastRoadTile ? toWorld(lastRoadTile, tileSize) : market.position
		if (calculateDistance(returnPosition, market.position) > tileSize) {
			actions.push({
				type: WorkActionType.Move,
				position: market.position,
				targetType: 'building',
				targetId: market.id,
				setState: SettlerState.MovingToBuilding
			})
		}

		if (remaining > 0) {
			const returnReservation = reservationSystem.reserveStorageIncoming(market.id, resolvedItemType, remaining, assignment.assignmentId)
			if (returnReservation) {
				releaseFns.push(() => reservationSystem.releaseStorageReservation(returnReservation.reservationId))
				actions.push(
					{ type: WorkActionType.Move, position: returnReservation.position, targetType: 'storage_slot', targetId: returnReservation.reservationId, setState: SettlerState.CarryingItem },
					{ type: WorkActionType.DeliverStorage, buildingInstanceId: market.id, itemType: resolvedItemType, quantity: remaining, reservationId: returnReservation.reservationId, setState: SettlerState.Working }
				)
			} else {
				actions.push({
					type: WorkActionType.Move,
					position: market.position,
					targetType: 'building',
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
			releaseReservations: () => releaseFns.forEach(fn => fn())
		}
	}
}
