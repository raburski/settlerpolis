import React, { useEffect, useMemo, useState } from 'react'
import { ConstructionStage, Event, ProfessionType } from '@rugged/game'
import { EventBus } from '../EventBus'
import { itemService } from '../services/ItemService'
import { buildingService } from '../services/BuildingService'
import { populationService } from '../services/PopulationService'
import { UiEvents } from '../uiEvents'
import styles from './ResourceNodePanel.module.css'

type ResourceNodePopoverProps = {
	anchor: { x: number; y: number }
	data?: {
		nodeId?: string
		nodeType?: string
		itemType?: string
		remainingHarvests?: number
		depositDiscovered?: boolean
		depositType?: string | null
		prospectingStatus?: 'queued' | 'in_progress' | null
		prospectingSettlerId?: string | null
		position?: { x: number; y: number }
	}
	state?: 'enter' | 'exit'
	exitOffset?: { x: number; y: number }
}

const NODE_LABELS: Record<string, string> = {
	stone_deposit: 'Stone Deposit',
	resource_deposit: 'Resource Deposit'
}

const DEPOSIT_LABELS: Record<string, string> = {
	coal: 'Coal',
	iron: 'Iron',
	gold: 'Gold',
	stone: 'Stone',
	empty: 'Empty'
}

const MINE_BUILDINGS: Record<string, string> = {
	coal: 'coal_mine',
	iron: 'iron_mine',
	gold: 'gold_mine',
	stone: 'stone_mine'
}

export const ResourceNodePopover: React.FC<ResourceNodePopoverProps> = ({
	anchor,
	data,
	state = 'enter',
	exitOffset
}) => {
	const [emoji, setEmoji] = useState<string>('🪨')
	const [localProspectingStatus, setLocalProspectingStatus] = useState<'queued' | 'in_progress' | null>(
		data?.prospectingStatus ?? null
	)

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

	useEffect(() => {
		setLocalProspectingStatus(data?.prospectingStatus ?? null)
	}, [data?.prospectingStatus])

	const label = useMemo(() => {
		if (!data?.nodeType) return 'Resource Node'
		return NODE_LABELS[data.nodeType] || 'Resource Node'
	}, [data?.nodeType])

	const remaining = Number.isFinite(data?.remainingHarvests)
		? Math.max(0, Number(data?.remainingHarvests))
		: '—'

	const isResourceDeposit = data?.nodeType === 'resource_deposit'
	const depositDiscovered = Boolean(data?.depositDiscovered)
	const depositType = data?.depositType ?? null
	const depositLabel = depositType ? (DEPOSIT_LABELS[depositType] || 'Unknown') : 'Unknown'
	const prospectingStatus = localProspectingStatus ?? null
	const prospectingSettlerId = data?.prospectingSettlerId ?? null
	const canSendProspector = isResourceDeposit && !depositDiscovered && !prospectingStatus
	const showQueuedNote = isResourceDeposit && prospectingStatus === 'queued' && !prospectingSettlerId
	const completedGuildhalls = buildingService
		.getAllBuildingInstances()
		.filter((building) => building.buildingId === 'guildhall' && building.stage === ConstructionStage.Completed)
	const guildhallIds = new Set(completedGuildhalls.map((building) => building.id))
	const assignedProspectors = populationService
		.getSettlers()
		.filter((settler) => settler.profession === ProfessionType.Prospector)
		.filter((settler) => settler.buildingId && guildhallIds.has(settler.buildingId))
	const queueNoteText = assignedProspectors.length === 0
		? 'Assign a prospector to the Guildhall.'
		: 'Waiting for an available prospector.'
	const buildMineId = depositType ? MINE_BUILDINGS[depositType] : undefined
	const buildPosition = data?.position
	const canBuildMine = isResourceDeposit && depositDiscovered && Boolean(buildMineId) && Boolean(buildPosition)
	const sendLabel = prospectingStatus === 'in_progress'
		? 'Prospecting...'
		: prospectingStatus === 'queued'
			? 'Prospector queued'
			: 'Send a prospector'
	const prospectorStatusLabel = prospectingStatus === 'in_progress'
		? (prospectingSettlerId ? `Assigned (${prospectingSettlerId.slice(0, 4)})` : 'Assigned')
		: prospectingStatus === 'queued'
			? 'Queued'
			: 'Idle'

	const panelStyle: React.CSSProperties = {
		left: anchor.x,
		top: anchor.y,
		'--exit-x': `${exitOffset?.x ?? 0}px`,
		'--exit-y': `${exitOffset?.y ?? 0}px`
	}

	const handleSendProspector = () => {
		if (!data?.nodeId) return
		const hasGuildhall = buildingService
			.getAllBuildingInstances()
			.some((building) => building.buildingId === 'guildhall' && building.stage === ConstructionStage.Completed)
		if (!hasGuildhall) {
			EventBus.emit(UiEvents.Notifications.UiNotification, {
				message: 'Build Guildhall to recruit prospectors.',
				type: 'warning'
			})
			return
		}
		setLocalProspectingStatus('queued')
		EventBus.emit(Event.ResourceNodes.CS.RequestProspecting, { nodeId: data.nodeId })
	}

	const handleBuildMine = () => {
		if (!buildMineId || !buildPosition) return
		EventBus.emit(Event.Buildings.CS.Place, {
			buildingId: buildMineId,
			position: {
				x: Math.floor(buildPosition.x),
				y: Math.floor(buildPosition.y)
			},
			rotation: 0,
			resourceNodeId: data?.nodeId
		})
	}

	return (
		<div className={styles.panel} style={panelStyle} data-state={state}>
			<div className={styles.title}>
				<span className={styles.emoji}>{emoji}</span>
				<span>{label}</span>
			</div>
			{isResourceDeposit ? (
				<>
					<div className={styles.row}>
						<span className={styles.label}>Status</span>
						<span className={styles.value}>
							{depositDiscovered ? 'Identified' : 'Unidentified'}
						</span>
					</div>
					<div className={styles.row}>
						<span className={styles.label}>Prospector</span>
						<span className={styles.value}>{prospectorStatusLabel}</span>
					</div>
					{depositDiscovered && (
						<div className={styles.row}>
							<span className={styles.label}>Deposit</span>
							<span className={styles.value}>{depositLabel}</span>
						</div>
					)}
				</>
			) : (
				<div className={styles.row}>
					<span className={styles.label}>Remaining</span>
					<span className={styles.value}>{remaining}</span>
				</div>
			)}
			{isResourceDeposit && (
				<div className={styles.actionRow}>
					{canSendProspector && (
						<button className={styles.actionButton} onClick={handleSendProspector}>
							{sendLabel}
						</button>
					)}
					{!canSendProspector && !depositDiscovered && (
						<button className={styles.actionButton} disabled>
							{sendLabel}
						</button>
					)}
					{canBuildMine && (
						<button className={styles.actionButton} onClick={handleBuildMine}>
							Build mine
						</button>
					)}
					{showQueuedNote && (
						<div className={styles.queueNote}>{queueNoteText}</div>
					)}
					{depositDiscovered && depositType === 'empty' && (
						<div className={styles.emptyNote}>No viable ore found.</div>
					)}
				</div>
			)}
		</div>
	)
}
