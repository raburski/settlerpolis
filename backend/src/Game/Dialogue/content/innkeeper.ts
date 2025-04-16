import { Event } from "../../../events"
import { FlagScope } from "../../Flags/types"
import { DialogueTree, DialogueTreePartial } from '../types'
import { dialogueCompose } from '../utils'
import { AffinitySentimentType } from '../../Affinity/types'
import { FXType } from '../../FX/types'

const freeDrinkDialogue: DialogueTreePartial = {
	nodes: {
		start: {
			options: [
				{
					id: "ask_drink",
					text: "I could use a drink.",
					next: "drink_response",
					condition: {
						flag: { notExists: 'inkeeper.free_drink', scope: FlagScope.Player },
					}
				},
			]
		},
		drink_response: {
			speaker: "Innkeeper",
			text: "Here's our finest mozgotrzep! That'll be... oh wait, first one's on the house!",
			options: [
				{
					id: "accept_drink",
					text: "Thanks!",
					effect: { 
						flag: { set: 'inkeeper.free_drink', scope: FlagScope.Player },
						affinity: {
							sentimentType: AffinitySentimentType.Trust,
							add: 5
						}
					},
					item: {
						itemType: "mozgotrzep"
					},
				}
			]
		},
	}
}

const mozgotrzepQuestDialogue: DialogueTreePartial = {
	nodes: {
		start: {
			options: [
				{
					id: "ask_challenge",
					text: "I heard you have a special challenge for travelers?",
					next: "challenge_intro",
					condition: {
						quest: { canStart: 'collect_mozgotrzep' }
					}
				},
				{
					id: "ask_secret",
					text: "Do you have any secret recipes you'd be willing to share?",
					next: "secret_recipe",
					condition: {
						affinityOverall: {
							minScore: 50
						}
					}
				}
			]
		},
		challenge_intro: {
			speaker: "Innkeeper",
			text: "Ah, you're interested in my special challenge? Well, I've been looking for someone to prove their dedication to our local specialty - the Mózgotrzep.",
			options: [
				{
					id: "accept_challenge",
					text: "Tell me more about this challenge.",
					next: "challenge_explanation",
					effect: {
						affinity: {
							sentimentType: AffinitySentimentType.Curiosity,
							add: 300
						}
					}
				},
				{
					id: "decline_challenge",
					text: "Maybe another time.",
					next: "start"
				}
			]
		},
		challenge_explanation: {
			speaker: "Innkeeper",
			text: "It's simple really - collect 5 bottles of Mózgotrzep. Show me you appreciate our local brew, and I'll reward you with something special - a genuine Chainfolk Rug! These rugs are quite rare and valuable.",
			options: [
				{
					id: "start_quest",
					text: "I'll take on your challenge!",
					effect: {
						quest: { start: "collect_mozgotrzep" },
						affinity: {
							sentimentType: AffinitySentimentType.Devotion,
							add: 5
						}
					},
					next: "challenge_accepted"
				},
				{
					id: "decline_quest",
					text: "That's a bit too much Mózgotrzep for me.",
					next: "start"
				}
			]
		},
		challenge_accepted: {
			speaker: "Innkeeper",
			text: "Excellent! Come back when you've collected 5 bottles. And remember - quality testing is encouraged!",
			options: [
				{
					id: "back_to_start",
					text: "I'll get right on it.",
				}
			]
		},
		innkeeper_quest_complete: {
			speaker: "Innkeeper",
			text: "Ah, you've collected all 5 bottles of Mózgotrzep! That's quite impressive. As promised, here's your reward - a genuine Chainfolk Rug. These are quite rare, you know. Take good care of it!",
			options: [
				{
					id: "thank_innkeeper",
					text: "Thank you! I'll display it proudly.",
					effect: {
						affinity: {
							sentimentType: AffinitySentimentType.Trust,
							add: 10
						}
					},
					item: {
						itemType: "chainfolk_rug"
					}
				}
			]
		},
		secret_recipe: {
			speaker: "Innkeeper",
			text: "Well, since you've proven yourself to be a true friend of the inn... The secret to Mózgotrzep is a special blend of herbs from the northern mountains, mixed with just a touch of moonlight essence. But shhh, don't tell anyone!",
			options: [
				{
					id: "promise_secret",
					text: "Your secret is safe with me!",
					effect: {
						affinity: {
							sentimentType: AffinitySentimentType.Trust,
							add: 15
						}
					},
					next: "start"
				}
			]
		}
	}
}

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

export const dialogue = dialogueCompose(
	{ id: 'innkeeper_greeting', npcId: 'innkeeper' }, 
	dialogueDefault, 
	mozgotrzepQuestDialogue, 
	freeDrinkDialogue
)
