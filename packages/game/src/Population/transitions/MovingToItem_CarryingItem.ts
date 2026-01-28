import { StateTransition } from './types'
import { SettlerState, JobType, Settler, JobAssignment } from '../types'
import { Receiver } from '../../Receiver'
import { PopulationEvents } from '../events'
import { StateMachineManagers } from './types'
import { EventClient } from '../../events'
import { ConstructionStage } from '../../Buildings/types'

export interface ItemPickupContext {
	jobId: string
	// Note: itemId, buildingInstanceId, itemType can be looked up from JobAssignment using jobId
}

/**
 * Helper function to handle job cancellation gracefully
 * Drops item if carrying, cancels job, and clears settler state
 * Emits SettlerUpdated event to notify frontend of state change
 */
function handleJobCancellation(settler: Settler, job: JobAssignment, managers: StateMachineManagers): void {
	// Drop item if carrying
	if (job.carriedItemId && job.itemType) {
		// Check if this is a building storage item (no physical item) or ground item
		if (job.carriedItemId.startsWith('building-')) {
			// Building storage item - return to source building storage if possible
			// Otherwise, drop as ground item
			if (job.sourceBuildingInstanceId && managers.storageManager && job.quantity) {
				// Try to return items to source building storage
				const returned = managers.storageManager.addToStorage(job.sourceBuildingInstanceId, job.itemType, job.quantity)
				if (returned) {
					managers.logger.log(`[JOB CANCELLATION] Returned ${job.quantity} ${job.itemType} to source building ${job.sourceBuildingInstanceId} storage`)
				} else {
					// Failed to return - drop as ground item
					const fakeClient: EventClient = {
						id: settler.playerId,
						currentGroup: settler.mapName,
						emit: (receiver: any, event: string, data: any, target?: any) => {
							managers.eventManager.emit(receiver, event, data, target)
						},
						setGroup: () => {
							// No-op for fake client
						}
					}
					
					// Drop item at settler's current position
					const item = {
						id: job.carriedItemId,
						itemType: job.itemType
					}
					managers.lootManager.dropItem(item, settler.position, fakeClient)
					managers.logger.log(`[JOB CANCELLATION] Dropped item ${job.carriedItemId} (${job.itemType}) at settler position (${Math.round(settler.position.x)}, ${Math.round(settler.position.y)})`)
				}
			} else {
				// No source building or storage manager - drop as ground item
				const fakeClient: EventClient = {
					id: settler.playerId,
					currentGroup: settler.mapName,
					emit: (receiver: any, event: string, data: any, target?: any) => {
						managers.eventManager.emit(receiver, event, data, target)
					},
					setGroup: () => {
						// No-op for fake client
					}
				}
				
				// Drop item at settler's current position
				const item = {
					id: job.carriedItemId,
					itemType: job.itemType
				}
				managers.lootManager.dropItem(item, settler.position, fakeClient)
				managers.logger.log(`[JOB CANCELLATION] Dropped item ${job.carriedItemId} (${job.itemType}) at settler position (${Math.round(settler.position.x)}, ${Math.round(settler.position.y)})`)
			}
		} else {
			// Ground item - drop at settler's current position
			const fakeClient: EventClient = {
				id: settler.playerId,
				currentGroup: settler.mapName,
				emit: (receiver: any, event: string, data: any, target?: any) => {
					managers.eventManager.emit(receiver, event, data, target)
				},
				setGroup: () => {
					// No-op for fake client
				}
			}
			
			// Drop item at settler's current position
			const item = {
				id: job.carriedItemId,
				itemType: job.itemType
			}
			managers.lootManager.dropItem(item, settler.position, fakeClient)
			managers.logger.log(`[JOB CANCELLATION] Dropped item ${job.carriedItemId} (${job.itemType}) at settler position (${Math.round(settler.position.x)}, ${Math.round(settler.position.y)})`)
		}
	}
	
	// Cancel job if not already cancelled
	if (job.status !== 'cancelled' && managers.jobsManager) {
		managers.jobsManager.cancelJob(job.jobId, 'building_cancelled')
	}
	
	// Clear settler state and return to Idle
	settler.state = SettlerState.Idle
	settler.stateContext = {}
	settler.currentJob = undefined
	
	// Emit SettlerUpdated event to notify frontend of state change
	managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
		settler
	}, settler.mapName)
	
	managers.logger.log(`[JOB CANCELLATION] Settler ${settler.id} returned to Idle state after job cancellation`)
}

