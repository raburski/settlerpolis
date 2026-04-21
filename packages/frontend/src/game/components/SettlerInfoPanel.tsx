import React, { useEffect, useRef, useState } from 'react'
import { EventBus } from '../EventBus'
import { ProfessionType, Settler, SettlerState, WorkProviderType } from '@rugged/game'
import { populationService } from '../services/PopulationService'
import { buildingService } from '../services/BuildingService'
import { itemService } from '../services/ItemService'
import { UiEvents } from '../uiEvents'
import { HoverPopover } from './HoverPopover'
import { ProgressBarRow } from './ProgressBarRow'
import styles from './SettlerInfoPanel.module.css'

const NEED_URGENT_THRESHOLD = 0.35
const NEED_CRITICAL_THRESHOLD = 0.15

const socialVenueTypes = ['entertainment', 'worship', 'culture_science', 'civic'] as const

type SocialVenueType = (typeof socialVenueTypes)[number]

type StatusTone = 'idle' | 'moving' | 'working' | 'warning' | 'error' | 'neutral'

type ProviderMeta = {
	label: string
	icon: string
}

const socialVenueLabels: Record<SocialVenueType, string> = {
	entertainment: 'Entertainment',
	worship: 'Worship',
	culture_science: 'Culture/Science',
	civic: 'Civic'
}

const professionLabels: Record<ProfessionType, string> = {
	[ProfessionType.Carrier]: 'Carrier',
	[ProfessionType.Builder]: 'Builder',
	[ProfessionType.Prospector]: 'Prospector',
	[ProfessionType.Woodcutter]: 'Woodcutter',
	[ProfessionType.Miner]: 'Miner',
	[ProfessionType.Metallurgist]: 'Metallurgist',
	[ProfessionType.Farmer]: 'Farmer',
	[ProfessionType.Fisher]: 'Fisher',
	[ProfessionType.Miller]: 'Miller',
	[ProfessionType.Baker]: 'Baker',
	[ProfessionType.Vendor]: 'Vendor',
	[ProfessionType.Hunter]: 'Hunter'
}

const professionIcons: Record<ProfessionType, string> = {
	[ProfessionType.Carrier]: '👤',
	[ProfessionType.Builder]: '🔨',
	[ProfessionType.Prospector]: '🧭',
	[ProfessionType.Woodcutter]: '🪓',
	[ProfessionType.Miner]: '⛏️',
	[ProfessionType.Metallurgist]: '⚒️',
	[ProfessionType.Farmer]: '🌾',
	[ProfessionType.Fisher]: '🎣',
	[ProfessionType.Miller]: '🌬️',
	[ProfessionType.Baker]: '🥖',
	[ProfessionType.Vendor]: '🛍️',
	[ProfessionType.Hunter]: '🏹'
}

const providerMeta: Record<WorkProviderType, ProviderMeta> = {
	[WorkProviderType.Building]: { label: 'Building Work', icon: '🏢' },
	[WorkProviderType.Construction]: { label: 'Construction', icon: '🏗️' },
	[WorkProviderType.Road]: { label: 'Road Work', icon: '🛣️' },
	[WorkProviderType.Logistics]: { label: 'Logistics', icon: '📦' },
	[WorkProviderType.Prospecting]: { label: 'Prospecting', icon: '🧭' },
	[WorkProviderType.Social]: { label: 'Social Visit', icon: '🎭' },
	[WorkProviderType.NightRest]: { label: 'Night Rest', icon: '🌙' }
}

const hashToUnit = (seed: string): number => {
	let hash = 2166136261
	for (let i = 0; i < seed.length; i += 1) {
		hash ^= seed.charCodeAt(i)
		hash = Math.imul(hash, 16777619)
	}
	const normalized = (hash >>> 0) / 4294967295
	return Number.isFinite(normalized) ? normalized : 0
}

const getSocialPreferenceWeight = (settlerId: string, venueType: SocialVenueType): number => {
	const unit = hashToUnit(`${settlerId}:pref:${venueType}`)
	return 0.35 + unit * 0.65
}

const clampUnit = (value: number | undefined): number => {
	if (typeof value !== 'number' || Number.isNaN(value)) {
		return 0
	}
	return Math.max(0, Math.min(1, value))
}

