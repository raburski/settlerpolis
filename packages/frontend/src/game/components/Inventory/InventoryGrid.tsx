import React from 'react'
import { InventorySlot, Position } from '@rugged/game'
import { ItemSlot } from './ItemSlot'
import styles from '../Inventory.module.css'

interface InventoryGridProps {
	slots: InventorySlot[]
	handleDropItem: (itemId: string) => void
	handleConsumeItem: (itemId: string) => void
	handleDragStart: (e: React.DragEvent, itemId: string, position: Position) => void
	handleDragEnd: () => void
	handleDragOver: (e: React.DragEvent) => void
	handleDrop: (e: React.DragEvent) => void
}

export const InventoryGrid: React.FC<InventoryGridProps> = ({
	slots,
	handleDropItem,
	handleConsumeItem,
	handleDragStart,
	handleDragEnd,
	handleDragOver,
	handleDrop
}) => {
	return (
		<div className={styles.grid}>
			{slots.map((slot, index) => (
				<ItemSlot 
					key={`${slot.position.row}-${slot.position.column}`}
					slot={slot}
					handleDropItem={handleDropItem}
					handleConsumeItem={handleConsumeItem}
					handleDragStart={handleDragStart}
					handleDragEnd={handleDragEnd}
					handleDragOver={handleDragOver}
					handleDrop={handleDrop}
					isEquipped={false}
				/>
			))}
		</div>
	)
} 