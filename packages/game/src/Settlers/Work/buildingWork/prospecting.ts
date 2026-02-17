import { BuildingWorkKind } from '../../../Buildings/work'
import { ProfessionType } from '../../../Population/types'
import { WorkStepType, WorkWaitReason } from '../types'
import type { BuildingWorkHandler } from './types'

const GUILDHALL_BUILDING_ID = 'guildhall'

export const ProspectingWorkHandler: BuildingWorkHandler = {
	kind: BuildingWorkKind.Prospecting,
	canHandle: (definition) => definition.id === GUILDHALL_BUILDING_ID,
	getNextStep: ({ building, managers, settler }) => {
		if (settler.profession !== ProfessionType.Prospector) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.WrongProfession }
		}

		const job = managers.resourceNodes.claimProspectingJob(building.mapId, building.playerId, settler.id)
		if (!job) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoWork }
		}

		return {
			type: WorkStepType.Prospect,
			resourceNodeId: job.nodeId,
			durationMs: job.durationMs
		}
	}
}
