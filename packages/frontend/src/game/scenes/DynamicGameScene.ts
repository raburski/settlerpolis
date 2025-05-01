import { GameScene } from './base/GameScene'
import { sceneManager } from '../services/SceneManager'
import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'

interface DynamicGameSceneConfig {
	key: string
	mapId: string
	mapUrl: string
}

/**
 * A dynamic game scene that loads map data at runtime
 */
export class DynamicGameScene extends GameScene {
	private mapData: {
		mapId: string
		mapUrl: string
	}

	constructor(config: DynamicGameSceneConfig) {
		super({
			key: config.key,
			mapKey: config.mapId,
			mapPath: config.mapUrl
		})
		
		this.mapData = {
			mapId: config.mapId,
			mapUrl: config.mapUrl
		}
		
		console.log(`[DynamicGameScene] Created new scene for map ${config.mapId} at ${config.mapUrl}`)
	}
	
	/**
	 * Override the transitionToScene method to work with the new dynamic map system
	 */
	protected transitionToScene(targetMapId: string, targetX: number = 0, targetY: number = 0): void {
		// Prevent multiple transitions
		if (this.transitioning) return
		this.transitioning = true
		
		// Store the player's current position for the new scene
		const playerX = this.player.view.x
		const playerY = this.player.view.y

		console.log(`[DynamicGameScene] Transitioning to map: ${targetMapId}`)
		
		// Get actual map ID from the SceneManager (handles legacy scene names)
		const mapId = sceneManager.getSceneKeyForTarget(targetMapId)
		
		if (!mapId) {
			console.error(`[DynamicGameScene] Unable to find map ID for target: ${targetMapId}`)
			this.transitioning = false
			return
		}
		
		// Find out if the target map is already loaded
		const targetExists = this.scene.manager.getScene(mapId)
		
		if (!targetExists) {
			// We need to request the map data from the server
			EventBus.emit(Event.Map.CS.Transition, {
				toMapId: mapId,
				position: { x: targetX, y: targetY }
			})
			
			this.transitioning = false
			return
		}
		
		// Clean up resources before transitioning
		this.cleanupScene()
		
		// Create a fade out effect
		this.cameras.main.fade(500, 0, 0, 0)
		
		// Wait for the fade to complete before transitioning
		this.cameras.main.once('camerafadeoutcomplete', () => {
			// Start the new scene with the player's position and the current map ID
			this.scene.start(mapId, { 
				x: targetX, 
				y: targetY,
				playerX: playerX,
				playerY: playerY,
				isTransition: true,
				fromMapId: this.scene.key // Pass the current map ID
			})
		})
	}
} 