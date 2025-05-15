import { NPCContent } from "@rugged/game"

const rabbit: NPCContent = {
  id: "rabbit",
  name: "Rabbit",
  position: { x: 0, y: 0 }, // starting near Miss Hilda
  mapId: "map1",
  initialSpot: 'spot0',
  speed: 222, // slightly faster than average player
//   routine: {
    // steps: [
    //   { time: "06:00", spot: "bushes" },
    //   { time: "07:00", spot: "flowers" },
    //   { time: "08:00", spot: "hilda_gate" }
    // ]
//   },
  messages: {
    default: "*The rabbit twitches its ears.*",
  },
  dialogues: [] // optional: could be used post-capture for humor
}

export default rabbit