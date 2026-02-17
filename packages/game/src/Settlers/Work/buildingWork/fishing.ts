import { BuildingWorkKind, getFishingDefinition } from '../../../Buildings/work'
import { WorkStepType, WorkWaitReason } from '../types'
import type { BuildingWorkHandler } from './types'
import { calculateDistance } from '../../../utils'
import { GroundType } from '../../../Map/types'

const WATER_TYPES = new Set<GroundType>([GroundType.WaterShallow, GroundType.WaterDeep])

export const FishingWorkHandler: BuildingWorkHandler = {
	kind: BuildingWorkKind.Fishing,
	canHandle: (definition) => Boolean(getFishingDefinition(definition)),
	getNextStep: ({ building, definition, managers, settler }) => {
		const fishing = getFishingDefinition(definition)
		if (!fishing) {
			return null
		}

		if (settler.stateContext.carryingItemType) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.CarryingItem }
		}

		const nodeDefinition = managers.resourceNodes.getDefinition(fishing.nodeType)
		if (!nodeDefinition) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoNodeDefinition }
		}

		const map = managers.map.getMap(building.mapId)
		if (!map) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoWork }
		}

		const tileSize = map.tiledMap.tilewidth || 32
		const workCenter = building.workAreaCenter ?? building.position
		const radiusTiles = Math.max(0, fishing.radiusTiles)
		const maxDistance = radiusTiles * tileSize

		const allNodes = managers.resourceNodes.getNodes(building.mapId, fishing.nodeType)
			.filter(node => calculateDistance(workCenter, node.position) <= maxDistance)
		const availableNodes = managers.resourceNodes.getAvailableNodes(building.mapId, fishing.nodeType)
			.filter(node => calculateDistance(workCenter, node.position) <= maxDistance)

		if (availableNodes.length === 0 || allNodes.length === 0) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoNodes }
		}

		const workTileX = Math.floor(workCenter.x / tileSize)
		const workTileY = Math.floor(workCenter.y / tileSize)

		const isWater = (groundType: GroundType | null) => groundType && WATER_TYPES.has(groundType)
		const isShoreTile = (tileX: number, tileY: number): boolean => {
			const groundType = managers.map.getGroundTypeAt(building.mapId, tileX, tileY)
			if (!groundType || isWater(groundType)) {
				return false
			}
			if (managers.map.isCollision(building.mapId, tileX, tileY)) {
				return false
			}
			const neighbors = [
				{ dx: 1, dy: 0 },
				{ dx: -1, dy: 0 },
				{ dx: 0, dy: 1 },
				{ dx: 0, dy: -1 }
			]
			for (const neighbor of neighbors) {
				const neighborType = managers.map.getGroundTypeAt(building.mapId, tileX + neighbor.dx, tileY + neighbor.dy)
				if (isWater(neighborType)) {
					return true
				}
			}
			return false
		}

		const candidates: Array<{ x: number, y: number, distance: number }> = []
		for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
			for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
				const tileX = workTileX + dx
				const tileY = workTileY + dy
				if (tileX < 0 || tileY < 0 || tileX >= map.tiledMap.width || tileY >= map.tiledMap.height) {
					continue
				}
				const distance = Math.hypot(dx, dy)
				if (distance > radiusTiles) {
					continue
				}
				if (!isShoreTile(tileX, tileY)) {
					continue
				}
				candidates.push({ x: tileX, y: tileY, distance })
			}
		}

		if (candidates.length === 0) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoWork }
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

		const targetNode = availableNodes.reduce((best, node) => {
			const bestDistance = calculateDistance(targetPosition, best.position)
			const nodeDistance = calculateDistance(targetPosition, node.position)
			return nodeDistance < bestDistance ? node : best
		})

		const nodesPerEfficiency = Math.max(1, fishing.nodesPerEfficiency ?? 4)
		const maxEfficiency = Math.max(0, fishing.maxEfficiency ?? 1)
		const efficiency = Math.min(maxEfficiency, allNodes.length / nodesPerEfficiency)

		const baseMin = Math.max(1, fishing.minCatch)
		const baseMax = Math.max(baseMin, fishing.maxCatch)
		const scaledMin = Math.max(1, Math.floor(baseMin * efficiency))
		const scaledMax = Math.max(scaledMin, Math.floor(baseMax * efficiency))
		const quantity = scaledMin + Math.floor(Math.random() * (scaledMax - scaledMin + 1))

		if (!managers.storage.hasAvailableStorage(building.id, nodeDefinition.outputItemType, quantity)) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoStorage }
		}

		return {
			type: WorkStepType.Fish,
			buildingInstanceId: building.id,
			resourceNodeId: targetNode.id,
			targetPosition,
			outputItemType: nodeDefinition.outputItemType,
			quantity,
			durationMs: fishing.fishingTimeMs
		}
	}
}
