import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import type { TradeRouteState } from '@rugged/game'
import { UiEvents } from '../uiEvents'

class TradeService {
	private routesByBuilding = new Map<string, TradeRouteState>()

	constructor() {
		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		EventBus.on(Event.Trade.SC.RouteList, (data: { routes: TradeRouteState[] }) => {
			this.routesByBuilding.clear()
			for (const route of data.routes || []) {
				this.routesByBuilding.set(route.buildingInstanceId, route)
			}
			this.emitUpdate()
		})

		EventBus.on(Event.Trade.SC.RouteUpdated, (data: { route: TradeRouteState }) => {
			if (!data?.route) return
			this.routesByBuilding.set(data.route.buildingInstanceId, data.route)
			this.emitUpdate()
		})
	}

	private emitUpdate(): void {
		EventBus.emit(UiEvents.Trade.Updated, {
			routes: this.getRoutes()
		})
	}

	public requestRoutes(): void {
		EventBus.emit(Event.Trade.CS.RequestRoutes, {})
	}

	public setRoute(buildingInstanceId: string, nodeId: string, offerId: string): void {
		EventBus.emit(Event.Trade.CS.CreateRoute, {
			buildingInstanceId,
			nodeId,
			offerId
		})
	}

	public cancelRoute(buildingInstanceId: string): void {
		EventBus.emit(Event.Trade.CS.CancelRoute, { buildingInstanceId })
	}

	public getRoute(buildingInstanceId: string): TradeRouteState | undefined {
		return this.routesByBuilding.get(buildingInstanceId)
	}

	public getRoutes(): TradeRouteState[] {
		return Array.from(this.routesByBuilding.values())
	}
}

export const tradeService = new TradeService()
