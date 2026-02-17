import type { MapData } from './types'

export class MapManagerState {
	public maps: Map<string, MapData> = new Map()
	public baseCollision: Map<string, number[]> = new Map()
	public dynamicCollisionCounts: Map<string, Int16Array> = new Map()
	public constructionPenaltyCounts: Map<string, Int16Array> = new Map()
	public debug = true
	public defaultMapId: string = 'town'
}
