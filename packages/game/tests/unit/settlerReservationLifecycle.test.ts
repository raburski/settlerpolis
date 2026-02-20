import { describe, expect, it, vi } from 'vitest'
import { HomeRelocationPlanner } from '../../src/Settlers/Behaviour/rules/HomeRelocationPlanner'
import { ReservationKind } from '../../src/Reservation'
import { SettlerActionType } from '../../src/Settlers/Actions/types'
import { WorkAssignmentStatus, WorkProviderType, WorkStepType } from '../../src/Settlers/Work/types'
import { SettlerActionsManager } from '../../src/Settlers/Actions'
import { TransportHandler } from '../../src/Settlers/Work/stepHandlers/transport'
import { SettlerState } from '../../src/Population/types'
import { ConstructionStage } from '../../src/Buildings/types'

describe('Settler reservation lifecycle', () => {
	it('home relocation reserves candidate houses in commute order and falls back when first reservation fails', () => {
		const planner = new HomeRelocationPlanner()
		const reserve = vi.fn((request: { houseId: string }) => {
			if (request.houseId === 'house-best') {
				return null
			}
			if (request.houseId === 'house-good') {
				return {
					kind: ReservationKind.House,
					reservationId: 'house-res-1',
					ref: { kind: ReservationKind.House, reservationId: 'house-res-1' }
				}
			}
			return null
		})

		const deps = {
			buildings: {
				getBuildingInstance: (id: string) => {
					if (id === 'work') {
						return { id, mapId: 'map-1', playerId: 'p1', position: { x: 320, y: 0 }, buildingId: 'work-def', stage: ConstructionStage.Completed }
					}
					if (id === 'house-current') {
						return { id, mapId: 'map-1', playerId: 'p1', position: { x: 0, y: 0 }, buildingId: 'house-def', stage: ConstructionStage.Completed }
					}
					if (id === 'house-best') {
						return { id, mapId: 'map-1', playerId: 'p1', position: { x: 224, y: 0 }, buildingId: 'house-def', stage: ConstructionStage.Completed }
					}
					if (id === 'house-good') {
						return { id, mapId: 'map-1', playerId: 'p1', position: { x: 192, y: 0 }, buildingId: 'house-def', stage: ConstructionStage.Completed }
					}
					return null
				},
				getAllBuildings: () => ([
					{ id: 'house-current', mapId: 'map-1', playerId: 'p1', position: { x: 0, y: 0 }, buildingId: 'house-def', stage: ConstructionStage.Completed },
					{ id: 'house-best', mapId: 'map-1', playerId: 'p1', position: { x: 224, y: 0 }, buildingId: 'house-def', stage: ConstructionStage.Completed },
					{ id: 'house-good', mapId: 'map-1', playerId: 'p1', position: { x: 192, y: 0 }, buildingId: 'house-def', stage: ConstructionStage.Completed }
				]),
				getBuildingDefinition: (buildingId: string) => {
					if (buildingId === 'house-def') {
						return { spawnsSettlers: true, maxOccupants: 4 }
					}
					return {}
				}
			},
			population: {
				getSettler: () => ({ id: 'settler-1', houseId: 'house-current' })
			},
			reservations: {
				reserve
			},
			roads: {
				getRoadData: () => null
			},
			map: {
				findPath: (_mapId: string, from: { x: number, y: number }, to: { x: number, y: number }) => [from, to],
				getMap: () => ({ tiledMap: { tilewidth: 32 } })
			}
		} as any

		const plan = planner.tryBuildPlan(
			'settler-1',
			{
				assignmentId: 'a1',
				settlerId: 'settler-1',
				providerId: 'p',
				providerType: WorkProviderType.Building,
				buildingInstanceId: 'work',
				assignedAt: 0,
				status: WorkAssignmentStatus.Assigned
			},
			100000,
			deps
		)

		expect(plan).not.toBeNull()
		expect(reserve).toHaveBeenCalledTimes(2)
		expect(reserve.mock.calls[0]?.[0]?.houseId).toBe('house-best')
		expect(reserve.mock.calls[1]?.[0]?.houseId).toBe('house-good')
		const changeHome = plan!.actions.find(action => action.type === SettlerActionType.ChangeHome)
		expect(changeHome?.type).toBe(SettlerActionType.ChangeHome)
		if (changeHome?.type === SettlerActionType.ChangeHome) {
			expect(changeHome.houseId).toBe('house-good')
		}
	})

	it('transport builder releases acquired reservation refs when build fails after reservation', () => {
		const sourceRef = { kind: ReservationKind.Loot, itemId: 'loot-1', ownerId: 'assignment-1' } as const
		const releaseMany = vi.fn()

		const result = TransportHandler.build({
			settlerId: 'settler-1',
			assignment: {
				assignmentId: 'assignment-1',
				settlerId: 'settler-1',
				providerId: 'provider-1',
				providerType: WorkProviderType.Logistics,
				assignedAt: 0,
				status: WorkAssignmentStatus.Assigned
			},
			step: {
				type: WorkStepType.Transport,
				source: { type: 'ground', itemId: 'loot-1', position: { x: 32, y: 32 } },
				target: { type: 'storage', buildingInstanceId: 'target-building' },
				itemType: 'wood',
				quantity: 1
			} as any,
			managers: {
				population: {
					getSettler: () => ({
						id: 'settler-1',
						playerId: 'player-1',
						mapId: 'map-1',
						position: { x: 0, y: 0 },
						profession: 'carrier',
						state: SettlerState.Idle,
						stateContext: {},
						health: 100,
						speed: 1,
						createdAt: 0
					})
				},
				buildings: {
					getBuildingInstance: () => ({
						id: 'target-building',
						mapId: 'map-1',
						position: { x: 128, y: 128 },
						buildingId: 'warehouse'
					})
				},
				roads: {
					getRoadData: () => null
				},
				map: {
					getMap: () => ({ tiledMap: { tilewidth: 32 } }),
					findPath: () => null,
					findNearestWalkablePosition: () => null
				}
			} as any,
			reservationSystem: {
				reserve: (request: { kind: ReservationKind }) => {
					if (request.kind === ReservationKind.Loot) {
						return {
							kind: ReservationKind.Loot,
							ref: sourceRef
						}
					}
					return null
				},
				releaseMany
			} as any,
			simulationTimeMs: 0
		})

		expect(result.actions[0]?.type).toBe(SettlerActionType.Wait)
		expect(releaseMany).toHaveBeenCalledTimes(1)
		expect(releaseMany).toHaveBeenCalledWith([sourceRef])
	})

	it('actions manager abort releases queued action reservation refs', () => {
		const release = vi.fn()
		const cancelMovement = vi.fn()
		const manager = new SettlerActionsManager(
			{
				movement: { cancelMovement },
				loot: {},
				storage: {},
				resourceNodes: {},
				buildings: {},
				population: {},
				reservations: { release },
				roads: {},
				map: {},
				npc: {},
				wildlife: {}
			} as any,
			{
				on: vi.fn(),
				off: vi.fn(),
				onJoined: vi.fn(),
				onLeft: vi.fn(),
				emit: vi.fn()
			} as any,
			{
				log: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
				debug: vi.fn()
			}
		)

		const ref = { kind: ReservationKind.Storage, reservationId: 'slot-res-1' } as const
		manager.enqueue('settler-1', [{
			type: SettlerActionType.Wait,
			durationMs: 1000,
			reservationRefs: [ref]
		} as any])

		expect(manager.isBusy('settler-1')).toBe(true)
		manager.abort('settler-1')
		expect(cancelMovement).toHaveBeenCalledWith('settler-1')
		expect(release).toHaveBeenCalledWith(ref)
		expect(manager.isBusy('settler-1')).toBe(false)
	})
})
