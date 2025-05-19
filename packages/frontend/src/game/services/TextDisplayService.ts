import { Scene, GameObjects } from 'phaser'

interface TextDisplayOptions {
	message: string
	scene: Scene
	worldPosition: { x: number, y: number }
	fontSize?: string
	color?: string
	backgroundColor?: string
	padding?: { x: number, y: number }
	duration?: number
	entityId?: string // Optional ID of the entity to follow
}

export class TextDisplayService {
	private scene: Scene
	private textContainer: GameObjects.Container
	private activeTexts: Map<string, GameObjects.Text>
	private entityTexts: Map<string, Set<string>> // Maps entityId to set of textIds

	constructor(scene: Scene) {
		this.scene = scene
		// Create container at (0,0) and set it to follow the camera
		this.textContainer = scene.add.container(0, 0)
		this.textContainer.setDepth(999999) // Ensure it's always on top
		this.activeTexts = new Map()
		this.entityTexts = new Map()
	}

	displayMessage(options: TextDisplayOptions): GameObjects.Text {
		const {
			message,
			worldPosition,
			fontSize = '14px',
			color = '#ffffff',
			backgroundColor = '#000000',
			padding = { x: 4, y: 4 },
			duration = 3000,
			entityId
		} = options

		const text = this.createText({
			message,
			worldPosition,
			fontSize,
			color,
			backgroundColor,
			padding,
			duration,
			entityId
		})

		return text
	}

	displaySystemMessage(options: TextDisplayOptions): GameObjects.Text | null {
		const {
			message,
			worldPosition,
			fontSize = '14px',
			color = '#FF0000',
			backgroundColor = '#000000',
			padding = { x: 4, y: 4 },
			duration = 5000,
			entityId
		} = options

		if (!message) {
			return null
		}

		const text = this.createText({
			message,
			worldPosition,
			fontSize,
			color,
			backgroundColor,
			padding,
			duration,
			entityId
		})

		return text
	}

	displayEmoji(options: TextDisplayOptions): GameObjects.Text {
		const {
			message,
			worldPosition,
			fontSize = '26px',
			color = '#ffffff',
			backgroundColor = 'transparent',
			padding = { x: 0, y: 0 },
			duration = 2000,
			entityId
		} = options

		const text = this.createText({
			message,
			worldPosition,
			fontSize,
			color,
			backgroundColor,
			padding,
			duration,
			entityId
		})

		return text
	}

	private createText(options: TextDisplayOptions): GameObjects.Text {
		const {
			message,
			worldPosition,
			fontSize,
			color,
			backgroundColor,
			padding,
			duration,
			entityId
		} = options

		// Create text at (0,0) relative to the container
		const text = this.scene.add.text(0, 0, message, {
			fontSize,
			color,
			backgroundColor,
			padding,
			align: 'center'
		})

		// Center the text
		text.setOrigin(0.5, 0.5)

		// Store world position in text data for updates
		text.setData('worldPosition', worldPosition)

		// Add to container
		this.textContainer.add(text)

		// Store reference
		const textId = `${Date.now()}-${Math.random()}`
		this.activeTexts.set(textId, text)

		// If text is associated with an entity, track it
		if (entityId) {
			if (!this.entityTexts.has(entityId)) {
				this.entityTexts.set(entityId, new Set())
			}
			this.entityTexts.get(entityId)?.add(textId)
		}

		// Auto-remove after duration
		this.scene.time.delayedCall(duration, () => {
			if (text && text.active) {
				// Remove from entity tracking if needed
				if (entityId) {
					this.entityTexts.get(entityId)?.delete(textId)
					if (this.entityTexts.get(entityId)?.size === 0) {
						this.entityTexts.delete(entityId)
					}
				}
				text.destroy()
				this.activeTexts.delete(textId)
			}
		})

		return text
	}

	updateEntityPosition(entityId: string, position: { x: number, y: number }): void {
		// Get all texts associated with this entity
		const textIds = this.entityTexts.get(entityId)
		if (!textIds) return

		// Update position for each text
		textIds.forEach(textId => {
			const text = this.activeTexts.get(textId)
			if (text && text.active) {
				text.setData('worldPosition', position)
			}
		})
	}

	update() {
		// Update positions of all active texts based on their world positions
		this.activeTexts.forEach((text, id) => {
			const worldPosition = text.getData('worldPosition')
			if (worldPosition) {
				// Convert world position to screen position
				const screenPosition = this.scene.cameras.main.getWorldPoint(worldPosition.x, worldPosition.y)
				
				// Position text relative to the container
				text.setPosition(
					screenPosition.x - this.scene.cameras.main.scrollX,
					screenPosition.y - this.scene.cameras.main.scrollY - 50 // Offset above entity
				)
			}
		})
	}

	/**
	 * Cleans up all text displays associated with an entity
	 * @param entityId The ID of the entity whose text displays should be cleaned up
	 */
	cleanupEntityTexts(entityId: string): void {
		const textIds = this.entityTexts.get(entityId)
		if (!textIds) return

		// Destroy all texts associated with this entity
		textIds.forEach(textId => {
			const text = this.activeTexts.get(textId)
			if (text && text.active) {
				text.destroy()
				this.activeTexts.delete(textId)
			}
		})

		// Remove entity from tracking
		this.entityTexts.delete(entityId)
	}

	destroy() {
		this.textContainer.destroy()
		this.activeTexts.clear()
		this.entityTexts.clear()
	}
} 