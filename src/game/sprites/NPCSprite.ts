import { Scene } from 'phaser'
import { NPC } from '../../../backend/src/DataTypes'
import { NPCService } from '../services/NPCService'
import { EventBus } from '../EventBus'

export class NPCSprite extends Phaser.GameObjects.Sprite {
	private interactionZone: Phaser.GameObjects.Zone
	private nameText: Phaser.GameObjects.Text
	private messageText: Phaser.GameObjects.Text | null = null
	private isInteractable = false

	constructor(
		scene: Scene,
		private npc: NPC,
		private npcService: NPCService
	) {
		super(scene, npc.position.x, npc.position.y, 'npc')

		// Set up the sprite
		this.setOrigin(0.5)
		this.setScale(2)
		this.setInteractive({ useHandCursor: true })
		
		// Set initial depth based on y position
		this.setDepth(this.y)

		// Add to scene first
		scene.add.existing(this)

		// Create interaction zone
		this.interactionZone = scene.add.zone(npc.position.x, npc.position.y)
			.setSize(64, 64)
			.setInteractive()

		// Add name text above NPC
		this.nameText = scene.add.text(npc.position.x, npc.position.y - 40, npc.name, {
			fontSize: '16px',
			color: '#ffffff',
			stroke: '#000000',
			strokeThickness: 4
		})
		.setOrigin(0.5)
		.setDepth(10000) // Always keep name text on top

		// Set up interaction handling
		this.interactionZone.on('pointerover', () => {
			this.setTint(0xffff00)
			this.isInteractable = true
		})

		this.interactionZone.on('pointerout', () => {
			this.clearTint()
			this.isInteractable = false
		})

		// Add click interaction
		this.on('pointerdown', () => {
			this.interact()
		})

		this.interactionZone.on('pointerdown', () => {
			this.interact()
		})

		// Set up keyboard interaction
		scene.input.keyboard.on('keydown-E', () => {
			if (this.isInteractable) {
				this.interact()
			}
		})

		// Listen for message events
		EventBus.on('npc:displayMessage', (data: { npcId: string, message: string }) => {
			if (data.npcId === this.npc.id) {
				this.displayMessage(data.message)
			}
		})
	}

	preUpdate() {
		// Update depth based on y position
		this.setDepth(this.y)

		// Update text positions to follow NPC
		if (this.nameText) {
			this.nameText.setPosition(Math.round(this.x), Math.round(this.y - 40))
		}
		if (this.messageText) {
			this.messageText.setPosition(Math.round(this.x), Math.round(this.y - 70))
		}
	}

	public displayMessage(message: string) {
		if (this.messageText) {
			this.messageText.destroy()
		}

		if (!message) return

		// Create text above the NPC (above the name text)
		this.messageText = this.scene.add.text(this.x, this.y - 80, message, {
			fontSize: '14px',
			color: '#ffffff',
			backgroundColor: '#000000a',
			padding: { x: 8, y: 6 },
			align: 'center',
			wordWrap: { width: 150, useAdvancedWrap: true },
			fixedWidth: 150,
			lineSpacing: 4,
			style: {
				boxShadow: '2px 2px 4px rgba(0,0,0,0.3)'
			}
		})
		.setOrigin(0.5)
		.setDepth(10000) // Always keep message text on top
		.setAlpha(0.85)

		// Remove the message after 3 seconds
		this.scene.time.delayedCall(3000, () => {
			if (this.messageText) {
				this.messageText.destroy()
				this.messageText = null
			}
		})
	}

	private interact() {
		this.npcService.interact(this.npc)
	}

	destroy() {
		// Clean up event listener
		EventBus.off('npc:displayMessage')
		
		if (this.messageText) {
			this.messageText.destroy()
		}
		this.interactionZone.destroy()
		this.nameText.destroy()
		super.destroy()
	}
} 