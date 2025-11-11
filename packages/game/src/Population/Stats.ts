import { EventManager, Event, EventClient } from '../events'
import { PopulationEvents } from './events'
import { Receiver } from '../Receiver'
import { Settler, PopulationStatsData, PopulationListData, ProfessionType, SettlerState, RequestListData } from './types'
import { PlayerJoinData, PlayerTransitionData } from '../Players/types'

type SettlersGetter = (mapName: string, playerId: string) => Settler[]

export class PopulationStats {
	constructor(
		private event: EventManager,
		private getSettlers: SettlersGetter
	) {}

	/**
	 * Calculate population statistics from a list of settlers
	 */
	public calculate(settlers: Settler[]): PopulationStatsData {
		const byProfession: Record<ProfessionType, number> = {
			[ProfessionType.Carrier]: 0,
			[ProfessionType.Builder]: 0,
			[ProfessionType.Woodcutter]: 0,
			[ProfessionType.Miner]: 0
		}

		let idleCount = 0
		let workingCount = 0

		settlers.forEach(settler => {
			byProfession[settler.profession] = (byProfession[settler.profession] || 0) + 1

			if (settler.state === SettlerState.Idle) {
				idleCount++
			} else if (settler.state === SettlerState.Working) {
				workingCount++
			}
		})

		return {
			totalCount: settlers.length,
			byProfession,
			idleCount,
			workingCount
		}
	}

	/**
	 * Send population list to client (full state: settlers + statistics)
	 */
	public sendPopulationList(client: EventClient, mapName: string): void {
		// 1. Get all settlers for player and map
		const settlers = this.getSettlers(mapName, client.id)

		// 2. Calculate statistics (totalCount, byProfession, idleCount, workingCount)
		const stats = this.calculate(settlers)

		// 3. Emit sc:population:list with PopulationListData (settlers array + statistics)
		const listData: PopulationListData = {
			settlers,
			...stats
		}

		client.emit(Receiver.Sender, PopulationEvents.SC.List, listData)
	}

	/**
	 * Emit population statistics update (stats only, no settlers list)
	 */
	public emitPopulationStatsUpdate(client: EventClient, mapName: string): void {
		// 1. Get all settlers for player and map
		const settlers = this.getSettlers(mapName, client.id)

		// 2. Calculate statistics only (totalCount, byProfession, idleCount, workingCount)
		const stats = this.calculate(settlers)

		// 3. Emit sc:population:stats-updated with PopulationStatsData (statistics only)
		// Use event.emit to send to all clients in the group (map)
		this.event.emit(Receiver.Group, PopulationEvents.SC.StatsUpdated, stats, mapName)
	}

	/**
	 * Setup event handlers related to population stats
	 */
	public setupEventHandlers(): void {
		// Handle player join event (with map data) - this is the primary handler
		this.event.on<PlayerJoinData>(Event.Players.CS.Join, (data, client) => {
			if (data.mapId) {
				this.sendPopulationList(client, data.mapId)
			}
		})

		// Handle player transition
		this.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, (data, client) => {
			if (data.mapId) {
				this.sendPopulationList(client, data.mapId)
			}
		})

		// Handle request list event
		this.event.on<RequestListData>(PopulationEvents.CS.RequestList, (data, client) => {
			const mapName = (client as any).currentGroup
			if (mapName) {
				this.sendPopulationList(client, mapName)
			}
		})
	}
}

