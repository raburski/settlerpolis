import React, { useState, useEffect } from 'react'
import { EventBus } from '../EventBus'
import { populationService } from '../services/PopulationService'
import { ProfessionType, PopulationStatsData } from '@rugged/game'
import styles from './PopulationPanel.module.css'

export const PopulationPanel: React.FC = () => {
	const [isVisible, setIsVisible] = useState(false)
	const [stats, setStats] = useState<PopulationStatsData>({
		totalCount: 0,
		byProfession: {
			[ProfessionType.Carrier]: 0,
			[ProfessionType.Builder]: 0,
			[ProfessionType.Woodcutter]: 0,
			[ProfessionType.Miner]: 0
		},
		idleCount: 0,
		workingCount: 0
	})

	useEffect(() => {
		// Load initial stats
		const initialStats = populationService.getStats()
		setStats(initialStats)

		// Listen for stats updates
		const handleStatsUpdated = (data: PopulationStatsData) => {
			setStats(data)
		}

		EventBus.on('ui:population:stats-updated', handleStatsUpdated)

		return () => {
			EventBus.off('ui:population:stats-updated', handleStatsUpdated)
		}
	}, [])

	const professionLabels: Record<ProfessionType, string> = {
		[ProfessionType.Carrier]: 'Carrier',
		[ProfessionType.Builder]: 'Builder',
		[ProfessionType.Woodcutter]: 'Woodcutter',
		[ProfessionType.Miner]: 'Miner'
	}

	const professionIcons: Record<ProfessionType, string> = {
		[ProfessionType.Carrier]: '👤',
		[ProfessionType.Builder]: '🔨',
		[ProfessionType.Woodcutter]: '🪓',
		[ProfessionType.Miner]: '⛏️'
	}

	if (!isVisible) {
		return (
			<button 
				className={styles.toggleButton} 
				onClick={() => setIsVisible(true)}
				title="Show Population"
			>
				👥 {stats.totalCount}
			</button>
		)
	}

	return (
		<div className={styles.panel}>
			<div className={styles.header}>
				<h3>Population</h3>
				<button className={styles.closeButton} onClick={() => setIsVisible(false)}>×</button>
			</div>

			<div className={styles.content}>
				<div className={styles.statRow}>
					<span className={styles.label}>Total:</span>
					<span className={styles.value}>{stats.totalCount}</span>
				</div>

				<div className={styles.statRow}>
					<span className={styles.label}>Idle:</span>
					<span className={styles.value}>{stats.idleCount}</span>
				</div>

				<div className={styles.statRow}>
					<span className={styles.label}>Working:</span>
					<span className={styles.value}>{stats.workingCount}</span>
				</div>

				<div className={styles.divider}></div>

				<div className={styles.professions}>
					<h4>By Profession</h4>
					{Object.entries(stats.byProfession).map(([profession, count]) => (
						<div key={profession} className={styles.professionRow}>
							<span className={styles.professionIcon}>
								{professionIcons[profession as ProfessionType]}
							</span>
							<span className={styles.professionLabel}>
								{professionLabels[profession as ProfessionType]}:
							</span>
							<span className={styles.professionCount}>{count}</span>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}

