import { SettlerState } from '../../../Population/types'
import { TransportSourceType, TransportTargetType, WorkStepType } from '../types'
import type { TransportSource } from '../types'
import type { StepHandler, StepHandlerResult } from './types'
import { MoveTargetType } from '../../../Movement/types'
import { calculateDistance } from '../../../utils'
import { SettlerActionType } from '../../Actions/types'
import type { SettlerAction } from '../../Actions/types'
import { ReservationKind, type ReservationRef } from '../../../Reservation'

export const TransportHandler: StepHandler = {
	type: WorkStepType.Transport,
	build: ({ step, assignment, managers, reservationSystem }): StepHandlerResult => {
		if (step.type !== WorkStepType.Transport) {
			return { actions: [] }
		}

		const settler = managers.population.getSettler(assignment.settlerId)
		if (!settler) {
			return { actions: [] }
		}

		const targetBuilding = managers.buildings.getBuildingInstance(step.target.buildingInstanceId)
		if (!targetBuilding) {
			return { actions: [] }
		}

		const reservationRefs: ReservationRef[] = []
		const releaseReservations = () => reservationSystem.releaseMany(reservationRefs)
			const roadData = managers.roads.getRoadData(settler.mapId) || undefined
			const map = managers.map.getMap(settler.mapId)
			const tileSize = map?.tiledMap.tilewidth || 32
			const reachabilityByPair = new Map<string, boolean>()
			const resolvedTargetByPair = new Map<string, { x: number, y: number } | null>()
			const nearestWalkableByTarget = new Map<string, { x: number, y: number } | null>()

			const pairKey = (from: { x: number, y: number }, to: { x: number, y: number }) => {
				return `${from.x},${from.y}->${to.x},${to.y}`
			}

			const targetKey = (target: { x: number, y: number }) => {
				return `${target.x},${target.y}`
			}

			const canReach = (from: { x: number, y: number }, to: { x: number, y: number }) => {
				const key = pairKey(from, to)
				const cached = reachabilityByPair.get(key)
				if (cached !== undefined) {
					return cached
				}
				const path = managers.map.findPath(settler.mapId, from, to, { roadData, allowDiagonal: true })
				const reachable = !!(path && path.length > 0)
				reachabilityByPair.set(key, reachable)
				return reachable
			}

			const resolveReachableTarget = (from: { x: number, y: number }, target: { x: number, y: number }) => {
				const key = pairKey(from, target)
				const cached = resolvedTargetByPair.get(key)
				if (cached !== undefined) {
					return cached
				}

				if (canReach(from, target)) {
					resolvedTargetByPair.set(key, target)
					return target
				}

				const fallbackKey = targetKey(target)
				let fallback = nearestWalkableByTarget.get(fallbackKey)
				if (fallback === undefined) {
					fallback = managers.map.findNearestWalkablePosition(settler.mapId, target, 2)
					nearestWalkableByTarget.set(fallbackKey, fallback)
				}
				if (fallback && canReach(from, fallback)) {
					resolvedTargetByPair.set(key, fallback)
					return fallback
				}

				resolvedTargetByPair.set(key, null)
				return null
			}

		const getRandomDeliveryEgressPosition = (
			deliveryPosition: { x: number, y: number },
			forbiddenPositions: Array<{ x: number, y: number }>
		) => {
			const isForbidden = (position: { x: number, y: number }) => {
				return forbiddenPositions.some(forbidden => calculateDistance(position, forbidden) < tileSize * 0.5)
			}

			const directions = [
				{ x: 0, y: -1 },
				{ x: 1, y: 0 },
				{ x: 0, y: 1 },
				{ x: -1, y: 0 }
			]
			const distances = [1, 2]
			const candidates: Array<{ x: number, y: number }> = []

			for (let index = directions.length - 1; index > 0; index--) {
				const swapIndex = Math.floor(Math.random() * (index + 1))
				const current = directions[index]
				directions[index] = directions[swapIndex]
				directions[swapIndex] = current
			}

			for (const distance of distances) {
				for (const direction of directions) {
					candidates.push({
						x: deliveryPosition.x + direction.x * tileSize * distance,
						y: deliveryPosition.y + direction.y * tileSize * distance
					})
				}
			}

			for (let index = candidates.length - 1; index > 0; index--) {
				const swapIndex = Math.floor(Math.random() * (index + 1))
				const current = candidates[index]
				candidates[index] = candidates[swapIndex]
				candidates[swapIndex] = current
			}

			for (const candidate of candidates) {
				if (isForbidden(candidate)) {
					continue
				}
				const reachable = resolveReachableTarget(deliveryPosition, candidate)
				if (!reachable) {
					continue
				}
				if (calculateDistance(reachable, deliveryPosition) < tileSize * 0.5) {
					continue
				}
				if (isForbidden(reachable)) {
					continue
				}
				return reachable
			}

			return null
		}

		if (step.source.type === TransportSourceType.Ground) {
			const source = step.source as Extract<TransportSource, { type: TransportSourceType.Ground }>
			const sourceReservation = reservationSystem.reserve({
				kind: ReservationKind.Loot,
				itemId: source.itemId,
				ownerId: assignment.assignmentId
			})
			if (!sourceReservation || sourceReservation.kind !== ReservationKind.Loot) {
				return { actions: [{ type: SettlerActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
			}
			reservationRefs.push(sourceReservation.ref)

			if (!canReach(settler.position, source.position)) {
				releaseReservations()
				return { actions: [{ type: SettlerActionType.Wait, durationMs: 2000, setState: SettlerState.WaitingForWork }] }
			}

			let targetReservationId: string | null = null
			let targetReservationRef: { kind: ReservationKind.Storage, reservationId: string } | null = null
			let targetPosition = targetBuilding.position
			const precheckTarget = resolveReachableTarget(source.position, targetPosition)
			if (!precheckTarget) {
				releaseReservations()
				return { actions: [{ type: SettlerActionType.Wait, durationMs: 2000, setState: SettlerState.WaitingForWork }] }
			}
			targetPosition = precheckTarget
			if (step.target.type === TransportTargetType.Storage) {
				const reservation = reservationSystem.reserve({
					kind: ReservationKind.Storage,
					direction: 'incoming',
					buildingInstanceId: step.target.buildingInstanceId,
					itemType: step.itemType,
					quantity: step.quantity,
					ownerId: assignment.assignmentId
				})
				if (!reservation || reservation.kind !== ReservationKind.Storage) {
					releaseReservations()
					return { actions: [{ type: SettlerActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
				}
				targetReservationId = reservation.reservationId
				targetReservationRef = reservation.ref
				targetPosition = reservation.position
				reservationRefs.push(reservation.ref)

				const reachableTarget = resolveReachableTarget(source.position, targetPosition)
				if (!reachableTarget) {
					releaseReservations()
					return { actions: [{ type: SettlerActionType.Wait, durationMs: 2000, setState: SettlerState.WaitingForWork }] }
				}
				targetPosition = reachableTarget
			}
			const egressPosition = getRandomDeliveryEgressPosition(targetPosition, [
				targetBuilding.position,
				targetPosition
			])
			const actions: SettlerAction[] = [
				{ type: SettlerActionType.Move, position: source.position, targetType: MoveTargetType.Item, targetId: source.itemId, setState: SettlerState.MovingToItem },
				{
					type: SettlerActionType.PickupLoot,
					itemId: source.itemId,
					reservationRefs: [sourceReservation.ref],
					setState: SettlerState.CarryingItem
				},
				{ type: SettlerActionType.Move, position: targetPosition, targetType: step.target.type === TransportTargetType.Storage ? MoveTargetType.StorageSlot : MoveTargetType.Building, targetId: targetReservationId || targetBuilding.id, setState: SettlerState.CarryingItem },
				// Construction consumes collectedResources (pre-storage), so it uses a dedicated action.
				step.target.type === TransportTargetType.Construction
					? { type: SettlerActionType.DeliverConstruction, buildingInstanceId: targetBuilding.id, itemType: step.itemType, quantity: step.quantity, setState: SettlerState.Working }
					: {
						type: SettlerActionType.DeliverStorage,
						buildingInstanceId: targetBuilding.id,
						itemType: step.itemType,
						quantity: step.quantity,
						reservationId: targetReservationId || undefined,
						reservationRefs: targetReservationRef ? [targetReservationRef] : undefined,
						setState: SettlerState.Working
					}
			]
			if (egressPosition) {
				actions.push({
					type: SettlerActionType.Move,
					position: egressPosition,
					targetType: MoveTargetType.Spot,
					targetId: `delivery-egress:${assignment.assignmentId}:${targetBuilding.id}`,
					setState: SettlerState.Moving
				})
			}

			return {
				actions
			}
		}

		if (step.source.type === TransportSourceType.Storage) {
			const sourceBuilding = managers.buildings.getBuildingInstance(step.source.buildingInstanceId)
			if (!sourceBuilding) {
				releaseReservations()
				return { actions: [] }
			}

			const reachableSource = resolveReachableTarget(settler.position, sourceBuilding.position)
			if (!reachableSource) {
				return { actions: [{ type: SettlerActionType.Wait, durationMs: 2000, setState: SettlerState.WaitingForWork }] }
			}

			const precheckTarget = resolveReachableTarget(sourceBuilding.position, targetBuilding.position)
			if (!precheckTarget) {
				return { actions: [{ type: SettlerActionType.Wait, durationMs: 2000, setState: SettlerState.WaitingForWork }] }
			}

			const reservation = reservationSystem.reserve({
				kind: ReservationKind.Storage,
				direction: 'outgoing',
				buildingInstanceId: step.source.buildingInstanceId,
				itemType: step.itemType,
				quantity: step.quantity,
				ownerId: assignment.assignmentId
			})
			if (!reservation || reservation.kind !== ReservationKind.Storage) {
				return { actions: [{ type: SettlerActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
			}
			reservationRefs.push(reservation.ref)

			let sourcePosition = reservation.position
			const reachableSourceSlot = resolveReachableTarget(settler.position, sourcePosition)
			if (!reachableSourceSlot) {
				releaseReservations()
				return { actions: [{ type: SettlerActionType.Wait, durationMs: 2000, setState: SettlerState.WaitingForWork }] }
			}
			sourcePosition = reachableSourceSlot

			let targetReservationId: string | null = null
			let targetReservationRef: { kind: ReservationKind.Storage, reservationId: string } | null = null
			let targetPosition = targetBuilding.position
			const precheckSlotTarget = resolveReachableTarget(reservation.position, targetPosition)
			if (!precheckSlotTarget) {
				releaseReservations()
				return { actions: [{ type: SettlerActionType.Wait, durationMs: 2000, setState: SettlerState.WaitingForWork }] }
			}
			targetPosition = precheckSlotTarget
			if (step.target.type === TransportTargetType.Storage) {
				const targetReservation = reservationSystem.reserve({
					kind: ReservationKind.Storage,
					direction: 'incoming',
					buildingInstanceId: step.target.buildingInstanceId,
					itemType: step.itemType,
					quantity: step.quantity,
					ownerId: assignment.assignmentId
				})
				if (!targetReservation || targetReservation.kind !== ReservationKind.Storage) {
					releaseReservations()
					return { actions: [{ type: SettlerActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
				}
				targetReservationId = targetReservation.reservationId
				targetReservationRef = targetReservation.ref
				targetPosition = targetReservation.position
				reservationRefs.push(targetReservation.ref)

				const reachableTarget = resolveReachableTarget(reservation.position, targetPosition)
				if (!reachableTarget) {
					releaseReservations()
					return { actions: [{ type: SettlerActionType.Wait, durationMs: 2000, setState: SettlerState.WaitingForWork }] }
				}
				targetPosition = reachableTarget
			}
			const egressPosition = getRandomDeliveryEgressPosition(targetPosition, [
				targetBuilding.position,
				targetPosition
			])
			const actions: SettlerAction[] = [
				{ type: SettlerActionType.Move, position: sourcePosition, targetType: MoveTargetType.StorageSlot, targetId: reservation.reservationId, setState: SettlerState.MovingToBuilding },
				{
					type: SettlerActionType.WithdrawStorage,
					buildingInstanceId: sourceBuilding.id,
					itemType: step.itemType,
					quantity: step.quantity,
					reservationId: reservation.reservationId,
					reservationRefs: [reservation.ref],
					setState: SettlerState.CarryingItem
				},
				{ type: SettlerActionType.Move, position: targetPosition, targetType: step.target.type === TransportTargetType.Storage ? MoveTargetType.StorageSlot : MoveTargetType.Building, targetId: targetReservationId || targetBuilding.id, setState: SettlerState.CarryingItem },
				// Construction consumes collectedResources (pre-storage), so it uses a dedicated action.
				step.target.type === TransportTargetType.Construction
					? { type: SettlerActionType.DeliverConstruction, buildingInstanceId: targetBuilding.id, itemType: step.itemType, quantity: step.quantity, setState: SettlerState.Working }
					: {
						type: SettlerActionType.DeliverStorage,
						buildingInstanceId: targetBuilding.id,
						itemType: step.itemType,
						quantity: step.quantity,
						reservationId: targetReservationId || undefined,
						reservationRefs: targetReservationRef ? [targetReservationRef] : undefined,
						setState: SettlerState.Working
					}
			]
			if (egressPosition) {
				actions.push({
					type: SettlerActionType.Move,
					position: egressPosition,
					targetType: MoveTargetType.Spot,
					targetId: `delivery-egress:${assignment.assignmentId}:${targetBuilding.id}`,
					setState: SettlerState.Moving
				})
			}

			return {
				actions
			}
		}

		return { actions: [] }
	}
}
