import { Scene, GameObjects } from 'phaser'
import { Direction, PlayerState, PlayerView } from './View2'
import { PlayerView2 } from './View2'
import { Event } from "@rugged/game"
import { EventBus } from "../../EventBus"
import { EquipmentSlot } from '@rugged/game'
import { Item } from '@rugged/game'
import { itemTextureService } from '../../services/ItemTextureService'
import { GameScene } from '../../scenes/base/GameScene'

// Define a union type for both view classes
type PlayerViewType = PlayerView | PlayerView2

export abstract class BasePlayerController {
	protected equippedItemSprite: GameObjects.Sprite | null = null
	protected equippedItem: Item | null = null

	constructor(
		protected view: PlayerViewType,
		protected scene: GameScene,
		public playerId: string
	) {
		// Subscribe to chat messages
		EventBus.on(Event.Chat.SC.Receive, this.handleChatMessage, this)
		// Subscribe to equipment events
		EventBus.on(Event.Players.SC.Equip, this.handleItemEquipped, this)
		EventBus.on(Event.Players.SC.Unequip, this.handleItemUnequipped, this)
		// Subscribe to emoji events
		EventBus.on(Event.Chat.SC.Emoji, this.handleEmoji, this)
	}

	/**
	 * Determines if this controller should handle an event based on the source player ID
	 * @param data Event data containing sourcePlayerId
	 * @returns True if this controller should handle the event, false otherwise
	 */
	protected abstract shouldHandleEvent(data: { sourcePlayerId: string }): boolean

	protected handleChatMessage = (data: { sourcePlayerId: string, message: string, playerId: string }) => {
		if (!this.shouldHandleEvent(data)) return
		
		if (!this.scene.textDisplayService) return

		this.scene.textDisplayService.displayMessage({
			message: data.message,
			scene: this.scene,
			worldPosition: { x: this.view.x, y: this.view.y },
			entityId: this.playerId
		})
	}

	protected handleEmoji = (data: { sourcePlayerId: string, emoji: string }) => {
		if (!this.shouldHandleEvent(data)) return
		
		if (!this.scene.textDisplayService) return

		this.scene.textDisplayService.displayEmoji({
			message: data.emoji,
			scene: this.scene,
			worldPosition: { x: this.view.x, y: this.view.y },
			entityId: this.playerId
		})
	}

	protected handleItemEquipped = (data: { itemId: string, slotType: EquipmentSlotType, item: Item, sourcePlayerId: string }) => {
		if (!this.shouldHandleEvent(data)) return

		// Only handle equipment for our player
		if (data.slotType === EquipmentSlot.Hand) {
			this.equippedItem = data.item
			this.updateEquippedItemSprite()
		}
	}

	protected handleItemUnequipped = (data: { slotType: EquipmentSlotType, item: Item, sourcePlayerId: string }) => {
		if (!this.shouldHandleEvent(data)) return

		// Only handle equipment for our player
		if (data.slotType === EquipmentSlot.Hand) {
			this.equippedItem = null
			this.updateEquippedItemSprite()
		}
	}

	protected updateEquippedItemSprite() {
		// Remove existing sprite if any
		if (this.equippedItemSprite) {
			this.equippedItemSprite.destroy()
			this.equippedItemSprite = null
		}

		// If we have an equipped item, create a new sprite
		if (this.equippedItem) {
			// Get the texture info from the service
			const textureInfo = itemTextureService.getItemTexture(this.equippedItem.itemType)
			
			if (textureInfo) {
				// Create the sprite with the appropriate texture
				this.equippedItemSprite = this.scene.add.sprite(0, 0, textureInfo.key, textureInfo.frame)
				this.equippedItemSprite.setScale(0.3)
				
				// Position the sprite based on player direction
				this.updateEquippedItemPosition()
				
				// Add to the view container
				this.view.add(this.equippedItemSprite)
			}
		}
	}

	protected updateEquippedItemPosition() {
		if (!this.equippedItemSprite) return

		// Position the item sprite relative to the player based on direction
		switch (this.view.direction) {
			case Direction.Right:
				this.equippedItemSprite.setPosition(1, 8) // Right side, slightly up
				break
			case Direction.Left:
				this.equippedItemSprite.setPosition(-9, 8) // Left side, slightly up
				break
			case Direction.Up:
				this.equippedItemSprite.setPosition(10, 8) // Above player
				break
			case Direction.Down:
				this.equippedItemSprite.setPosition(-10, 8) // Below player
				break
		}
	}

	abstract update(): void

	public destroy(): void {
		EventBus.off(Event.Chat.SC.Receive, this.handleChatMessage, this)
		EventBus.off(Event.Players.SC.Equip, this.handleItemEquipped, this)
		EventBus.off(Event.Players.SC.Unequip, this.handleItemUnequipped, this)
		if (this.equippedItemSprite) {
			this.equippedItemSprite.destroy()
		}
	}

	/**
	 * Returns the current position of the player
	 */
	public getPosition(): { x: number, y: number } {
		return { x: this.view.x, y: this.view.y }
	}
} 