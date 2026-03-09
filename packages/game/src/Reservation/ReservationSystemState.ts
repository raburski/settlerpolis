import type {
	OccupancyReservationSnapshot,
	HouseReservationSnapshot,
	ReservationSnapshot
} from '../state/types'
import type { Position } from '../types'

interface OccupancySlotReservation {
	reservationId: string
	buildingInstanceId: string
	settlerId: string
	mode: 'outside' | 'inside'
	slotIndex?: number
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
	public occupancyReservations = new Map<string, OccupancySlotReservation>()
	public occupancySlotsByBuilding = new Map<string, Map<number, string>>()
	public houseReservations = new Map<string, HouseSlotReservation>()
	public houseReservationsByHouse = new Map<string, Map<string, string>>()

	public serialize(): ReservationSnapshot {
		return {
			occupancyReservations: Array.from(this.occupancyReservations.entries()).map(([reservationId, reservation]) => ([
				reservationId,
				{
						reservationId,
						buildingInstanceId: reservation.buildingInstanceId,
						settlerId: reservation.settlerId,
						mode: reservation.mode,
						slotIndex: reservation.slotIndex,
						position: { ...reservation.position },
						createdAt: reservation.createdAt
					} as OccupancyReservationSnapshot
				])),
			occupancySlotsByBuilding: Array.from(this.occupancySlotsByBuilding.entries()).map(([buildingInstanceId, slots]) => ([
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
		this.occupancyReservations.clear()
		this.occupancySlotsByBuilding.clear()
		this.houseReservations.clear()
		this.houseReservationsByHouse.clear()

		for (const [reservationId, reservation] of state.occupancyReservations) {
				this.occupancyReservations.set(reservationId, {
					reservationId: reservation.reservationId,
					buildingInstanceId: reservation.buildingInstanceId,
					settlerId: reservation.settlerId,
					mode: reservation.mode,
					slotIndex: reservation.slotIndex,
					position: { ...reservation.position },
					createdAt: reservation.createdAt
				})
			}

		for (const [buildingInstanceId, slots] of state.occupancySlotsByBuilding) {
			this.occupancySlotsByBuilding.set(buildingInstanceId, new Map(slots))
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
		this.occupancyReservations.clear()
		this.occupancySlotsByBuilding.clear()
		this.houseReservations.clear()
		this.houseReservationsByHouse.clear()
	}
}
