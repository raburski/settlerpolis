import { v4 as uuidv4 } from 'uuid'
import { ConstructionStage } from '../Buildings/types'
import { PopulationEvents } from '../Population/events'
import { ProfessionType, Settler, SettlerState } from '../Population/types'
import { Receiver } from '../Receiver'
import { calculateDistance } from '../utils'
import type { EventManager } from '../events'
import type { Logger } from '../Logs'
import type { JobsDeps } from './index'
import type { ReservationService } from './ReservationService'
import { JobAssignment, JobReservation, JobStatus, JobType, RoleAssignment, RoleType } from './types'

export interface RoleAssignmentsContext {
	managers: JobsDeps
	event: EventManager
	logger: Logger
	reservationService: ReservationService
	registerJob: (job: JobAssignment) => void
	startJob: (job: JobAssignment) => void
	addReservation: (job: JobAssignment, reservation: JobReservation | null) => void
	cancelJob: (jobId: string, reason?: string) => void
}

export class RoleAssignments {
	private assignmentsBySettler = new Map<string, RoleAssignment>()
	private assignmentsByBuilding = new Map<string, Set<string>>()

	constructor(private context: RoleAssignmentsContext) {}

	public requestWorker(buildingInstanceId: string): void {
		const building = this.context.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return
		}

		if (!this.context.managers.buildings.getBuildingNeedsWorkers(buildingInstanceId)) {
			return
		}

		const buildingDef = this.context.managers.buildings.getBuildingDefinition(building.buildingId)
		if (!buildingDef) {
			return
		}

		let roleType: RoleType
		let requiredProfession: ProfessionType | undefined
		let allowToolPickup = true
		if (building.stage === ConstructionStage.Constructing) {
			roleType = RoleType.Construction
			requiredProfession = ProfessionType.Builder
			allowToolPickup = false
		} else if (building.stage === ConstructionStage.Completed && buildingDef.workerSlots) {
			roleType = RoleType.Production
			requiredProfession = buildingDef.requiredProfession ? buildingDef.requiredProfession as ProfessionType : undefined
		} else {
			return
		}

		if (roleType === RoleType.Production) {
			const workerSlots = buildingDef.workerSlots || 0
			if (workerSlots > 0 && this.getAssignedWorkerCountForBuilding(buildingInstanceId, RoleType.Production) >= workerSlots) {
				this.context.event.emit(Receiver.Group, PopulationEvents.SC.WorkerRequestFailed, {
					buildingInstanceId,
					reason: 'building_does_not_need_workers'
				}, building.mapName)
				return
			}
		}

		const worker = this.findIdleWorkerForRole(building, requiredProfession, allowToolPickup)
		if (!worker) {
			let reason = 'no_worker_available'
			const idleSettlers = this.getIdleSettlersForRole(building.mapName, building.playerId)
			if (requiredProfession && idleSettlers.length > 0) {
				const hasRequired = idleSettlers.some(settler => settler.profession === requiredProfession)
				if (!hasRequired && !allowToolPickup) {
					reason = 'no_suitable_profession'
				} else if (!hasRequired && allowToolPickup) {
					const toolItemType = this.context.managers.population.getToolItemType(requiredProfession)
					const toolItem = toolItemType ? this.context.managers.population.findAvailableToolOnMap(building.mapName, toolItemType) : null
					if (!toolItem) {
						reason = 'no_available_tool'
					}
				}
			}
			this.context.event.emit(Receiver.Group, PopulationEvents.SC.WorkerRequestFailed, {
				buildingInstanceId,
				reason
			}, building.mapName)
			return
		}

		if (requiredProfession && worker.profession !== requiredProfession) {
			if (!allowToolPickup) {
				this.context.event.emit(Receiver.Group, PopulationEvents.SC.WorkerRequestFailed, {
					buildingInstanceId,
					reason: 'no_suitable_profession'
				}, building.mapName)
				return
			}

			const toolItemType = this.context.managers.population.getToolItemType(requiredProfession)
			const toolItem = toolItemType ? this.context.managers.population.findAvailableToolOnMap(building.mapName, toolItemType) : null
			if (!toolItem) {
				this.context.event.emit(Receiver.Group, PopulationEvents.SC.WorkerRequestFailed, {
					buildingInstanceId,
					reason: 'no_available_tool'
				}, building.mapName)
				return
			}
		}

