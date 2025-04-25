import { DialogueTreePartial } from "../../../../../types"
import { freeDrinkDialogue } from "./freeDrink"
import { mozgotrzepQuestDialogue } from "./mozgotrzep"

const dialogueDefault: DialogueTreePartial = {
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
					id: "goodbye",
					text: "Nothing, just looking around.",
					next: "goodbye_response"
				},
				{
					id: "try_fx",
					text: "FX Testing",
					effect: {
						cutscene: { trigger: 'intro' }
					}
				},
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
		goodbye_response: {
			speaker: "Innkeeper",
			text: "Feel free to look around. Let me know if you need anything!"
		}
	},
	startNode: "start"
}

export default [
    dialogueDefault,
    freeDrinkDialogue,
    mozgotrzepQuestDialogue,
]