import { describe, it, expect, beforeEach } from 'vitest'
import { createTestGame } from '../helpers/setup'
import { Event } from '../../src/events'
import { Receiver } from '../../src/types'
import { house } from '../fixtures/buildings'
import { logs, stone } from '../fixtures/items'

describe('Building Construction Integration', () => {
	let game: ReturnType<typeof createTestGame>['game']
	let eventManager: ReturnType<typeof createTestGame>['eventManager']
	let helper: ReturnType<typeof createTestGame>['helper']

	beforeEach(() => {
		const setup = createTestGame({
			buildings: [house],
			items: [logs, stone]
		})
		game = setup.game
		eventManager = setup.eventManager
		helper = setup.helper
		eventManager.clearEventHistory()
	})

	it('should place a building when requested', async () => {
		// Place building
		helper.dispatch(Event.Buildings.CS.Place, {
			buildingId: 'house',
			position: { x: 100, y: 100 }
		}, { clientId: 'player-1' })

		// Verify placement event was emitted (uses default timeout)
		const placed = await helper.expectEvent(Event.Buildings.SC.Placed)
		
		expect(placed.data.building.buildingId).toBe('house')
		expect(placed.data.building.position).toEqual({ x: 100, y: 100 })
	})

	it('should track event history', () => {
		// Dispatch multiple events
		helper.dispatch(Event.Buildings.CS.Place, {
			buildingId: 'house',
			position: { x: 100, y: 100 }
		})

		// Check event history
		const allEvents = eventManager.getEmittedEvents()
		expect(allEvents.length).toBeGreaterThan(0)
		
		const buildingEvents = eventManager.getEventsByPrefix('sc:buildings:')
		expect(buildingEvents.length).toBeGreaterThan(0)
	})
})

