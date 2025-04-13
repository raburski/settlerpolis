import React, { useEffect, useState, useCallback } from 'react'
import { EventBus } from '../EventBus'
import { Event } from '../../../backend/src/events'
import { Inventory as InventoryType, Item } from '../../../backend/src/DataTypes'
import { itemService } from '../services/ItemService'
import { ItemTexture } from './ItemTexture'
import styles from './Inventory.module.css'

const ItemRow = ({ item, handleDropItem, handleConsumeItem }) => {
	const itemType = itemService.getItemType(item.itemType)
	if (!itemType) {
		return null
	}

	const handleDragStart = (e, itemType) => {
		// Set the data being dragged
		e.dataTransfer.setData('text/plain', item.id)
		e.dataTransfer.effectAllowed = 'move'
	}

	const handleDragEnd = (e) => {
		// Clean up after drag ends
	}

	return (
		<div key={item.id} className={styles.slot}>
			<div className={styles.itemContent}>
				<div className={styles.itemIcon}>
					<ItemTexture 
						itemType={item.itemType} 
						className={styles.itemTexture}
						fallbackEmoji={itemType.emoji || '📦'}
						draggable={true}
						onDragStart={handleDragStart}
						onDragEnd={handleDragEnd}
					/>
				</div>
				<div className={styles.itemInfo}>
					<div className={styles.itemHeader}>
						<span className={styles.itemName}>{itemType.name}</span>
					</div>
					{itemType.description && (
						<div className={styles.itemDescription}>{itemType.description}</div>
					)}
					<div className={styles.itemType}>{itemType.type}</div>
				</div>
			</div>
			<div className={styles.buttons}>
				{itemType.type === 'consumable' && (
					<button 
						className={styles.consumeButton}
						onClick={() => handleConsumeItem(item.id)}
						title="Consume item"
					>
						🍽️
					</button>
				)}
				<button 
					className={styles.dropButton}
					onClick={() => handleDropItem(item.id)}
					title="Drop item"
				>
					🗑️
				</button>
			</div>
		</div>
	)
}

export function Inventory() {
	const [isVisible, setIsVisible] = useState(false)
	const [isExiting, setIsExiting] = useState(false)
	const [items, setItems] = useState<Item[]>([])
	const [updateCounter, setUpdateCounter] = useState<number>(0)

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
			setItems(data.inventory.items)
		}

		// Handle item added event
		const handleItemAdded = (data: { item: Item }) => {
			setItems([...items, data.item])
		}

		// Handle item removed event
		const handleItemRemoved = (data: { itemId: string }) => {
			const newItems = items.filter(item => item.id !== data.itemId)
			setItems(newItems)
		}

		// Handle item metadata updates
		const handleItemUpdate = () => {
			setUpdateCounter(c => c + 1)
		}

		// Register event listeners
		EventBus.on(Event.Inventory.SC.Update, handleInventoryLoaded)
		EventBus.on(Event.Inventory.SC.Add, handleItemAdded)
		EventBus.on(Event.Inventory.SC.Remove, handleItemRemoved)
		const unsubscribe = itemService.onUpdate(handleItemUpdate)

		// Clean up event listeners
		return () => {
			EventBus.off(Event.Inventory.SC.Update, handleInventoryLoaded)
			EventBus.off(Event.Inventory.SC.Add, handleItemAdded)
			EventBus.off(Event.Inventory.SC.Remove, handleItemRemoved)
			unsubscribe()
		}
	}, [items])

	const handleDropItem = (itemId: string) => {
		// Send the drop request
		EventBus.emit(Event.Players.CS.DropItem, { itemId })
	}

	const handleConsumeItem = (itemId: string) => {
		// Send the consume request
		EventBus.emit(Event.Inventory.CS.Consume, { itemId })
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

	return (
		<div className={`${styles.inventoryContainer} ${isExiting ? styles.slideOut : ''}`}>
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
					{items.length === 0 ? (
						<p className={styles.emptyText}>Your inventory is empty</p>
					) : (
						items.map(item => 
							<ItemRow 
								key={item.id}
								handleDropItem={handleDropItem}
								handleConsumeItem={handleConsumeItem}
								item={item}
							/>)
					)}
				</div>
			</div>
		</div>
	)
} 