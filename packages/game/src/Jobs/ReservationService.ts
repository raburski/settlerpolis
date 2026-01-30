import type { LootManager } from '../Loot'
import type { StorageManager } from '../Storage'
import type { ResourceNodesManager } from '../ResourceNodes'
import { Logger } from '../Logs'
import { JobReservation, JobReservationType } from './types'
import { BaseManager } from '../Managers'

export interface ReservationDeps {
	loot: LootManager
	resourceNodes: ResourceNodesManager
	storage: StorageManager
}

export class ReservationService extends BaseManager<ReservationDeps> {
	constructor(
		managers: ReservationDeps,
		private logger: Logger
	) {
		super(managers)
	}

	public reserveLoot(itemId: string, ownerId: string): JobReservation | null {
		const reserved = this.managers.loot.reserveItem(itemId, ownerId)
		if (!reserved) {
			return null
		}
		return { type: JobReservationType.Loot, id: itemId, targetId: itemId, ownerId }
	}

	public reserveTool(itemId: string, ownerId: string): JobReservation | null {
		const reserved = this.managers.loot.reserveItem(itemId, ownerId)
		if (!reserved) {
			return null
		}
		return { type: JobReservationType.Tool, id: itemId, targetId: itemId, ownerId }
	}

	public reserveNode(nodeId: string, ownerId: string): JobReservation | null {
		const reserved = this.managers.resourceNodes.reserveNode(nodeId, ownerId)
		if (!reserved) {
			return null
		}
		return { type: JobReservationType.Node, id: nodeId, targetId: nodeId, ownerId }
	}

	public reserveStorage(buildingInstanceId: string, itemType: string, quantity: number, ownerId: string, isOutgoing: boolean): JobReservation | null {
		if (!this.managers.storage) {
			this.logger.warn('[ReservationService] StorageManager not set, cannot reserve storage')
			return null
		}

		const reservationId = this.managers.storage.reserveStorage(buildingInstanceId, itemType, quantity, ownerId, isOutgoing)
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
				return this.managers.loot.isReservationValid(reservation.id, reservation.ownerId)
			case JobReservationType.Node: {
				const node = this.managers.resourceNodes.getNode(reservation.id)
				return !!node && node.reservedBy === reservation.ownerId
			}
			case JobReservationType.Storage:
				return this.managers.storage?.hasReservation(reservation.id) ?? false
			default:
				return false
		}
	}

	public release(reservation: JobReservation): void {
		switch (reservation.type) {
			case JobReservationType.Loot:
			case JobReservationType.Tool:
				this.managers.loot.releaseReservation(reservation.id, reservation.ownerId)
				break
			case JobReservationType.Node:
				this.managers.resourceNodes.releaseReservation(reservation.id, reservation.ownerId)
				break
			case JobReservationType.Storage:
				this.managers.storage?.releaseReservation(reservation.id)
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
