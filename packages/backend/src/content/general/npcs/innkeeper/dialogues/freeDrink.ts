import { AffinitySentimentType, DialogueTreePartial, FlagScope } from "@rugged/game";

export const freeDrinkDialogue: DialogueTreePartial = {
	nodes: {
		start: {
			options: [
				{
					id: "ask_drink",
					text: "I could use a drink.",
					next: "drink_response",
					condition: {
						flag: { notExists: 'innkeeper.free_drink', scope: FlagScope.Player },
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
						flag: { set: 'innkeeper.free_drink', scope: FlagScope.Player },
						npc: {
							id: 'innkeeper',
							affinity: {
								sentimentType: AffinitySentimentType.Trust,
								add: 5
							}
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