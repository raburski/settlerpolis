import { StateTransition } from './types'
import { SettlerState, JobType } from '../types'

export const MovingToResource_Harvesting: StateTransition = {
	validate: (settler, context, managers) => {
		if (!managers.jobsManager) {
			return false
		}
		const jobId = (context as any).jobId || settler.stateContext.jobId
		if (!jobId) {
			return false
		}
		const job = managers.jobsManager.getJob(jobId)
		return !!job && job.jobType === JobType.Harvest
	},

	action: (settler, context) => {
		const jobId = (context as any).jobId || settler.stateContext.jobId
		settler.state = SettlerState.Harvesting
		settler.stateContext = jobId ? { jobId } : {}
	}
}
