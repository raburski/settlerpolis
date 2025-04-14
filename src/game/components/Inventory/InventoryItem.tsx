import React, { useState, useRef } from 'react'
import { ItemTexture } from '../ItemTexture'
import styles from './InventoryItem.module.css'

interface InventoryItemProps {
	itemType: string
	itemId: string
	position: { row: number, column: number }
	className?: string
	fallbackEmoji?: string
	onDragStart: (e: React.DragEvent, itemId: string, position: { row: number, column: number }) => void
	onDragEnd: (e: React.DragEvent) => void
}

export const InventoryItem: React.FC<InventoryItemProps> = ({
	itemType,
	itemId,
	position,
	className = '',
	fallbackEmoji = '📦',
	onDragStart,
	onDragEnd
}) => {
	const [isDragging, setIsDragging] = useState(false)
	const itemRef = useRef<HTMLDivElement>(null)

	const handleDragStart = (e: React.DragEvent) => {
		setIsDragging(true)
		
		// Create a custom drag image
		const dragImage = document.createElement('div')
		dragImage.className = styles.dragImage
		
		// Clone the ItemTexture for the drag image
		const textureClone = document.createElement('div')
		textureClone.className = styles.itemTexture
		textureClone.style.backgroundImage = itemRef.current?.querySelector(`.${styles.itemTexture}`)?.style.backgroundImage || ''
		textureClone.style.backgroundPosition = itemRef.current?.querySelector(`.${styles.itemTexture}`)?.style.backgroundPosition || ''
		textureClone.style.backgroundSize = 'auto'
		textureClone.style.width = '64px'
		textureClone.style.height = '64px'
		textureClone.style.backgroundRepeat = 'no-repeat'
		
		dragImage.appendChild(textureClone)
		document.body.appendChild(dragImage)
		
		// Set the drag image
		e.dataTransfer.setDragImage(dragImage, 32, 32)
		
		// Clean up the drag image after a short delay
		setTimeout(() => {
			document.body.removeChild(dragImage)
		}, 0)
		
		onDragStart(e, itemId, position)
	}

	const handleDragEnd = (e: React.DragEvent) => {
		setIsDragging(false)
		onDragEnd(e)
	}

	return (
		<div 
			ref={itemRef}
			className={`${styles.inventoryItem} ${isDragging ? styles.dragging : ''} ${className}`}
			draggable={true}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
		>
			<ItemTexture 
				itemType={itemType}
				className={styles.itemTexture}
				fallbackEmoji={fallbackEmoji}
				draggable={false}
			/>
		</div>
	)
} 