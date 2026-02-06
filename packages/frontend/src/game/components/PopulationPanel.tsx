import React, { useState, useEffect } from 'react'
import { EventBus } from '../EventBus'
import { populationService } from '../services/PopulationService'
import { toolAvailabilityService } from '../services/ToolAvailabilityService'
import { ProfessionType, PopulationStatsData, SettlerState } from '@rugged/game'
import styles from './PopulationPanel.module.css'
import { UiEvents } from '../uiEvents'

type PopulationPanelProps = {
	isVisible: boolean
	onClose?: () => void
	anchorRect?: DOMRect | null
}

export const PopulationPanel: React.FC<PopulationPanelProps> = ({ isVisible, onClose, anchorRect }) => {
	const [stats, setStats] = useState<PopulationStatsData>({
		totalCount: 0,
		byProfession: {
			[ProfessionType.Carrier]: 0,
			[ProfessionType.Builder]: 0,
			[ProfessionType.Woodcutter]: 0,
			[ProfessionType.Miner]: 0,
			[ProfessionType.Metallurgist]: 0,
			[ProfessionType.Farmer]: 0,
			[ProfessionType.Fisher]: 0,
			[ProfessionType.Miller]: 0,
			[ProfessionType.Baker]: 0,
			[ProfessionType.Vendor]: 0,
			[ProfessionType.Hunter]: 0
		},
		byProfessionActive: {
			[ProfessionType.Carrier]: 0,
			[ProfessionType.Builder]: 0,
			[ProfessionType.Woodcutter]: 0,
			[ProfessionType.Miner]: 0,
			[ProfessionType.Metallurgist]: 0,
			[ProfessionType.Farmer]: 0,
			[ProfessionType.Fisher]: 0,
			[ProfessionType.Miller]: 0,
			[ProfessionType.Baker]: 0,
			[ProfessionType.Vendor]: 0,
			[ProfessionType.Hunter]: 0
		},
		idleCount: 0,
		workingCount: 0,
		housingCapacity: 0
	})
	const [toolAvailability, setToolAvailability] = useState<Record<ProfessionType, boolean>>(
		toolAvailabilityService.getAvailability()
	)
	const [idleByProfession, setIdleByProfession] = useState<Record<ProfessionType, number>>({
		[ProfessionType.Carrier]: 0,
		[ProfessionType.Builder]: 0,
		[ProfessionType.Woodcutter]: 0,
		[ProfessionType.Miner]: 0,
		[ProfessionType.Metallurgist]: 0,
		[ProfessionType.Farmer]: 0,
		[ProfessionType.Fisher]: 0,
		[ProfessionType.Miller]: 0,
		[ProfessionType.Baker]: 0,
		[ProfessionType.Vendor]: 0,
		[ProfessionType.Hunter]: 0
	})

	useEffect(() => {
		// Load initial stats
		const initialStats = populationService.getStats()
		setStats(initialStats)

		// Listen for stats updates
		const handleStatsUpdated = (data: PopulationStatsData) => {
			setStats(data)
		}

		EventBus.on(UiEvents.Population.StatsUpdated, handleStatsUpdated)

		return () => {
			EventBus.off(UiEvents.Population.StatsUpdated, handleStatsUpdated)
		}
	}, [])

	useEffect(() => {
		const updateIdleCounts = () => {
			const nextIdleCounts: Record<ProfessionType, number> = {
				[ProfessionType.Carrier]: 0,
				[ProfessionType.Builder]: 0,
				[ProfessionType.Woodcutter]: 0,
				[ProfessionType.Miner]: 0,
				[ProfessionType.Metallurgist]: 0,
				[ProfessionType.Farmer]: 0,
				[ProfessionType.Fisher]: 0,
				[ProfessionType.Miller]: 0,
				[ProfessionType.Baker]: 0,
				[ProfessionType.Vendor]: 0,
				[ProfessionType.Hunter]: 0
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

		EventBus.on(UiEvents.Population.SettlerUpdated, handleSettlerUpdated)
		EventBus.on(UiEvents.Population.ListLoaded, handleSettlerUpdated)

		return () => {
			EventBus.off(UiEvents.Population.SettlerUpdated, handleSettlerUpdated)
			EventBus.off(UiEvents.Population.ListLoaded, handleSettlerUpdated)
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

	const handleRequestToolPickup = (profession: ProfessionType) => {
		populationService.requestProfessionToolPickup(profession)
	}

	const handleRequestRevertToCarrier = (profession: ProfessionType) => {
		populationService.requestRevertToCarrier(profession)
	}

	if (!isVisible) {
		return null
	}

	const panelStyle = anchorRect
		? {
			left: anchorRect.left + anchorRect.width / 2,
			top: 'calc(var(--top-bar-height, 64px) + var(--spacing-md))',
			transform: 'translateX(-50%)'
		}
		: undefined

	return (
		<div className={styles.panel} style={panelStyle}>
			<div className={styles.header}>
				<h3>Population</h3>
				<button className={styles.closeButton} onClick={onClose} type="button" aria-label="Close population panel">×</button>
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
						const requiresTool = ![ProfessionType.Carrier, ProfessionType.Farmer, ProfessionType.Miller, ProfessionType.Baker].includes(professionType)
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
								{!isCarrier && requiresTool && (
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
