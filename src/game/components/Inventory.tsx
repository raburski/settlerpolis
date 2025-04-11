import React, { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import { Event } from '@backend/events'
import { Inventory as InventoryType, Item } from '@backend/DataTypes'
import { ItemType } from '@backend/types'
import styles from './Inventory.module.css'

export function Inventory() {
	const [isVisible, setIsVisible] = useState(false)
	const [inventory, setInventory] = useState<InventoryType>({ items: [] })

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

		EventBus.on(Event.Inventory.SC.Update, handleInventoryLoaded)

		return () => {
			EventBus.off(Event.Inventory.SC.Update, handleInventoryLoaded)
		}
	}, [])

	const handleDropItem = (itemId: string) => {
		console.log('drop item')
		EventBus.emit(Event.Players.CS.DropItem, { itemId })
	}

	const handleConsumeItem = (itemId: string) => {
		EventBus.emit(Event.Inventory.CS.Consume, { itemId })
	}

	if (!isVisible) {
		return null
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
						<p>Your inventory is empty</p>
					) : (
						inventory.items.map(item => (
							<div key={item.id} className={styles.slot}>
								<span>{item.name}</span>
								<div className={styles.buttons}>
									{item.type === ItemType.Consumable && (
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
						))
					)}
				</div>
			</div>
		</div>
	)
} 