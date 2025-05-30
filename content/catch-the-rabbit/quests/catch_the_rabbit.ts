import { Quest } from "@rugged/game"

const catchTheRabbit: Quest = {
  id: "catch_the_rabbit",
  chapter: 1,
  title: "Catch the Rabbit",
  description: "Miss Hilda's rabbit has escaped! Catch it before it destroys her garden.",
  settings: {
    // repeatable: true,
    // scope: "global"
  },
  steps: [
    {
      id: "catch",
      label: "Catch the rabbit",
      npcId: "rabbit",
      condition: {
        inventory: {
          has: {
            itemType: 'rabbit',
          }
        }
      },
      effect: {
        chat: {
          system: "You caught the rabbit! 🐇 Miss Hilda will be pleased."
        },
        cutscene: {
          trigger: "cutscene:rabbit_caught"
        },
        flag: {
          set: "rabbit_caught",
          scope: "player"
        }
      }
    },
    {
      id: "return",
      label: "Return the rabbit to Miss Hilda",
      effect: {
        chat: { system: "You returned the rabbit to Miss Hilda!" },
        inventory: {
          remove: {
            itemType: "rabbit"
          }
        }
      }
    }
  ],
  reward: {
    items: [
      {
        id: "carrot_cake",
        qty: 1
      }
    ]
  }
}

export default catchTheRabbit