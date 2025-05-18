import { Trigger, TriggerOption, NPCState } from "@rugged/game"

const rabbitCatch: Trigger = {
	id: "rabbit_catch",
	option: TriggerOption.Always,
	conditions: [
		{
			npc: {
				id: "rabbit",
				proximity: 100,
				attributes: {
					stamina: {
						equals: 0
					}
				}
			}
		}
	],
	effects: [
		{
			npc: {
				id: "rabbit",
				emoji: "😴",
                active: false,
			},
			chat: {
				system: "🐇 The rabbit is exhausted and can't run anymore!"
			},
			quest: {
				completeStep: {
					questId: "catch_the_rabbit",
					stepId: "catch"
				}
			},
            inventory: {
				add: {
					itemType: "rabbit",
					quantity: 1
				}
			}
            
		}
	]
}

export default rabbitCatch 