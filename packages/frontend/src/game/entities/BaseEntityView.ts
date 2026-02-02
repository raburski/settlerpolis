import type { AbstractMesh } from '@babylonjs/core'
import type { GameScene } from '../scenes/base/GameScene'
import { KinematicBody } from '../world/PhysicsWorld'

export class BaseEntityView {
	protected scene: GameScene
	protected mesh: AbstractMesh
	public body: KinematicBody | null = null
	public width: number
	public length: number
	public height: number
	public x: number
	public y: number

	constructor(scene: GameScene, mesh: AbstractMesh, size: { width: number; length: number; height: number }, position: { x: number; y: number }) {
		this.scene = scene
		this.mesh = mesh
		this.width = size.width
		this.length = size.length
		this.height = size.height
		this.x = position.x
		this.y = position.y
		this.setPosition(position.x, position.y)
	}

	setPosition(x: number, y: number): void {
		this.x = x
		this.y = y
		this.scene.runtime.renderer.setMeshPosition(this.mesh, x, this.height / 2, y)
		if (this.body) {
			this.body.x = x
			this.body.y = y
		}
	}

	getBounds(): { x: number; y: number; width: number; height: number } {
		return {
			x: this.x - this.width / 2,
			y: this.y - this.length / 2,
			width: this.width,
			height: this.length
		}
	}

	setRotation(yaw: number): void {
		this.scene.runtime.renderer.setMeshRotation(this.mesh, 0, yaw, 0)
	}

	setEmoji(emoji: string): void {
		this.scene.runtime.renderer.applyEmoji(this.mesh, emoji)
	}

	setTint(hex: string): void {
		this.scene.runtime.renderer.applyTint(this.mesh, hex)
	}

	setPickable(callback: () => void): void {
		this.scene.runtime.input.registerPickable(this.mesh, callback)
	}

	attachBody(body: KinematicBody): void {
		this.body = body
		this.scene.physics.addBody(body)
	}

	syncFromBody(): void {
		if (!this.body) return
		this.setPosition(this.body.x, this.body.y)
	}

	preUpdate(): void {
		// no-op
	}

	destroy(): void {
		if (this.body) {
			this.scene.physics.removeBody(this.body)
			this.body = null
		}
		this.scene.runtime.input.unregisterPickable(this.mesh)
		this.mesh.dispose()
	}

	getMesh(): AbstractMesh {
		return this.mesh
	}
}
