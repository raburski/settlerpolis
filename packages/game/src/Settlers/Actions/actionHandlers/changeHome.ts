import { WorkActionType } from '../../Work/types'
import { SettlerActionFailureReason } from '../../failureReasons'
import type { ActionHandler } from './types'
import { ReservationKind } from '../../../Reservation'

export const ChangeHomeActionHandler: ActionHandler = {
	type: WorkActionType.ChangeHome,
	start: ({ action, managers, complete, fail }) => {
		if (action.type !== WorkActionType.ChangeHome) {
			return
		}

		const success = managers.reservations.commit({
			kind: ReservationKind.House,
			reservationId: action.reservationId,
			expectedHouseId: action.houseId
		})
		if (!success) {
			fail(SettlerActionFailureReason.HomeMoveFailed)
			return
		}

		complete()
	}
}
