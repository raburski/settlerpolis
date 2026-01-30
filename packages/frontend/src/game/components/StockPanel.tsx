import React, { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import { itemService } from '../services/ItemService'
import { storageService } from '../services/StorageService'
import { useResourceList } from './hooks/useResourceList'
import styles from './StockPanel.module.css'

const ItemEmoji: React.FC<{ itemType: string }> = ({ itemType }) => {
	const [emoji, setEmoji] = useState<string>(itemType)

	useEffect(() => {
		const metadata = itemService.getItemType(itemType)
		if (metadata?.emoji) {
			setEmoji(metadata.emoji)
		}

		const unsubscribe = itemService.subscribeToItemMetadata(itemType, (data) => {
			if (data?.emoji) {
				setEmoji(data.emoji)
			}
		})

		return unsubscribe
	}, [itemType])

	return <>{emoji}</>
}

export const StockPanel: React.FC = () => {
	const resourceTypes = useResourceList()
	const [totals, setTotals] = useState<Record<string, number>>({})

	const updateTotals = () => {
		const nextTotals: Record<string, number> = {}
		storageService.getAllBuildingStorages().forEach((storage) => {
			Object.entries(storage.items).forEach(([itemType, quantity]) => {
				nextTotals[itemType] = (nextTotals[itemType] || 0) + quantity
			})
		})
		setTotals(nextTotals)
	}

	useEffect(() => {
		updateTotals()
		EventBus.on('ui:storage:updated', updateTotals)

		return () => {
			EventBus.off('ui:storage:updated', updateTotals)
		}
	}, [])

	useEffect(() => {
		if (resourceTypes.length > 0) {
			updateTotals()
		}
	}, [resourceTypes])

	if (resourceTypes.length === 0) {
		return null
	}

	return (
		<div className={styles.panel}>
			<div className={styles.title}>Global Stock</div>
			<div className={styles.list}>
				{resourceTypes.map((itemType) => (
					<div key={itemType} className={styles.row}>
						<span className={styles.item}>
							<ItemEmoji itemType={itemType} />
							<span className={styles.itemName}>{itemType}</span>
						</span>
						<span className={styles.quantity}>{totals[itemType] || 0}</span>
					</div>
				))}
			</div>
		</div>
	)
}
