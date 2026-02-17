import { Receiver } from '../../Receiver'
import type { EventManager } from '../../events'
import type { WorkProviderDeps } from '../Work/deps'
import { WorkProviderEvents } from '../Work/events'
import type { WorkAssignment, WorkStep, WorkAction } from '../Work/types'
import { TransportTargetType, WorkProviderType, WorkStepType, WorkWaitReason } from '../Work/types'
import { SettlerState } from '../../Population/types'
import { StepHandlers } from '../Work/stepHandlers'
import type { SettlerActionsManager } from '../Actions'
import type { ActionQueueContext } from '../../state/types'
import { ActionQueueContextKind } from '../../state/types'
import { WorkPolicyPhase } from '../Work/policies/constants'
import type { SettlerId } from '../../ids'
import { calculateDistance } from '../../utils'
import type { BuildingDefinition, BuildingInstance } from '../../Buildings/types'
import type { MapData } from '../../Map/types'
import type { SettlerWorkRuntimePort } from '../Work/runtime'

const MOVEMENT_RECOVERY_COOLDOWN_MS = 8000
const MOVEMENT_FAILURE_MAX_RETRIES = 3
const DEFAULT_TILE_SIZE = 32
const CONSTRUCTION_ACTIVE_MARGIN_TILES = 1

const getRotatedFootprint = (definition: BuildingDefinition, rotation: number): { width: number; height: number } => {
	const turns = ((rotation % 4) + 4) % 4
	if (turns % 2 === 1) {
		return { width: definition.footprint.height, height: definition.footprint.width }
	}
	return { width: definition.footprint.width, height: definition.footprint.height }
}

const isSettlerInConstructionArea = (
	settlerPosition: { x: number; y: number },
	building: BuildingInstance,
	definition: BuildingDefinition,
	map?: MapData | null
): boolean => {
	const tileSize = map?.tiledMap?.tilewidth || DEFAULT_TILE_SIZE
	const rotation = typeof building.rotation === 'number' ? building.rotation : 0
	const footprint = getRotatedFootprint(definition, rotation)
	const widthPx = footprint.width * tileSize
	const heightPx = footprint.height * tileSize
	const center = {
		x: building.position.x + widthPx / 2,
		y: building.position.y + heightPx / 2
	}
	const radius = Math.max(widthPx, heightPx) / 2 + CONSTRUCTION_ACTIVE_MARGIN_TILES * tileSize
	return calculateDistance(settlerPosition, center) <= radius
}

export interface SettlerBehaviourCoordinator {
	processPendingDispatches(): void
	dispatchNextStep(settlerId: SettlerId): void
	buildWorkQueueCallbacks(settlerId: SettlerId, step?: WorkStep, releaseReservations?: () => void): {
		onComplete: () => void
		onFail: (reason: string) => void
	}
	clearSettlerState(settlerId: SettlerId): void
	serialize(): {
		movementRecoveryUntil: Array<[SettlerId, number]>
		movementRecoveryReason: Array<[SettlerId, WorkWaitReason]>
		movementFailureCounts: Array<[SettlerId, number]>
		pendingDispatchAtMs: Array<[SettlerId, number]>
	}
	deserialize(state: {
		movementRecoveryUntil: Array<[SettlerId, number]>
		movementRecoveryReason: Array<[SettlerId, WorkWaitReason]>
		movementFailureCounts: Array<[SettlerId, number]>
		pendingDispatchAtMs: Array<[SettlerId, number]>
	}): void
	reset(): void
}

export class SettlerBehaviourManager implements SettlerBehaviourCoordinator {
	private movementRecoveryUntil = new Map<SettlerId, number>()
	private movementRecoveryReason = new Map<SettlerId, WorkWaitReason>()
	private movementFailureCounts = new Map<SettlerId, number>()
	private pendingDispatchAtMs = new Map<SettlerId, number>()

	constructor(
		private managers: WorkProviderDeps,
		private event: EventManager,
		private actionSystem: SettlerActionsManager,
		private runtime: SettlerWorkRuntimePort
	) {}

	private isWarehouseLogisticsAssignment(assignment: WorkAssignment): boolean {
		if (assignment.providerType !== WorkProviderType.Logistics || !assignment.buildingInstanceId) {
			return false
		}
		const building = this.managers.buildings.getBuildingInstance(assignment.buildingInstanceId)
		if (!building) {
			return false
		}
		const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
		return Boolean(definition?.isWarehouse)
	}

