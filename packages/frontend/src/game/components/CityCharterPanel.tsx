import { useEffect, useMemo, useState } from 'react'
import { EventBus } from '../EventBus'
import { cityCharterService } from '../services/CityCharterService'
import { buildingService } from '../services/BuildingService'
import { itemService } from '../services/ItemService'
import type { CityCharterRequirementStatus, CityCharterStateData } from '@rugged/game'
import { UiEvents } from '../uiEvents'
import styles from './CityCharterPanel.module.css'

type CityCharterPanelProps = {
	isVisible: boolean
	onClose?: () => void
	anchorRect?: DOMRect | null
}

const formatRequirementLabel = (label: string, met: boolean) => {
	return (
		<span className={`${styles.requirementValue} ${met ? styles.requirementMet : styles.requirementUnmet}`}>
			{label}
		</span>
	)
}

const renderRequirements = (requirements?: CityCharterRequirementStatus) => {
	if (!requirements) {
		return <div className={styles.emptyState}>No requirements.</div>
	}

	const rows: JSX.Element[] = []

	if (requirements.population) {
		rows.push(
			<div key="population" className={styles.requirementRow}>
				<span className={styles.requirementLabel}>
					Population
				</span>
				{formatRequirementLabel(
					`${requirements.population.current}/${requirements.population.required}`,
					requirements.population.met
				)}
			</div>
		)
	}

	if (requirements.buildings && requirements.buildings.length > 0) {
		requirements.buildings.forEach((entry) => {
			const buildingName =
				buildingService.getBuildingDefinition(entry.buildingId)?.name || entry.buildingId
			rows.push(
				<div key={`building-${entry.buildingId}`} className={styles.requirementRow}>
					<span className={styles.requirementLabel}>
						{buildingName}
					</span>
					{formatRequirementLabel(`${entry.current}/${entry.required}`, entry.met)}
				</div>
			)
		})
	}

	if (requirements.resources && requirements.resources.length > 0) {
		requirements.resources.forEach((entry) => {
			const metadata = itemService.getItemType(entry.itemType)
			const label = metadata?.name || entry.itemType
			rows.push(
				<div key={`resource-${entry.itemType}`} className={styles.requirementRow}>
					<span className={styles.requirementLabel}>
						{metadata?.emoji ? `${metadata.emoji} ${label}` : label}
					</span>
					{formatRequirementLabel(`${entry.current}/${entry.required}`, entry.met)}
				</div>
			)
		})
	}

	if (rows.length === 0) {
		return <div className={styles.emptyState}>No requirements.</div>
	}

	return <div className={styles.requirements}>{rows}</div>
}

export const CityCharterPanel = ({ isVisible, onClose, anchorRect }: CityCharterPanelProps) => {
	const [state, setState] = useState<CityCharterStateData | null>(
		cityCharterService.getState()
	)

	useEffect(() => {
		const handleUpdate = (data: CityCharterStateData) => {
			setState(data)
		}

		EventBus.on(UiEvents.CityCharter.Updated, handleUpdate)
		cityCharterService.requestState()

		return () => {
			EventBus.off(UiEvents.CityCharter.Updated, handleUpdate)
		}
	}, [])

	const panelStyle = anchorRect
		? {
			left: anchorRect.left + anchorRect.width / 2,
			top: 'calc(var(--top-bar-height, 64px) + var(--spacing-md))',
			transform: 'translateX(-50%)'
		}
		: undefined

	const hasNextTier = Boolean(state?.nextTier)
	const unlockFlags = useMemo(() => state?.currentTier?.unlockFlags || [], [state])
	const buffs = useMemo(() => state?.currentTier?.buffs || [], [state])

	if (!isVisible) {
		return null
	}

	return (
		<div className={styles.panel} style={panelStyle}>
			<div className={styles.header}>
				<h3>City Charter</h3>
				<button className={styles.closeButton} onClick={onClose} type="button" aria-label="Close city charter panel">
					×
				</button>
			</div>

			<div className={styles.content}>
				{!state ? (
					<div className={styles.emptyState}>Loading charter...</div>
				) : (
					<>
						<div className={styles.section}>
							<div className={styles.sectionTitle}>Current Tier</div>
							<div className={styles.tierName}>
								{state.currentTier.name} (Level {state.currentTier.level ?? 0})
							</div>
							<div className={styles.statusRow}>
								<span className={styles.statusLabel}>Buffs</span>
								<span
									className={styles.statusPill}
									data-warning={!state.currentTierRequirementsMet}
								>
									{state.currentTierRequirementsMet ? 'Active' : 'Inactive'}
								</span>
							</div>
							{renderRequirements(state.currentRequirements)}
						</div>

						<div className={styles.section}>
							<div className={styles.sectionTitle}>Unlocks</div>
							{unlockFlags.length === 0 ? (
								<div className={styles.emptyState}>None yet.</div>
							) : (
								<div className={styles.badgeList}>
									{unlockFlags.map(flag => (
										<span key={flag} className={styles.badge}>
											{flag}
										</span>
									))}
								</div>
							)}
						</div>

						<div className={styles.section}>
							<div className={styles.sectionTitle}>Buffs</div>
							{buffs.length === 0 ? (
								<div className={styles.emptyState}>None yet.</div>
							) : (
								<div className={styles.badgeList}>
									{buffs.map(buff => (
										<span key={buff.id} className={styles.badge}>
											{buff.id}
										</span>
									))}
								</div>
							)}
						</div>

						<div className={styles.section}>
							<div className={styles.sectionTitle}>Next Tier</div>
							{!hasNextTier ? (
								<div className={styles.emptyState}>No further tiers.</div>
							) : (
								<>
									<div className={styles.tierName}>
										{state.nextTier?.name} (Level {state.nextTier?.level ?? 0})
									</div>
									<div className={styles.statusRow}>
										<span className={styles.statusLabel}>Status</span>
										<span
											className={styles.statusPill}
											data-warning={!state.isEligibleForNext}
										>
											{state.isEligibleForNext ? 'Claimable' : 'Not ready'}
										</span>
									</div>
									{renderRequirements(state.nextRequirements)}
									<button
										type="button"
										className={styles.claimButton}
										onClick={() => cityCharterService.claimNextTier()}
										disabled={!state.isEligibleForNext}
									>
										Claim Charter
									</button>
								</>
							)}
						</div>
					</>
				)}
			</div>
		</div>
	)
}
