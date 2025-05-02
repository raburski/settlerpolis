import { Trigger } from "@my/engine"

const rabbitFlee: Trigger = {
  id: "rabbit_flee",
  option: "oneTime",
  conditions: [
    {
      flag: {
        exists: "rabbit_escape_triggered",
        scope: "global"
      }
    },
    {
      npc: {
        id: "rabbit",
        proximity: 3
      }
    }
  ],
  effects: [
    {
      npc: {
        id: "rabbit",
        goTo: "spot2"
      }
    },
    {
      chat: {
        system: "🐇 The rabbit darts toward the old well!"
      }
    },
    {
      flag: {
        set: "rabbit_fled_to_well",
        scope: "player"
      }
    }
  ]
}

export default rabbitFlee