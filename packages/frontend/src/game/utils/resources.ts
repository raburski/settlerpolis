import { BuildingDefinition } from '@rugged/game'

const addItemType = (items: Set<string>, itemType?: string) => {
	if (!itemType || itemType === '*') {
		return
	}
	items.add(itemType)
}

export const buildResourceList = (definitions: BuildingDefinition[]): string[] => {
	const items = new Set<string>()

	definitions.forEach((definition) => {
		definition.costs?.forEach((cost) => addItemType(items, cost.itemType))

		if (definition.storageSlots) {
			definition.storageSlots.forEach((slot) => addItemType(items, slot.itemType))
		}

		definition.productionRecipes?.forEach((recipe) => {
			recipe.inputs?.forEach((input) => addItemType(items, input.itemType))
			recipe.outputs?.forEach((output) => addItemType(items, output.itemType))
		})
		definition.productionRecipe?.inputs?.forEach((input) => addItemType(items, input.itemType))
		definition.productionRecipe?.outputs?.forEach((output) => addItemType(items, output.itemType))
		definition.autoProduction?.inputs?.forEach((input) => addItemType(items, input.itemType))
		definition.autoProduction?.outputs?.forEach((output) => addItemType(items, output.itemType))
		definition.consumes?.forEach((consume) => addItemType(items, consume.itemType))
	})

	return Array.from(items).sort()
}
