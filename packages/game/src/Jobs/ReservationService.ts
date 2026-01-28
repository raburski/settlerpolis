import { LootManager } from '../Loot'
import { StorageManager } from '../Storage'
import { ResourceNodesManager } from '../ResourceNodes'
import { Logger } from '../Logs'
import { JobReservation, JobReservationType } from '../Population/types'

export class ReservationService {
	private storageManager?: StorageManager

	constructor(
		private lootManager: LootManager,
		private resourceNodesManager: ResourceNodesManager,
		private logger: Logger
	) {}

	public setStorageManager(storageManager: StorageManager): void {
		this.storageManager = storageManager
	}

	public reserveLoot(itemId: string, ownerId: string): JobReservation | null {
		const reserved = this.lootManager.reserveItem(itemId, ownerId)
		if (!reserved) {
			return null
		}
		return { type: JobReservationType.Loot, id: itemId, targetId: itemId, ownerId }
	}

	public reserveTool(itemId: string, ownerId: string): JobReservation | null {
		const reserved = this.lootManager.reserveItem(itemId, ownerId)
		if (!reserved) {
			return null
		}
		return { type: JobReservationType.Tool, id: itemId, targetId: itemId, ownerId }
	}

	public reserveNode(nodeId: string, ownerId: string): JobReservation | null {
		const reserved = this.resourceNodesManager.reserveNode(nodeId, ownerId)
		if (!reserved) {
			return null
		}
		return { type: JobReservationType.Node, id: nodeId, targetId: nodeId, ownerId }
	}

	public reserveStorage(buildingInstanceId: string, itemType: string, quantity: number, ownerId: string, isOutgoing: boolean): JobReservation | null {
		if (!this.storageManager) {
			this.logger.warn('[ReservationService] StorageManager not set, cannot reserve storage')
			return null
		}

		const reservationId = this.storageManager.reserveStorage(buildingInstanceId, itemType, quantity, ownerId, isOutgoing)
		if (!reservationId) {
			return null
		}

		return {
			type: JobReservationType.Storage,
			id: reservationId,
			targetId: buildingInstanceId,
			ownerId,
			metadata: { itemType, quantity, isOutgoing }
		}
	}

	public isValid(reservation: JobReservation): boolean {
		switch (reservation.type) {
			case JobReservationType.Loot:
			case JobReservationType.Tool:
				return this.lootManager.isReservationValid(reservation.id, reservation.ownerId)
			case JobReservationType.Node: {
				const node = this.resourceNodesManager.getNode(reservation.id)
				return !!node && node.reservedBy === reservation.ownerId
			}
			case JobReservationType.Storage:
				return this.storageManager?.hasReservation(reservation.id) ?? false
			default:
				return false
		}
	}

	public release(reservation: JobReservation): void {
		switch (reservation.type) {
			case JobReservationType.Loot:
			case JobReservationType.Tool:
				this.lootManager.releaseReservation(reservation.id, reservation.ownerId)
				break
			case JobReservationType.Node:
				this.resourceNodesManager.releaseReservation(reservation.id, reservation.ownerId)
				break
			case JobReservationType.Storage:
				this.storageManager?.releaseReservation(reservation.id)
				break
		}
	}

	public releaseAll(reservations?: JobReservation[]): void {
		if (!reservations || reservations.length === 0) {
			return
		}

		for (const reservation of reservations) {
			this.release(reservation)
		}
	}
}
