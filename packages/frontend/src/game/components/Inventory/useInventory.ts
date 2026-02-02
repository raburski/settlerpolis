import { useState, useEffect, useRef } from 'react'
import { EventBus } from '../../EventBus'
import { Event } from "@rugged/game"
import { itemService } from '../../services/ItemService'
import { EquipmentSlotType, INVENTORY_GRID_COLUMNS, INVENTORY_GRID_ROWS, EquipmentSlot } from '@rugged/game'
import { InventorySlot, Position, Item } from '@rugged/game'
import { usePlayerId } from '../hooks/usePlayerId'
import { useEventBus } from '../hooks/useEventBus'
import { useSlidingPanel } from '../hooks/useSlidingPanel'
import { UiEvents } from '../../uiEvents'

export const useInventory = () => {
	const { isVisible, isExiting, toggle, close } = useSlidingPanel()
	const [slots, setSlots] = useState<InventorySlot[]>([])
	const [updateCounter, setUpdateCounter] = useState<number>(0)
	const [draggedItem, setDraggedItem] = useState<Item | null>(null)
	const [isDragging, setIsDragging] = useState(false)
	const playerId = usePlayerId()
	const [equippedItems, setEquippedItems] = useState<Record<EquipmentSlotType, Item | null>>({
		[EquipmentSlot.Hand]: null
	})
	const inventoryRef = useRef<HTMLDivElement>(null)

	useEventBus(UiEvents.Inventory.Toggle, toggle)
	useEventBus(UiEvents.Quests.Toggle, close)
	useEventBus(UiEvents.Relationships.Toggle, close)
	useEventBus(UiEvents.Settings.Toggle, close)

	// Sync equipment changes from server
	useEffect(() => {
		const handleItemEquipped = (data: { itemId: string, slotType: EquipmentSlotType, item: Item, sourcePlayerId: string }) => {
			if (data.sourcePlayerId && data.sourcePlayerId !== playerId) return
			setEquippedItems(prev => ({
				...prev,
				[data.slotType]: data.item
			}))
		}

		const handleItemUnequipped = (data: { slotType: EquipmentSlotType, item: Item, sourcePlayerId: string }) => {
			if (data.sourcePlayerId && data.sourcePlayerId !== playerId) return
			setEquippedItems(prev => ({
				...prev,
				[data.slotType]: null
			}))
		}
		EventBus.on(Event.Players.SC.Equip, handleItemEquipped)
		EventBus.on(Event.Players.SC.Unequip, handleItemUnequipped)

		return () => {
			EventBus.off(Event.Players.SC.Equip, handleItemEquipped)
			EventBus.off(Event.Players.SC.Unequip, handleItemUnequipped)
		}
	}, [playerId])

	// Set up drag and drop event handlers
	useEffect(() => {
		// Handle drop events on the document
		const handleDrop = (e: DragEvent) => {
			e.preventDefault()
			
			// Check if this is an inventory operation
			const inventoryData = e.dataTransfer?.getData('application/inventory')
			if (inventoryData) {
				// This is an inventory operation, ignore it
				return
			}
			
			// Get the item ID from the data transfer
			const itemId = e.dataTransfer?.getData('text/plain')
			
			if (itemId) {
				// Emit the item dropped event with the correct event name
				EventBus.emit(Event.Players.CS.DropItem, { itemId })
			}
		}
		
		// Handle drag over events to allow dropping
		const handleDragOver = (e: DragEvent) => {
			e.preventDefault()
			e.dataTransfer!.dropEffect = 'move'
		}
		
		// Handle drag enter events
		const handleDragEnter = (e: DragEvent) => {
			e.preventDefault()
			EventBus.emit(UiEvents.Inventory.DragEnter)
		}
		
		// Handle drag leave events
		const handleDragLeave = (e: DragEvent) => {
			e.preventDefault()
			EventBus.emit(UiEvents.Inventory.DragLeave)
		}
		
		// Add event listeners to the game container
		const gameContainer = document.getElementById('app')
		if (gameContainer) {
			gameContainer.addEventListener('drop', handleDrop)
			gameContainer.addEventListener('dragover', handleDragOver)
			gameContainer.addEventListener('dragenter', handleDragEnter)
			gameContainer.addEventListener('dragleave', handleDragLeave)
		}
		
		// Clean up event listeners
		return () => {
			if (gameContainer) {
				gameContainer.removeEventListener('drop', handleDrop)
				gameContainer.removeEventListener('dragover', handleDragOver)
				gameContainer.removeEventListener('dragenter', handleDragEnter)
				gameContainer.removeEventListener('dragleave', handleDragLeave)
			}
		}
	}, [])

	// Handle inventory data
	useEffect(() => {
		// Handle initial inventory load
		const handleInventoryLoaded = (data: { inventory: InventoryType }) => {
			setSlots(data.inventory.slots)
		}

		// Handle item added event
		const handleItemAdded = (data: AddItemData) => {
			setSlots(prevSlots => {
				const newSlots = [...prevSlots]
				const slotIndex = newSlots.findIndex(slot => 
					slot.position.row === data.position.row && 
					slot.position.column === data.position.column
				)
				
				if (slotIndex >= 0) {
					newSlots[slotIndex] = {
						...newSlots[slotIndex],
						item: data.item
					}
				} else {
					newSlots.push({
						position: data.position,
						item: data.item
					})
				}
				
				return newSlots
			})
		}

		// Handle item removed event
		const handleItemRemoved = (data: { itemId: string }) => {
			setSlots(prevSlots => 
				prevSlots.map(slot => 
					slot.item?.id === data.itemId 
						? { ...slot, item: null } 
						: slot
				)
			)
		}
		
		// Handle item moved event
		const handleItemMoved = (data: { 
			itemId: string, 
			sourcePosition: Position, 
			targetPosition: Position 
		}) => {
			setSlots(prevSlots => {
				const newSlots = [...prevSlots]
				
				// Find source and target slots
				const sourceSlotIndex = newSlots.findIndex(slot => 
					slot.position.row === data.sourcePosition.row && 
					slot.position.column === data.sourcePosition.column
				)
				
				const targetSlotIndex = newSlots.findIndex(slot => 
					slot.position.row === data.targetPosition.row && 
					slot.position.column === data.targetPosition.column
				)
				
				if (sourceSlotIndex >= 0 && targetSlotIndex >= 0) {
					// Swap items between slots
					const sourceItem = newSlots[sourceSlotIndex].item
					const targetItem = newSlots[targetSlotIndex].item
					
					newSlots[sourceSlotIndex] = {
						...newSlots[sourceSlotIndex],
						item: targetItem
					}
					
					newSlots[targetSlotIndex] = {
						...newSlots[targetSlotIndex],
						item: sourceItem
					}
				}
				
				return newSlots
			})
		}

		// Handle item metadata updates
		const handleItemUpdate = () => {
			setUpdateCounter(c => c + 1)
		}

		// Register event listeners
		EventBus.on(Event.Inventory.SC.Update, handleInventoryLoaded)
		EventBus.on(Event.Inventory.SC.Add, handleItemAdded)
		EventBus.on(Event.Inventory.SC.Remove, handleItemRemoved)
		EventBus.on(Event.Inventory.SC.MoveItem, handleItemMoved)
		const unsubscribe = itemService.onUpdate(handleItemUpdate)

		// Clean up event listeners
		return () => {
			EventBus.off(Event.Inventory.SC.Update, handleInventoryLoaded)
			EventBus.off(Event.Inventory.SC.Add, handleItemAdded)
			EventBus.off(Event.Inventory.SC.Remove, handleItemRemoved)
			EventBus.off(Event.Inventory.SC.MoveItem, handleItemMoved)
			unsubscribe()
		}
	}, [])

	// Handle dropping items outside the inventory
	useEffect(() => {
		const handleDropOutside = (e: DragEvent) => {
			if (draggedItem && inventoryRef.current && !inventoryRef.current.contains(e.target as Node)) {
				handleDropItem(draggedItem.id)
			}
		}

		document.addEventListener('drop', handleDropOutside)
		return () => {
			document.removeEventListener('drop', handleDropOutside)
		}
	}, [draggedItem])

	// Create a grid of slots
	const createGridSlots = () => {
		const gridSlots: InventorySlot[] = []
		for (let row = 0; row < INVENTORY_GRID_ROWS; row++) {
			for (let column = 0; column < INVENTORY_GRID_COLUMNS; column++) {
				const existingSlot = slots.find(slot => 
					slot.position.row === row && 
					slot.position.column === column
				)
				
				if (existingSlot) {
					gridSlots.push(existingSlot)
				} else {
					gridSlots.push({
						position: { row, column },
						item: null
					})
				}
			}
		}
		return gridSlots
	}

	// Event handlers
	const handleDropItem = (itemId: string) => {
		// Send the drop request
		EventBus.emit(Event.Players.CS.DropItem, { itemId })
	}

	const handleConsumeItem = (itemId: string) => {
		// Send the consume request
		EventBus.emit(Event.Inventory.CS.Consume, { itemId })
	}
	
	const handleDragStart = (e: React.DragEvent, itemId: string, position: Position) => {
		setIsDragging(true)
		
		// Check if this is an equipped item
		const isEquippedItem = position.row === -1 && position.column === -1
		const item = isEquippedItem 
			? equippedItems[EquipmentSlot.Hand]
			: createGridSlots().find(slot => slot.item?.id === itemId)?.item || null
		
		if (item) {
			setDraggedItem({
				...item,
				position: isEquippedItem ? { row: -1, column: -1 } : position
			})
		}
		
		e.dataTransfer.setData('application/inventory', JSON.stringify({
			type: 'inventory',
			itemId,
			position: isEquippedItem ? { row: -1, column: -1 } : position
		}))
	}

	const handleDragEnd = () => {
		setIsDragging(false)
		setDraggedItem(null)
	}
	
	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault()
		e.dataTransfer.dropEffect = 'move'
	}
	
	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		
		if (!draggedItem) return
		
		const targetRow = parseInt(e.currentTarget.getAttribute('data-row') || '')
		const targetColumn = parseInt(e.currentTarget.getAttribute('data-column') || '')
		
		if (isNaN(targetRow) || isNaN(targetColumn)) return
		
		const targetPosition: Position = { row: targetRow, column: targetColumn }
		
		// Don't process if dropping on the same slot
		if (draggedItem.position?.row === targetPosition.row && 
			draggedItem.position?.column === targetPosition.column) {
			return
		}
		
		// Check if this is an equipped item being dragged
		const isEquippedItem = draggedItem.position?.row === -1 && draggedItem.position?.column === -1
		
		if (isEquippedItem) {
			// For equipped items, always try to unequip to the target position
			EventBus.emit(Event.Players.CS.Unequip, {
				slotType: EquipmentSlotType.Hand,
				targetPosition
			})
		} else {
			// Regular inventory move
			EventBus.emit(Event.Inventory.CS.MoveItem, {
				itemId: draggedItem.id,
				sourcePosition: draggedItem.position,
				targetPosition
			})
		}
	}

	const handleUnequipItem = (slotType: EquipmentSlotType, targetPosition?: Position) => {
		// Send unequip request
		EventBus.emit(Event.Players.CS.Unequip, {
			slotType,
			targetPosition
		})
	}

	const handleClose = () => close()

	return {
		isVisible,
		isExiting,
		slots,
		draggedItem,
		isDragging,
		equippedItems,
		inventoryRef,
		gridSlots: createGridSlots(),
		handleDropItem,
		handleConsumeItem,
		handleDragStart,
		handleDragEnd,
		handleDragOver,
		handleDrop,
		handleUnequipItem,
		handleClose
	}
}
