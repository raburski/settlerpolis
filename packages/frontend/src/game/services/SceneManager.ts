import { Scene, Scenes } from 'phaser'
import { Event } from '@rugged/game'
import { EventBus } from '../EventBus'
import { DynamicGameScene } from '../scenes/DynamicGameScene'

/**
 * SceneManager service for handling dynamic map loading and management
 */
export class SceneManager {
	private game: Phaser.Game | null = null
	private activeMap: string | null = null
	private mapInstances: Map<string, string> = new Map() // Maps mapId to scene key

	constructor() {
		this.setupEventHandlers()
	}

	/**
	 * Initialize the SceneManager with the game instance
	 */
	public init(game: Phaser.Game): void {
		this.game = game
	}

	/**
	 * Set up event handlers for map loading
	 */
	private setupEventHandlers(): void {
		// Listen for map load events from the server
		EventBus.on(Event.Map.SC.Load, this.handleMapLoad)
	}

	/**
	 * Handle Map.SC.Load events
	 */
	private handleMapLoad = (data: { mapId: string, mapUrl: string, position?: { x: number, y: number } }): void => {
		console.log('[SceneManager] Map load event received:', data)
		
		if (!this.game) {
			console.error('[SceneManager] Game instance not initialized')
			return
		}

		const { mapId, mapUrl, position } = data
		
		// Check if we already have a scene for this map
		if (this.mapInstances.has(mapId)) {
			console.log(`[SceneManager] Scene for map ${mapId} already exists, transitioning to it`)
			this.transitionToMap(mapId, position)
			return
		}
		
		// Create a new scene dynamically
		try {
			// Register the scene with Phaser
			const dynamicScene = new DynamicGameScene({
				key: mapId,
				mapId,
				mapUrl
			})
			
			this.game.scene.add(mapId, dynamicScene, false)
			this.mapInstances.set(mapId, mapId)
			
			console.log(`[SceneManager] Created new scene for map ${mapId}`)
			
			// Start the scene
			this.transitionToMap(mapId, position)
		} catch (error) {
			console.error(`[SceneManager] Error creating scene for map ${mapId}:`, error)
		}
	}

	/**
	 * Transition to a map with optional position
	 */
	private transitionToMap(mapId: string, position?: { x: number, y: number }): void {
		if (!this.game) return

		const sceneManager = this.game.scene
		
		// If we have an active map, stop it first
		if (this.activeMap && this.activeMap !== mapId) {
			sceneManager.stop(this.activeMap)
		}
		
		// Start the new scene
		sceneManager.start(mapId, {
			x: position?.x || 100,
			y: position?.y || 400,
			isTransition: !!this.activeMap
		})
		
		this.activeMap = mapId
	}

	/**
	 * Clean up event listeners
	 */
	public destroy(): void {
		EventBus.off(Event.Map.SC.Load, this.handleMapLoad)
	}

	/**
	 * Get scene key for target map name (for portal transitions)
	 * This helps translate old portal target names to new map IDs
	 */
	public getSceneKeyForTarget(targetName: string): string | undefined {
		// If it's already a map ID format, use it directly
		if (targetName.startsWith('test')) {
			return targetName
		}
		
		// Otherwise, translate from old scene names to map IDs
		const nameToMapId: Record<string, string> = {
			'FarmScene': 'test1',
			'FountainScene': 'test2',
			'TempleScene': 'test3'
		}
		
		return nameToMapId[targetName]
	}
}

// Create and export a singleton instance
export const sceneManager = new SceneManager() 