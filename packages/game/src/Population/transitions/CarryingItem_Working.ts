import { StateTransition } from './types'
import { SettlerState } from '../types'

export const CarryingItem_Working: StateTransition = {
	action: (settler, context, managers) => {
		const jobId = settler.stateContext.jobId
		settler.state = SettlerState.Working
		settler.stateContext = jobId ? { jobId } : {}
		if (jobId && managers.jobsManager) {
			const job = managers.jobsManager.getJob(jobId)
			if (job?.buildingInstanceId) {
				settler.buildingId = job.buildingInstanceId
			}
		}
	}
}
