import { DialogueTree } from '../types'

export const dialogue: DialogueTree = {
	id: "hasha_home_restored",
	npcId: 'hasha',
	nodes: {
		start: {
			speaker: "Hasha",
			text: "You fixed it! That was... oddly satisfying.",
			next: "node_2"
		},
		node_2: {
			speaker: "Hasha",
			text: "I rate that a 0xAAA++.",
			options: [
				{
					id: "thank",
					text: "Thank you!",
					next: "end"
				}
			]
		},
		end: {
			speaker: "Hasha",
			text: "Keep up the good work!"
		}
	},
	startNode: "start"
} 