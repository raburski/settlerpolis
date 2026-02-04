import { useEffect, useMemo, useRef, useState } from 'react'
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
	const [animationPhase, setAnimationPhase] = useState<'idle' | 'shift'>('idle')
	const [transition, setTransition] = useState<{
		from: CityCharterStateData
		to: CityCharterStateData
	} | null>(null)
	const [buildingDefinitions, setBuildingDefinitions] = useState<BuildingDefinition[]>(
		buildingService.getAllBuildingDefinitions()
	)
	const pendingStateRef = useRef<CityCharterStateData | null>(null)
	const stateRef = useRef<CityCharterStateData | null>(state)
	const animationPhaseRef = useRef<'idle' | 'shift'>(animationPhase)

	useEffect(() => {
		stateRef.current = state
	}, [state])

	useEffect(() => {
		animationPhaseRef.current = animationPhase
	}, [animationPhase])

	useEffect(() => {
		const handleUpdate = (data: CityCharterStateData) => {
			if (!stateRef.current) {
				setState(data)
				return
			}

			const previous = stateRef.current
			const advancedTier =
				previous.nextTier?.id &&
				data.currentTier?.id &&
				data.currentTier.id === previous.nextTier.id
			const prefersReducedMotion =
				typeof window !== 'undefined' &&
				window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
			const isCompactLayout =
				typeof window !== 'undefined' &&
				window.matchMedia?.('(max-width: 760px)')?.matches

			if (advancedTier && !prefersReducedMotion && !isCompactLayout) {
				if (animationPhaseRef.current !== 'idle') {
					pendingStateRef.current = data
					return
				}
				setTransition({ from: previous, to: data })
				setAnimationPhase('shift')
				return
			}

			if (animationPhaseRef.current !== 'idle') {
				pendingStateRef.current = data
				return
			}

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

	useEffect(() => {
		if (animationPhase !== 'shift') {
			return
		}
		if (!transition) {
			return
		}

		const timeout = window.setTimeout(() => {
			const pending = pendingStateRef.current
			if (pending) {
				setState(pending)
				pendingStateRef.current = null
			} else if (transition) {
				setState(transition.to)
			}
			setTransition(null)
			setAnimationPhase('idle')
		}, 520)

		return () => {
			window.clearTimeout(timeout)
		}
	}, [animationPhase, transition])

	const isShiftAnimating = animationPhase === 'shift' && Boolean(transition)
	const displayState = isShiftAnimating ? transition!.from : state
	const futureTier = isShiftAnimating ? transition!.to.nextTier : undefined

	const panelStyle = anchorRect
		? {
			left: anchorRect.left + anchorRect.width / 2,
			top: 'calc(var(--top-bar-height, 64px) + var(--spacing-md))',
			transform: 'translateX(-50%)'
		}
		: undefined

	const currentUnlocks = useMemo(
		() => resolveTierUnlocks(displayState?.currentTier, buildingDefinitions),
		[displayState?.currentTier, buildingDefinitions]
	)
	const nextUnlocks = useMemo(
		() => resolveTierUnlocks(displayState?.nextTier, buildingDefinitions),
		[displayState?.nextTier, buildingDefinitions]
	)
	const futureUnlocks = useMemo(
		() => resolveTierUnlocks(futureTier, buildingDefinitions),
		[futureTier, buildingDefinitions]
	)
	const currentBuffs = displayState?.currentTier?.buffs || []
	const nextBuffs = displayState?.nextTier?.buffs || []
	const futureBuffs = futureTier?.buffs || []
	const nextClaimable = Boolean(displayState?.isEligibleForNext && displayState?.nextTier)
	const futureClaimable = Boolean(transition?.to.isEligibleForNext && futureTier)

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
				{!displayState ? (
					<div className={styles.emptyState}>Loading charter...</div>
				) : (
					<>
						<div
							className={styles.panelGrid}
							data-phase={animationPhase}
						>
							<div className={styles.panelSlide}>
								<div
									className={`${styles.tierPanel} ${styles.currentPanel}`}
								>
									<div className={styles.panelLabel}>Current Tier</div>
									<div className={styles.panelName}>{displayState.currentTier.name}</div>
									<div className={styles.panelSection}>
										<div className={styles.sectionTitle}>Unlocks</div>
										{currentUnlocks.length === 0 ? (
											<div className={styles.emptyState}>None yet.</div>
										) : (
											<div className={styles.unlockGrid}>
												{currentUnlocks.map((entry) => (
													<div
														key={entry.id}
														className={styles.unlockTile}
														title={entry.name}
													>
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
									data-claimable={nextClaimable}
									data-role="next"
								>
									<div className={styles.panelLabel}>Next Tier</div>
									<div className={styles.panelName}>{displayState.nextTier?.name ?? '—'}</div>
									<div className={styles.panelSection}>
										<div className={styles.sectionTitle}>Unlocks</div>
										{displayState.nextTier ? (
											nextUnlocks.length === 0 ? (
												<div className={styles.emptyState}>None yet.</div>
											) : (
												<div className={styles.unlockGrid}>
													{nextUnlocks.map((entry) => (
														<div
															key={entry.id}
															className={styles.unlockTile}
															title={entry.name}
														>
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
										{displayState.nextTier ? (
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
																{value ? <span className={styles.buffValue}>{value}</span> : null}
															</li>
														)
													})}
												</ul>
											)
										) : (
											<div className={styles.emptyState}>No further tiers.</div>
										)}
									</div>
									{displayState.nextTier ? (
										<div className={styles.claimRow}>
											<button
												type="button"
												className={styles.claimButton}
												onClick={() => cityCharterService.claimNextTier()}
												disabled={!displayState.isEligibleForNext}
											>
												Claim Charter
											</button>
										</div>
									) : null}
								</div>

								{isShiftAnimating ? (
									<div
										className={`${styles.tierPanel} ${styles.futurePanel}`}
										data-claimable={futureClaimable}
									>
										<div className={styles.panelLabel}>Next Tier</div>
										<div className={styles.panelName}>{futureTier?.name ?? '—'}</div>
										<div className={styles.panelSection}>
											<div className={styles.sectionTitle}>Unlocks</div>
											{futureTier ? (
												futureUnlocks.length === 0 ? (
													<div className={styles.emptyState}>None yet.</div>
												) : (
													<div className={styles.unlockGrid}>
														{futureUnlocks.map((entry) => (
															<div
																key={entry.id}
																className={styles.unlockTile}
																title={entry.name}
															>
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
											{futureTier ? (
												futureBuffs.length === 0 ? (
													<div className={styles.emptyState}>None yet.</div>
												) : (
													<ul className={styles.buffList}>
														{futureBuffs.map((buff) => {
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
										{futureTier ? (
											<div className={styles.claimRow}>
												<button
													type="button"
													className={styles.claimButton}
													onClick={() => cityCharterService.claimNextTier()}
													disabled={!transition?.to.isEligibleForNext}
												>
													Claim Charter
												</button>
											</div>
										) : null}
									</div>
								) : null}
								{isShiftAnimating ? (
									<div className={`${styles.panelArrow} ${styles.futureArrow}`} aria-hidden="true">
										<span>→</span>
									</div>
								) : null}
							</div>
						</div>
					</>
				)}
			</div>
		</div>
	)
}
