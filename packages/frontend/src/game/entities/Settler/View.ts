import { GameObjects, Physics, Geom } from 'phaser'
import { GameScene } from '../../scenes/base/GameScene'
import { SettlerState, ProfessionType, Direction } from '@rugged/game'
import { EventBus } from '../../EventBus'
import { BaseMovementView } from '../Movement/BaseMovementView'
import { itemService } from '../../services/ItemService'

export class SettlerView extends BaseMovementView {
	protected graphics: GameObjects.Graphics | null = null
	protected emojiText: GameObjects.Text | null = null
	protected carryText: GameObjects.Text | null = null
	protected dangerCircle: GameObjects.Graphics | null = null
	protected dangerText: GameObjects.Text | null = null
	protected needActivityCircle: GameObjects.Graphics | null = null
	protected needActivityText: GameObjects.Text | null = null
	protected highlightCircle: GameObjects.Graphics | null = null
	protected profession: ProfessionType
	protected state: SettlerState
	protected settlerId: string
	private carryItemType: string | null = null
	private carryItemUnsubscribe: (() => void) | null = null
	private dangerKind: 'hunger' | 'fatigue' | null = null
	private activeNeedKind: 'hunger' | 'fatigue' | null = null
	private isHighlighted: boolean = false
	private readonly CRITICAL_NEED_THRESHOLD = 0.15
	private readonly dangerEmojis: Record<'hunger' | 'fatigue', string> = {
		hunger: '🍞',
		fatigue: '💤'
	}
	private professionColors: Record<ProfessionType, number> = {
		[ProfessionType.Carrier]: 0xffffff, // White
		[ProfessionType.Builder]: 0xffaa00, // Orange
		[ProfessionType.Woodcutter]: 0x8b4513, // Brown
		[ProfessionType.Miner]: 0x808080, // Gray
		[ProfessionType.Farmer]: 0x7fbf3f, // Green
		[ProfessionType.Miller]: 0x6aa0ff, // Light blue
		[ProfessionType.Baker]: 0xd2a679, // Wheat
		[ProfessionType.Vendor]: 0xff4d6d // Pink
	}
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

	constructor(scene: GameScene, x: number = 0, y: number = 0, settlerId: string, profession: ProfessionType, speed: number = 64) {
		super(scene, x, y, speed)
		
		this.baseDepth = 10000 // Ensure settlers render above buildings and map objects
		this.settlerId = settlerId
		this.profession = profession
		this.state = SettlerState.Idle

		// Enable physics on the container
		scene.physics.add.existing(this)
		
		// Setup visuals AFTER all properties are initialized
		this.setupVisuals()
	}

