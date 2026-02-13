import type { WorkProviderDeps } from '../deps'
import type { AssignmentStore } from '../AssignmentStore'
import type { ProviderFactory } from '../ProviderFactory'
import type { WorkAssignment } from '../types'
import { WorkAssignmentStatus, WorkProviderType } from '../types'
import { SettlerState, ProfessionType } from '../../../Population/types'
import { ConstructionStage } from '../../../Buildings/types'
import { v4 as uuidv4 } from 'uuid'

export class RoadCoordinator {
	constructor(
		private managers: WorkProviderDeps,
		private assignments: AssignmentStore,
		private providers: ProviderFactory,
		private getNowMs: () => number,
		private dispatchNextStep: (settlerId: string) => void
	) {}

	assignRoadWorkers(): void {
		const groups = this.managers.roads.getPendingJobGroups()
		for (const group of groups) {
			if (this.hasUnassignedConstruction(group.mapId, group.playerId)) {
				continue
			}
			const provider = this.providers.getRoad(group.mapId, group.playerId)
			const available = this.managers.population.getAvailableSettlers(group.mapId, group.playerId)
				.filter(settler => settler.profession === ProfessionType.Builder)
				.filter(settler => !this.assignments.has(settler.id))

			let assigned = 0
			for (const settler of available) {
				if (assigned >= group.count) {
					break
				}
				const assignment: WorkAssignment = {
					assignmentId: uuidv4(),
					settlerId: settler.id,
					providerId: provider.id,
					providerType: WorkProviderType.Road,
					assignedAt: this.getNowMs(),
					status: WorkAssignmentStatus.Assigned
				}
				this.assignments.set(assignment)
				provider.assign(settler.id)
				this.managers.population.setSettlerAssignment(settler.id, assignment.assignmentId, assignment.providerId, undefined)
				this.managers.population.setSettlerState(settler.id, SettlerState.Assigned)
				this.dispatchNextStep(settler.id)
				assigned += 1
			}
		}
	}

	private hasUnassignedConstruction(mapId: string, playerId: string): boolean {
		const buildings = this.managers.buildings.getAllBuildings()
		for (const building of buildings) {
			if (building.mapId !== mapId || building.playerId !== playerId) {
				continue
			}
			if (building.stage !== ConstructionStage.Constructing) {
				continue
			}
			const assignedSettlers = this.assignments.getByBuilding(building.id)
			let hasBuilder = false
			if (assignedSettlers) {
				for (const settlerId of assignedSettlers) {
					const settler = this.managers.population.getSettler(settlerId)
					if (settler?.profession === ProfessionType.Builder) {
						hasBuilder = true
						break
					}
				}
			}
			if (!hasBuilder) {
				return true
			}
		}
		return false
	}
}
