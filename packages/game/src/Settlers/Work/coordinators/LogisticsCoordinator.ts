import { Receiver } from '../../../Receiver'
import { ConstructionStage } from '../../../Buildings/types'
import type { WorkProviderDeps } from '../deps'
import type { EventManager } from '../../../events'
import type { LogisticsProvider } from '../providers/LogisticsProvider'
import type { AssignmentStore } from '../AssignmentStore'
import type { LogisticsRequest, WorkAssignment, WorkStep } from '../types'
import { LogisticsRequestType, WorkAssignmentStatus, WorkProviderType, WorkStepType, TransportSourceType } from '../types'
import { SettlerState } from '../../../Population/types'
import { WorkProviderEvents } from '../events'
import { v4 as uuidv4 } from 'uuid'

const WAREHOUSE_REQUEST_PRIORITY = 5
const CONSUMPTION_REQUEST_PRIORITY = 40
const DIRTY_AUDIT_INTERVAL_MS = 5000

export class LogisticsCoordinator {
	private lastMapIdsWithRequests = new Set<string>()
	private lastBroadcastSignatureByMap = new Map<string, string>()
	private lastGlobalBroadcastSignature: string | null = null
	private dirtyConstructionBuildings = new Set<string>()
	private dirtyConsumptionBuildings = new Set<string>()
	private dirtyWarehouseBuildings = new Set<string>()
	private dirtyMapsForBroadcast = new Set<string>()
	private fullRefreshPending = false
	private lastAuditAtMs = 0

	constructor(
		private managers: WorkProviderDeps,
		private event: EventManager,
		private logisticsProvider: LogisticsProvider,
		private assignments: AssignmentStore,
		private getNowMs: () => number,
		private dispatchNextStep: (settlerId: string) => void
	) {
		this.markAllDirty()
	}

	public handleStepEvent(step: WorkStep): void {
		if ('buildingInstanceId' in step && typeof step.buildingInstanceId === 'string') {
			this.markBuildingDirty(step.buildingInstanceId)
		}

		switch (step.type) {
			case WorkStepType.Transport:
				if (step.source.type === TransportSourceType.Storage) {
					this.markBuildingDirty(step.source.buildingInstanceId)
				}
				this.markBuildingDirty(step.target.buildingInstanceId)
				break
			case WorkStepType.Wait:
			case WorkStepType.AcquireTool:
			case WorkStepType.BuildRoad:
				break
			default:
				break
		}
	}

	tick(): void {
		const now = this.getNowMs()
		if (now - this.lastAuditAtMs >= DIRTY_AUDIT_INTERVAL_MS) {
			this.lastAuditAtMs = now
			this.markAllDirty()
		}

		const refreshed = this.refreshDirtyRequests()
		if (refreshed || this.dirtyMapsForBroadcast.size > 0) {
			this.emitLogisticsRequests()
			this.dirtyMapsForBroadcast.clear()
		}
		this.assignIdleCarriersToLogistics()
	}

	public broadcast(): void {
		this.emitLogisticsRequests(true)
		this.dirtyMapsForBroadcast.clear()
	}

	public markAllDirty(): void {
		this.fullRefreshPending = true
		for (const building of this.managers.buildings.getAllBuildings()) {
			this.dirtyMapsForBroadcast.add(building.mapId)
		}
		for (const mapId of this.lastMapIdsWithRequests) {
			this.dirtyMapsForBroadcast.add(mapId)
		}
	}

	public markMapDirty(mapId?: string): void {
		if (!mapId) {
			return
		}
		this.dirtyMapsForBroadcast.add(mapId)
	}

	public markBuildingDirty(
		buildingInstanceId?: string,
		options: { construction?: boolean, consumption?: boolean, warehouse?: boolean } = {
			construction: true,
			consumption: true,
			warehouse: true
		}
	): void {
		if (!buildingInstanceId) {
			return
		}
		if (options.construction) {
			this.dirtyConstructionBuildings.add(buildingInstanceId)
		}
		if (options.consumption) {
			this.dirtyConsumptionBuildings.add(buildingInstanceId)
		}
		if (options.warehouse) {
			this.dirtyWarehouseBuildings.add(buildingInstanceId)
		}
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (building) {
			this.dirtyMapsForBroadcast.add(building.mapId)
		}
	}

