import { StateTransition } from './types'
import { SettlerState, ProfessionType } from '../types'
import { JobType } from '../../Jobs/types'
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
		if (!managers.jobs) {
			return false
		}
		const job = managers.jobs.getJob(context.jobId)
		return !!job && job.jobType === JobType.Transport
	},
	
	action: (settler, context, managers) => {
		if (!managers.jobs) {
			throw new Error(`[Idle_MovingToItem] JobsManager not available`)
		}
		const job = managers.jobs.getJob(context.jobId)
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
			const sourceBuilding = managers.buildings.getBuildingInstance(job.sourceBuildingInstanceId)
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

		const movementStarted = managers.movement.moveToPosition(settler.id, targetPosition, {
			targetType,
			targetId
		})
		managers.logger.log(`[MOVEMENT REQUESTED] Idle -> MovingToItem | settler=${settler.id} | movementStarted=${movementStarted}`)
		if (!movementStarted) {
			const currentPosition = managers.movement.getEntityPosition(settler.id) || settler.position
			setTimeout(() => {
				managers.event.emit(Receiver.All, MovementEvents.SS.StepComplete, {
					entityId: settler.id,
					position: currentPosition
				})
				managers.event.emit(Receiver.All, MovementEvents.SS.PathComplete, {
					entityId: settler.id,
					targetType,
					targetId
				})
			}, 0)
		}
	},
	
	completed: (settler, managers) => {
		if (!managers.jobs) {
			return null
		}
		return managers.jobs.handleSettlerArrival(settler)
	}
}
