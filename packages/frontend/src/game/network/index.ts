import { GameManager, EventManager } from '@rugged/game'
import { LocalManager } from "./LocalManager"
import { NetworkEventManager, NetworkManager } from "./NetworkManager"

const IS_REMOTE_GAME = false
const CONTENT_FOLDER = import.meta.env.VITE_GAME_CONTENT

const contentModules = import.meta.glob('../../../../../content/*/index.ts', { eager: true })
const content = contentModules[`../../../../../content/${CONTENT_FOLDER}/index.ts`]

function getNetworkManager(): NetworkEventManager {
    if (IS_REMOTE_GAME) {
        return new NetworkManager('https://hearty-rejoicing-production.up.railway.app')
    } else {
        const localManager = new LocalManager()
        const gameManager = new GameManager(localManager.server, content)
        return localManager.client
    }
}

const networkManager = getNetworkManager()
export default networkManager