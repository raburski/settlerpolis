import React, { useState, useEffect } from 'react'
import { EventBus } from '../EventBus'
import { populationService } from '../services/PopulationService'
import { toolAvailabilityService } from '../services/ToolAvailabilityService'
import { ProfessionType, PopulationStatsData, SettlerState } from '@rugged/game'
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
		byProfessionActive: {
			[ProfessionType.Carrier]: 0,
			[ProfessionType.Builder]: 0,
			[ProfessionType.Woodcutter]: 0,
			[ProfessionType.Miner]: 0
		},
		idleCount: 0,
		workingCount: 0
	})
	const [toolAvailability, setToolAvailability] = useState<Record<ProfessionType, boolean>>(
		toolAvailabilityService.getAvailability()
	)
	const [idleByProfession, setIdleByProfession] = useState<Record<ProfessionType, number>>({
		[ProfessionType.Carrier]: 0,
		[ProfessionType.Builder]: 0,
		[ProfessionType.Woodcutter]: 0,
		[ProfessionType.Miner]: 0
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

	useEffect(() => {
		const updateIdleCounts = () => {
			const nextIdleCounts: Record<ProfessionType, number> = {
				[ProfessionType.Carrier]: 0,
				[ProfessionType.Builder]: 0,
				[ProfessionType.Woodcutter]: 0,
				[ProfessionType.Miner]: 0
			}
			populationService.getSettlers().forEach(settler => {
				if (settler.state === SettlerState.Idle) {
					nextIdleCounts[settler.profession] = (nextIdleCounts[settler.profession] || 0) + 1
				}
			})
			setIdleByProfession(nextIdleCounts)
		}

		updateIdleCounts()

		const handleSettlerUpdated = () => {
			updateIdleCounts()
		}

		EventBus.on('ui:population:settler-updated', handleSettlerUpdated)
		EventBus.on('ui:population:list-loaded', handleSettlerUpdated)

		return () => {
			EventBus.off('ui:population:settler-updated', handleSettlerUpdated)
			EventBus.off('ui:population:list-loaded', handleSettlerUpdated)
		}
	}, [])

	useEffect(() => {
		const unsubscribe = toolAvailabilityService.onUpdate(() => {
			setToolAvailability(toolAvailabilityService.getAvailability())
		})

		return () => {
			unsubscribe()
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

	const handleRequestToolPickup = (profession: ProfessionType) => {
		populationService.requestProfessionToolPickup(profession)
	}

	const handleRequestRevertToCarrier = (profession: ProfessionType) => {
		populationService.requestRevertToCarrier(profession)
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
					<h4>By Profession (active / total)</h4>
					{Object.entries(stats.byProfession).map(([profession, count]) => {
						const professionType = profession as ProfessionType
						const activeCount = stats.byProfessionActive[professionType] || 0
						const canRequestTool = toolAvailability[professionType] || false
						const isCarrier = professionType === ProfessionType.Carrier
						const canRevert = (idleByProfession[professionType] || 0) > 0
						let addTitle = `Request ${professionLabels[professionType]} tool pickup`
						if (!canRequestTool) {
							addTitle = `Drop a ${professionLabels[professionType]} tool to enable`
						}
						const removeTitle = canRevert
							? `Revert idle ${professionLabels[professionType]} to Carrier`
							: `No idle ${professionLabels[professionType]} available`
						return (
							<div key={profession} className={styles.professionRow}>
								<span className={styles.professionIcon}>
									{professionIcons[professionType]}
								</span>
								<span className={styles.professionLabel}>
									{professionLabels[professionType]}:
								</span>
								{!isCarrier && (
									<button
										className={styles.professionAddButton}
										type="button"
										onClick={() => handleRequestToolPickup(professionType)}
										disabled={!canRequestTool}
										title={addTitle}
									>
										+
									</button>
								)}
								{!isCarrier && (
									<button
										className={styles.professionRemoveButton}
										type="button"
										onClick={() => handleRequestRevertToCarrier(professionType)}
										disabled={!canRevert}
										title={removeTitle}
									>
										-
									</button>
								)}
								<span className={styles.professionCount}>{activeCount} / {count}</span>
							</div>
						)
					})}
				</div>
			</div>
		</div>
	)
}