	private maybeActivateConstructionWorker(settlerId: SettlerId, step: WorkStep): void {
		if (step.type !== WorkStepType.Construct) {
			return
		}
		const settler = this.managers.population.getSettler(settlerId)
		const building = this.managers.buildings.getBuildingInstance(step.buildingInstanceId)
		if (!settler || !building) {
			return
		}
		const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
		if (!definition) {
			return
		}
		const map = this.managers.map.getMap(building.mapId)
		if (!isSettlerInConstructionArea(settler.position, building, definition, map)) {
			return
		}
		this.managers.buildings.setConstructionWorkerActive(building.id, settlerId, true)
	}

	private clearConstructionWorker(settlerId: SettlerId, step: WorkStep): void {
		if (step.type !== WorkStepType.Construct) {
			return
		}
		this.managers.buildings.setConstructionWorkerActive(step.buildingInstanceId, settlerId, false)
	}

	processPendingDispatches(): void {
		if (this.pendingDispatchAtMs.size === 0) {
			return
		}

		const now = this.runtime.getNowMs()
		for (const [settlerId, dispatchAt] of this.pendingDispatchAtMs.entries()) {
			if (now < dispatchAt) {
				continue
			}
			if (this.actionSystem.isBusy(settlerId)) {
				continue
			}
			this.pendingDispatchAtMs.delete(settlerId)
			this.dispatchNextStep(settlerId)
		}
	}

	dispatchNextStep(settlerId: SettlerId): void {
		if (this.actionSystem.isBusy(settlerId)) {
			return
		}

		const { pauseRequests, pausedContexts } = this.runtime.getPauseState()
		if (pauseRequests.has(settlerId) || pausedContexts.has(settlerId)) {
			if (!pausedContexts.has(settlerId)) {
				this.runtime.requestPause(settlerId)
			}
			return
		}

		const assignment = this.runtime.getAssignment(settlerId)
		if (!assignment) {
			this.managers.population.setSettlerAssignment(settlerId, undefined, undefined, undefined)
			this.managers.population.setSettlerWaitReason(settlerId, WorkWaitReason.NoWork)
			this.managers.population.setSettlerLastStep(settlerId, undefined, WorkWaitReason.NoWork)
			this.managers.population.setSettlerState(settlerId, SettlerState.Idle)
			return
		}

		const recoveryUntil = this.movementRecoveryUntil.get(settlerId)
		if (recoveryUntil) {
			if (this.runtime.getNowMs() < recoveryUntil) {
				const reason = this.movementRecoveryReason.get(settlerId) ?? WorkWaitReason.MovementFailed
				this.managers.population.setSettlerWaitReason(settlerId, reason)
				this.managers.population.setSettlerLastStep(settlerId, undefined, reason)
				this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
				return
			}
			this.movementRecoveryUntil.delete(settlerId)
			this.movementRecoveryReason.delete(settlerId)
		}

		if (this.runtime.applyPolicy(WorkPolicyPhase.BeforeStep, settlerId, assignment)) {
			return
		}

		const provider = this.runtime.getProvider(assignment.providerId)
		if (!provider) {
			this.managers.population.setSettlerWaitReason(settlerId, WorkWaitReason.ProviderMissing)
			this.managers.population.setSettlerLastStep(settlerId, undefined, WorkWaitReason.ProviderMissing)
			this.runtime.unassignSettler(settlerId)
			return
		}

		const step = provider.requestNextStep(settlerId)
		if (!step) {
			if (this.runtime.applyPolicy(WorkPolicyPhase.NoStep, settlerId, assignment)) {
				return
			}
			this.managers.population.setSettlerWaitReason(settlerId, WorkWaitReason.NoWork)
			this.managers.population.setSettlerLastStep(settlerId, undefined, WorkWaitReason.NoWork)
			this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
			return
		}

		if (step.type === WorkStepType.Wait) {
			if (this.runtime.applyPolicy(WorkPolicyPhase.WaitStep, settlerId, assignment, step)) {
				return
			}
			this.managers.population.setSettlerWaitReason(settlerId, step.reason)
			this.managers.population.setSettlerLastStep(settlerId, step.type, step.reason)
			if (assignment.providerType === WorkProviderType.Logistics &&
				(step.reason === WorkWaitReason.NoRequests || step.reason === WorkWaitReason.NoViableRequest)) {
				if (!this.isWarehouseLogisticsAssignment(assignment)) {
					this.runtime.unassignSettler(settlerId)
					return
				}
			}
			if (assignment.providerType === WorkProviderType.Road &&
				(step.reason === WorkWaitReason.NoWork || step.reason === WorkWaitReason.WrongProfession)) {
				this.runtime.unassignSettler(settlerId)
				return
			}
			if (assignment.providerType === WorkProviderType.Prospecting &&
				(step.reason === WorkWaitReason.NoWork || step.reason === WorkWaitReason.WrongProfession)) {
				this.runtime.unassignSettler(settlerId)
				return
			}
			if (assignment.providerType === WorkProviderType.Construction && step.reason === WorkWaitReason.WrongProfession) {
				this.runtime.unassignSettler(settlerId)
				return
			}
		} else {
			this.managers.population.setSettlerWaitReason(settlerId, undefined)
			this.managers.population.setSettlerLastStep(settlerId, step.type, undefined)
		}

		this.runtime.updateProductionForStep(assignment, step)
		this.maybeActivateConstructionWorker(settlerId, step)

		this.event.emit(Receiver.All, WorkProviderEvents.SS.StepIssued, { settlerId, step })
		const { actions, releaseReservations } = this.buildActionsForStep(settlerId, assignment, step)

		if (!actions || actions.length === 0) {
			if (step.type === WorkStepType.Wait) {
				this.managers.population.setSettlerWaitReason(settlerId, step.reason)
			} else {
				this.managers.population.setSettlerWaitReason(settlerId, WorkWaitReason.NoWork)
			}
			this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
			releaseReservations?.()
			return
		}

		const callbacks = this.buildWorkQueueCallbacks(settlerId, step, releaseReservations)
		const context: ActionQueueContext = {
			kind: ActionQueueContextKind.Work,
			step,
			reservationOwnerId: assignment.assignmentId
		}
		this.actionSystem.enqueue(settlerId, actions, callbacks.onComplete, callbacks.onFail, context)
	}

