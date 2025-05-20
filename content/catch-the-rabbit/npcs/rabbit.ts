import { NPCContent, ScheduleType, NPCState, TriggerOption } from "@rugged/game"

const rabbit: NPCContent = {
  id: "rabbit",
  name: "Rabbit",
  active: false,
  position: { x: 0, y: 0 }, // starting near Miss Hilda
  mapId: "map1",
  initialSpot: 'spot0',
  speed: 222, // slightly faster than average player
  attributes: {
    stamina: 4,
  },
  messages: {
    default: "*The rabbit twitches its ears.*",
  },
  dialogues: [], // optional: could be used post-capture for humor
  schedules: [
    {
      id: "regen_rabbit_stamina",
      schedule: {
        type: ScheduleType.Interval,
        value: 8000 // every 8 seconds
      },
      condition: {
        npc: {
          id: "rabbit",
          state: NPCState.Idle,
          active: true,
          attributes: {
            stamina: { min: 1, max: 4 } // only regenerate if stamina < 6
          }
        }
      },
      effect: {
        npc: {
          id: "rabbit",
          emoji: '❤️‍🩹',
          attributes: {
            stamina: {
              add: 1
            }
          }
        },
        chat: {
          system: '🐰 The rabbit gains some energy back!'
        }
      },
      isActive: true
    }
  ],
  triggers: [
    {
      id: "rabbit_catch",
      option: TriggerOption.Always,
      condition: {
        npc: {
          id: "rabbit",
          proximity: 100,
          attributes: { stamina: { equals: 0 } }
        }
      },
      effect: {
        npc: {
          id: "rabbit",
          active: false,
        },
        chat: {
          system: "🐇 The rabbit is exhausted! You cought the rabbit!"
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
    },
    {
      id: "rabbit_flee",
      option: TriggerOption.Always,
      conditions: [
        {
          npc: {
            id: "rabbit",
            proximity: 100,
            attributes: {
              stamina: {
                min: 1,
              }
            }
          }
        }
      ],
      effects: [
        {
          npc: {
            id: "rabbit",
            goTo: ["spot0", "spot1", "spot2", "spot2", "spot3", "spot4", "spot5", "spot6", "spot7", "spot8", "spot9"],
            emoji: "💨",
            attributes: {
              stamina: {
                subtract: 1
              }
            }
          },
          chat: {
            system: "🐇 The rabbit darts away in a panic!"
          }
        }
      ]
    }
  ]
}

export default rabbit
