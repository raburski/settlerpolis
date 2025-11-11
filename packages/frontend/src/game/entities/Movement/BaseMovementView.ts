import { GameScene } from '../../scenes/base/GameScene'
import { Direction } from '@rugged/game'
import { MovementController, MovementControllerOptions } from './MovementController'
import { GameObjects } from 'phaser'

/**
 * Base class for entity views with movement capabilities.
 * Uses composition - has a MovementController instance.
 * Subclasses implement updateVisuals() and setupVisuals().
 */
export abstract class BaseMovementView extends GameObjects.Container {
	protected movementController: MovementController
	protected baseDepth: number = 100
	
	constructor(scene: GameScene, x: number, y: number, speed: number) {
		super(scene, x, y)
		scene.add.existing(this)
		
		// Create movement controller with callbacks
		const options: MovementControllerOptions = {
			speed,
			onDirectionChange: (direction) => {
				this.onDirectionChange(direction)
			},
			onStateChange: (state) => {
				this.onStateChange(state)
			},
			onMovementStart: () => {
				this.onMovementStart()
			},
			onMovementComplete: () => {
				this.onMovementComplete()
			}
		}
		
		this.movementController = new MovementController(options)
		
		// Set initial depth
		this.updateDepth()
		
		// Note: setupVisuals() should be called by the subclass constructor AFTER all properties are initialized
	}
	
	/**
	 * Set target position for interpolated movement
	 */
	public setTargetPosition(x: number, y: number): void {
		this.movementController.setTargetPosition(x, y, this.x, this.y)
	}
	
	/**
	 * Update position immediately (teleport/sync, no interpolation)
	 */
	public updatePosition(x: number, y: number): void {
		this.x = x
		this.y = y
		this.updateDepth()
		// Cancel any ongoing movement
		this.movementController.cancelMovement()
	}
	
	/**
	 * Called before physics update (call in scene update loop)
	 */
	public preUpdate(): void {
		if (this.movementController.isMoving()) {
			const result = this.movementController.update(this.x, this.y)
			this.x = result.x
			this.y = result.y
			this.updateDepth()
			// Update visuals based on direction and state
			this.updateVisuals(result.direction, result.state)
		}
	}
	
	/**
	 * Update depth based on Y position for proper rendering order
	 */
	protected updateDepth(): void {
		this.setDepth(this.baseDepth + this.y * 0.1)
	}
	
	// Abstract methods for subclasses to implement
	protected abstract updateVisuals(direction: Direction, state: 'idle' | 'moving'): void
	protected abstract setupVisuals(): void
	
	// Protected hooks for subclasses (optional overrides)
	protected onMovementStart(): void {
		// Override if needed
	}
	
	protected onMovementComplete(): void {
		// Override if needed
	}
	
	protected onDirectionChange(direction: Direction): void {
		// Override if needed
	}
	
	protected onStateChange(state: 'idle' | 'moving'): void {
		// Override if needed
	}
}

