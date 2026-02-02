import { Event } from '@rugged/game'
import { EventBus } from '../EventBus'
import { DynamicGameScene } from '../scenes/DynamicGameScene'
import type { GameRuntime } from '../runtime/GameRuntime'

/**
 * SceneManager service for handling dynamic map loading and management
 */
export class SceneManager {
	private runtime: GameRuntime | null = null
	private activeMap: string | null = null
	private mapInstances: Map<string, DynamicGameScene> = new Map()

	constructor() {
		this.setupEventHandlers()
	}

	/**
	 * Initialize the SceneManager with the game instance
	 */
	public init(runtime: GameRuntime): void {
		if (this.runtime && this.runtime !== runtime) {
			this.mapInstances.forEach((scene) => scene.destroy())
			this.mapInstances.clear()
			this.activeMap = null
		}
		this.runtime = runtime
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
	private handleMapLoad = (data: { mapId: string, mapUrl: string, position?: { x: number, y: number }, suppressAutoJoin?: boolean }): void => {
		console.log('[SceneManager] Map load event received:', data)
		
		if (!this.runtime) {
			console.error('[SceneManager] Runtime not initialized')
			return
		}

		const { mapId, mapUrl, position, suppressAutoJoin } = data
		
		// Check if we already have a scene for this map
		const existingScene = this.mapInstances.get(mapId)
		if (existingScene) {
			console.log(`[SceneManager] Scene for map ${mapId} already exists, transitioning to it`)
			this.transitionToMap(existingScene, position, { suppressAutoJoin })
			return
		}
		
		try {
			const dynamicScene = new DynamicGameScene({
				mapId,
				mapUrl,
				runtime: this.runtime
			})
			
			this.mapInstances.set(mapId, dynamicScene)
			
			console.log(`[SceneManager] Created new scene for map ${mapId}`)
			
			this.transitionToMap(dynamicScene, position, { suppressAutoJoin })
		} catch (error) {
			console.error(`[SceneManager] Error creating scene for map ${mapId}:`, error)
		}
	}

	/**
	 * Transition to a map with optional position
	 */
	private transitionToMap(scene: DynamicGameScene, position?: { x: number, y: number }, options?: { suppressAutoJoin?: boolean }): void {
		if (!this.runtime) return

		const mapId = scene.getMapId()
		this.runtime.setScene(scene, {
			x: position?.x || 100,
			y: position?.y || 400,
			isTransition: Boolean(this.activeMap),
			suppressAutoJoin: options?.suppressAutoJoin
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
