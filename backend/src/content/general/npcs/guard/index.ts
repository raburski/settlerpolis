import sentiments from "./sentiments"
import routine from './routine'
import dialogues from './dialogues'

export default {
    id: 'guard',
    name: 'Guard',
    position: { x: 300, y: 400 },
    scene: 'FarmScene',
    speed: 160,
    messages: {
        default: "Move along, citizen. Nothing to see here.",
        conditions: [
            {
                check: () => {
                    const hour = new Date().getHours()
                    return hour >= 20 || hour < 6
                },
                message: "It's dangerous to wander around at night. Be careful!"
            }
        ]
    },
    routine,
    sentiments,
    dialogues,
}