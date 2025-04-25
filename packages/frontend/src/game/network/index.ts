import { GameManager, EventManager } from '@rugged/game'
import { LocalManager } from "./LocalManager"
import { NetworkEventManager, NetworkManager } from "./NetworkManager"
import * as content from '../../../../backend/src/content'

const IS_REMOTE_GAME = false

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