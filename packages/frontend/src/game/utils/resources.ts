import { BuildingDefinition } from '@rugged/game'

const addItemType = (items: Set<string>, itemType?: string) => {
	if (!itemType) {
		return
	}
	items.add(itemType)
}

export const buildResourceList = (definitions: BuildingDefinition[]): string[] => {
	const items = new Set<string>()

	definitions.forEach((definition) => {
		definition.costs?.forEach((cost) => addItemType(items, cost.itemType))

		if (definition.storage?.capacities) {
			Object.keys(definition.storage.capacities).forEach((itemType) => addItemType(items, itemType))
		}

		definition.productionRecipe?.inputs?.forEach((input) => addItemType(items, input.itemType))
		definition.productionRecipe?.outputs?.forEach((output) => addItemType(items, output.itemType))
	})

	return Array.from(items).sort()
}
