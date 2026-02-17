import { BaseManager } from '../Managers'
import type { EventClient, EventManager } from '../events'
import { Event } from '../events'
import { Receiver } from '../Receiver'
import { SimulationEvents } from '../Simulation/events'
import type { SimulationTickData } from '../Simulation/types'
import type { WorldMapData, WorldMapNodeTradeOffer, WorldMapLink, WorldMapNode, WorldMapLinkType } from '../WorldMap/types'
import type { BuildingManager } from '../Buildings'
import { BuildingsEvents } from '../Buildings/events'
import { ConstructionStage, type BuildingDefinition } from '../Buildings/types'
import type { StorageManager } from '../Storage'
import type { WorkProviderManager } from '../Settlers/WorkProvider'
import { TradeEvents } from './events'
import {
	TradeRouteStatus,
	type TradeRouteSelection,
	type TradeRouteCancelled,
	type TradeRouteState,
	type TradeRouteUpdatedData,
	type TradeRouteListData,
	type TradeShipmentStartedData,
	type TradeShipmentArrivedData,
	type TradeSnapshot
} from './types'
import { v4 as uuidv4 } from 'uuid'
import type { Logger } from '../Logs'
import type { ItemType } from '../Items/types'
import { LogisticsRequestType } from '../Settlers/WorkProvider/types'
import type { LogisticsRequest } from '../Settlers/WorkProvider/types'
import type { ReputationManager } from '../Reputation'
import { TradeManagerState } from './TradeManagerState'

export interface TradeDeps {
	event: EventManager
	buildings: BuildingManager
	storage: StorageManager
	work: WorkProviderManager
	reputation: ReputationManager
}

export * from './events'
export * from './types'

const TICK_INTERVAL_MS = 1000
const DEFAULT_COOLDOWN_SECONDS = 8

export class TradeManager extends BaseManager<TradeDeps> {
	private readonly state = new TradeManagerState()

	constructor(
		managers: TradeDeps,
		private logger: Logger
	) {
		super(managers)
		this.setupEventHandlers()
	}

	public loadWorldMap(worldMap?: WorldMapData): void {
		this.state.worldMap = worldMap || null
		this.state.nodesById.clear()
		this.state.travelMsByNode.clear()
		if (!this.state.worldMap) {
			return
		}
		for (const node of this.state.worldMap.nodes) {
			this.state.nodesById.set(node.id, node)
		}
	}

	private setupEventHandlers(): void {
		this.managers.event.on(SimulationEvents.SS.SlowTick, this.handleSimulationSSTick)
		this.managers.event.on(TradeEvents.CS.CreateRoute, this.handleTradeCSCreateRoute)
		this.managers.event.on(TradeEvents.CS.CancelRoute, this.handleTradeCSCancelRoute)
		this.managers.event.on(TradeEvents.CS.RequestRoutes, this.handleTradeCSRequestRoutes)
		this.managers.event.on(Event.Players.CS.Join, this.handlePlayersCSJoin)
		this.managers.event.on(BuildingsEvents.SS.Removed, this.handleBuildingsSSRemoved)
	}

	/* EVENT HANDLERS */
	private readonly handleSimulationSSTick = (data: SimulationTickData): void => {
		this.handleSimulationTick(data)
	}

	private readonly handleTradeCSCreateRoute = (data: TradeRouteSelection, client: EventClient): void => {
		this.createOrQueueRoute(data, client)
	}

	private readonly handleTradeCSCancelRoute = (data: TradeRouteCancelled, client: EventClient): void => {
		this.cancelRoute(data, client)
	}

	private readonly handleTradeCSRequestRoutes = (_data: unknown, client: EventClient): void => {
		this.sendRoutesToClient(client)
	}

	private readonly handlePlayersCSJoin = (_data: unknown, client: EventClient): void => {
		this.sendRoutesToClient(client)
	}

	private readonly handleBuildingsSSRemoved = (data: { buildingInstanceId?: string }): void => {
		if (!data?.buildingInstanceId) {
			return
		}
		this.state.routesByBuilding.delete(data.buildingInstanceId)
	}

