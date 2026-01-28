import { StateTransition } from './types'
import { SettlerState } from '../types'

export const CarryingItem_Working: StateTransition = {
	action: (settler, context, managers) => {
		const jobId = settler.stateContext.jobId
		let nextJobId: string | undefined = undefined
		settler.state = SettlerState.Working
		if (jobId && managers.jobsManager) {
			const job = managers.jobsManager.getJob(jobId)
			if (job?.buildingInstanceId) {
				settler.buildingId = job.buildingInstanceId
			}
			if (job && job.status !== 'completed' && job.status !== 'cancelled') {
				nextJobId = jobId
			}
		}
		settler.stateContext = nextJobId ? { jobId: nextJobId } : {}
	}
}
