import { EventManager, Event, EventClient } from '../../events'
import { Receiver } from '../../Receiver'
import { DialogueTree, DialogueNode, DialogueContinueData, DialogueChoiceData, DialogueEvent, DialogueItem } from './types'
import { DialogueEvents } from './events'
import { dialogues } from './dialogues'

export class DialogueManager {
	private dialogues = new Map<string, DialogueTree>()
	private activeDialogues = new Map<string, string>() // clientId -> dialogueId
	private currentNodes = new Map<string, string>() // clientId -> nodeId

	constructor(private event: EventManager) {
		this.setupEventHandlers()
		this.loadDialogues()
	}

	private loadDialogues() {
		try {
			// Load dialogues from the shared TypeScript file
			Object.values(dialogues).forEach(dialogue => {
				this.registerDialogue(dialogue)
			})
		} catch (error) {
			console.error('Error loading dialogues:', error)
		}
	}

	private handleDialogueItem(item: DialogueItem, client: EventClient) {
		if (!item) return

		// Infer event from item - for now, we assume items are always added to inventory
		const event = {
			type: Event.Inventory.SS.Add,
			payload: {
				itemType: item.itemType
			}
		}

		// Emit the event through the event manager to the server
		this.event.emit(Receiver.All, event.type, event.payload)
	}

	private handleDialogueEvent(event: DialogueEvent, client: EventClient) {
		if (!event) return

		// Emit the event through the event manager
		this.event.emit(Receiver.All, event.type, event.payload)
	}

	private setupEventHandlers() {
		// Handle dialogue continue
		this.event.on<DialogueContinueData>(DialogueEvents.CS.Continue, (data, client) => {
			const dialogueId = this.activeDialogues.get(client.id)
			if (!dialogueId || dialogueId !== data.dialogueId) return

			const dialogue = this.dialogues.get(dialogueId)
			if (!dialogue) return 

			const currentNode = this.getCurrentNode(client.id)
			if (!currentNode?.next) {
				this.endDialogue(client)
				return
			}

			const nextNode = dialogue.nodes[currentNode.next]
			if (!nextNode) {
				this.endDialogue(client)
				return
			}

			// Handle node item if present
			if (currentNode.item) {
				this.handleDialogueItem(currentNode.item, client)
			}
			// Handle node event if present (for backward compatibility)
			if (currentNode.event) {
				this.handleDialogueEvent(currentNode.event, client)
			}

			this.currentNodes.set(client.id, currentNode.next)
			client.emit(Receiver.Sender, DialogueEvents.SC.Trigger, {
				dialogueId,
				node: nextNode
			})
		})

		// Handle dialogue choice
		this.event.on<DialogueChoiceData>(DialogueEvents.CS.Choice, (data, client) => {
			const dialogueId = this.activeDialogues.get(client.id)
			if (!dialogueId || dialogueId !== data.dialogueId) return

			const currentNode = this.getCurrentNode(client.id)
			if (!currentNode?.options) return

			const selectedOption = currentNode.options.find(opt => opt.id === data.choiceId)
			if (!selectedOption?.next) {
				// Handle option item if present before ending dialogue
				if (selectedOption?.item) {
					this.handleDialogueItem(selectedOption.item, client)
				}
				// Handle option event if present (for backward compatibility)
				if (selectedOption?.event) {
					this.handleDialogueEvent(selectedOption.event, client)
				}
				this.endDialogue(client)
				return
			}

			const dialogue = this.dialogues.get(dialogueId)
			if (!dialogue) return

			const nextNode = dialogue.nodes[selectedOption.next]
			if (!nextNode) {
				this.endDialogue(client)
				return
			}

			// Handle option item if present
			if (selectedOption.item) {
				this.handleDialogueItem(selectedOption.item, client)
			}
			// Handle option event if present (for backward compatibility)
			if (selectedOption.event) {
				this.handleDialogueEvent(selectedOption.event, client)
			}

			this.currentNodes.set(client.id, selectedOption.next)
			client.emit(Receiver.Sender, DialogueEvents.SC.Trigger, {
				dialogueId,
				node: nextNode
			})
		})
	}

	public registerDialogue(dialogue: DialogueTree) {
		this.dialogues.set(dialogue.id, dialogue)
		console.log(`Registered dialogue: ${dialogue.id}`)
	}

	public triggerDialogue(client: EventClient, dialogueId: string) {
		const dialogue = this.dialogues.get(dialogueId)
		if (!dialogue) return

		const startNode = dialogue.nodes[dialogue.startNode]
		if (!startNode) return

		this.activeDialogues.set(client.id, dialogueId)
		this.currentNodes.set(client.id, dialogue.startNode)
		client.emit(Receiver.Sender, DialogueEvents.SC.Trigger, {
			dialogueId,
			node: startNode
		})
	}

	private getCurrentNode(clientId: string): DialogueNode | undefined {
		const dialogueId = this.activeDialogues.get(clientId)
		if (!dialogueId) return

		const dialogue = this.dialogues.get(dialogueId)
		if (!dialogue) return

		const currentNodeId = this.currentNodes.get(clientId)
		if (!currentNodeId) return dialogue.nodes[dialogue.startNode]

		return dialogue.nodes[currentNodeId]
	}

	private endDialogue(client: EventClient) {
		const dialogueId = this.activeDialogues.get(client.id)
		if (!dialogueId) return

		this.activeDialogues.delete(client.id)
		this.currentNodes.delete(client.id)
		client.emit(Receiver.Sender, DialogueEvents.SC.End, { dialogueId })
	}
} 