import { FlagScope } from '../Flags/types'
import { AffinitySentimentType } from '../Affinity/types'
import { FXType } from '../FX/types'
import { Condition, Effect } from '../ConditionEffect/types'

export interface DialogueNode {
	speaker?: string
	text?: string
	options?: DialogueOption[]
	next?: string
	event?: DialogueEvent
	item?: DialogueItem
}

export interface DialogueOption {
	id: string
	text: string
	next?: string
	condition?: Condition
	conditions?: Condition[]
	effect?: Effect
	effects?: Effect[]
	item?: DialogueItem
}

export interface DialogueEvent {
	type: string
	payload: Record<string, any>
}

export interface DialogueItem {
	id?: string
	itemType: string
}

export interface DialogueTreePartial {
	id?: string
	npcId?: string
	nodes: Record<string, DialogueNode>
	startNode?: string
}

export interface DialogueTree extends DialogueTreePartial {
	id: string
	startNode?: string
	npcId: string
}

export interface DialogueTriggerData {
	dialogueId: string
	node: DialogueNode
	npcId: string
}

export interface DialogueContinueData {
	dialogueId: string
}

export interface DialogueChoiceData {
	dialogueId: string
	choiceId: string
}

export interface DialogueState {
	currentNodeId: string | null
	dialogueTreeId: string | null
}
