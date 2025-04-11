import { DialogueTree } from '../types'
import { Event } from '../../../events'

export const dialogue: DialogueTree = {
	id: "innkeeper_greeting",
	nodes: {
		start: {
			speaker: "Innkeeper",
			text: "Welcome to my inn, traveler! How can I help you today?",
			options: [
				{
					id: "ask_room",
					text: "Do you have any rooms available?",
					next: "room_response"
				},
				{
					id: "ask_drink",
					text: "I could use a drink.",
					next: "drink_response"
				},
				{
					id: "goodbye",
					text: "Nothing, just looking around.",
					next: "goodbye_response"
				}
			]
		},
		room_response: {
			speaker: "Innkeeper",
			text: "We do have rooms available, but they are all currently under renovation. Check back later!",
			options: [
				{
					id: "back_to_greeting",
					text: "Let me ask you something else.",
					next: "start"
				}
			]
		},
		drink_response: {
			speaker: "Innkeeper",
			text: "Here's our finest mozgotrzep! That'll be... oh wait, first one's on the house!",
			options: [
				{
					id: "accept_drink",
					text: "Thanks!",
					next: "drink_accepted",
					event: {
						type: Event.Inventory.SS.Add,
						payload: {
							itemId: "mozgotrzep_drink",
							name: "Mozgotrzep",
							type: "consumable",
							description: "A strong local drink. Use with caution!"
						}
					}
				}
			]
		},
		drink_accepted: {
			speaker: "Innkeeper",
			text: "Enjoy! But be careful, it's quite strong!",
		},
		goodbye_response: {
			speaker: "Innkeeper",
			text: "Feel free to look around. Let me know if you need anything!"
		}
	},
	startNode: "start"
} 