	private refreshDirtyRequests(): boolean {
		if (this.fullRefreshPending) {
			this.fullRefreshPending = false
			const allBuildings = this.managers.buildings.getAllBuildings()
			for (const building of allBuildings) {
				this.refreshConsumptionRequestsForBuilding(building.id)
				this.refreshWarehouseRequestsForBuilding(building.id)
			}
			this.logisticsProvider.refreshConstructionRequests()
			this.dirtyConstructionBuildings.clear()
			this.dirtyConsumptionBuildings.clear()
			this.dirtyWarehouseBuildings.clear()
			return true
		}

		let refreshed = false
		if (this.dirtyConstructionBuildings.size > 0) {
			refreshed = true
			this.logisticsProvider.refreshConstructionRequests()
			this.dirtyConstructionBuildings.clear()
		}
		if (this.dirtyConsumptionBuildings.size > 0) {
			refreshed = true
			for (const buildingId of this.dirtyConsumptionBuildings) {
				this.refreshConsumptionRequestsForBuilding(buildingId)
			}
			this.dirtyConsumptionBuildings.clear()
		}
		if (this.dirtyWarehouseBuildings.size > 0) {
			refreshed = true
			for (const buildingId of this.dirtyWarehouseBuildings) {
				this.refreshWarehouseRequestsForBuilding(buildingId)
			}
			this.dirtyWarehouseBuildings.clear()
		}
		return refreshed
	}

	private refreshConsumptionRequestsForBuilding(buildingInstanceId: string): void {
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building || building.stage !== ConstructionStage.Completed) {
			this.logisticsProvider.clearRequestsForBuilding(buildingInstanceId, {
				type: LogisticsRequestType.Input,
				priority: CONSUMPTION_REQUEST_PRIORITY
			})
			return
		}

		const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
		if (!definition?.consumes || definition.consumes.length === 0) {
			this.logisticsProvider.clearRequestsForBuilding(buildingInstanceId, {
				type: LogisticsRequestType.Input,
				priority: CONSUMPTION_REQUEST_PRIORITY
			})
			this.dirtyMapsForBroadcast.add(building.mapId)
			return
		}

		const desiredByItem = new Map<string, number>()
		for (const request of definition.consumes) {
			const capacity = this.managers.storage.getStorageCapacity(building.id, request.itemType, 'incoming')
			if (capacity <= 0) {
				desiredByItem.set(request.itemType, 0)
				continue
			}
			const desired = Math.min(request.desiredQuantity, capacity)
			const current = this.managers.storage.getCurrentQuantity(building.id, request.itemType, 'incoming')
			desiredByItem.set(request.itemType, desired - current)
		}

		const existing = this.logisticsProvider
			.getRequestsForBuilding(building.id, LogisticsRequestType.Input)
			.filter(request => request.priority === CONSUMPTION_REQUEST_PRIORITY)

		for (const request of existing) {
			if (desiredByItem.has(request.itemType)) {
				continue
			}
			this.logisticsProvider.requestInput(building.id, request.itemType, 0, CONSUMPTION_REQUEST_PRIORITY)
		}

