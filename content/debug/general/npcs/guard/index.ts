import sentiments from "./sentiments"
import dialogues from './dialogues'

export default {
    id: 'guard',
    name: 'City Guard',
    position: { x: 200, y: 300 },
    initialSpot: 'stand1',
    mapId: 'test1',
    speed: 80,
    messages: {
        default: "Move along, citizen. Keep the peace."
    },
    sentiments,
    dialogues,
}