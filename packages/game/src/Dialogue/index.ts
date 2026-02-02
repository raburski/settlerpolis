import { EventManager, Event, EventClient } from '../events'
import { Receiver } from '../Receiver'
import { DialogueNode, DialogueOption, DialogueTree, DialogueState, DialogueItem, DialogueEvent, DialogueContinueData, DialogueChoiceData } from './types'
import { DialogueEvents } from './events'
import type { QuestManager } from "../Quest"
import { v4 as uuidv4 } from 'uuid'
import { FXEvents } from "../FX/events"
import { CutsceneEvents } from "../Cutscene/events"
import type { ConditionEffectManager } from "../ConditionEffect"
import { Logger } from '../Logs'
import { BaseManager } from '../Managers'
import type { DialogueSnapshot } from '../state/types'

const DEFAULT_START_NODE = 'start'

export interface DialogueDeps {
	quest: QuestManager
	conditionEffect: ConditionEffectManager
}

export class DialogueManager extends BaseManager<DialogueDeps> {
	private dialogues = new Map<string, DialogueTree>()
	private activeDialogues = new Map<string, string>() // clientId -> dialogueId
	private currentNodes = new Map<string, string>() // clientId -> nodeId

	constructor(
		managers: DialogueDeps,
		private event: EventManager, 
		private logger: Logger
	) {
		super(managers)
		this.setupEventHandlers()
	}

	public loadDialogues(dialogues: DialogueTree[]) {
		try {
			dialogues.forEach(dialogue => {
				this.registerDialogue(dialogue)
			})
		} catch (error) {
			this.logger.error('Error loading dialogues:', error)
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

	/**
	 * Apply effects from a dialogue option
	 */
	private applyDialogueEffects(option: DialogueOption, client: EventClient, npcId: string) {
		if (!option) return
		
		// Apply single effect if present
		if (option.effect) {
			this.managers.conditionEffect.applyEffect(option.effect, client)
		}
		
		// Apply multiple effects if present
		if (option.effects && option.effects.length > 0) {
			this.managers.conditionEffect.applyEffects(option.effects, client)
		}
	}

	/**
	 * Filter dialogue options based on conditions
	 */
	private filterOptionsByConditions(node: DialogueNode, client: EventClient, npcId: string): DialogueNode {
		if (!node.options) return node
		
		const filteredOptions = node.options.filter(option => {
			// Check single condition if present
			if (option.condition && !this.managers.conditionEffect.checkCondition(option.condition, client)) {
				return false
			}
			
			// Check multiple conditions if present
			if (option.conditions) {
				return this.managers.conditionEffect.checkConditions(option.conditions, client)
			}
			
			return true
		})
		
		return {
			...node,
			options: filteredOptions
		}
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

			this.currentNodes.set(client.id, currentNode.next)
			
			// Filter options based on conditions
			const filteredNode = this.filterOptionsByConditions(nextNode, client, dialogue.npcId)
			
			client.emit(Receiver.Sender, DialogueEvents.SC.Trigger, {
				dialogueId,
				node: filteredNode,
				npcId: dialogue.npcId
			})
		})

		// Handle dialogue choice
		this.event.on<DialogueChoiceData>(DialogueEvents.CS.Choice, (data, client) => {
			const dialogueId = this.activeDialogues.get(client.id)
			if (!dialogueId || dialogueId !== data.dialogueId) return

			const dialogue = this.dialogues.get(dialogueId)
			if (!dialogue) return

			const currentNode = this.getCurrentNode(client.id)
			if (!currentNode?.options) return

			const selectedOption = currentNode.options.find(opt => opt.id === data.choiceId)
			if (!selectedOption?.next) {
				// Handle option item if present before ending dialogue
				if (selectedOption?.item) {
					this.handleDialogueItem(selectedOption.item, client)
				}
				// Apply effects if present
				if (selectedOption) {
					this.applyDialogueEffects(selectedOption, client, dialogue.npcId)
				}
				this.endDialogue(client)
				return
			}

			const nextNode = dialogue.nodes[selectedOption.next]
			if (!nextNode) {
				this.endDialogue(client)
				return
			}

			// Handle option item if present
			if (selectedOption.item) {
				this.handleDialogueItem(selectedOption.item, client)
			}
			// Apply effects if present
			this.applyDialogueEffects(selectedOption, client, dialogue.npcId)

			this.currentNodes.set(client.id, selectedOption.next)
			
			// Filter options based on conditions
			const filteredNode = this.filterOptionsByConditions(nextNode, client, dialogue.npcId)
			
			client.emit(Receiver.Sender, DialogueEvents.SC.Trigger, {
				dialogueId,
				node: filteredNode,
				npcId: dialogue.npcId
			})
		})

		// Handle dialogue end from client
		this.event.on<DialogueContinueData>(DialogueEvents.CS.End, (data, client) => {
			const dialogueId = this.activeDialogues.get(client.id)
			if (!dialogueId || dialogueId !== data.dialogueId) return

			this.endDialogue(client)
		})
	}

