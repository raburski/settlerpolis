import { StateTransition } from './types'
import { SettlerState, JobType } from '../types'
import { Receiver } from '../../Receiver'
import { MovementEvents } from '../../Movement/events'

export interface ResourceArrivalContext {
	jobId: string
}

export const MovingToResource_CarryingItem: StateTransition<ResourceArrivalContext> = {
	condition: (settler, context) => {
		return settler.stateContext.jobId === context.jobId
	},

	validate: (settler, context, managers) => {
		if (!managers.jobsManager) {
			return false
		}
		const job = managers.jobsManager.getJob(context.jobId)
		return !!job && job.jobType === JobType.Harvest
	},

	action: (settler, context, managers) => {
		const job = managers.jobsManager!.getJob(context.jobId)
		if (!job) {
			throw new Error(`[MovingToResource_CarryingItem] Job ${context.jobId} not found`)
		}

		const buildingPosition = managers.buildingManager.getBuildingPosition(job.buildingInstanceId)
		if (!buildingPosition) {
			throw new Error(`[MovingToResource_CarryingItem] Building ${job.buildingInstanceId} not found`)
		}

		settler.state = SettlerState.CarryingItem
		settler.stateContext = {
			jobId: context.jobId,
			targetId: job.buildingInstanceId,
			targetPosition: buildingPosition,
			targetType: 'building'
		}

		const movementStarted = managers.movementManager.moveToPosition(settler.id, buildingPosition, {
			targetType: 'building',
			targetId: job.buildingInstanceId
		})
		managers.logger.log(`[MOVEMENT REQUESTED] Harvest -> CarryingItem | settler=${settler.id} | movementStarted=${movementStarted}`)
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
					targetId: job.buildingInstanceId
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
