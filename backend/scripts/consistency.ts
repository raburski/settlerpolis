import { readdirSync } from 'fs'
import { join } from 'path'
import { QuestStep } from '../src/Game/Quest/types'
import { DialogueTree, DialogueNode } from '../src/Game/Dialogue/types'
import { AllQuests } from '../src/Game/Quest/quests'
import { AllDialogues } from '../src/Game/Dialogue/content'

interface DialogueContent {
	npcId: string
	nodes: Record<string, DialogueNode>
}

const checkConsistency = () => {
	try {
		// Load all dialogue content
		const dialogueContents = new Map<string, DialogueContent>()
		const dialogueTrees = new Map<string, DialogueTree>()
		
		for (const dialogue of AllDialogues) {
			if (dialogue.npcId) {
				dialogueContents.set(dialogue.npcId, {
					npcId: dialogue.npcId,
					nodes: dialogue.nodes
				})
			}
			dialogueTrees.set(dialogue.id, dialogue)
		}

		// Check all quests
		for (const quest of AllQuests) {
			const checkQuestStep = (step: QuestStep) => {
				if (step.npcId && step.dialogue?.id) {
					// First check if the dialogue tree exists
					const dialogueTree = dialogueTrees.get(step.dialogue.id)
					if (!dialogueTree) {
						console.error(`Error: Dialogue tree ${step.dialogue.id} referenced in quest ${quest.id} does not exist`)
						process.exit(1)
					}

					// Then check if the NPC has dialogue content
					const dialogueContent = dialogueContents.get(step.npcId)
					if (!dialogueContent) {
						console.error(`Error: NPC ${step.npcId} referenced in quest ${quest.id} has no dialogue content`)
						process.exit(1)
					}

					// If nodeId is specified, check if it exists in the dialogue content
					if (step.dialogue.nodeId) {
						const nodeExists = step.dialogue.nodeId in dialogueContent.nodes
						if (!nodeExists) {
							console.error(`Error: Node ${step.dialogue.nodeId} referenced in dialogue ${step.dialogue.id} for NPC ${step.npcId} in quest ${quest.id} does not exist in dialogue content`)
							process.exit(1)
						}
					}
				}

				// Check completeWhen conditions
				if (step.completeWhen?.payload) {
					const payload = step.completeWhen.payload
					// Check dialogue ID in completeWhen
					if (payload.dialogueId) {
						const dialogueTree = dialogueTrees.get(payload.dialogueId)
						if (!dialogueTree) {
							console.error(`Error: Dialogue tree ${payload.dialogueId} referenced in completeWhen for quest ${quest.id} does not exist`)
							process.exit(1)
						}
					}

					// Check choice ID in completeWhen
					if (payload.choiceId) {
						// We need to find the dialogue tree that contains this choice
						let choiceFound = false
						for (const dialogue of AllDialogues) {
							for (const node of Object.values(dialogue.nodes)) {
								if (node.options?.some(option => option.id === payload.choiceId)) {
									choiceFound = true
									break
								}
							}
							if (choiceFound) break
						}
						if (!choiceFound) {
							console.error(`Error: Choice ${payload.choiceId} referenced in completeWhen for quest ${quest.id} does not exist in any dialogue`)
							process.exit(1)
						}
					}
				}

				// Recursively check nested steps
				if ('steps' in step) {
					for (const nestedStep of (step as any).steps) {
						checkQuestStep(nestedStep)
					}
				}
			}

			// Check each step in the quest
			if ('steps' in quest) {
				for (const step of quest.steps) {
					checkQuestStep(step)
				}
			}
		}
		
		console.log('Consistency check passed!')
	} catch (error) {
		console.error('Consistency check failed:', error)
		process.exit(1)
	}
}

checkConsistency() 