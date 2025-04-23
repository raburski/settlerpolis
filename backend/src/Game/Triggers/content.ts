import { Trigger, TriggerOption } from './types'
import { AffinitySentimentType } from '../Affinity/types'

export const triggers: Trigger[] = [
	{
		id: 'first_trigger',
		option: TriggerOption.Always,
		effect: {
            chat: {
                message: "You found a hidden trigger! This message will only show once."
            }
        }
	},
	{
		id: 'guard_proximity',
		option: TriggerOption.Always,
		condition: {
            npc: {
                id: 'guard',
                proximity: 150,
                affinity: {
                    sentimentType: AffinitySentimentType.Trust,
                    max: 50
                }
            },
		},
		effect: {
            npc: {
                id: 'guard',
                message: "*The guard eyes you suspiciously as you approach.*",
                affinity: {
                    sentimentType: AffinitySentimentType.Trust,
                    add: 1
                }
            }
        },
	},
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