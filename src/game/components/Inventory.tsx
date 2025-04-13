import React, { useEffect, useState, useCallback, useRef } from 'react'
import { EventBus } from '../EventBus'
import { Event } from '../../../backend/src/events'
import { Inventory as InventoryType, Item, InventorySlot, Position, AddItemData } from '../../../backend/src/Game/Inventory/types'
import { itemService } from '../services/ItemService'
import { ItemTexture } from './ItemTexture'
import { ItemTooltip } from './ItemTooltip'
import { InventoryItem } from './InventoryItem'
import styles from './Inventory.module.css'
import { INVENTORY_GRID_ROWS, INVENTORY_GRID_COLUMNS } from '../../../backend/src/consts'

const ItemSlot = ({ slot, handleDropItem, handleConsumeItem, handleDragStart, handleDragEnd, handleDragOver, handleDrop }) => {
	const item = slot.item
	const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 })
	const [showTooltip, setShowTooltip] = useState(false)
	const [isDraggingOver, setIsDraggingOver] = useState(false)
	const slotRef = useRef<HTMLDivElement>(null)

	const updateTooltipPosition = useCallback(() => {
		if (slotRef.current) {
			const rect = slotRef.current.getBoundingClientRect()
			const windowWidth = window.innerWidth
			const tooltipWidth = 200 // min-width of tooltip
			const tooltipHeight = 150 // approximate height of tooltip
			const offset = 8 // offset from the slot
			
			// Calculate if tooltip would go off screen
			const spaceOnRight = windowWidth - rect.right
			const spaceOnLeft = rect.left
			const spaceBelow = window.innerHeight - rect.bottom
			
			// Position tooltip below the slot
			let left = rect.left + (rect.width / 2) - (tooltipWidth / 2)
			let top = rect.bottom + offset
			
			// If tooltip would go off screen to the right, align it to the right edge of the slot
			if (left + tooltipWidth > windowWidth) {
				left = rect.right - tooltipWidth
			}
			
			// If tooltip would go off screen to the left, align it to the left edge of the slot
			if (left < 0) {
				left = rect.left
			}
			
			// If tooltip would go off screen to the bottom, show it above the slot
			if (spaceBelow < tooltipHeight + offset) {
				top = rect.top - tooltipHeight - offset
			}
			
			setTooltipPosition({
				top,
				left
			})
		}
	}, [])

	useEffect(() => {
		updateTooltipPosition()
		window.addEventListener('resize', updateTooltipPosition)
		window.addEventListener('scroll', updateTooltipPosition)
		
		return () => {
			window.removeEventListener('resize', updateTooltipPosition)
			window.removeEventListener('scroll', updateTooltipPosition)
		}
	}, [updateTooltipPosition])

	const handleMouseEnter = () => {
		if (item) {
			updateTooltipPosition()
			setShowTooltip(true)
		}
	}

	const handleMouseLeave = () => {
		setShowTooltip(false)
	}

	const onDragOver = (e: React.DragEvent) => {
		e.preventDefault()
		e.dataTransfer.dropEffect = 'move'
		setIsDraggingOver(true)
		handleDragOver(e)
	}

	const handleDragLeave = () => {
		setIsDraggingOver(false)
	}

	const onDrop = (e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDraggingOver(false)
		handleDrop(e)
	}

	const onItemDragStart = (e: React.DragEvent) => {
		setShowTooltip(false)
		handleDragStart(e, item.id, slot.position)
	}

	if (!item) {
		return (
			<div 
				className={`${styles.emptySlot} ${isDraggingOver ? styles.draggingOver : ''}`}
				onDragOver={onDragOver}
				onDragLeave={handleDragLeave}
				onDrop={onDrop}
				data-row={slot.position.row}
				data-column={slot.position.column}
			/>
		)
	}

	const itemType = itemService.getItemType(item.itemType)
	if (!itemType) {
		return null
	}

	return (
		<>
			<div 
				ref={slotRef}
				key={item.id} 
				className={`${styles.slot} ${isDraggingOver ? styles.draggingOver : ''}`}
				data-row={slot.position.row}
				data-column={slot.position.column}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
				onDragOver={onDragOver}
				onDragLeave={handleDragLeave}
				onDrop={onDrop}
			>
				<div className={styles.itemContent}>
					<InventoryItem
						itemType={item.itemType}
						itemId={item.id}
						position={slot.position}
						fallbackEmoji={itemType.emoji || '📦'}
						onDragStart={onItemDragStart}
						onDragEnd={handleDragEnd}
					/>
				</div>
			</div>
			
			{showTooltip && (
				<ItemTooltip 
					item={item}
					position={tooltipPosition}
					onConsume={handleConsumeItem}
					onDrop={handleDropItem}
				/>
			)}
		</>
	)
}