	buildWorkQueueCallbacks(
		settlerId: SettlerId,
		step?: WorkStep,
		releaseReservations?: () => void
	): { onComplete: () => void, onFail: (reason: string) => void } {
		return {
			onComplete: () => {
				if (!step) {
					releaseReservations?.()
					this.dispatchNextStep(settlerId)
					return
				}
				const assignment = this.runtime.getAssignment(settlerId)
				if (!assignment) {
					releaseReservations?.()
					return
				}
				this.handleStepCompleted(settlerId, assignment, step, releaseReservations)
			},
			onFail: (reason: string) => {
				if (!step) {
					releaseReservations?.()
					this.dispatchNextStep(settlerId)
					return
				}
				const assignment = this.runtime.getAssignment(settlerId)
				if (!assignment) {
					releaseReservations?.()
					return
				}
				this.handleStepFailed(settlerId, assignment, step, reason, releaseReservations)
			}
		}
	}

	clearSettlerState(settlerId: SettlerId): void {
		this.movementFailureCounts.delete(settlerId)
		this.movementRecoveryUntil.delete(settlerId)
		this.movementRecoveryReason.delete(settlerId)
		this.pendingDispatchAtMs.delete(settlerId)
	}

	serialize(): {
		movementRecoveryUntil: Array<[SettlerId, number]>
		movementRecoveryReason: Array<[SettlerId, WorkWaitReason]>
		movementFailureCounts: Array<[SettlerId, number]>
		pendingDispatchAtMs: Array<[SettlerId, number]>
	} {
		return {
			movementRecoveryUntil: Array.from(this.movementRecoveryUntil.entries()),
			movementRecoveryReason: Array.from(this.movementRecoveryReason.entries()),
			movementFailureCounts: Array.from(this.movementFailureCounts.entries()),
			pendingDispatchAtMs: Array.from(this.pendingDispatchAtMs.entries())
		}
	}

	deserialize(state: {
		movementRecoveryUntil: Array<[SettlerId, number]>
		movementRecoveryReason: Array<[SettlerId, WorkWaitReason]>
		movementFailureCounts: Array<[SettlerId, number]>
		pendingDispatchAtMs: Array<[SettlerId, number]>
	}): void {
		this.movementRecoveryUntil = new Map(state.movementRecoveryUntil)
		this.movementRecoveryReason = new Map(state.movementRecoveryReason)
		this.movementFailureCounts = new Map(state.movementFailureCounts)
		this.pendingDispatchAtMs = new Map(state.pendingDispatchAtMs)
	}

