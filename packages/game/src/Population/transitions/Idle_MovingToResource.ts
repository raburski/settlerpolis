import { StateTransition } from './types'
import { SettlerState, JobType } from '../types'
import { Receiver } from '../../Receiver'
import { MovementEvents } from '../../Movement/events'

export interface MovingToResourceContext {
	jobId: string
}

export const Idle_MovingToResource: StateTransition<MovingToResourceContext> = {
	condition: (settler, context) => {
		return context.jobId !== undefined
	},

	validate: (settler, context, managers) => {
		if (!managers.jobsManager || !managers.resourceNodesManager) {
			return false
		}
		const job = managers.jobsManager.getJob(context.jobId)
		if (!job || job.jobType !== JobType.Harvest || !job.resourceNodeId) {
			return false
		}
		const node = managers.resourceNodesManager.getNode(job.resourceNodeId)
		return node !== undefined
	},

	action: (settler, context, managers) => {
		if (!managers.jobsManager || !managers.resourceNodesManager) {
			throw new Error('[Idle_MovingToResource] JobsManager or ResourceNodesManager not available')
		}

		const job = managers.jobsManager.getJob(context.jobId)
		if (!job || job.jobType !== JobType.Harvest || !job.resourceNodeId) {
			throw new Error(`[Idle_MovingToResource] Job ${context.jobId} not found or not a harvest job`)
		}

		const node = managers.resourceNodesManager.getNode(job.resourceNodeId)
		if (!node) {
			throw new Error(`[Idle_MovingToResource] Resource node ${job.resourceNodeId} not found`)
		}

		managers.logger.log(`[TRANSITION ACTION] Idle -> MovingToResource | settler=${settler.id} | jobId=${context.jobId} | nodeId=${node.id}`)

		settler.state = SettlerState.MovingToResource
		settler.stateContext = {
			jobId: context.jobId,
			targetId: node.id,
			targetPosition: node.position,
			targetType: 'resource'
		}

		const movementStarted = managers.movementManager.moveToPosition(settler.id, node.position, {
			targetType: 'resource',
			targetId: node.id
		})
		managers.logger.log(`[MOVEMENT REQUESTED] Idle -> MovingToResource | settler=${settler.id} | movementStarted=${movementStarted}`)
		if (!movementStarted) {
			const currentPosition = managers.movementManager.getEntityPosition(settler.id) || settler.position
			setTimeout(() => {
				managers.eventManager.emit(Receiver.All, MovementEvents.SS.StepComplete, {
					entityId: settler.id,
					position: currentPosition
				})
				managers.eventManager.emit(Receiver.All, MovementEvents.SS.PathComplete, {
					entityId: settler.id,
					targetType: 'resource',
					targetId: node.id
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
