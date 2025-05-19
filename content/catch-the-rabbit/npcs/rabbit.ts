import { NPCContent } from "@rugged/game"

const rabbit: NPCContent = {
  id: "rabbit",
  name: "Rabbit",
  active: false,
  position: { x: 0, y: 0 }, // starting near Miss Hilda
  mapId: "map1",
  initialSpot: 'spot0',
  speed: 222, // slightly faster than average player
  attributes: {
    stamina: 4,
  },
  messages: {
    default: "*The rabbit twitches its ears.*",
  },
  dialogues: [] // optional: could be used post-capture for humor
}

export default rabbit
