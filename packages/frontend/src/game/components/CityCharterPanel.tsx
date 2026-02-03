import { useEffect, useMemo, useState } from 'react'
import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import { cityCharterService } from '../services/CityCharterService'
import { buildingService } from '../services/BuildingService'
import type { BuildingDefinition, CityCharterStateData, CityCharterTier } from '@rugged/game'
import { UiEvents } from '../uiEvents'
import styles from './CityCharterPanel.module.css'

type CityCharterPanelProps = {
	isVisible: boolean
	onClose?: () => void
	anchorRect?: DOMRect | null
}

const resolveTierUnlocks = (
	tier: CityCharterTier | undefined,
	buildings: BuildingDefinition[]
) => {
	if (!tier?.unlockFlags || tier.unlockFlags.length === 0) {
		return []
	}
	return buildings.filter((building) =>
		building.unlockFlags?.some((flag) => tier.unlockFlags?.includes(flag))
	)
}

const formatBuffValue = (value: number | undefined) => {
	if (typeof value !== 'number' || Number.isNaN(value)) {
		return null
	}
	const sign = value > 0 ? '+' : value < 0 ? '' : ''
	if (Math.abs(value) < 1) {
		return `${sign}${Math.round(value * 100)}%`
	}
	return `${sign}${value}%`
}

export const CityCharterPanel = ({ isVisible, onClose, anchorRect }: CityCharterPanelProps) => {
	const [state, setState] = useState<CityCharterStateData | null>(
		cityCharterService.getState()
	)
	const [buildingDefinitions, setBuildingDefinitions] = useState<BuildingDefinition[]>(
		buildingService.getAllBuildingDefinitions()
	)

	useEffect(() => {
		const handleUpdate = (data: CityCharterStateData) => {
			setState(data)
		}

		EventBus.on(UiEvents.CityCharter.Updated, handleUpdate)
		cityCharterService.requestState()

		const handleCatalog = (data: { buildings: BuildingDefinition[] }) => {
			if (Array.isArray(data?.buildings) && data.buildings.length > 0) {
				setBuildingDefinitions(data.buildings)
			}
		}

		EventBus.on(Event.Buildings.SC.Catalog, handleCatalog)

		return () => {
			EventBus.off(UiEvents.CityCharter.Updated, handleUpdate)
			EventBus.off(Event.Buildings.SC.Catalog, handleCatalog)
		}
	}, [])

	const panelStyle = anchorRect
		? {
			left: anchorRect.left + anchorRect.width / 2,
			top: 'calc(var(--top-bar-height, 64px) + var(--spacing-md))',
			transform: 'translateX(-50%)'
		}
		: undefined

	const currentUnlocks = useMemo(
		() => resolveTierUnlocks(state?.currentTier, buildingDefinitions),
		[state?.currentTier, buildingDefinitions]
	)
	const nextUnlocks = useMemo(
		() => resolveTierUnlocks(state?.nextTier, buildingDefinitions),
		[state?.nextTier, buildingDefinitions]
	)
	const currentBuffs = state?.currentTier?.buffs || []
	const nextBuffs = state?.nextTier?.buffs || []

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
						<div className={styles.panelGrid}>
							<div className={`${styles.tierPanel} ${styles.currentPanel}`}>
								<div className={styles.panelLabel}>Current Tier</div>
								<div className={styles.panelName}>{state.currentTier.name}</div>
								<div className={styles.panelSection}>
									<div className={styles.sectionTitle}>Unlocks</div>
									{currentUnlocks.length === 0 ? (
										<div className={styles.emptyState}>None yet.</div>
									) : (
										<div className={styles.unlockGrid}>
											{currentUnlocks.map((entry) => (
												<div key={entry.id} className={styles.unlockTile} title={entry.name}>
													<span className={styles.unlockIcon}>{entry.icon || '?'}</span>
													<span className={styles.unlockName}>{entry.name}</span>
												</div>
											))}
										</div>
									)}
								</div>
								<div className={styles.panelSection}>
									<div className={styles.sectionTitle}>Buffs</div>
									{currentBuffs.length === 0 ? (
										<div className={styles.emptyState}>None yet.</div>
									) : (
										<ul className={styles.buffList}>
											{currentBuffs.map((buff) => {
												const label = buff.description || buff.id
												const value = formatBuffValue(buff.value)
												return (
													<li key={buff.id} className={styles.buffItem}>
														<span>{label}</span>
														{value ? <span className={styles.buffValue}>{value}</span> : null}
													</li>
												)
											})}
										</ul>
									)}
								</div>
							</div>

							<div className={styles.panelArrow} aria-hidden="true">
								<span>→</span>
							</div>
							<div
								className={styles.tierPanel}
								data-claimable={state.isEligibleForNext && Boolean(state.nextTier)}
							>
								<div className={styles.panelLabel}>Next Tier</div>
								<div className={styles.panelName}>{state.nextTier?.name ?? '—'}</div>
								<div className={styles.panelSection}>
									<div className={styles.sectionTitle}>Unlocks</div>
									{state.nextTier ? (
										nextUnlocks.length === 0 ? (
											<div className={styles.emptyState}>None yet.</div>
										) : (
											<div className={styles.unlockGrid}>
												{nextUnlocks.map((entry) => (
													<div key={entry.id} className={styles.unlockTile} title={entry.name}>
														<span className={styles.unlockIcon}>{entry.icon || '?'}</span>
														<span className={styles.unlockName}>{entry.name}</span>
													</div>
												))}
											</div>
										)
									) : (
										<div className={styles.emptyState}>No further tiers.</div>
									)}
								</div>
								<div className={styles.panelSection}>
									<div className={styles.sectionTitle}>Buffs</div>
									{state.nextTier ? (
										nextBuffs.length === 0 ? (
											<div className={styles.emptyState}>None yet.</div>
										) : (
											<ul className={styles.buffList}>
												{nextBuffs.map((buff) => {
													const label = buff.description || buff.id
													const value = formatBuffValue(buff.value)
													return (
														<li key={buff.id} className={styles.buffItem}>
															<span>{label}</span>
															{value ? (
																<span className={styles.buffValue}>{value}</span>
															) : null}
														</li>
													)
												})}
											</ul>
										)
									) : (
										<div className={styles.emptyState}>No further tiers.</div>
									)}
								</div>
								<div className={styles.panelSection}>
									{state.nextTier ? (
										<button
											type="button"
											className={styles.claimButton}
											onClick={() => cityCharterService.claimNextTier()}
											disabled={!state.isEligibleForNext}
										>
											Claim Charter
										</button>
									) : null}
								</div>
							</div>
						</div>
					</>
				)}
			</div>
		</div>
	)
}
