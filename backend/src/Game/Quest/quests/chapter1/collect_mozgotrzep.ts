import { Event } from "../../../../events"
import { Quest, QuestScope } from '../../types'

export const CollectMozgotrzepQuest: Quest = {
	id: 'collect_mozgotrzep',
	chapter: 1,
	title: "The Innkeeper's Challenge",
	description: "Prove your dedication to the local specialty by collecting 5 bottles of Mózgotrzep for the innkeeper.",
	settings: {
		scope: QuestScope.Player,
		repeatable: false,
	},
	steps: [
		{
			id: 'collect_drinks',
			label: 'Collect 5 Mózgotrzep drinks',
			completeWhen: {
				event: Event.Inventory.SS.Add,
				inventory: {
					itemType: 'mozgotrzep',
					quantity: 5
				}
			},
			onComplete: {
				logMessage: "You've collected all 5 Mózgotrzep drinks! Return to the innkeeper to claim your reward."
			}
		},
		{
			id: 'claim_reward',
			label: 'Return to the innkeeper for your reward',
			npcId: 'innkeeper',
			dialogue: {
				id: 'innkeeper_greeting',
				nodeId: 'innkeeper_quest_complete'
			},
            completeWhen: {
                event: Event.Dialogue.CS.Choice,
                payload: {
                    dialogueId: 'innkeeper_greeting',
                    choiceId: 'thank_innkeeper',
                }
            }
		}
	],
	reward: {
		exp: 50,
		items: [
			{
				id: 'chainfolk_rug',
				qty: 1
			}
		]
	}
} 