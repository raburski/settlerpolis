import React, { useEffect, useMemo, useState } from 'react'
import { itemService } from '../services/ItemService'
import styles from './ResourceNodePanel.module.css'

type ResourceNodePopoverProps = {
	anchor: { x: number; y: number }
	data?: {
		nodeType?: string
		itemType?: string
		remainingHarvests?: number
	}
	state?: 'enter' | 'exit'
	exitOffset?: { x: number; y: number }
}

const NODE_LABELS: Record<string, string> = {
	stone_deposit: 'Stone Deposit'
}

export const ResourceNodePopover: React.FC<ResourceNodePopoverProps> = ({
	anchor,
	data,
	state = 'enter',
	exitOffset
}) => {
	const [emoji, setEmoji] = useState<string>('🪨')

	useEffect(() => {
		if (!data?.itemType) return
		const metadata = itemService.getItemType(data.itemType)
		if (metadata?.emoji) {
			setEmoji(metadata.emoji)
		}
		const unsubscribe = itemService.subscribeToItemMetadata(data.itemType, (meta) => {
			if (meta?.emoji) {
				setEmoji(meta.emoji)
			}
		})
		return unsubscribe
	}, [data?.itemType])

	const label = useMemo(() => {
		if (!data?.nodeType) return 'Resource Node'
		return NODE_LABELS[data.nodeType] || 'Resource Node'
	}, [data?.nodeType])

	const remaining = Number.isFinite(data?.remainingHarvests)
		? Math.max(0, Number(data?.remainingHarvests))
		: '—'

	const panelStyle: React.CSSProperties = {
		left: anchor.x,
		top: anchor.y,
		'--exit-x': `${exitOffset?.x ?? 0}px`,
		'--exit-y': `${exitOffset?.y ?? 0}px`
	}

	return (
		<div className={styles.panel} style={panelStyle} data-state={state}>
			<div className={styles.title}>
				<span className={styles.emoji}>{emoji}</span>
				<span>{label}</span>
			</div>
			<div className={styles.row}>
				<span className={styles.label}>Remaining</span>
				<span className={styles.value}>{remaining}</span>
			</div>
		</div>
	)
}
