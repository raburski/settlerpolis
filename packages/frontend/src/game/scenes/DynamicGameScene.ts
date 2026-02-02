import { GameScene } from './base/GameScene'
import { sceneManager } from '../services/SceneManager'
import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import type { GameRuntime } from '../runtime/GameRuntime'

interface DynamicGameSceneConfig {
	mapId: string
	mapUrl: string
	runtime: GameRuntime
}

/**
 * A dynamic game scene that loads map data at runtime
 */
export class DynamicGameScene extends GameScene {
	private mapData: { mapId: string; mapUrl: string }

	constructor(config: DynamicGameSceneConfig) {
		super(config.runtime, { mapKey: config.mapId, mapPath: config.mapUrl })
		this.mapData = { mapId: config.mapId, mapUrl: config.mapUrl }
		console.log(`[DynamicGameScene] Created new scene for map ${config.mapId} at ${config.mapUrl}`)
	}

	getMapId(): string {
		return this.mapData.mapId
	}

	protected transitionToScene(targetMapId: string, targetX: number = 0, targetY: number = 0): void {
		if (this.transitioning) return
		this.transitioning = true

		const mapId = sceneManager.getSceneKeyForTarget(targetMapId)
		if (!mapId) {
			console.error(`[DynamicGameScene] Unable to find map ID for target: ${targetMapId}`)
			this.transitioning = false
			return
		}

		EventBus.emit(Event.Map.CS.Transition, {
			toMapId: mapId,
			position: { x: targetX, y: targetY }
		})
	}
}
