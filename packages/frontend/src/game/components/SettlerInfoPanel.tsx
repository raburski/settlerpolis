import React, { useState, useEffect } from 'react'
import { EventBus } from '../EventBus'
import { Settler, ProfessionType, SettlerState, JobType } from '@rugged/game'
import { populationService } from '../services/PopulationService'
import { itemService } from '../services/ItemService'
import { buildingService } from '../services/BuildingService'
import { DraggablePanel } from './DraggablePanel'
import sharedStyles from './PanelShared.module.css'

// Component to display item emoji that reactively updates when metadata loads
const ItemEmoji: React.FC<{ itemType: string }> = ({ itemType }) => {
	const [emoji, setEmoji] = useState<string>(itemType)

	useEffect(() => {
		// Try to get immediately
		const itemMetadata = itemService.getItemType(itemType)
		if (itemMetadata?.emoji) {
			setEmoji(itemMetadata.emoji)
		}

		// Subscribe to updates
		const unsubscribe = itemService.subscribeToItemMetadata(itemType, (metadata) => {
			if (metadata?.emoji) {
				setEmoji(metadata.emoji)
			}
		})

		return unsubscribe
	}, [itemType])

	return <>{emoji}</>
}

export const SettlerInfoPanel: React.FC = () => {
	const [isVisible, setIsVisible] = useState(false)
	const [settler, setSettler] = useState<Settler | null>(null)

	useEffect(() => {
		// Listen for settler selection
		const handleSettlerClick = (data: { settlerId: string }) => {
			const settlerData = populationService.getSettler(data.settlerId)
			if (settlerData) {
				setSettler(settlerData)
				setIsVisible(true)
				// Close building panel if open
				EventBus.emit('ui:building:close')
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

		// Listen for close panel event
		const handleClosePanel = () => {
			setIsVisible(false)
		}

		EventBus.on('ui:settler:click', handleSettlerClick)
		EventBus.on('ui:population:settler-updated', handleSettlerUpdate)
		EventBus.on('ui:settler:close', handleClosePanel)

		return () => {
			EventBus.off('ui:settler:click', handleSettlerClick)
			EventBus.off('ui:population:settler-updated', handleSettlerUpdate)
			EventBus.off('ui:settler:close', handleClosePanel)
		}
	}, [settler])

	const handleClose = () => {
		setIsVisible(false)
		setSettler(null)
		EventBus.emit('ui:settler:close')
	}

	if (!isVisible || !settler) {
		return null
	}

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

	const getStateLabel = (state: SettlerState): string => {
		switch (state) {
			case SettlerState.Idle:
				return '🟢 Idle'
			case SettlerState.Spawned:
				return '✨ Spawned'
			case SettlerState.MovingToTool:
				return '🚶 Moving to Tool'
			case SettlerState.MovingToBuilding:
				return '🚶 Moving to Building'
			case SettlerState.Working:
				return '🔨 Working'
			case SettlerState.WaitingForWork:
				return '⏳ Waiting for Work'
			case SettlerState.MovingToItem:
				return '🚶 Moving to Item'
			case SettlerState.CarryingItem:
				return '📦 Carrying Item'
			case SettlerState.AssignmentFailed:
				return '❌ Assignment Failed'
			default:
				return '❓ Unknown'
		}
	}

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

				{settler.currentJob && (
					<>
						<div className={sharedStyles.infoRow}>
							<span className={sharedStyles.label}>Job Type:</span>
							<span className={sharedStyles.value}>
								{settler.currentJob.jobType === JobType.Construction && '🏗️ Construction'}
								{settler.currentJob.jobType === JobType.Production && '⚙️ Production'}
								{settler.currentJob.jobType === JobType.Transport && '📦 Transport'}
							</span>
						</div>
						<div className={sharedStyles.infoRow}>
							<span className={sharedStyles.label}>Job Status:</span>
							<span className={sharedStyles.value}>
								{settler.currentJob.status === 'pending' && '⏳ Pending'}
								{settler.currentJob.status === 'active' && '✅ Active'}
								{settler.currentJob.status === 'completed' && '✔️ Completed'}
								{settler.currentJob.status === 'cancelled' && '❌ Cancelled'}
							</span>
						</div>
						{settler.currentJob.buildingInstanceId && (
							<div className={sharedStyles.infoRow}>
								<span className={sharedStyles.label}>Building:</span>
								<span className={sharedStyles.value}>
									{buildingService.getBuildingInstance(settler.currentJob.buildingInstanceId)?.buildingId || 'Unknown'}
								</span>
							</div>
						)}
						{settler.currentJob.jobType === JobType.Transport && settler.currentJob.itemType && (
							<div className={sharedStyles.infoRow}>
								<span className={sharedStyles.label}>
									{settler.currentJob.carriedItemId ? 'Carrying:' : 'Picking up:'}
								</span>
								<span className={sharedStyles.value}>
									<ItemEmoji itemType={settler.currentJob.itemType} /> {settler.currentJob.itemType}
									{settler.currentJob.quantity && ` (${settler.currentJob.quantity})`}
								</span>
							</div>
						)}
						{settler.currentJob.requiredProfession && (
							<div className={sharedStyles.infoRow}>
								<span className={sharedStyles.label}>Required Profession:</span>
								<span className={sharedStyles.value}>{professionLabels[settler.currentJob.requiredProfession]}</span>
							</div>
						)}
					</>
				)}

				{settler.houseId && (
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>House:</span>
						<span className={sharedStyles.value}>🏠 Lives in house</span>
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

			{(settler.state === SettlerState.MovingToBuilding || settler.state === SettlerState.MovingToTool || settler.state === SettlerState.MovingToItem) && (
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

