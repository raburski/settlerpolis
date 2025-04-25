import { DialogueTreePartial } from "../../../../types"

const dialogues: DialogueTreePartial[] = [{
	nodes: {
		start: {
			speaker: "Guard",
			text: "Halt! What business do you have in the city?",
			options: [
				{
					id: "explain_business",
					text: "I'm just a traveler looking for adventure.",
					next: "welcome_response"
				},
				{
					id: "ask_about_city",
					text: "What can you tell me about this city?",
					next: "city_info"
				}
			]
		},
		welcome_response: {
			speaker: "Guard",
			text: "Ah, another adventurer! Well, welcome to Rugtopolis. Just remember to follow the rules and you'll be fine.",
			options: [
				{
					id: "back_to_start",
					text: "I'll keep that in mind.",
					next: "start"
				}
			]
		},
		city_info: {
			speaker: "Guard",
			text: "Rugtopolis is known for its fine rugs and textiles. The inn is a good place to start if you're looking for work or information.",
			options: [
				{
					id: "back_to_start",
					text: "Thanks for the information.",
					next: "start"
				}
			]
		}
	},
}]

export default dialogues
