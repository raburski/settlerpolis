import { Scene } from 'phaser'
import { NPC } from '../../../backend/src/DataTypes'
import { NPCService } from '../services/NPCService'

export class NPCSprite extends Phaser.GameObjects.Sprite {
	private interactionZone: Phaser.GameObjects.Zone
	private nameText: Phaser.GameObjects.Text
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
		}).setOrigin(0.5)

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

		// Add to scene
		scene.add.existing(this)

		// Set up keyboard interaction
		scene.input.keyboard.on('keydown-E', () => {
			if (this.isInteractable) {
				this.interact()
			}
		})
	}

	private interact() {
		this.npcService.interact(this.npc)
	}

	destroy() {
		this.interactionZone.destroy()
		this.nameText.destroy()
		super.destroy()
	}
} 