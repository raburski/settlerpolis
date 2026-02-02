import { EventBus } from '../EventBus'
import { FXType, Event } from '@rugged/game'
import type { GameScene } from '../scenes/base/GameScene'

export class FX {
	constructor(private scene: GameScene) {
		EventBus.on(Event.FX.SC.Play, this.handleFXPlay, this)
	}

	private handleFXPlay = (data: { type: FXType; payload?: Record<string, any> }) => {
		switch (data.type) {
			case FXType.FadeToBlack:
				this.fadeToBlack(data.payload?.duration)
				break
			case FXType.FadeFromBlack:
				this.fadeFromBlack(data.payload?.duration)
				break
			case FXType.MoveCameraTo:
				this.moveCameraTo(data.payload?.x, data.payload?.y, data.payload?.duration)
				break
			case FXType.ShakeScreen:
				this.shakeScreen(data.payload?.duration, data.payload?.intensity)
				break
			case FXType.FocusOnNPC:
				break
		}
	}

	private fadeToBlack(duration: number = 1000) {
		this.scene.cameras.main.fade(duration)
	}

	private fadeFromBlack(duration: number = 1000) {
		this.scene.cameras.main.fadeIn(duration)
	}

	private moveCameraTo(x?: number, y?: number, duration: number = 1000) {
		if (x === undefined || y === undefined) return
		this.scene.cameras.main.pan(x, y, duration)
	}

	private shakeScreen(duration: number = 500, intensity: number = 0.01) {
		this.scene.cameras.main.shake(duration, intensity)
	}

	public destroy(): void {
		EventBus.off(Event.FX.SC.Play, this.handleFXPlay, this)
	}
}
