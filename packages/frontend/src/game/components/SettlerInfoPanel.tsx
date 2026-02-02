import React, { useState, useEffect } from 'react'
import { EventBus } from '../EventBus'
import { Settler, ProfessionType, SettlerState, WorkProviderType } from '@rugged/game'
import { populationService } from '../services/PopulationService'
import { buildingService } from '../services/BuildingService'
import { DraggablePanel } from './DraggablePanel'
import sharedStyles from './PanelShared.module.css'
import { UiEvents } from '../uiEvents'

export const SettlerInfoPanel: React.FC = () => {
	const [isVisible, setIsVisible] = useState(false)
	const [settler, setSettler] = useState<Settler | null>(null)

	useEffect(() => {
		// Listen for settler selection
		const handleSettlerClick = (data: { settlerId: string }) => {
			if (settler && settler.id !== data.settlerId) {
				EventBus.emit(UiEvents.Settler.Highlight, { settlerId: settler.id, highlighted: false })
			}
			const settlerData = populationService.getSettler(data.settlerId)
			if (settlerData) {
				setSettler(settlerData)
				setIsVisible(true)
				EventBus.emit(UiEvents.Settler.Highlight, { settlerId: settlerData.id, highlighted: true })
				// Close building panel if open
				EventBus.emit(UiEvents.Building.Close)
			}
		}

		// Listen for settler updates
		const handleSettlerUpdate = (data: { settlerId: string }) => {
			if (settler && settler.id === data.settlerId) {
				const updated = populationService.getSettler(data.settlerId)
				if (updated) {
					setSettler(updated)
				}
			}
		}

		const handleSettlerDied = (data: { settlerId: string }) => {
			if (settler && settler.id === data.settlerId) {
				EventBus.emit(UiEvents.Settler.Highlight, { settlerId: settler.id, highlighted: false })
				setIsVisible(false)
				setSettler(null)
			}
		}

		// Listen for close panel event
		const handleClosePanel = () => {
			setIsVisible(false)
			if (settler) {
				EventBus.emit(UiEvents.Settler.Highlight, { settlerId: settler.id, highlighted: false })
			}
			setSettler(null)
		}

		EventBus.on(UiEvents.Settler.Click, handleSettlerClick)
		EventBus.on(UiEvents.Population.SettlerUpdated, handleSettlerUpdate)
		EventBus.on(UiEvents.Population.SettlerDied, handleSettlerDied)
		EventBus.on(UiEvents.Settler.Close, handleClosePanel)

		return () => {
			EventBus.off(UiEvents.Settler.Click, handleSettlerClick)
			EventBus.off(UiEvents.Population.SettlerUpdated, handleSettlerUpdate)
			EventBus.off(UiEvents.Population.SettlerDied, handleSettlerDied)
			EventBus.off(UiEvents.Settler.Close, handleClosePanel)
		}
	}, [settler])

	const handleClose = () => {
		if (settler) {
			EventBus.emit(UiEvents.Settler.Highlight, { settlerId: settler.id, highlighted: false })
		}
		setIsVisible(false)
		setSettler(null)
		EventBus.emit(UiEvents.Settler.Close)
	}

	if (!isVisible || !settler) {
		return null
	}

	const professionLabels: Record<ProfessionType, string> = {
		[ProfessionType.Carrier]: 'Carrier',
		[ProfessionType.Builder]: 'Builder',
		[ProfessionType.Woodcutter]: 'Woodcutter',
		[ProfessionType.Miner]: 'Miner',
		[ProfessionType.Farmer]: 'Farmer',
		[ProfessionType.Miller]: 'Miller',
		[ProfessionType.Baker]: 'Baker',
		[ProfessionType.Vendor]: 'Vendor'
	}

	const professionIcons: Record<ProfessionType, string> = {
		[ProfessionType.Carrier]: '👤',
		[ProfessionType.Builder]: '🔨',
		[ProfessionType.Woodcutter]: '🪓',
		[ProfessionType.Miner]: '⛏️',
		[ProfessionType.Farmer]: '🌾',
		[ProfessionType.Miller]: '🌬️',
		[ProfessionType.Baker]: '🥖',
		[ProfessionType.Vendor]: '🛍️'
	}

	const getStateLabel = (state: SettlerState): string => {
		switch (state) {
			case SettlerState.Idle:
				return '🟢 Idle'
			case SettlerState.Spawned:
				return '✨ Spawned'
			case SettlerState.Assigned:
				return '📌 Assigned'
			case SettlerState.Moving:
				return '🚶 Moving'
			case SettlerState.MovingToTool:
				return '🚶 Moving to Tool'
			case SettlerState.MovingToBuilding:
				return '🚶 Moving to Building'
			case SettlerState.Working:
				return '🔨 Working'
			case SettlerState.WaitingForWork:
				return '⏳ Waiting for Work'
			case SettlerState.Packing:
				return '📦 Packing'
			case SettlerState.Unpacking:
				return '📦 Unpacking'
			case SettlerState.MovingToItem:
				return '🚶 Moving to Item'
			case SettlerState.MovingToResource:
				return '🚶 Moving to Resource'
			case SettlerState.MovingHome:
				return '🏠 Going Home'
			case SettlerState.Harvesting:
				return '⛏️ Harvesting'
			case SettlerState.CarryingItem:
				return '📦 Carrying Item'
			case SettlerState.AssignmentFailed:
				return '❌ Assignment Failed'
			default:
				return '❓ Unknown'
		}
	}

	const formatWaitReason = (reason?: string): string | null => {
		if (!reason) {
			return null
		}
		const withSpaces = reason.replace(/_/g, ' ')
		return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1)
	}

	const assignment = settler ? populationService.getAssignment(settler.stateContext.assignmentId) : undefined
	const assignedBuilding = settler.buildingId ? buildingService.getBuildingInstance(settler.buildingId) : undefined
	const assignedBuildingDef = assignedBuilding ? buildingService.getBuildingDefinition(assignedBuilding.buildingId) : undefined
	const needs = settler.needs

	return (
		<DraggablePanel
			icon={professionIcons[settler.profession]}
			title="Settler"
			onClose={handleClose}
		>
			<div className={sharedStyles.info}>
				<div className={sharedStyles.infoRow}>
					<span className={sharedStyles.label}>Profession:</span>
					<span className={sharedStyles.value}>{professionLabels[settler.profession]}</span>
				</div>

				<div className={sharedStyles.infoRow}>
					<span className={sharedStyles.label}>Status:</span>
					<span className={sharedStyles.value}>{getStateLabel(settler.state)}</span>
				</div>

				<div className={sharedStyles.infoRow}>
					<span className={sharedStyles.label}>Health:</span>
					<span className={sharedStyles.value}>{Math.round((typeof settler.health === 'number' ? settler.health : 1) * 100)}%</span>
				</div>

				{needs && (
					<>
						<div className={sharedStyles.infoRow}>
							<span className={sharedStyles.label}>Hunger:</span>
							<span className={sharedStyles.value}>{Math.round(needs.hunger * 100)}%</span>
						</div>
						<div className={sharedStyles.infoRow}>
							<span className={sharedStyles.label}>Fatigue:</span>
							<span className={sharedStyles.value}>{Math.round(needs.fatigue * 100)}%</span>
						</div>
					</>
				)}

				{settler.stateContext.waitReason && (
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Wait reason:</span>
						<span className={sharedStyles.value}>
							{formatWaitReason(settler.stateContext.waitReason) || 'Unknown'}
						</span>
					</div>
				)}

				{(settler.stateContext.lastStepType || settler.stateContext.lastStepReason) && (
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Last step:</span>
						<span className={sharedStyles.value}>
							{settler.stateContext.lastStepType || '—'}
							{settler.stateContext.lastStepReason ? ` (${formatWaitReason(settler.stateContext.lastStepReason)})` : ''}
						</span>
					</div>
				)}

				{assignment && (
					<>
						<div className={sharedStyles.infoRow}>
							<span className={sharedStyles.label}>Assignment:</span>
							<span className={sharedStyles.value}>
								{assignment.providerType === WorkProviderType.Building
									? '🏢 Building'
									: assignment.providerType === WorkProviderType.Construction
										? '🏗️ Construction'
										: assignment.providerType === WorkProviderType.Road
											? '🛣️ Road'
											: '📦 Logistics'}
							</span>
						</div>
						{assignedBuildingDef && (
							<div className={sharedStyles.infoRow}>
								<span className={sharedStyles.label}>Building:</span>
								<span className={sharedStyles.value}>{assignedBuildingDef.name}</span>
							</div>
						)}
					</>
				)}
				{!assignment && settler.stateContext.assignmentId && (
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Assignment:</span>
						<span className={sharedStyles.value}>In progress</span>
					</div>
				)}

				{settler.houseId && (
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>House:</span>
						<span className={sharedStyles.value}>🏠 Lives in house</span>
					</div>
				)}

				{settler.stateContext.carryingItemType && (
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Carrying:</span>
						<span className={sharedStyles.value}>
							{settler.stateContext.carryingQuantity ? `${settler.stateContext.carryingQuantity}x ` : ''}
							{settler.stateContext.carryingItemType}
						</span>
					</div>
				)}

				{settler.stateContext.equippedItemType && (
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Equipped:</span>
						<span className={sharedStyles.value}>
							{settler.stateContext.equippedQuantity ? `${settler.stateContext.equippedQuantity}x ` : ''}
							{settler.stateContext.equippedItemType}
						</span>
					</div>
				)}

				<div className={sharedStyles.infoRow}>
					<span className={sharedStyles.label}>Position:</span>
					<span className={sharedStyles.value}>
						{Math.round(settler.position.x)}, {Math.round(settler.position.y)}
					</span>
				</div>
			</div>

			{settler.state === SettlerState.Working && (
				<div className={sharedStyles.actions}>
					<div className={sharedStyles.workingMessage}>
						This settler is currently working
					</div>
				</div>
			)}

			{(settler.state === SettlerState.MovingToBuilding || settler.state === SettlerState.MovingToTool || settler.state === SettlerState.MovingToItem || settler.state === SettlerState.MovingToResource || settler.state === SettlerState.MovingHome) && (
				<div className={sharedStyles.actions}>
					<div className={sharedStyles.movingMessage}>
						This settler is moving to their destination
					</div>
				</div>
			)}

			{settler.state === SettlerState.CarryingItem && (
				<div className={sharedStyles.actions}>
					<div className={sharedStyles.movingMessage}>
						This settler is carrying an item to a construction site
					</div>
				</div>
			)}

			{settler.state === SettlerState.Idle && (
				<div className={sharedStyles.actions}>
					<div className={sharedStyles.idleMessage}>
						This settler is idle and available for work
					</div>
				</div>
			)}

			{settler.state === SettlerState.AssignmentFailed && (
				<div className={sharedStyles.actions}>
					<div className={sharedStyles.errorMessage}>
						Assignment failed. This settler will return to idle.
					</div>
				</div>
			)}
		</DraggablePanel>
	)
}
