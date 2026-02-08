import type { WorkProvider, WorkStep, LogisticsRequest, TransportSource, TransportTarget } from '../types'
import { TransportSourceType, TransportTargetType, WorkProviderType, WorkStepType, WorkWaitReason, LogisticsRequestType } from '../types'
import type { WorkProviderDeps } from '..'
import type { Logger } from '../../../Logs'
import { calculateDistance } from '../../../utils'
import type { LogisticsSnapshot } from '../../../state/types'
import type { ItemType } from '../../../Items/types'
import { getProductionRecipes } from '../../../Buildings/work'

const CONSTRUCTION_REQUEST_PRIORITY_BASE = 200

export class LogisticsProvider implements WorkProvider {
	public readonly id = 'logistics'
	public readonly type = WorkProviderType.Logistics
	private assigned = new Set<string>()
	private requests: LogisticsRequest[] = []
	private inFlightConstruction = new Map<string, Map<string, number>>() // buildingInstanceId -> itemType -> quantity
	private itemPriorities: ItemType[] = []
	private itemPriorityIndex = new Map<ItemType, number>()

	constructor(
		private managers: WorkProviderDeps,
		private logger: Logger,
		private getNowMs: () => number
	) {}

	assign(settlerId: string): void {
		this.assigned.add(settlerId)
	}

	unassign(settlerId: string): void {
		this.assigned.delete(settlerId)
	}

	pause(settlerId: string): void {
		// no-op
	}

	resume(settlerId: string): void {
		// no-op
	}

	public hasPendingRequests(): boolean {
		return this.requests.length > 0
	}

	public getRequests(): LogisticsRequest[] {
		return [...this.requests]
	}

	public getItemPriorities(): ItemType[] {
		this.syncItemPriorities()
		return [...this.itemPriorities]
	}

	public setItemPriorities(itemPriorities: ItemType[] = []): void {
		const seen = new Set<ItemType>()
		this.itemPriorities = itemPriorities.filter((itemType) => {
			if (!itemType || seen.has(itemType)) {
				return false
			}
			seen.add(itemType)
			return true
		})
		this.syncItemPriorities()
		this.rebuildItemPriorityIndex()
	}

	public getMapId(): string {
		this.pruneInvalidRequests()
		const first = this.requests[0]
		if (!first) {
			return 'GLOBAL'
		}
		const building = this.managers.buildings.getBuildingInstance(first.buildingInstanceId)
		return building?.mapId || 'GLOBAL'
	}

	public getPlayerId(): string {
		this.pruneInvalidRequests()
		const first = this.requests[0]
		if (!first) {
			return 'GLOBAL'
		}
		const building = this.managers.buildings.getBuildingInstance(first.buildingInstanceId)
		return building?.playerId || 'GLOBAL'
	}

	public enqueue(request: LogisticsRequest): void {
		const index = this.requests.findIndex(r => r.type === request.type && r.buildingInstanceId === request.buildingInstanceId && r.itemType === request.itemType)
		if (request.quantity <= 0) {
			if (index >= 0) {
				this.requests.splice(index, 1)
			}
			return
		}
		if (index >= 0) {
			const existing = this.requests[index]
			existing.quantity = request.quantity
			existing.priority = Math.max(existing.priority, request.priority)
			return
		}
		this.requests.push(request)
	}

	private buildRequest(type: LogisticsRequestType, buildingInstanceId: string, itemType: ItemType, quantity: number, priority: number): LogisticsRequest {
		const now = this.getNowMs()
		return {
			id: `${now}-${Math.random().toString(36).slice(2)}`,
			type,
			buildingInstanceId,
			itemType,
			quantity,
			priority,
			createdAtMs: now
		}
	}

	public requestInput(buildingInstanceId: string, itemType: ItemType, quantity: number, priority: number): void {
		this.enqueue(this.buildRequest(LogisticsRequestType.Input, buildingInstanceId, itemType, quantity, priority))
	}

	public requestOutput(buildingInstanceId: string, itemType: ItemType, quantity: number, priority: number): void {
		this.enqueue(this.buildRequest(LogisticsRequestType.Output, buildingInstanceId, itemType, quantity, priority))
	}

	public requestConstructionInput(buildingInstanceId: string, itemType: ItemType, quantity: number, priority: number): void {
		this.enqueue(this.buildRequest(LogisticsRequestType.Construction, buildingInstanceId, itemType, quantity, priority))
	}

