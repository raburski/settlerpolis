import type {
	AmenityReservationSnapshot,
	HouseReservationSnapshot,
	ReservationSnapshot
} from '../state/types'
import type { Position } from '../types'

interface AmenitySlotReservation {
	reservationId: string
	buildingInstanceId: string
	settlerId: string
	slotIndex: number
	position: Position
	createdAt: number
}

interface HouseSlotReservation {
	reservationId: string
	houseId: string
	settlerId: string
	createdAt: number
}

export class ReservationSystemState {
	public amenityReservations = new Map<string, AmenitySlotReservation>()
	public amenitySlotsByBuilding = new Map<string, Map<number, string>>()
	public houseReservations = new Map<string, HouseSlotReservation>()
	public houseReservationsByHouse = new Map<string, Map<string, string>>()

	public serialize(): ReservationSnapshot {
		return {
			amenityReservations: Array.from(this.amenityReservations.entries()).map(([reservationId, reservation]) => ([
				reservationId,
				{
					reservationId,
					buildingInstanceId: reservation.buildingInstanceId,
					settlerId: reservation.settlerId,
					slotIndex: reservation.slotIndex,
					position: { ...reservation.position },
					createdAt: reservation.createdAt
				} as AmenityReservationSnapshot
			])),
			amenitySlotsByBuilding: Array.from(this.amenitySlotsByBuilding.entries()).map(([buildingInstanceId, slots]) => ([
				buildingInstanceId,
				Array.from(slots.entries())
			])),
			houseReservations: Array.from(this.houseReservations.entries()).map(([reservationId, reservation]) => ([
				reservationId,
				{
					reservationId,
					houseId: reservation.houseId,
					settlerId: reservation.settlerId,
					createdAt: reservation.createdAt
				} as HouseReservationSnapshot
			])),
			houseReservationsByHouse: Array.from(this.houseReservationsByHouse.entries()).map(([houseId, reservations]) => ([
				houseId,
				Array.from(reservations.entries())
			]))
		}
	}

	public deserialize(state: ReservationSnapshot): void {
		this.amenityReservations.clear()
		this.amenitySlotsByBuilding.clear()
		this.houseReservations.clear()
		this.houseReservationsByHouse.clear()

		for (const [reservationId, reservation] of state.amenityReservations) {
			this.amenityReservations.set(reservationId, {
				reservationId: reservation.reservationId,
				buildingInstanceId: reservation.buildingInstanceId,
				settlerId: reservation.settlerId,
				slotIndex: reservation.slotIndex,
				position: { ...reservation.position },
				createdAt: reservation.createdAt
			})
		}

		for (const [buildingInstanceId, slots] of state.amenitySlotsByBuilding) {
			this.amenitySlotsByBuilding.set(buildingInstanceId, new Map(slots))
		}

		for (const [reservationId, reservation] of state.houseReservations) {
			this.houseReservations.set(reservationId, {
				reservationId: reservation.reservationId,
				houseId: reservation.houseId,
				settlerId: reservation.settlerId,
				createdAt: reservation.createdAt
			})
		}

		for (const [houseId, reservations] of state.houseReservationsByHouse) {
			this.houseReservationsByHouse.set(houseId, new Map(reservations))
		}
	}

	public reset(): void {
		this.amenityReservations.clear()
		this.amenitySlotsByBuilding.clear()
		this.houseReservations.clear()
		this.houseReservationsByHouse.clear()
	}
}
