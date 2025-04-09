import { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import { Event } from '../../../backend/src/Event'
import { Inventory as InventoryType, Item } from '../../../backend/src/DataTypes'
import { ItemType } from '../../../backend/src/types'
import styles from './Inventory.module.css'

interface InventoryProps {
	isOpen: boolean
}

export function Inventory({ isOpen }: InventoryProps) {
	const [inventory, setInventory] = useState<InventoryType>({ items: [] })

	useEffect(() => {
		function handleInventoryLoaded(data: { inventory: InventoryType }) {
			setInventory(data.inventory)
		}

		EventBus.on(Event.Inventory.Loaded, handleInventoryLoaded)

		return () => {
			EventBus.off(Event.Inventory.Loaded, handleInventoryLoaded)
		}
	}, [])

	const handleDropItem = (itemId: string) => {
		EventBus.emit(Event.Inventory.Drop, { itemId })
	}

	const handleConsumeItem = (itemId: string) => {
		EventBus.emit(Event.Inventory.Consume, { itemId })
	}

	if (!isOpen) return null

	return (
		<div className={styles.container}>
			<h2>Inventory</h2>
			{inventory.items.length === 0 ? (
				<p>Your inventory is empty</p>
			) : (
				<ul className={styles.itemsList}>
					{inventory.items.map(item => (
						<li key={item.id} className={styles.item}>
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
						</li>
					))}
				</ul>
			)}
		</div>
	)
} 