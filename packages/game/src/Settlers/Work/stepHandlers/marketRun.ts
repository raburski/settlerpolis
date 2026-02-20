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
import { ReservationKind } from '../../../Reservation'

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

const tileKey = (tile: TilePosition): string => `${tile.x},${tile.y}`

const isBlockedRoadTile = (
	blockedRoadTiles: ReadonlySet<string> | undefined,
	tile: TilePosition
): boolean => blockedRoadTiles?.has(tileKey(tile)) ?? false

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

const findClosestRoadTile = (
	roadData: { width: number, height: number, data: Array<RoadType | null> } | null,
	origin: TilePosition,
	maxRadius: number,
	blockedRoadTiles?: ReadonlySet<string>
): TilePosition | null => {
	if (!roadData) {
		return null
	}
	if (isRoadTile(roadData, origin) && !isBlockedRoadTile(blockedRoadTiles, origin)) {
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
				if (isRoadTile(roadData, candidate) && !isBlockedRoadTile(blockedRoadTiles, candidate)) {
					return candidate
				}
			}
		}
	}
	return null
}

const getRoadNeighbors = (
	roadData: { width: number, height: number, data: Array<RoadType | null> },
	tile: TilePosition,
	blockedRoadTiles?: ReadonlySet<string>
): TilePosition[] => {
	if (blockedRoadTiles?.has(tileKey(tile))) {
		return []
	}
	const neighbors = [
		{ x: tile.x, y: tile.y - 1 },
		{ x: tile.x + 1, y: tile.y },
		{ x: tile.x, y: tile.y + 1 },
		{ x: tile.x - 1, y: tile.y }
	]
	return neighbors.filter(neighbor =>
		isRoadTile(roadData, neighbor) && !isBlockedRoadTile(blockedRoadTiles, neighbor)
	)
}

const sameTile = (a: TilePosition, b: TilePosition): boolean => a.x === b.x && a.y === b.y

