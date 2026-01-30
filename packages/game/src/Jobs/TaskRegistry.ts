import { JobPhase, JobType } from './types'
import type { JobAssignment } from './types'
import type { SettlerState, Settler } from '../Population/types'
import type { JobTaskContext, JobEvent } from './TaskContext'
import { createTransportDefinition } from './tasks/Transport'
import { createHarvestDefinition } from './tasks/Harvest'
import { createConstructionDefinition } from './tasks/Construction'
import { createProductionDefinition } from './tasks/Production'

export type DispatchHandler = (job: JobAssignment, settler: Settler) => void
export type ArrivalHandler = (job: JobAssignment, settler: Settler) => SettlerState | null

export interface JobDefinition {
	type: JobType
	initialPhase: (job: JobAssignment) => JobPhase
	transitions: Partial<Record<JobPhase, Partial<Record<JobEvent, JobPhase>>>>
	dispatch?: Partial<Record<JobPhase, DispatchHandler>>
	arrival?: Partial<Record<JobPhase, ArrivalHandler>>
}

export class TaskRegistry {
	private definitions: Record<JobType, JobDefinition>

	constructor(private context: JobTaskContext) {
		this.definitions = {
			[JobType.Transport]: createTransportDefinition(this.context),
			[JobType.Harvest]: createHarvestDefinition(this.context),
			[JobType.Construction]: createConstructionDefinition(this.context),
			[JobType.Production]: createProductionDefinition(this.context)
		}
	}

	public getDefinition(jobType: JobType): JobDefinition {
		return this.definitions[jobType]
	}

	public getNextPhase(job: JobAssignment, event: JobEvent): JobPhase | null {
		const definition = this.definitions[job.jobType]
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
}
