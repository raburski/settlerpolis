import sentiments from "./sentiments"
import dialogues from './dialogues'

export default {
    id: 'innkeeper',
    name: 'Innkeeper',
    position: { x: 100, y: 400 },
    mapId: 'test1',
    speed: 120,
    messages: {
        default: "Welcome to the inn!"
    },
    sentiments,
    dialogues,
}