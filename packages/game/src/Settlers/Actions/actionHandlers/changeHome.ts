import { WorkActionType } from '../../Work/types'
import type { ActionHandler } from './types'

export const ChangeHomeActionHandler: ActionHandler = {
	type: WorkActionType.ChangeHome,
	start: ({ action, managers, complete, fail }) => {
		if (action.type !== WorkActionType.ChangeHome) {
			return
		}

		const success = managers.reservations.commitHouseReservation(action.reservationId, action.houseId)
		if (!success) {
			fail('home_move_failed')
			return
		}

		complete()
	}
}
