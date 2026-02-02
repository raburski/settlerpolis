import { MultiplayerService } from './services/MultiplayerService'
import networkManager from './network'
import { GameRuntime } from './runtime/GameRuntime'
import { EventBus } from './EventBus'
import { Event } from '@rugged/game'
import { playerService } from './services/PlayerService'
import { sceneManager } from './services/SceneManager'

let multiplayerService = new MultiplayerService(networkManager)

const StartGame = (canvas: HTMLCanvasElement) => {
	const runtime = new GameRuntime(canvas)

	// Make multiplayerService available globally
	window.multiplayerService = multiplayerService

	// Initialize scene manager with runtime
	sceneManager.init(runtime)

	// Connect to the game server
	networkManager.connect(() => {
		EventBus.emit(Event.Players.CS.Connect)
	})

	EventBus.once(Event.Players.SC.Connected, (data: { playerId: string }) => {
		playerService.playerId = data.playerId
		console.log('[Runtime] Player connected with ID:', data.playerId)
	})

	runtime.start()

	return runtime
}

export default StartGame

// Add type declaration for the global multiplayerService
declare global {
	interface Window {
		multiplayerService: MultiplayerService
	}
}