const undirectedEdgeKey = (a: TilePosition, b: TilePosition): string => {
	const aKey = tileKey(a)
	const bKey = tileKey(b)
	return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`
}

const directionRank = (from: TilePosition, to: TilePosition): number => {
	const dx = to.x - from.x
	const dy = to.y - from.y
	if (dx === 0 && dy === -1) {
		return 0
	}
	if (dx === 1 && dy === 0) {
		return 1
	}
	if (dx === 0 && dy === 1) {
		return 2
	}
	if (dx === -1 && dy === 0) {
		return 3
	}
	return 4
}

const isStraightThrough = (tile: TilePosition, neighbors: TilePosition[]): boolean => {
	if (neighbors.length !== 2) {
		return false
	}
	const a = neighbors[0]
	const b = neighbors[1]
	const ax = a.x - tile.x
	const ay = a.y - tile.y
	const bx = b.x - tile.x
	const by = b.y - tile.y
	return ax === -bx && ay === -by
}

interface RoadNetwork {
	tileByKey: Map<string, TilePosition>
	adjacencyByKey: Map<string, TilePosition[]>
}

interface RoadNetworkSegment {
	id: string
	startKey: string
	endKey: string
	tiles: TilePosition[]
}

const discoverRoadNetwork = (
	roadData: { width: number, height: number, data: Array<RoadType | null> },
	start: TilePosition,
	maxSteps: number,
	blockedRoadTiles?: ReadonlySet<string>
): RoadNetwork => {
	const startKey = tileKey(start)
	const queue: TilePosition[] = [start]
	let head = 0
	const distanceByKey = new Map<string, number>([[startKey, 0]])
	const tileByKey = new Map<string, TilePosition>([[startKey, start]])

	while (head < queue.length) {
		const current = queue[head]
		head += 1
		const currentKey = tileKey(current)
		const currentDistance = distanceByKey.get(currentKey) ?? 0
		if (currentDistance >= maxSteps) {
			continue
		}
		const neighbors = getRoadNeighbors(roadData, current, blockedRoadTiles).sort((a, b) => {
			const rankDelta = directionRank(current, a) - directionRank(current, b)
			if (rankDelta !== 0) {
				return rankDelta
			}
			if (a.y !== b.y) {
				return a.y - b.y
			}
			return a.x - b.x
		})
		for (const neighbor of neighbors) {
			const neighborKey = tileKey(neighbor)
			if (distanceByKey.has(neighborKey)) {
				continue
			}
			distanceByKey.set(neighborKey, currentDistance + 1)
			tileByKey.set(neighborKey, neighbor)
			queue.push(neighbor)
		}
	}

	const adjacencyByKey = new Map<string, TilePosition[]>()
	for (const [key, tile] of tileByKey.entries()) {
		const neighbors = getRoadNeighbors(roadData, tile, blockedRoadTiles)
			.filter(neighbor => tileByKey.has(tileKey(neighbor)))
			.sort((a, b) => {
				const rankDelta = directionRank(tile, a) - directionRank(tile, b)
				if (rankDelta !== 0) {
					return rankDelta
				}
				if (a.y !== b.y) {
					return a.y - b.y
				}
				return a.x - b.x
			})
		adjacencyByKey.set(key, neighbors)
	}

	return { tileByKey, adjacencyByKey }
}

const buildRoadSegments = (network: RoadNetwork, start: TilePosition): Map<string, RoadNetworkSegment[]> => {
	const nodeKeys = new Set<string>()
	const startKey = tileKey(start)

	for (const [key, tile] of network.tileByKey.entries()) {
		const neighbors = network.adjacencyByKey.get(key) ?? []
		if (key === startKey || neighbors.length !== 2 || !isStraightThrough(tile, neighbors)) {
			nodeKeys.add(key)
		}
	}

	const orderedNodeKeys = Array.from(nodeKeys.values()).sort((a, b) => {
		const aTile = network.tileByKey.get(a)
		const bTile = network.tileByKey.get(b)
		if (!aTile || !bTile) {
			return a.localeCompare(b)
		}
		const da = Math.abs(aTile.x - start.x) + Math.abs(aTile.y - start.y)
		const db = Math.abs(bTile.x - start.x) + Math.abs(bTile.y - start.y)
		if (da !== db) {
			return da - db
		}
		if (aTile.y !== bTile.y) {
			return aTile.y - bTile.y
		}
		return aTile.x - bTile.x
	})

	const traversedEdges = new Set<string>()
	const segmentsByNode = new Map<string, RoadNetworkSegment[]>()
	let segmentCounter = 0

	for (const nodeKey of orderedNodeKeys) {
		const nodeTile = network.tileByKey.get(nodeKey)
		if (!nodeTile) {
			continue
		}
		const neighbors = network.adjacencyByKey.get(nodeKey) ?? []
		for (const neighbor of neighbors) {
			const firstEdgeKey = undirectedEdgeKey(nodeTile, neighbor)
			if (traversedEdges.has(firstEdgeKey)) {
				continue
			}

			const tiles: TilePosition[] = [nodeTile]
			let previous = nodeTile
			let current = neighbor
			traversedEdges.add(firstEdgeKey)

			while (true) {
				tiles.push(current)
				const currentKey = tileKey(current)
				if (nodeKeys.has(currentKey)) {
					break
				}

				const nextCandidates = (network.adjacencyByKey.get(currentKey) ?? [])
					.filter(candidate => !sameTile(candidate, previous))
				if (nextCandidates.length === 0) {
					break
				}
				const next = nextCandidates.sort((a, b) => {
					const rankDelta = directionRank(current, a) - directionRank(current, b)
					if (rankDelta !== 0) {
						return rankDelta
					}
					if (a.y !== b.y) {
						return a.y - b.y
					}
					return a.x - b.x
				})[0]
				traversedEdges.add(undirectedEdgeKey(current, next))
				previous = current
				current = next
			}

			const endKey = tileKey(current)
			if (tiles.length <= 1) {
				continue
			}

			const segment: RoadNetworkSegment = {
				id: `seg-${segmentCounter}`,
				startKey: nodeKey,
				endKey,
				tiles
			}
			segmentCounter += 1

			segmentsByNode.set(nodeKey, [...(segmentsByNode.get(nodeKey) ?? []), segment])
			if (endKey !== nodeKey) {
				segmentsByNode.set(endKey, [...(segmentsByNode.get(endKey) ?? []), segment])
			}
		}
	}

	for (const [nodeKey, segments] of segmentsByNode.entries()) {
		const nodeTile = network.tileByKey.get(nodeKey)
		if (!nodeTile) {
			continue
		}
		segments.sort((a, b) => {
			const aRef = a.startKey === nodeKey ? a.tiles[1] : a.tiles[a.tiles.length - 2]
			const bRef = b.startKey === nodeKey ? b.tiles[1] : b.tiles[b.tiles.length - 2]
			const aRank = aRef ? directionRank(nodeTile, aRef) : 99
			const bRank = bRef ? directionRank(nodeTile, bRef) : 99
			if (aRank !== bRank) {
				return aRank - bRank
			}
			if (a.tiles.length !== b.tiles.length) {
				return b.tiles.length - a.tiles.length
			}
			return a.id.localeCompare(b.id)
		})
	}

	return segmentsByNode
}

export const buildRoadNetworkWalk = (
	roadData: { width: number, height: number, data: Array<RoadType | null> } | null,
	start: TilePosition | null,
	maxSteps: number,
	blockedRoadTiles?: ReadonlySet<string>
): TilePosition[] => {
	if (!roadData || !start || maxSteps <= 0) {
		return []
	}
	if (isBlockedRoadTile(blockedRoadTiles, start)) {
		return []
	}

	const network = discoverRoadNetwork(roadData, start, maxSteps, blockedRoadTiles)
	const startKey = tileKey(start)
	const segmentsByNode = buildRoadSegments(network, start)
	const route: TilePosition[] = [start]
	const visitedSegments = new Set<string>()

	const appendSegment = (segment: RoadNetworkSegment, fromNodeKey: string) => {
		const orientedTiles = fromNodeKey === segment.startKey
			? segment.tiles
			: [...segment.tiles].reverse()
		for (const tile of orientedTiles) {
			const last = route[route.length - 1]
			if (last && sameTile(last, tile)) {
				continue
			}
			route.push(tile)
		}
	}

	const traverse = (nodeKey: string, mustReturnToNode: boolean) => {
		const connected = segmentsByNode.get(nodeKey) ?? []
		for (const segment of connected) {
			if (visitedSegments.has(segment.id)) {
				continue
			}
			visitedSegments.add(segment.id)

			const nextNodeKey = segment.startKey === nodeKey
				? segment.endKey
				: segment.startKey
			appendSegment(segment, nodeKey)

			if (nextNodeKey !== nodeKey) {
				traverse(nextNodeKey, true)
			}

			const hasMoreAtNode = (segmentsByNode.get(nodeKey) ?? [])
				.some(candidate => !visitedSegments.has(candidate.id))
			if (mustReturnToNode || hasMoreAtNode) {
				appendSegment(segment, nextNodeKey)
			}
		}
	}

	traverse(startKey, false)
	return route
}

const getAllowedMarketItemTypes = (definition: { storageSlots?: Array<{ itemType: string }>, marketDistribution?: { itemTypes?: string[] } }): string[] => {
	if (definition.marketDistribution?.itemTypes && definition.marketDistribution.itemTypes.length > 0) {
		return definition.marketDistribution.itemTypes
	}
	const fromSlots = (definition.storageSlots || []).map(slot => slot.itemType)
	return Array.from(new Set(fromSlots))
}

const getRotationStep = (rotation: number | undefined): number => {
	if (typeof rotation !== 'number' || !Number.isFinite(rotation)) {
		return 0
	}
	const halfPi = Math.PI / 2
	const normalized = Math.round(rotation / halfPi)
	return ((normalized % 4) + 4) % 4
}

const getRotatedFootprint = (
	footprint: { width: number, height: number },
	rotation: number | undefined
): { width: number, height: number } => {
	const step = getRotationStep(rotation)
	if (step % 2 === 0) {
		return footprint
	}
	return { width: footprint.height, height: footprint.width }
}

const buildMarketRoadBlockadeTiles = (
	buildings: Array<{
		mapId: string
		playerId: string
		position: Position
		rotation?: number
		stage: ConstructionStage
		buildingId: string
	}>,
	getDefinition: (buildingId: string) => { footprint: { width: number, height: number }, marketRoadBlockade?: boolean } | undefined,
	mapId: string,
	playerId: string,
	tileSize: number
): Set<string> => {
	const blockedRoadTiles = new Set<string>()
	for (const building of buildings) {
		if (building.mapId !== mapId || building.playerId !== playerId) {
			continue
		}
		if (building.stage !== ConstructionStage.Completed) {
			continue
		}
		const buildingDefinition = getDefinition(building.buildingId)
		if (!buildingDefinition?.marketRoadBlockade) {
			continue
		}
		const footprint = getRotatedFootprint(buildingDefinition.footprint, building.rotation)
		const origin = toTile(building.position, tileSize)
		for (let tileY = 0; tileY < footprint.height; tileY += 1) {
			for (let tileX = 0; tileX < footprint.width; tileX += 1) {
				blockedRoadTiles.add(`${origin.x + tileX},${origin.y + tileY}`)
			}
		}
	}
	return blockedRoadTiles
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
				return { actions: [{ type: WorkActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
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
			return { actions: [{ type: WorkActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
		}

		const actions: WorkAction[] = []
		const reservations = new ReservationBag()

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
					reservations.add(() => reservationSystem.release(reservationRef))
					remaining = reservedQuantity
					const withdrawPosition = resolveWalkablePosition(collision, market.position, tileSize) ?? market.position
					actions.push(
						{ type: WorkActionType.Move, position: withdrawPosition, targetType: MoveTargetType.Building, targetId: market.id, setState: SettlerState.MovingToBuilding },
						{
							type: WorkActionType.WithdrawStorage,
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

				reservations.add(() => reservationSystem.release(reservation.ref))
				actions.push({
					type: WorkActionType.DeliverStorage,
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
			const returnReservation = reservationSystem.reserve({
				kind: ReservationKind.Storage,
				direction: 'incoming',
				buildingInstanceId: market.id,
				itemType: resolvedItemType,
				quantity: remaining,
				ownerId: assignment.assignmentId
			})
			if (returnReservation && returnReservation.kind === ReservationKind.Storage) {
				reservations.add(() => reservationSystem.release(returnReservation.ref))
				const deliverPosition = resolveWalkablePosition(collision, market.position, tileSize) ?? market.position
				actions.push(
					{ type: WorkActionType.Move, position: deliverPosition, targetType: MoveTargetType.Building, targetId: market.id, setState: SettlerState.CarryingItem },
					{
						type: WorkActionType.DeliverStorage,
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
			actions
		}
	}
}
