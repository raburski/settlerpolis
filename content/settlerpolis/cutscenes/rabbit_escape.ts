import { Cutscene } from "@rugged/game"

const rabbitEscapeCutscene: Cutscene = {
  id: "cutscene:rabbit_escape",
  skippable: true,
  steps: [
    // {
    //   event: "sc:chat:fullscreen",
    //   payload: {
    //     message: "🐇 The rabbit darts out from the bushes..."
    //   },
    //   duration: 2000
    // },
    {
      event: "sc:chat:system",
      payload: {
        message: "🐇 The rabbit darts out from the bushes..."
      },
      duration: 1200
    },
    {
      event: "ss:npc:go",
      payload: {
        npcId: "rabbit",
        spotName: "spot6" // or wherever you define
      },
      duration: 1000
    },
  ]
}

export default rabbitEscapeCutscene