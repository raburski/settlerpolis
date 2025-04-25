import { Scene, Cameras } from 'phaser'
import { EventBus } from '../EventBus'
import { FXType } from '@rugged/game'
import { Event } from "@rugged/game"

export class FX {
	constructor(private scene: Scene) {
		EventBus.on(Event.FX.SC.Play, this.handleFXPlay, this)
	}

	private handleFXPlay = (data: { type: FXType, payload?: Record<string, any> }) => {
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
				this.focusOnNPC(data.payload?.npcId)
				break
		}
	}

	private fadeToBlack(duration: number = 1000) {
		this.scene.cameras.main.fade(duration, 0, 0, 0)
	}

	private fadeFromBlack(duration: number = 1000) {
		this.scene.cameras.main.fadeIn(duration)
	}

	private moveCameraTo(x: number, y: number, duration: number = 1000) {
		if (x === undefined || y === undefined) return
		this.scene.cameras.main.pan(x, y, duration, Cameras.Ease.Power2)
	}

	private shakeScreen(duration: number = 500, intensity: number = 0.01) {
		this.scene.cameras.main.shake(duration, intensity)
	}

	private focusOnNPC(npcId: string) {
		// This will be implemented when we have NPC positions available
		// For now it's a placeholder
		console.log('Focus on NPC:', npcId)
	}

	public destroy(): void {
		EventBus.off(FXEvents.SC.Play, this.handleFXPlay, this)
	}
} 