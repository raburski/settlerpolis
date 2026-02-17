import { describe, expect, it } from 'vitest'
import {
	assignRecipientsToRouteSegments,
	buildRouteSegments,
	type DeliveryRecipient
} from '../../src/Settlers/Work/stepHandlers/routeDeliveryPlanner'

describe('routeDeliveryPlanner', () => {
	it('builds overlapping patrol segments from a route and stride', () => {
		const route = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 2, y: 0 },
			{ x: 3, y: 0 },
			{ x: 4, y: 0 },
			{ x: 5, y: 0 }
		]

		const segments = buildRouteSegments(route, 2)
		expect(segments).toEqual([
			{
				index: 0,
				startTileIndex: 0,
				endTileIndex: 2,
				tiles: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]
			},
			{
				index: 1,
				startTileIndex: 2,
				endTileIndex: 4,
				tiles: [{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }]
			},
			{
				index: 2,
				startTileIndex: 4,
				endTileIndex: 5,
				tiles: [{ x: 4, y: 0 }, { x: 5, y: 0 }]
			}
		])
	})

	it('joins straight runs when stride allows long segments', () => {
		const route = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 2, y: 0 },
			{ x: 3, y: 0 },
			{ x: 3, y: 1 },
			{ x: 3, y: 2 },
			{ x: 4, y: 2 }
		]

		const segments = buildRouteSegments(route, 20)
		expect(segments).toEqual([
			{
				index: 0,
				startTileIndex: 0,
				endTileIndex: 3,
				tiles: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]
			},
			{
				index: 1,
				startTileIndex: 3,
				endTileIndex: 5,
				tiles: [{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }]
			},
			{
				index: 2,
				startTileIndex: 5,
				endTileIndex: 6,
				tiles: [{ x: 3, y: 2 }, { x: 4, y: 2 }]
			}
		])
	})

	it('assigns each recipient to the nearest eligible segment', () => {
		const route = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 2, y: 0 },
			{ x: 3, y: 0 },
			{ x: 4, y: 0 },
			{ x: 5, y: 0 }
		]
		const segments = buildRouteSegments(route, 2)
		const recipients: Array<DeliveryRecipient<{ houseId: string }>> = [
			{ recipientId: 'a', tile: { x: 1, y: 1 }, payload: { houseId: 'a' } },
			{ recipientId: 'b', tile: { x: 3, y: 0 }, payload: { houseId: 'b' } },
			{ recipientId: 'c', tile: { x: 10, y: 10 }, payload: { houseId: 'c' } },
			{ recipientId: 'd', tile: { x: 2, y: 0 }, payload: { houseId: 'd' } }
		]

		const assignments = assignRecipientsToRouteSegments(segments, recipients, 1)
		expect(assignments[0].map(entry => entry.recipientId)).toEqual(['d', 'a'])
		expect(assignments[1].map(entry => entry.recipientId)).toEqual(['b'])
		expect(assignments[2]).toEqual([])
	})
})
