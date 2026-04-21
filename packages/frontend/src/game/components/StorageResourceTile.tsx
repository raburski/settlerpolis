import React, { useEffect, useState } from 'react'
import { itemService } from '../services/ItemService'
import styles from './StorageResourceTile.module.css'

interface StorageResourceTileProps {
	itemType: string
	amountText: string
	isComplete?: boolean
	compact?: boolean
	showName?: boolean
}

export const StorageResourceTile: React.FC<StorageResourceTileProps> = ({
	itemType,
	amountText,
	isComplete = false,
	compact = false,
	showName = true
}) => {
	const [itemName, setItemName] = useState(() => itemService.getItemType(itemType)?.name || itemType)
	const [itemEmoji, setItemEmoji] = useState(() => itemService.getItemType(itemType)?.emoji || itemType)

	useEffect(() => {
		const metadata = itemService.getItemType(itemType)
		if (metadata?.name) {
			setItemName(metadata.name)
		}
		if (metadata?.emoji) {
			setItemEmoji(metadata.emoji)
		}

		const unsubscribe = itemService.subscribeToItemMetadata(itemType, (nextMetadata) => {
			if (nextMetadata?.name) {
				setItemName(nextMetadata.name)
			}
			if (nextMetadata?.emoji) {
				setItemEmoji(nextMetadata.emoji)
			}
		})

		return unsubscribe
	}, [itemType])

	return (
		<div className={`${styles.tile} ${compact ? styles.compact : ''}`}>
			<div className={styles.icon}>{itemEmoji}</div>
			<div className={styles.meta}>
				{showName ? <div className={styles.name}>{itemName}</div> : null}
				<div className={`${styles.count} ${isComplete ? styles.countComplete : ''}`}>{amountText}</div>
			</div>
		</div>
	)
}
