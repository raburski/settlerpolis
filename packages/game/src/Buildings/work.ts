import type { BuildingDefinition } from './types'

export enum BuildingWorkKind {
	Harvest = 'harvest',
	Production = 'production',
	Farm = 'farm'
}

export const getBuildingWorkKinds = (definition: BuildingDefinition): BuildingWorkKind[] => {
	const kinds: BuildingWorkKind[] = []
	if (definition.harvest) {
		kinds.push(BuildingWorkKind.Harvest)
	}
	if (definition.productionRecipe) {
		kinds.push(BuildingWorkKind.Production)
	}
	if (definition.farm) {
		kinds.push(BuildingWorkKind.Farm)
	}
	return kinds
}

export const getHarvestDefinition = (definition: BuildingDefinition): BuildingDefinition['harvest'] | undefined => {
	return definition.harvest
}

export const getProductionRecipe = (definition: BuildingDefinition): BuildingDefinition['productionRecipe'] | undefined => {
	return definition.productionRecipe
}

export const getFarmDefinition = (definition: BuildingDefinition): BuildingDefinition['farm'] | undefined => {
	return definition.farm
}
