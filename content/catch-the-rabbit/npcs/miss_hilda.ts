import { NPCContent } from "@my/engine"

const missHilda: NPCContent = {
  id: "miss_hilda",
  name: "Miss Hilda",
  position: { x: 0, y: 0 },
  initialSpot: 'default',
  mapId: "map1",
  speed: 0,
  sentiments: {
    trust: 10,
    empathy: 5,
    curiosity: 0,
    devotion: 0
  },
  messages: {
    default: "That rabbit was just here a moment ago... something's not right.",
  },
  dialogues: [
    {
      id: "miss_hilda_intro",
      npcId: "miss_hilda",
      startNode: "start",
      nodes: {
        start: {
          speaker: "Miss Hilda",
          text: "Well look who finally got up! That rabbit has been hopping all over the yard since dawn!",
          options: [
            {
              id: "volunteer",
              text: "I'll catch it for you, don't worry!",
              next: "thankyou",
              conditions: [
                {
                  flag: {
                    exists: "rabbit_escape_triggered",
                    scope: "global"
                  }
                }
              ],
              effect: {
                quest: { start: "catch_the_rabbit" }
              }
            },
            {
              id: "nope",
              text: "Sorry, not my problem...",
              next: "grumble"
            }
          ]
        },
        thankyou: {
          speaker: "Miss Hilda",
          text: "Finally, someone responsible! Be quick, it’s already chewed through my herbs."
        },
        grumble: {
          speaker: "Miss Hilda",
          text: "Hmph. Kids these days..."
        }
      }
    }
  ]
}

export default missHilda