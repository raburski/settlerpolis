import { JobAssignment, JobPhase, JobType } from '../Population/types'

export type JobEvent = 'arrived' | 'harvest_complete' | 'complete'

export interface JobDefinition {
	type: JobType
	initialPhase: (job: JobAssignment) => JobPhase
	transitions: Partial<Record<JobPhase, Partial<Record<JobEvent, JobPhase>>>>
}

const transportTransitions: Partial<Record<JobPhase, Partial<Record<JobEvent, JobPhase>>>> = {
	[JobPhase.MovingToSource]: {
		arrived: JobPhase.MovingToTarget
	},
	[JobPhase.MovingToTarget]: {
		arrived: JobPhase.Completed
	}
}

const harvestTransitions: Partial<Record<JobPhase, Partial<Record<JobEvent, JobPhase>>>> = {
	[JobPhase.MovingToResource]: {
		arrived: JobPhase.Harvesting
	},
	[JobPhase.Harvesting]: {
		harvest_complete: JobPhase.MovingToTarget
	},
	[JobPhase.MovingToTarget]: {
		arrived: JobPhase.Completed
	}
}

const workerTransitions: Partial<Record<JobPhase, Partial<Record<JobEvent, JobPhase>>>> = {
	[JobPhase.MovingToTool]: {
		arrived: JobPhase.MovingToTarget
	},
	[JobPhase.MovingToTarget]: {
		arrived: JobPhase.Working
	},
	[JobPhase.Working]: {
		complete: JobPhase.Completed
	}
}

export const JOB_DEFINITIONS: Record<JobType, JobDefinition> = {
	[JobType.Transport]: {
		type: JobType.Transport,
		initialPhase: () => JobPhase.MovingToSource,
		transitions: transportTransitions
	},
	[JobType.Harvest]: {
		type: JobType.Harvest,
		initialPhase: () => JobPhase.MovingToResource,
		transitions: harvestTransitions
	},
	[JobType.Construction]: {
		type: JobType.Construction,
		initialPhase: (job) => job.toolItemId ? JobPhase.MovingToTool : JobPhase.MovingToTarget,
		transitions: workerTransitions
	},
	[JobType.Production]: {
		type: JobType.Production,
		initialPhase: (job) => job.toolItemId ? JobPhase.MovingToTool : JobPhase.MovingToTarget,
		transitions: workerTransitions
	}
}

export function getNextPhase(job: JobAssignment, event: JobEvent): JobPhase | null {
	const definition = JOB_DEFINITIONS[job.jobType]
	if (!definition) {
		return null
	}

	const currentPhase = job.phase
	if (!currentPhase) {
		return null
	}

	const phaseTransitions = definition.transitions[currentPhase]
	if (!phaseTransitions) {
		return null
	}

	return phaseTransitions[event] ?? null
}
