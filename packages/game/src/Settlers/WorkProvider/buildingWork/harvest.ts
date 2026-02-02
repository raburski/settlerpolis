import { BuildingWorkKind, getHarvestDefinition } from '../../../Buildings/work'
import { calculateDistance } from '../../../utils'
import type { ResourceNodeInstance } from '../../../ResourceNodes/types'
import { WorkStepType, WorkWaitReason } from '../types'
import type { BuildingWorkHandler } from './types'

export const HarvestWorkHandler: BuildingWorkHandler = {
	kind: BuildingWorkKind.Harvest,
	canHandle: (definition) => Boolean(getHarvestDefinition(definition)),
	getNextStep: ({ building, definition, managers, settler }) => {
		const harvestDefinition = getHarvestDefinition(definition)
		if (!harvestDefinition) {
			return null
		}

		if (settler.stateContext.carryingItemType) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.CarryingItem }
		}

		const nodeDefinition = managers.resourceNodes.getDefinition(harvestDefinition.nodeType)
		if (!nodeDefinition) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoNodeDefinition }
		}

		if (!managers.storage.hasAvailableStorage(building.id, nodeDefinition.outputItemType, nodeDefinition.harvestQuantity)) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoStorage }
		}

		const map = managers.map.getMap(building.mapName)
		const tileSize = map?.tiledMap.tilewidth || 32
		const workCenter = building.workAreaCenter ?? building.position
		const radiusTiles = harvestDefinition.radiusTiles
		const maxDistance = radiusTiles ? radiusTiles * tileSize : null

		let node = managers.resourceNodes.findClosestAvailableNode(building.mapName, harvestDefinition.nodeType, workCenter)
		if (node && maxDistance !== null) {
			const distance = calculateDistance(workCenter, node.position)
			if (distance > maxDistance) {
				node = undefined
			}
		}
		if (!node && maxDistance !== null) {
			const availableNodes = managers.resourceNodes.getAvailableNodes(building.mapName, harvestDefinition.nodeType)
			let best: ResourceNodeInstance | undefined
			for (const candidate of availableNodes) {
				const candidateDistance = calculateDistance(workCenter, candidate.position)
				if (candidateDistance > maxDistance) {
					continue
				}
				if (!best) {
					best = candidate
					continue
				}
				const bestDistance = calculateDistance(workCenter, best.position)
				if (candidateDistance < bestDistance) {
					best = candidate
				}
			}
			node = best
		}
		if (!node) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoNodes }
		}

		return {
			type: WorkStepType.Harvest,
			buildingInstanceId: building.id,
			resourceNodeId: node.id,
			outputItemType: nodeDefinition.outputItemType,
			quantity: nodeDefinition.harvestQuantity,
			durationMs: nodeDefinition.harvestTimeMs ?? 1000
		}
	}
}
