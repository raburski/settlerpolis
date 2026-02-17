import { ConstructionStage } from '../../../Buildings/types'
import { ProfessionType } from '../../../Population/types'
import type { WorkProviderDeps } from '../deps'
import type { AssignmentStore } from '../AssignmentStore'
import { WorkProviderType } from '../types'
import type { BuildingInstanceId, MapId, SettlerId } from '../../../ids'

export class ConstructionCoordinator {
	private lastConstructionAssignAt = new Map<BuildingInstanceId, number>()

	constructor(
		private managers: WorkProviderDeps,
		private assignments: AssignmentStore,
		private getNowMs: () => number,
		private requestWorkerForBuilding: (buildingInstanceId: BuildingInstanceId, mapId: MapId) => void,
		private unassignWorker: (settlerId: SettlerId) => void,
		private assignCooldownMs: number
	) {}

	assignConstructionWorkers(force = false): void {
		const buildings = this.managers.buildings.getAllBuildings()
		for (const building of buildings) {
			if (building.stage !== ConstructionStage.Constructing) {
				continue
			}
			const now = this.getNowMs()
			const lastAttempt = this.lastConstructionAssignAt.get(building.id) || 0
			if (!force && now - lastAttempt < this.assignCooldownMs) {
				continue
			}
			const constructionAssignments = Array.from(this.assignments.getAll()).filter(
				assignment => assignment.buildingInstanceId === building.id && assignment.providerType === WorkProviderType.Construction
			)
			const hasBuilderAssigned = constructionAssignments.some(assignment => {
				const settler = this.managers.population.getSettler(assignment.settlerId)
				return settler?.profession === ProfessionType.Builder
			})
			if (hasBuilderAssigned) {
				continue
			}
			for (const assignment of constructionAssignments) {
				this.unassignWorker(assignment.settlerId)
			}
			this.lastConstructionAssignAt.set(building.id, now)
			this.requestWorkerForBuilding(building.id, building.mapId)
		}
	}

	unassignAllForBuilding(buildingInstanceId: BuildingInstanceId): void {
		const settlerIds = this.assignments.getByBuilding(buildingInstanceId)
		if (!settlerIds || settlerIds.size === 0) {
			return
		}
		for (const settlerId of Array.from(settlerIds)) {
			this.unassignWorker(settlerId)
		}
		this.assignConstructionWorkers(true)
	}

	serializeLastAssignAt(): Array<[BuildingInstanceId, number]> {
		return Array.from(this.lastConstructionAssignAt.entries())
	}

	deserializeLastAssignAt(entries: Array<[BuildingInstanceId, number]>): void {
		this.lastConstructionAssignAt = new Map(entries)
	}

	reset(): void {
		this.lastConstructionAssignAt.clear()
	}
}