	private handleSimulationTick(data: SimulationTickData): void {
		this.state.simulationTimeMs = data.nowMs
		this.tick()
	}

	/* METHODS */
	private tick(): void {
		for (const route of this.state.routesByBuilding.values()) {
			const building = this.managers.buildings.getBuildingInstance(route.buildingInstanceId)
			if (!building) {
				this.state.routesByBuilding.delete(route.buildingInstanceId)
				continue
			}
			const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
			const routeType = this.resolveTradeRouteType(definition)
			if (!routeType) {
				this.logger.warn('[TradeManager] Building does not support trade routes:', building.buildingId)
				this.state.routesByBuilding.delete(route.buildingInstanceId)
				continue
			}

			let didUpdate = false
			const previousStatus = route.status

			if (route.status === TradeRouteStatus.Idle && route.pendingSelection) {
				if (this.applyPendingSelection(route, route.pendingSelection, routeType)) {
					route.pendingSelection = undefined
					didUpdate = true
				}
			}

			switch (route.status) {
				case TradeRouteStatus.Idle:
					route.status = TradeRouteStatus.Loading
					didUpdate = true
					break
				case TradeRouteStatus.Loading:
					didUpdate = this.updateLoading(route) || didUpdate
					break
				case TradeRouteStatus.Ready:
					didUpdate = this.dispatchShipment(route, routeType) || didUpdate
					break
				case TradeRouteStatus.Outbound:
					didUpdate = this.advanceOutbound(route) || didUpdate
					break
				case TradeRouteStatus.AtDestination:
					route.status = TradeRouteStatus.Returning
					route.returnRemainingMs = this.getTravelMs(route.nodeId, routeType)
					didUpdate = true
					break
				case TradeRouteStatus.Returning:
					didUpdate = this.advanceReturn(route) || didUpdate
					break
				case TradeRouteStatus.Unloading:
					didUpdate = this.unloadShipment(route) || didUpdate
					break
				case TradeRouteStatus.Cooldown:
					didUpdate = this.advanceCooldown(route) || didUpdate
					break
			}

			if (previousStatus !== route.status) {
				didUpdate = true
			}

			if (didUpdate) {
				route.lastUpdatedAtMs = this.state.simulationTimeMs
				this.emitRouteUpdated(route)
			}
		}
	}

	private updateLoading(route: TradeRouteState): boolean {
		const offer = route.offer
		const outgoingQuantity = this.managers.storage.getCurrentQuantity(route.buildingInstanceId, offer.offerItem, 'incoming')
		const needed = Math.max(0, offer.offerQuantity - outgoingQuantity)
		if (needed > 0) {
			this.enqueueLogisticsInput(route, offer.offerItem, needed)
		}

		const canReceive = this.managers.storage.hasAvailableStorage(route.buildingInstanceId, offer.receiveItem, offer.receiveQuantity, 'outgoing')
		if (needed <= 0 && canReceive) {
			route.status = TradeRouteStatus.Ready
			return true
		}

		return needed > 0
	}

	private dispatchShipment(route: TradeRouteState, routeType: WorldMapLinkType): boolean {
		const offer = route.offer
		const canReceive = this.managers.storage.hasAvailableStorage(route.buildingInstanceId, offer.receiveItem, offer.receiveQuantity, 'outgoing')
		if (!canReceive) {
			route.status = TradeRouteStatus.Loading
			return true
		}

		const currentOutgoing = this.managers.storage.getCurrentQuantity(route.buildingInstanceId, offer.offerItem, 'incoming')
		if (currentOutgoing < offer.offerQuantity) {
			route.status = TradeRouteStatus.Loading
			return true
		}

		const reservation = this.managers.storage.reserveStorage(
			route.buildingInstanceId,
			offer.offerItem,
			offer.offerQuantity,
			`trade:${route.routeId}`,
			true,
			true,
			'incoming'
		)
		if (!reservation) {
			return false
		}

		const removed = this.managers.storage.removeFromStorage(route.buildingInstanceId, offer.offerItem, offer.offerQuantity, reservation.reservationId)
		if (!removed) {
			this.managers.storage.releaseReservation(reservation.reservationId)
			return false
		}

		const travelMs = this.getTravelMs(route.nodeId, routeType)
		route.status = TradeRouteStatus.Outbound
		route.outboundRemainingMs = travelMs
		route.returnRemainingMs = undefined

		const shipmentData: TradeShipmentStartedData = {
			routeId: route.routeId,
			buildingInstanceId: route.buildingInstanceId,
			nodeId: route.nodeId,
			offerId: route.offerId,
			travelMs
		}
		this.managers.event.emit(Receiver.Client, TradeEvents.SC.ShipmentStarted, shipmentData, route.playerId)
		return true
	}

