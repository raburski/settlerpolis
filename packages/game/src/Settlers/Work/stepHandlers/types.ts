import type { WorkAssignment, WorkStep, WorkStepType } from '../types'
import type { SettlerAction } from '../../Actions/types'
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
	actions: SettlerAction[]
}

export interface StepHandler {
	type: WorkStepType
	build(context: StepHandlerContext): StepHandlerResult
}
