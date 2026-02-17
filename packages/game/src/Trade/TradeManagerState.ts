import type { WorldMapData, WorldMapNode } from '../WorldMap/types'
import type { TradeRouteState, TradeSnapshot } from './types'

export class TradeManagerState {
	public routesByBuilding = new Map<string, TradeRouteState>()
	public worldMap: WorldMapData | null = null
	public nodesById = new Map<string, WorldMapNode>()
	public travelMsByNode = new Map<string, number>()
	public simulationTimeMs = 0
	public tickAccumulatorMs = 0
	public requestCounter = 0

	public serialize(): TradeSnapshot {
		return {
			routes: Array.from(this.routesByBuilding.values()).map(route => ({
				...route,
				offer: { ...route.offer }
			})),
			simulationTimeMs: this.simulationTimeMs,
			tickAccumulatorMs: this.tickAccumulatorMs,
			requestCounter: this.requestCounter
		}
	}

	public deserialize(state: TradeSnapshot): void {
		this.routesByBuilding.clear()
		for (const route of state.routes) {
			this.routesByBuilding.set(route.buildingInstanceId, { ...route, offer: { ...route.offer } })
		}
		this.simulationTimeMs = state.simulationTimeMs
		this.tickAccumulatorMs = state.tickAccumulatorMs
		this.requestCounter = state.requestCounter ?? 0
	}

	public reset(): void {
		this.routesByBuilding.clear()
		this.travelMsByNode.clear()
		this.simulationTimeMs = 0
		this.tickAccumulatorMs = 0
		this.requestCounter = 0
	}
}
