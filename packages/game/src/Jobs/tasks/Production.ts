import { SettlerState } from '../../Population/types'
import { JobPhase, JobType, RoleType } from '../types'
import type { JobDefinition } from '../TaskRegistry'
import type { JobTaskContext } from '../TaskContext'
import { arrivalMovingToTool, dispatchMovingToBuildingTarget, dispatchMovingToTool, ensureWorkerSlot } from './common'

export const createProductionDefinition = (context: JobTaskContext): JobDefinition => ({
	type: JobType.Production,
	initialPhase: (job) => job.toolItemId ? JobPhase.MovingToTool : JobPhase.MovingToTarget,
	transitions: {
		[JobPhase.MovingToTool]: {
			arrived: JobPhase.MovingToTarget
		},
		[JobPhase.MovingToTarget]: {
			arrived: JobPhase.Working
		},
		[JobPhase.Working]: {
			complete: JobPhase.Completed
		}
	},
	dispatch: {
		[JobPhase.MovingToTool]: (job, settler) => dispatchMovingToTool(context, job, settler),
		[JobPhase.MovingToTarget]: (job, settler) => dispatchMovingToBuildingTarget(context, job, settler)
	},
	arrival: {
		[JobPhase.MovingToTool]: (job, settler) => arrivalMovingToTool(context, job, settler),
		[JobPhase.MovingToTarget]: (job, settler) => {
			if (!ensureWorkerSlot(context, job, RoleType.Production)) {
				return SettlerState.Idle
			}
			context.assignWorkerToJob(job.jobId, settler.id)
			context.advanceJobPhase(job, 'arrived')
			return SettlerState.Working
		}
	}
})
