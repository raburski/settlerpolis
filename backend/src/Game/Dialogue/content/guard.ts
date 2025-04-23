import { DialogueTree } from '../types'

export const guardDialogue: DialogueTree = {
	id: 'guard',
	npcId: 'guard',
	startNode: 'greeting',
	nodes: {
		greeting: {
			speaker: 'Guard',
			text: 'Move along, citizen. Nothing to see here.',
			options: [
				{
					id: 'ask_guarding',
					text: 'What are you guarding?',
					effects: [
						{
							npc: {
								id: 'guard',
								goTo: 'stand2'
							}
						}
					]
				}
			]
		}
	}
} 