export const MovingToItem_CarryingItem: StateTransition<ItemPickupContext> = {
	condition: (settler, context) => {
		// Settler has transport job and arrived at item
		return settler.stateContext.jobId === context.jobId
	},
	
	validate: (settler, context, managers) => {
		// Validate that job exists and is valid
		if (!managers.jobsManager) {
			return false
		}
		
		const job = managers.jobsManager.getJob(context.jobId)
		if (!job || job.jobType !== JobType.Transport) {
			return false
		}
		
		// Check if job was cancelled - if so, handle cancellation and don't proceed with transition
		if (job.status === 'cancelled') {
			managers.logger.log(`[MovingToItem_CarryingItem.validate] Job ${context.jobId} was cancelled - handling cancellation`)
			handleJobCancellation(settler, job, managers)
			return false // Don't proceed with transition
		}
		
		// Verify item was picked up
		if (!job.carriedItemId) {
			managers.logger.warn(`[MovingToItem_CarryingItem.validate] Item not picked up for job ${context.jobId}`)
			return false
		}
		
		// Check if building still exists
		const buildingPosition = managers.buildingManager.getBuildingPosition(job.buildingInstanceId)
		if (!buildingPosition) {
			managers.logger.warn(`[MovingToItem_CarryingItem.validate] Building ${job.buildingInstanceId} not found (likely cancelled) - handling cancellation`)
			handleJobCancellation(settler, job, managers)
			return false // Don't proceed with transition
		}
		
		return true
	},
	
	action: (settler, context, managers) => {
		// Get job to get building details (validation already checked these exist)
		const job = managers.jobsManager!.getJob(context.jobId)!
		
		// Get building position (validation already checked it exists)
		const buildingPosition = managers.buildingManager.getBuildingPosition(job.buildingInstanceId)!
		
		managers.logger.log(`[TRANSITION ACTION] MovingToItem -> CarryingItem | settler=${settler.id} | jobId=${context.jobId} | carriedItemId=${job.carriedItemId} | buildingId=${job.buildingInstanceId} | buildingPosition=(${Math.round(buildingPosition.x)},${Math.round(buildingPosition.y)})`)
		
		// Update state
		settler.state = SettlerState.CarryingItem
		settler.stateContext = {
			jobId: context.jobId,
			targetId: job.buildingInstanceId, // Target building for delivery
			targetPosition: buildingPosition
		}
		
		// Start movement to building
		const movementStarted = managers.movementManager.moveToPosition(settler.id, buildingPosition, {
			targetType: 'building',
			targetId: job.buildingInstanceId
		})
		managers.logger.log(`[MOVEMENT REQUESTED] MovingToItem -> CarryingItem | settler=${settler.id} | movementStarted=${movementStarted}`)
		
		// Note: StateMachine will emit SettlerUpdated event after successful transition
	},
	
	completed: (settler, managers) => {
		// Movement to building completed - deliver item and transition to Idle
		const jobId = settler.stateContext.jobId
		if (!jobId || !managers.jobsManager) {
			managers.logger.error(`[MovingToItem_CarryingItem.completed] No jobId or JobsManager not available`)
			// Clear settler state and return to Idle
			settler.state = SettlerState.Idle
			settler.stateContext = {}
			settler.currentJob = undefined
			// Emit SettlerUpdated event to notify frontend
			managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
				settler
			}, settler.mapName)
			return null
		}

		const job = managers.jobsManager.getJob(jobId)
		if (!job || job.jobType !== JobType.Transport) {
			managers.logger.error(`[MovingToItem_CarryingItem.completed] Job ${jobId} not found or not a transport job`)
			// Clear settler state and return to Idle
			settler.state = SettlerState.Idle
			settler.stateContext = {}
			settler.currentJob = undefined
			// Emit SettlerUpdated event to notify frontend
			managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
				settler
			}, settler.mapName)
			return null
		}

		// Check if job was cancelled
		if (job.status === 'cancelled') {
			managers.logger.log(`[MovingToItem_CarryingItem.completed] Job ${jobId} was cancelled - dropping item and returning to Idle`)
			handleJobCancellation(settler, job, managers)
			return null
		}

		if (!job.itemType || !job.buildingInstanceId) {
			managers.logger.error(`[MovingToItem_CarryingItem.completed] Job ${jobId} missing itemType or buildingInstanceId`)
			// Clear settler state and return to Idle
			settler.state = SettlerState.Idle
			settler.stateContext = {}
			settler.currentJob = undefined
			// Emit SettlerUpdated event to notify frontend
			managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
				settler
			}, settler.mapName)
			return null
		}

		// Check if building still exists before delivering
		const buildingExists = managers.buildingManager.getBuildingPosition(job.buildingInstanceId)
		if (!buildingExists) {
			managers.logger.warn(`[MovingToItem_CarryingItem.completed] Building ${job.buildingInstanceId} not found (likely cancelled) - dropping item and cancelling job`)
			// Building was cancelled - drop item and cancel job
			handleJobCancellation(settler, job, managers)
			return null
		}

		// Check if target building has storage (for production buildings) or is a construction site
		const building = managers.buildingManager.getBuildingInstance(job.buildingInstanceId)
		if (!building) {
			managers.logger.warn(`[MovingToItem_CarryingItem.completed] Building ${job.buildingInstanceId} not found - dropping item and cancelling job`)
			handleJobCancellation(settler, job, managers)
			return null
		}

		// Determine delivery method based on building stage and storage availability
		let delivered = false
		const quantity = job.quantity || 1 // Use job quantity (for building storage) or default to 1 (for ground items)

		if (building.stage === ConstructionStage.Completed && managers.storageManager) {
			// Completed building - check if it has storage
			if (managers.storageManager.acceptsItemType(job.buildingInstanceId, job.itemType)) {
				// Deliver to storage (building-to-building transport or ground-to-storage)
				delivered = managers.jobsManager.handleBuildingDelivery(jobId)
				if (!delivered) {
					managers.logger.warn(`[MovingToItem_CarryingItem.completed] Failed to deliver to storage for building ${job.buildingInstanceId} - dropping item and cancelling job`)
					handleJobCancellation(settler, job, managers)
					return null
				}
			} else {
				// Building is completed but has no storage for this item type
				// This shouldn't happen for building-to-building transport, but handle gracefully
				managers.logger.warn(`[MovingToItem_CarryingItem.completed] Building ${job.buildingInstanceId} does not accept item type ${job.itemType} - dropping item and cancelling job`)
				handleJobCancellation(settler, job, managers)
				return null
			}
		} else if (building.stage === ConstructionStage.CollectingResources || building.stage === ConstructionStage.Constructing) {
			// Construction site - deliver to BuildingManager
			// Quantity is always 1 for ground items
			delivered = managers.buildingManager.addResourceToBuilding(job.buildingInstanceId, job.itemType, 1)
			if (!delivered) {
				managers.logger.warn(`[MovingToItem_CarryingItem.completed] Failed to deliver item to construction site ${job.buildingInstanceId} - dropping item and cancelling job`)
				// Delivery failed (building might have been cancelled) - drop item and cancel job
				handleJobCancellation(settler, job, managers)
				return null
			}
		} else {
			managers.logger.warn(`[MovingToItem_CarryingItem.completed] Building ${job.buildingInstanceId} is in unexpected stage ${building.stage} - dropping item and cancelling job`)
			handleJobCancellation(settler, job, managers)
			return null
		}

		// Complete transport job (JobsManager handles job cleanup)
		managers.jobsManager.completeJob(jobId)

		// Clear job from settler (CarryingItem_Idle will clear stateContext)
		settler.currentJob = undefined

		// Transition to Idle state via CarryingItem_Idle transition
		return SettlerState.Idle
	}
}

