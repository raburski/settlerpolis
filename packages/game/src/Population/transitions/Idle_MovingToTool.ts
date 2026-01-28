import { StateTransition, RequestWorkerNeedToolContext } from './types'
import { SettlerState, ProfessionType } from '../types'
import { Receiver } from '../../Receiver'
import { MovementEvents } from '../../Movement/events'
import { PopulationEvents } from '../events'

export const Idle_MovingToTool: StateTransition<RequestWorkerNeedToolContext> = {
	condition: (settler, context) => {
		// Settler doesn't have required profession
		return settler.profession !== context.requiredProfession
	},
	
	validate: (settler, context, managers) => {
		return context.toolId !== undefined && context.toolPosition !== undefined
	},
	
	action: (settler, context, managers) => {
		// jobId may be set by assignWorkerToJob, but tool pickup can also be requested without a job
		const jobId = settler.stateContext.jobId
		
		managers.logger.log(`[TRANSITION ACTION] Idle -> MovingToTool | settler=${settler.id} | jobId=${jobId || 'none'} | toolId=${context.toolId} | toolPosition=(${Math.round(context.toolPosition.x)},${Math.round(context.toolPosition.y)})`)
		
		// Update state
		settler.state = SettlerState.MovingToTool
		settler.stateContext = {
			targetId: context.toolId,
			targetPosition: context.toolPosition,
			targetType: 'tool',
			jobId
		}
		
		// Start movement to tool
		const movementStarted = managers.movementManager.moveToPosition(settler.id, context.toolPosition, {
			targetType: 'tool',
			targetId: context.toolId
		})
		managers.logger.log(`[MOVEMENT REQUESTED] Idle -> MovingToTool | settler=${settler.id} | movementStarted=${movementStarted}`)
		if (!movementStarted) {
			const currentPosition = managers.movementManager.getEntityPosition(settler.id) || settler.position
			setTimeout(() => {
				managers.eventManager.emit(Receiver.All, MovementEvents.SS.StepComplete, {
					entityId: settler.id,
					position: currentPosition
				})
				managers.eventManager.emit(Receiver.All, MovementEvents.SS.PathComplete, {
					entityId: settler.id,
					targetType: 'tool',
					targetId: context.toolId
				})
			}, 0)
		}
	},
	
	completed: (settler, managers) => {
		const jobId = settler.stateContext.jobId
		if (jobId && managers.jobsManager) {
			return managers.jobsManager.handleSettlerArrival(settler)
		}

		const toolId = settler.stateContext.targetId
		if (!toolId) {
			return SettlerState.Idle
		}

		if (!managers.lootManager.isReservationValid(toolId, settler.id)) {
			return SettlerState.Idle
		}

		const tool = managers.lootManager.getItem(toolId)
		if (tool) {
			const itemMetadata = managers.itemsManager.getItemMetadata(tool.itemType)
			if (itemMetadata?.changesProfession) {
				const targetProfession = itemMetadata.changesProfession as ProfessionType
				const oldProfession = settler.profession
				settler.profession = targetProfession

				const fakeClient: any = {
					id: settler.playerId,
					currentGroup: settler.mapName,
					emit: (receiver: any, event: string, data: any, target?: any) => {
						managers.eventManager.emit(receiver, event, data, target)
					},
					setGroup: () => {}
				}
				managers.lootManager.pickItem(toolId, fakeClient)

				managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.ProfessionChanged, {
					settlerId: settler.id,
					oldProfession,
					newProfession: targetProfession
				}, settler.mapName)
			}
		} else {
			managers.lootManager.releaseReservation(toolId, settler.id)
		}

		return SettlerState.Idle
	}
}
