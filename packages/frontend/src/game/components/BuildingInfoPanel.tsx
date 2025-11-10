import React, { useState, useEffect } from 'react'
import { EventBus } from '../EventBus'
import { Event, BuildingInstance, BuildingDefinition, ConstructionStage } from '@rugged/game'
import { buildingService } from '../services/BuildingService'
import styles from './BuildingInfoPanel.module.css'

interface BuildingInfoData {
	buildingInstance: BuildingInstance
	buildingDefinition: BuildingDefinition
}

export const BuildingInfoPanel: React.FC = () => {
	const [isVisible, setIsVisible] = useState(false)
	const [buildingInstance, setBuildingInstance] = useState<BuildingInstance | null>(null)
	const [buildingDefinition, setBuildingDefinition] = useState<BuildingDefinition | null>(null)

	useEffect(() => {
		// Listen for building selection
		const handleBuildingSelect = (data: BuildingInfoData) => {
			setBuildingInstance(data.buildingInstance)
			setBuildingDefinition(data.buildingDefinition)
			setIsVisible(true)
		}

		// Listen for building updates (progress, completion, cancellation)
		const handleBuildingProgress = (data: { buildingInstanceId: string, progress: number, stage: string }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				const updated = buildingService.getBuildingInstance(data.buildingInstanceId)
				if (updated) {
					setBuildingInstance(updated)
				}
			}
		}

		const handleBuildingCompleted = (data: { building: BuildingInstance }) => {
			if (buildingInstance && buildingInstance.id === data.building.id) {
				setBuildingInstance(data.building)
			}
		}

		const handleBuildingCancelled = (data: { buildingInstanceId: string }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				setIsVisible(false)
				setBuildingInstance(null)
				setBuildingDefinition(null)
			}
		}

		// Listen for close panel event
		const handleClosePanel = () => {
			setIsVisible(false)
		}

		EventBus.on('ui:building:select', handleBuildingSelect)
		EventBus.on(Event.Buildings.SC.Progress, handleBuildingProgress)
		EventBus.on(Event.Buildings.SC.Completed, handleBuildingCompleted)
		EventBus.on(Event.Buildings.SC.Cancelled, handleBuildingCancelled)
		EventBus.on('ui:building:close', handleClosePanel)

		return () => {
			EventBus.off('ui:building:select', handleBuildingSelect)
			EventBus.off(Event.Buildings.SC.Progress, handleBuildingProgress)
			EventBus.off(Event.Buildings.SC.Completed, handleBuildingCompleted)
			EventBus.off(Event.Buildings.SC.Cancelled, handleBuildingCancelled)
			EventBus.off('ui:building:close', handleClosePanel)
		}
	}, [buildingInstance])

	const handleCancelConstruction = () => {
		if (buildingInstance && (buildingInstance.stage === ConstructionStage.Foundation || buildingInstance.stage === ConstructionStage.Constructing)) {
			EventBus.emit(Event.Buildings.CS.Cancel, {
				buildingInstanceId: buildingInstance.id
			})
		}
	}

	const handleClose = () => {
		setIsVisible(false)
		EventBus.emit('ui:building:close')
	}

	if (!isVisible || !buildingInstance || !buildingDefinition) {
		return null
	}

	const canCancel = buildingInstance.stage === ConstructionStage.Foundation || buildingInstance.stage === ConstructionStage.Constructing
	const isCompleted = buildingInstance.stage === ConstructionStage.Completed
	const isConstructing = buildingInstance.stage === ConstructionStage.Constructing

	return (
		<div className={styles.panel}>
			<div className={styles.header}>
				<div className={styles.title}>
					<span className={styles.icon}>{buildingDefinition.icon || '🏗️'}</span>
					<h3>{buildingDefinition.name}</h3>
				</div>
				<button className={styles.closeButton} onClick={handleClose}>×</button>
			</div>

			<div className={styles.content}>
				<div className={styles.description}>
					{buildingDefinition.description}
				</div>

				<div className={styles.info}>
					<div className={styles.infoRow}>
						<span className={styles.label}>Status:</span>
						<span className={styles.value}>
							{isCompleted ? '✅ Completed' : isConstructing ? '🔨 Under Construction' : '🏗️ Foundation'}
						</span>
					</div>

					{buildingInstance.stage !== ConstructionStage.Completed && (
						<div className={styles.infoRow}>
							<span className={styles.label}>Progress:</span>
							<span className={styles.value}>{Math.round(buildingInstance.progress)}%</span>
						</div>
					)}

					<div className={styles.infoRow}>
						<span className={styles.label}>Footprint:</span>
						<span className={styles.value}>
							{buildingDefinition.footprint.width} × {buildingDefinition.footprint.height} tiles
						</span>
					</div>

					<div className={styles.infoRow}>
						<span className={styles.label}>Category:</span>
						<span className={styles.value}>{buildingDefinition.category}</span>
					</div>
				</div>

				{canCancel && (
					<div className={styles.actions}>
						<button className={styles.cancelButton} onClick={handleCancelConstruction}>
							Cancel Construction
						</button>
						<div className={styles.cancelHint}>
							Resources will be refunded to your inventory
						</div>
					</div>
				)}

				{isCompleted && (
					<div className={styles.actions}>
						<div className={styles.completedMessage}>
							Building is ready for use
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

