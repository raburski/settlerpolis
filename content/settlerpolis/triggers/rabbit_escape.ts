import { Trigger, FlagScope, TriggerOption } from "@rugged/game"

const rabbitEscapeTrigger: Trigger = {
  id: "event:rabbit_escape",
  mapId: 'map1',
  option: TriggerOption.OneTime,
  condition: {
    flag: {
      notExists: 'rabbit_escape_triggered', scope: FlagScope.Global,
    }
  },
  effects: [
    {
      cutscene: {
        trigger: "cutscene:rabbit_escape"
      },
      npc: {
        id: 'miss_hilda',
        message: "Oh no! My rabbit! Someone stop him!"
      },
      flag: {
        set: "rabbit_escape_triggered",
        scope: FlagScope.Global
      }
    }, {
      npc: {
        id: 'rabbit',
        active: true,
      }
    }
  ]
}

export default rabbitEscapeTrigger