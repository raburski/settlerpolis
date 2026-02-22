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

		const map = managers.map.getMap(building.mapId)
		const tileSize = map?.tiledMap.tilewidth || 32
		const workCenter = building.workAreaCenter ?? building.position
		const radiusTiles = harvestDefinition.radiusTiles
		const maxDistance = radiusTiles ? radiusTiles * tileSize : null
		const availableNodes = managers.resourceNodes.getAvailableNodes(building.mapId, harvestDefinition.nodeType)

		let node: ResourceNodeInstance | undefined
		let siteClearing = harvestDefinition.nodeType === 'tree'
			? managers.buildings.getSiteClearingAssignmentForSettler(settler.id)
			: null
		if (siteClearing) {
			const siteBuilding = managers.buildings.getBuildingInstance(siteClearing.buildingInstanceId)
			if (!siteBuilding || siteBuilding.mapId !== building.mapId || siteBuilding.playerId !== building.playerId) {
				managers.buildings.clearSiteClearingWorkerForSettler(settler.id)
				siteClearing = null
			} else {
				const availableById = new Map<string, ResourceNodeInstance>()
				for (const candidate of availableNodes) {
					availableById.set(candidate.id, candidate)
				}
				const prioritizedNodes = siteClearing.nodeIds
					.map(nodeId => availableById.get(nodeId))
					.filter((candidate): candidate is ResourceNodeInstance => Boolean(candidate))

				if (prioritizedNodes.length > 0) {
					node = prioritizedNodes.reduce((best, candidate) => {
						const bestDistance = calculateDistance(siteBuilding.position, best.position)
						const candidateDistance = calculateDistance(siteBuilding.position, candidate.position)
						return candidateDistance < bestDistance ? candidate : best
					})
				} else if (siteClearing.nodeIds.length > 0) {
					return { type: WorkStepType.Wait, reason: WorkWaitReason.NoNodes }
				}
			}
		}

		const prioritizeSiteClearing = Boolean(siteClearing)
		if (!node) {
			node = managers.resourceNodes.findClosestAvailableNode(building.mapId, harvestDefinition.nodeType, workCenter)
		}
		if (!prioritizeSiteClearing && node && maxDistance !== null) {
			const distance = calculateDistance(workCenter, node.position)
			if (distance > maxDistance) {
				node = undefined
			}
		}
		if (!prioritizeSiteClearing && !node && maxDistance !== null) {
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

		if (typeof harvestDefinition.harvestTimeMs !== 'number') {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoWork }
		}
		const harvestTimeMs = harvestDefinition.harvestTimeMs

		return {
			type: WorkStepType.Harvest,
			buildingInstanceId: building.id,
			resourceNodeId: node.id,
			outputItemType: nodeDefinition.outputItemType,
			quantity: nodeDefinition.harvestQuantity,
			durationMs: harvestTimeMs,
			constructionSiteBuildingId: siteClearing?.buildingInstanceId
		}
	}
}
