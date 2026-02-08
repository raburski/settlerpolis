import { Receiver } from '../../Receiver'
import { ConstructionStage } from '../../Buildings/types'
import type { WorkProviderDeps } from './deps'
import type { EventManager } from '../../events'
import type { LogisticsProvider } from './providers/LogisticsProvider'
import type { AssignmentStore } from './AssignmentStore'
import type { WorkAssignment } from './types'
import { WorkAssignmentStatus, WorkProviderType } from './types'
import { SettlerState } from '../../Population/types'
import { WorkProviderEvents } from './events'
import { v4 as uuidv4 } from 'uuid'

const WAREHOUSE_REQUEST_PRIORITY = 5

export class LogisticsCoordinator {
	private lastMapIdsWithRequests = new Set<string>()

	constructor(
		private managers: WorkProviderDeps,
		private event: EventManager,
		private logisticsProvider: LogisticsProvider,
		private assignments: AssignmentStore,
		private getNowMs: () => number,
		private dispatchNextStep: (settlerId: string) => void
	) {}

	tick(): void {
		this.logisticsProvider.refreshConstructionRequests()
		this.refreshConsumptionRequests()
		this.refreshWarehouseRequests()
		this.emitLogisticsRequests()
		this.assignIdleCarriersToLogistics()
	}

	public broadcast(): void {
		this.emitLogisticsRequests()
	}

	private refreshConsumptionRequests(): void {
		const buildings = this.managers.buildings.getAllBuildings()
		for (const building of buildings) {
			if (building.stage !== ConstructionStage.Completed) {
				continue
			}

			const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
			if (!definition?.consumes || definition.consumes.length === 0) {
				continue
			}

			for (const request of definition.consumes) {
				const capacity = this.managers.storage.getStorageCapacity(building.id, request.itemType, 'incoming')
				if (capacity <= 0) {
					continue
				}
				const desired = Math.min(request.desiredQuantity, capacity)
				const current = this.managers.storage.getCurrentQuantity(building.id, request.itemType, 'incoming')
				const needed = desired - current
				this.logisticsProvider.requestInput(building.id, request.itemType, needed, 40)
			}
		}
	}

	private refreshWarehouseRequests(): void {
		const buildings = this.managers.buildings.getAllBuildings()
		for (const building of buildings) {
			if (building.stage !== ConstructionStage.Completed) {
				continue
			}

			const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
			if (!definition?.isWarehouse) {
				continue
			}

			const candidates = this.managers.buildings.getStorageRequestCandidates(building.id)
			if (candidates.length === 0) {
				continue
			}

			const requested = new Set(this.managers.buildings.getStorageRequestItems(building.id))
			for (const itemType of candidates) {
				if (this.managers.buildings.hasConstructionNeedForItem(building.mapId, building.playerId, itemType)) {
					this.logisticsProvider.requestInput(building.id, itemType, 0, WAREHOUSE_REQUEST_PRIORITY)
					continue
				}
				if (!requested.has(itemType)) {
					this.logisticsProvider.requestInput(building.id, itemType, 0, WAREHOUSE_REQUEST_PRIORITY)
					continue
				}
				const capacity = this.managers.storage.getStorageCapacity(building.id, itemType, 'incoming')
				if (capacity <= 0) {
					this.logisticsProvider.requestInput(building.id, itemType, 0, WAREHOUSE_REQUEST_PRIORITY)
					continue
				}
				const current = this.managers.storage.getCurrentQuantity(building.id, itemType, 'incoming')
				const needed = Math.max(0, capacity - current)
				this.logisticsProvider.requestInput(building.id, itemType, needed, WAREHOUSE_REQUEST_PRIORITY)
			}
		}
	}

	private emitLogisticsRequests(): void {
		const requests = this.logisticsProvider.getRequests()
		const byMap = new Map<string, typeof requests>()
		const itemPriorities = this.logisticsProvider.getItemPriorities()

		for (const request of requests) {
			const building = this.managers.buildings.getBuildingInstance(request.buildingInstanceId)
			if (!building) {
				continue
			}
			if (!byMap.has(building.mapId)) {
				byMap.set(building.mapId, [])
			}
			byMap.get(building.mapId)!.push(request)
		}

		const currentMapIds = new Set(byMap.keys())
		for (const [mapId, mapRequests] of byMap.entries()) {
			this.event.emit(Receiver.Group, WorkProviderEvents.SC.LogisticsUpdated, { requests: mapRequests, itemPriorities }, mapId)
		}
		for (const mapId of this.lastMapIdsWithRequests) {
			if (!currentMapIds.has(mapId)) {
				this.event.emit(Receiver.Group, WorkProviderEvents.SC.LogisticsUpdated, { requests: [], itemPriorities }, mapId)
			}
		}
		if (requests.length === 0) {
			this.event.emit(Receiver.All, WorkProviderEvents.SC.LogisticsUpdated, { requests: [], itemPriorities })
		}
		this.lastMapIdsWithRequests = currentMapIds
	}

	private assignIdleCarriersToLogistics(): void {
		if (!this.logisticsProvider.hasPendingRequests()) {
			return
		}

		const carriers = this.managers.population.getAvailableCarriers(this.logisticsProvider.getMapId(), this.logisticsProvider.getPlayerId())
		for (const carrier of carriers) {
			if (this.assignments.has(carrier.id)) {
				continue
			}
			const assignment: WorkAssignment = {
				assignmentId: uuidv4(),
				settlerId: carrier.id,
				providerId: this.logisticsProvider.id,
				providerType: WorkProviderType.Logistics,
				assignedAt: this.getNowMs(),
				status: WorkAssignmentStatus.Assigned
			}
			this.assignments.set(assignment)
			this.logisticsProvider.assign(carrier.id)
			this.managers.population.setSettlerAssignment(carrier.id, assignment.assignmentId, assignment.providerId, undefined)
			this.managers.population.setSettlerState(carrier.id, SettlerState.Assigned)
			this.dispatchNextStep(carrier.id)
		}
	}
}
