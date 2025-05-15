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
          text: "Oh, it's you again. Have you seen my rabbit?",
          options: [
            {
              id: "start_quest",
              text: "I'll catch it for you, don't worry!",
              next: "thankyou",
              condition: {
                quest: { canStart: "catch_the_rabbit" }
              },
              effect: {
                quest: { start: "catch_the_rabbit" }
              }
            },
            {
              id: "reminder",
              text: "Still chasing the rabbit...",
              next: "already_helping",
              condition: {
                quest: { inProgress: "catch_the_rabbit"}
              }
            },
            {
              id: "completed",
              text: "I caught the rabbit, by the way.",
              next: "gratitude",
              condition: {
                quest: { completed: "catch_the_rabbit" }
              }
            }
          ]
        },
        thankyou: {
          speaker: "Miss Hilda",
          text: "Finally, someone responsible! Be quick, it’s already chewed through my herbs."
        },
        already_helping: {
          speaker: "Miss Hilda",
          text: "What are you waiting for? That rabbit won't catch itself!"
        },
        gratitude: {
          speaker: "Miss Hilda",
          text: "You caught him? You’re a miracle, dear. He’s grounded for a week."
        },
        default_idle: {
          speaker: "Miss Hilda",
          text: "The weather’s fine, but I feel trouble in the air..."
        }
      }
    }
  ]
}

export default missHilda