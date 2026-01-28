import { StateTransition } from './types'
import { SettlerState } from '../types'

export const CarryingItem_Working: StateTransition = {
	action: (settler) => {
		const jobId = settler.currentJob?.jobId
		settler.state = SettlerState.Working
		settler.stateContext = jobId ? { jobId } : {}
		if (settler.currentJob?.buildingInstanceId) {
			settler.buildingId = settler.currentJob.buildingInstanceId
		}
	}
}
