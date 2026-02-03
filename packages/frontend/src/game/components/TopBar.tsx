import React, { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import { World } from './World'
import { itemService } from '../services/ItemService'
import { populationService } from '../services/PopulationService'
import { PopulationStatsData } from '@rugged/game'
import { useGlobalStockTotals } from './hooks/useGlobalStockTotals'
import styles from './TopBar.module.css'
import { UiEvents } from '../uiEvents'

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
	showDebugBounds: boolean
	onToggleDebugBounds: () => void
	onOpenSave: () => void
	onOpenLoad: () => void
	resourceButtonRef?: React.Ref<HTMLButtonElement>
	populationButtonRef?: React.Ref<HTMLButtonElement>
	logisticsButtonRef?: React.Ref<HTMLButtonElement>
	prioritiesButtonRef?: React.Ref<HTMLButtonElement>
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
	showDebugBounds,
	onToggleDebugBounds,
	onOpenSave,
	onOpenLoad,
	resourceButtonRef,
	populationButtonRef,
	logisticsButtonRef,
	prioritiesButtonRef
}) => {
	const totals = useGlobalStockTotals()
	const [populationTotal, setPopulationTotal] = useState(
		populationService.getStats().totalCount
	)
	const [housingCapacity, setHousingCapacity] = useState(
		populationService.getStats().housingCapacity || 0
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

	const resourceItems = [
		{ id: 'stone', label: 'Stone' },
		{ id: 'logs', label: 'Logs' },
		{ id: 'planks', label: 'Planks' }
	]
	const populationLabel = `${populationTotal}/${housingCapacity}`
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
					className={styles.populationButton}
					data-active={isPopulationOpen}
					onClick={onTogglePopulation}
					aria-pressed={isPopulationOpen}
					ref={populationButtonRef}
				>
					<span className={styles.populationIcon}>👥</span>
					<span className={styles.populationValue}>{populationLabel}</span>
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
							checked={showDebugBounds}
							onChange={onToggleDebugBounds}
						/>
						<span className={styles.debugText}>Bounds</span>
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
