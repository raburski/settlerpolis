import type { AbstractMesh, Vector3 } from '@babylonjs/core'
import type { BabylonRenderer } from '../rendering/BabylonRenderer'

export interface PointerState {
	x: number
	y: number
	isDown: boolean
	isDragging: boolean
	wasDrag: boolean
	button: number
	buttons: number
	world: Vector3 | null
}

export interface WheelState {
	x: number
	y: number
	deltaX: number
	deltaY: number
	deltaMode: number
	ctrlKey: boolean
	shiftKey: boolean
	altKey: boolean
	metaKey: boolean
}

type PointerHandler = (pointer: PointerState) => void
type WheelHandler = (wheel: WheelState) => void

export class InputManager {
	private canvas: HTMLCanvasElement
	private renderer: BabylonRenderer
	private pointer: PointerState = { x: 0, y: 0, isDown: false, isDragging: false, wasDrag: false, button: -1, buttons: 0, world: null }
	private handlers: Map<string, Set<PointerHandler>> = new Map()
	private wheelHandlers: Set<WheelHandler> = new Set()
	private pickHandlers: Map<number, () => void> = new Map()
	private dragStartX = 0
	private dragStartY = 0
	private dragging = false
	private readonly dragThreshold = 6

	constructor(canvas: HTMLCanvasElement, renderer: BabylonRenderer) {
		this.canvas = canvas
		this.renderer = renderer
		this.attachEvents()
		this.canvas.addEventListener('dragstart', this.handleDragStart)
		this.canvas.addEventListener('contextmenu', this.handleContextMenu)
	}

	on(event: 'pointermove' | 'pointerdown' | 'pointerup', handler: PointerHandler): void {
		if (!this.handlers.has(event)) {
			this.handlers.set(event, new Set())
		}
		this.handlers.get(event)?.add(handler)
	}

	off(event: 'pointermove' | 'pointerdown' | 'pointerup', handler: PointerHandler): void {
		this.handlers.get(event)?.delete(handler)
	}

	registerPickable(mesh: AbstractMesh, callback: () => void): void {
		this.pickHandlers.set(mesh.uniqueId, callback)
		mesh.isPickable = true
	}

	unregisterPickable(mesh: AbstractMesh): void {
		this.pickHandlers.delete(mesh.uniqueId)
	}

	getPointer(): PointerState {
		return this.pointer
	}

	getWorldPoint(): Vector3 | null {
		return this.pointer.world
	}

	onWheel(handler: WheelHandler): void {
		this.wheelHandlers.add(handler)
	}

	offWheel(handler: WheelHandler): void {
		this.wheelHandlers.delete(handler)
	}

	dispose(): void {
		this.canvas.removeEventListener('pointermove', this.handlePointerMove)
		this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
		this.canvas.removeEventListener('pointerup', this.handlePointerUp)
		this.canvas.removeEventListener('wheel', this.handleWheel)
		this.canvas.removeEventListener('dragstart', this.handleDragStart)
		this.canvas.removeEventListener('contextmenu', this.handleContextMenu)
		this.handlers.clear()
		this.wheelHandlers.clear()
		this.pickHandlers.clear()
	}

	private attachEvents(): void {
		this.canvas.addEventListener('pointermove', this.handlePointerMove)
		this.canvas.addEventListener('pointerdown', this.handlePointerDown)
		this.canvas.addEventListener('pointerup', this.handlePointerUp)
		this.canvas.addEventListener('wheel', this.handleWheel, { passive: false })
	}

	private updatePointer(event: PointerEvent): void {
		const rect = this.canvas.getBoundingClientRect()
		this.pointer.x = event.clientX - rect.left
		this.pointer.y = event.clientY - rect.top
		// During camera drag we use a cheap ray-plane projection to avoid frequent scene picking.
		const useGroundPick = !(this.pointer.isDown || this.pointer.isDragging)
		this.pointer.world = this.renderer.screenToWorld(this.pointer.x, this.pointer.y, { useGroundPick })
	}

	private handlePointerMove = (event: PointerEvent) => {
		event.preventDefault()
		this.pointer.buttons = event.buttons
		this.updatePointer(event)
		if (this.pointer.isDown) {
			const dx = this.pointer.x - this.dragStartX
			const dy = this.pointer.y - this.dragStartY
			if (!this.dragging && Math.hypot(dx, dy) >= this.dragThreshold) {
				this.dragging = true
			}
			this.pointer.isDragging = this.dragging
		} else {
			this.pointer.isDragging = false
		}
		this.emit('pointermove')
	}

	private handlePointerDown = (event: PointerEvent) => {
		event.preventDefault()
		this.canvas.setPointerCapture?.(event.pointerId)
		this.pointer.isDown = true
		this.pointer.wasDrag = false
		this.pointer.isDragging = false
		this.pointer.button = event.button
		this.pointer.buttons = event.buttons
		this.updatePointer(event)
		this.dragStartX = this.pointer.x
		this.dragStartY = this.pointer.y
		this.dragging = false
		this.emit('pointerdown')
		const pick = this.renderer.scene.pick(this.pointer.x, this.pointer.y)
		if (pick?.hit && pick.pickedMesh) {
			const callback = this.pickHandlers.get(pick.pickedMesh.uniqueId)
			callback?.()
		}
	}

	private handlePointerUp = (event: PointerEvent) => {
		event.preventDefault()
		if (this.canvas.hasPointerCapture?.(event.pointerId)) {
			this.canvas.releasePointerCapture(event.pointerId)
		}
		this.pointer.isDown = false
		this.pointer.wasDrag = this.dragging
		this.pointer.isDragging = false
		this.pointer.button = event.button
		this.pointer.buttons = event.buttons
		this.updatePointer(event)
		this.emit('pointerup')
		this.dragging = false
	}

	private handleWheel = (event: WheelEvent) => {
		event.preventDefault()
		const rect = this.canvas.getBoundingClientRect()
		const wheelState: WheelState = {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
			deltaX: event.deltaX,
			deltaY: event.deltaY,
			deltaMode: event.deltaMode,
			ctrlKey: event.ctrlKey,
			shiftKey: event.shiftKey,
			altKey: event.altKey,
			metaKey: event.metaKey
		}
		for (const handler of this.wheelHandlers) {
			handler(wheelState)
		}
	}

	private emit(event: 'pointermove' | 'pointerdown' | 'pointerup'): void {
		const set = this.handlers.get(event)
		if (!set) return
		for (const handler of set) {
			handler(this.pointer)
		}
	}

	private handleDragStart = (event: DragEvent) => {
		event.preventDefault()
	}

	private handleContextMenu = (event: MouseEvent) => {
		event.preventDefault()
	}
}