export function Inventory() {
	const [isVisible, setIsVisible] = useState(false)
	const [isExiting, setIsExiting] = useState(false)
	const [slots, setSlots] = useState<InventorySlot[]>([])
	const [updateCounter, setUpdateCounter] = useState<number>(0)
	const [draggedItem, setDraggedItem] = useState<{id: string, position: Position} | null>(null)
	const [isDragging, setIsDragging] = useState(false)
	const inventoryRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const handleToggle = () => {
			if (isVisible) {
				// Start exit animation
				setIsExiting(true)
				// Wait for animation to complete before hiding
				setTimeout(() => {
					setIsVisible(false)
					setIsExiting(false)
				}, 300) // Match animation duration
			} else {
				setIsVisible(true)
			}
		}

		const handleQuestsToggle = () => {
			// Close inventory when quests are opened
			if (isVisible) {
				setIsExiting(true)
				setTimeout(() => {
					setIsVisible(false)
					setIsExiting(false)
				}, 300)
			}
		}

		EventBus.on('ui:inventory:toggle', handleToggle)
		EventBus.on('ui:quests:toggle', handleQuestsToggle)

		return () => {
			EventBus.off('ui:inventory:toggle', handleToggle)
			EventBus.off('ui:quests:toggle', handleQuestsToggle)
		}
	}, [isVisible])

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
			EventBus.emit('inventory:item:dragEnter')
		}
		
		// Handle drag leave events
		const handleDragLeave = (e: DragEvent) => {
			e.preventDefault()
			EventBus.emit('inventory:item:dragLeave')
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

	const handleDropItem = (itemId: string) => {
		// Send the drop request
		EventBus.emit(Event.Players.CS.DropItem, { itemId })
	}

	const handleConsumeItem = (itemId: string) => {
		// Send the consume request
		EventBus.emit(Event.Inventory.CS.Consume, { itemId })
	}
	
	const handleDragStart = (e: React.DragEvent, itemId: string, position: Position) => {
		// Set the data being dragged with a special format for inventory operations
		e.dataTransfer.setData('application/inventory', JSON.stringify({
			itemId,
			sourcePosition: position,
			type: 'inventory'
		}))
		e.dataTransfer.effectAllowed = 'move'
		
		setDraggedItem({ id: itemId, position })
		setIsDragging(true)
	}

	const handleDragEnd = () => {
		setDraggedItem(null)
		setIsDragging(false)
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
		if (draggedItem.position.row === targetPosition.row && 
			draggedItem.position.column === targetPosition.column) {
			return
		}
		
		// Send move item request
		console.log('Emitting MoveItem event:', {
			itemId: draggedItem.id,
			sourcePosition: draggedItem.position,
			targetPosition
		})
		
		EventBus.emit(Event.Inventory.CS.MoveItem, {
			itemId: draggedItem.id,
			sourcePosition: draggedItem.position,
			targetPosition
		})
	}

	const handleClose = () => {
		setIsExiting(true)
		setTimeout(() => {
			setIsVisible(false)
			setIsExiting(false)
		}, 300)
	}

	if (!isVisible && !isExiting) {
		return null
	}

	// Create a grid of slots
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

	return (
		<div 
			className={`${styles.inventoryContainer} ${isExiting ? styles.slideOut : ''}`}
			style={{
				'--inventory-grid-columns': INVENTORY_GRID_COLUMNS,
				'--inventory-grid-rows': INVENTORY_GRID_ROWS
			} as React.CSSProperties}
			ref={inventoryRef}
		>
			<div className={styles.inventoryContent}>
				<button 
					className={styles.closeIcon}
					onClick={handleClose}
					aria-label="Close inventory"
				>
					×
				</button>
				<h2 className={styles.title}>Inventory</h2>
				<div className={styles.grid}>
					{gridSlots.map((slot, index) => (
						<ItemSlot 
							key={`${slot.position.row}-${slot.position.column}`}
							slot={slot}
							handleDropItem={handleDropItem}
							handleConsumeItem={handleConsumeItem}
							handleDragStart={handleDragStart}
							handleDragEnd={handleDragEnd}
							handleDragOver={handleDragOver}
							handleDrop={handleDrop}
						/>
					))}
				</div>
			</div>
		</div>
	)
} 