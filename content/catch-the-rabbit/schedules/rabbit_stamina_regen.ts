import { ScheduleOptions, ScheduleType } from "@rugged/game"

const rabbitStaminaRegen: ScheduleOptions = {
  id: "regen_rabbit_stamina",
  schedule: {
    type: ScheduleType.Interval,
    value: 10000 // every 30 seconds real-time
  },
  conditions: [
    {
      npc: {
        id: "rabbit",
        attributes: {
          stamina: { max: 6 } // only regenerate if stamina < 5
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
        system: '🐰 gains some energy back!'
      }
    }
  ],
  isActive: true
}

export default rabbitStaminaRegen