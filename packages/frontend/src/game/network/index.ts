import { GameManager, EventManager } from '@rugged/game'
import { LocalManager } from "./LocalManager"
import { NetworkEventManager, NetworkManager } from "./NetworkManager"
import { FrontendMapUrlService } from '../services/MapUrlService'
// Initialize BuildingService to start listening to events
import '../services/BuildingService'
// Initialize PopulationService to start listening to events
import '../services/PopulationService'

const IS_REMOTE_GAME = false
const CONTENT_FOLDER = import.meta.env.VITE_GAME_CONTENT || 'debug'

// Load content using glob import
const contentModules = import.meta.glob('../../../../../content/*/index.ts', { eager: true })
const contentPath = `../../../../../content/${CONTENT_FOLDER}/index.ts`
const content = contentModules[contentPath]

// Debug: Log content loading
console.log('[Network] Loading content:', {
	contentFolder: CONTENT_FOLDER,
	contentPath,
	availableModules: Object.keys(contentModules),
	contentKeys: content ? Object.keys(content) : 'content is null/undefined',
	hasBuildings: content?.buildings ? `YES (${content.buildings.length})` : 'NO',
	hasFlags: content?.flags ? `YES (${content.flags?.length || 0})` : 'NO'
})

function getNetworkManager(): NetworkEventManager {
    if (IS_REMOTE_GAME) {
        return new NetworkManager('https://hearty-rejoicing-production.up.railway.app')
    } else {
        const localManager = new LocalManager()
        const mapUrlService = new FrontendMapUrlService()
        const gameManager = new GameManager(localManager.server, content, mapUrlService)
        return localManager.client
    }
}

const networkManager = getNetworkManager()
export default networkManager