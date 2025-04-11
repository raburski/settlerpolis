import { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import { Event } from '@backend/events'
import { Inventory as InventoryType, Item } from '@backend/DataTypes'
import { ItemType } from '@backend/types'
import styles from './Inventory.module.css'

interface InventoryProps {
	isOpen: boolean
}

export function Inventory({ isOpen }: InventoryProps) {
	const [inventory, setInventory] = useState<InventoryType>({ items: [] })

	useEffect(() => {
        console.log('INV EFFECT')
		const handleInventoryLoaded = (data: { inventory: InventoryType }) => {
            console.log('setInventory', data)
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

	if (!isOpen) return null
    console.log('render inventory', inventory.items)
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