	reset(): void {
		this.movementFailureCounts.clear()
		this.movementRecoveryUntil.clear()
		this.movementRecoveryReason.clear()
		this.pendingDispatchAtMs.clear()
	}

	private handleStepCompleted(
		settlerId: SettlerId,
		assignment: WorkAssignment,
		step: WorkStep,
		releaseReservations?: () => void
	): void {
		releaseReservations?.()
		this.event.emit(Receiver.All, WorkProviderEvents.SS.StepCompleted, { settlerId, step })
		this.managers.population.setSettlerLastStep(settlerId, step.type, undefined)
		this.managers.population.setSettlerState(settlerId, SettlerState.Idle)
		this.clearConstructionWorker(settlerId, step)
		this.movementFailureCounts.delete(settlerId)
		if (step.type === WorkStepType.Transport && step.target.type === TransportTargetType.Construction) {
			this.runtime.releaseConstructionInFlight(step.target.buildingInstanceId, step.itemType, step.quantity)
		}
		if (step.type === WorkStepType.Produce && assignment.buildingInstanceId) {
			this.runtime.handleProductionCompleted(assignment.buildingInstanceId, step.recipe)
		}
		if (assignment.providerType === WorkProviderType.Logistics && !this.runtime.hasPendingLogisticsRequests()) {
			if (!this.isWarehouseLogisticsAssignment(assignment)) {
				this.runtime.unassignSettler(settlerId)
				return
			}
		}
		this.dispatchNextStep(settlerId)
	}

	private handleStepFailed(
		settlerId: SettlerId,
		assignment: WorkAssignment,
		step: WorkStep,
		reason: string,
		releaseReservations?: () => void
	): void {
		releaseReservations?.()
		this.event.emit(Receiver.All, WorkProviderEvents.SS.StepFailed, { settlerId, step, reason })
		this.clearConstructionWorker(settlerId, step)
		let retryDelayMs = 1000
		const isWaitReason = (Object.values(WorkWaitReason) as string[]).includes(reason)
		let waitReason: WorkWaitReason = isWaitReason ? (reason as WorkWaitReason) : WorkWaitReason.NoWork
		let shouldDispatch = true
		if (reason === 'movement_failed' || reason === 'movement_cancelled') {
			const currentFailures = (this.movementFailureCounts.get(settlerId) || 0) + 1
			this.movementFailureCounts.set(settlerId, currentFailures)
			retryDelayMs = MOVEMENT_RECOVERY_COOLDOWN_MS
			waitReason = reason === 'movement_failed'
				? WorkWaitReason.MovementFailed
				: WorkWaitReason.MovementCancelled
			this.movementRecoveryUntil.set(settlerId, this.runtime.getNowMs() + retryDelayMs)
			this.movementRecoveryReason.set(settlerId, waitReason)
			if (currentFailures >= MOVEMENT_FAILURE_MAX_RETRIES) {
				if (step.type === WorkStepType.BuildRoad) {
					this.managers.roads.releaseJob(step.jobId)
				}
				this.runtime.unassignSettler(settlerId)
				this.movementFailureCounts.delete(settlerId)
				this.movementRecoveryUntil.delete(settlerId)
				this.movementRecoveryReason.delete(settlerId)
				shouldDispatch = false
			}
		}
		if (shouldDispatch) {
			this.managers.population.setSettlerWaitReason(settlerId, waitReason)
			this.managers.population.setSettlerLastStep(settlerId, step.type, waitReason)
			this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
		}
		if (step.type === WorkStepType.Transport && step.target.type === TransportTargetType.Construction) {
			this.runtime.releaseConstructionInFlight(step.target.buildingInstanceId, step.itemType, step.quantity)
		}
		if (shouldDispatch) {
			this.pendingDispatchAtMs.set(settlerId, this.runtime.getNowMs() + retryDelayMs)
		}
	}

	private buildActionsForStep(
		settlerId: SettlerId,
		assignment: WorkAssignment,
		step: WorkStep
	): { actions: WorkAction[], releaseReservations?: () => void } {
		const handler = StepHandlers[step.type]
		if (!handler) {
			return { actions: [] }
		}
		return handler.build({
			settlerId,
			assignment,
			step,
			managers: this.managers,
			reservationSystem: this.managers.reservations,
			simulationTimeMs: this.runtime.getNowMs()
		})
	}
}

export { SettlerBehaviourManager as DispatchCoordinator }
