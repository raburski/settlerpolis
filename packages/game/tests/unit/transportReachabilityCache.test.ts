import { describe, expect, it } from 'vitest'
import { TransportHandler } from '../../src/Settlers/Work/stepHandlers/transport'
import {
	TransportSourceType,
	TransportTargetType,
	WorkAssignmentStatus,
	WorkProviderType,
	WorkStepType
} from '../../src/Settlers/Work/types'
import { SettlerState } from '../../src/Population/types'

describe('TransportHandler reachability memoization', () => {
	it('reuses reachability result for repeated source->target checks within one build call', () => {
		const settlerPosition = { x: 0, y: 0 }
		const sourcePosition = { x: 32, y: 32 }
		const targetPosition = { x: 128, y: 128 }
		const pairCalls = new Map<string, number>()
		const pairKey = (from: { x: number, y: number }, to: { x: number, y: number }) => `${from.x},${from.y}->${to.x},${to.y}`

		const managers = {
			population: {
				getSettler: () => ({
					id: 'settler-1',
					playerId: 'player-1',
					mapId: 'map-1',
					position: settlerPosition,
					profession: 'carrier',
					state: SettlerState.Idle,
					stateContext: {},
					health: 100,
					speed: 1,
					createdAt: 0
				})
			},
			buildings: {
				getBuildingInstance: (buildingInstanceId: string) => {
					if (buildingInstanceId !== 'target-building') {
						return null
					}
					return {
						id: 'target-building',
						mapId: 'map-1',
						position: targetPosition,
						buildingId: 'warehouse'
					}
				}
			},
			roads: {
				getRoadData: () => null
			},
			map: {
				getMap: () => ({
					tiledMap: {
						tilewidth: 32
					}
				}),
				findPath: (_mapId: string, from: { x: number, y: number }, to: { x: number, y: number }) => {
					const key = pairKey(from, to)
					pairCalls.set(key, (pairCalls.get(key) || 0) + 1)
					return [from, to]
				},
				findNearestWalkablePosition: () => null
			}
		}

		const reservationSystem = {
			reserveLootItem: () => true,
			releaseLootReservation: () => {},
			reserveStorageIncoming: () => ({
				reservationId: 'incoming-1',
				position: targetPosition
			}),
			releaseStorageReservation: () => {}
		}

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
				source: { type: TransportSourceType.Ground, itemId: 'loot-1', position: sourcePosition },
				target: { type: TransportTargetType.Storage, buildingInstanceId: 'target-building' },
				itemType: 'wood',
				quantity: 1
			},
			managers: managers as any,
			reservationSystem: reservationSystem as any,
			simulationTimeMs: 0
		})

		expect(result.actions.length).toBeGreaterThan(0)
		expect(pairCalls.get(pairKey(sourcePosition, targetPosition))).toBe(1)
	})
})
