import { Event } from '@rugged/game'
import { EquipmentSlotType, ItemCategory, PLACE_RANGE } from '@rugged/game'
import { EventBus } from '../../EventBus'
import { itemService } from '../../services/ItemService'
import type { GameScene } from '../../scenes/base/GameScene'
import type { BasePlayerController } from '../../entities/Player/BaseController'
import type { AbstractMesh } from '@babylonjs/core'
import type { PointerState } from '../../input/InputManager'

export class ItemPlacementManager {
	private scene: GameScene
	private playerController: BasePlayerController
	private previewMesh: AbstractMesh | null = null
	private placementText: HTMLDivElement | null = null
	private isPlacementModeActive = false
	private currentItem: any = null
	private hasMouseMoved = false

	constructor(scene: GameScene, playerController: BasePlayerController) {
		this.scene = scene
		this.playerController = playerController
		this.setupEventListeners()
	}

	private setupEventListeners() {
		EventBus.on(Event.Players.SC.Equip, this.handleItemEquipped, this)
		EventBus.on(Event.Players.SC.Unequip, this.handleItemUnequipped, this)
		this.scene.runtime.input.on('pointermove', this.handlePointerMove)
		this.scene.runtime.input.on('pointerup', this.handlePointerDown)
	}

	private handleItemEquipped = (data: { itemId: string; slotType: EquipmentSlotType; item: any; sourcePlayerId: string }) => {
		if (data.sourcePlayerId && data.sourcePlayerId !== this.playerController.playerId) return
		if (data.slotType === EquipmentSlotType.Hand && data.item) {
			const itemMetadata = itemService.getItemType(data.item.itemType)
			if (itemMetadata && itemMetadata.category === ItemCategory.Placeable) {
				this.activatePlacementMode(data.item)
			} else {
				this.deactivatePlacementMode()
			}
		}
	}

	private handleItemUnequipped = (data: { slotType: EquipmentSlotType; item: any; sourcePlayerId: string }) => {
		if (data.sourcePlayerId && data.sourcePlayerId !== this.playerController.playerId) return
		if (data.slotType === EquipmentSlotType.Hand && this.isPlacementModeActive) {
			this.deactivatePlacementMode()
		}
	}

	private activatePlacementMode(item: any) {
		this.isPlacementModeActive = true
		this.currentItem = item
		this.hasMouseMoved = false

		const itemMetadata = itemService.getItemType(item.itemType)
		const size = this.getPlacementSize(itemMetadata)
		const mesh = this.scene.runtime.renderer.createBox('item-preview', {
			width: size.width,
			length: size.height,
			height: this.scene.map?.tileHeight ? this.scene.map.tileHeight * 0.5 : 16
		})
		const emoji = itemMetadata?.emoji
		if (emoji) {
			this.scene.runtime.renderer.applyEmoji(mesh, emoji)
		} else {
			this.scene.runtime.renderer.applyTint(mesh, '#ffffff')
		}
		this.previewMesh = mesh

		const text = document.createElement('div')
		text.textContent = 'Click to place item'
		text.style.position = 'absolute'
		text.style.top = '16px'
		text.style.left = '16px'
		text.style.padding = '4px 8px'
		text.style.background = 'rgba(0,0,0,0.7)'
		text.style.color = '#ffffff'
		text.style.fontSize = '14px'
		text.style.borderRadius = '4px'
		text.style.display = 'none'
		this.scene.runtime.overlayRoot.appendChild(text)
		this.placementText = text
	}

	private getPlacementSize(itemMetadata: any): { width: number; height: number } {
		const tileSize = this.scene.map?.tileWidth || 32
		if (itemMetadata?.placement?.size) {
			return {
				width: itemMetadata.placement.size.width * tileSize,
				height: itemMetadata.placement.size.height * tileSize
			}
		}
		return { width: tileSize, height: tileSize }
	}

	private deactivatePlacementMode() {
		this.isPlacementModeActive = false
		this.currentItem = null
		this.hasMouseMoved = false

		if (this.previewMesh) {
			this.previewMesh.dispose()
			this.previewMesh = null
		}

		if (this.placementText) {
			this.placementText.remove()
			this.placementText = null
		}
	}

	private handlePointerMove = (pointer: PointerState) => {
		if (!this.isPlacementModeActive || !this.previewMesh) return
		const worldPoint = pointer.world ?? this.scene.runtime.input.getWorldPoint()
		if (!worldPoint) return

		if (!this.hasMouseMoved) {
			this.hasMouseMoved = true
			if (this.placementText) {
				this.placementText.style.display = 'block'
			}
		}

		const gridSize = this.scene.map?.tileWidth || 32
		const offset = gridSize / 2
		const snappedX = Math.floor((worldPoint.x - offset) / gridSize) * gridSize
		const snappedY = Math.floor((worldPoint.z - offset) / gridSize) * gridSize

		const size = this.getPlacementSize(itemService.getItemType(this.currentItem.itemType))
		const centerX = snappedX + size.width / 2
		const centerY = snappedY + size.height / 2
		this.scene.runtime.renderer.setMeshPosition(this.previewMesh, centerX, gridSize * 0.25, centerY)

		if (this.placementText && this.hasMouseMoved) {
			const playerPosition = this.playerController.getPosition()
			const distance = Math.hypot(playerPosition.x - centerX, playerPosition.y - centerY)
			this.placementText.style.display = distance <= PLACE_RANGE ? 'block' : 'none'
		}
	}

	private handlePointerDown = (pointer: PointerState) => {
		if (pointer.wasDrag || pointer.button !== 0) return
		if (!this.isPlacementModeActive || !this.currentItem || !this.previewMesh) return
		const worldPoint = pointer.world ?? this.scene.runtime.input.getWorldPoint()
		if (!worldPoint) return

		const gridSize = this.scene.map?.tileWidth || 32
		const offset = gridSize / 2
		const snappedX = Math.floor((worldPoint.x - offset) / gridSize) * gridSize
		const snappedY = Math.floor((worldPoint.z - offset) / gridSize) * gridSize

		const playerPosition = this.playerController.getPosition()
		const size = this.getPlacementSize(itemService.getItemType(this.currentItem.itemType))
		const centerX = snappedX + size.width / 2
		const centerY = snappedY + size.height / 2
		const distance = Math.hypot(playerPosition.x - centerX, playerPosition.y - centerY)

		if (distance <= PLACE_RANGE) {
			EventBus.emit(Event.Players.CS.Place, {
				position: { x: snappedX, y: snappedY },
				rotation: 0,
				metadata: {}
			})
			this.deactivatePlacementMode()
		}
	}

	public update() {}

	public destroy() {
		EventBus.off(Event.Players.SC.Equip, this.handleItemEquipped)
		EventBus.off(Event.Players.SC.Unequip, this.handleItemUnequipped)
		this.scene.runtime.input.off('pointermove', this.handlePointerMove)
		this.scene.runtime.input.off('pointerup', this.handlePointerDown)
		this.deactivatePlacementMode()
	}
}
