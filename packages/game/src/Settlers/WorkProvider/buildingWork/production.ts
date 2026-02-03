import { BuildingWorkKind, getProductionRecipe } from '../../../Buildings/work'
import { WorkStepType, WorkWaitReason } from '../types'
import type { BuildingWorkHandler } from './types'

export const ProductionWorkHandler: BuildingWorkHandler = {
	kind: BuildingWorkKind.Production,
	canHandle: (definition) => Boolean(getProductionRecipe(definition)),
	getNextStep: ({ building, definition, managers, logistics }) => {
		const recipe = getProductionRecipe(definition)
		if (!recipe) {
			return null
		}

		for (const output of recipe.outputs) {
			if (!managers.storage.hasAvailableStorage(building.id, output.itemType, output.quantity)) {
				logistics.requestOutput(building.id, output.itemType, output.quantity, 20)
				return { type: WorkStepType.Wait, reason: WorkWaitReason.OutputFull }
			}
		}

		for (const input of recipe.inputs) {
			const current = managers.storage.getCurrentQuantity(building.id, input.itemType, 'incoming')
			if (current < input.quantity) {
				const maxStackSize = managers.items.getItemMetadata(input.itemType)?.maxStackSize ?? input.quantity
				const capacity = managers.storage.getStorageCapacity(building.id, input.itemType, 'incoming')
				const availableCapacity = Math.max(0, capacity - current)
				const bufferTarget = Math.min(availableCapacity, maxStackSize)
				const missing = input.quantity - current
				const requestQuantity = Math.max(missing, bufferTarget)
				logistics.requestInput(building.id, input.itemType, requestQuantity, 60)
				return { type: WorkStepType.Wait, reason: WorkWaitReason.MissingInputs }
			}
		}

		return {
			type: WorkStepType.Produce,
			buildingInstanceId: building.id,
			recipe,
			durationMs: (recipe.productionTime ?? 1) * 1000
		}
	}
}
