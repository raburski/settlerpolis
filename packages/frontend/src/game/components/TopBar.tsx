import React, { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import { World } from './World'
import { itemService } from '../services/ItemService'
import { populationService } from '../services/PopulationService'
import { PopulationStatsData } from '@rugged/game'
import { useGlobalStockTotals } from './hooks/useGlobalStockTotals'
import styles from './TopBar.module.css'

type TopBarProps = {
	isStockOpen: boolean
	onToggleStock: () => void
	isPopulationOpen: boolean
	onTogglePopulation: () => void
	populationButtonRef?: React.Ref<HTMLButtonElement>
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
	populationButtonRef
}) => {
	const totals = useGlobalStockTotals()
	const [populationTotal, setPopulationTotal] = useState(
		populationService.getStats().totalCount
	)

	useEffect(() => {
		const handleStatsUpdated = (data: PopulationStatsData) => {
			setPopulationTotal(data.totalCount)
		}

		EventBus.on('ui:population:stats-updated', handleStatsUpdated)

		return () => {
			EventBus.off('ui:population:stats-updated', handleStatsUpdated)
		}
	}, [])

	const resourceItems = [
		{ id: 'stone', label: 'Stone' },
		{ id: 'logs', label: 'Logs' },
		{ id: 'planks', label: 'Planks' }
	]

	return (
		<div className={styles.topBar}>
			<div className={styles.left}>
				<World />
			</div>
			<div className={styles.center}>
				<button
					type="button"
					className={styles.resourceButton}
					data-active={isStockOpen}
					onClick={onToggleStock}
					aria-pressed={isStockOpen}
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
					<span className={styles.populationValue}>{populationTotal}</span>
				</button>
			</div>
			<div className={styles.right} />
		</div>
	)
}
