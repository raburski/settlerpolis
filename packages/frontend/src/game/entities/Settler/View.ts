import { BaseMovementView } from '../Movement/BaseMovementView'
import type { GameScene } from '../../scenes/base/GameScene'
import type { AbstractMesh } from '@babylonjs/core'
import { Color3, MeshBuilder, StandardMaterial } from '@babylonjs/core'
import { ProfessionType, SettlerState, Direction } from '@rugged/game'
import { EventBus } from '../../EventBus'
import { UiEvents } from '../../uiEvents'
import { itemService } from '../../services/ItemService'
import { NEED_URGENT_THRESHOLD } from '@rugged/game'

export class SettlerView extends BaseMovementView {
	protected profession: ProfessionType
	protected state: SettlerState
	protected settlerId: string
	private isHighlighted: boolean = false
	private highlightMesh: AbstractMesh | null = null
	private carryingItemType: string | null = null
	private carryingMesh: AbstractMesh | null = null
	private activeNeedKind: 'hunger' | 'fatigue' | null = null
	private needsMesh: AbstractMesh | null = null
	private needsValues: { hunger: number; fatigue: number } | null = null
	private professionEmojis: Record<ProfessionType, string> = {
		[ProfessionType.Carrier]: '👤',
		[ProfessionType.Builder]: '🔨',
		[ProfessionType.Woodcutter]: '🪓',
		[ProfessionType.Miner]: '⛏️',
		[ProfessionType.Farmer]: '🌾',
		[ProfessionType.Miller]: '🌬️',
		[ProfessionType.Baker]: '🥖',
		[ProfessionType.Vendor]: '🛍️'
	}

	constructor(scene: GameScene, x: number, y: number, settlerId: string, profession: ProfessionType, speed: number = 64) {
		const size = { width: 20, length: 20, height: 40 }
		const mesh = scene.runtime.renderer.createBox(`settler-${settlerId}`, size) as AbstractMesh
		super(scene, mesh, size, x, y, speed)
		this.settlerId = settlerId
		this.profession = profession
		this.state = SettlerState.Idle
		this.applyProfessionEmoji()
		this.createHighlightMesh()
		this.setPickable(() => {
			EventBus.emit(UiEvents.Settler.Click, { settlerId: this.settlerId })
		})
	}

	protected updateVisuals(_direction: Direction, _state: 'idle' | 'moving'): void {
		void _direction
		void _state
		// No-op placeholder visuals
	}

	private applyProfessionEmoji(): void {
		const emoji = this.professionEmojis[this.profession]
		if (emoji) {
			this.scene.runtime.renderer.applyEmoji(this.getMesh(), emoji)
		} else {
			this.scene.runtime.renderer.applyTint(this.getMesh(), '#cccccc')
		}
	}

	public updateProfession(profession: ProfessionType): void {
		this.profession = profession
		this.applyProfessionEmoji()
	}

	public updateState(state: SettlerState): void {
		this.state = state
	}

	public updateCarriedItem(_itemType?: string): void {
		const itemType = _itemType || null
		if (this.carryingItemType === itemType) return
		this.carryingItemType = itemType

		if (!itemType) {
			if (this.carryingMesh) {
				this.carryingMesh.dispose()
				this.carryingMesh = null
			}
			return
		}

		if (!this.carryingMesh) {
			const size = 10
			const mesh = MeshBuilder.CreateBox(
				`settler-carry-${this.settlerId}`,
				{ width: size, height: size, depth: size },
				this.scene.runtime.renderer.scene
			)
			mesh.isPickable = false
			mesh.parent = this.getMesh()
			mesh.position.y = this.height / 2 + 20
			this.carryingMesh = mesh
		}

		const metadata = itemService.getItemType(itemType)
		if (metadata?.emoji) {
			this.scene.runtime.renderer.applyEmoji(this.carryingMesh, metadata.emoji)
		} else {
			this.scene.runtime.renderer.applyTint(this.carryingMesh, '#ffffff')
		}
	}

	public updateNeeds(_needs: any): void {
		if (_needs && typeof _needs.hunger === 'number' && typeof _needs.fatigue === 'number') {
			this.needsValues = { hunger: _needs.hunger, fatigue: _needs.fatigue }
		} else {
			this.needsValues = null
		}
		this.updateNeedsIndicator()
	}

	public updateHealth(_health: any): void {
		// no-op
	}

	public updateNeedActivity(_kind: 'hunger' | 'fatigue' | null): void {
		this.activeNeedKind = _kind
		this.updateNeedsIndicator()
	}

	public setHighlighted(highlighted: boolean): void {
		if (this.isHighlighted === highlighted) return
		this.isHighlighted = highlighted
		if (this.highlightMesh) {
			this.highlightMesh.setEnabled(highlighted)
		}
	}

	private createHighlightMesh(): void {
		if (this.highlightMesh) return
		const radius = 6
		const sphere = MeshBuilder.CreateSphere(`settler-highlight-${this.settlerId}`, { diameter: radius * 2 }, this.scene.runtime.renderer.scene)
		const material = new StandardMaterial(`settler-highlight-mat-${this.settlerId}`, this.scene.runtime.renderer.scene)
		material.diffuseColor = Color3.FromHexString('#ffeb3b')
		material.emissiveColor = Color3.FromHexString('#ffeb3b')
		material.specularColor = Color3.Black()
		sphere.material = material
		sphere.isPickable = false
		sphere.setEnabled(false)
		sphere.parent = this.getMesh()
		sphere.position.y = this.height / 2 + radius + 4
		this.highlightMesh = sphere
	}

	private updateNeedsIndicator(): void {
		let kind: 'hunger' | 'fatigue' | null = this.activeNeedKind
		if (!kind && this.needsValues) {
			const hunger = this.needsValues.hunger
			const fatigue = this.needsValues.fatigue
			const isHungerUrgent = hunger <= NEED_URGENT_THRESHOLD
			const isFatigueUrgent = fatigue <= NEED_URGENT_THRESHOLD
			if (isHungerUrgent || isFatigueUrgent) {
				kind = hunger <= fatigue ? 'hunger' : 'fatigue'
			}
		}

		if (!kind) {
			if (this.needsMesh) {
				this.needsMesh.dispose()
				this.needsMesh = null
			}
			return
		}

		if (!this.needsMesh) {
			const size = 9
			const mesh = MeshBuilder.CreateBox(
				`settler-need-${this.settlerId}`,
				{ width: size, height: size, depth: size },
				this.scene.runtime.renderer.scene
			)
			mesh.isPickable = false
			mesh.parent = this.getMesh()
			mesh.position.y = this.height / 2 + 34
			this.needsMesh = mesh
		}

		const emoji = kind === 'hunger' ? '🍗' : '😴'
		this.scene.runtime.renderer.applyEmoji(this.needsMesh, emoji)
	}

	public destroy(): void {
		if (this.highlightMesh) {
			this.highlightMesh.dispose()
			this.highlightMesh = null
		}
		if (this.carryingMesh) {
			this.carryingMesh.dispose()
			this.carryingMesh = null
		}
		if (this.needsMesh) {
			this.needsMesh.dispose()
			this.needsMesh = null
		}
		super.destroy()
	}
}
