import { BuildingWorkKind } from '../../../Buildings/work'
import { WorkStepType, WorkWaitReason } from '../types'
import type { BuildingWorkHandler } from './types'

const getAllowedMarketItemTypes = (definition: { storageSlots?: Array<{ itemType: string }>, marketDistribution?: { itemTypes?: string[] } }): string[] => {
	if (definition.marketDistribution?.itemTypes && definition.marketDistribution.itemTypes.length > 0) {
		return definition.marketDistribution.itemTypes
	}

	const fromSlots = (definition.storageSlots || []).map(slot => slot.itemType)
	return Array.from(new Set(fromSlots))
}

export const MarketWorkHandler: BuildingWorkHandler = {
	kind: BuildingWorkKind.Market,
	canHandle: (definition) => Boolean(definition.marketDistribution),
	getNextStep: ({ building, definition, settler, managers }) => {
		if (settler.stateContext.carryingItemType && settler.stateContext.carryingQuantity) {
			return { type: WorkStepType.MarketRun, buildingInstanceId: building.id }
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
