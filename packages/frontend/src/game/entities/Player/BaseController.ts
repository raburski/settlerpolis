import { Direction } from './View'
import type { PlayerView2 } from './View2'
import { Event } from '@rugged/game'
import { EventBus } from '../../EventBus'
import { EquipmentSlot } from '@rugged/game'
import { itemService } from '../../services/ItemService'
import type { GameScene } from '../../scenes/base/GameScene'
import type { AbstractMesh } from '@babylonjs/core'

export abstract class BasePlayerController {
	protected equippedItemMesh: AbstractMesh | null = null
	protected equippedItem: any | null = null

	constructor(
		protected view: PlayerView2,
		protected scene: GameScene,
		public playerId: string
	) {
		EventBus.on(Event.Chat.SC.Receive, this.handleChatMessage, this)
		EventBus.on(Event.Players.SC.Equip, this.handleItemEquipped, this)
		EventBus.on(Event.Players.SC.Unequip, this.handleItemUnequipped, this)
		EventBus.on(Event.Chat.SC.Emoji, this.handleEmoji, this)
	}

	protected abstract shouldHandleEvent(data: { sourcePlayerId: string }): boolean

	protected handleChatMessage = (data: { sourcePlayerId: string; message: string; playerId: string }) => {
		if (!this.shouldHandleEvent(data)) return
		if (!this.scene.textDisplayService) return

		this.scene.textDisplayService.displayMessage({
			message: data.message,
			worldPosition: { x: this.view.x, y: this.view.y },
			entityId: this.playerId
		})
	}

	protected handleEmoji = (data: { sourcePlayerId: string; emoji: string }) => {
		if (!this.shouldHandleEvent(data)) return
		if (!this.scene.textDisplayService) return

		this.scene.textDisplayService.displayEmoji({
			message: data.emoji,
			worldPosition: { x: this.view.x, y: this.view.y },
			entityId: this.playerId
		})
	}

	protected handleItemEquipped = (data: { itemId: string; slotType: EquipmentSlot; item: any; sourcePlayerId: string }) => {
		if (!this.shouldHandleEvent(data)) return
		if (data.slotType === EquipmentSlot.Hand) {
			this.equippedItem = data.item
			this.updateEquippedItemMesh()
		}
	}

	protected handleItemUnequipped = (data: { slotType: EquipmentSlot; item: any; sourcePlayerId: string }) => {
		if (!this.shouldHandleEvent(data)) return
		if (data.slotType === EquipmentSlot.Hand) {
			this.equippedItem = null
			this.updateEquippedItemMesh()
		}
	}

	protected updateEquippedItemMesh() {
		if (this.equippedItemMesh) {
			this.equippedItemMesh.dispose()
			this.equippedItemMesh = null
		}

		if (this.equippedItem) {
			const metadata = itemService.getItemType(this.equippedItem.itemType)
			const mesh = this.scene.runtime.renderer.createBox(`equip-${this.playerId}`, { width: 10, length: 10, height: 10 })
			if (metadata?.emoji) {
				this.scene.runtime.renderer.applyEmoji(mesh, metadata.emoji)
			} else {
				this.scene.runtime.renderer.applyTint(mesh, '#ffffff')
			}
			this.equippedItemMesh = mesh
			this.updateEquippedItemPosition()
		}
	}

	protected updateEquippedItemPosition() {
		if (!this.equippedItemMesh) return

		let offsetX = 10
		let offsetY = 10
		switch (this.view.direction) {
			case Direction.Right:
				offsetX = 12
				offsetY = 6
				break
			case Direction.Left:
				offsetX = -12
				offsetY = 6
				break
			case Direction.Up:
				offsetX = 6
				offsetY = -12
				break
			case Direction.Down:
				offsetX = -6
				offsetY = 12
				break
		}

		this.scene.runtime.renderer.setMeshPosition(
			this.equippedItemMesh,
			this.view.x + offsetX,
			10,
			this.view.y + offsetY
		)
	}

	abstract update(deltaMs: number): void

	public destroy(): void {
		EventBus.off(Event.Chat.SC.Receive, this.handleChatMessage, this)
		EventBus.off(Event.Players.SC.Equip, this.handleItemEquipped, this)
		EventBus.off(Event.Players.SC.Unequip, this.handleItemUnequipped, this)
		if (this.scene.textDisplayService) {
			this.scene.textDisplayService.cleanupEntityTexts(this.playerId)
		}
		if (this.equippedItemMesh) {
			this.equippedItemMesh.dispose()
			this.equippedItemMesh = null
		}
	}

	public getPosition(): { x: number; y: number } {
		return { x: this.view.x, y: this.view.y }
	}
}
