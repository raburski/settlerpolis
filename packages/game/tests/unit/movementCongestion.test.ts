import { describe, expect, it } from 'vitest'
import { MovementManager } from '../../src/Movement'
import { MovementEvents } from '../../src/Movement/events'
import { SimulationEvents } from '../../src/Simulation/events'
import { Receiver } from '../../src/Receiver'
import { MockEventManager } from '../helpers/MockEventManager'

type TestManagers = {
	event: MockEventManager
	map: {
		getMap: (mapId: string) => any
		findPath: (_mapId: string, start: { x: number, y: number }, end: { x: number, y: number }) => Array<{ x: number, y: number }>
		findNearestWalkablePosition: () => null
	}
	roads: {
		getRoadData: () => null
		getSpeedMultiplierForSegment: () => number
	}
}

const toWorld = (tileX: number, tileY: number) => ({
	x: tileX * 32 + 16,
	y: tileY * 32 + 16
})

const createDetourManagers = (): TestManagers => {
	const event = new MockEventManager()
	const width = 3
	const height = 3
	const mapData = {
		tiledMap: {
			tilewidth: 32,
			tileheight: 32
		},
		collision: {
			width,
			height,
			data: Array.from({ length: width * height }, () => 0)
		}
	}

	const key = (position: { x: number, y: number }) => `${Math.floor(position.x / 32)},${Math.floor(position.y / 32)}`
	const routeMap = new Map<string, Array<{ x: number, y: number }>>([
		['0,1->2,1', [toWorld(0, 1), toWorld(1, 1), toWorld(2, 1)]],
		['0,0->2,1', [toWorld(0, 0), toWorld(1, 0), toWorld(2, 1)]],
		['0,2->2,1', [toWorld(0, 2), toWorld(1, 2), toWorld(2, 1)]],
		['1,0->2,1', [toWorld(1, 0), toWorld(2, 1)]],
		['1,2->2,1', [toWorld(1, 2), toWorld(2, 1)]]
	])

	return {
		event,
		map: {
			getMap: (_mapId: string) => mapData,
			findPath: (_mapId: string, start: { x: number, y: number }, end: { x: number, y: number }) => {
				const path = routeMap.get(`${key(start)}->${key(end)}`)
				if (path) {
					return path.map(step => ({ ...step }))
				}
				return [start, end]
			},
			findNearestWalkablePosition: () => null
		},
		roads: {
			getRoadData: () => null,
			getSpeedMultiplierForSegment: () => 1
		}
	}
}

const createManagers = (width: number, height: number): TestManagers => {
	const event = new MockEventManager()
	const mapData = {
		tiledMap: {
			tilewidth: 32,
			tileheight: 32
		},
		collision: {
			width,
			height,
			data: Array.from({ length: width * height }, () => 0)
		}
	}

	return {
		event,
		map: {
			getMap: (_mapId: string) => mapData,
			findPath: (_mapId: string, start: { x: number, y: number }, end: { x: number, y: number }) => [start, end],
			findNearestWalkablePosition: () => null
		},
		roads: {
			getRoadData: () => null,
			getSpeedMultiplierForSegment: () => 1
		}
	}
}

const emitTick = (event: MockEventManager, nowMs: number, deltaMs: number): void => {
	event.emit(Receiver.All, SimulationEvents.SS.Tick, { nowMs, deltaMs })
}