	protected setupVisuals(): void {
		// Create a simple colored circle for the settler using graphics
		const size = 20
		const color = this.professionColors[this.profession]

		// Add highlight ring (hidden by default)
		this.highlightCircle = this.scene.add.graphics()
		this.highlightCircle.clear()
		this.highlightCircle.lineStyle(3, 0xffd54f, 0.9)
		this.highlightCircle.strokeCircle(0, 0, size / 2 + 6)
		this.highlightCircle.setVisible(false)
		this.add(this.highlightCircle)
		
		// Create graphics circle - Phaser will add it to scene, then we add it to container
		this.graphics = this.scene.add.graphics()
		this.graphics.clear() // Clear any existing drawing
		this.graphics.fillStyle(color, 1)
		this.graphics.fillCircle(0, 0, size / 2)
		this.graphics.lineStyle(2, 0x000000, 1)
		this.graphics.strokeCircle(0, 0, size / 2)
		// Add to container (Phaser automatically handles removing from scene display list)
		this.add(this.graphics)

		// Add emoji text on top
		this.emojiText = this.scene.add.text(0, 0, this.professionEmojis[this.profession], {
			fontSize: '14px',
			align: 'center',
			color: '#000000'
		})
		this.emojiText.setOrigin(0.5, 0.5)
		// Add to container
		this.add(this.emojiText)

		// Add carried item emoji (hidden by default)
		this.carryText = this.scene.add.text(0, -14, '📦', {
			fontSize: '12px',
			align: 'center',
			color: '#000000'
		})
		this.carryText.setOrigin(0.5, 1)
		this.carryText.setVisible(false)
		this.add(this.carryText)

		// Add danger indicator (hidden by default)
		this.dangerCircle = this.scene.add.graphics()
		this.dangerCircle.clear()
		this.dangerCircle.fillStyle(0xff2d2d, 0.95)
		this.dangerCircle.fillCircle(0, -26, 9)
		this.dangerCircle.lineStyle(2, 0x7a0000, 1)
		this.dangerCircle.strokeCircle(0, -26, 9)
		this.dangerCircle.setVisible(false)
		this.add(this.dangerCircle)

		this.dangerText = this.scene.add.text(0, -26, '', {
			fontSize: '12px',
			align: 'center',
			color: '#ffffff'
		})
		this.dangerText.setOrigin(0.5, 0.5)
		this.dangerText.setVisible(false)
		this.add(this.dangerText)

		// Add need-activity indicator (hidden by default)
		this.needActivityCircle = this.scene.add.graphics()
		this.needActivityCircle.clear()
		this.needActivityCircle.fillStyle(0x2d6cff, 0.9)
		this.needActivityCircle.fillCircle(0, -26, 9)
		this.needActivityCircle.lineStyle(2, 0x0b2a6f, 1)
		this.needActivityCircle.strokeCircle(0, -26, 9)
		this.needActivityCircle.setVisible(false)
		this.add(this.needActivityCircle)

		this.needActivityText = this.scene.add.text(0, -26, '', {
			fontSize: '12px',
			align: 'center',
			color: '#ffffff'
		})
		this.needActivityText.setOrigin(0.5, 0.5)
		this.needActivityText.setVisible(false)
		this.add(this.needActivityText)

		// Make settler clickable with a circular hit area
		const hitArea = new Geom.Circle(0, 0, size / 2)
		this.setInteractive(hitArea, Geom.Circle.Contains)
		this.input.cursor = 'pointer'
		this.on('pointerdown', this.handleSettlerClick, this)

		// Set up physics body (physics should already be enabled by this point)
		const physicsBody = this.body as Physics.Arcade.Body
		if (physicsBody) {
			physicsBody.setSize(size, size)
			physicsBody.setOffset(-size / 2, -size / 2)
			physicsBody.setCollideWorldBounds(true)
			physicsBody.setImmovable(true)
		}
		
		// Ensure container is visible and active
		this.setVisible(true)
		this.setActive(true)
		
		// Update depth to ensure proper rendering
		this.updateDepth()
		
		console.log(`[SettlerView] Created settler ${this.settlerId} at (${this.x}, ${this.y}) with profession ${this.profession}, color=${color.toString(16)}, visible=${this.visible}, active=${this.active}`)
	}

	public setHighlighted(highlighted: boolean): void {
		if (this.isHighlighted === highlighted) {
			return
		}
		this.isHighlighted = highlighted
		this.highlightCircle?.setVisible(highlighted)
	}

	protected updateVisuals(direction: Direction, state: 'idle' | 'moving'): void {
		// Map movement state to settler state for visual updates
		// Note: BaseMovementView handles 'idle' | 'moving', but SettlerView also has 'working' and 'assigned'
		// We only update visuals for movement-related states here
		if (state === 'moving') {
			// Visual feedback for movement (if needed)
			this.setAlpha(1.0)
			this.setScale(1.0)
		} else if (state === 'idle') {
			// Visual feedback for idle (if needed)
			// But don't override if settler is in 'working' or 'assigned' state
			if (this.state === SettlerState.Idle || this.state === SettlerState.Moving) {
				this.setAlpha(1.0)
				this.setScale(1.0)
			}
		}
		// Direction changes don't affect settler visuals (they're circular)
	}

	private handleSettlerClick = (pointer: Phaser.Input.Pointer) => {
		// Only handle left clicks
		if (!pointer.leftButtonDown()) return
		
		// Emit click event for UI
		EventBus.emit('ui:settler:click', {
			settlerId: this.settlerId
		})
	}

	/**
	 * Override updatePosition to also update depth
	 */
	public updatePosition(x: number, y: number): void {
		super.updatePosition(x, y)
		// Depth is already updated by BaseMovementView, but we can add additional logic here if needed
	}

	/**
	 * Updates the settler profession (changes appearance)
	 */
	public updateProfession(profession: ProfessionType): void {
		if (this.profession === profession) return
		this.profession = profession

		// Update graphics circle color
		if (this.graphics) {
			const size = 20
			const color = this.professionColors[profession]
			this.graphics.clear()
			this.graphics.fillStyle(color, 1)
			this.graphics.fillCircle(0, 0, size / 2)
			this.graphics.lineStyle(2, 0x000000, 1)
			this.graphics.strokeCircle(0, 0, size / 2)
		}

		// Update emoji text
		if (this.emojiText) {
			this.emojiText.setText(this.professionEmojis[profession])
		}
	}

