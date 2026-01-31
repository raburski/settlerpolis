import type { WorkProvider, WorkStep, LogisticsRequest, TransportSource, TransportTarget } from '../types'
import { TransportSourceType, TransportTargetType, WorkStepType, WorkWaitReason } from '../types'
import type { WorkProviderDeps } from '..'
import type { Logger } from '../../../Logs'
import { calculateDistance } from '../../../utils'

export class LogisticsProvider implements WorkProvider {
	public readonly id = 'logistics'
	public readonly type = 'logistics' as const
	private assigned = new Set<string>()
	private requests: LogisticsRequest[] = []
	private inFlightConstruction = new Map<string, Map<string, number>>() // buildingInstanceId -> itemType -> quantity

	constructor(
		private managers: WorkProviderDeps,
		private logger: Logger
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

	public getMapName(): string {
		const first = this.requests[0]
		if (!first) {
			return 'GLOBAL'
		}
		const building = this.managers.buildings.getBuildingInstance(first.buildingInstanceId)
		return building?.mapName || 'GLOBAL'
	}

	public getPlayerId(): string {
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

	public requestInput(buildingInstanceId: string, itemType: string, quantity: number, priority: number): void {
		this.enqueue({
			id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
			type: 'input',
			buildingInstanceId,
			itemType,
			quantity,
			priority,
			createdAtMs: Date.now()
		})
	}

	public requestOutput(buildingInstanceId: string, itemType: string, quantity: number, priority: number): void {
		this.enqueue({
			id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
			type: 'output',
			buildingInstanceId,
			itemType,
			quantity,
			priority,
			createdAtMs: Date.now()
		})
	}

	public requestConstructionInput(buildingInstanceId: string, itemType: string, quantity: number, priority: number): void {
		this.enqueue({
			id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
			type: 'construction',
			buildingInstanceId,
			itemType,
			quantity,
			priority,
			createdAtMs: Date.now()
		})
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
			const priority = 100 + buildingPriority
			const needs = this.managers.buildings.getNeededResources(buildingId)
			for (const need of needs) {
				const inFlight = this.getInFlightConstruction(buildingId, need.itemType)
				const remaining = Math.max(0, need.remaining - inFlight)
				if (remaining <= 0) {
					this.removeRequest('construction', buildingId, need.itemType)
					continue
				}
				this.requestConstructionInput(buildingId, need.itemType, remaining, priority)
			}
		}
	}

	requestNextStep(settlerId: string): WorkStep | null {
		if (this.requests.length === 0) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoRequests }
		}

		const sorted = [...this.requests].sort((a, b) => {
			if (b.priority !== a.priority) {
				return b.priority - a.priority
			}
			return a.createdAtMs - b.createdAtMs
		})

		for (const request of sorted) {
			const step = this.buildStepForRequest(request, settlerId)
			if (step) {
				this.requests = this.requests.filter(r => r.id !== request.id)
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
		const maxStackSize = this.managers.items.getItemMetadata(request.itemType)?.maxStackSize || request.quantity

		if (request.type === 'input' || request.type === 'construction') {
			const sourceResult = this.findSourceForItem(
				building.mapName,
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
			const transferQuantity = Math.min(request.quantity, quantity, maxStackSize)

			const target: TransportTarget = request.type === 'construction'
				? { type: TransportTargetType.Construction, buildingInstanceId: building.id }
				: { type: TransportTargetType.Storage, buildingInstanceId: building.id }

			if (request.type === 'construction') {
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

		if (request.type === 'output') {
			const targetBuildingId = this.findClosestTargetBuilding(building.id, request.itemType, request.quantity, building.mapName, building.playerId, building.position)
			if (!targetBuildingId) {
				return null
			}

			const source: TransportSource = { type: TransportSourceType.Storage, buildingInstanceId: building.id }
			const target: TransportTarget = { type: TransportTargetType.Storage, buildingInstanceId: targetBuildingId }
			return {
				type: WorkStepType.Transport,
				source,
				target,
				itemType: request.itemType,
				quantity: Math.min(request.quantity, maxStackSize)
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

	private addInFlightConstruction(buildingInstanceId: string, itemType: string, quantity: number): void {
		if (!this.inFlightConstruction.has(buildingInstanceId)) {
			this.inFlightConstruction.set(buildingInstanceId, new Map())
		}
		const byItem = this.inFlightConstruction.get(buildingInstanceId)!
		const current = byItem.get(itemType) || 0
		byItem.set(itemType, current + quantity)
	}

	private removeInFlightConstruction(buildingInstanceId: string, itemType: string, quantity: number): void {
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

	private removeRequest(type: LogisticsRequest['type'], buildingInstanceId: string, itemType: string): void {
		this.requests = this.requests.filter(r => !(r.type === type && r.buildingInstanceId === buildingInstanceId && r.itemType === itemType))
	}

	private findSourceForItem(
		mapName: string,
		playerId: string,
		itemType: string,
		quantity: number,
		position: { x: number, y: number },
		excludeBuildingId?: string
	): { source: TransportSource, quantity: number } | null {
		const sourceBuildings = this.managers.storage
			.getBuildingsWithAvailableItems(itemType, 1, mapName, playerId)
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

		const mapItems = this.managers.loot.getMapItems(mapName)
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

	private findClosestTargetBuilding(sourceBuildingInstanceId: string, itemType: string, quantity: number, mapName: string, playerId: string, position: { x: number, y: number }): string | null {
		const targets = this.findTargetBuildings(itemType, quantity, mapName, playerId).filter(id => id !== sourceBuildingInstanceId)
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

	private findTargetBuildings(itemType: string, quantity: number, mapName: string, playerId: string): string[] {
		const buildings: string[] = []
		const allBuildings = this.managers.buildings.getBuildingsForMap(mapName)
			.filter(building => building.playerId === playerId)

		for (const building of allBuildings) {
			const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
			if (!definition || !definition.productionRecipe) {
				continue
			}

			const requiredInput = definition.productionRecipe.inputs.find(input => input.itemType === itemType)
			if (!requiredInput) {
				continue
			}

			const current = this.managers.storage.getCurrentQuantity(building.id, itemType)
			const capacity = this.managers.storage.getStorageCapacity(building.id, itemType)
			const desired = capacity > 0 ? capacity : requiredInput.quantity
			const needed = desired - current
			if (needed <= 0) {
				continue
			}

			const requestQuantity = Math.min(quantity, needed)
			if (!this.managers.storage.hasAvailableStorage(building.id, itemType, requestQuantity)) {
				continue
			}

			buildings.push(building.id)
		}

		return buildings
	}
}
