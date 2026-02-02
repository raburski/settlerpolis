import React, { useEffect, useMemo, useState } from 'react'
import { EventBus } from '../EventBus'
import { logisticsService } from '../services/LogisticsService'
import { buildingService } from '../services/BuildingService'
import { itemService } from '../services/ItemService'
import type { LogisticsRequest } from '@rugged/game/Settlers/WorkProvider/types'
import { LogisticsRequestType } from '@rugged/game/Settlers/WorkProvider/types'
import styles from './LogisticsPanel.module.css'
import { UiEvents } from '../uiEvents'

type LogisticsPanelProps = {
	isVisible: boolean
	anchorRect?: DOMRect | null
	offsetX?: number
}

const getBuildingMeta = (buildingInstanceId: string): { name: string, icon: string } => {
	const building = buildingService.getBuildingInstance(buildingInstanceId)
	if (!building) {
		return { name: buildingInstanceId.slice(0, 6), icon: '🏗️' }
	}
	const definition = buildingService.getBuildingDefinition(building.buildingId)
	return {
		name: definition?.name || building.buildingId,
		icon: definition?.icon || '🏗️'
	}
}

const ItemIcon: React.FC<{ itemType: string }> = ({ itemType }) => {
	const [emoji, setEmoji] = useState(() => itemService.getItemType(itemType)?.emoji || '📦')

	useEffect(() => {
		const meta = itemService.getItemType(itemType)
		if (meta?.emoji) {
			setEmoji(meta.emoji)
		}
		const unsubscribe = itemService.subscribeToItemMetadata(itemType, (data) => {
			if (data?.emoji) {
				setEmoji(data.emoji)
			}
		})
		return unsubscribe
	}, [itemType])

	return <span className={styles.itemIcon}>{emoji}</span>
}

const ItemLabel: React.FC<{ itemType: string }> = ({ itemType }) => {
	const [label, setLabel] = useState(() => itemService.getItemType(itemType)?.name || itemType)

	useEffect(() => {
		const meta = itemService.getItemType(itemType)
		if (meta?.name) {
			setLabel(meta.name)
		}
		const unsubscribe = itemService.subscribeToItemMetadata(itemType, (data) => {
			if (data?.name) {
				setLabel(data.name)
			}
		})
		return unsubscribe
	}, [itemType])

	return <span className={styles.itemName}>{label}</span>
}

export const LogisticsPanel: React.FC<LogisticsPanelProps> = ({ isVisible, anchorRect, offsetX = 0 }) => {
	const [requests, setRequests] = useState<LogisticsRequest[]>(logisticsService.getRequests())

	useEffect(() => {
		const handleUpdated = (data: LogisticsRequest[]) => {
			setRequests(data || [])
		}

		EventBus.on(UiEvents.Logistics.Updated, handleUpdated)

		return () => {
			EventBus.off(UiEvents.Logistics.Updated, handleUpdated)
		}
	}, [])

	const sortedRequests = useMemo(() => {
		return [...requests].sort((a, b) => {
			if (b.priority !== a.priority) {
				return b.priority - a.priority
			}
			return a.createdAtMs - b.createdAtMs
		})
	}, [requests])

	if (!isVisible) {
		return null
	}

	const panelStyle = anchorRect
		? {
			left: anchorRect.left + anchorRect.width / 2 + offsetX,
			top: 'calc(var(--top-bar-height, 64px) + var(--spacing-md))',
			transform: 'translateX(-50%)'
		}
		: undefined

	return (
		<div className={styles.panel} style={panelStyle}>
			<div className={styles.header}>
				<h3>Logistics</h3>
			</div>

			<div className={styles.content}>
				{sortedRequests.length === 0 ? (
					<div className={styles.empty}>No active requests.</div>
				) : (
					sortedRequests.map((request) => {
						const building = getBuildingMeta(request.buildingInstanceId)
						const arrow = request.type === LogisticsRequestType.Output ? '➡︎' : '⬅︎'
						return (
							<div key={request.id} className={styles.requestCard}>
								<div className={styles.requestMain}>
									<span className={styles.buildingIcon}>{building.icon}</span>
									<span className={styles.buildingName}>{building.name}</span>
									<span className={styles.arrow}>{arrow}</span>
									<ItemIcon itemType={request.itemType} />
									<ItemLabel itemType={request.itemType} />
									<span className={styles.quantity}>x{request.quantity}</span>
								</div>
							</div>
						)
					})
				)}
			</div>
		</div>
	)
}
