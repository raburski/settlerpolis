import { WorkActionType } from '../../Work/types'
import { SettlerActionFailureReason } from '../../failureReasons'
import { MoveTargetType } from '../../../Movement/types'
import { ConstructionStage } from '../../../Buildings/types'
import { calculateDistance } from '../../../utils'
import type { ActionHandler } from './types'
import type { Position } from '../../../types'

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
				const accessTiles = accessPoints?.accessTiles ?? []

				const resolveAccessPath = () => {
					if (!settler || accessTiles.length === 0) {
						return null
					}
					const roadData = managers.roads.getRoadData(settler.mapId) || undefined
					let best: { path: Position[]; target: Position; distance: number } | null = null
					for (const candidate of accessTiles) {
						const path = managers.map.findPath(settler.mapId, settler.position, candidate, {
							roadData,
							allowDiagonal: true
						})
						if (!path || path.length === 0) {
							continue
						}
						let distance = 0
						for (let i = 1; i < path.length; i += 1) {
							distance += calculateDistance(path[i - 1], path[i])
						}
						if (!best || distance < best.distance) {
							best = { path, target: candidate, distance }
						}
					}
					return best
				}

				const accessPath = resolveAccessPath()
				if (accessPath && accessPath.path.length > 0) {
					const finalTarget = center ?? entry ?? accessPath.target
					if (settler && calculateDistance(settler.position, finalTarget) <= 4) {
						complete()
						return
					}
					managers.population.setSettlerTarget(settlerId, targetId, finalTarget, targetType)
					const started = managers.movement.moveAlongPath(settlerId, accessPath.path, {
						targetType,
						targetId,
						callbacks: {
							onPathComplete: () => {
								const innerPath: Position[] = [accessPath.target]
								if (entry && (entry.x !== accessPath.target.x || entry.y !== accessPath.target.y)) {
									innerPath.push(entry)
								}
								if (center && (center.x !== innerPath[innerPath.length - 1]?.x || center.y !== innerPath[innerPath.length - 1]?.y)) {
									innerPath.push(center)
								}
								if (innerPath.length <= 1) {
									complete()
									return
								}
								const startedInner = managers.movement.moveAlongPath(settlerId, innerPath, {
									targetType,
									targetId,
									callbacks: {
										onPathComplete: () => {
											complete()
										},
										onCancelled: () => {
											fail(SettlerActionFailureReason.MovementCancelled)
										}
									}
								})
								if (!startedInner) {
									fail(SettlerActionFailureReason.MovementFailed)
								}
							},
							onCancelled: () => {
								fail(SettlerActionFailureReason.MovementCancelled)
							}
						}
					})
					if (!started) {
						fail(SettlerActionFailureReason.MovementFailed)
					}
					return
				}

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
											fail(SettlerActionFailureReason.MovementCancelled)
										}
									}
								})
								if (!startedInner) {
									fail(SettlerActionFailureReason.MovementFailed)
								}
							},
							onCancelled: () => {
								fail(SettlerActionFailureReason.MovementCancelled)
							}
						}
					})
					if (!started) {
						fail(SettlerActionFailureReason.MovementFailed)
					}
					return
				}
			}
		}

		managers.population.setSettlerTarget(settlerId, targetId, action.position, targetType)
		const started = managers.movement.moveToPosition(settlerId, action.position, {
			targetType,
			targetId,
			speedMultiplier: action.speedMultiplier,
			callbacks: {
				onPathComplete: () => {
					complete()
				},
				onCancelled: () => {
					fail(SettlerActionFailureReason.MovementCancelled)
				}
			}
		})
		if (!started) {
			fail(SettlerActionFailureReason.MovementFailed)
		}
	}
	,
	onComplete: ({ settlerId, managers }) => {
		managers.population.setSettlerTarget(settlerId, undefined, undefined, undefined)
	}
}
