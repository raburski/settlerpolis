import { StateTransition } from './types'
import { SettlerState, JobType } from '../types'
import { Receiver } from '../../Receiver'
import { PopulationEvents } from '../events'

export interface MovingToResourceContext {
	jobId: string
}

function resetSettler(settler: any, managers: any, jobIdToClear?: string): void {
	if (jobIdToClear && settler.currentJob?.jobId === jobIdToClear) {
		settler.currentJob = undefined
	}
	settler.state = SettlerState.Idle
	settler.stateContext = {}
	managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, { settler }, settler.mapName)
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
			targetPosition: node.position
		}

		const movementStarted = managers.movementManager.moveToPosition(settler.id, node.position, {
			targetType: 'resource',
			targetId: node.id
		})
		managers.logger.log(`[MOVEMENT REQUESTED] Idle -> MovingToResource | settler=${settler.id} | movementStarted=${movementStarted}`)
	},

	completed: (settler, managers) => {
		const jobId = settler.stateContext.jobId
		if (!jobId || !managers.jobsManager || !managers.resourceNodesManager) {
			managers.logger.error('[Idle_MovingToResource.completed] Missing jobId or managers')
			return null
		}

		const job = managers.jobsManager.getJob(jobId)
		if (!job || job.jobType !== JobType.Harvest || !job.resourceNodeId) {
			managers.logger.warn(`[Idle_MovingToResource.completed] Job ${jobId} not found or invalid`)
			return null
		}

		if (job.status === 'cancelled') {
			resetSettler(settler, managers, jobId)
			return null
		}

		const node = managers.resourceNodesManager.getNode(job.resourceNodeId)
		if (!node || node.remainingHarvests <= 0) {
			managers.jobsManager.cancelJob(jobId, 'node_not_found')
			resetSettler(settler, managers, jobId)
			return null
		}

		if (node.reservedBy && node.reservedBy !== jobId) {
			managers.jobsManager.cancelJob(jobId, 'node_reserved')
			resetSettler(settler, managers, jobId)
			return null
		}

		if (!node.reservedBy) {
			const reserved = managers.resourceNodesManager.reserveNode(node.id, jobId)
			if (!reserved) {
				managers.jobsManager.cancelJob(jobId, 'node_reserved')
				resetSettler(settler, managers, jobId)
				return null
			}
		}

		return SettlerState.CarryingItem
	}
}
