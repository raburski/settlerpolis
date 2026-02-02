import type { GameScene } from '../../scenes/base/GameScene'
import { PlayerView } from './View'

export class PlayerView2 extends PlayerView {
	constructor(scene: GameScene, x: number, y: number, entityId: string) {
		super(scene, x, y, entityId)
	}

	static preload(): void {
		// no-op
	}
}

export type PlayerViewType = PlayerView2
