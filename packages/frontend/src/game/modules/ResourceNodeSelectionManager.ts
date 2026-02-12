import type { GameScene } from '../scenes/base/GameScene'
import type { PointerState } from '../input/InputManager'
import type { MapObject } from '@rugged/game'
import { EventBus } from '../EventBus'
import { UiEvents } from '../uiEvents'

const STONE_NODE_TYPE = 'stone_deposit'
const STONE_POPOVER_OFFSET_TILES = 1

export class ResourceNodeSelectionManager {
	private scene: GameScene
	private selectedNodeId: string | null = null
	private lastRemaining: number | null = null
	private dragStart: { x: number; y: number } | null = null
	private readonly handleMapPopoverClose = (data?: { id?: string; kind?: string; all?: boolean }) => {
		if (data?.all) {
			this.clearSelection(false)
			return
		}
		if (data?.id && data.id === this.selectedNodeId) {
			this.clearSelection(false)
			return
		}
		if (data?.kind === 'resource-node') {
			this.clearSelection(false)
		}
	}
	private readonly handleExternalClose = () => {
		this.clearSelection(true)
	}
	private readonly handlePointerUp = (pointer: PointerState) => {
		if (pointer.wasDrag || pointer.button !== 0) return
		const node = this.getNodeFromPick(pointer)
		if (!node) {
			this.clearSelection(true)
			return
		}

		this.selectedNodeId = node.id
		this.emitSelection(node, true)
	}
	private readonly handlePointerDown = (pointer: PointerState) => {
		if (pointer.button !== 0) return
		this.dragStart = { x: pointer.x, y: pointer.y }
		if (this.selectedNodeId) {
			this.clearSelection(true)
		}
	}
	private readonly handlePointerMove = (pointer: PointerState) => {
		if (!pointer.isDragging) return
		if (this.selectedNodeId) {
			const exit = this.getExitOffset(pointer)
			this.clearSelection(true, exit)
		}
	}

	constructor(scene: GameScene) {
		this.scene = scene
		this.scene.runtime.input.on('pointerup', this.handlePointerUp)
		this.scene.runtime.input.on('pointerdown', this.handlePointerDown)
		this.scene.runtime.input.on('pointermove', this.handlePointerMove)
		EventBus.on(UiEvents.MapPopover.Close, this.handleMapPopoverClose)
		EventBus.on(UiEvents.Building.Select, this.handleExternalClose)
		EventBus.on(UiEvents.Settler.Click, this.handleExternalClose)
		EventBus.on(UiEvents.Construction.Select, this.handleExternalClose)
		EventBus.on(UiEvents.Road.Select, this.handleExternalClose)
	}

	destroy(): void {
		this.scene.runtime.input.off('pointerup', this.handlePointerUp)
		this.scene.runtime.input.off('pointerdown', this.handlePointerDown)
		this.scene.runtime.input.off('pointermove', this.handlePointerMove)
		EventBus.off(UiEvents.MapPopover.Close, this.handleMapPopoverClose)
		EventBus.off(UiEvents.Building.Select, this.handleExternalClose)
		EventBus.off(UiEvents.Settler.Click, this.handleExternalClose)
		EventBus.off(UiEvents.Construction.Select, this.handleExternalClose)
		EventBus.off(UiEvents.Road.Select, this.handleExternalClose)
	}

	update(): void {
		if (!this.selectedNodeId) return
		const node = this.findNodeById(this.selectedNodeId)
		if (!node) {
			this.clearSelection(true)
			return
		}
		this.emitSelection(node, false)
	}

	private getNodeFromPick(pointer: PointerState): MapObject | null {
		const renderer = this.scene.runtime.renderer
		const pick = renderer.scene.pick(pointer.x, pointer.y)
		if (!pick?.hit || !pick.pickedMesh) {
			return null
		}
		const batchKey = (pick.pickedMesh.metadata as { resourceNodeBatchKey?: string } | undefined)?.resourceNodeBatchKey
		if (!batchKey) {
			return null
		}
		const node = this.scene.getResourceNodeFromPick(pick.pickedMesh, pick.thinInstanceIndex)
		if (!node) return null
		if (node?.metadata?.resourceNodeType !== STONE_NODE_TYPE) {
			return null
		}
		return node
	}

	private getExitOffset(pointer: PointerState): { x: number; y: number } | undefined {
		if (!this.dragStart) return undefined
		const dx = pointer.x - this.dragStart.x
		const dy = pointer.y - this.dragStart.y
		const length = Math.hypot(dx, dy)
		if (length < 2) return undefined
		const scale = 28 / length
		return {
			x: -dx * scale,
			y: -dy * scale
		}
	}

	private findNodeById(nodeId: string): MapObject | null {
		const nodes = this.scene.getResourceNodeObjects()
		for (const node of nodes) {
			if (node?.id === nodeId) {
				return node
			}
		}
		return null
	}

	private clearSelection(emitClose: boolean, exitOffset?: { x: number; y: number }): void {
		if (!this.selectedNodeId) return
		const nodeId = this.selectedNodeId
		this.selectedNodeId = null
		this.lastRemaining = null
		this.dragStart = null
		if (emitClose) {
			EventBus.emit(UiEvents.MapPopover.Close, { id: nodeId, exit: exitOffset })
		}
	}

	private emitSelection(node: MapObject, force: boolean): void {
		const remaining = typeof node.metadata?.remainingHarvests === 'number'
			? node.metadata?.remainingHarvests
			: null
		const remainingChanged = remaining !== this.lastRemaining

		if (!force && !remainingChanged) {
			return
		}

		this.lastRemaining = remaining
		const tileSize = this.scene.map?.tileWidth ?? 32
		const tileHalf = tileSize / 2
		const worldX = node.position.x + tileHalf
		const worldZ = node.position.y + tileHalf

		EventBus.emit(UiEvents.MapPopover.Open, {
			id: node.id,
			kind: 'resource-node',
			world: { x: worldX, z: worldZ },
			offsetTiles: { y: STONE_POPOVER_OFFSET_TILES },
			data: {
				nodeType: node.metadata?.resourceNodeType,
				itemType: node.item?.itemType,
				remainingHarvests: node.metadata?.remainingHarvests
			}
		})
	}
}
