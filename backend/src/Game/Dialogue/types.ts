export interface DialogueNode {
	speaker: string
	text: string
	options?: DialogueOption[]
	next?: string
	event?: DialogueEvent
}

export interface DialogueOption {
	id: string
	text: string
	next: string
	event?: DialogueEvent
}

export interface DialogueEvent {
	type: string
	payload: Record<string, any>
}

export interface DialogueTree {
	id: string
	nodes: Record<string, DialogueNode>
	startNode: string
}

export interface DialogueTriggerData {
	dialogueId: string
	node: DialogueNode
}

export interface DialogueContinueData {
	dialogueId: string
}

export interface DialogueChoiceData {
	dialogueId: string
	choiceId: string
} 