const formatToken = (value?: string): string => {
	if (!value) {
		return 'Unknown'
	}
	const normalized = value.replace(/_/g, ' ').trim()
	if (!normalized) {
		return 'Unknown'
	}
	return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

const getStateLabel = (state: SettlerState): string => {
	switch (state) {
		case SettlerState.Idle:
			return 'Idle'
		case SettlerState.Spawned:
			return 'Spawned'
		case SettlerState.Assigned:
			return 'Assigned'
		case SettlerState.Moving:
			return 'Moving'
		case SettlerState.MovingToTool:
			return 'Moving to tool'
		case SettlerState.MovingToBuilding:
			return 'Moving to building'
		case SettlerState.Working:
			return 'Working'
		case SettlerState.WaitingForWork:
			return 'Waiting for work'
		case SettlerState.Packing:
			return 'Packing'
		case SettlerState.Unpacking:
			return 'Unpacking'
		case SettlerState.MovingToItem:
			return 'Moving to item'
		case SettlerState.MovingToResource:
			return 'Moving to resource'
		case SettlerState.MovingHome:
			return 'Going home'
		case SettlerState.Harvesting:
			return 'Harvesting'
		case SettlerState.Prospecting:
			return 'Prospecting'
		case SettlerState.CarryingItem:
			return 'Delivering'
		case SettlerState.AssignmentFailed:
			return 'Assignment failed'
		default:
			return 'Unknown'
	}
}

const getStatusTone = (state: SettlerState, waitReason?: string): StatusTone => {
	if (state === SettlerState.AssignmentFailed) {
		return 'error'
	}
	if (waitReason || state === SettlerState.WaitingForWork) {
		return 'warning'
	}
	if (state === SettlerState.Idle || state === SettlerState.Spawned) {
		return 'idle'
	}
	if (
		state === SettlerState.Moving ||
		state === SettlerState.MovingToBuilding ||
		state === SettlerState.MovingToTool ||
		state === SettlerState.MovingToItem ||
		state === SettlerState.MovingToResource ||
		state === SettlerState.MovingHome ||
		state === SettlerState.CarryingItem
	) {
		return 'moving'
	}
	if (state === SettlerState.Working || state === SettlerState.Harvesting || state === SettlerState.Prospecting) {
		return 'working'
	}
	return 'neutral'
}

const getMeterLevel = (value: number): 'healthy' | 'urgent' | 'critical' => {
	if (value <= NEED_CRITICAL_THRESHOLD) {
		return 'critical'
	}
	if (value <= NEED_URGENT_THRESHOLD) {
		return 'urgent'
	}
	return 'healthy'
}

const ItemStackLabel: React.FC<{ itemType: string; quantity?: number }> = ({ itemType, quantity }) => {
	const [itemName, setItemName] = useState(() => itemService.getItemType(itemType)?.name || itemType)
	const [itemEmoji, setItemEmoji] = useState(() => itemService.getItemType(itemType)?.emoji || '')

	useEffect(() => {
		const meta = itemService.getItemType(itemType)
		if (meta?.name) {
			setItemName(meta.name)
		}
		if (meta?.emoji) {
			setItemEmoji(meta.emoji)
		}

		const unsubscribe = itemService.subscribeToItemMetadata(itemType, (nextMeta) => {
			if (nextMeta?.name) {
				setItemName(nextMeta.name)
			}
			if (nextMeta?.emoji) {
				setItemEmoji(nextMeta.emoji)
			}
		})

		return unsubscribe
	}, [itemType])

	const quantityPrefix = typeof quantity === 'number' && quantity > 0 ? `${quantity}x ` : ''

	return (
		<>
			{quantityPrefix}
			{itemEmoji ? `${itemEmoji} ` : ''}
			{itemName}
		</>
	)
}

const NeedMeterRow: React.FC<{ label: string; value: number }> = ({ label, value }) => {
	const clamped = clampUnit(value)
	const percent = Math.round(clamped * 100)
	const level = getMeterLevel(clamped)

	return (
		<ProgressBarRow
			label={label}
			percent={percent}
			valueLabel={`${percent}%`}
			level={level}
		/>
	)
}

export const SettlerInfoPanel: React.FC = () => {
	const [isVisible, setIsVisible] = useState(false)
	const [settler, setSettler] = useState<Settler | null>(null)
	const selectedSettlerIdRef = useRef<string | null>(null)

	useEffect(() => {
		selectedSettlerIdRef.current = settler?.id ?? null
	}, [settler?.id])

	useEffect(() => {
		const handleSettlerClick = (data: { settlerId: string }) => {
			const previouslySelected = selectedSettlerIdRef.current
			if (previouslySelected && previouslySelected !== data.settlerId) {
				EventBus.emit(UiEvents.Settler.Highlight, { settlerId: previouslySelected, highlighted: false })
			}

			const nextSettler = populationService.getSettler(data.settlerId)
			if (!nextSettler) {
				return
			}

			setSettler(nextSettler)
			setIsVisible(true)
			EventBus.emit(UiEvents.Settler.Highlight, { settlerId: nextSettler.id, highlighted: true })
		}

		const handleSettlerUpdate = (data: { settlerId: string }) => {
			if (selectedSettlerIdRef.current !== data.settlerId) {
				return
			}
			const updated = populationService.getSettler(data.settlerId)
			if (updated) {
				setSettler(updated)
			}
		}

		const handleSettlerDied = (data: { settlerId: string }) => {
			if (selectedSettlerIdRef.current !== data.settlerId) {
				return
			}
			EventBus.emit(UiEvents.Settler.Highlight, { settlerId: data.settlerId, highlighted: false })
			setIsVisible(false)
			setSettler(null)
		}

		const handleClosePanel = () => {
			const selectedId = selectedSettlerIdRef.current
			if (selectedId) {
				EventBus.emit(UiEvents.Settler.Highlight, { settlerId: selectedId, highlighted: false })
			}
			setIsVisible(false)
			setSettler(null)
		}

		EventBus.on(UiEvents.Settler.Click, handleSettlerClick)
		EventBus.on(UiEvents.Population.SettlerUpdated, handleSettlerUpdate)
		EventBus.on(UiEvents.Population.SettlerDied, handleSettlerDied)
		EventBus.on(UiEvents.Settler.Close, handleClosePanel)

		return () => {
			EventBus.off(UiEvents.Settler.Click, handleSettlerClick)
			EventBus.off(UiEvents.Population.SettlerUpdated, handleSettlerUpdate)
			EventBus.off(UiEvents.Population.SettlerDied, handleSettlerDied)
			EventBus.off(UiEvents.Settler.Close, handleClosePanel)
		}
	}, [])

	const handleClose = () => {
		const selectedId = selectedSettlerIdRef.current
		if (selectedId) {
			EventBus.emit(UiEvents.Settler.Highlight, { settlerId: selectedId, highlighted: false })
		}
		setIsVisible(false)
		setSettler(null)
		EventBus.emit(UiEvents.Settler.Close)
	}

	const handleHouseFocus = (houseId: string) => {
		const houseInstance = buildingService.getBuildingInstance(houseId)
		if (!houseInstance) {
			return
		}
		EventBus.emit(UiEvents.Building.Click, { buildingInstanceId: houseInstance.id })
		EventBus.emit(UiEvents.Camera.Focus, {
			x: houseInstance.position.x,
			y: houseInstance.position.y,
			duration: 650,
			mapId: houseInstance.mapId
		})
	}

	const handleWorkplaceFocus = (buildingInstanceId?: string) => {
		if (!buildingInstanceId) {
			return
		}
		const buildingInstance = buildingService.getBuildingInstance(buildingInstanceId)
		if (!buildingInstance) {
			return
		}
		EventBus.emit(UiEvents.Building.Click, { buildingInstanceId: buildingInstance.id })
		EventBus.emit(UiEvents.Camera.Focus, {
			x: buildingInstance.position.x,
			y: buildingInstance.position.y,
			duration: 700,
			mapId: buildingInstance.mapId
		})
	}

	const handleSettlerFocus = () => {
		if (!settler) {
			return
		}
		EventBus.emit(UiEvents.Camera.Focus, {
			x: settler.position.x,
			y: settler.position.y,
			duration: 650,
			mapId: settler.mapId
		})
	}

	if (!isVisible || !settler) {
		return null
	}

	const assignment = populationService.getAssignment(settler.stateContext.assignmentId)
	const assignedBuilding = settler.buildingId ? buildingService.getBuildingInstance(settler.buildingId) : undefined
	const assignedBuildingDef = assignedBuilding ? buildingService.getBuildingDefinition(assignedBuilding.buildingId) : undefined
	const provider = assignment ? providerMeta[assignment.providerType] : null
	const health = clampUnit(settler.health)
	const waitReason = settler.stateContext.waitReason ? formatToken(settler.stateContext.waitReason) : null
	const topSocialPreferences = socialVenueTypes
		.map((venueType) => ({
			venueType,
			label: socialVenueLabels[venueType],
			value: Math.round(getSocialPreferenceWeight(settler.id, venueType) * 100)
		}))
		.sort((a, b) => b.value - a.value)
		.slice(0, 2)

	const statusTone = getStatusTone(settler.state, settler.stateContext.waitReason)
	const statusLabel = getStateLabel(settler.state)

	const issueText = settler.state === SettlerState.AssignmentFailed
		? 'Assignment failed. This settler will return to idle and retry shortly.'
		: waitReason
			? `Blocked: ${waitReason}.`
			: null

	let summaryText = `${statusLabel}.`
	if (settler.state === SettlerState.Idle || settler.state === SettlerState.Spawned) {
		summaryText = 'Available for a new assignment.'
	} else if (settler.state === SettlerState.AssignmentFailed) {
		summaryText = 'Could not secure a workable task.'
	} else if (waitReason) {
		summaryText = `Waiting: ${waitReason}.`
	} else if (settler.state === SettlerState.CarryingItem && settler.stateContext.carryingItemType) {
		summaryText = 'Transporting goods to a destination.'
	} else if (settler.state === SettlerState.MovingHome) {
		summaryText = 'Returning home.'
	} else if (assignedBuildingDef?.name && provider?.label) {
		summaryText = `${provider.label} at ${assignedBuildingDef.name}.`
	} else if (assignedBuildingDef?.name) {
		summaryText = `Working at ${assignedBuildingDef.name}.`
	} else if (provider?.label) {
		summaryText = `${provider.label} in progress.`
	}

	return (
		<div className={styles.panel}>
			<div className={styles.header}>
				<div className={styles.titleWrap}>
					<span className={styles.titleIcon}>{professionIcons[settler.profession]}</span>
					<div>
						<h3 className={styles.title}>{professionLabels[settler.profession]}</h3>
					</div>
				</div>
				<div className={styles.headerActions}>
					<button
						type="button"
						className={styles.headerIconButton}
						onClick={handleSettlerFocus}
						aria-label="Focus settler"
						title="Focus settler"
					>
						🎯
					</button>
					<span className={styles.headerActionDivider} aria-hidden="true" />
					<button
						type="button"
						className={styles.closeButton}
						onClick={handleClose}
						aria-label="Close settler panel"
					>
						×
					</button>
				</div>
			</div>

			<div className={styles.content}>
				<section className={styles.section}>
					<div className={styles.sectionHeaderRow}>
						<div className={styles.sectionTitle}>Now</div>
						<HoverPopover content={summaryText}>
							<span className={styles.statusBadge} data-tone={statusTone}>{statusLabel}</span>
						</HoverPopover>
					</div>
				</section>

				<section className={styles.section}>
					<div className={styles.sectionTitle}>Wellbeing</div>
					<NeedMeterRow label="Hunger" value={clampUnit(settler.needs?.hunger)} />
					<NeedMeterRow label="Fatigue" value={clampUnit(settler.needs?.fatigue)} />
					<NeedMeterRow label="Health" value={health} />
				</section>

				<section className={styles.section}>
					<div className={styles.sectionTitle}>Work</div>
					<div className={styles.infoRow}>
						<span className={styles.rowLabel}>Profession</span>
						<span className={styles.rowValue}>{professionLabels[settler.profession]}</span>
					</div>
					<div className={styles.infoRow}>
						<span className={styles.rowLabel}>Assignment</span>
						<span className={styles.rowValue}>
							{provider ? `${provider.icon} ${provider.label}` : 'Unassigned'}
						</span>
					</div>
					{assignment && (
						<div className={styles.infoRow}>
							<span className={styles.rowLabel}>Assignment status</span>
							<span className={styles.rowValue}>{formatToken(assignment.status)}</span>
						</div>
					)}
					{assignedBuildingDef && assignedBuilding && (
						<div className={styles.infoRow}>
							<span className={styles.rowLabel}>Workplace</span>
							<span className={styles.rowValueGroup}>
								<span className={styles.rowValue}>{assignedBuildingDef.name}</span>
								<button
									type="button"
									className={styles.iconButton}
									onClick={() => handleWorkplaceFocus(assignedBuilding.id)}
									aria-label="Focus workplace"
									title="Focus workplace"
								>
									🎯
								</button>
							</span>
						</div>
					)}
					{settler.stateContext.equippedItemType && (
						<div className={styles.infoRow}>
							<span className={styles.rowLabel}>Equipped</span>
							<span className={styles.rowValue}>
								<ItemStackLabel
									itemType={settler.stateContext.equippedItemType}
									quantity={settler.stateContext.equippedQuantity}
								/>
							</span>
						</div>
					)}
					{settler.stateContext.carryingItemType && (
						<div className={styles.infoRow}>
							<span className={styles.rowLabel}>Carrying</span>
							<span className={styles.rowValue}>
								<ItemStackLabel
									itemType={settler.stateContext.carryingItemType}
									quantity={settler.stateContext.carryingQuantity}
								/>
							</span>
						</div>
					)}
				</section>

				<section className={styles.section}>
					<div className={styles.sectionTitle}>Home & Life</div>
					<div className={styles.infoRow}>
						<span className={styles.rowLabel}>Home</span>
						{settler.houseId ? (
							<span className={styles.rowValueGroup}>
								<span className={styles.rowValue}>Assigned</span>
								<button
									type="button"
									className={styles.iconButton}
									onClick={() => handleHouseFocus(settler.houseId!)}
									aria-label="Focus house"
									title="Focus house"
								>
									🏠
								</button>
							</span>
						) : (
							<span className={styles.rowValue}>No house assigned</span>
						)}
					</div>
					<div className={styles.infoRow}>
						<span className={styles.rowLabel}>Social preferences</span>
						<div className={styles.chips}>
							{topSocialPreferences.map((entry) => (
								<span key={entry.venueType} className={styles.chip}>
									{entry.label}: {entry.value}%
								</span>
							))}
						</div>
					</div>
				</section>

				{issueText && (
					<section className={styles.section}>
						<div className={styles.sectionTitle}>Blocked / Issue</div>
						<div className={styles.issueBox}>{issueText}</div>
					</section>
				)}

				<details className={styles.debugSection}>
					<summary className={styles.debugSummary}>Debug details</summary>
					<div className={styles.debugRows}>
						<div className={styles.infoRow}>
							<span className={styles.rowLabel}>Settler id</span>
							<span className={styles.rowValue}>{settler.id}</span>
						</div>
						<div className={styles.infoRow}>
							<span className={styles.rowLabel}>Position</span>
							<span className={styles.rowValue}>
								{Math.round(settler.position.x)}, {Math.round(settler.position.y)}
							</span>
						</div>
						{settler.stateContext.lastStepType && (
							<div className={styles.infoRow}>
								<span className={styles.rowLabel}>Last step</span>
								<span className={styles.rowValue}>{formatToken(settler.stateContext.lastStepType)}</span>
							</div>
						)}
						{settler.stateContext.lastStepReason && (
							<div className={styles.infoRow}>
								<span className={styles.rowLabel}>Step reason</span>
								<span className={styles.rowValue}>{formatToken(settler.stateContext.lastStepReason)}</span>
							</div>
						)}
						{settler.stateContext.targetType && (
							<div className={styles.infoRow}>
								<span className={styles.rowLabel}>Target type</span>
								<span className={styles.rowValue}>{formatToken(settler.stateContext.targetType)}</span>
							</div>
						)}
						{settler.stateContext.targetId && (
							<div className={styles.infoRow}>
								<span className={styles.rowLabel}>Target id</span>
								<span className={styles.rowValue}>{settler.stateContext.targetId}</span>
							</div>
						)}
						{settler.stateContext.assignmentId && (
							<div className={styles.infoRow}>
								<span className={styles.rowLabel}>Assignment id</span>
								<span className={styles.rowValue}>{settler.stateContext.assignmentId}</span>
							</div>
						)}
						{settler.stateContext.providerId && (
							<div className={styles.infoRow}>
								<span className={styles.rowLabel}>Provider id</span>
								<span className={styles.rowValue}>{settler.stateContext.providerId}</span>
							</div>
						)}
					</div>
				</details>
			</div>
		</div>
	)
}
