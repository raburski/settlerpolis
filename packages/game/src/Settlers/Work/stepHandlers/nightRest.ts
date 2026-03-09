import { SettlerState } from '../../../Population/types'
import { MoveTargetType } from '../../../Movement/types'
import { SettlerActionType } from '../../Actions/types'
import { WorkStepType } from '../types'
import type { StepHandler, StepHandlerResult } from './types'

export const NightRestHandler: StepHandler = {
	type: WorkStepType.NightRest,
	build: ({ step, simulationTimeMs, managers }): StepHandlerResult => {
		if (step.type !== WorkStepType.NightRest) {
			return { actions: [] }
		}

		const durationMs = Math.max(1_000, step.wakeAtMs - simulationTimeMs)
		const house = step.houseId ? managers.buildings.getBuildingInstance(step.houseId) : undefined

		if (!house) {
			return {
				actions: [
					{
						type: SettlerActionType.Wait,
						durationMs,
						setState: SettlerState.WaitingForWork
					}
				]
			}
		}

		return {
			actions: [
				{
					type: SettlerActionType.Move,
					position: house.position,
					targetType: MoveTargetType.House,
					targetId: house.id,
					setState: SettlerState.MovingHome
				},
				{
					type: SettlerActionType.Sleep,
					durationMs,
					insideBuildingId: house.id,
					setState: SettlerState.WaitingForWork
				}
			]
		}
	}
}
