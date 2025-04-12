import React, { useEffect, useState, useCallback } from 'react'
import { EventBus } from '../EventBus'
import { Event } from '../../../backend/src/events'
import { Inventory as InventoryType, Item } from '../../../backend/src/DataTypes'
import { itemService } from '../services/ItemService'
import styles from './Inventory.module.css'

export function Inventory() {
	const [isVisible, setIsVisible] = useState(false)
	const [inventory, setInventory] = useState<InventoryType>({ items: [] })
	const [, setUpdateCounter] = useState(0)

	const requestInventory = useCallback(() => {
		EventBus.emit(Event.Inventory.CS.Get, {})
	}, [])

	useEffect(() => {
		const handleToggle = () => {
			setIsVisible(prev => !prev)
		}

		EventBus.on('ui:inventory:toggle', handleToggle)

		return () => {
			EventBus.off('ui:inventory:toggle', handleToggle)
		}
	}, [])

	useEffect(() => {
		const handleInventoryLoaded = (data: { inventory: InventoryType }) => {
			setInventory(data.inventory)
		}

		const handleItemUpdate = () => {
			setUpdateCounter(c => c + 1)
		}

		EventBus.on(Event.Inventory.SC.Update, handleInventoryLoaded)
		const unsubscribe = itemService.onUpdate(handleItemUpdate)

		// Request initial inventory state
		requestInventory()

		return () => {
			EventBus.off(Event.Inventory.SC.Update, handleInventoryLoaded)
			unsubscribe()
		}
	}, [requestInventory])

	useEffect(() => {
		if (isVisible) {
			requestInventory()
		}
	}, [isVisible, requestInventory])

	const handleDropItem = (itemId: string) => {
		// Optimistically update the UI
		setInventory(prev => ({
			items: prev.items.filter(item => item.id !== itemId)
		}))

		// Send the drop request
		EventBus.emit(Event.Players.CS.DropItem, { itemId })
	}

	const handleConsumeItem = (itemId: string) => {
		// Optimistically update the UI
		setInventory(prev => ({
			items: prev.items.filter(item => item.id !== itemId)
		}))

		// Send the consume request
		EventBus.emit(Event.Inventory.CS.Consume, { itemId })
	}

	if (!isVisible) {
		return null
	}

	const renderItem = (item: Item) => {
		const itemType = itemService.getItemType(item.itemType)
		if (!itemType) {
			return null
		}

		return (
			<div key={item.id} className={styles.slot}>
				<div className={styles.itemContent}>
					<div className={styles.itemIcon}>{itemType.icon || '📦'}</div>
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

	return (
		<div className={styles.inventoryContainer}>
			<div className={styles.inventoryContent}>
				<button 
					className={styles.closeIcon}
					onClick={() => setIsVisible(false)}
					aria-label="Close inventory"
				>
					×
				</button>
				<h2 className={styles.title}>Inventory</h2>
				<div className={styles.grid}>
					{inventory.items.length === 0 ? (
						<p className={styles.emptyText}>Your inventory is empty</p>
					) : (
						inventory.items.map(item => renderItem(item))
					)}
				</div>
			</div>
		</div>
	)
} 