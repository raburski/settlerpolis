import { StateTransition } from './types'
import { SettlerState, ProfessionType, JobType } from '../types'
import { Receiver } from '../../Receiver'
import { PopulationEvents } from '../events'

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
		
		// Verify item exists (check LootManager)
		if (!job.sourceItemId || !job.sourcePosition) {
			return false
		}
		const mapItems = managers.lootManager.getMapItems(settler.mapName)
		const item = mapItems.find((item: any) => item.id === job.sourceItemId)
		return item !== undefined
	},
	
	action: (settler, context, managers) => {
		// Get job to get item details
		if (!managers.jobsManager) {
			throw new Error(`[Idle_MovingToItem] JobsManager not available`)
		}
		const job = managers.jobsManager.getJob(context.jobId)
		if (!job || !job.sourceItemId || !job.sourcePosition) {
			throw new Error(`[Idle_MovingToItem] Job ${context.jobId} not found or missing source item`)
		}
		
		managers.logger.log(`[TRANSITION ACTION] Idle -> MovingToItem | settler=${settler.id} | jobId=${context.jobId} | itemId=${job.sourceItemId} | itemPosition=(${Math.round(job.sourcePosition.x)},${Math.round(job.sourcePosition.y)})`)
		
		// Update state
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

		const itemId = job.sourceItemId
		if (!itemId) {
			managers.logger.error(`[Idle_MovingToItem.completed] No sourceItemId in job ${jobId}`)
			// Clear settler state and emit event
			settler.state = SettlerState.Idle
			settler.stateContext = {}
			settler.currentJob = undefined
			managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
				settler
			}, settler.mapName)
			return null
		}

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
		job.carriedItemId = itemId
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
	}
}

