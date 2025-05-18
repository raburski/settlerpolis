import { ItemMetadata, ItemCategory } from "@rugged/game";

const carrot: ItemMetadata = {
	id: "carrot",
	name: "Carrot",
	emoji: "🥕",
	description: "A fresh carrot. Perfect for rabbits!",
	category: ItemCategory.Consumable,
	stackable: true,
	maxStackSize: 16
}

export default carrot; 