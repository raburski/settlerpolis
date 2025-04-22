import { DialogueTree } from '../types'
import { dialogue as oldInnkeeperDialogue } from './innkeeper'
import { guardDialogue } from './guard'

export const AllDialogues: DialogueTree[] = [
	oldInnkeeperDialogue,
	guardDialogue,
] 