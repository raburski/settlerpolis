import { StateTransition } from './types'
import { SettlerState } from '../types'
import { JobType } from '../../Jobs/types'

export const MovingToResource_Harvesting: StateTransition = {
	validate: (settler, context, managers) => {
		if (!managers.jobs) {
			return false
		}
		const jobId = (context as any).jobId || settler.stateContext.jobId
		if (!jobId) {
			return false
		}
		const job = managers.jobs.getJob(jobId)
		return !!job && job.jobType === JobType.Harvest
	},

	action: (settler, context) => {
		const jobId = (context as any).jobId || settler.stateContext.jobId
		settler.state = SettlerState.Harvesting
		settler.stateContext = jobId ? { jobId } : {}
	}
}