	public registerDialogue(dialogue: DialogueTree) {
		this.dialogues.set(dialogue.id, dialogue)
		this.logger.debug(`Registered dialogue: ${dialogue.id}`)
	}

	public triggerDialogue(client: EventClient, npcId: string): boolean {
		// First check if there's a quest-specific dialogue for this NPC
		const questDialogue = this.managers.quest.findDialogueFor(npcId, client.id)
		
		// Find dialogue for this NPC - either quest-specific or default
		const dialogue = questDialogue 
			? this.dialogues.get(questDialogue.dialogueId)
			: Array.from(this.dialogues.values()).find(d => d.npcId === npcId)
			
		if (!dialogue) return false

		// Use quest-specific node if available, otherwise use default start node
		const startNodeId = questDialogue?.nodeId || dialogue.startNode || DEFAULT_START_NODE
		const startNode = dialogue.nodes[startNodeId]
		if (!startNode) return false

		// Start the dialogue
		this.activeDialogues.set(client.id, dialogue.id)
		this.currentNodes.set(client.id, startNodeId)

		// Filter options based on conditions
		const filteredNode = this.filterOptionsByConditions(startNode, client, dialogue.npcId)
		
		// Send the dialogue to the client
		client.emit(Receiver.Sender, DialogueEvents.SC.Trigger, {
			dialogueId: dialogue.id,
			node: filteredNode,
			npcId: dialogue.npcId
		})

		return true
	}

	private getCurrentNode(clientId: string): DialogueNode | undefined {
		const dialogueId = this.activeDialogues.get(clientId)
		if (!dialogueId) return

		const dialogue = this.dialogues.get(dialogueId)
		if (!dialogue) return

		const nodeId = this.currentNodes.get(clientId)
		if (!nodeId) return

		return dialogue.nodes[nodeId]
	}

	private endDialogue(client: EventClient) {
		const dialogueId = this.activeDialogues.get(client.id)
		if (!dialogueId) return

		this.activeDialogues.delete(client.id)
		this.currentNodes.delete(client.id)

		client.emit(Receiver.Sender, DialogueEvents.SC.End, {
			dialogueId
		})
	}

	public getNPCActiveDialogues(npcId: string): string[] {
		return Array.from(this.dialogues.values())
			.filter(dialogue => dialogue.npcId === npcId)
			.map(dialogue => dialogue.id)
	}

	/**
	 * Check if a player has a specific dialogue active
	 * @param playerId The ID of the player to check
	 * @param dialogueId The ID of the dialogue to check for
	 * @param nodeId Optional node ID to check if the dialogue is at a specific node
	 * @returns true if the player has the specified dialogue active
	 */
	public hasActiveDialogue(playerId: string, dialogueId: string, nodeId?: string): boolean {
		// Check if player has any active dialogue
		const activeDialogueId = this.activeDialogues.get(playerId)
		if (!activeDialogueId || activeDialogueId !== dialogueId) {
			return false
		}

		// If no specific node is requested, just check if the dialogue is active
		if (!nodeId) {
			return true
		}

		// Check if the player is at the specified node
		const currentNodeId = this.currentNodes.get(playerId)
		return currentNodeId === nodeId
	}

	serialize(): DialogueSnapshot {
		return {
			activeDialogues: Array.from(this.activeDialogues.entries()),
			currentNodes: Array.from(this.currentNodes.entries())
		}
	}

	deserialize(state: DialogueSnapshot): void {
		this.activeDialogues.clear()
		this.currentNodes.clear()
		for (const [clientId, dialogueId] of state.activeDialogues) {
			this.activeDialogues.set(clientId, dialogueId)
		}
		for (const [clientId, nodeId] of state.currentNodes) {
			this.currentNodes.set(clientId, nodeId)
		}
	}

	reset(): void {
		this.activeDialogues.clear()
		this.currentNodes.clear()
	}
}
