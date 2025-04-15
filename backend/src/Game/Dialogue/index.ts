import { EventManager, Event, EventClient } from '../../events'
import { Receiver } from '../../Receiver'
import { DialogueTree, DialogueNode, DialogueContinueData, DialogueChoiceData, DialogueEvent, DialogueItem, DialogueTreePartial } from './types'
import { DialogueEvents } from './events'
import { AllDialogues } from './content'
import { QuestManager } from "../Quest"
import { v4 as uuidv4 } from 'uuid'

export class DialogueManager {
	private dialogues = new Map<string, DialogueTree>()
	private activeDialogues = new Map<string, string>() // clientId -> dialogueId
	private currentNodes = new Map<string, string>() // clientId -> nodeId

	constructor(private event: EventManager, private questManager: QuestManager) {
		this.setupEventHandlers()
		this.loadDialogues()
	}

	private loadDialogues() {
		try {
			// Load dialogues from the content directory
			AllDialogues.forEach(dialogue => {
				this.registerDialogue(dialogue)
			})
		} catch (error) {
			console.error('Error loading dialogues:', error)
		}
	}

	private handleDialogueItem(item: DialogueItem, client: EventClient) {
		if (!item) return

		// Generate a unique ID for the item
		const itemId = uuidv4()

		// Create a proper Item object
		const newItem = {
			id: itemId,
			itemType: item.itemType
		}

		// Emit the event through the event manager to the server
		client.emit(Receiver.All, Event.Inventory.SS.Add, newItem)
	}

	private handleDialogueEvent(event: DialogueEvent, client: EventClient) {
		if (!event) return

		// Emit the event through the event manager
		client.emit(Receiver.All, event.type, event.payload)
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

	public triggerDialogue(client: EventClient, npcId: string): boolean {
		// First check if there's a quest-specific dialogue for this NPC
		const questDialogue = this.questManager.findDialogueFor(npcId, client.id)
		
		// Find dialogue for this NPC - either quest-specific or default
		const dialogue = questDialogue 
			? this.dialogues.get(questDialogue.dialogueId)
			: Array.from(this.dialogues.values()).find(d => d.npcId === npcId)
			
		if (!dialogue) return false

		// Use quest-specific node if available, otherwise use default start node
		const startNodeId = questDialogue?.nodeId || dialogue.startNode
		const startNode = dialogue.nodes[startNodeId]
		if (!startNode) return false

		// Start the dialogue
		this.activeDialogues.set(client.id, dialogue.id)
		this.currentNodes.set(client.id, startNodeId)
		client.emit(Receiver.Sender, DialogueEvents.SC.Trigger, {
			dialogueId: dialogue.id,
			node: startNode
		})

		return true
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