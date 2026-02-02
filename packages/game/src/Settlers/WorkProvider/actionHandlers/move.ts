import { WorkActionType } from '../types'
import { MoveTargetType } from '../../../Movement/types'
import { ConstructionStage } from '../../../Buildings/types'
import { calculateDistance } from '../../../utils'
import type { ActionHandler } from './types'

export const MoveActionHandler: ActionHandler = {
	type: WorkActionType.Move,
	start: ({ settlerId, action, managers, complete, fail }) => {
		if (action.type !== WorkActionType.Move) {
			return
		}
		const settler = managers.population.getSettler(settlerId)
		const targetType = action.targetType
		const targetId = action.targetId
		if (
			targetId &&
			(targetType === MoveTargetType.Building || targetType === MoveTargetType.House)
		) {
			const building = managers.buildings.getBuildingInstance(targetId)
			if (building?.stage === ConstructionStage.Completed) {
				const accessPoints = managers.buildings.getBuildingAccessPoints(targetId)
				const entry = accessPoints?.entry
				const center = accessPoints?.center
				if (entry) {
					const finalTarget = center ?? entry
					if (settler && calculateDistance(settler.position, finalTarget) <= 4) {
						complete()
						return
					}
					managers.population.setSettlerTarget(settlerId, targetId, finalTarget, targetType)
					const started = managers.movement.moveToPosition(settlerId, entry, {
						targetType,
						targetId,
						callbacks: {
							onPathComplete: () => {
								if (!center || (center.x === entry.x && center.y === entry.y)) {
									complete()
									return
								}
								const startedInner = managers.movement.moveAlongPath(settlerId, [entry, center], {
									targetType,
									targetId,
									callbacks: {
										onPathComplete: () => {
											complete()
										},
										onCancelled: () => {
											fail('movement_cancelled')
										}
									}
								})
								if (!startedInner) {
									fail('movement_failed')
								}
							},
							onCancelled: () => {
								fail('movement_cancelled')
							}
						}
					})
					if (!started) {
						fail('movement_failed')
					}
					return
				}
			}
		}

		managers.population.setSettlerTarget(settlerId, targetId, action.position, targetType)
		const started = managers.movement.moveToPosition(settlerId, action.position, {
			targetType,
			targetId,
			callbacks: {
				onPathComplete: () => {
					complete()
				},
				onCancelled: () => {
					fail('movement_cancelled')
				}
			}
		})
		if (!started) {
			fail('movement_failed')
		}
	}
	,
	onComplete: ({ settlerId, managers }) => {
		managers.population.setSettlerTarget(settlerId, undefined, undefined, undefined)
	}
}
