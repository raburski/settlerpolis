import type { MapObject, MapObjectId } from './types'
import type { MapObjectsSnapshot } from '../state/types'

export class MapObjectsManagerState {
	public mapObjectsByMap = new Map<string, Map<string, MapObject>>()
	public objectChunksByMap = new Map<string, Map<string, Set<MapObjectId>>>()
	public chunkKeysByObjectByMap = new Map<string, Map<MapObjectId, string[]>>()

	public serialize(): MapObjectsSnapshot {
		return {
			objectsByMap: Array.from(this.mapObjectsByMap.entries()).map(([mapId, mapObjects]) => ([
				mapId,
				Array.from(mapObjects.values()).map(object => ({
					...object,
					position: { ...object.position },
					item: { ...object.item },
					metadata: object.metadata ? { ...object.metadata } : undefined
				}))
			]))
		}
	}

	public deserialize(state: MapObjectsSnapshot, addObjectToMap: (object: MapObject) => void): void {
		this.mapObjectsByMap.clear()
		this.objectChunksByMap.clear()
		this.chunkKeysByObjectByMap.clear()
		for (const [mapId, objects] of state.objectsByMap) {
			for (const object of objects) {
				addObjectToMap({
					...object,
					mapId,
					position: { ...object.position },
					item: { ...object.item },
					metadata: object.metadata ? { ...object.metadata } : undefined
				})
			}
		}
	}

	public reset(): void {
		this.mapObjectsByMap.clear()
		this.objectChunksByMap.clear()
		this.chunkKeysByObjectByMap.clear()
	}
}
