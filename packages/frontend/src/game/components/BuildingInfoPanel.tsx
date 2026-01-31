import React, { useState, useEffect } from 'react'
import { EventBus } from '../EventBus'
import { Event, BuildingInstance, BuildingDefinition, ConstructionStage, Settler, SettlerState, ProfessionType, ProductionStatus, WorkerRequestFailureReason } from '@rugged/game'
import { buildingService } from '../services/BuildingService'
import { populationService } from '../services/PopulationService'
import { itemService } from '../services/ItemService'
import { storageService } from '../services/StorageService'
import { productionService } from '../services/ProductionService'
import { DraggablePanel } from './DraggablePanel'
import { useResourceList } from './hooks/useResourceList'
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

interface BuildingInfoData {
	buildingInstance: BuildingInstance
	buildingDefinition: BuildingDefinition
}

export const BuildingInfoPanel: React.FC = () => {
	const [isVisible, setIsVisible] = useState(false)
	const [buildingInstance, setBuildingInstance] = useState<BuildingInstance | null>(null)
	const [buildingDefinition, setBuildingDefinition] = useState<BuildingDefinition | null>(null)
	const [errorMessage, setErrorMessage] = useState<string | null>(null)
	const [workerStatus, setWorkerStatus] = useState<string | null>(null)
	const resourceTypes = useResourceList()

	useEffect(() => {
		// Listen for building selection
		const handleBuildingSelect = (data: BuildingInfoData) => {
			if (buildingInstance && buildingInstance.id !== data.buildingInstance.id) {
				EventBus.emit('ui:building:highlight', { buildingInstanceId: buildingInstance.id, highlighted: false })
			}
			setBuildingInstance(data.buildingInstance)
			setBuildingDefinition(data.buildingDefinition)
			setErrorMessage(null) // Clear any previous errors
			setWorkerStatus(null) // Clear any previous status
			setIsVisible(true)
			EventBus.emit('ui:building:highlight', { buildingInstanceId: data.buildingInstance.id, highlighted: true })
			// Close settler panel if open
			EventBus.emit('ui:settler:close')
		}

		// Listen for building updates (progress, completion, cancellation)
		const handleBuildingProgress = (data: { buildingInstanceId: string, progress: number, stage: string }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				const updated = buildingService.getBuildingInstance(data.buildingInstanceId)
				if (updated) {
					// Service now returns a new object reference, but we'll create a new one just to be safe
					setBuildingInstance({ ...updated })
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
				EventBus.emit('ui:building:highlight', { buildingInstanceId: buildingInstance.id, highlighted: false })
				setBuildingInstance(null)
				setBuildingDefinition(null)
			}
		}

		// Listen for close panel event
		const handleClosePanel = () => {
			setIsVisible(false)
			if (buildingInstance) {
				EventBus.emit('ui:building:highlight', { buildingInstanceId: buildingInstance.id, highlighted: false })
			}
			setBuildingInstance(null)
			setBuildingDefinition(null)
		}

		// Listen for worker request failures
		const handleWorkerRequestFailed = (data: { reason: WorkerRequestFailureReason, buildingInstanceId: string }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				// Map reason to user-friendly message
				let message = 'Failed to assign worker'
				switch (data.reason) {
					case WorkerRequestFailureReason.NoAvailableWorker:
						message = 'No available settler. Build a house to spawn settlers!'
						break
					case WorkerRequestFailureReason.NoBuilderAvailable:
						message = 'No idle builder available. Promote a settler with a hammer.'
						break
					case WorkerRequestFailureReason.NoSuitableProfession:
						message = 'No idle settler with required profession. Promote one in the Population panel.'
						break
					case WorkerRequestFailureReason.NoAvailableTool:
						message = 'No tool available to change profession. Drop a tool (hammer/axe) on the map!'
						break
					case WorkerRequestFailureReason.BuildingNotFound:
						message = 'Building not found'
						break
					case WorkerRequestFailureReason.BuildingDefinitionNotFound:
						message = 'Building definition not found'
						break
					case WorkerRequestFailureReason.BuildingDoesNotNeedWorkers:
						message = 'Building does not need workers'
						break
					case WorkerRequestFailureReason.BuildingNotUnderConstruction:
						message = 'Building is not under construction'
						break
					case WorkerRequestFailureReason.BuildingCompleted:
						message = 'Building is already completed'
						break
					default:
						message = `Worker request failed: ${data.reason}`
				}
				setErrorMessage(message)
				// Clear error after 5 seconds
				setTimeout(() => setErrorMessage(null), 5000)
			}
		}

		// Check if any settler is moving to this building
		const checkWorkerMovingToBuilding = () => {
			if (buildingInstance) {
				const settlers = populationService.getSettlers()
				const workerMoving = settlers.find(
					s => s.state === SettlerState.MovingToBuilding &&
					s.stateContext.targetId === buildingInstance.id
				)
				if (workerMoving) {
					setWorkerStatus('Worker is moving to building...')
					setErrorMessage(null) // Clear any errors
				}
			}
		}

		// Listen for worker assigned
		const handleWorkerAssigned = (data: { buildingInstanceId: string, settlerId: string }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				const isConstruction = buildingInstance.stage === ConstructionStage.CollectingResources || buildingInstance.stage === ConstructionStage.Constructing
				setWorkerStatus(isConstruction ? 'Worker assigned! Construction speeded up.' : 'Worker assigned! Building is now operational.')
				setErrorMessage(null) // Clear any errors
				// Clear status after 3 seconds
				setTimeout(() => setWorkerStatus(null), 3000)
				// Force re-render to update worker count
				setBuildingInstance({ ...buildingInstance })
			}
		}

		// Listen for worker unassigned
		const handleWorkerUnassigned = (data: { settlerId: string }) => {
			if (buildingInstance) {
				// Force re-render to update worker count
				setBuildingInstance({ ...buildingInstance })
			}
		}

		// Listen for resources changed
		const handleResourcesChanged = (data: { buildingInstanceId: string, itemType: string, quantity: number, requiredQuantity: number }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				const updated = buildingService.getBuildingInstance(data.buildingInstanceId)
				if (updated) {
					// Create a new object reference to force React re-render
					setBuildingInstance({ ...updated })
				}
			}
		}

		// Listen for stage changed
		const handleStageChanged = (data: { buildingInstanceId: string, stage: string }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				const updated = buildingService.getBuildingInstance(data.buildingInstanceId)
				if (updated) {
					// Create a new object reference to force React re-render
					setBuildingInstance({ ...updated })
				}
			}
		}

		// Listen for building updated event from service (for reactive updates)
		const handleBuildingUpdated = (data: { buildingInstanceId: string, building: BuildingInstance }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				// Update with the new building object from service (already a new reference)
				setBuildingInstance(data.building)
			}
		}

		// Listen for storage updates
		const handleStorageUpdated = (data: { buildingInstanceId: string, storage: any }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				// Force re-render to show updated storage
				setBuildingInstance({ ...buildingInstance })
			}
		}

		// Listen for production updates
		const handleProductionUpdated = (data: { buildingInstanceId: string, production: any }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				// Force re-render to show updated production
				setBuildingInstance({ ...buildingInstance })
			}
		}

		EventBus.on('ui:building:select', handleBuildingSelect)
		EventBus.on(Event.Buildings.SC.Progress, handleBuildingProgress)
		EventBus.on(Event.Buildings.SC.Completed, handleBuildingCompleted)
		EventBus.on(Event.Buildings.SC.Cancelled, handleBuildingCancelled)
		EventBus.on(Event.Buildings.SC.ResourcesChanged, handleResourcesChanged)
		EventBus.on(Event.Buildings.SC.StageChanged, handleStageChanged)
		EventBus.on('ui:building:updated', handleBuildingUpdated)
		EventBus.on('ui:building:close', handleClosePanel)
		EventBus.on('ui:population:worker-request-failed', handleWorkerRequestFailed)
		EventBus.on('ui:population:settler-updated', checkWorkerMovingToBuilding)
		EventBus.on('ui:population:worker-assigned', handleWorkerAssigned)
		EventBus.on('ui:population:worker-unassigned', handleWorkerUnassigned)
		EventBus.on('ui:storage:updated', handleStorageUpdated)
		EventBus.on('ui:production:updated', handleProductionUpdated)

		// Check immediately when building is selected
		checkWorkerMovingToBuilding()

		return () => {
			EventBus.off('ui:building:select', handleBuildingSelect)
			EventBus.off(Event.Buildings.SC.Progress, handleBuildingProgress)
			EventBus.off(Event.Buildings.SC.Completed, handleBuildingCompleted)
			EventBus.off(Event.Buildings.SC.Cancelled, handleBuildingCancelled)
			EventBus.off(Event.Buildings.SC.ResourcesChanged, handleResourcesChanged)
			EventBus.off(Event.Buildings.SC.StageChanged, handleStageChanged)
			EventBus.off('ui:building:updated', handleBuildingUpdated)
			EventBus.off('ui:building:close', handleClosePanel)
			EventBus.off('ui:population:worker-request-failed', handleWorkerRequestFailed)
			EventBus.off('ui:population:settler-updated', checkWorkerMovingToBuilding)
			EventBus.off('ui:population:worker-assigned', handleWorkerAssigned)
			EventBus.off('ui:population:worker-unassigned', handleWorkerUnassigned)
			EventBus.off('ui:storage:updated', handleStorageUpdated)
			EventBus.off('ui:production:updated', handleProductionUpdated)
		}
	}, [buildingInstance])

	const handleCancelConstruction = () => {
		if (buildingInstance && (buildingInstance.stage === ConstructionStage.CollectingResources || buildingInstance.stage === ConstructionStage.Constructing)) {
			EventBus.emit(Event.Buildings.CS.Cancel, {
				buildingInstanceId: buildingInstance.id
			})
		}
	}

	const handleClose = () => {
		if (buildingInstance) {
			EventBus.emit('ui:building:highlight', { buildingInstanceId: buildingInstance.id, highlighted: false })
		}
		setIsVisible(false)
		setBuildingInstance(null)
		setBuildingDefinition(null)
		EventBus.emit('ui:building:close')
	}

	if (!isVisible || !buildingInstance || !buildingDefinition) {
		return null
	}

	const canCancel = buildingInstance.stage === ConstructionStage.CollectingResources || buildingInstance.stage === ConstructionStage.Constructing
	const isCompleted = buildingInstance.stage === ConstructionStage.Completed
	const isConstructing = buildingInstance.stage === ConstructionStage.Constructing
	const isCollectingResources = buildingInstance.stage === ConstructionStage.CollectingResources
	const hasWorkerSlots = buildingDefinition.workerSlots !== undefined
	const canPauseWork = Boolean(buildingDefinition.productionRecipe || buildingDefinition.harvest || buildingDefinition.farm)
	const settlers = populationService.getSettlers()
	const assignedWorkers = settlers.filter(
		settler => settler.buildingId === buildingInstance.id && Boolean(settler.stateContext.assignmentId)
	)
	const workingWorkers = assignedWorkers.filter(
		settler => settler.state === SettlerState.Working || settler.state === SettlerState.Harvesting
	)
	const movingWorkers = assignedWorkers.filter(
		settler => settler.state === SettlerState.MovingToBuilding || settler.state === SettlerState.MovingToResource || settler.state === SettlerState.MovingToTool
	)
	const workerCount = assignedWorkers.length
	const maxWorkers = buildingDefinition.workerSlots || 0
	// Buildings only need workers during Constructing stage (builders) or Completed stage (production workers)
	// During CollectingResources, carriers are automatically requested by the system
	const needsWorkers = buildingInstance.stage === ConstructionStage.Constructing ||
		(isCompleted && hasWorkerSlots && workerCount < maxWorkers)
	const requiredProfessionLabel = isConstructing ? 'builder' : buildingDefinition.requiredProfession
	const hasRequiredProfession = requiredProfessionLabel !== undefined
	const workAreaRadiusTiles = buildingDefinition.farm?.plotRadiusTiles ?? buildingDefinition.harvest?.radiusTiles
	const canSelectWorkArea = isCompleted && typeof workAreaRadiusTiles === 'number' && workAreaRadiusTiles > 0

	// Get resource collection progress from building definition costs and collected resources
	const requiredResources = buildingDefinition.costs || []
	const collectedResources = (buildingInstance.collectedResources as Record<string, number>) || {}

	const handleRequestWorker = () => {
		if (buildingInstance) {
			setErrorMessage(null) // Clear previous errors
			setWorkerStatus(null) // Clear previous status
			populationService.requestWorker(buildingInstance.id)
		}
	}

	const handleSelectWorkArea = () => {
		if (buildingInstance) {
			EventBus.emit('ui:building:work-area:select', { buildingInstanceId: buildingInstance.id })
		}
	}

	const professionLabels: Record<ProfessionType, string> = {
		[ProfessionType.Carrier]: 'Carrier',
		[ProfessionType.Builder]: 'Builder',
		[ProfessionType.Woodcutter]: 'Woodcutter',
		[ProfessionType.Miner]: 'Miner',
		[ProfessionType.Farmer]: 'Farmer',
		[ProfessionType.Miller]: 'Miller',
		[ProfessionType.Baker]: 'Baker'
	}

	const professionIcons: Record<ProfessionType, string> = {
		[ProfessionType.Carrier]: '👤',
		[ProfessionType.Builder]: '🔨',
		[ProfessionType.Woodcutter]: '🪓',
		[ProfessionType.Miner]: '⛏️',
		[ProfessionType.Farmer]: '🌾',
		[ProfessionType.Miller]: '🌬️',
		[ProfessionType.Baker]: '🥖'
	}

	const formatWaitReason = (reason?: string): string | null => {
		if (!reason) {
			return null
		}
		const withSpaces = reason.replace(/_/g, ' ')
		return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1)
	}

	const getWorkerStatusLabel = (settler: Settler): string => {
		switch (settler.state) {
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
			case SettlerState.MovingHome:
				return '🏠 Going Home'
			case SettlerState.Working:
				return '🔨 Working'
			case SettlerState.WaitingForWork:
				return `⏳ Waiting${settler.stateContext.waitReason ? ` (${formatWaitReason(settler.stateContext.waitReason)})` : ''}`
			case SettlerState.Packing:
				return '📦 Packing'
			case SettlerState.Unpacking:
				return '📦 Unpacking'
			case SettlerState.MovingToItem:
				return '🚶 Moving to Item'
			case SettlerState.MovingToResource:
				return '🚶 Moving to Resource'
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

	const getWorkerProblemReason = (settler: Settler): string | null => {
		if (settler.state === SettlerState.AssignmentFailed) {
			return settler.stateContext.errorReason || 'Assignment failed'
		}
		if (settler.stateContext.errorReason) {
			return settler.stateContext.errorReason
		}
		return null
	}

	const handleWorkerClick = (settlerId: string) => {
		EventBus.emit('ui:settler:click', { settlerId })
	}

	const handleUnassignWorker = (settlerId: string) => {
		populationService.unassignWorker(settlerId)
	}

	return (
		<DraggablePanel
			icon={buildingDefinition.icon || '🏗️'}
			title={buildingDefinition.name}
			onClose={handleClose}
		>
			<div className={sharedStyles.description}>
				{buildingDefinition.description}
			</div>

			<div className={sharedStyles.info}>
				<div className={sharedStyles.infoRow}>
					<span className={sharedStyles.label}>Status:</span>
					<span className={sharedStyles.value}>
						{isCompleted ? '✅ Completed' : isConstructing ? '🔨 Under Construction' : isCollectingResources ? '📦 Collecting Resources' : '🏗️ Foundation'}
					</span>
				</div>

				{isCollectingResources && requiredResources.length > 0 && (
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Resources:</span>
						<span className={sharedStyles.value}>
							<div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
								{requiredResources.map((cost, index) => {
									const collected = collectedResources[cost.itemType] || 0
									const required = cost.quantity
									const isComplete = collected >= required
									return (
										<div key={index} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
											<ItemEmoji itemType={cost.itemType} />
											<span style={{ color: isComplete ? '#4caf50' : '#fff' }}>
												{collected}/{required} {cost.itemType}
											</span>
										</div>
									)
								})}
							</div>
						</span>
					</div>
				)}

				{buildingInstance.stage === ConstructionStage.Constructing && (
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Construction Progress:</span>
						<span className={sharedStyles.value}>{Math.round(buildingInstance.progress)}%</span>
					</div>
				)}
			</div>

			{(hasWorkerSlots || assignedWorkers.length > 0) && (
				<div className={sharedStyles.info}>
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Workers:</span>
						<span className={sharedStyles.value}>
							{workerCount}
							{(workingWorkers.length > 0 || movingWorkers.length > 0) && (
								` (${workingWorkers.length} active${movingWorkers.length > 0 ? `, ${movingWorkers.length} en route` : ''})`
							)}
							{hasWorkerSlots && ` / ${maxWorkers}`}
						</span>
					</div>
					{workerCount > 0 ? (
						<div className={sharedStyles.workerList}>
							{assignedWorkers.map((settler, index) => {
								const problemReason = getWorkerProblemReason(settler)
								return (
									<div key={settler.id} className={sharedStyles.workerRow}>
										<button
											type="button"
											className={sharedStyles.workerRowButton}
											onClick={() => handleWorkerClick(settler.id)}
											title="Open settler details"
										>
											<span className={sharedStyles.workerInfo}>
												<span className={sharedStyles.workerIcon}>{professionIcons[settler.profession]}</span>
												<span className={sharedStyles.workerName} title={settler.id}>
													{professionLabels[settler.profession]} #{index + 1}
												</span>
											</span>
											<span className={sharedStyles.workerMeta}>
												{getWorkerStatusLabel(settler)}
												{problemReason && (
													<span className={sharedStyles.workerDanger} title={problemReason}>⚠️</span>
												)}
											</span>
										</button>
										<button
											type="button"
											className={sharedStyles.workerUnassignButton}
											onClick={() => handleUnassignWorker(settler.id)}
											title="Unassign worker"
										>
											✕
										</button>
									</div>
								)
							})}
						</div>
					) : (
						<div className={sharedStyles.workerHint}>
							No workers assigned yet
						</div>
					)}
				</div>
			)}

			{needsWorkers && (
				<div className={sharedStyles.actions}>
					{hasRequiredProfession && (
						<div className={sharedStyles.infoRow}>
							<span className={sharedStyles.label}>Required Profession:</span>
							<span className={sharedStyles.value}>{requiredProfessionLabel}</span>
						</div>
					)}
					{isConstructing && (
						<div className={sharedStyles.workerHint}>
							🔍 Searching for available builder...
						</div>
					)}
					{isCompleted && hasWorkerSlots && workerCount < maxWorkers && (
						<>
							<button
								className={sharedStyles.requestWorkerButton}
								onClick={handleRequestWorker}
								disabled={workerCount >= maxWorkers}
							>
								Request Worker
							</button>
							{errorMessage && (
								<div className={sharedStyles.errorMessage}>
									⚠️ {errorMessage}
								</div>
							)}
							{workerStatus && !errorMessage && (
								<div className={sharedStyles.workerStatus}>
									{workerStatus}
								</div>
							)}
							{!errorMessage && !workerStatus && (
								<div className={sharedStyles.workerHint}>
									Workers will operate this building
								</div>
							)}
						</>
					)}
				</div>
			)}

			{canCancel && (
				<div className={sharedStyles.actions}>
					<button className={sharedStyles.cancelButton} onClick={handleCancelConstruction}>
						Cancel Construction
					</button>
					<div className={sharedStyles.cancelHint}>
						Resources will be refunded to your inventory
					</div>
				</div>
			)}

			{isCompleted && buildingDefinition.storage && (
				<div className={sharedStyles.info}>
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Buffer:</span>
						<span className={sharedStyles.value}>
							<div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
								{(resourceTypes.length > 0 ? resourceTypes : Object.keys(buildingDefinition.storage.capacities))
									.filter((itemType) => (buildingDefinition.storage?.capacities[itemType] || 0) > 0)
									.map((itemType) => {
										const capacity = buildingDefinition.storage!.capacities[itemType]
										const quantity = storageService.getItemQuantity(buildingInstance.id, itemType)
										const percentage = capacity > 0 ? Math.round((quantity / capacity) * 100) : 0
										return (
											<div key={itemType} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
												<ItemEmoji itemType={itemType} />
												<span>
													{quantity}/{capacity} {itemType} ({percentage}%)
												</span>
											</div>
										)
									})}
							</div>
						</span>
					</div>
				</div>
			)}

			{isCompleted && buildingDefinition.productionRecipe && (
				<div className={sharedStyles.info}>
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Production:</span>
						<span className={sharedStyles.value}>
							{(() => {
								const production = productionService.getBuildingProduction(buildingInstance.id)
								const status = production?.status || ProductionStatus.Idle
								const progress = production?.progress || 0
								const isPaused = status === ProductionStatus.Paused
								
								let statusContent: React.ReactNode
								if (status === ProductionStatus.InProduction) {
									statusContent = (
										<div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
											<span>🔄 Producing... {Math.round(progress)}%</span>
											<div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
												<span style={{ fontSize: '0.9em' }}>Inputs:</span>
												{buildingDefinition.productionRecipe.inputs.map((input, idx) => (
													<div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
														<ItemEmoji itemType={input.itemType} />
														<span>{input.quantity}x {input.itemType}</span>
													</div>
												))}
												<span style={{ fontSize: '0.9em', marginTop: '4px' }}>Outputs:</span>
												{buildingDefinition.productionRecipe.outputs.map((output, idx) => (
													<div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
														<ItemEmoji itemType={output.itemType} />
														<span>{output.quantity}x {output.itemType}</span>
													</div>
												))}
											</div>
										</div>
									)
								} else if (status === ProductionStatus.NoInput) {
									statusContent = (
										<div>
											<span>⏸️ Waiting for inputs</span>
											<div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
												{buildingDefinition.productionRecipe.inputs.map((input, idx) => (
													<div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
														<ItemEmoji itemType={input.itemType} />
														<span>Need {input.quantity}x {input.itemType}</span>
													</div>
												))}
											</div>
										</div>
									)
								} else if (status === ProductionStatus.NoWorker) {
									statusContent = <span>👷 Needs worker</span>
								} else if (status === ProductionStatus.Paused) {
									statusContent = <span>⏸️ Paused</span>
								} else {
									statusContent = <span>✅ Idle</span>
								}

								return (
									<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
										{statusContent}
										<button
											className={sharedStyles.actionButton}
											onClick={() => buildingService.setProductionPaused(buildingInstance.id, !isPaused)}
										>
											{isPaused ? 'Resume Production' : 'Pause Production'}
										</button>
									</div>
								)
							})()}
						</span>
					</div>
				</div>
			)}

			{isCompleted && !buildingDefinition.productionRecipe && canPauseWork && (
				<div className={sharedStyles.info}>
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Work:</span>
						<span className={sharedStyles.value}>
							{(() => {
								const status = productionService.getProductionStatus(buildingInstance.id)
								const isPaused = status === ProductionStatus.Paused
								let statusLabel = '✅ Active'
								if (status === ProductionStatus.Paused) {
									statusLabel = '⏸️ Paused'
								} else if (status === ProductionStatus.NoWorker) {
									statusLabel = '👷 Needs worker'
								}
								return (
									<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
										<span>{statusLabel}</span>
										<button
											className={sharedStyles.actionButton}
											onClick={() => buildingService.setProductionPaused(buildingInstance.id, !isPaused)}
										>
											{isPaused ? 'Resume Work' : 'Pause Work'}
										</button>
									</div>
								)
							})()}
						</span>
					</div>
				</div>
			)}

			{canSelectWorkArea && (
				<div className={sharedStyles.info}>
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Work Area:</span>
						<span className={sharedStyles.value}>
							<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
								<span>Radius: {workAreaRadiusTiles} tiles</span>
								<button
									className={sharedStyles.actionButton}
									onClick={handleSelectWorkArea}
								>
									Select Work Area
								</button>
							</div>
						</span>
					</div>
				</div>
			)}

			{isCompleted && !buildingDefinition.storage && !buildingDefinition.productionRecipe && !buildingDefinition.harvest && !buildingDefinition.farm && (
				<div className={sharedStyles.actions}>
					<div className={sharedStyles.completedMessage}>
						Building is ready for use
					</div>
				</div>
			)}
		</DraggablePanel>
	)
}
