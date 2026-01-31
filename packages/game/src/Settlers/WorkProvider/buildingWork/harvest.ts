import { BuildingWorkKind, getHarvestDefinition } from '../../../Buildings/work'
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

		const node = managers.resourceNodes.findClosestAvailableNode(building.mapName, harvestDefinition.nodeType, building.position)
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
