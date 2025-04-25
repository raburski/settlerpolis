import React from 'react'
import { Item, Position } from '@rugged/game'
import { EquipmentSlotType } from '@rugged/game'
import { EventBus } from '../../EventBus'
import { Event } from "@rugged/game"
import { ItemSlot } from './ItemSlot'
import styles from '../Inventory.module.css'

interface EquipmentSlotProps {
	equippedItem: Item | null
	isDragging: boolean
	handleDragStart: (e: React.DragEvent, itemId: string, position: Position) => void
	handleDragEnd: () => void
	handleDragOver: (e: React.DragEvent) => void
	handleDropItem: (itemId: string) => void
	handleConsumeItem: (itemId: string) => void
	handleUnequipItem: (slotType: EquipmentSlotType, targetPosition?: Position) => void
}

export const EquipmentSlot: React.FC<EquipmentSlotProps> = ({
	equippedItem,
	isDragging,
	handleDragStart,
	handleDragEnd,
	handleDragOver,
	handleDropItem,
	handleConsumeItem,
	handleUnequipItem
}) => {
	const handleEquipmentDrop = (e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		e.currentTarget.classList.remove(styles.draggingOver)
		
		// Get the dragged item data
		const inventoryData = e.dataTransfer.getData('application/inventory')
		if (!inventoryData) return
		
		try {
			const data = JSON.parse(inventoryData)
			if (data.type === 'inventory') {
				// Send equip request
				EventBus.emit(Event.Players.CS.Equip, {
					itemId: data.itemId,
					slotType: EquipmentSlotType.Hand,
					sourcePosition: data.position
				})
			}
		} catch (error) {
			console.error('Error parsing inventory data:', error)
		}
	}

	const handleDragEnter = (e: React.DragEvent) => {
		e.preventDefault()
		e.currentTarget.classList.add(styles.draggingOver)
	}

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault()
		e.currentTarget.classList.remove(styles.draggingOver)
	}

	return (
		<div className={styles.equipmentSection}>
			<div 
				className={`${styles.equipmentSlot} ${isDragging ? styles.draggingOver : ''}`}
				onDragOver={handleDragOver}
				onDragEnter={handleDragEnter}
				onDragLeave={handleDragLeave}
				onDrop={handleEquipmentDrop}
			>
				{equippedItem && (
					<ItemSlot 
						slot={{
							position: { row: -1, column: -1 }, // Special position for equipped items
							item: equippedItem
						}}
						handleDropItem={handleDropItem}
						handleConsumeItem={handleConsumeItem}
						handleDragStart={handleDragStart}
						handleDragEnd={handleDragEnd}
						handleDragOver={(e) => {
							e.preventDefault()
							e.stopPropagation()
						}}
						handleDrop={handleEquipmentDrop}
						isEquipped={true}
					/>
				)}
			</div>
		</div>
	)
} 