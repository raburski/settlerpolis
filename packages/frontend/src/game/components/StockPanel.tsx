import React, { useEffect, useState } from 'react'
import { itemService } from '../services/ItemService'
import { useGlobalStockTotals } from './hooks/useGlobalStockTotals'
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

type StockPanelProps = {
	isVisible: boolean
	onClose?: () => void
}

export const StockPanel: React.FC<StockPanelProps> = ({ isVisible, onClose }) => {
	const resourceTypes = useResourceList()
	const totals = useGlobalStockTotals()

	if (!isVisible || resourceTypes.length === 0) {
		return null
	}

	return (
		<div className={styles.panel}>
			<div className={styles.header}>
				<div className={styles.title}>Global Stock</div>
				<button className={styles.closeButton} onClick={onClose} type="button" aria-label="Close stock panel">
					×
				</button>
			</div>
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
