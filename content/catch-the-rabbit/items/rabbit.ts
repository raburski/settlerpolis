import { ItemMetadata, ItemCategory } from "@rugged/game"
import { ItemType } from "./types"

const rabbitItem: ItemMetadata = {
  id: ItemType.Rabbit,
  name: "Captured Rabbit",
  emoji: "🐇",
  description: "Miss Hilda's runaway troublemaker. Squirmy but safe.",
  category: ItemCategory.Quest,
  stackable: false
}

export default rabbitItem
