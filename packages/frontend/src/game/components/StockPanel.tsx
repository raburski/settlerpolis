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
	anchorRect?: DOMRect | null
}

export const StockPanel: React.FC<StockPanelProps> = ({ isVisible, onClose, anchorRect }) => {
	const resourceTypes = useResourceList()
	const totals = useGlobalStockTotals()

	if (!isVisible || resourceTypes.length === 0) {
		return null
	}

	const panelStyle = anchorRect
		? {
			left: anchorRect.left + anchorRect.width / 2,
			top: 'calc(var(--top-bar-height, 64px) + var(--spacing-md))',
			transform: 'translateX(-50%)'
		}
		: undefined

	return (
		<div className={styles.panel} style={panelStyle}>
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
