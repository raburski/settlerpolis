import React from 'react'
import { createPortal } from 'react-dom'
import { Item } from '../../../backend/src/Game/Items/types'
import { itemService } from '../services/ItemService'
import styles from './Inventory.module.css'

interface ItemTooltipProps {
	item: Item
	position: { top: number; left: number }
	onConsume: (itemId: string) => void
	onDrop: (itemId: string) => void
}

export const ItemTooltip: React.FC<ItemTooltipProps> = ({ item, position, onConsume, onDrop }) => {
	const itemType = itemService.getItemType(item.itemType)
	
	if (!itemType) {
		return null
	}
	
	return createPortal(
		<div 
			className={styles.itemDetails}
			style={{
				top: `${position.top}px`,
				left: `${position.left}px`
			}}
		>
			<div className={styles.itemInfo}>
				<div className={styles.itemHeader}>
					<span className={styles.itemName}>{itemType.name}</span>
				</div>
				{itemType.description && (
					<div className={styles.itemDescription}>{itemType.description}</div>
				)}
				<div className={styles.itemType}>{itemType.type}</div>
				<div className={styles.buttons}>
					{itemType.type === 'consumable' && (
						<button 
							className={styles.consumeButton}
							onClick={() => onConsume(item.id)}
							title="Consume item"
						>
							🍽️
						</button>
					)}
					<button 
						className={styles.dropButton}
						onClick={() => onDrop(item.id)}
						title="Drop item"
					>
						🗑️
					</button>
				</div>
			</div>
		</div>,
		document.body
	)
} 