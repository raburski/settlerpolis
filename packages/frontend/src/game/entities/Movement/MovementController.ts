import { Direction } from '@rugged/game'

export interface MovementControllerOptions {
	speed: number // pixels per second
	onMovementStart?: () => void
	onMovementComplete?: () => void
	onDirectionChange?: (direction: Direction) => void
	onStateChange?: (state: 'idle' | 'moving') => void
}

/**
 * MovementController handles movement interpolation, direction calculation, and state management.
 * Used via composition - views create an instance and use it in their update loop.
 */
export class MovementController {
	private targetPosition: { x: number, y: number } | null = null
	private startPosition: { x: number, y: number } | null = null
	private movementStartTime: number = 0
	private movementDuration: number = 0
	private currentDirection: Direction = Direction.Down
	private currentState: 'idle' | 'moving' = 'idle'
	private speed: number
	private options: MovementControllerOptions
	
	constructor(options: MovementControllerOptions) {
		this.speed = options.speed
		this.options = options
	}
	
	/**
	 * Set target position and start movement interpolation
	 */
	setTargetPosition(x: number, y: number, currentX: number, currentY: number): void {
		const dx = x - currentX
		const dy = y - currentY
		const distance = Math.sqrt(dx * dx + dy * dy)
		
		if (distance < 1) {
			// Already at target
			this.targetPosition = null
			this.startPosition = null
			this.setState('idle')
			return
		}
		
		this.startPosition = { x: currentX, y: currentY }
		this.targetPosition = { x, y }
		this.movementStartTime = Date.now()
		this.movementDuration = (distance / this.speed) * 1000 // Convert to milliseconds
		this.setState('moving')
		this.options.onMovementStart?.()
	}
	
	/**
	 * Update movement interpolation (call in preUpdate/update loop)
	 * Returns new position, direction, and state
	 */
	update(currentX: number, currentY: number): { x: number, y: number, direction: Direction, state: 'idle' | 'moving' } {
		if (!this.targetPosition || !this.startPosition) {
			return {
				x: currentX,
				y: currentY,
				direction: this.currentDirection,
				state: this.currentState
			}
		}
		
		const currentTime = Date.now()
		const elapsed = currentTime - this.movementStartTime
		const progress = Math.min(elapsed / this.movementDuration, 1)
		
		// Calculate new position using linear interpolation
		const newX = this.startPosition.x + (this.targetPosition.x - this.startPosition.x) * progress
		const newY = this.startPosition.y + (this.targetPosition.y - this.startPosition.y) * progress
		
		// Update direction based on movement
		const dx = this.targetPosition.x - this.startPosition.x
		const dy = this.targetPosition.y - this.startPosition.y
		let newDirection = this.currentDirection
		
		if (Math.abs(dx) > Math.abs(dy)) {
			newDirection = dx > 0 ? Direction.Right : Direction.Left
		} else {
			newDirection = dy > 0 ? Direction.Down : Direction.Up
		}
		
		if (newDirection !== this.currentDirection) {
			this.setDirection(newDirection)
		}
		
		// Check if movement is complete
		if (progress >= 1) {
			this.targetPosition = null
			this.startPosition = null
			this.setState('idle')
			this.options.onMovementComplete?.()
		}
		
		return {
			x: newX,
			y: newY,
			direction: this.currentDirection,
			state: this.currentState
		}
	}
	
	getDirection(): Direction {
		return this.currentDirection
	}
	
	getState(): 'idle' | 'moving' {
		return this.currentState
	}
	
	isMoving(): boolean {
		return this.currentState === 'moving'
	}
	
	cancelMovement(): void {
		this.targetPosition = null
		this.startPosition = null
		this.setState('idle')
	}
	
	private setDirection(direction: Direction): void {
		if (this.currentDirection !== direction) {
			this.currentDirection = direction
			this.options.onDirectionChange?.(direction)
		}
	}
	
	private setState(state: 'idle' | 'moving'): void {
		if (this.currentState !== state) {
			this.currentState = state
			this.options.onStateChange?.(state)
		}
	}
}

