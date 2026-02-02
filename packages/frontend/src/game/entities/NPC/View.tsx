import { BaseMovementView } from '../Movement/BaseMovementView'
import type { GameScene } from '../../scenes/base/GameScene'
import type { AbstractMesh } from '@babylonjs/core'
import { Direction } from '@rugged/game'

export class NPCView extends BaseMovementView {
	public npcId: string
	private highlighted: boolean = false

	constructor(scene: GameScene, x: number, y: number, npcId: string) {
		const size = { width: 22, length: 22, height: 44 }
		const mesh = scene.runtime.renderer.createBox(`npc-${npcId}`, size) as AbstractMesh
		scene.runtime.renderer.applyTint(mesh, '#f5a623')
		super(scene, mesh, size, x, y, 80)
		this.npcId = npcId
	}

	protected updateVisuals(_direction: Direction, _state: 'idle' | 'moving'): void {
		void _direction
		void _state
		// No-op for placeholder visuals
	}

	setHighlighted(highlighted: boolean): void {
		this.highlighted = highlighted
		this.scene.runtime.renderer.applyTint(this.getMesh(), highlighted ? '#ffeb3b' : '#f5a623')
	}
}
