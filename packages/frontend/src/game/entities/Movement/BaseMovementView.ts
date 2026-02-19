import { Direction } from '@rugged/game'
import { MovementController, MovementControllerOptions } from './MovementController'
import { BaseEntityView } from '../BaseEntityView'
import type { GameScene } from '../../scenes/base/GameScene'
import type { AbstractMesh } from '@babylonjs/core'

export abstract class BaseMovementView extends BaseEntityView {
	protected movementController: MovementController

	constructor(scene: GameScene, mesh: AbstractMesh, size: { width: number; length: number; height: number }, x: number, y: number, speed: number) {
		super(scene, mesh, size, { x, y })

		const options: MovementControllerOptions = {
			speed,
			onDirectionChange: (direction) => this.onDirectionChange(direction),
			onStateChange: (state) => this.onStateChange(state),
			onMovementStart: () => this.onMovementStart(),
			onMovementComplete: () => this.onMovementComplete()
		}

		this.movementController = new MovementController(options)
	}

	public setTargetPosition(x: number, y: number): void {
		this.movementController.setTargetPosition(x, y, this.x, this.y)
	}

	public setSpeed(speed: number): void {
		this.movementController.setSpeed(speed)
	}

	public updatePosition(x: number, y: number): void {
		this.setPosition(x, y)
		this.movementController.cancelMovement()
	}

	public stopMovementInterpolation(): void {
		this.movementController.cancelMovement()
		this.updateVisuals(this.movementController.getDirection(), 'idle')
	}

	public smoothSyncPosition(x: number, y: number, durationMs: number = 120): void {
		this.movementController.nudgeToPosition(x, y, this.x, this.y, durationMs)
	}

	public preUpdate(): void {
		if (this.movementController.isMoving()) {
			const result = this.movementController.update(this.x, this.y)
			this.setPosition(result.x, result.y)
			this.updateVisuals(result.direction, result.state)
		}
	}

	protected abstract updateVisuals(direction: Direction, state: 'idle' | 'moving'): void

	protected onMovementStart(): void {}
	protected onMovementComplete(): void {}
	protected onDirectionChange(_direction: Direction): void {}
	protected onStateChange(_state: 'idle' | 'moving'): void {}
}
