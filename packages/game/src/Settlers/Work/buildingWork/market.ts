import { BuildingWorkKind } from '../../../Buildings/work'
import { RoadType } from '../../../Roads/types'
import { WorkStepType, WorkWaitReason } from '../types'
import type { BuildingWorkHandler } from './types'

type TilePosition = { x: number, y: number }

const DEFAULT_ROAD_SEARCH_RADIUS = 8

const getAllowedMarketItemTypes = (definition: { storageSlots?: Array<{ itemType: string }>, marketDistribution?: { itemTypes?: string[] } }): string[] => {
	if (definition.marketDistribution?.itemTypes && definition.marketDistribution.itemTypes.length > 0) {
		return definition.marketDistribution.itemTypes
	}

	const fromSlots = (definition.storageSlots || []).map(slot => slot.itemType)
	return Array.from(new Set(fromSlots))
}

const toTile = (position: { x: number, y: number }, tileSize: number): TilePosition => ({
	x: Math.floor(position.x / tileSize),
	y: Math.floor(position.y / tileSize)
})

const isRoadTile = (
	roadData: { width: number, height: number, data: Array<RoadType | null> } | null,
	tile: TilePosition
): boolean => {
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

const hasRoadNearby = (
	roadData: { width: number, height: number, data: Array<RoadType | null> } | null,
	origin: TilePosition,
	maxRadius: number
): boolean => {
	if (isRoadTile(roadData, origin)) {
		return true
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
					return true
				}
			}
		}
	}
	return false
}

export const MarketWorkHandler: BuildingWorkHandler = {
	kind: BuildingWorkKind.Market,
	canHandle: (definition) => Boolean(definition.marketDistribution),
	getNextStep: ({ building, definition, settler, managers }) => {
		const isCarrying = Boolean(settler.stateContext.carryingItemType && (settler.stateContext.carryingQuantity ?? 0) > 0)
		if (isCarrying) {
			return { type: WorkStepType.MarketRun, buildingInstanceId: building.id }
		}

		const map = managers.map.getMap(building.mapId)
		if (map) {
			const tileSize = map.tiledMap.tilewidth || 32
			const roadSearchRadius = Math.max(0, definition.marketDistribution?.roadSearchRadiusTiles ?? DEFAULT_ROAD_SEARCH_RADIUS)
			const roadData = managers.roads.getRoadData(building.mapId)
			const buildingTile = toTile(building.position, tileSize)
			if (!hasRoadNearby(roadData, buildingTile, roadSearchRadius)) {
				return { type: WorkStepType.Wait, reason: WorkWaitReason.NoRoadAccess }
			}
		}

		const allowedTypes = getAllowedMarketItemTypes(definition)
		if (allowedTypes.length === 0) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoWork }
		}

		const availableType = allowedTypes.find(itemType => managers.storage.getAvailableQuantity(building.id, itemType) > 0)
		if (!availableType) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.MissingInputs }
		}

		return { type: WorkStepType.MarketRun, buildingInstanceId: building.id }
	}
}
