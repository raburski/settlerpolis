import { StateTransition } from './types'
import { SettlerState } from '../types'
import { JobStatus } from '../../Jobs/types'

export const CarryingItem_Working: StateTransition = {
	action: (settler, context, managers) => {
		const jobId = settler.stateContext.jobId
		let nextJobId: string | undefined = undefined
		settler.state = SettlerState.Working
		if (jobId && managers.jobs) {
			const job = managers.jobs.getJob(jobId)
			if (job?.buildingInstanceId) {
				settler.buildingId = job.buildingInstanceId
			}
			if (job && job.status !== JobStatus.Completed && job.status !== JobStatus.Cancelled) {
				nextJobId = jobId
			}
		}
		settler.stateContext = nextJobId ? { jobId: nextJobId } : {}
	}
}