		for (const [itemType, needed] of desiredByItem.entries()) {
			this.logisticsProvider.requestInput(building.id, itemType, needed, CONSUMPTION_REQUEST_PRIORITY)
		}
		this.dirtyMapsForBroadcast.add(building.mapId)
	}

	private refreshWarehouseRequestsForBuilding(buildingInstanceId: string): void {
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building || building.stage !== ConstructionStage.Completed) {
			this.logisticsProvider.clearRequestsForBuilding(buildingInstanceId, {
				type: LogisticsRequestType.Input,
				priority: WAREHOUSE_REQUEST_PRIORITY
			})
			return
		}

		const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
		if (!definition?.isWarehouse) {
			this.logisticsProvider.clearRequestsForBuilding(buildingInstanceId, {
				type: LogisticsRequestType.Input,
				priority: WAREHOUSE_REQUEST_PRIORITY
			})
			this.dirtyMapsForBroadcast.add(building.mapId)
			return
		}

		const candidates = this.managers.buildings.getStorageRequestCandidates(building.id)
		if (candidates.length === 0) {
			this.logisticsProvider.clearRequestsForBuilding(building.id, {
				type: LogisticsRequestType.Input,
				priority: WAREHOUSE_REQUEST_PRIORITY
			})
			this.dirtyMapsForBroadcast.add(building.mapId)
			return
		}

		const requested = new Set(this.managers.buildings.getStorageRequestItems(building.id))
		const desiredByItem = new Map<string, number>()
		for (const itemType of candidates) {
			if (this.managers.buildings.hasConstructionNeedForItem(building.mapId, building.playerId, itemType)) {
				desiredByItem.set(itemType, 0)
				continue
			}
			if (!requested.has(itemType)) {
				desiredByItem.set(itemType, 0)
				continue
			}
			const capacity = this.managers.storage.getStorageCapacity(building.id, itemType, 'incoming')
			if (capacity <= 0) {
				desiredByItem.set(itemType, 0)
				continue
			}
			const current = this.managers.storage.getCurrentQuantity(building.id, itemType, 'incoming')
			desiredByItem.set(itemType, Math.max(0, capacity - current))
		}

		const existing = this.logisticsProvider
			.getRequestsForBuilding(building.id, LogisticsRequestType.Input)
			.filter(request => request.priority === WAREHOUSE_REQUEST_PRIORITY)

		for (const request of existing) {
			if (desiredByItem.has(request.itemType)) {
				continue
			}
			this.logisticsProvider.requestInput(building.id, request.itemType, 0, WAREHOUSE_REQUEST_PRIORITY)
		}

		for (const [itemType, needed] of desiredByItem.entries()) {
			this.logisticsProvider.requestInput(building.id, itemType, needed, WAREHOUSE_REQUEST_PRIORITY)
		}
		this.dirtyMapsForBroadcast.add(building.mapId)
	}

	private emitLogisticsRequests(force = false): void {
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
		const emptySignature = this.buildRequestsSignature([], itemPriorities)

		for (const [mapId, mapRequests] of byMap.entries()) {
			const sortedRequests = [...mapRequests].sort((a, b) => this.compareRequests(a, b))
			const signature = this.buildRequestsSignature(sortedRequests, itemPriorities)
			const previous = this.lastBroadcastSignatureByMap.get(mapId)
			if (!force && previous === signature && !this.dirtyMapsForBroadcast.has(mapId)) {
				continue
			}
			this.event.emit(Receiver.Group, WorkProviderEvents.SC.LogisticsUpdated, { requests: sortedRequests, itemPriorities }, mapId)
			this.lastBroadcastSignatureByMap.set(mapId, signature)
		}

		const emptyMapCandidates = new Set<string>([
			...this.lastMapIdsWithRequests,
			...this.dirtyMapsForBroadcast
		])
		for (const mapId of emptyMapCandidates) {
			if (currentMapIds.has(mapId)) {
				continue
			}
			const previous = this.lastBroadcastSignatureByMap.get(mapId)
			if (!force && previous === emptySignature && !this.dirtyMapsForBroadcast.has(mapId)) {
				continue
			}
			this.event.emit(Receiver.Group, WorkProviderEvents.SC.LogisticsUpdated, { requests: [], itemPriorities }, mapId)
			this.lastBroadcastSignatureByMap.set(mapId, emptySignature)
		}

		if (requests.length === 0) {
			const globalSignature = `global:${emptySignature}`
			if (force || this.lastGlobalBroadcastSignature !== globalSignature) {
				this.event.emit(Receiver.All, WorkProviderEvents.SC.LogisticsUpdated, { requests: [], itemPriorities })
				this.lastGlobalBroadcastSignature = globalSignature
			}
		} else {
			this.lastGlobalBroadcastSignature = null
		}
		this.lastMapIdsWithRequests = currentMapIds
	}

	private buildRequestsSignature(requests: LogisticsRequest[], itemPriorities: string[]): string {
		const requestSignature = requests
			.map((request) => (
				`${request.type}:${request.buildingInstanceId}:${request.itemType}:${request.quantity}:${request.priority}`
			))
			.join('|')
		return `${itemPriorities.join(',')}#${requestSignature}`
	}

	private compareRequests(a: LogisticsRequest, b: LogisticsRequest): number {
		if (a.type !== b.type) {
			return a.type.localeCompare(b.type)
		}
		if (a.buildingInstanceId !== b.buildingInstanceId) {
			return a.buildingInstanceId.localeCompare(b.buildingInstanceId)
		}
		if (a.itemType !== b.itemType) {
			return a.itemType.localeCompare(b.itemType)
		}
		if (a.priority !== b.priority) {
			return b.priority - a.priority
		}
		if (a.quantity !== b.quantity) {
			return b.quantity - a.quantity
		}
		return a.createdAtMs - b.createdAtMs
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
