import { AffinitySentimentType, DialogueTreePartial } from "@rugged/game"

export const mozgotrzepQuestDialogue: DialogueTreePartial = {
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
						npc: {
							id: 'innkeeper',
							affinityOverall: {
								minScore: 50
							}
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
						npc: {
							id: 'innkeeper',
							affinity: {
								sentimentType: AffinitySentimentType.Curiosity,
								add: 300
							}
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
						npc: {
							id: 'innkeeper',
							affinity: {
								sentimentType: AffinitySentimentType.Devotion,
								add: 5
							}
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
						npc: {
							id: 'innkeeper',
							affinity: {
								sentimentType: AffinitySentimentType.Trust,
								add: 10
							}
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
						npc: {
							id: 'innkeper',
							affinity: {
								sentimentType: AffinitySentimentType.Trust,
								add: 15
							}
						}
					},
					next: "start"
				}
			]
		}
	}
}