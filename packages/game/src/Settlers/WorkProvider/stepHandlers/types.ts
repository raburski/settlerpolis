import type { WorkAction, WorkAssignment, WorkStep, WorkStepType } from '../types'
import type { WorkProviderDeps } from '..'
import type { ReservationSystem } from '../../../Reservation'

export interface StepHandlerContext {
	settlerId: string
	assignment: WorkAssignment
	step: WorkStep
	managers: WorkProviderDeps
	reservationSystem: ReservationSystem
	simulationTimeMs: number
}

export interface StepHandlerResult {
	actions: WorkAction[]
	releaseReservations?: () => void
}

export interface StepHandler {
	type: WorkStepType
	build(context: StepHandlerContext): StepHandlerResult
}
