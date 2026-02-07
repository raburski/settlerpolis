import React, { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import { World } from './World'
import { itemService } from '../services/ItemService'
import { populationService } from '../services/PopulationService'
import { PopulationStatsData } from '@rugged/game'
import type { CityCharterStateData } from '@rugged/game'
import { useGlobalStockTotals } from './hooks/useGlobalStockTotals'
import styles from './TopBar.module.css'
import { UiEvents } from '../uiEvents'
import { cityCharterService } from '../services/CityCharterService'
import { reputationService } from '../services/ReputationService'
import { playerService } from '../services/PlayerService'

type TopBarProps = {
	isStockOpen: boolean
	onToggleStock: () => void
	isPopulationOpen: boolean
	onTogglePopulation: () => void
	isLogisticsOpen: boolean
	onToggleLogistics: () => void
	isWorldMapOpen: boolean
	onToggleWorldMap: () => void
	isPrioritiesOpen: boolean
	onTogglePriorities: () => void
	isCharterOpen: boolean
	onToggleCharter: () => void
	isReputationOpen: boolean
	onToggleReputation: () => void
	showDebug: boolean
	onToggleDebug: () => void
	onOpenSave: () => void
	onOpenLoad: () => void
	resourceButtonRef?: React.Ref<HTMLButtonElement>
	reputationButtonRef?: React.Ref<HTMLButtonElement>
	populationButtonRef?: React.Ref<HTMLButtonElement>
	logisticsButtonRef?: React.Ref<HTMLButtonElement>
	prioritiesButtonRef?: React.Ref<HTMLButtonElement>
	charterButtonRef?: React.Ref<HTMLButtonElement>
}

const ResourceEmoji: React.FC<{ itemType: string }> = ({ itemType }) => {
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

export const TopBar: React.FC<TopBarProps> = ({
	isStockOpen,
	onToggleStock,
	isPopulationOpen,
	onTogglePopulation,
	isLogisticsOpen,
	onToggleLogistics,
	isWorldMapOpen,
	onToggleWorldMap,
	isPrioritiesOpen,
	onTogglePriorities,
	isCharterOpen,
	onToggleCharter,
	isReputationOpen,
	onToggleReputation,
	showDebug,
	onToggleDebug,
	onOpenSave,
	onOpenLoad,
	resourceButtonRef,
	reputationButtonRef,
	populationButtonRef,
	logisticsButtonRef,
	prioritiesButtonRef,
	charterButtonRef
}) => {
	const totals = useGlobalStockTotals()
	const [populationTotal, setPopulationTotal] = useState(
		populationService.getStats().totalCount
	)
	const [housingCapacity, setHousingCapacity] = useState(
		populationService.getStats().housingCapacity || 0
	)
	const [charterState, setCharterState] = useState<CityCharterStateData | null>(
		cityCharterService.getState()
	)
	const [reputation, setReputation] = useState(
		reputationService.getReputation(playerService.playerId)
	)

	useEffect(() => {
		const handleStatsUpdated = (data: PopulationStatsData) => {
			setPopulationTotal(data.totalCount)
			setHousingCapacity(data.housingCapacity || 0)
		}

		EventBus.on(UiEvents.Population.StatsUpdated, handleStatsUpdated)

		return () => {
			EventBus.off(UiEvents.Population.StatsUpdated, handleStatsUpdated)
		}
	}, [])

	useEffect(() => {
		const handleCharterUpdate = (data: CityCharterStateData) => {
			setCharterState(data)
		}

		EventBus.on(UiEvents.CityCharter.Updated, handleCharterUpdate)
		cityCharterService.requestState()

		return () => {
			EventBus.off(UiEvents.CityCharter.Updated, handleCharterUpdate)
		}
	}, [])

	useEffect(() => {
		const handleReputationUpdated = () => {
			setReputation(reputationService.getReputation(playerService.playerId))
		}

		EventBus.on(UiEvents.Reputation.Updated, handleReputationUpdated)
		reputationService.requestState()

		return () => {
			EventBus.off(UiEvents.Reputation.Updated, handleReputationUpdated)
		}
	}, [])

	const resourceItems = [
		{ id: 'stone', label: 'Stone' },
		{ id: 'logs', label: 'Logs' },
		{ id: 'planks', label: 'Planks' }
	]
	const populationLabel = `${populationTotal}/${housingCapacity}`
	const populationOverCapacity = populationTotal > housingCapacity
	const charterLabel = charterState?.currentTier?.name || 'Charter'
	const charterClaimable = Boolean(charterState?.isEligibleForNext)
	const charterWarning = charterState ? !charterState.currentTierRequirementsMet : false
	return (
		<div className={styles.topBar}>
			<div className={styles.left}>
				<div className={styles.leftGroup}>
					<World />
					<button
						type="button"
						className={styles.worldMapButton}
						data-active={isWorldMapOpen}
						onClick={onToggleWorldMap}
						aria-pressed={isWorldMapOpen}
					>
						<span className={styles.worldMapIcon}>🗺️</span>
						<span className={styles.worldMapLabel}>World</span>
					</button>
				</div>
			</div>
			<div className={styles.center}>
				<button
					type="button"
					className={styles.resourceButton}
					data-active={isStockOpen}
					onClick={onToggleStock}
					aria-pressed={isStockOpen}
					ref={resourceButtonRef}
				>
					{resourceItems.map((item) => (
						<span key={item.id} className={styles.resourceItem} title={item.label}>
							<span className={styles.resourceEmoji}>
								<ResourceEmoji itemType={item.id} />
							</span>
							<span className={styles.resourceValue}>{totals[item.id] || 0}</span>
						</span>
					))}
				</button>
				<button
					type="button"
					className={styles.reputationButton}
					data-active={isReputationOpen}
					onClick={onToggleReputation}
					aria-pressed={isReputationOpen}
					title="Reputation"
					ref={reputationButtonRef}
				>
					<span className={styles.reputationIcon}>⭐</span>
					<span className={styles.reputationValue}>{reputation}</span>
				</button>
				<button
					type="button"
					className={styles.populationButton}
					data-warning={populationOverCapacity}
					data-active={isPopulationOpen}
					onClick={onTogglePopulation}
					aria-pressed={isPopulationOpen}
					ref={populationButtonRef}
				>
					<span className={styles.populationIcon}>👥</span>
					<span className={styles.populationValue}>{populationLabel}</span>
					{populationOverCapacity ? (
						<span className={styles.populationWarning} title="Not enough housing">
							⚠️
						</span>
					) : null}
				</button>
				<button
					type="button"
					className={styles.cityButton}
					data-active={isCharterOpen}
					data-claimable={charterClaimable}
					data-warning={charterWarning}
					onClick={onToggleCharter}
					aria-pressed={isCharterOpen}
					ref={charterButtonRef}
				>
					<span className={styles.cityIcon}>🏛️</span>
					<span className={styles.cityLabel}>{charterLabel}</span>
				</button>
				<button
					type="button"
					className={styles.logisticsButton}
					data-active={isLogisticsOpen}
					onClick={onToggleLogistics}
					aria-pressed={isLogisticsOpen}
					ref={logisticsButtonRef}
				>
					<span className={styles.logisticsIcon}>📦</span>
					<span className={styles.logisticsLabel}>Logistics</span>
				</button>
				<button
					type="button"
					className={styles.prioritiesButton}
					data-active={isPrioritiesOpen}
					onClick={onTogglePriorities}
					aria-pressed={isPrioritiesOpen}
					ref={prioritiesButtonRef}
				>
					<span className={styles.prioritiesIcon}>🎯</span>
					<span className={styles.prioritiesLabel}>Priorities</span>
				</button>
			</div>
			<div className={styles.right}>
				<div className={styles.snapshotButtons}>
					<label className={styles.debugToggle}>
						<input
							type="checkbox"
							className={styles.debugCheckbox}
							checked={showDebug}
							onChange={onToggleDebug}
						/>
						<span className={styles.debugText}>Debug</span>
					</label>
					<button type="button" className={styles.snapshotButton} onClick={onOpenSave}>
						Save
					</button>
					<button type="button" className={styles.snapshotButton} onClick={onOpenLoad}>
						Load
					</button>
				</div>
			</div>
		</div>
	)
}