		const assignment: RoleAssignment = {
			roleId: uuidv4(),
			settlerId: worker.id,
			buildingInstanceId,
			roleType,
			requiredProfession,
			assignedAt: Date.now()
		}
		this.addRoleAssignment(assignment)
		this.dispatchRoleAssignment(assignment)
	}

	public unassignWorker(settlerId: string, reason: string = 'unassigned'): void {
		const assignment = this.removeRoleAssignment(settlerId)
		const settler = this.context.managers.population.getSettler(settlerId)
		if (!settler) {
			return
		}

		if (settler.stateContext.jobId) {
			this.context.cancelJob(settler.stateContext.jobId, reason)
		}

		if (!assignment) {
			return
		}
	}

	public clearRoleAssignmentsForBuilding(
		buildingInstanceId: string,
		roleType?: RoleType,
		options?: { skipJobCancel?: boolean }
	): void {
		const settlerIds = this.assignmentsByBuilding.get(buildingInstanceId)
		if (!settlerIds || settlerIds.size === 0) {
			return
		}

		for (const settlerId of Array.from(settlerIds)) {
			const assignment = this.assignmentsBySettler.get(settlerId)
			if (!assignment) {
				continue
			}
			if (roleType && assignment.roleType !== roleType) {
				continue
			}
			if (options?.skipJobCancel) {
				this.removeRoleAssignment(settlerId)
				continue
			}
			this.unassignWorker(settlerId, 'role_cleared')
		}
	}

	public getRoleAssignmentForSettler(settlerId: string): RoleAssignment | undefined {
		return this.assignmentsBySettler.get(settlerId)
	}

	public getAssignedWorkerIdsForBuilding(buildingInstanceId: string, roleType?: RoleType): string[] {
		const settlerIds = this.assignmentsByBuilding.get(buildingInstanceId)
		if (!settlerIds) {
			return []
		}

		const results: string[] = []
		for (const settlerId of settlerIds) {
			const assignment = this.assignmentsBySettler.get(settlerId)
			if (!assignment) {
				continue
			}
			if (roleType && assignment.roleType !== roleType) {
				continue
			}
			results.push(settlerId)
		}

		return results
	}

	public getAssignedWorkerCountForBuilding(buildingInstanceId: string, roleType?: RoleType): number {
		return this.getAssignedWorkerIdsForBuilding(buildingInstanceId, roleType).length
	}

	public isSettlerAssignedToRole(settlerId: string): boolean {
		return this.assignmentsBySettler.has(settlerId)
	}

	public dispatchRoleAssignments(): void {
		for (const assignment of this.assignmentsBySettler.values()) {
			this.dispatchRoleAssignment(assignment)
		}
	}

	private dispatchRoleAssignment(assignment: RoleAssignment): void {
		const settler = this.context.managers.population.getSettler(assignment.settlerId)
		if (!settler) {
			this.removeRoleAssignment(assignment.settlerId)
			return
		}

		if (settler.state !== SettlerState.Idle || settler.stateContext.jobId) {
			return
		}

		const building = this.context.managers.buildings.getBuildingInstance(assignment.buildingInstanceId)
		if (!building) {
			this.removeRoleAssignment(assignment.settlerId)
			return
		}

		if (assignment.roleType === RoleType.Construction) {
			if (building.stage !== ConstructionStage.Constructing) {
				return
			}
			this.createWorkerJobForSettler(settler, building.id, JobType.Construction, assignment.requiredProfession, false)
			return
		}

		if (assignment.roleType === RoleType.Production) {
			const definition = this.context.managers.buildings.getBuildingDefinition(building.buildingId)
			if (!definition || building.stage !== ConstructionStage.Completed) {
				return
			}
			if (definition.harvest && !definition.productionRecipe) {
				return
			}
			if (definition.workerSlots !== undefined) {
				const assignedCount = this.getAssignedWorkerCountForBuilding(building.id, RoleType.Production)
				if (definition.workerSlots === 0 || assignedCount > definition.workerSlots) {
					return
				}
			}
			this.createWorkerJobForSettler(settler, building.id, JobType.Production, assignment.requiredProfession, true)
		}
	}

	private createWorkerJobForSettler(
		settler: Settler,
		buildingInstanceId: string,
		jobType: JobType,
		requiredProfession: ProfessionType | undefined,
		allowToolPickup: boolean
	): string | null {
		if (settler.stateContext.jobId) {
			return null
		}

		const building = this.context.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return null
		}

		const jobId = uuidv4()
		let toolItemId: string | undefined
		let toolReservation: JobReservation | null = null

		if (requiredProfession && settler.profession !== requiredProfession) {
			if (!allowToolPickup) {
				return null
			}
			const toolItemType = this.context.managers.population.getToolItemType(requiredProfession)
			if (!toolItemType) {
				return null
			}
			const toolItem = this.context.managers.population.findAvailableToolOnMap(building.mapName, toolItemType)
			if (!toolItem) {
				return null
			}
			toolReservation = this.context.reservationService.reserveTool(toolItem.id, jobId)
			if (!toolReservation) {
				return null
			}
			toolItemId = toolItem.id
		}

		const jobAssignment: JobAssignment = {
			jobId,
			settlerId: settler.id,
			buildingInstanceId,
			jobType,
			priority: 1,
			assignedAt: Date.now(),
			status: JobStatus.Pending,
			requiredProfession,
			toolItemId
		}
		this.context.addReservation(jobAssignment, toolReservation)

		this.context.registerJob(jobAssignment)
		this.context.startJob(jobAssignment)

		return jobAssignment.jobId
	}

	private addRoleAssignment(assignment: RoleAssignment): void {
		this.assignmentsBySettler.set(assignment.settlerId, assignment)
		if (!this.assignmentsByBuilding.has(assignment.buildingInstanceId)) {
			this.assignmentsByBuilding.set(assignment.buildingInstanceId, new Set())
		}
		this.assignmentsByBuilding.get(assignment.buildingInstanceId)!.add(assignment.settlerId)
	}

	private removeRoleAssignment(settlerId: string): RoleAssignment | null {
		const assignment = this.assignmentsBySettler.get(settlerId)
		if (!assignment) {
			return null
		}

		this.assignmentsBySettler.delete(settlerId)
		const buildingSet = this.assignmentsByBuilding.get(assignment.buildingInstanceId)
		if (buildingSet) {
			buildingSet.delete(settlerId)
			if (buildingSet.size === 0) {
				this.assignmentsByBuilding.delete(assignment.buildingInstanceId)
			}
		}

		return assignment
	}

	private getIdleSettlersForRole(mapName: string, playerId: string): Settler[] {
		return this.context.managers.population.getSettlersForPlayer(playerId, mapName).filter(settler =>
			settler.state === SettlerState.Idle &&
			!settler.stateContext.jobId &&
			!this.assignmentsBySettler.has(settler.id)
		)
	}

	private findIdleWorkerForRole(
		building: { mapName: string, playerId: string, position: { x: number, y: number } },
		requiredProfession: ProfessionType | undefined,
		allowToolPickup: boolean
	): Settler | null {
		const idleSettlers = this.getIdleSettlersForRole(building.mapName, building.playerId)
		if (idleSettlers.length === 0) {
			return null
		}

		if (requiredProfession) {
			const matching = idleSettlers.filter(settler => settler.profession === requiredProfession)
			if (matching.length > 0) {
				return this.findClosestSettler(matching, building.position)
			}

			if (!allowToolPickup) {
				return null
			}

			const carriers = idleSettlers.filter(settler => settler.profession === ProfessionType.Carrier)
			if (carriers.length === 0) {
				return null
			}

			return this.findClosestSettler(carriers, building.position)
		}

		return this.findClosestSettler(idleSettlers, building.position)
	}

	private findClosestSettler(settlers: Settler[], targetPosition: { x: number, y: number }): Settler {
		let closest = settlers[0]
		let closestDistance = calculateDistance(closest.position, targetPosition)

		for (let i = 1; i < settlers.length; i++) {
			const distance = calculateDistance(settlers[i].position, targetPosition)
			if (distance < closestDistance) {
				closest = settlers[i]
				closestDistance = distance
			}
		}

		return closest
	}
}
