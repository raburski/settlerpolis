import { Trigger, TriggerOption, NPCState } from "@rugged/game"

const rabbitFlee: Trigger = {
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
        goTo: ["spot0", "spot1", "spot2", "spot2", "spot3", "spot4", "spot5", "spot6", "spot7"],
        emoji: "💨",
        attributes: {
          stamina: {
            subtract: 1
          }
        }
      }
    },
    {
      chat: {
        system: "🐇 The rabbit darts away in a panic!"
      }
    }
  ]
}

export default rabbitFlee