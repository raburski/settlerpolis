import React, { useEffect, useState, useRef } from 'react'
import { EventBus } from '../../EventBus'
import { Event } from "@rugged/game"
import { itemService } from '../../services/ItemService'
import { ItemTexture } from '../ItemTexture'
import { ItemTooltip } from '../ItemTooltip'
import { InventoryItem } from './InventoryItem'
import { ItemSlot } from './ItemSlot'
import styles from '../Inventory.module.css'
import { useInventory } from './useInventory'
import { INVENTORY_GRID_COLUMNS, INVENTORY_GRID_ROWS, EquipmentSlotType } from '@rugged/game'
import { EquipmentSlot } from './EquipmentSlot'

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
				<EquipmentSlot
					equippedItem={equippedItems[EquipmentSlotType.Hand]}
					isDragging={isDragging}
					handleDragStart={handleDragStart}
					handleDragEnd={handleDragEnd}
					handleDragOver={handleDragOver}
					handleDropItem={handleDropItem}
					handleConsumeItem={handleConsumeItem}
					handleUnequipItem={handleUnequipItem}
				/>
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