import type { StorageManager } from '../Storage'
import type { LootManager } from '../Loot'
import type { ResourceNodesManager } from '../ResourceNodes'
import type { Position } from '../types'
import type { ItemType } from '../Items/types'
import type { ProfessionType } from '../Population/types'
import type { PopulationManager } from '../Population'
import { BaseManager } from '../Managers'

export interface ReservationSystemDeps {
	storage: StorageManager
	loot: LootManager
	resourceNodes: ResourceNodesManager
	population: PopulationManager
}

export class ReservationSystem extends BaseManager<ReservationSystemDeps> {
	constructor(managers: ReservationSystemDeps) {
		super(managers)
	}

	public reserveToolForProfession(mapName: string, profession: ProfessionType, ownerId: string): { itemId: string, position: Position } | null {
		const toolItemType = this.managers.population.getToolItemType(profession)
		if (!toolItemType) {
			return null
		}

		const tool = this.managers.population.findAvailableToolOnMap(mapName, toolItemType)
		if (!tool) {
			return null
		}

		if (!this.managers.loot.reserveItem(tool.id, ownerId)) {
			return null
		}

		return { itemId: tool.id, position: tool.position }
	}

	public releaseToolReservation(itemId: string): void {
		this.managers.loot.releaseReservation(itemId)
	}

	public reserveLootItem(itemId: string, ownerId: string): boolean {
		return this.managers.loot.reserveItem(itemId, ownerId)
	}

	public releaseLootReservation(itemId: string, ownerId?: string): void {
		this.managers.loot.releaseReservation(itemId, ownerId)
	}

	public reserveNode(nodeId: string, ownerId: string): boolean {
		return this.managers.resourceNodes.reserveNode(nodeId, ownerId)
	}

	public releaseNode(nodeId: string, ownerId?: string): void {
		this.managers.resourceNodes.releaseReservation(nodeId, ownerId)
	}

	public reserveStorageIncoming(buildingInstanceId: string, itemType: ItemType, quantity: number, ownerId: string): string | null {
		return this.managers.storage.reserveStorage(buildingInstanceId, itemType, quantity, ownerId, false)
	}

	public reserveStorageOutgoing(buildingInstanceId: string, itemType: ItemType, quantity: number, ownerId: string): string | null {
		return this.managers.storage.reserveStorage(buildingInstanceId, itemType, quantity, ownerId, true)
	}

	public releaseStorageReservation(reservationId: string): void {
		this.managers.storage.releaseReservation(reservationId)
	}
}
