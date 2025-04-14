import React, { useEffect, useState, useRef } from 'react'
import { EventBus } from '../../EventBus'
import { Event } from '../../events'
import { itemService } from '../../services/ItemService'
import { ItemTexture } from '../ItemTexture'
import { ItemTooltip } from '../ItemTooltip'
import { InventoryItem } from './InventoryItem'
import { ItemSlot } from './ItemSlot'
import styles from '../Inventory.module.css'
import { useInventory } from './useInventory'
import { INVENTORY_GRID_COLUMNS, INVENTORY_GRID_ROWS } from "../../../../backend/src/consts"
import { EquipmentSlotType } from '../../../../backend/src/Game/Players/types'

export function Inventory() {
	const {
		isVisible,
		isExiting,
		isDragging,
		draggedItem,
		equippedItems,
		inventoryRef,
		gridSlots,
		handleDropItem,
		handleConsumeItem,
		handleDragStart,
		handleDragEnd,
		handleDragOver,
		handleDrop,
		handleUnequipItem,
		handleClose
	} = useInventory()

	if (!isVisible && !isExiting) {
		return null
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
				<div className={styles.equipmentSection}>
					<div 
						className={`${styles.equipmentSlot}`}
						onDragOver={(e) => {
							e.preventDefault()
							e.dataTransfer.dropEffect = 'move'
						}}
						onDragEnter={(e) => {
							e.preventDefault()
							e.currentTarget.classList.add(styles.draggingOver)
						}}
						onDragLeave={(e) => {
							e.preventDefault()
							e.currentTarget.classList.remove(styles.draggingOver)
						}}
						onDrop={(e) => {
							e.preventDefault()
							e.stopPropagation()
							e.currentTarget.classList.remove(styles.draggingOver)
							if (!draggedItem) return

							// Send equip request
							EventBus.emit(Event.Players.CS.Equip, {
								itemId: draggedItem.id,
								slotType: EquipmentSlotType.Hand
							})
						}}
					>
						{equippedItems[EquipmentSlotType.Hand] && (
							<ItemSlot 
								slot={{
									position: { row: -1, column: -1 }, // Special position for equipped items
									item: equippedItems[EquipmentSlotType.Hand]
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
							isEquipped={false}
						/>
					))}
				</div>
			</div>
		</div>
	)
} 