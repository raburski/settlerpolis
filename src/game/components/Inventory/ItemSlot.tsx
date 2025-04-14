import React, { useState, useCallback, useRef, useEffect } from 'react'
import { InventorySlot } from '../../../backend/src/Game/Inventory/types'
import { itemService } from '../../services/ItemService'
import { ItemTooltip } from './ItemTooltip'
import { InventoryItem } from './InventoryItem'
import styles from '../Inventory.module.css'
import { ItemCategory } from "../../../../backend/src/Game/Items/types"
import { Event } from "../../events"
import { EquipmentSlotType } from "../../../../backend/src/types"
import { EventBus } from "../../EventBus"

interface ItemSlotProps {
	slot: InventorySlot
	handleDropItem: (itemId: string) => void
	handleConsumeItem: (itemId: string) => void
	handleDragStart: (e: React.DragEvent, itemId: string, position: { row: number, column: number }) => void
	handleDragEnd: () => void
	handleDragOver: (e: React.DragEvent) => void
	handleDrop: (e: React.DragEvent) => void
	isEquipped?: boolean
}

export const ItemSlot: React.FC<ItemSlotProps> = ({
	slot,
	handleDropItem,
	handleConsumeItem,
	handleDragStart,
	handleDragEnd,
	handleDragOver,
	handleDrop,
	isEquipped = false
}) => {
	const item = slot.item
	const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 })
	const [showTooltip, setShowTooltip] = useState(false)
	const [isDraggingOver, setIsDraggingOver] = useState(false)
	const slotRef = useRef<HTMLDivElement>(null)

	const updateTooltipPosition = useCallback(() => {
		if (slotRef.current) {
			const rect = slotRef.current.getBoundingClientRect()
			const windowWidth = window.innerWidth
			const tooltipWidth = 200 // min-width of tooltip
			const tooltipHeight = 150 // approximate height of tooltip
			const offset = 8 // offset from the slot
			
			// Calculate if tooltip would go off screen
			const spaceOnRight = windowWidth - rect.right
			const spaceOnLeft = rect.left
			const spaceBelow = window.innerHeight - rect.bottom
			
			// Position tooltip below the slot
			let left = rect.left + (rect.width / 2) - (tooltipWidth / 2)
			let top = rect.bottom + offset
			
			// If tooltip would go off screen to the right, align it to the right edge of the slot
			if (left + tooltipWidth > windowWidth) {
				left = rect.right - tooltipWidth
			}
			
			// If tooltip would go off screen to the left, align it to the left edge of the slot
			if (left < 0) {
				left = rect.left
			}
			
			// If tooltip would go off screen to the bottom, show it above the slot
			if (spaceBelow < tooltipHeight + offset) {
				top = rect.top - tooltipHeight - offset
			}
			
			setTooltipPosition({
				top,
				left
			})
		}
	}, [])

	useEffect(() => {
		updateTooltipPosition()
		window.addEventListener('resize', updateTooltipPosition)
		window.addEventListener('scroll', updateTooltipPosition)
		
		return () => {
			window.removeEventListener('resize', updateTooltipPosition)
			window.removeEventListener('scroll', updateTooltipPosition)
		}
	}, [updateTooltipPosition])

	const handleClick = () => {
		if (item) {
			const itemType = itemService.getItemType(item.itemType)
			if (itemType?.category === ItemCategory.Placeable && !isEquipped) {
				EventBus.emit(Event.Players.CS.Equip, {
					itemId: item.id,
					slotType: EquipmentSlotType.Hand,
					sourcePosition: slot.position
				})
			}
		}
	}

	const handleMouseEnter = () => {
		if (item) {
			updateTooltipPosition()
			setShowTooltip(true)
		}
	}

	const handleMouseLeave = () => {
		setShowTooltip(false)
	}

	const onDragOver = (e: React.DragEvent) => {
		e.preventDefault()
		e.dataTransfer.dropEffect = 'move'
		setIsDraggingOver(true)
		handleDragOver(e)
	}

	const handleDragLeave = () => {
		setIsDraggingOver(false)
	}

	const onDrop = (e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDraggingOver(false)
		handleDrop(e)
	}

	const onItemDragStart = (e: React.DragEvent) => {
		setShowTooltip(false)
		handleDragStart(e, item.id, slot.position)
	}

	if (!item) {
		return (
			<div 
				className={`${styles.emptySlot} ${isDraggingOver ? styles.draggingOver : ''}`}
				onDragOver={onDragOver}
				onDragLeave={handleDragLeave}
				onDrop={onDrop}
				data-row={slot.position.row}
				data-column={slot.position.column}
			/>
		)
	}

	const itemType = itemService.getItemType(item.itemType)
	if (!itemType) {
		return null
	}

	return (
		<>
			<div 
				ref={slotRef}
				key={item.id} 
				className={`${styles.slot} ${isDraggingOver ? styles.draggingOver : ''}`}
				data-row={slot.position.row}
				data-column={slot.position.column}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
				onDragOver={onDragOver}
				onDragLeave={handleDragLeave}
				onDrop={onDrop}
				onClick={handleClick}
			>
				<div className={styles.itemContent}>
					<InventoryItem
						itemType={item.itemType}
						itemId={item.id}
						position={slot.position}
						fallbackEmoji={itemType.emoji || '📦'}
						onDragStart={onItemDragStart}
						onDragEnd={handleDragEnd}
					/>
				</div>
			</div>
			
			{showTooltip && (
				<ItemTooltip 
					item={item}
					position={tooltipPosition}
					onConsume={handleConsumeItem}
					onDrop={handleDropItem}
					isEquipped={isEquipped}
				/>
			)}
		</>
	)
} 