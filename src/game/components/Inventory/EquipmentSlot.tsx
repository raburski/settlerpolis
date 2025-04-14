import React from 'react'
import { Item, Position } from '../../../backend/src/Game/Inventory/types'
import { EquipmentSlotType } from '../../../backend/src/Game/Players/types'
import { EventBus } from '../../EventBus'
import { Event } from '../../../backend/src/events'
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
	return (
		<div className={styles.equipmentSection}>
			<div 
				className={`${styles.equipmentSlot} ${isDragging ? styles.draggingOver : ''}`}
				onDragOver={handleDragOver}
				onDrop={(e) => {
					e.preventDefault()
					e.stopPropagation()
					
					// Get the dragged item data
					const inventoryData = e.dataTransfer.getData('application/inventory')
					if (!inventoryData) return
					
					try {
						const data = JSON.parse(inventoryData)
						if (data.type === 'inventory') {
							// Send equip request
							EventBus.emit(Event.Players.CS.Equip, {
								itemId: data.itemId,
								slotType: EquipmentSlotType.Hand
							})
						}
					} catch (error) {
						console.error('Error parsing inventory data:', error)
					}
				}}
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
						handleDragOver={handleDragOver}
						handleDrop={(e) => {
							e.preventDefault()
							e.stopPropagation()
							
							// Get the target position from the drop event
							const targetRow = parseInt(e.currentTarget.getAttribute('data-row') || '')
							const targetColumn = parseInt(e.currentTarget.getAttribute('data-column') || '')
							
							if (!isNaN(targetRow) && !isNaN(targetColumn)) {
								// Unequip to specific position
								handleUnequipItem(EquipmentSlotType.Hand, { row: targetRow, column: targetColumn })
							} else {
								// Just unequip without specific position
								handleUnequipItem(EquipmentSlotType.Hand)
							}
						}}
						isEquipped={true}
					/>
				)}
			</div>
		</div>
	)
} 