import { ItemMetadata, ItemCategory } from "@rugged/game"
import { ItemType } from "./types"

const carrot: ItemMetadata = {
	id: ItemType.Carrot,
	name: "Carrot",
	emoji: "🥕",
	description: "A fresh carrot. Perfect for rabbits!",
	category: ItemCategory.Consumable,
	stackable: true,
	maxStackSize: 16
}

export default carrot 