describe('Movement congestion gating', () => {
	it('still moves when road manager is not initialized yet', () => {
		const event = new MockEventManager()
		const mapData = {
			tiledMap: {
				tilewidth: 32,
				tileheight: 32
			},
			collision: {
				width: 3,
				height: 1,
				data: [0, 0, 0]
			}
		}
		const movement = new MovementManager({
			event,
			map: {
				getMap: () => mapData,
				findPath: (_mapId: string, start: { x: number, y: number }, end: { x: number, y: number }) => [start, end],
				findNearestWalkablePosition: () => null
			},
			roads: undefined
		} as any, {
			log: () => {},
			debug: () => {},
			warn: () => {},
			error: () => {}
		} as any)

		movement.registerEntity({ id: 'mover', mapId: 'map-1', position: { x: 16, y: 16 }, speed: 32 })
		const started = movement.moveAlongPath('mover', [{ x: 16, y: 16 }, { x: 48, y: 16 }])
		expect(started).toBe(true)
		expect(event.getEventsByType(MovementEvents.SC.MoveToPosition).length).toBe(1)

		emitTick(event, 1500, 1500)
		expect(movement.hasActiveMovement('mover')).toBe(false)
		expect(movement.getEntityPosition('mover')).toEqual({ x: 48, y: 16 })
	})

	it('queues movement when destination tile is occupied by idle blocker and emits yield request', () => {
		const managers = createManagers(4, 2)
		const movement = new MovementManager(managers as any, {
			log: () => {},
			debug: () => {},
			warn: () => {},
			error: () => {}
		} as any)

		movement.registerEntity({ id: 'blocker', mapId: 'map-1', position: { x: 48, y: 16 }, speed: 32 })
		movement.registerEntity({ id: 'mover', mapId: 'map-1', position: { x: 16, y: 16 }, speed: 32 })

		const started = movement.moveAlongPath('mover', [{ x: 16, y: 16 }, { x: 48, y: 16 }])
		expect(started).toBe(true)
		expect(managers.event.getEventsByType(MovementEvents.SC.MoveToPosition).length).toBe(0)

		const yieldRequests = managers.event.getEventsByType(MovementEvents.SS.YieldRequested)
		expect(yieldRequests.length).toBe(1)
		expect(yieldRequests[0].data).toMatchObject({
			requesterEntityId: 'mover',
			blockerEntityId: 'blocker',
			mapId: 'map-1',
			tile: { x: 1, y: 0 }
		})

		movement.updateEntityPosition('blocker', { x: 80, y: 16 })
		emitTick(managers.event, 250, 250)
		expect(managers.event.getEventsByType(MovementEvents.SC.MoveToPosition).length).toBe(1)

		emitTick(managers.event, 1500, 1250)
		expect(movement.hasActiveMovement('mover')).toBe(false)
		expect(movement.getEntityPosition('mover')).toEqual({ x: 48, y: 16 })
	})

	it('allows two opposite movers through one tile and queues the third', () => {
		const managers = createManagers(4, 1)
		const movement = new MovementManager(managers as any, {
			log: () => {},
			debug: () => {},
			warn: () => {},
			error: () => {}
		} as any)

		movement.registerEntity({ id: 'a', mapId: 'map-1', position: { x: 16, y: 16 }, speed: 32 })
		movement.registerEntity({ id: 'b', mapId: 'map-1', position: { x: 80, y: 16 }, speed: 32 })
		movement.registerEntity({ id: 'c', mapId: 'map-1', position: { x: 16, y: 16 }, speed: 32 })

		movement.moveAlongPath('a', [{ x: 16, y: 16 }, { x: 48, y: 16 }, { x: 80, y: 16 }])
		movement.moveAlongPath('b', [{ x: 80, y: 16 }, { x: 48, y: 16 }, { x: 16, y: 16 }])
		movement.moveAlongPath('c', [{ x: 16, y: 16 }, { x: 48, y: 16 }])

		const moveEvents = managers.event.getEventsByType(MovementEvents.SC.MoveToPosition)
		expect(moveEvents.length).toBe(2)
		expect(moveEvents.map(event => event.data.entityId).sort()).toEqual(['a', 'b'])
		expect(movement.hasActiveMovement('c')).toBe(true)
	})

	it('does not deadlock adjacent opposite movers swapping tiles', () => {
		const managers = createManagers(3, 1)
		const movement = new MovementManager(managers as any, {
			log: () => {},
			debug: () => {},
			warn: () => {},
			error: () => {}
		} as any)

		movement.registerEntity({ id: 'a', mapId: 'map-1', position: { x: 16, y: 16 }, speed: 32 })
		movement.registerEntity({ id: 'b', mapId: 'map-1', position: { x: 48, y: 16 }, speed: 32 })

		const startedA = movement.moveAlongPath('a', [{ x: 16, y: 16 }, { x: 48, y: 16 }])
		const startedB = movement.moveAlongPath('b', [{ x: 48, y: 16 }, { x: 16, y: 16 }])
		expect(startedA).toBe(true)
		expect(startedB).toBe(true)

		for (let i = 1; i <= 10; i += 1) {
			emitTick(managers.event, i * 250, 250)
		}

		expect(movement.hasActiveMovement('a')).toBe(false)
		expect(movement.hasActiveMovement('b')).toBe(false)
		expect(movement.getEntityPosition('a')).toEqual({ x: 48, y: 16 })
		expect(movement.getEntityPosition('b')).toEqual({ x: 16, y: 16 })
	})

	it('reroutes around a persistent blocker after congestion timeout', () => {
		const managers = createDetourManagers()
		const movement = new MovementManager(managers as any, {
			log: () => {},
			debug: () => {},
			warn: () => {},
			error: () => {}
		} as any)

		movement.registerEntity({ id: 'blocker', mapId: 'map-1', position: toWorld(1, 1), speed: 32 })
		movement.registerEntity({ id: 'mover', mapId: 'map-1', position: toWorld(0, 1), speed: 32 })

		const started = movement.moveAlongPath('mover', [toWorld(0, 1), toWorld(1, 1), toWorld(2, 1)])
		expect(started).toBe(true)
		expect(managers.event.getEventsByType(MovementEvents.SC.MoveToPosition).length).toBe(0)

		emitTick(managers.event, 250, 250)
		expect(managers.event.getEventsByType(MovementEvents.SC.MoveToPosition).length).toBe(0)

		emitTick(managers.event, 600, 350)
		expect(managers.event.getEventsByType(MovementEvents.SC.MoveToPosition).length).toBeGreaterThan(0)

		for (let i = 1; i <= 12; i += 1) {
			emitTick(managers.event, 600 + i * 250, 250)
		}

		expect(movement.hasActiveMovement('mover')).toBe(false)
		expect(movement.getEntityPosition('mover')).toEqual(toWorld(2, 1))
	})
})
