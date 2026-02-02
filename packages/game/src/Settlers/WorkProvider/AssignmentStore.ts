import type { WorkAssignment } from './types'
import type { BuildingInstanceId, SettlerId } from '../../ids'
import type { MapEntries } from '../../state/types'

export class AssignmentStore {
	private assignments = new Map<SettlerId, WorkAssignment>()
	private assignmentsByBuilding = new Map<BuildingInstanceId, Set<SettlerId>>()

	has(settlerId: SettlerId): boolean {
		return this.assignments.has(settlerId)
	}

	get(settlerId: SettlerId): WorkAssignment | undefined {
		return this.assignments.get(settlerId)
	}

	set(assignment: WorkAssignment): void {
		this.assignments.set(assignment.settlerId, assignment)
		if (!assignment.buildingInstanceId) {
			return
		}
		let buildingAssignments = this.assignmentsByBuilding.get(assignment.buildingInstanceId)
		if (!buildingAssignments) {
			buildingAssignments = new Set()
			this.assignmentsByBuilding.set(assignment.buildingInstanceId, buildingAssignments)
		}
		buildingAssignments.add(assignment.settlerId)
	}

	remove(settlerId: SettlerId): WorkAssignment | undefined {
		const assignment = this.assignments.get(settlerId)
		if (!assignment) {
			return undefined
		}
		this.assignments.delete(settlerId)
		if (assignment.buildingInstanceId) {
			const buildingAssignments = this.assignmentsByBuilding.get(assignment.buildingInstanceId)
			if (buildingAssignments) {
				buildingAssignments.delete(settlerId)
				if (buildingAssignments.size === 0) {
					this.assignmentsByBuilding.delete(assignment.buildingInstanceId)
				}
			}
		}
		return assignment
	}

	getByBuilding(buildingInstanceId: BuildingInstanceId): Set<SettlerId> | undefined {
		return this.assignmentsByBuilding.get(buildingInstanceId)
	}

	getAll(): Iterable<WorkAssignment> {
		return this.assignments.values()
	}

	getAssignmentsByBuilding(): Map<BuildingInstanceId, Set<SettlerId>> {
		return this.assignmentsByBuilding
	}

	clear(): void {
		this.assignments.clear()
		this.assignmentsByBuilding.clear()
	}

	serializeAssignments(): WorkAssignment[] {
		return Array.from(this.assignments.values()).map(assignment => ({ ...assignment }))
	}

	serializeAssignmentsByBuilding(): MapEntries<SettlerId[]> {
		return Array.from(this.assignmentsByBuilding.entries()).map(([buildingId, settlerIds]) => ([
			buildingId,
			Array.from(settlerIds.values())
		]))
	}

	deserialize(assignments: WorkAssignment[], assignmentsByBuilding: MapEntries<SettlerId[]>): void {
		this.clear()
		for (const assignment of assignments) {
			this.set({ ...assignment })
		}
		this.assignmentsByBuilding = new Map(
			assignmentsByBuilding.map(([buildingId, settlerIds]) => ([
				buildingId,
				new Set(settlerIds)
			]))
		)
	}
}
