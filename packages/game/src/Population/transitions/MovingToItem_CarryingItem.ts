import { StateTransition } from './types'
import { SettlerState } from '../types'
import { JobType } from '../../Jobs/types'
import { Receiver } from '../../Receiver'
import { MovementEvents } from '../../Movement/events'

export interface ItemPickupContext {
	jobId: string
}

export const MovingToItem_CarryingItem: StateTransition<ItemPickupContext> = {
	condition: (settler, context) => {
		return settler.stateContext.jobId === context.jobId
	},
	
	validate: (settler, context, managers) => {
		if (!managers.jobs) {
			return false
		}
		const job = managers.jobs.getJob(context.jobId)
		return !!job && job.jobType === JobType.Transport
	},
	
	action: (settler, context, managers) => {
		const job = managers.jobs!.getJob(context.jobId)
		if (!job) {
			throw new Error(`[MovingToItem_CarryingItem] Job ${context.jobId} not found`)
		}

		const buildingPosition = managers.buildings.getBuildingPosition(job.buildingInstanceId)
		if (!buildingPosition) {
			throw new Error(`[MovingToItem_CarryingItem] Building ${job.buildingInstanceId} not found`)
		}

		managers.logger.log(`[TRANSITION ACTION] MovingToItem -> CarryingItem | settler=${settler.id} | jobId=${context.jobId} | buildingId=${job.buildingInstanceId}`)

		settler.state = SettlerState.CarryingItem
		settler.stateContext = {
			jobId: context.jobId,
			targetId: job.buildingInstanceId,
			targetPosition: buildingPosition,
			targetType: 'building',
			carryingItemType: job.itemType
		}

		const movementStarted = managers.movement.moveToPosition(settler.id, buildingPosition, {
			targetType: 'building',
			targetId: job.buildingInstanceId
		})
		managers.logger.log(`[MOVEMENT REQUESTED] MovingToItem -> CarryingItem | settler=${settler.id} | movementStarted=${movementStarted}`)
		if (!movementStarted) {
			const currentPosition = managers.movement.getEntityPosition(settler.id) || settler.position
			setTimeout(() => {
				managers.event.emit(Receiver.All, MovementEvents.SS.StepComplete, {
					entityId: settler.id,
					position: currentPosition
				})
				managers.event.emit(Receiver.All, MovementEvents.SS.PathComplete, {
					entityId: settler.id,
					targetType: 'building',
					targetId: job.buildingInstanceId
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
