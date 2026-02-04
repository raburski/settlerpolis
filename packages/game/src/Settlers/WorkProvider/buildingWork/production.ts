import { BuildingWorkKind, getProductionRecipes } from '../../../Buildings/work'
import { WorkStepType, WorkWaitReason } from '../types'
import type { BuildingWorkHandler } from './types'

export const ProductionWorkHandler: BuildingWorkHandler = {
	kind: BuildingWorkKind.Production,
	canHandle: (definition) => getProductionRecipes(definition).length > 0,
	getNextStep: ({ building, definition, managers, logistics }) => {
		const recipes = getProductionRecipes(definition)
		if (recipes.length === 0) {
			return null
		}

		const plan = managers.buildings.getEffectiveProductionPlan(building.id) || {}
		const counts = managers.buildings.getProductionCounts(building.id)

		const candidates = recipes
			.map((recipe, index) => {
				const weight = plan[recipe.id] ?? 1
				const produced = counts[recipe.id] ?? 0
				const ratio = weight > 0 ? produced / weight : Number.POSITIVE_INFINITY
				return { recipe, weight, produced, ratio, index }
			})
			.filter(candidate => candidate.weight > 0)

		if (candidates.length === 0) {
			return null
		}

		candidates.sort((a, b) => {
			if (a.ratio !== b.ratio) {
				return a.ratio - b.ratio
			}
			if (a.weight !== b.weight) {
				return b.weight - a.weight
			}
			return a.index - b.index
		})

		const canProduceNow = (recipe: typeof recipes[number]): boolean => {
			for (const output of recipe.outputs) {
				if (!managers.storage.hasAvailableStorage(building.id, output.itemType, output.quantity)) {
					return false
				}
			}
			for (const input of recipe.inputs) {
				const current = managers.storage.getCurrentQuantity(building.id, input.itemType, 'incoming')
				if (current < input.quantity) {
					return false
				}
			}
			return true
		}

		for (const candidate of candidates) {
			if (!canProduceNow(candidate.recipe)) {
				continue
			}
			return {
				type: WorkStepType.Produce,
				buildingInstanceId: building.id,
				recipe: candidate.recipe,
				durationMs: (candidate.recipe.productionTime ?? 1) * 1000
			}
		}

		const target = candidates[0].recipe
		for (const output of target.outputs) {
			if (!managers.storage.hasAvailableStorage(building.id, output.itemType, output.quantity)) {
				logistics.requestOutput(building.id, output.itemType, output.quantity, 20)
				return { type: WorkStepType.Wait, reason: WorkWaitReason.OutputFull }
			}
		}

		for (const input of target.inputs) {
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
			recipe: target,
			durationMs: (target.productionTime ?? 1) * 1000
		}
	}
}