	private advanceOutbound(route: TradeRouteState): boolean {
		if (typeof route.outboundRemainingMs !== 'number') {
			return false
		}
		route.outboundRemainingMs = Math.max(0, route.outboundRemainingMs - TICK_INTERVAL_MS)
		if (route.outboundRemainingMs <= 0) {
			route.status = TradeRouteStatus.AtDestination
			route.outboundRemainingMs = undefined
			return true
		}
		return true
	}

	private advanceReturn(route: TradeRouteState): boolean {
		if (typeof route.returnRemainingMs !== 'number') {
			return false
		}
		route.returnRemainingMs = Math.max(0, route.returnRemainingMs - TICK_INTERVAL_MS)
		if (route.returnRemainingMs <= 0) {
			route.status = TradeRouteStatus.Unloading
			route.returnRemainingMs = undefined
			return true
		}
		return true
	}

	private unloadShipment(route: TradeRouteState): boolean {
		const offer = route.offer
		const reservation = this.managers.storage.reserveStorage(
			route.buildingInstanceId,
			offer.receiveItem,
			offer.receiveQuantity,
			`trade:${route.routeId}`,
			false,
			false,
			'outgoing'
		)
		if (!reservation) {
			return false
		}

		const added = this.managers.storage.addToStorage(route.buildingInstanceId, offer.receiveItem, offer.receiveQuantity, reservation.reservationId, 'outgoing')
		if (!added) {
			this.managers.storage.releaseReservation(reservation.reservationId)
			return false
		}

		const arrivalData: TradeShipmentArrivedData = {
			routeId: route.routeId,
			buildingInstanceId: route.buildingInstanceId,
			nodeId: route.nodeId,
			offerId: route.offerId
		}
		this.managers.event.emit(Receiver.Client, TradeEvents.SC.ShipmentArrived, arrivalData, route.playerId)
		this.managers.reputation.addReputation(route.playerId, offer.reputation)

		const cooldownSeconds = offer.cooldownSeconds ?? DEFAULT_COOLDOWN_SECONDS
		route.status = TradeRouteStatus.Cooldown
		route.cooldownRemainingMs = cooldownSeconds * 1000
		return true
	}

	private advanceCooldown(route: TradeRouteState): boolean {
		if (typeof route.cooldownRemainingMs !== 'number') {
			return false
		}
		route.cooldownRemainingMs = Math.max(0, route.cooldownRemainingMs - TICK_INTERVAL_MS)
		if (route.cooldownRemainingMs <= 0) {
			route.cooldownRemainingMs = undefined
			route.status = TradeRouteStatus.Idle
			return true
		}
		return true
	}

	private enqueueLogisticsInput(route: TradeRouteState, itemType: ItemType, quantity: number): void {
		const requestId = `trade:${route.routeId}:${this.state.requestCounter++}`
		const request: LogisticsRequest = {
			id: requestId,
			type: LogisticsRequestType.Input,
			buildingInstanceId: route.buildingInstanceId,
			itemType,
			quantity,
			priority: 75,
			createdAtMs: this.state.simulationTimeMs
		}
		this.managers.work.enqueueLogisticsRequest(request)
	}

