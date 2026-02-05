import type { BuildingDefinition, ProductionRecipe } from './types'

export enum BuildingWorkKind {
	Harvest = 'harvest',
	Production = 'production',
	Farm = 'farm',
	Market = 'market',
	Fishing = 'fishing',
	Hunting = 'hunting'
}

export const getBuildingWorkKinds = (definition: BuildingDefinition): BuildingWorkKind[] => {
	const kinds: BuildingWorkKind[] = []
	if (definition.harvest) {
		kinds.push(BuildingWorkKind.Harvest)
	}
	if (definition.productionRecipe || (definition.productionRecipes && definition.productionRecipes.length > 0)) {
		kinds.push(BuildingWorkKind.Production)
	}
	if (definition.farm) {
		kinds.push(BuildingWorkKind.Farm)
	}
	if (definition.marketDistribution) {
		kinds.push(BuildingWorkKind.Market)
	}
	if (definition.fishing) {
		kinds.push(BuildingWorkKind.Fishing)
	}
	if (definition.hunting) {
		kinds.push(BuildingWorkKind.Hunting)
	}
	return kinds
}

export const getHarvestDefinition = (definition: BuildingDefinition): BuildingDefinition['harvest'] | undefined => {
	return definition.harvest
}

export const getProductionRecipe = (definition: BuildingDefinition): BuildingDefinition['productionRecipe'] | undefined => {
	return definition.productionRecipe ?? definition.productionRecipes?.[0]
}

export const getFarmDefinition = (definition: BuildingDefinition): BuildingDefinition['farm'] | undefined => {
	return definition.farm
}

export const getFishingDefinition = (definition: BuildingDefinition): BuildingDefinition['fishing'] | undefined => {
	return definition.fishing
}

export const getHuntingDefinition = (definition: BuildingDefinition): BuildingDefinition['hunting'] | undefined => {
	return definition.hunting
}

const buildRecipeId = (recipe: ProductionRecipe, index: number): string => {
	const outputs = recipe.outputs?.map(output => output.itemType).filter(Boolean).join('+')
	if (outputs && outputs.length > 0) {
		return outputs
	}
	return `recipe-${index}`
}

export const getProductionRecipes = (definition: BuildingDefinition): Array<ProductionRecipe & { id: string }> => {
	const recipes = definition.productionRecipes && definition.productionRecipes.length > 0
		? definition.productionRecipes
		: (definition.productionRecipe ? [definition.productionRecipe] : [])

	if (recipes.length === 0) {
		return []
	}

	const seen = new Set<string>()
	return recipes.map((recipe, index) => {
		let id = recipe.id ?? buildRecipeId(recipe, index)
		if (seen.has(id)) {
			id = `${id}-${index}`
		}
		seen.add(id)
		return { ...recipe, id }
	})
}
