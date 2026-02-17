import { EventManager, Event, EventClient } from '../events'
import { AffinitySentimentType, AffinityData, AffinityUpdateEventData, AffinityUpdatedEventData, AffinityListEventData, AffinitySCUpdateEventData, AffinitySentiments } from './types'
import { AffinityEvents } from './events'
import { Receiver } from '../types'
import { getOverallNPCApproach } from './utils'
import { Logger } from '../Logs'
import { SimulationEvents } from '../Simulation/events'
import type { SimulationTickData } from '../Simulation/types'
import type { AffinitySnapshot } from '../state/types'

export class AffinityManager {
	private affinities: Map<string, AffinityData> = new Map()
	private npcWeights: Map<string, Partial<Record<AffinitySentimentType, number>>> = new Map()
	private simulationTimeMs = 0

	constructor(
		private event: EventManager,
		private logger: Logger
	) {
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		this.event.on(SimulationEvents.SS.Tick, this.handleSimulationSSTick)
		this.event.on(AffinityEvents.SS.Update, this.handleAffinitySSUpdate)
		this.event.on(Event.Players.CS.Connect, this.handlePlayersCSConnect)
	}

	/* EVENT HANDLERS */
	private readonly handleSimulationSSTick = (data: SimulationTickData): void => {
		this.simulationTimeMs = data.nowMs
	}

	private readonly handleAffinitySSUpdate = (data: AffinityUpdateEventData, client: EventClient): void => {
		const { playerId, npcId, sentimentType, set, add } = data

		if (set !== undefined) {
			this.setAffinityValue(playerId, npcId, sentimentType, set, client)
		} else if (add !== undefined) {
			this.changeAffinityValue(playerId, npcId, sentimentType, add, client)
		}
	}

	private readonly handlePlayersCSConnect = (_data: unknown, client: EventClient): void => {
		const listData = this.getAllNPCApproaches(client.id)
		client.emit(Receiver.Sender, AffinityEvents.SC.List, listData)
	}

	/* METHODS */
	public loadAffinityWeights(affinityWeights: Record<string, AffinitySentiments>) {
		// Load weights from content file into the private map
		Object.entries(affinityWeights).forEach(([npcId, weights]) => {
			this.npcWeights.set(npcId, weights)
		})
	}

	// Get the affinity key for a player-NPC pair
	private getAffinityKey(playerId: string, npcId: string): string {
		return `${playerId}:${npcId}`
	}

	// Get or create affinity data for a player-NPC pair
	private getOrCreateAffinityData(playerId: string, npcId: string): AffinityData {
		const key = this.getAffinityKey(playerId, npcId)
		let affinityData = this.affinities.get(key)

		if (!affinityData) {
			// Initialize with neutral values (0) for all sentiment types
			const sentiments: Record<AffinitySentimentType, number> = {} as Record<AffinitySentimentType, number>
			
			// Initialize all sentiment types with 0
			Object.values(AffinitySentimentType).forEach(type => {
				sentiments[type] = 0
			})

			affinityData = {
				playerId,
				npcId,
				sentiments,
				lastUpdated: this.simulationTimeMs
			}
			
			this.affinities.set(key, affinityData)
		}

		return affinityData
	}

	// Set a specific value for a sentiment type
	public setAffinityValue(playerId: string, npcId: string, sentimentType: AffinitySentimentType, value: number, client: EventClient): void {
		const affinityData = this.getOrCreateAffinityData(playerId, npcId)
		
		// Clamp value between -100 and 100
		const clampedValue = Math.max(-100, Math.min(100, value))
		
		affinityData.sentiments[sentimentType] = clampedValue
		affinityData.lastUpdated = this.simulationTimeMs
		
		const overallScore = this.calculateOverallScore(playerId, npcId)
		const approach = getOverallNPCApproach(affinityData.sentiments)
		
		// Emit SS update event
		client.emit(Receiver.All, AffinityEvents.SS.Updated, {
			playerId,
			npcId,
			sentimentType,
			value: clampedValue,
			overallScore
		} as AffinityUpdatedEventData)

		// Emit SC update event
		client.emit(Receiver.Sender, AffinityEvents.SC.Update, {
			npcId,
			approach
		} as AffinitySCUpdateEventData)
	}

