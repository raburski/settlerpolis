import React, { useState } from 'react'
import { Item, Position } from '@rugged/game'
import { EquipmentSlotType, ItemCategory } from '@rugged/game'
import { EventBus } from '../../EventBus'
import { Event } from "@rugged/game"
import { ItemSlot } from './ItemSlot'
import styles from '../Inventory.module.css'
import { itemService } from '../../services/ItemService'

interface EquipmentSlotProps {
	equippedItem: Item | null
	isDragging: boolean
	draggedItem: Item | null
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
	draggedItem,
	handleDragStart,
	handleDragEnd,
	handleDragOver,
	handleDropItem,
	handleConsumeItem,
	handleUnequipItem
}) => {
	const [isDraggingOver, setIsDraggingOver] = useState(false)

	const handleEquipmentDrop = (e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDraggingOver(false)
		
		if (!draggedItem) return
		
		// Get the item type to check if it's a quest item
		const itemType = itemService.getItemType(draggedItem.itemType)
		if (itemType?.category === ItemCategory.Quest) {
			return // Don't allow quest items to be equipped
		}
		
		// Send equip request
		EventBus.emit(Event.Players.CS.Equip, {
			itemId: draggedItem.id,
			slotType: EquipmentSlotType.Hand,
			sourcePosition: draggedItem.position
		})
	}

	const handleDragEnter = (e: React.DragEvent) => {
		e.preventDefault()
		
		if (!draggedItem) return
		
		// Get the item type to check if it's a quest item
		const itemType = itemService.getItemType(draggedItem.itemType)
		if (itemType?.category === ItemCategory.Quest) {
			return // Don't highlight for quest items
		}
		
		setIsDraggingOver(true)
	}

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault()
		setIsDraggingOver(false)
	}

	return (
		<div className={styles.equipmentSection}>
			<div 
				className={`${styles.equipmentSlot} ${isDraggingOver ? styles.draggingOver : ''}`}
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