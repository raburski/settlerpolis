import { ConstructionStage } from '../../Buildings/types'
import { ProfessionType, SettlerState } from '../../Population/types'
import { JobPhase, JobReservationType, RoleType } from '../types'
import type { JobAssignment } from '../types'
import type { Settler } from '../../Population/types'
import type { JobTaskContext } from '../TaskContext'
import { PopulationEvents } from '../../Population/events'
import { Receiver } from '../../Receiver'

export const dispatchMovingToTool = (context: JobTaskContext, job: JobAssignment, settler: Settler): void => {
	if (!job.toolItemId) {
		context.logger.warn(`[JOBS] Job ${job.jobId} in moving_to_tool without toolItemId`)
		const nextPhase = context.advanceJobPhase(job, 'arrived')
		if (nextPhase) {
			context.dispatchPhase(job, nextPhase)
		}
		return
	}

	const toolItem = context.managers.loot.getItem(job.toolItemId)
	if (!context.reservationService.isValid({ type: JobReservationType.Tool, id: job.toolItemId, ownerId: job.jobId, targetId: job.toolItemId })) {
		context.logger.warn(`[JOBS] Tool reservation invalid for job ${job.jobId}`)
		job.toolItemId = undefined
		const nextPhase = context.advanceJobPhase(job, 'arrived')
		if (nextPhase) {
			context.dispatchPhase(job, nextPhase)
		}
		return
	}
	if (!toolItem) {
		context.logger.warn(`[JOBS] Tool ${job.toolItemId} not found for job ${job.jobId}`)
		job.toolItemId = undefined
		const nextPhase = context.advanceJobPhase(job, 'arrived')
		if (nextPhase) {
			context.dispatchPhase(job, nextPhase)
		}
		return
	}

	settler.stateContext.jobId = job.jobId
	context.managers.population.transitionSettlerState(settler.id, SettlerState.MovingToTool, {
		toolId: toolItem.id,
		toolPosition: toolItem.position,
		buildingInstanceId: job.buildingInstanceId,
		requiredProfession: job.requiredProfession
	})
}

export const dispatchMovingToSource = (context: JobTaskContext, job: JobAssignment, settler: Settler): void => {
	settler.stateContext.jobId = job.jobId
	context.managers.population.transitionSettlerState(settler.id, SettlerState.MovingToItem, {
		jobId: job.jobId
	})
}

export const dispatchMovingToResource = (context: JobTaskContext, job: JobAssignment, settler: Settler): void => {
	settler.stateContext.jobId = job.jobId
	context.managers.population.transitionSettlerState(settler.id, SettlerState.MovingToResource, {
		jobId: job.jobId
	})
}

export const dispatchMovingToBuildingTarget = (context: JobTaskContext, job: JobAssignment, settler: Settler): void => {
	settler.stateContext.jobId = job.jobId
	const buildingPosition = context.managers.buildings.getBuildingPosition(job.buildingInstanceId)
	if (!buildingPosition) {
		context.cancelJob(job.jobId, 'building_missing')
		return
	}
	context.managers.population.transitionSettlerState(settler.id, SettlerState.MovingToBuilding, {
		buildingInstanceId: job.buildingInstanceId,
		buildingPosition,
		requiredProfession: job.requiredProfession
	})
}

export const dispatchMovingToCarryTarget = (context: JobTaskContext, job: JobAssignment, settler: Settler): void => {
	settler.stateContext.jobId = job.jobId
	context.managers.population.transitionSettlerState(settler.id, SettlerState.CarryingItem, {
		jobId: job.jobId
	})
}

export const arrivalMovingToTool = (context: JobTaskContext, job: JobAssignment, settler: Settler): SettlerState | null => {
	if (job.toolItemId) {
		const toolItem = context.managers.loot.getItem(job.toolItemId)
		if (toolItem && context.reservationService.isValid({ type: JobReservationType.Tool, id: job.toolItemId, ownerId: job.jobId, targetId: job.toolItemId })) {
			const itemMetadata = context.managers.items.getItemMetadata(toolItem.itemType)
			if (itemMetadata?.changesProfession) {
				const targetProfession = itemMetadata.changesProfession as ProfessionType
				const oldProfession = settler.profession
				settler.profession = targetProfession

				const fakeClient: any = {
					id: settler.playerId,
					currentGroup: settler.mapName,
					emit: (receiver: any, event: string, data: any, target?: any) => {
						context.event.emit(receiver, event, data, target)
					},
					setGroup: () => {}
				}
				context.managers.loot.pickItem(job.toolItemId, fakeClient)

				context.event.emit(Receiver.Group, PopulationEvents.SC.ProfessionChanged, {
					settlerId: settler.id,
					oldProfession,
					newProfession: targetProfession
				}, settler.mapName)
			}
		} else {
			context.logger.warn(`[JOBS] Tool reservation invalid for job ${job.jobId}`)
		}
		context.reservationService.release({ type: JobReservationType.Tool, id: job.toolItemId, ownerId: job.jobId, targetId: job.toolItemId })
		context.removeReservation(job, job.toolItemId)
		job.toolItemId = undefined
	}

	const nextPhase = context.advanceJobPhase(job, 'arrived')
	if (nextPhase === JobPhase.MovingToTarget) {
		return SettlerState.MovingToBuilding
	}
	return null
}

export const ensureWorkerSlot = (context: JobTaskContext, job: JobAssignment, roleType: RoleType): boolean => {
	const building = context.managers.buildings.getBuildingInstance(job.buildingInstanceId)
	if (!building) {
		context.cancelJob(job.jobId, 'building_not_needing_worker')
		return false
	}

	if (roleType === RoleType.Construction) {
		if (building.stage !== ConstructionStage.Constructing || !context.managers.buildings.getBuildingNeedsWorkers(job.buildingInstanceId)) {
			context.cancelJob(job.jobId, 'building_not_needing_worker')
			return false
		}
		return true
	}

	if (building.stage !== ConstructionStage.Completed) {
		context.cancelJob(job.jobId, 'building_not_needing_worker')
		return false
	}

	const definition = context.managers.buildings.getBuildingDefinition(building.buildingId)
	const workerSlots = definition?.workerSlots || 0
	const assignedWorkers = context.getAssignedWorkerCountForBuilding(job.buildingInstanceId, RoleType.Production)
	if (workerSlots === 0 || assignedWorkers > workerSlots) {
		context.cancelJob(job.jobId, 'building_not_needing_worker')
		return false
	}

	return true
}
