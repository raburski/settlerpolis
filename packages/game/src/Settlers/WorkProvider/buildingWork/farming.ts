import { BuildingWorkKind, getFarmDefinition } from '../../../Buildings/work'
import { WorkStepType, WorkWaitReason } from '../types'
import type { BuildingWorkHandler } from './types'
import { calculateDistance } from '../../../utils'

export const FarmingWorkHandler: BuildingWorkHandler = {
	kind: BuildingWorkKind.Farm,
	canHandle: (definition) => Boolean(getFarmDefinition(definition)),
	getNextStep: ({ building, definition, managers, settler }) => {
		const farm = getFarmDefinition(definition)
		if (!farm) {
			return null
		}

		if (settler.stateContext.carryingItemType) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.CarryingItem }
		}

		const cropDefinition = managers.resourceNodes.getDefinition(farm.cropNodeType)
		if (!cropDefinition) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoNodeDefinition }
		}

		const map = managers.map.getMap(building.mapName)
		if (!map) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoWork }
		}

		const tileSize = map.tiledMap.tilewidth || 32
		const buildingTileX = Math.floor(building.position.x / tileSize)
		const buildingTileY = Math.floor(building.position.y / tileSize)

		const isWithinRadius = (position: { x: number, y: number }) => {
			const tileX = Math.floor(position.x / tileSize)
			const tileY = Math.floor(position.y / tileSize)
			const dx = tileX - buildingTileX
			const dy = tileY - buildingTileY
			return Math.hypot(dx, dy) <= farm.plotRadiusTiles
		}

		const availableNodes = managers.resourceNodes.getAvailableNodes(building.mapName, farm.cropNodeType)
			.filter(node => isWithinRadius(node.position))

		if (availableNodes.length > 0) {
			const closest = availableNodes.reduce((best, node) => {
				const bestDistance = calculateDistance(building.position, best.position)
				const nodeDistance = calculateDistance(building.position, node.position)
				return nodeDistance < bestDistance ? node : best
			})

			if (!managers.storage.hasAvailableStorage(building.id, cropDefinition.outputItemType, cropDefinition.harvestQuantity)) {
				return { type: WorkStepType.Wait, reason: WorkWaitReason.NoStorage }
			}

			return {
				type: WorkStepType.Harvest,
				buildingInstanceId: building.id,
				resourceNodeId: closest.id,
				outputItemType: cropDefinition.outputItemType,
				quantity: cropDefinition.harvestQuantity,
				durationMs: cropDefinition.harvestTimeMs ?? 1000
			}
		}

		const existingNodes = managers.resourceNodes.getNodes(building.mapName, farm.cropNodeType)
			.filter(node => isWithinRadius(node.position))

		if (farm.maxPlots && existingNodes.length >= farm.maxPlots) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoPlots }
		}

		const occupiedTiles = new Set<string>()
		const nodesForOccupancy = managers.resourceNodes.getNodes(building.mapName)
			.filter(node => isWithinRadius(node.position))
		for (const node of nodesForOccupancy) {
			const tileX = Math.floor(node.position.x / tileSize)
			const tileY = Math.floor(node.position.y / tileSize)
			occupiedTiles.add(`${tileX},${tileY}`)
		}

		const candidates: Array<{ x: number, y: number, distance: number }> = []
		const radius = farm.plotRadiusTiles

		for (let dy = -radius; dy <= radius; dy++) {
			for (let dx = -radius; dx <= radius; dx++) {
				const tileX = buildingTileX + dx
				const tileY = buildingTileY + dy
				if (tileX < 0 || tileY < 0 || tileX >= map.tiledMap.width || tileY >= map.tiledMap.height) {
					continue
				}
				const distance = Math.hypot(dx, dy)
				if (distance > radius) {
					continue
				}
				if (occupiedTiles.has(`${tileX},${tileY}`)) {
					continue
				}
				if (managers.map.isCollision(building.mapName, tileX, tileY)) {
					continue
				}
				const worldPosition = { x: tileX * tileSize, y: tileY * tileSize }
				const previewItem = { id: 'plot-preview', itemType: cropDefinition.nodeItemType }
				if (!managers.mapObjects.canPlaceAt(building.mapName, worldPosition, previewItem)) {
					continue
				}
				candidates.push({ x: tileX, y: tileY, distance })
			}
		}

		if (candidates.length === 0) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoPlots }
		}

		candidates.sort((a, b) => {
			if (a.distance !== b.distance) {
				return a.distance - b.distance
			}
			if (a.y !== b.y) {
				return a.y - b.y
			}
			return a.x - b.x
		})

		const target = candidates[0]
		const targetPosition = { x: target.x * tileSize, y: target.y * tileSize }

		return {
			type: WorkStepType.Plant,
			buildingInstanceId: building.id,
			nodeType: farm.cropNodeType,
			position: targetPosition,
			plantTimeMs: farm.plantTimeMs,
			growTimeMs: farm.growTimeMs
		}
	}
}
