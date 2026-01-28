import { GameManager } from '../../src/index'
import { GameContent } from '../../src/types'
import { MapUrlService } from '../../src/Map/types'
import { MockEventManager } from './MockEventManager'
import { GameTestHelper } from './GameTestHelper'

export function createTestGame(content?: Partial<GameContent>): {
	game: GameManager
	eventManager: MockEventManager
	helper: GameTestHelper
} {
	const eventManager = new MockEventManager()
	
	const defaultContent: GameContent = {
		items: [],
		quests: [],
		npcs: [],
		cutscenes: [],
		flags: [],
		schedules: [],
		triggers: [],
		maps: {},
		...content
	}

	const mockMapUrlService: MapUrlService = {
		getMapUrl: (mapId: string) => {
			return `/maps/${mapId}.json`
		}
	}

	const game = new GameManager(eventManager, defaultContent, mockMapUrlService)
	const helper = new GameTestHelper(game, eventManager)

	return { game, eventManager, helper }
}

