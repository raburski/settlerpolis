import type { BuildingInstanceId, PlayerId, TradeRouteId, MapId } from '../ids'
import type { WorldMapNodeTradeOffer } from '../WorldMap/types'

export enum TradeRouteStatus {
	Idle = 'idle',
	Loading = 'loading',
	Ready = 'ready',
	Outbound = 'outbound',
	AtDestination = 'at_destination',
	Returning = 'returning',
	Unloading = 'unloading',
	Cooldown = 'cooldown'
}

export type TradeRouteState = {
	routeId: TradeRouteId
	playerId: PlayerId
	mapId: MapId
	buildingInstanceId: BuildingInstanceId
	nodeId: string
	offerId: string
	offer: WorldMapNodeTradeOffer
	status: TradeRouteStatus
	outboundRemainingMs?: number
	returnRemainingMs?: number
	cooldownRemainingMs?: number
	pendingSelection?: { nodeId: string; offerId: string }
	lastUpdatedAtMs: number
}

export type TradeRouteSelection = {
	buildingInstanceId: BuildingInstanceId
	nodeId: string
	offerId: string
}

export type TradeRouteCancelled = {
	buildingInstanceId: BuildingInstanceId
}

export type TradeRouteListData = {
	routes: TradeRouteState[]
}

export type TradeRouteUpdatedData = {
	route: TradeRouteState
}

export type TradeShipmentStartedData = {
	routeId: TradeRouteId
	buildingInstanceId: BuildingInstanceId
	nodeId: string
	offerId: string
	travelMs: number
}

export type TradeShipmentArrivedData = {
	routeId: TradeRouteId
	buildingInstanceId: BuildingInstanceId
	nodeId: string
	offerId: string
}

export type TradeSnapshot = {
	routes: TradeRouteState[]
	simulationTimeMs: number
	requestCounter: number
	reputation?: Array<[PlayerId, number]>
}