	/**
	 * Updates the settler state (SettlerState, not movement state)
	 */
	public updateState(state: SettlerState): void {
		if (this.state !== state) {
			this.state = state
			// Update visual based on state
			if (state === SettlerState.Working) {
				this.setAlpha(0.9) // Slightly transparent when working
				this.setScale(1.1) // Slightly larger when working
			} else if (state === SettlerState.Moving) {
				this.setAlpha(1.0) // Full opacity when moving
				this.setScale(1.0) // Normal size when moving
			} else {
				this.setAlpha(1.0) // Full opacity when idle
				this.setScale(1.0) // Normal size when idle
			}
		}
	}

	public updateCarriedItem(itemType?: string): void {
		const nextType = itemType || null
		if (this.carryItemType === nextType) {
			return
		}

		this.carryItemType = nextType

		if (this.carryItemUnsubscribe) {
			this.carryItemUnsubscribe()
			this.carryItemUnsubscribe = null
		}

		if (!nextType) {
			if (this.carryText) {
				this.carryText.setVisible(false)
				this.carryText.setText('')
			}
			return
		}

		if (this.carryText) {
			this.carryText.setText('📦')
			this.carryText.setVisible(true)
		}

		this.carryItemUnsubscribe = itemService.subscribeToItemMetadata(nextType, (metadata) => {
			if (!this.carryText || this.carryItemType !== nextType) {
				return
			}
			this.carryText.setText(metadata?.emoji || '📦')
			this.carryText.setVisible(true)
		})
	}

	public updateNeeds(needs?: { hunger: number, fatigue: number }): void {
		const hungerCritical = needs ? needs.hunger <= this.CRITICAL_NEED_THRESHOLD : false
		const fatigueCritical = needs ? needs.fatigue <= this.CRITICAL_NEED_THRESHOLD : false

		let nextKind: 'hunger' | 'fatigue' | null = null
		if (hungerCritical && fatigueCritical && needs) {
			nextKind = needs.hunger <= needs.fatigue ? 'hunger' : 'fatigue'
		} else if (hungerCritical) {
			nextKind = 'hunger'
		} else if (fatigueCritical) {
			nextKind = 'fatigue'
		}

		this.dangerKind = nextKind
		this.refreshNeedIndicators()
	}

	public updateNeedActivity(kind: 'hunger' | 'fatigue' | null): void {
		this.activeNeedKind = kind
		this.refreshNeedIndicators()
	}

	private refreshNeedIndicators(): void {
		if (this.dangerKind) {
			if (this.dangerText) {
				this.dangerText.setText(this.dangerEmojis[this.dangerKind])
			}
			this.dangerCircle?.setVisible(true)
			this.dangerText?.setVisible(true)
		} else {
			this.dangerCircle?.setVisible(false)
			this.dangerText?.setVisible(false)
		}

		if (!this.dangerKind && this.activeNeedKind) {
			if (this.needActivityText) {
				this.needActivityText.setText(this.dangerEmojis[this.activeNeedKind])
			}
			this.needActivityCircle?.setVisible(true)
			this.needActivityText?.setVisible(true)
		} else {
			this.needActivityCircle?.setVisible(false)
			this.needActivityText?.setVisible(false)
		}
	}

	/**
	 * Override onStateChange to sync SettlerState with movement state
	 */
	protected onStateChange(state: 'idle' | 'moving'): void {
		// Sync SettlerState with movement state when movement starts/completes
		if (state === 'moving' && this.state !== SettlerState.Working && this.state !== SettlerState.Assigned) {
			this.state = SettlerState.Moving
		} else if (state === 'idle' && this.state === SettlerState.Moving) {
			// Only set to Idle if we're currently Moving (don't override Working or Assigned)
			this.state = SettlerState.Idle
		}
	}

	public destroy(): void {
		if (this.carryItemUnsubscribe) {
			this.carryItemUnsubscribe()
			this.carryItemUnsubscribe = null
		}
		if (this.highlightCircle) {
			this.highlightCircle.destroy()
			this.highlightCircle = null
		}
		if (this.graphics) {
			this.graphics.destroy()
			this.graphics = null
		}
		if (this.emojiText) {
			this.emojiText.destroy()
			this.emojiText = null
		}
		if (this.carryText) {
			this.carryText.destroy()
			this.carryText = null
		}
		if (this.dangerCircle) {
			this.dangerCircle.destroy()
			this.dangerCircle = null
		}
		if (this.dangerText) {
			this.dangerText.destroy()
			this.dangerText = null
		}
		if (this.needActivityCircle) {
			this.needActivityCircle.destroy()
			this.needActivityCircle = null
		}
		if (this.needActivityText) {
			this.needActivityText.destroy()
			this.needActivityText = null
		}
		super.destroy()
	}
}
