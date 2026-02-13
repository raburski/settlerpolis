import { describe, expect, it } from 'vitest'
import { MapObjectsManager } from '../../src/MapObjects'
import type { ItemMetadata } from '../../src/Items/types'
import type { Logger } from '../../src/Logs'
import type { MapObject } from '../../src/MapObjects/types'
import { MockEventManager } from '../helpers/MockEventManager'

const createManager = (itemMetadataByType: Record<string, ItemMetadata | null> = {}) => {
	const eventManager = new MockEventManager()
	const logger: Logger = {
		log: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		debug: () => {}
	}

	const itemsManager = {
		getItemMetadata: (itemType: string) => itemMetadataByType[itemType] || null
	}

	const inventoryManager = {
		addItem: () => {}
	}

	return new MapObjectsManager(
		{
			items: itemsManager as any,
			inventory: inventoryManager as any
		},
		eventManager,
		logger
	)
}

const createObject = (overrides: Partial<MapObject> = {}): MapObject => {
	return {
		id: overrides.id || 'obj-1',
		item: overrides.item || { id: 'item-1', itemType: 'wood' },
		position: overrides.position || { x: 0, y: 0 },
		rotation: overrides.rotation || 0,
		playerId: overrides.playerId || 'player-1',
		mapId: overrides.mapId || 'map-1',
		metadata: overrides.metadata
	}
}

describe('MapObjects spatial index', () => {
	it('indexes objects that span multiple chunks and dedupes query results', () => {
		const manager = createManager()
		manager.restoreObject(createObject({
			id: 'obj-wide',
			metadata: {
				footprint: { width: 20, height: 1 } // 640px wide, spans >1 chunk
			}
		}))

		const resultsAcrossChunks = manager.getObjectsInArea('map-1', { x: 0, y: 0 }, 700, 32)
		const resultsInFarChunk = manager.getObjectsInArea('map-1', { x: 520, y: 0 }, 64, 32)

		expect(resultsAcrossChunks.map(object => object.id)).toEqual(['obj-wide'])
		expect(resultsInFarChunk.map(object => object.id)).toEqual(['obj-wide'])
	})

	it('preserves storage pile placement exception inside parent building footprint', () => {
		const manager = createManager({
			pile: {
				id: 'pile',
				name: 'Pile',
				emoji: 'x',
				description: '',
				category: 'material' as any,
				stackable: true,
				placement: {
					size: { width: 1, height: 1 },
					blocksMovement: false,
					blocksPlacement: false
				}
			}
		})

		manager.restoreObject(createObject({
			id: 'building-1',
			position: { x: 64, y: 64 },
			metadata: {
				footprint: { width: 4, height: 4 },
				buildingId: 'house',
				buildingInstanceId: 'building-1'
			}
		}))

		const canPlaceStoragePile = manager.canPlaceAt(
			'map-1',
			{ x: 64, y: 64 },
			{ id: 'item-pile', itemType: 'pile' },
			{
				footprint: { width: 1, height: 1 },
				storagePile: true,
				buildingInstanceId: 'building-1'
			}
		)
		const canPlaceRegularObject = manager.canPlaceAt(
			'map-1',
			{ x: 64, y: 64 },
			{ id: 'item-pile', itemType: 'pile' },
			{
				footprint: { width: 1, height: 1 },
				buildingInstanceId: 'building-1'
			}
		)

		expect(canPlaceStoragePile).toBe(true)
		expect(canPlaceRegularObject).toBe(false)
	})

	it('removes object from index buckets when despawned', () => {
		const manager = createManager()
		manager.restoreObject(createObject({
			id: 'obj-remove',
			metadata: {
				footprint: { width: 18, height: 1 }
			}
		}))

		expect(manager.getObjectsInArea('map-1', { x: 500, y: 0 }, 64, 32).map(object => object.id)).toEqual(['obj-remove'])
		expect(manager.removeObjectById('obj-remove', 'map-1')).toBe(true)
		expect(manager.getObjectsInArea('map-1', { x: 500, y: 0 }, 64, 32)).toEqual([])
	})
})
