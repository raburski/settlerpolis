import type { ReservationSystem } from '../../Reservation'
import type { WorkAction } from '../Work/types'

interface ReleaseReservationDeps {
	reservations: ReservationSystem
}

interface ReleaseReservationsParams {
	actions: WorkAction[]
	deps: ReleaseReservationDeps
}

export const releaseActionReservations = ({
	actions,
	deps
}: ReleaseReservationsParams): void => {
	for (const action of actions) {
		if (!action.reservationRefs || action.reservationRefs.length === 0) {
			continue
		}
		for (const ref of action.reservationRefs) {
			deps.reservations.release(ref)
		}
	}
}
