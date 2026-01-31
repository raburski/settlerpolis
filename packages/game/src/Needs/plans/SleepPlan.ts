import { v4 as uuidv4 } from 'uuid'
import { SettlerState } from '../../Population/types'
import type { WorkAction } from '../../Settlers/WorkProvider/types'
import { WorkActionType } from '../../Settlers/WorkProvider/types'
import type { BedLocation } from '../policies/BedPolicy'
import { NeedType } from '../NeedTypes'
import type { NeedPlanResult } from '../types'

const SLEEP_DURATION_MS = 8000

export const buildSleepPlan = (bed: BedLocation | null): NeedPlanResult => {
	const actions: WorkAction[] = []

	if (bed) {
		actions.push({
			type: WorkActionType.Move,
			position: bed.position,
			targetType: 'building',
			targetId: bed.buildingInstanceId,
			setState: SettlerState.MovingToBuilding
		})
	}

	actions.push({
		type: WorkActionType.Sleep,
		durationMs: SLEEP_DURATION_MS,
		setState: SettlerState.Working
	})

	return {
		plan: {
			id: uuidv4(),
			needType: NeedType.Fatigue,
			actions
		}
	}
}
