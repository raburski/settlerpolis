import { Trigger, TriggerOption } from './types'
import { AffinitySentimentType } from '../Affinity/types'

export const triggers: Trigger[] = [
	{
		id: 'first_trigger',
		option: TriggerOption.OneTime,
		effects: [
			{
				chat: {
					message: "You found a hidden trigger! This message will only show once."
				}
			}
		]
	},
	{
		id: 'guard_proximity',
		npcProximity: {
			npcId: 'guard',
			proximityRadius: 150
		},
		option: TriggerOption.Always,
		condition: {
			affinity: {
				sentimentType: AffinitySentimentType.Trust,
				max: 50
			}
		},
		effects: [
			{
				npc: {
                    npcId: 'guard',
					message: "*The guard eyes you suspiciously as you approach.*"
				}
			},
			{
				affinity: {
					sentimentType: AffinitySentimentType.Trust,
					add: 1
				}
			}
		]
	},
	// {
	// 	id: 'random_encounter',
	// 	option: TriggerOption.Random,
	// 	effects: [
	// 		{
	// 			chat: {
	// 				message: "You feel like someone is watching you..."
	// 			}
	// 		}
	// 	]
	// },
	{
		id: 'always_show_tutorial',
		option: TriggerOption.Always,
		effects: [
			{
				chat: {
					message: "Welcome to the game! Use WASD to move around."
				}
			}
		]
	}
] 