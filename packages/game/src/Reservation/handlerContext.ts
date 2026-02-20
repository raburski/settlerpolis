import type { ReservationSystemState } from './ReservationSystemState'
import type { ReservationSystemDeps } from './deps'

export interface ReservationHandlerContext {
	managers: ReservationSystemDeps
	state: ReservationSystemState
}