	private createOrQueueRoute(data: TradeRouteSelection, client: EventClient): void {
		if (!this.state.worldMap) {
			this.logger.warn('[TradeManager] World map data not loaded; cannot create route.')
			return
		}

		const building = this.managers.buildings.getBuildingInstance(data.buildingInstanceId)
		if (!building) {
			this.logger.warn('[TradeManager] Trade building not found for route request.')
			return
		}

		if (building.playerId !== client.id) {
			this.logger.warn('[TradeManager] Player tried to configure another player\'s trade building.')
			return
		}

		const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
		const routeType = this.resolveTradeRouteType(definition)
		if (!routeType) {
			this.logger.warn('[TradeManager] Building is not a trade route hub:', building.buildingId)
			return
		}

		if (building.stage !== ConstructionStage.Completed) {
			this.logger.warn('[TradeManager] Trade building is not completed yet.')
			return
		}

		const node = this.state.nodesById.get(data.nodeId)
		if (!node) {
			this.logger.warn('[TradeManager] Unknown trade node:', data.nodeId)
			return
		}

		const offer = node.tradeOffers?.find(entry => entry.id === data.offerId)
		if (!offer) {
			this.logger.warn('[TradeManager] Unknown trade offer:', data.offerId)
			return
		}

		if (!this.isReachableByLinkType(data.nodeId, routeType)) {
			this.logger.warn('[TradeManager] Node not reachable by route type:', routeType, data.nodeId)
			return
		}

		const existing = this.state.routesByBuilding.get(data.buildingInstanceId)
		if (existing) {
			if (existing.status === TradeRouteStatus.Idle) {
				this.applySelection(existing, data, offer)
				this.emitRouteUpdated(existing)
				return
			}
			existing.pendingSelection = { nodeId: data.nodeId, offerId: data.offerId }
			this.emitRouteUpdated(existing)
			return
		}

		const route: TradeRouteState = {
			routeId: uuidv4(),
			playerId: building.playerId,
			mapId: building.mapId,
			buildingInstanceId: building.id,
			nodeId: data.nodeId,
			offerId: data.offerId,
			offer,
			status: TradeRouteStatus.Idle,
			lastUpdatedAtMs: this.state.simulationTimeMs
		}

		this.state.routesByBuilding.set(route.buildingInstanceId, route)
		this.emitRouteUpdated(route)
	}

	private applyPendingSelection(route: TradeRouteState, pending: { nodeId: string; offerId: string }, routeType: WorldMapLinkType): boolean {
		const node = this.state.nodesById.get(pending.nodeId)
		const offer = node?.tradeOffers?.find(entry => entry.id === pending.offerId)
		if (!node || !offer) {
			return false
		}
		if (!this.isReachableByLinkType(node.id, routeType)) {
			return false
		}
		this.applySelection(route, pending, offer)
		return true
	}

	private applySelection(route: TradeRouteState, selection: { nodeId: string; offerId: string }, offer: WorldMapNodeTradeOffer): void {
		route.nodeId = selection.nodeId
		route.offerId = selection.offerId
		route.offer = offer
		route.pendingSelection = undefined
		route.status = TradeRouteStatus.Idle
		route.outboundRemainingMs = undefined
		route.returnRemainingMs = undefined
		route.cooldownRemainingMs = undefined
	}

	private cancelRoute(data: TradeRouteCancelled, client: EventClient): void {
		const route = this.state.routesByBuilding.get(data.buildingInstanceId)
		if (!route) {
			return
		}
		if (route.playerId !== client.id) {
			return
		}
		this.state.routesByBuilding.delete(data.buildingInstanceId)
		this.sendRoutesToClient(client)
	}

	private emitRouteUpdated(route: TradeRouteState): void {
		this.managers.event.emit(Receiver.Client, TradeEvents.SC.RouteUpdated, { route } satisfies TradeRouteUpdatedData, route.playerId)
	}

	private sendRoutesToClient(client: EventClient): void {
		const routes = Array.from(this.state.routesByBuilding.values()).filter(route => route.playerId === client.id)
		const payload: TradeRouteListData = { routes }
		client.emit(Receiver.Sender, TradeEvents.SC.RouteList, payload)
	}

