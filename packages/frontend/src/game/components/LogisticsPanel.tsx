import React, { useEffect, useMemo, useState } from 'react'
import { EventBus } from '../EventBus'
import { logisticsService } from '../services/LogisticsService'
import { buildingService } from '../services/BuildingService'
import type { LogisticsRequest } from '@rugged/game/Settlers/WorkProvider/types'
import styles from './LogisticsPanel.module.css'

type LogisticsPanelProps = {
	isVisible: boolean
	anchorRect?: DOMRect | null
	offsetX?: number
}

const formatBuildingLabel = (buildingInstanceId: string): string => {
	const building = buildingService.getBuildingInstance(buildingInstanceId)
	if (!building) {
		return buildingInstanceId.slice(0, 6)
	}
	const definition = buildingService.getBuildingDefinition(building.buildingId)
	return definition?.name || building.buildingId
}

export const LogisticsPanel: React.FC<LogisticsPanelProps> = ({ isVisible, anchorRect, offsetX = 0 }) => {
	const [requests, setRequests] = useState<LogisticsRequest[]>(logisticsService.getRequests())

	useEffect(() => {
		const handleUpdated = (data: LogisticsRequest[]) => {
			setRequests(data || [])
		}

		EventBus.on('ui:logistics:updated', handleUpdated)

		return () => {
			EventBus.off('ui:logistics:updated', handleUpdated)
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
					sortedRequests.map((request) => (
						<div key={request.id} className={styles.request}>
							<div className={styles.row}>
								<span className={styles.label}>Building</span>
								<span className={styles.value}>{formatBuildingLabel(request.buildingInstanceId)}</span>
							</div>
							<div className={styles.row}>
								<span className={styles.label}>Type</span>
								<span className={styles.value}>{request.type}</span>
							</div>
							<div className={styles.row}>
								<span className={styles.label}>Item</span>
								<span className={styles.value}>{request.itemType}</span>
							</div>
							<div className={styles.row}>
								<span className={styles.label}>Qty</span>
								<span className={styles.value}>{request.quantity}</span>
							</div>
							<div className={styles.row}>
								<span className={styles.label}>Priority</span>
								<span className={styles.value}>{request.priority}</span>
							</div>
						</div>
					))
				)}
			</div>
		</div>
	)
}
