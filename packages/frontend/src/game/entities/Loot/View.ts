import { BaseEntityView } from '../BaseEntityView'
import { itemService } from '../../services/ItemService'
import type { GameScene } from '../../scenes/base/GameScene'

export class LootView extends BaseEntityView {
	private itemType: string
	private unsubscribe: (() => void) | null = null

	constructor(scene: GameScene, x: number, y: number, itemType: string, quantity: number = 1) {
		const size = { width: 16, length: 16, height: 16 }
		const mesh = scene.runtime.renderer.createBox(`loot-${itemType}-${x}-${y}`, size)
		super(scene, mesh, size, { x, y })
		this.itemType = itemType
		this.setupItemDisplay()
	}

	private setupItemDisplay() {
		this.unsubscribe = itemService.subscribeToItemMetadata(this.itemType, (metadata) => {
			if (metadata?.emoji) {
				this.scene.runtime.renderer.applyEmoji(this.getMesh(), metadata.emoji)
			} else {
				this.scene.runtime.renderer.applyTint(this.getMesh(), '#ffffff')
			}
		})
	}

	public setInteractive(callback: () => void) {
		this.setPickable(callback)
	}

	public setQuantity(quantity: number) {
			}

	public destroy() {
		this.unsubscribe?.()
		super.destroy()
	}
}
