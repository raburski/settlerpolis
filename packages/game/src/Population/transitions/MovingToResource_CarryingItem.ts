import { StateTransition } from './types'
import { SettlerState, JobType, JobAssignment, Settler } from '../types'
import { Receiver } from '../../Receiver'
import { PopulationEvents } from '../events'
import { EventClient } from '../../events'
import { v4 as uuidv4 } from 'uuid'

export interface ResourceArrivalContext {
	jobId: string
}

function resetSettler(settler: Settler, managers: any, jobIdToClear?: string): void {
	if (jobIdToClear && settler.currentJob?.jobId === jobIdToClear) {
		settler.currentJob = undefined
	}
	settler.state = SettlerState.Idle
	settler.stateContext = {}
	managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, { settler }, settler.mapName)
}

function dropHarvestItem(settler: Settler, job: JobAssignment, managers: any): void {
	if (!job.itemType) return
	const fakeClient: EventClient = {
		id: settler.playerId,
		currentGroup: settler.mapName,
		emit: (receiver: any, event: string, data: any, target?: any) => {
			managers.eventManager.emit(receiver, event, data, target)
		},
		setGroup: () => {
			// No-op
		}
	}

	const itemId = job.carriedItemId || uuidv4()
	const item = { id: itemId, itemType: job.itemType }
	const quantity = job.quantity || 1
	managers.lootManager.dropItem(item, settler.position, fakeClient, quantity)
}

export const MovingToResource_CarryingItem: StateTransition<ResourceArrivalContext> = {
	condition: (settler, context) => {
		return settler.stateContext.jobId === context.jobId
	},

	validate: (settler, context, managers) => {
		if (!managers.jobsManager || !managers.resourceNodesManager || !managers.storageManager) {
			return false
		}

		const job = managers.jobsManager.getJob(context.jobId)
		if (!job || job.jobType !== JobType.Harvest || !job.resourceNodeId) {
			return false
		}

		const node = managers.resourceNodesManager.getNode(job.resourceNodeId)
		if (!node || node.remainingHarvests <= 0) {
			return false
		}

		const building = managers.buildingManager.getBuildingInstance(job.buildingInstanceId)
		if (!building) {
			return false
		}

		return true
	},

	action: (settler, context, managers) => {
		const job = managers.jobsManager!.getJob(context.jobId)!
		const node = managers.resourceNodesManager!.getNode(job.resourceNodeId!)
		if (!node) {
			throw new Error(`[MovingToResource_CarryingItem] Resource node ${job.resourceNodeId} not found`)
		}

		const harvestedItem = managers.resourceNodesManager!.harvestNode(node.id, job.jobId)
		if (!harvestedItem) {
			throw new Error(`[MovingToResource_CarryingItem] Failed to harvest node ${node.id}`)
		}

		job.carriedItemId = harvestedItem.id
		job.itemType = harvestedItem.itemType
		job.quantity = job.quantity || 1

		const buildingPosition = managers.buildingManager.getBuildingPosition(job.buildingInstanceId)
		if (!buildingPosition) {
			throw new Error(`[MovingToResource_CarryingItem] Building ${job.buildingInstanceId} not found`)
		}

		settler.state = SettlerState.CarryingItem
		settler.stateContext = {
			jobId: context.jobId,
			targetId: job.buildingInstanceId,
			targetPosition: buildingPosition
		}

		const movementStarted = managers.movementManager.moveToPosition(settler.id, buildingPosition, {
			targetType: 'building',
			targetId: job.buildingInstanceId
		})
		managers.logger.log(`[MOVEMENT REQUESTED] MovingToResource -> CarryingItem | settler=${settler.id} | movementStarted=${movementStarted}`)
	},

	completed: (settler, managers) => {
		const jobId = settler.stateContext.jobId
		if (!jobId || !managers.jobsManager || !managers.storageManager) {
			resetSettler(settler, managers)
			return null
		}

		const job = managers.jobsManager.getJob(jobId)
		if (!job || job.jobType !== JobType.Harvest) {
			if (jobId) {
				managers.jobsManager.cancelJob(jobId, 'job_invalid')
			}
			resetSettler(settler, managers, jobId)
			return null
		}

		if (job.status === 'cancelled') {
			dropHarvestItem(settler, job, managers)
			resetSettler(settler, managers, jobId)
			return null
		}

		if (!job.itemType || !job.quantity) {
			resetSettler(settler, managers, jobId)
			return null
		}

		const building = managers.buildingManager.getBuildingInstance(job.buildingInstanceId)
		if (!building) {
			dropHarvestItem(settler, job, managers)
			managers.jobsManager.cancelJob(jobId, 'building_cancelled')
			resetSettler(settler, managers, jobId)
			return null
		}

		const delivered = managers.storageManager.addToStorage(job.buildingInstanceId, job.itemType, job.quantity)
		if (!delivered) {
			dropHarvestItem(settler, job, managers)
		}

		managers.jobsManager.completeJob(jobId)

		if (settler.currentJob && settler.currentJob.jobId === jobId) {
			settler.currentJob = undefined
		}

		if (settler.currentJob && settler.currentJob.jobType === JobType.Production) {
			settler.stateContext = {
				jobId: settler.currentJob.jobId
			}
			return SettlerState.Working
		}

		return SettlerState.Idle
	}
}