	public refreshConstructionRequests(): void {
		const buildingIds = this.managers.buildings.getBuildingsNeedingResources()
		for (const buildingId of buildingIds) {
			const building = this.managers.buildings.getBuildingInstance(buildingId)
			if (!building) {
				continue
			}
			const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
			const buildingPriority = definition?.priority ?? 1
			const priority = CONSTRUCTION_REQUEST_PRIORITY_BASE + buildingPriority
			const needs = this.managers.buildings.getNeededResources(buildingId)
			for (const need of needs) {
				const inFlight = this.getInFlightConstruction(buildingId, need.itemType)
				const remaining = Math.max(0, need.remaining - inFlight)
				if (remaining <= 0) {
					this.removeRequest(LogisticsRequestType.Construction, buildingId, need.itemType)
					continue
				}
				this.requestConstructionInput(buildingId, need.itemType, remaining, priority)
			}
		}
	}

	requestNextStep(settlerId: string): WorkStep | null {
		this.pruneInvalidRequests()
		if (this.requests.length === 0) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoRequests }
		}

		const sorted = [...this.requests].sort((a, b) => {
			if (b.priority !== a.priority) {
				return b.priority - a.priority
			}
			const aIndex = this.getItemPriorityIndex(a.itemType)
			const bIndex = this.getItemPriorityIndex(b.itemType)
			if (aIndex !== bIndex) {
				return aIndex - bIndex
			}
			if (a.itemType !== b.itemType) {
				return a.itemType.localeCompare(b.itemType)
			}
			return a.createdAtMs - b.createdAtMs
		})

		for (const request of sorted) {
			const step = this.buildStepForRequest(request, settlerId)
			if (step) {
				if (request.type === LogisticsRequestType.Construction && step.type === WorkStepType.Transport) {
					const remaining = Math.max(0, request.quantity - step.quantity)
					if (remaining > 0) {
						request.quantity = remaining
					} else {
						this.requests = this.requests.filter(r => r.id !== request.id)
					}
				} else {
					this.requests = this.requests.filter(r => r.id !== request.id)
				}
				return step
			}
		}

		return { type: WorkStepType.Wait, reason: WorkWaitReason.NoViableRequest }
	}

	private buildStepForRequest(request: LogisticsRequest, settlerId: string): WorkStep | null {
		const building = this.managers.buildings.getBuildingInstance(request.buildingInstanceId)
		if (!building) {
			return null
		}
		const carryCapacity = this.managers.population.getSettlerCarryCapacity(settlerId)
		const maxStackSize = this.managers.items.getItemMetadata(request.itemType)?.maxStackSize || request.quantity

		if (request.type === LogisticsRequestType.Input || request.type === LogisticsRequestType.Construction) {
			const sourceResult = this.findSourceForItem(
				building.mapId,
				building.playerId,
				request.itemType,
				request.quantity,
				building.position,
				building.id
			)
			if (!sourceResult) {
				return null
			}
			const { source, quantity } = sourceResult
			const targetCapacity = request.type === LogisticsRequestType.Input
				? this.getAvailableStorageCapacity(building.id, request.itemType)
				: request.quantity
			const transferQuantity = Math.min(request.quantity, quantity, maxStackSize, targetCapacity, carryCapacity)
			if (transferQuantity <= 0) {
				return null
			}

			const target: TransportTarget = request.type === LogisticsRequestType.Construction
				? { type: TransportTargetType.Construction, buildingInstanceId: building.id }
				: { type: TransportTargetType.Storage, buildingInstanceId: building.id }

			if (request.type === LogisticsRequestType.Construction) {
				this.addInFlightConstruction(building.id, request.itemType, transferQuantity)
			}

			return {
				type: WorkStepType.Transport,
				source,
				target,
				itemType: request.itemType,
				quantity: transferQuantity
			}
		}

		if (request.type === LogisticsRequestType.Output) {
			const targetBuildingId = this.findClosestTargetBuilding(building.id, request.itemType, request.quantity, building.mapId, building.playerId, building.position)
			if (!targetBuildingId) {
				return null
			}

			const targetCapacity = this.getAvailableStorageCapacity(targetBuildingId, request.itemType)
			if (targetCapacity <= 0) {
				return null
			}

			const source: TransportSource = { type: TransportSourceType.Storage, buildingInstanceId: building.id }
			const target: TransportTarget = { type: TransportTargetType.Storage, buildingInstanceId: targetBuildingId }
			return {
				type: WorkStepType.Transport,
				source,
				target,
				itemType: request.itemType,
				quantity: Math.min(
					request.quantity,
					maxStackSize,
					targetCapacity,
					carryCapacity
				)
			}
		}

		return null
	}

	public releaseConstructionInFlight(buildingInstanceId: string, itemType: string, quantity: number): void {
		this.removeInFlightConstruction(buildingInstanceId, itemType, quantity)
	}

	private getInFlightConstruction(buildingInstanceId: string, itemType: string): number {
		const byItem = this.inFlightConstruction.get(buildingInstanceId)
		if (!byItem) {
			return 0
		}
		return byItem.get(itemType) || 0
	}

	private addInFlightConstruction(buildingInstanceId: string, itemType: ItemType, quantity: number): void {
		if (!this.inFlightConstruction.has(buildingInstanceId)) {
			this.inFlightConstruction.set(buildingInstanceId, new Map())
		}
		const byItem = this.inFlightConstruction.get(buildingInstanceId)!
		const current = byItem.get(itemType) || 0
		byItem.set(itemType, current + quantity)
	}

	private removeInFlightConstruction(buildingInstanceId: string, itemType: ItemType, quantity: number): void {
		const byItem = this.inFlightConstruction.get(buildingInstanceId)
		if (!byItem) {
			return
		}
		const current = byItem.get(itemType) || 0
		const next = Math.max(0, current - quantity)
		if (next === 0) {
			byItem.delete(itemType)
			if (byItem.size === 0) {
				this.inFlightConstruction.delete(buildingInstanceId)
			}
			return
		}
		byItem.set(itemType, next)
	}

	private removeRequest(type: LogisticsRequestType, buildingInstanceId: string, itemType: ItemType): void {
		this.requests = this.requests.filter(r => !(r.type === type && r.buildingInstanceId === buildingInstanceId && r.itemType === itemType))
	}

	private findSourceForItem(
		mapId: string,
		playerId: string,
		itemType: ItemType,
		quantity: number,
		position: { x: number, y: number },
		excludeBuildingId?: string
	): { source: TransportSource, quantity: number } | null {
		const sourceBuildings = this.managers.storage
			.getBuildingsWithAvailableItems(itemType, 1, mapId, playerId)
			.filter(buildingId => buildingId !== excludeBuildingId)
		if (sourceBuildings.length > 0) {
			const buildingId = this.findClosestBuilding(sourceBuildings, position)
			if (buildingId) {
				const available = this.managers.storage.getAvailableQuantity(buildingId, itemType)
				if (available > 0) {
					return {
						source: { type: TransportSourceType.Storage, buildingInstanceId: buildingId },
						quantity: Math.min(quantity, available)
					}
				}
			}
		}

		const mapItems = this.managers.loot.getMapItems(mapId)
		const itemsOfType = mapItems.filter(item => item.itemType === itemType && this.managers.loot.isItemAvailable(item.id))
		if (itemsOfType.length === 0) {
			return null
		}

		const closestItem = this.findClosestItem(itemsOfType, position)
		if (!closestItem) {
			return null
		}

		return {
			source: { type: TransportSourceType.Ground, itemId: closestItem.id, position: closestItem.position },
			quantity: 1
		}
	}

	private findClosestBuilding(buildingIds: string[], position: { x: number, y: number }): string | null {
		let closest = buildingIds[0]
		let closestDistance = calculateDistance(position, this.managers.buildings.getBuildingInstance(closest)!.position)
		for (let i = 1; i < buildingIds.length; i++) {
			const building = this.managers.buildings.getBuildingInstance(buildingIds[i])
			if (!building) {
				continue
			}
			const distance = calculateDistance(position, building.position)
			if (distance < closestDistance) {
				closest = buildingIds[i]
				closestDistance = distance
			}
		}
		return closest
	}

	private findClosestItem(items: Array<{ id: string, position: { x: number, y: number } }>, position: { x: number, y: number }) {
		let closest = items[0]
		let closestDistance = calculateDistance(position, items[0].position)
		for (let i = 1; i < items.length; i++) {
			const distance = calculateDistance(position, items[i].position)
			if (distance < closestDistance) {
				closest = items[i]
				closestDistance = distance
			}
		}
		return closest
	}

	private findClosestTargetBuilding(sourceBuildingInstanceId: string, itemType: string, quantity: number, mapId: string, playerId: string, position: { x: number, y: number }): string | null {
		const targets = this.findTargetBuildings(itemType, quantity, mapId, playerId).filter(id => id !== sourceBuildingInstanceId)
		if (targets.length === 0) {
			return null
		}

		let closest = targets[0]
		let closestDistance = calculateDistance(position, this.managers.buildings.getBuildingInstance(closest)!.position)
		for (let i = 1; i < targets.length; i++) {
			const building = this.managers.buildings.getBuildingInstance(targets[i])
			if (!building) {
				continue
			}
			const distance = calculateDistance(position, building.position)
			if (distance < closestDistance) {
				closest = targets[i]
				closestDistance = distance
			}
		}
		return closest
	}

	private findTargetBuildings(itemType: string, quantity: number, mapId: string, playerId: string): string[] {
		const demandTargets: string[] = []
		const warehouseTargets: string[] = []
		const allBuildings = this.managers.buildings.getBuildingsForMap(mapId)
			.filter(building => building.playerId === playerId)

		for (const building of allBuildings) {
			const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
			if (!definition) {
				continue
			}

			const current = this.managers.storage.getCurrentQuantity(building.id, itemType, 'incoming')
			const capacity = this.managers.storage.getStorageCapacity(building.id, itemType, 'incoming')
			const available = Math.max(0, capacity - current)
			if (available <= 0) {
				continue
			}

			const productionRecipes = getProductionRecipes(definition)
			if (productionRecipes.length > 0) {
				const plan = this.managers.buildings.getEffectiveProductionPlan(building.id) || {}
				const matchingInputs = productionRecipes.flatMap(recipe => {
					const weight = plan[recipe.id] ?? 1
					if (weight <= 0) {
						return []
					}
					return recipe.inputs.filter(input => input.itemType === itemType)
				})
				if (matchingInputs.length > 0) {
					const maxRequired = Math.max(...matchingInputs.map(input => input.quantity))
					const desired = capacity > 0 ? capacity : maxRequired
					const needed = desired - current
					if (needed > 0) {
						const requestQuantity = Math.min(quantity, needed)
						if (this.managers.storage.hasAvailableStorage(building.id, itemType, requestQuantity)) {
							demandTargets.push(building.id)
						}
					}
					continue
				}
			}

			const consumeEntry = definition.consumes?.find(entry => entry.itemType === itemType)
			if (consumeEntry) {
				const desired = Math.min(consumeEntry.desiredQuantity, capacity)
				const needed = desired - current
				if (needed > 0) {
					const requestQuantity = Math.min(quantity, needed)
					if (this.managers.storage.hasAvailableStorage(building.id, itemType, requestQuantity)) {
						demandTargets.push(building.id)
					}
				}
				continue
			}

			if (
				definition.isWarehouse &&
				this.managers.buildings.isStorageRequestEnabled(building.id, itemType) &&
				this.managers.storage.hasAvailableStorage(building.id, itemType, Math.min(quantity, available))
			) {
				warehouseTargets.push(building.id)
			}
		}

		return demandTargets.length > 0 ? demandTargets : warehouseTargets
	}

	serialize(): LogisticsSnapshot {
		const inFlightConstruction: Array<[string, Array<[string, number]>]> = []
		for (const [buildingInstanceId, items] of this.inFlightConstruction.entries()) {
			inFlightConstruction.push([buildingInstanceId, Array.from(items.entries())])
		}

		return {
			requests: [...this.requests],
			inFlightConstruction,
			itemPriorities: this.getItemPriorities()
		}
	}

	deserialize(state: LogisticsSnapshot): void {
		this.assigned.clear()
		this.requests = state.requests.map(request => ({ ...request }))
		this.itemPriorities = [...(state.itemPriorities || [])]
		this.rebuildItemPriorityIndex()
		this.syncItemPriorities()
		this.inFlightConstruction.clear()
		for (const [buildingInstanceId, items] of state.inFlightConstruction) {
			this.inFlightConstruction.set(buildingInstanceId, new Map(items))
		}
	}

	reset(): void {
		this.assigned.clear()
		this.requests = []
		this.inFlightConstruction.clear()
		this.itemPriorities = []
		this.itemPriorityIndex.clear()
	}

	private rebuildItemPriorityIndex(): void {
		this.itemPriorityIndex.clear()
		this.itemPriorities.forEach((itemType, index) => {
			this.itemPriorityIndex.set(itemType, index)
		})
	}

	private syncItemPriorities(): void {
		const items = this.managers.items.getItems()
		if (items.length === 0) {
			return
		}
		if (this.itemPriorities.length === 0) {
			this.itemPriorities = items.map(item => item.id)
			this.rebuildItemPriorityIndex()
			return
		}
		const known = new Set(this.itemPriorities)
		const missing = items.map(item => item.id).filter(id => !known.has(id))
		if (missing.length > 0) {
			this.itemPriorities = [...this.itemPriorities, ...missing]
			this.rebuildItemPriorityIndex()
		}
	}

	private getItemPriorityIndex(itemType: ItemType): number {
		this.syncItemPriorities()
		const index = this.itemPriorityIndex.get(itemType)
		if (index === undefined) {
			return this.itemPriorities.length
		}
		return index
	}

	private getAvailableStorageCapacity(buildingInstanceId: string, itemType: ItemType): number {
		const capacity = this.managers.storage.getStorageCapacity(buildingInstanceId, itemType, 'incoming')
		const current = this.managers.storage.getCurrentQuantity(buildingInstanceId, itemType, 'incoming')
		return Math.max(0, capacity - current)
	}

	private pruneInvalidRequests(): void {
		if (this.requests.length === 0) {
			return
		}
		this.requests = this.requests.filter((request) => (
			Boolean(this.managers.buildings.getBuildingInstance(request.buildingInstanceId))
		))
	}
}