	// Change a sentiment value by a specific amount
	public changeAffinityValue(playerId: string, npcId: string, sentimentType: AffinitySentimentType, change: number, client: EventClient): void {
		const affinityData = this.getOrCreateAffinityData(playerId, npcId)
		const currentValue = affinityData.sentiments[sentimentType]
		
		// Apply change and clamp between -100 and 100
		const newValue = Math.max(-100, Math.min(100, currentValue + change))
		
		affinityData.sentiments[sentimentType] = newValue
		affinityData.lastUpdated = this.simulationTimeMs
		
		const overallScore = this.calculateOverallScore(playerId, npcId)
		const approach = getOverallNPCApproach(affinityData.sentiments)
		
		// Emit SS update event
		client.emit(Receiver.All, AffinityEvents.SS.Updated, {
			playerId,
			npcId,
			sentimentType,
			value: newValue,
			overallScore
		} as AffinityUpdatedEventData)

		// Emit SC update event
		client.emit(Receiver.Sender, AffinityEvents.SC.Update, {
			npcId,
			approach
		} as AffinitySCUpdateEventData)
	}

	// Get the current value for a specific sentiment type
	public getAffinityValue(playerId: string, npcId: string, sentimentType: AffinitySentimentType): number {
		const affinityData = this.getOrCreateAffinityData(playerId, npcId)
		return affinityData.sentiments[sentimentType]
	}

	// Get all sentiment values for a player-NPC pair
	public getAllAffinityValues(playerId: string, npcId: string): Record<AffinitySentimentType, number> {
		const affinityData = this.getOrCreateAffinityData(playerId, npcId)
		return { ...affinityData.sentiments }
	}

	// Calculate the overall affinity score between a player and NPC
	public calculateOverallScore(playerId: string, npcId: string): number {
		const affinityData = this.getOrCreateAffinityData(playerId, npcId)
		return this.calculateOverallScoreFromData(affinityData)
	}

	// Internal method to calculate overall score from affinity data
	private calculateOverallScoreFromData(affinityData: AffinityData): number {
		const { sentiments } = affinityData
		const values = Object.values(sentiments)
		const sum = values.reduce((acc, val) => acc + val, 0)
		const maxPossibleSum = Object.keys(sentiments).length * 100
		// Normalize from -100 to 100 instead of 0 to 100
		return (sum / maxPossibleSum) * 200 - 100
	}

	// Get all NPCs that a player has affinity with
	public getPlayerNPCs(playerId: string): string[] {
		const npcIds: string[] = []
		
		this.affinities.forEach((data, key) => {
			if (data.playerId === playerId) {
				npcIds.push(data.npcId)
			}
		})
		
		return npcIds
	}

	// Get all players that an NPC has affinity with
	public getNPCPlayers(npcId: string): string[] {
		const playerIds: string[] = []
		
		this.affinities.forEach((data, key) => {
			if (data.npcId === npcId) {
				playerIds.push(data.playerId)
			}
		})
		
		return playerIds
	}

	// Get all NPCs and their approaches for a player
	public getAllNPCApproaches(playerId: string): AffinityListEventData {
		const affinities: AffinityListEventData['affinities'] = []
		
		// Get all unique NPCs for this player
		const npcIds = new Set<string>()
		this.affinities.forEach((data, key) => {
			if (data.playerId === playerId) {
				npcIds.add(data.npcId)
			}
		})
		
		// Get approach for each NPC
		npcIds.forEach(npcId => {
			const sentiments = this.getAllAffinityValues(playerId, npcId)
			const approach = getOverallNPCApproach(sentiments)
			affinities.push({ npcId, approach })
		})
		
		return { affinities }
	}

	serialize(): AffinitySnapshot {
		return {
			affinities: Array.from(this.affinities.values()).map(affinity => ({
				...affinity,
				sentiments: { ...affinity.sentiments }
			})),
			simulationTimeMs: this.simulationTimeMs
		}
	}

	deserialize(state: AffinitySnapshot): void {
		this.affinities.clear()
		for (const affinity of state.affinities) {
			const key = this.getAffinityKey(affinity.playerId, affinity.npcId)
			this.affinities.set(key, {
				...affinity,
				sentiments: { ...affinity.sentiments }
			})
		}
		this.simulationTimeMs = state.simulationTimeMs
	}

	reset(): void {
		this.affinities.clear()
		this.simulationTimeMs = 0
	}
}
