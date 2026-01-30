import type { EventManager } from '../events'
import type { Logger } from '../Logs'
import type { JobsDeps } from './index'
import type { ReservationService } from './ReservationService'
import type { JobAssignment, JobPhase, RoleType } from './types'
import type { Settler } from '../Population/types'

export type JobEvent = 'arrived' | 'harvest_complete' | 'complete'

export interface JobTaskContext {
	managers: JobsDeps
	event: EventManager
	reservationService: ReservationService
	logger: Logger
	getJob: (jobId: string) => JobAssignment | undefined
	getSettler: (job: JobAssignment) => Settler | null
	advanceJobPhase: (job: JobAssignment, event: JobEvent) => JobPhase | null
	dispatchPhase: (job: JobAssignment, phase: JobPhase) => void
	cancelJob: (jobId: string, reason?: string) => void
	completeJob: (jobId: string) => void
	assignWorkerToJob: (jobId: string, settlerId: string) => void
	getAssignedWorkerCountForBuilding: (buildingInstanceId: string, roleType?: RoleType) => number
	removeReservation: (job: JobAssignment, reservationId: string) => void
	getSimulationTimeMs: () => number
}
