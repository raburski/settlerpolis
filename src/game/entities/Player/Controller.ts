import { Scene, Physics, GameObjects } from 'phaser'
import { Direction, PlayerState, PlayerView } from './View2'
import { PlayerView2 } from './View2'
import { Keyboard } from '../../modules/Keyboard'
import { Event } from "../../../../backend/src/events"
import { EventBus } from "../../EventBus"
import { EquipmentSlotType } from '../../../../backend/src/Game/Players/types'
import { Item } from '../../../../backend/src/Game/Items/types'
import { itemTextureService } from '../../services/ItemTextureService'

// Define a union type for both view classes
type PlayerViewType = PlayerView | PlayerView2

export class PlayerController {
	private keyboard: Keyboard
	private equippedItemSprite: GameObjects.Sprite | null = null
	private equippedItem: Item | null = null

    protected lastPositionUpdate: { x: number, y: number } | null = null
	protected lastPositionUpdateTime: number = 0
	protected readonly POSITION_UPDATE_THROTTLE = 50 // 100ms

	constructor(
		private view: PlayerViewType,
		private scene: Scene,
		public playerId: string,
	) {
		this.keyboard = new Keyboard(scene)
		// Subscribe to chat messages
		EventBus.on(Event.Chat.SC.Receive, this.handleChatMessage, this)
		// Subscribe to equipment events
		EventBus.on(Event.Players.SC.Equip, this.handleItemEquipped, this)
		EventBus.on(Event.Players.SC.Unequip, this.handleItemUnequipped, this)
	}

	private handleChatMessage = (data: { sourcePlayerId: string, message: string }) => {
		if (data.sourcePlayerId && data.sourcePlayerId === this.playerId) return
		
		// Only show message if it's from our player
		if (data.playerId === this.playerId) {
			this.view.displayMessage(data.message)
		}
	}

	private handleItemEquipped = (data: { itemId: string, slotType: EquipmentSlotType, item: Item, sourcePlayerId: string }) => {
		if (data.sourcePlayerId && data.sourcePlayerId === this.playerId) return

		// Only handle equipment for our player
		if (data.slotType === EquipmentSlotType.Hand) {
			this.equippedItem = data.item
			this.updateEquippedItemSprite()
		}
	}

	private handleItemUnequipped = (data: { slotType: EquipmentSlotType, item: Item }) => {
		if (data.sourcePlayerId && data.sourcePlayerId === this.playerId) return

		// Only handle equipment for our player
		if (data.slotType === EquipmentSlotType.Hand) {
			this.equippedItem = null
			this.updateEquippedItemSprite()
		}
	}

	private updateEquippedItemSprite() {
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

	private updateEquippedItemPosition() {
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

	update(): void {
        this.updateLocalPosition()
        this.updateServerPosition()
        this.view.preUpdate()
		this.updateEquippedItemPosition()
	}

    updateLocalPosition() {
        const body = this.view.body as Physics.Arcade.Body
		
		// Add a null check to prevent errors if the body is null
		if (!body) {
			console.error('Player physics body is null in update method. This might happen during scene transitions.')
			return
		}
		
		body.setVelocity(0)

		// Check for left movement
		if (this.keyboard.isMovingLeft()) {
			body.setVelocityX(-this.view.speed)
			this.view.updateDirection(Direction.Left)
			this.view.updateState(PlayerState.Walking)
		} 
		// Check for right movement
		else if (this.keyboard.isMovingRight()) {
			body.setVelocityX(this.view.speed)
			this.view.updateDirection(Direction.Right)
			this.view.updateState(PlayerState.Walking)
		}

		// Check for up movement
		if (this.keyboard.isMovingUp()) {
			body.setVelocityY(-this.view.speed)
			this.view.updateDirection(Direction.Up)
			this.view.updateState(PlayerState.Walking)
		} 
		// Check for down movement
		else if (this.keyboard.isMovingDown()) {
			body.setVelocityY(this.view.speed)
			this.view.updateDirection(Direction.Down)
			this.view.updateState(PlayerState.Walking)
		}

		// If no movement keys are pressed, set state to idle
		if (!this.keyboard.isAnyMovementKeyPressed()) {
			this.view.updateState(PlayerState.Idle)
		}
    }

    updateServerPosition() {
        // Update multiplayer players
        // this.multiplayerPlayers.forEach(player => {
        // 	player.update()
        // })

        // Update player position in multiplayer service

        const currentPosition = { x: this.view.x, y: this.view.y }
        const now = Date.now()

        // Check if the player has moved and enough time has passed since the last update
        const hasMoved = !this.lastPositionUpdate || 
            (currentPosition.x !== this.lastPositionUpdate.x || 
            currentPosition.y !== this.lastPositionUpdate.y)
        
        const timeSinceLastUpdate = now - this.lastPositionUpdateTime

        if (hasMoved && timeSinceLastUpdate >= this.POSITION_UPDATE_THROTTLE) {
        	// Always send the current scene key with position updates
        	EventBus.emit(Event.Players.CS.Move, currentPosition)
        	this.lastPositionUpdate = currentPosition
        	this.lastPositionUpdateTime = now
        }
    }

	public destroy(): void {
		EventBus.off(Event.Chat.SC.Receive, this.handleChatMessage, this)
		EventBus.off(Event.Players.SC.Equip, this.handleItemEquipped, this)
		EventBus.off(Event.Players.SC.Unequip, this.handleItemUnequipped, this)
		if (this.keyboard) {
			this.keyboard.destroy()
		}
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