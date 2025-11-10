import { Scene } from 'phaser'
import { MapObjectView } from './View'
import { MapObject } from '@rugged/game'
import { EventBus } from '../../EventBus'
import { Event, PICKUP_RANGE } from "@rugged/game"

export class MapObjectController {
	private scene: Scene
	private view: MapObjectView
	private mapObject: MapObject
	private isInteractable: boolean = false
	private interactionText: Phaser.GameObjects.Text | null = null

	constructor(scene: Scene, view: MapObjectView, mapObject: MapObject) {
		this.scene = scene
		this.view = view
		this.mapObject = mapObject
		
		// Set up interaction if the player is the owner
		this.setupInteraction()
	}
	
	private setupInteraction(): void {
		// Check if the player is the owner of this object
		const playerId = this.scene.game.registry.get('playerId')
		if (playerId === this.mapObject.playerId) {
			this.isInteractable = true
			
			// Create interaction text (hidden by default)
			this.interactionText = this.scene.add.text(0, 0, 'Press E to pick up', {
				fontSize: '16px',
				color: '#ffffff',
				backgroundColor: '#000000',
				padding: { x: 5, y: 5 }
			})
			this.interactionText.setVisible(false)
			
			// Set up input handling
			this.scene.input.keyboard.on('keydown-E', this.handleInteraction, this)
		}
	}
	
	private handleInteraction = (): void => {
		if (!this.isInteractable) return
		
		// Get the player sprite
		const playerSprite = this.scene.children.getByName('player') as Phaser.GameObjects.Sprite
		if (!playerSprite) return
		
		// Calculate distance between player and object
		const distance = Phaser.Math.Distance.Between(
			playerSprite.x,
			playerSprite.y,
			this.view.getSprite().x,
			this.view.getSprite().y
		)
		
		// Check if player is within interaction range
		if (distance <= PICKUP_RANGE) {
			// Send remove object event
			EventBus.emit(Event.MapObjects.CS.Remove, {
				objectId: this.mapObject.id
			})
		}
	}
	
	public update(): void {
		// Update view (for building progress bars, etc.)
		this.view.update()

		if (!this.isInteractable || !this.interactionText) return
		
		// Get the player sprite
		const playerSprite = this.scene.children.getByName('player') as Phaser.GameObjects.Sprite
		if (!playerSprite) return
		
		const viewSprite = this.view.getSprite()
		if (!viewSprite) return
		
		// Calculate distance between player and object
		const distance = Phaser.Math.Distance.Between(
			playerSprite.x,
			playerSprite.y,
			viewSprite.x,
			viewSprite.y
		)
		
		// Show/hide interaction text based on distance
		if (distance <= PICKUP_RANGE) {
			// Position the text above the object
			this.interactionText.setPosition(
				viewSprite.x,
				viewSprite.y - 40
			)
			this.interactionText.setVisible(true)
		} else {
			this.interactionText.setVisible(false)
		}
	}
	
	public destroy(): void {
		// Remove keyboard event listener
		if (this.isInteractable) {
			this.scene.input.keyboard.off('keydown-E', this.handleInteraction, this)
		}
		
		// Destroy interaction text
		if (this.interactionText) {
			this.interactionText.destroy()
			this.interactionText = null
		}
		
		// Destroy the view
		this.view.destroy()
	}
} 