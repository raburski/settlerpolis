import { EventManager, Event, EventClient } from '../../events'
import { Receiver } from '../../Receiver'
import { DialogueTree, DialogueNode, DialogueContinueData, DialogueChoiceData, DialogueEvent, DialogueItem, DialogueTreePartial, DialogueCondition, FlagCondition, DialogueEffect, FlagEffect, QuestEffect, DialogueOption, QuestCondition, AffinityCondition, AffinityEffect, AffinityOverallCondition } from './types'
import { DialogueEvents } from './events'
import { AllDialogues } from './content'
import { QuestManager } from "../Quest"
import { FlagsManager } from "../Flags"
import { AffinityManager } from "../Affinity"
import { v4 as uuidv4 } from 'uuid'

export class DialogueManager {
	private dialogues = new Map<string, DialogueTree>()
	private activeDialogues = new Map<string, string>() // clientId -> dialogueId
	private currentNodes = new Map<string, string>() // clientId -> nodeId

	constructor(
		private event: EventManager, 
		private questManager: QuestManager,
		private flagsManager: FlagsManager,
		private affinityManager: AffinityManager
	) {
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

	/**
	 * Apply a flag effect
	 */
	private applyFlagEffect(effect: FlagEffect, client: EventClient) {
		const { set, unset, scope, playerId, mapId } = effect
		
		// If playerId is not provided, use the client's ID
		const targetPlayerId = playerId || client.id
		
		// Warning if scope is undefined
		if (scope === undefined) {
			console.warn('Flag effect scope is undefined. This may cause unexpected behavior.', set || unset)
		}
		
		if (set) {
			this.flagsManager.setFlag(client, {
				name: set,
				value: true,
				scope,
				playerId: targetPlayerId,
				mapId
			})
		}
		
		if (unset) {
			this.flagsManager.unsetFlag(client, {
				name: unset,
				scope,
				playerId: targetPlayerId,
				mapId
			})
		}
	}

	/**
	 * Apply a quest effect
	 */
	private applyQuestEffect(effect: QuestEffect, client: EventClient) {
		const { start } = effect
		
		if (start) {
			// Use the QuestManager's startQuest method
			this.questManager.startQuest(start, client.id, client)
		}
	}

	/**
	 * Apply an affinity effect
	 */
	private applyAffinityEffect(effect: AffinityEffect, client: EventClient) {
		const { npcId, sentimentType, set, add } = effect
		
		if (set !== undefined) {
			this.affinityManager.setAffinityValue(client.id, npcId, sentimentType, set, client)
		} else if (add !== undefined) {
			this.affinityManager.changeAffinityValue(client.id, npcId, sentimentType, add, client)
		}
	}

	/**
	 * Apply a dialogue effect
	 */
	private applyDialogueEffect(effect: DialogueEffect, client: EventClient) {
		if (!effect) return
		
		if (effect.flag) {
			this.applyFlagEffect(effect.flag, client)
		}

		if (effect.event) {
			this.handleDialogueEvent(effect.event, client)
		}

		if (effect.quest) {
			this.applyQuestEffect(effect.quest, client)
		}

		if (effect.affinity) {
			this.applyAffinityEffect(effect.affinity, client)
		}
	}

	/**
	 * Apply effects from a dialogue option
	 */
	private applyDialogueEffects(option: DialogueOption, client: EventClient) {
		if (!option) return
		
		// Apply single effect if present
		if (option.effect) {
			this.applyDialogueEffect(option.effect, client)
		}
		
		// Apply multiple effects if present
		if (option.effects && option.effects.length > 0) {
			option.effects.forEach(effect => {
				this.applyDialogueEffect(effect, client)
			})
		}
	}

	/**
	 * Check if a flag condition is met
	 */
	private checkFlagCondition(condition: FlagCondition, client: EventClient): boolean {
		const { exists, notExists, scope, playerId, mapId } = condition
		
		// If playerId is not provided, use the client's ID
		const targetPlayerId = playerId || client.id
		
		if (exists) {
			return this.flagsManager.hasFlag(exists, scope, targetPlayerId, mapId)
		}
		
		if (notExists) {
			return !this.flagsManager.hasFlag(notExists, scope, targetPlayerId, mapId)
		}
		
		return true
	}

	/**
	 * Check if a quest condition is met
	 */
	private checkQuestCondition(condition: QuestCondition, client: EventClient): boolean {
		// Check with the Quest module if the player can start the quest
		return this.questManager.canStartQuest(condition.canStart, client.id)
	}

	/**
	 * Check if an affinity condition is met
	 */
	private checkAffinityCondition(condition: AffinityCondition, client: EventClient): boolean {
		const { npcId, sentimentType, minValue, maxValue } = condition
		
		// Get the current affinity value
		const currentValue = this.affinityManager.getAffinityValue(client.id, npcId, sentimentType)
		
		// Check if the value is within the specified range
		if (minValue !== undefined && currentValue < minValue) {
			return false
		}
		
		if (maxValue !== undefined && currentValue > maxValue) {
			return false
		}
		
		return true
	}

	/**
	 * Check if an overall affinity condition is met
	 */
	private checkAffinityOverallCondition(condition: AffinityOverallCondition, client: EventClient): boolean {
		const { npcId, minScore, maxScore } = condition
		
		// Get the current overall affinity score
		const currentScore = this.affinityManager.calculateOverallScore(client.id, npcId)
		
		// Check if the score is within the specified range
		if (minScore !== undefined && currentScore < minScore) {
			return false
		}
		
		if (maxScore !== undefined && currentScore > maxScore) {
			return false
		}
		
		return true
	}

	/**
	 * Check if a dialogue condition is met
	 */
	private checkCondition(condition: DialogueCondition, client: EventClient): boolean {
		if (!condition) return true
		
		if (condition.flag) {
			return this.checkFlagCondition(condition.flag, client)
		}
		
		if (condition.quest) {
			return this.checkQuestCondition(condition.quest, client)
		}
		
		if (condition.affinity) {
			return this.checkAffinityCondition(condition.affinity, client)
		}
		
		if (condition.affinityOverall) {
			return this.checkAffinityOverallCondition(condition.affinityOverall, client)
		}
		
		return true
	}

	/**
	 * Filter dialogue options based on conditions
	 */
	private filterOptionsByConditions(node: DialogueNode, client: EventClient): DialogueNode {
		if (!node.options) return node
		
		const filteredOptions = node.options.filter(option => {
			// Check single condition if present
			if (option.condition && !this.checkCondition(option.condition, client)) {
				return false
			}
			
			// Check multiple conditions if present
			if (option.conditions) {
				return option.conditions.every(condition => this.checkCondition(condition, client))
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
			const filteredNode = this.filterOptionsByConditions(nextNode, client)
			
			client.emit(Receiver.Sender, DialogueEvents.SC.Trigger, {
				dialogueId,
				node: filteredNode
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
				// Apply effects if present
				if (selectedOption) {
					this.applyDialogueEffects(selectedOption, client)
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
			// Apply effects if present
			this.applyDialogueEffects(selectedOption, client)

			this.currentNodes.set(client.id, selectedOption.next)
			
			// Filter options based on conditions
			const filteredNode = this.filterOptionsByConditions(nextNode, client)
			
			client.emit(Receiver.Sender, DialogueEvents.SC.Trigger, {
				dialogueId,
				node: filteredNode
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

		// Filter options based on conditions
		const filteredNode = this.filterOptionsByConditions(startNode, client)

		// Send the dialogue to the client
		client.emit(Receiver.Sender, DialogueEvents.SC.Trigger, {
			dialogueId: dialogue.id,
			node: filteredNode
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