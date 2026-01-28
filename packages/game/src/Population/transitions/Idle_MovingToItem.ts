import { StateTransition } from './types'
import { SettlerState, ProfessionType, JobType } from '../types'
import { Receiver } from '../../Receiver'
import { MovementEvents } from '../../Movement/events'
import { Position } from '../../types'

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
		return !!job && job.jobType === JobType.Transport
	},
	
	action: (settler, context, managers) => {
		if (!managers.jobsManager) {
			throw new Error(`[Idle_MovingToItem] JobsManager not available`)
		}
		const job = managers.jobsManager.getJob(context.jobId)
		if (!job) {
			throw new Error(`[Idle_MovingToItem] Job ${context.jobId} not found`)
		}

		let targetId: string
		let targetPosition: Position
		let targetType: string

		if (job.sourceItemId && job.sourcePosition) {
			targetId = job.sourceItemId
			targetPosition = job.sourcePosition
			targetType = 'item'
		} else if (job.sourceBuildingInstanceId) {
			const sourceBuilding = managers.buildingManager.getBuildingInstance(job.sourceBuildingInstanceId)
			if (!sourceBuilding) {
				throw new Error(`[Idle_MovingToItem] Source building ${job.sourceBuildingInstanceId} not found`)
			}
			targetId = job.sourceBuildingInstanceId
			targetPosition = sourceBuilding.position
			targetType = 'building'
		} else {
			throw new Error(`[Idle_MovingToItem] Job ${context.jobId} missing source data`)
		}

		managers.logger.log(`[TRANSITION ACTION] Idle -> MovingToItem | settler=${settler.id} | jobId=${context.jobId} | targetId=${targetId}`)

		settler.state = SettlerState.MovingToItem
		settler.stateContext = {
			jobId: context.jobId,
			targetId,
			targetPosition,
			targetType
		}

		const movementStarted = managers.movementManager.moveToPosition(settler.id, targetPosition, {
			targetType,
			targetId
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
					targetType,
					targetId
				})
			}, 0)
		}
	},
	
	completed: (settler, managers) => {
		if (!managers.jobsManager) {
			return null
		}
		return managers.jobsManager.handleSettlerArrival(settler)
	}
}
