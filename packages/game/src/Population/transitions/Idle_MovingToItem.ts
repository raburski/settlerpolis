import { StateTransition } from './types'
import { SettlerState, ProfessionType, JobType } from '../types'
import { Receiver } from '../../Receiver'
import { PopulationEvents } from '../events'
import { MovementEvents } from '../../Movement/events'

export interface MovingToItemContext {
	jobId: string
	// Note: All job details (itemId, itemPosition, buildingInstanceId, itemType) are in JobAssignment
	// Look up job using jobId to get these details
}

export const Idle_MovingToItem: StateTransition<MovingToItemContext> = {
	condition: (settler, context) => {
		// Settler is Carrier and has a transport job
		return settler.profession === ProfessionType.Carrier && context.jobId !== undefined
	},
	
	validate: (settler, context, managers) => {
		// Verify job exists and is a transport job
		if (!managers.jobsManager) {
			return false
		}
		const job = managers.jobsManager.getJob(context.jobId)
		if (!job || job.jobType !== JobType.Transport) {
			return false
		}
		
		// Check if this is ground-to-building transport (sourceItemId) or building-to-building transport (sourceBuildingInstanceId)
		if (job.sourceItemId) {
			// Ground item - verify item exists (check LootManager)
			if (!job.sourcePosition) {
				return false
			}
			const mapItems = managers.lootManager.getMapItems(settler.mapName)
			const item = mapItems.find((item: any) => item.id === job.sourceItemId)
			return item !== undefined
		} else if (job.sourceBuildingInstanceId) {
			// Building storage - verify source building exists
			const sourceBuilding = managers.buildingManager.getBuildingInstance(job.sourceBuildingInstanceId)
			return sourceBuilding !== undefined
		}
		
		return false
	},
	
	action: (settler, context, managers) => {
		// Get job to get item/building details
		if (!managers.jobsManager) {
			throw new Error(`[Idle_MovingToItem] JobsManager not available`)
		}
		const job = managers.jobsManager.getJob(context.jobId)
		if (!job) {
			throw new Error(`[Idle_MovingToItem] Job ${context.jobId} not found`)
		}
		
		// Check if this is ground-to-building transport (sourceItemId) or building-to-building transport (sourceBuildingInstanceId)
		if (job.sourceItemId && job.sourcePosition) {
			// Ground item - move to item position
			managers.logger.log(`[TRANSITION ACTION] Idle -> MovingToItem | settler=${settler.id} | jobId=${context.jobId} | itemId=${job.sourceItemId} | itemPosition=(${Math.round(job.sourcePosition.x)},${Math.round(job.sourcePosition.y)})`)
			
			settler.state = SettlerState.MovingToItem
			settler.stateContext = {
				jobId: context.jobId,
				targetId: job.sourceItemId,
				targetPosition: job.sourcePosition
			}
			
			// Start movement to item
			const movementStarted = managers.movementManager.moveToPosition(settler.id, job.sourcePosition, {
				targetType: 'item',
				targetId: job.sourceItemId
			})
			managers.logger.log(`[MOVEMENT REQUESTED] Idle -> MovingToItem | settler=${settler.id} | movementStarted=${movementStarted}`)
			if (!movementStarted) {
				const currentPosition = managers.movementManager.getEntityPosition(settler.id) || settler.position
				setTimeout(() => {
					managers.eventManager.emit(Receiver.All, MovementEvents.SS.StepComplete, {
						entityId: settler.id,
						position: currentPosition
					})
					managers.eventManager.emit(Receiver.All, MovementEvents.SS.PathComplete, {
						entityId: settler.id,
						targetType: 'item',
						targetId: job.sourceItemId
					})
				}, 0)
			}
		} else if (job.sourceBuildingInstanceId) {
			// Building storage - move to source building position
			const sourceBuilding = managers.buildingManager.getBuildingInstance(job.sourceBuildingInstanceId)
			if (!sourceBuilding) {
				throw new Error(`[Idle_MovingToItem] Source building ${job.sourceBuildingInstanceId} not found`)
			}
			
			managers.logger.log(`[TRANSITION ACTION] Idle -> MovingToItem | settler=${settler.id} | jobId=${context.jobId} | sourceBuilding=${job.sourceBuildingInstanceId} | buildingPosition=(${Math.round(sourceBuilding.position.x)},${Math.round(sourceBuilding.position.y)})`)
			
			settler.state = SettlerState.MovingToItem
			settler.stateContext = {
				jobId: context.jobId,
				targetId: job.sourceBuildingInstanceId,
				targetPosition: sourceBuilding.position
			}
			
			// Start movement to source building
			const movementStarted = managers.movementManager.moveToPosition(settler.id, sourceBuilding.position, {
				targetType: 'building',
				targetId: job.sourceBuildingInstanceId
			})
			managers.logger.log(`[MOVEMENT REQUESTED] Idle -> MovingToItem | settler=${settler.id} | movementStarted=${movementStarted}`)
			if (!movementStarted) {
				const currentPosition = managers.movementManager.getEntityPosition(settler.id) || settler.position
				setTimeout(() => {
					managers.eventManager.emit(Receiver.All, MovementEvents.SS.StepComplete, {
						entityId: settler.id,
						position: currentPosition
					})
					managers.eventManager.emit(Receiver.All, MovementEvents.SS.PathComplete, {
						entityId: settler.id,
						targetType: 'building',
						targetId: job.sourceBuildingInstanceId
					})
				}, 0)
			}
		} else {
			throw new Error(`[Idle_MovingToItem] Job ${context.jobId} missing sourceItemId or sourceBuildingInstanceId`)
		}
		
		// Note: StateMachine will emit SettlerUpdated event after successful transition
	},
	
	completed: (settler, managers) => {
		// Movement completed - pick up item and transition to CarryingItem
		const jobId = settler.stateContext.jobId
		if (!jobId || !managers.jobsManager) {
			managers.logger.error(`[Idle_MovingToItem.completed] No jobId or JobsManager not available`)
			return null
		}

		const job = managers.jobsManager.getJob(jobId)
		if (!job || job.jobType !== JobType.Transport) {
			managers.logger.error(`[Idle_MovingToItem.completed] Job ${jobId} not found or not a transport job`)
			return null
		}

		// Check if job was cancelled
		if (job.status === 'cancelled') {
			managers.logger.log(`[Idle_MovingToItem.completed] Job ${jobId} was cancelled - returning to Idle`)
			// Job was cancelled - clear settler state (item not picked up yet, so no need to drop)
			settler.state = SettlerState.Idle
			settler.stateContext = {}
			settler.currentJob = undefined
			// Emit SettlerUpdated event to notify frontend
			managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
				settler
			}, settler.mapName)
			return null
		}

		// Check if this is ground-to-building transport or building-to-building transport
		if (job.sourceItemId) {
			// Ground item - pick up from LootManager
			const itemId = job.sourceItemId

			// Check if building still exists before picking up item
			const buildingPosition = managers.buildingManager.getBuildingPosition(job.buildingInstanceId)
			if (!buildingPosition) {
				managers.logger.warn(`[Idle_MovingToItem.completed] Building ${job.buildingInstanceId} not found (likely cancelled) - cancelling job`)
				// Building was cancelled - cancel job and return to Idle (item not picked up yet)
				managers.jobsManager.cancelJob(jobId, 'building_cancelled')
				settler.state = SettlerState.Idle
				settler.stateContext = {}
				settler.currentJob = undefined
				// Emit SettlerUpdated event to notify frontend
				managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
					settler
				}, settler.mapName)
				return null
			}

			// Pick up item from ground (using LootManager)
			// Create a fake client for LootManager
			const fakeClient: any = {
				id: settler.playerId,
				currentGroup: settler.mapName,
				emit: (receiver: any, event: string, data: any, target?: any) => {
					managers.eventManager.emit(receiver, event, data, target)
				},
				setGroup: () => {
					// No-op for fake client
				}
			}

			const pickedItem = managers.lootManager.pickItem(itemId, fakeClient)
			if (!pickedItem) {
				// Item was already picked up or doesn't exist - cancel job
				managers.logger.warn(`[Idle_MovingToItem.completed] Item ${itemId} not found, cancelling job ${jobId}`)
				managers.jobsManager.cancelJob(jobId, 'item_not_found')
				settler.state = SettlerState.Idle
				settler.stateContext = {}
				settler.currentJob = undefined
				// Emit SettlerUpdated event to notify frontend
				managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
					settler
				}, settler.mapName)
				return null
			}

			// Update job with carried item ID (item removed from LootManager)
			job.carriedItemId = pickedItem.id
			job.sourceItemId = undefined // Clear sourceItemId after pickup

			// Verify building still exists after picking up item (double-check in case it was cancelled during pickup)
			const buildingStillExists = managers.buildingManager.getBuildingPosition(job.buildingInstanceId)
			if (!buildingStillExists) {
				managers.logger.warn(`[Idle_MovingToItem.completed] Building ${job.buildingInstanceId} was cancelled after item pickup - dropping item and cancelling job`)
				// Building was cancelled - drop item and cancel job
				managers.lootManager.dropItem(pickedItem, settler.position, fakeClient)
				managers.jobsManager.cancelJob(jobId, 'building_cancelled')
				settler.state = SettlerState.Idle
				settler.stateContext = {}
				settler.currentJob = undefined
				// Emit SettlerUpdated event to notify frontend
				managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
					settler
				}, settler.mapName)
				return null
			}

			// Transition to CarryingItem state
			return SettlerState.CarryingItem
		} else if (job.sourceBuildingInstanceId) {
			// Building storage - remove items from source building storage
			const sourceBuilding = managers.buildingManager.getBuildingInstance(job.sourceBuildingInstanceId)
			if (!sourceBuilding) {
				managers.logger.warn(`[Idle_MovingToItem.completed] Source building ${job.sourceBuildingInstanceId} not found (likely cancelled) - cancelling job`)
				managers.jobsManager.cancelJob(jobId, 'building_cancelled')
				settler.state = SettlerState.Idle
				settler.stateContext = {}
				settler.currentJob = undefined
				managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
					settler
				}, settler.mapName)
				return null
			}

			// Check if target building still exists
			const targetBuilding = managers.buildingManager.getBuildingInstance(job.buildingInstanceId)
			if (!targetBuilding) {
				managers.logger.warn(`[Idle_MovingToItem.completed] Target building ${job.buildingInstanceId} not found (likely cancelled) - cancelling job`)
				managers.jobsManager.cancelJob(jobId, 'building_cancelled')
				settler.state = SettlerState.Idle
				settler.stateContext = {}
				settler.currentJob = undefined
				managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
					settler
				}, settler.mapName)
				return null
			}

			// Remove items from source building storage (using JobsManager)
			if (!managers.jobsManager.handleBuildingPickup(jobId)) {
				managers.logger.warn(`[Idle_MovingToItem.completed] Failed to pick up items from source building ${job.sourceBuildingInstanceId} - cancelling job`)
				managers.jobsManager.cancelJob(jobId, 'pickup_failed')
				settler.state = SettlerState.Idle
				settler.stateContext = {}
				settler.currentJob = undefined
				managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
					settler
				}, settler.mapName)
				return null
			}

			// Update job - carriedItemId is set by handleBuildingPickup, sourceBuildingInstanceId is cleared
			// Set carriedItemId if not already set (for tracking)
			if (!job.carriedItemId) {
				job.carriedItemId = `building-${job.sourceBuildingInstanceId}-${job.itemType}`
			}

			// Transition to CarryingItem state
			return SettlerState.CarryingItem
		} else {
			managers.logger.error(`[Idle_MovingToItem.completed] Job ${jobId} missing sourceItemId or sourceBuildingInstanceId`)
			settler.state = SettlerState.Idle
			settler.stateContext = {}
			settler.currentJob = undefined
			managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
				settler
			}, settler.mapName)
			return null
		}
	}
}
