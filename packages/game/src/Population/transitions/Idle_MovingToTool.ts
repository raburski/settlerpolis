import { StateTransition, RequestWorkerNeedToolContext } from './types'
import { SettlerState, ProfessionType } from '../types'
import { Receiver } from '../../Receiver'
import { PopulationEvents } from '../events'
import { EventClient } from '../../events'

export const Idle_MovingToTool: StateTransition<RequestWorkerNeedToolContext> = {
	condition: (settler, context) => {
		// Settler doesn't have required profession
		return settler.profession !== context.requiredProfession
	},
	
	validate: (settler, context, managers) => {
		// Verify tool exists and is available
		return context.toolId !== undefined && context.toolPosition !== undefined
	},
	
	action: (settler, context, managers) => {
		// Get jobId from stateContext (should be set by assignWorkerToJob before calling this transition)
		const jobId = settler.stateContext.jobId
		if (!jobId) {
			throw new Error(`[Idle_MovingToTool] No jobId found in stateContext`)
		}
		
		managers.logger.log(`[TRANSITION ACTION] Idle -> MovingToTool | settler=${settler.id} | jobId=${jobId} | toolId=${context.toolId} | toolPosition=(${Math.round(context.toolPosition.x)},${Math.round(context.toolPosition.y)})`)
		
		// Update state
		settler.state = SettlerState.MovingToTool
		settler.stateContext = {
			targetId: context.toolId,
			targetPosition: context.toolPosition,
			jobId: jobId
		}
		
		// Start movement to tool
		const movementStarted = managers.movementManager.moveToPosition(settler.id, context.toolPosition, {
			targetType: 'tool',
			targetId: context.toolId
		})
		managers.logger.log(`[MOVEMENT REQUESTED] Idle -> MovingToTool | settler=${settler.id} | movementStarted=${movementStarted}`)
	},
	
	completed: (settler, managers) => {
		managers.logger.debug(`completed called: settler=${settler.id}`)
		const toolId = settler.stateContext.targetId
		if (!toolId) {
			managers.logger.warn(`Settler ${settler.id} arrived at tool but no targetId in stateContext`)
			return SettlerState.Idle
		}

		managers.logger.debug(`Tool pickup: toolId=${toolId}`)
		// Handle tool pickup (change profession, remove item, emit event)
		const tool = managers.lootManager.getItem(toolId)
		if (tool) {
			// Get profession from item metadata
			const itemMetadata = managers.itemsManager.getItemMetadata(tool.itemType)
			if (itemMetadata?.changesProfession) {
				const targetProfession = itemMetadata.changesProfession as ProfessionType
				const oldProfession = settler.profession
				managers.logger.debug(`Changing profession: ${oldProfession} -> ${targetProfession}`)
				settler.profession = targetProfession
				
				// Remove item from map
				const fakeClient: EventClient = {
					id: settler.playerId,
					currentGroup: settler.mapName,
					emit: (receiver, event, data, target?) => {
						managers.eventManager.emit(receiver, event, data, target)
					},
					setGroup: (group: string) => {
						// No-op for fake client
					}
				}
				managers.lootManager.pickItem(toolId, fakeClient)
				
				// Emit profession changed event
				managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.ProfessionChanged, {
					settlerId: settler.id,
					oldProfession,
					newProfession: targetProfession
				}, settler.mapName)
			}
		}
		
		// Return next state based on jobId
		managers.logger.debug(`Checking jobId:`, settler.stateContext.jobId)
		if (settler.stateContext.jobId) {
			// Has job assignment - continue to building
			managers.logger.debug(`Returning MovingToBuilding`)
			return SettlerState.MovingToBuilding
		} else {
			// No assignment - go to Idle
			managers.logger.debug(`Returning Idle (no jobId)`)
			return SettlerState.Idle
		}
	}
}

