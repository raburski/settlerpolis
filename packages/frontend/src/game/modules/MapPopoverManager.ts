import { Vector3 } from '@babylonjs/core'
import type { GameScene } from '../scenes/base/GameScene'
import { EventBus } from '../EventBus'
import { UiEvents } from '../uiEvents'

export type MapPopoverEntry = {
	id: string
	kind: string
	world: { x: number; z: number }
	offsetTiles?: { x?: number; y?: number; z?: number }
	screenOffset?: { x?: number; y?: number }
	data?: Record<string, any>
}

type MapPopoverClose = {
	id?: string
	kind?: string
	all?: boolean
}

const ANCHOR_DELTA_THRESHOLD = 0.5

export class MapPopoverManager {
	private scene: GameScene
	private popovers: Map<string, MapPopoverEntry> = new Map()
	private pendingEmit: Set<string> = new Set()
	private lastAnchors: Map<string, { x: number; y: number }> = new Map()
	private lastCameraState: { x: number; y: number; z: number; alpha: number; beta: number; radius: number } | null = null
	private readonly handleOpen = (entry: MapPopoverEntry) => {
		if (!entry?.id || !entry?.kind) return
		if (!entry.world || !Number.isFinite(entry.world.x) || !Number.isFinite(entry.world.z)) {
			return
		}
		const hasExisting = this.popovers.size > 0 && (!this.popovers.has(entry.id) || this.popovers.size > 1)
		if (hasExisting) {
			this.popovers.clear()
			this.pendingEmit.clear()
			this.lastAnchors.clear()
			EventBus.emit(UiEvents.MapPopover.Close, { all: true })
		}
		this.popovers.set(entry.id, entry)
		this.pendingEmit.add(entry.id)
		this.emitUpdate(entry, true)
	}
	private readonly handleClose = (data: MapPopoverClose) => {
		if (!data || data.all) {
			this.popovers.clear()
			this.pendingEmit.clear()
			this.lastAnchors.clear()
			return
		}
		if (data.id) {
			this.popovers.delete(data.id)
			this.pendingEmit.delete(data.id)
			this.lastAnchors.delete(data.id)
			return
		}
		if (data.kind) {
			for (const [id, entry] of this.popovers.entries()) {
				if (entry.kind === data.kind) {
					this.popovers.delete(id)
					this.pendingEmit.delete(id)
					this.lastAnchors.delete(id)
				}
			}
		}
	}

	constructor(scene: GameScene) {
		this.scene = scene
		EventBus.on(UiEvents.MapPopover.Open, this.handleOpen)
		EventBus.on(UiEvents.MapPopover.Close, this.handleClose)
	}

	update(): void {
		if (!this.scene.map) return
		if (this.popovers.size === 0) {
			this.syncCameraState()
			return
		}
		if (this.hasCameraMoved()) {
			const exit = this.getExitOffsetFromMovement()
			EventBus.emit(UiEvents.MapPopover.Close, { all: true, exit })
			return
		}
		for (const entry of this.popovers.values()) {
			this.emitUpdate(entry, false)
		}
	}

	destroy(): void {
		EventBus.off(UiEvents.MapPopover.Open, this.handleOpen)
		EventBus.off(UiEvents.MapPopover.Close, this.handleClose)
		this.popovers.clear()
		this.pendingEmit.clear()
		this.lastAnchors.clear()
	}

	private emitUpdate(entry: MapPopoverEntry, force: boolean): void {
		if (!this.scene.map) return
		const tileSize = this.scene.map.tileWidth || 32
		const renderer = this.scene.runtime.renderer
		const engine = renderer.engine
		const canvas = engine.getRenderingCanvas()
		if (!canvas) return
		const rect = canvas.getBoundingClientRect()
		const renderWidth = engine.getRenderWidth()
		const renderHeight = engine.getRenderHeight()
		const scaleX = renderWidth > 0 ? rect.width / renderWidth : 1
		const scaleY = renderHeight > 0 ? rect.height / renderHeight : 1

		const offsetTiles = entry.offsetTiles || {}
		const offsetWorldX = (offsetTiles.x ?? 0) * tileSize
		const offsetWorldY = (offsetTiles.y ?? 0) * tileSize
		const offsetWorldZ = (offsetTiles.z ?? 0) * tileSize
		const worldX = entry.world.x + offsetWorldX
		const worldZ = entry.world.z + offsetWorldZ
		const groundY = renderer.getGroundHeightAt(worldX, worldZ)
		const worldY = groundY + offsetWorldY
		const screen = renderer.worldToScreen(new Vector3(worldX, worldY, worldZ))
		const screenOffset = entry.screenOffset || {}
		const anchor = {
			x: rect.left + screen.x * scaleX + (screenOffset.x ?? 0),
			y: rect.top + screen.y * scaleY + (screenOffset.y ?? 0)
		}

		const lastAnchor = this.lastAnchors.get(entry.id)
		const pending = this.pendingEmit.has(entry.id)
		const moved = !lastAnchor ||
			Math.abs(anchor.x - lastAnchor.x) > ANCHOR_DELTA_THRESHOLD ||
			Math.abs(anchor.y - lastAnchor.y) > ANCHOR_DELTA_THRESHOLD
		if (!force && !pending && !moved) {
			return
		}
		this.lastAnchors.set(entry.id, anchor)
		this.pendingEmit.delete(entry.id)
		EventBus.emit(UiEvents.MapPopover.Update, {
			id: entry.id,
			kind: entry.kind,
			anchor,
			data: entry.data
		})
	}

	private syncCameraState(): void {
		const camera = this.scene.runtime.renderer.camera
		const target = camera.target
		this.lastCameraState = {
			x: target.x,
			y: target.y,
			z: target.z,
			alpha: camera.alpha,
			beta: camera.beta,
			radius: camera.radius
		}
	}

	private hasCameraMoved(): boolean {
		const camera = this.scene.runtime.renderer.camera
		const target = camera.target
		const current = {
			x: target.x,
			y: target.y,
			z: target.z,
			alpha: camera.alpha,
			beta: camera.beta,
			radius: camera.radius
		}
		const prev = this.lastCameraState
		this.lastCameraState = current
		if (!prev) return false
		const targetMoved =
			Math.abs(current.x - prev.x) > 0.5 ||
			Math.abs(current.y - prev.y) > 0.5 ||
			Math.abs(current.z - prev.z) > 0.5
		const angleMoved =
			Math.abs(current.alpha - prev.alpha) > 0.001 ||
			Math.abs(current.beta - prev.beta) > 0.001 ||
			Math.abs(current.radius - prev.radius) > 0.5
		return targetMoved || angleMoved
	}

	private getExitOffsetFromMovement(): { x: number; y: number } | undefined {
		const vector = this.scene.getCameraMoveVector()
		if (!vector) return undefined
		const strength = 36
		return {
			x: -vector.x * strength,
			y: -vector.y * strength
		}
	}
}
