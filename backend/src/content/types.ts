import { AffinitySentiments } from "../Game/Affinity/types";
import { DialogueTreePartial, NPC } from "../types";

export interface NPCContent extends NPC {
    sentiments?: AffinitySentiments
    dialogues?: DialogueTreePartial[]
}