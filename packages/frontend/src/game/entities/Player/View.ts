import type { GameScene } from '../../scenes/base/GameScene'
import { BaseEntityView } from '../BaseEntityView'
import { KinematicBody } from '../../world/PhysicsWorld'

export enum Direction {
	Down = 'down',
	Up = 'up',
	Left = 'left',
	Right = 'right'
}

export enum PlayerState {
	Idle = 'idle',
	Walking = 'walking'
}

export class PlayerView extends BaseEntityView {
	public direction: Direction = Direction.Down
	public currentState: PlayerState = PlayerState.Idle
	public speed: number = 160
	private entityId: string

	constructor(scene: GameScene, x: number, y: number, entityId: string) {
		const size = { width: 24, length: 24, height: 48 }
		const mesh = scene.runtime.renderer.createBox(`player-${entityId}`, size)
		super(scene, mesh, size, { x, y })
		this.entityId = entityId

		const body = new KinematicBody(x, y)
		body.setSize(20, 18)
		body.setOffset(-10, -9)
		body.setCollideWorldBounds(true)
		this.attachBody(body)

		this.scene.runtime.renderer.applyTint(mesh, '#4ea1ff')
	}

	updateDirection(direction: Direction): void {
		this.direction = direction
	}

	updateState(state: PlayerState): void {
		this.currentState = state
	}

	getVelocity(): { x: number; y: number } {
		if (!this.body) return { x: 0, y: 0 }
		return { x: this.body.velocityX, y: this.body.velocityY }
	}

	setVelocity(x: number, y: number): void {
		if (!this.body) return
		this.body.setVelocity(x, y)
	}

	preUpdate(): void {
		// no-op for now
	}

	setCollisionWith(): void {
		// handled by PhysicsWorld
	}

	updatePosition(x: number, y: number): void {
		this.setPosition(x, y)
	}

	displaySystemMessage(message: string | null): void {
		if (!this.scene.textDisplayService) return
		const entityKey = `system:${this.entityId}`
		if (!message) {
			this.scene.textDisplayService.cleanupEntityTexts(entityKey)
			return
		}
		this.scene.textDisplayService.displaySystemMessage({
			message,
			worldPosition: { x: this.x, y: this.y },
			entityId: entityKey,
			duration: 2000
		})
	}
}
