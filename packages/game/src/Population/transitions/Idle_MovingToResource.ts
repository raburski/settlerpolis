import { StateTransition } from './types'
import { SettlerState } from '../types'
import { JobType } from '../../Jobs/types'

export interface MovingToResourceContext {
	jobId: string
}

export const Idle_MovingToResource: StateTransition<MovingToResourceContext> = {
	condition: (settler, context) => {
		return context.jobId !== undefined
	},

	validate: (settler, context, managers) => {
		if (!managers.jobs || !managers.resourceNodes) {
			return false
		}
		const job = managers.jobs.getJob(context.jobId)
		if (!job || job.jobType !== JobType.Harvest || !job.resourceNodeId) {
			return false
		}
		const node = managers.resourceNodes.getNode(job.resourceNodeId)
		if (!node) {
			return false
		}

		const path = managers.map.findPath(settler.mapName, settler.position, node.position)
		if (!path || path.length === 0) {
			managers.jobs.cancelJob(context.jobId, 'path_not_found', { skipSettlerReset: true })
			if (settler.stateContext.jobId === context.jobId) {
				settler.stateContext = {}
			}
			return false
		}

		return true
	},

	action: (settler, context, managers) => {
		if (!managers.jobs || !managers.resourceNodes) {
			throw new Error('[Idle_MovingToResource] JobsManager or ResourceNodesManager not available')
		}

		const job = managers.jobs.getJob(context.jobId)
		if (!job || job.jobType !== JobType.Harvest || !job.resourceNodeId) {
			throw new Error(`[Idle_MovingToResource] Job ${context.jobId} not found or not a harvest job`)
		}

		const node = managers.resourceNodes.getNode(job.resourceNodeId)
		if (!node) {
			throw new Error(`[Idle_MovingToResource] Resource node ${job.resourceNodeId} not found`)
		}

		managers.logger.log(`[TRANSITION ACTION] Idle -> MovingToResource | settler=${settler.id} | jobId=${context.jobId} | nodeId=${node.id}`)

		const movementStarted = managers.movement.moveToPosition(settler.id, node.position, {
			targetType: 'resource',
			targetId: node.id
		})
		managers.logger.log(`[MOVEMENT REQUESTED] Idle -> MovingToResource | settler=${settler.id} | movementStarted=${movementStarted}`)
		if (!movementStarted) {
			managers.jobs.cancelJob(context.jobId, 'movement_failed', { skipSettlerReset: true })
			if (settler.stateContext.jobId === context.jobId) {
				settler.stateContext = {}
			}
			return
		}

		settler.state = SettlerState.MovingToResource
		settler.stateContext = {
			jobId: context.jobId,
			targetId: node.id,
			targetPosition: node.position,
			targetType: 'resource'
		}
	},

	completed: (settler, managers) => {
		if (!managers.jobs) {
			return null
		}
		return managers.jobs.handleSettlerArrival(settler)
	}
}