	private getTravelMs(nodeId: string, linkType: WorldMapLinkType): number {
		if (!this.state.worldMap) {
			return 0
		}
		const cacheKey = `${linkType}:${nodeId}`
		const cached = this.state.travelMsByNode.get(cacheKey)
		if (typeof cached === 'number') {
			return cached
		}
		const distance = this.findShortestDistance(nodeId, linkType)
		const travelMs = Math.max(0, distance * this.state.worldMap.travelSecondsPerUnit * 1000)
		this.state.travelMsByNode.set(cacheKey, travelMs)
		return travelMs
	}

	private findShortestDistance(targetNodeId: string, linkType: WorldMapLinkType): number {
		if (!this.state.worldMap) {
			return 0
		}
		const start = this.state.worldMap.homeNodeId
		if (start === targetNodeId) {
			return 0
		}

		const distances = new Map<string, number>()
		const visited = new Set<string>()
		distances.set(start, 0)

		const getNeighbors = (nodeId: string): Array<{ id: string; distance: number }> => {
			const neighbors: Array<{ id: string; distance: number }> = []
			for (const link of this.state.worldMap?.links || []) {
				if (link.type !== linkType) {
					continue
				}
				if (link.fromId === nodeId) {
					neighbors.push({ id: link.toId, distance: this.resolveLinkDistance(link) })
				} else if (link.toId === nodeId) {
					neighbors.push({ id: link.fromId, distance: this.resolveLinkDistance(link) })
				}
			}
			return neighbors
		}

		while (visited.size < (this.state.worldMap?.nodes.length || 0)) {
			let current: string | null = null
			let currentDistance = Number.POSITIVE_INFINITY
			for (const [nodeId, distance] of distances.entries()) {
				if (visited.has(nodeId)) {
					continue
				}
				if (distance < currentDistance) {
					currentDistance = distance
					current = nodeId
				}
			}

			if (!current) {
				break
			}

			if (current === targetNodeId) {
				return currentDistance
			}

			visited.add(current)
			for (const neighbor of getNeighbors(current)) {
				if (visited.has(neighbor.id)) {
					continue
				}
				const nextDistance = currentDistance + neighbor.distance
				const existing = distances.get(neighbor.id)
				if (existing === undefined || nextDistance < existing) {
					distances.set(neighbor.id, nextDistance)
				}
			}
		}

		return 0
	}

	private resolveLinkDistance(link: WorldMapLink): number {
		if (typeof link.distance === 'number') {
			return link.distance
		}
		if (!this.state.worldMap) {
			return 0
		}
		const from = this.state.nodesById.get(link.fromId)
		const to = this.state.nodesById.get(link.toId)
		if (!from || !to) {
			return 0
		}
		const dx = from.position.x - to.position.x
		const dy = from.position.y - to.position.y
		return Math.hypot(dx, dy)
	}

	private isReachableByLinkType(targetNodeId: string, linkType: WorldMapLinkType): boolean {
		if (!this.state.worldMap) {
			return false
		}
		const start = this.state.worldMap.homeNodeId
		const queue: string[] = [start]
		const visited = new Set<string>([start])
		while (queue.length > 0) {
			const current = queue.shift()
			if (!current) {
				continue
			}
			if (current === targetNodeId) {
				return true
			}
			for (const link of this.state.worldMap.links) {
				if (link.type !== linkType) {
					continue
				}
				const neighbor = link.fromId === current
					? link.toId
					: link.toId === current
						? link.fromId
						: null
				if (!neighbor || visited.has(neighbor)) {
					continue
				}
				visited.add(neighbor)
				queue.push(neighbor)
			}
		}
		return false
	}

	private resolveTradeRouteType(definition?: BuildingDefinition | null): WorldMapLinkType | null {
		if (!definition) {
			return null
		}
		if (definition.tradeRouteType) {
			return definition.tradeRouteType
		}
		if (definition.isTradingPost) {
			return 'land'
		}
		return null
	}

	serialize(): TradeSnapshot {
		return this.state.serialize()
	}

	deserialize(state: TradeSnapshot): void {
		this.state.deserialize(state)
	}

	reset(): void {
		this.state.reset()
	}
}

export * from './TradeManagerState'
