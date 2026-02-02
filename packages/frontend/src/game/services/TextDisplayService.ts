import { Vector3 } from '@babylonjs/core'
import type { GameScene } from '../scenes/base/GameScene'

interface TextDisplayOptions {
	message: string
	worldPosition: { x: number; y: number }
	fontSize?: string
	color?: string
	backgroundColor?: string
	padding?: { x: number; y: number }
	duration?: number
	entityId?: string
}

interface ActiveText {
	element: HTMLDivElement
	worldPosition: { x: number; y: number }
}

export class TextDisplayService {
	private scene: GameScene
	private container: HTMLDivElement
	private activeTexts: Map<string, ActiveText>
	private entityTexts: Map<string, Set<string>>

	constructor(scene: GameScene) {
		this.scene = scene
		this.activeTexts = new Map()
		this.entityTexts = new Map()
		this.container = document.createElement('div')
		this.container.style.position = 'absolute'
		this.container.style.top = '0'
		this.container.style.left = '0'
		this.container.style.width = '100%'
		this.container.style.height = '100%'
		this.container.style.pointerEvents = 'none'
		this.scene.runtime.overlayRoot.appendChild(this.container)
	}

	displayMessage(options: TextDisplayOptions): HTMLDivElement {
		return this.createText({
			message: options.message,
			worldPosition: options.worldPosition,
			fontSize: options.fontSize || '14px',
			color: options.color || '#ffffff',
			backgroundColor: options.backgroundColor || '#000000',
			padding: options.padding || { x: 4, y: 4 },
			duration: options.duration || 3000,
			entityId: options.entityId
		})
	}

	displaySystemMessage(options: TextDisplayOptions): HTMLDivElement | null {
		if (!options.message) return null
		return this.createText({
			message: options.message,
			worldPosition: options.worldPosition,
			fontSize: options.fontSize || '14px',
			color: options.color || '#ff4444',
			backgroundColor: options.backgroundColor || '#000000',
			padding: options.padding || { x: 4, y: 4 },
			duration: options.duration || 5000,
			entityId: options.entityId
		})
	}

	displayEmoji(options: TextDisplayOptions): HTMLDivElement {
		return this.createText({
			message: options.message,
			worldPosition: options.worldPosition,
			fontSize: options.fontSize || '26px',
			color: options.color || '#ffffff',
			backgroundColor: options.backgroundColor || 'transparent',
			padding: options.padding || { x: 0, y: 0 },
			duration: options.duration || 2000,
			entityId: options.entityId
		})
	}

	private createText(options: TextDisplayOptions): HTMLDivElement {
		const element = document.createElement('div')
		element.textContent = options.message
		element.style.position = 'absolute'
		element.style.fontSize = options.fontSize || '14px'
		element.style.color = options.color || '#ffffff'
		element.style.background = options.backgroundColor || 'transparent'
		element.style.padding = `${options.padding?.y ?? 0}px ${options.padding?.x ?? 0}px`
		element.style.borderRadius = '4px'
		element.style.whiteSpace = 'nowrap'
		element.style.transform = 'translate(-50%, -100%)'

		this.container.appendChild(element)

		const id = `${Date.now()}-${Math.random()}`
		this.activeTexts.set(id, { element, worldPosition: options.worldPosition })

		if (options.entityId) {
			if (!this.entityTexts.has(options.entityId)) {
				this.entityTexts.set(options.entityId, new Set())
			}
			this.entityTexts.get(options.entityId)?.add(id)
		}

		window.setTimeout(() => {
			this.removeText(id, options.entityId)
		}, options.duration || 3000)

		return element
	}

	private removeText(id: string, entityId?: string): void {
		const entry = this.activeTexts.get(id)
		if (!entry) return
		entry.element.remove()
		this.activeTexts.delete(id)
		if (entityId) {
			this.entityTexts.get(entityId)?.delete(id)
			if (this.entityTexts.get(entityId)?.size === 0) {
				this.entityTexts.delete(entityId)
			}
		}
	}

	updateEntityPosition(entityId: string, position: { x: number; y: number }): void {
		const textIds = this.entityTexts.get(entityId)
		if (!textIds) return
		textIds.forEach((id) => {
			const entry = this.activeTexts.get(id)
			if (entry) {
				entry.worldPosition = position
			}
		})
	}

	update(): void {
		this.activeTexts.forEach((entry) => {
			const screen = this.scene.runtime.renderer.worldToScreen(new Vector3(entry.worldPosition.x, 0, entry.worldPosition.y))
			entry.element.style.left = `${screen.x}px`
			entry.element.style.top = `${screen.y}px`
		})
	}

	cleanupEntityTexts(entityId: string): void {
		const textIds = this.entityTexts.get(entityId)
		if (!textIds) return
		textIds.forEach((id) => this.removeText(id, entityId))
	}

	destroy(): void {
		this.activeTexts.forEach((entry) => entry.element.remove())
		this.activeTexts.clear()
		this.entityTexts.clear()
		this.container.remove()
	}
}
