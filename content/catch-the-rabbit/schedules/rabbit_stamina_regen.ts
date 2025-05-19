import { NPCState, ScheduleOptions, ScheduleType } from "@rugged/game"

const rabbitStaminaRegen: ScheduleOptions = {
  id: "regen_rabbit_stamina",
  schedule: {
    type: ScheduleType.Interval,
    value: 8000 // every 30 seconds real-time
  },
  conditions: [
    {
      npc: {
        id: "rabbit",
        state: NPCState.Idle,
        active: true,
        attributes: {
          stamina: { min: 1, max: 6 } // only regenerate if stamina < 5
        }
      }
    }
  ],
  effects: [
    {
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
    }
  ],
  isActive: true
}

export default rabbitStaminaRegen