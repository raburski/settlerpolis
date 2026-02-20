import { BaseManager } from '../Managers'
import type { ReservationSnapshot } from '../state/types'
import { ReservationSystemState } from './ReservationSystemState'
import type { ReservationHandlerContext } from './handlerContext'
import type { ReservationSystemDeps } from './deps'
import {
	reserveAmenityReservation,
	releaseAmenityReservation
} from './handler/amenity'
import {
	reserveHouseReservation,
	releaseHouseReservation,
	commitHouseReservation,
	canReserveHouseSlot
} from './handler/house'
import { reserveLootReservation, releaseLootReservation } from './handler/loot'
import { reserveNodeReservation, releaseNodeReservation } from './handler/node'
import { reserveNpcReservation, releaseNpcReservation } from './handler/npc'
import { reserveStorageReservation, releaseStorageReservation } from './handler/storage'
import { reserveToolReservation, releaseToolReservation } from './handler/tool'
import {
	ReservationKind,
	type ReservationAcquireResult,
	type ReservationCommitHandler,
	type ReservationCommitRequest,
	type ReservationReleaseHandler,
	type ReservationRef,
	type ReservationRequest,
	type ReservationReserveHandler
} from './types'

const createReserveHandler = <K extends ReservationKind>(
	kind: K,
	handler: (
		request: Extract<ReservationRequest, { kind: K }>,
		context: ReservationHandlerContext
	) => Extract<ReservationAcquireResult, { kind: K }> | null
): ReservationReserveHandler => {
	return (request, context) => {
		if (request.kind !== kind) {
			return null
		}
		return handler(request as Extract<ReservationRequest, { kind: K }>, context)
	}
}

const createReleaseHandler = <K extends ReservationKind>(
	kind: K,
	handler: (
		reservation: Extract<ReservationRef, { kind: K }>,
		context: ReservationHandlerContext
	) => void
): ReservationReleaseHandler => {
	return (reservation, context) => {
		if (reservation.kind !== kind) {
			return
		}
		handler(reservation as Extract<ReservationRef, { kind: K }>, context)
	}
}

const createCommitHandler = <K extends ReservationKind>(
	kind: K,
	handler: (
		request: Extract<ReservationCommitRequest, { kind: K }>,
		context: ReservationHandlerContext
	) => boolean
): ReservationCommitHandler => {
	return (request, context) => {
		if (request.kind !== kind) {
			return false
		}
		return handler(request as Extract<ReservationCommitRequest, { kind: K }>, context)
	}
}

const RESERVE_HANDLERS: Record<ReservationKind, ReservationReserveHandler> = {
	[ReservationKind.Storage]: createReserveHandler(ReservationKind.Storage, reserveStorageReservation),
	[ReservationKind.Loot]: createReserveHandler(ReservationKind.Loot, reserveLootReservation),
	[ReservationKind.Tool]: createReserveHandler(ReservationKind.Tool, reserveToolReservation),
	[ReservationKind.Node]: createReserveHandler(ReservationKind.Node, reserveNodeReservation),
	[ReservationKind.Amenity]: createReserveHandler(ReservationKind.Amenity, reserveAmenityReservation),
	[ReservationKind.House]: createReserveHandler(ReservationKind.House, reserveHouseReservation),
	[ReservationKind.Npc]: createReserveHandler(ReservationKind.Npc, reserveNpcReservation)
}

const RELEASE_HANDLERS: Record<ReservationKind, ReservationReleaseHandler> = {
	[ReservationKind.Storage]: createReleaseHandler(ReservationKind.Storage, releaseStorageReservation),
	[ReservationKind.Loot]: createReleaseHandler(ReservationKind.Loot, releaseLootReservation),
	[ReservationKind.Tool]: createReleaseHandler(ReservationKind.Tool, releaseToolReservation),
	[ReservationKind.Node]: createReleaseHandler(ReservationKind.Node, releaseNodeReservation),
	[ReservationKind.Amenity]: createReleaseHandler(ReservationKind.Amenity, releaseAmenityReservation),
	[ReservationKind.House]: createReleaseHandler(ReservationKind.House, releaseHouseReservation),
	[ReservationKind.Npc]: createReleaseHandler(ReservationKind.Npc, releaseNpcReservation)
}

const COMMIT_HANDLERS: Partial<Record<ReservationKind, ReservationCommitHandler>> = {
	[ReservationKind.House]: createCommitHandler(ReservationKind.House, commitHouseReservation)
}

export class ReservationSystem extends BaseManager<ReservationSystemDeps> {
	private readonly state = new ReservationSystemState()

	constructor(managers: ReservationSystemDeps) {
		super(managers)
	}

	public reserve(request: ReservationRequest): ReservationAcquireResult | null {
		return RESERVE_HANDLERS[request.kind](request, this.getContext())
	}

	public release(reservation: ReservationRef): void {
		RELEASE_HANDLERS[reservation.kind](reservation, this.getContext())
	}

	public releaseMany(reservations: ReservationRef[]): void {
		for (const reservation of reservations) {
			this.release(reservation)
		}
	}

	public commit(request: ReservationCommitRequest): boolean {
		const handler = COMMIT_HANDLERS[request.kind]
		if (!handler) {
			return false
		}
		return handler(request, this.getContext())
	}

	public canReserveHouseSlot(houseId: string): boolean {
		return canReserveHouseSlot(houseId, this.getContext())
	}

	serialize(): ReservationSnapshot {
		return this.state.serialize()
	}

	deserialize(state: ReservationSnapshot): void {
		this.state.deserialize(state)
	}

	reset(): void {
		this.state.reset()
	}

	private getContext(): ReservationHandlerContext {
		return {
			managers: this.managers,
			state: this.state
		}
	}
}

export type { ReservationSystemDeps } from './deps'
export * from './ReservationSystemState'
export * from './types'
