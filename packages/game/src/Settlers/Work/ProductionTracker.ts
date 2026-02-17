import { Receiver } from '../../Receiver'
import { BuildingsEvents } from '../../Buildings/events'
import { ProductionStatus } from '../../Buildings/types'
import type { ProductionRecipe, SetProductionPausedData } from '../../Buildings/types'
import { getBuildingWorkKinds, getProductionRecipes } from '../../Buildings/work'
import type { WorkProviderDeps } from './deps'
import type { EventManager } from '../../events'
import type { AssignmentStore } from './AssignmentStore'
import type { WorkAssignment, WorkStep } from './types'
import { WorkStepType, WorkWaitReason } from './types'
import type { BuildingInstanceId, SettlerId } from '../../ids'

export class ProductionTracker {
	private productionStateByBuilding = new Map<BuildingInstanceId, { status: ProductionStatus, progress: number }>()

	constructor(
		private managers: WorkProviderDeps,
		private event: EventManager,
		private assignments: AssignmentStore,
		private dispatchNextStep: (settlerId: SettlerId) => void
	) {}

	handleProductionPaused(data: SetProductionPausedData): void {
		const building = this.managers.buildings.getBuildingInstance(data.buildingInstanceId)
		if (!building) {
			return
		}

		const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
		if (!definition || getBuildingWorkKinds(definition).length === 0) {
			return
		}

		this.managers.buildings.setProductionPaused(building.id, data.paused)

		if (data.paused) {
			this.emitProductionStatus(building.id, ProductionStatus.Paused)
			return
		}

		const assigned = this.assignments.getByBuilding(building.id)
		if (!assigned || assigned.size === 0) {
			this.emitProductionStatus(building.id, ProductionStatus.NoWorker)
			return
		}

		this.emitProductionStatus(building.id, ProductionStatus.Idle)
		for (const settlerId of assigned) {
			this.dispatchNextStep(settlerId)
		}
	}

	updateForStep(assignment: WorkAssignment, step: WorkStep): void {
		if (!assignment.buildingInstanceId) {
			return
		}
		const building = this.managers.buildings.getBuildingInstance(assignment.buildingInstanceId)
		if (!building) {
			return
		}
		const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
		if (!definition || getProductionRecipes(definition).length === 0) {
			return
		}
		if (step.type === WorkStepType.Produce) {
			this.emitProductionStarted(building.id, step.recipe)
			return
		}

		if (step.type === WorkStepType.AcquireTool) {
			this.emitProductionStatus(building.id, ProductionStatus.NoWorker)
			return
		}

		if (step.type === WorkStepType.Wait && step.reason === WorkWaitReason.Paused) {
			this.emitProductionStatus(building.id, ProductionStatus.Paused)
			return
		}

		if (step.type === WorkStepType.Wait && step.reason === WorkWaitReason.MissingInputs) {
			this.emitProductionStatus(building.id, ProductionStatus.NoInput)
			return
		}

		if (step.type === WorkStepType.Wait) {
			this.emitProductionStatus(building.id, ProductionStatus.Idle)
		}
	}

	serialize(): Array<[BuildingInstanceId, { status: ProductionStatus, progress: number }]> {
		return Array.from(this.productionStateByBuilding.entries())
	}

	deserialize(entries: Array<[BuildingInstanceId, { status: ProductionStatus, progress: number }]>): void {
		this.productionStateByBuilding = new Map(entries)
	}

	reset(): void {
		this.productionStateByBuilding.clear()
	}

	private emitProductionStarted(buildingInstanceId: BuildingInstanceId, recipe: ProductionRecipe): void {
		this.emitProductionStatus(buildingInstanceId, ProductionStatus.InProduction, 0)
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return
		}
		this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionStarted, {
			buildingInstanceId,
			recipe
		}, building.mapId)
		this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionProgress, {
			buildingInstanceId,
			progress: 0
		}, building.mapId)
	}

	private emitProductionCompleted(buildingInstanceId: BuildingInstanceId, recipe: ProductionRecipe): void {
		this.emitProductionStatus(buildingInstanceId, ProductionStatus.Idle, 100)
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return
		}
		this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionCompleted, {
			buildingInstanceId,
			recipe
		}, building.mapId)
		this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionProgress, {
			buildingInstanceId,
			progress: 100
		}, building.mapId)
	}

	handleProductionCompleted(buildingInstanceId: BuildingInstanceId, recipe: ProductionRecipe): void {
		this.managers.buildings.recordProduction(buildingInstanceId, recipe.id, 1)
		this.emitProductionCompleted(buildingInstanceId, recipe)
	}

	private emitProductionStatus(buildingInstanceId: BuildingInstanceId, status: ProductionStatus, progress?: number): void {
		const current = this.productionStateByBuilding.get(buildingInstanceId)
		const nextProgress = typeof progress === 'number' ? progress : (current?.progress ?? 0)
		if (current && current.status === status && current.progress === nextProgress) {
			return
		}
		this.productionStateByBuilding.set(buildingInstanceId, { status, progress: nextProgress })
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return
		}
		this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionStatusChanged, {
			buildingInstanceId,
			status
		}, building.mapId)
		if (typeof progress === 'number') {
			this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionProgress, {
				buildingInstanceId,
				progress
			}, building.mapId)
		}
	}
}
