import { EventManager, Event, EventClient } from '../../events'
import { AffinitySentimentType, AffinityData, AffinityUpdateEventData, AffinityUpdatedEventData } from './types'
import { AffinityEvents } from './events'
import { Receiver } from '../../Receiver'
import { NPCSentimentWeights } from './content'

export class AffinityManager {
	private affinities: Map<string, AffinityData> = new Map()
	private npcWeights: Map<string, Partial<Record<AffinitySentimentType, number>>> = new Map()

	constructor(
		private event: EventManager
	) {
		this.loadAffinityWeights()
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		// Handle affinity update requests
		this.event.on(AffinityEvents.SS.Update, (data: AffinityUpdateEventData, client: EventClient) => {
			const { playerId, npcId, sentimentType, set, add } = data
			
			if (set !== undefined) {
				this.setAffinityValue(playerId, npcId, sentimentType, set, client)
			} else if (add !== undefined) {
				this.changeAffinityValue(playerId, npcId, sentimentType, add, client)
			}
		})
	}

	private loadAffinityWeights() {
		// Load weights from content file into the private map
		Object.entries(NPCSentimentWeights).forEach(([npcId, weights]) => {
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
				lastUpdated: Date.now()
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
		affinityData.lastUpdated = Date.now()
		
		// Emit update event
		client.emit(Receiver.All, AffinityEvents.SS.Updated, {
			playerId,
			npcId,
			sentimentType,
			value: clampedValue,
			overallScore: this.calculateOverallScore(playerId, npcId)
		} as AffinityUpdatedEventData)
	}

	// Change a sentiment value by a specific amount
	public changeAffinityValue(playerId: string, npcId: string, sentimentType: AffinitySentimentType, change: number, client: EventClient): void {
		const affinityData = this.getOrCreateAffinityData(playerId, npcId)
		const currentValue = affinityData.sentiments[sentimentType]
		
		// Apply change and clamp between -100 and 100
		const newValue = Math.max(-100, Math.min(100, currentValue + change))
		
		affinityData.sentiments[sentimentType] = newValue
		affinityData.lastUpdated = Date.now()
		
		// Emit update event
		client.emit(Receiver.All, AffinityEvents.SS.Updated, {
			playerId,
			npcId,
			sentimentType,
			value: newValue,
			overallScore: this.calculateOverallScore(playerId, npcId)
		} as AffinityUpdatedEventData)
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
		const weights = this.npcWeights.get(affinityData.npcId)
		if (!weights) {
			// If no weights defined, use equal weights for all sentiments
			const sum = Object.values(affinityData.sentiments).reduce((total, value) => total + value, 0)
			const maxPossibleSum = Object.keys(affinityData.sentiments).length * 100
			return Math.round(((sum + maxPossibleSum) / (2 * maxPossibleSum)) * 100)
		}

		// Calculate weighted sum
		let weightedSum = 0
		let totalWeight = 0

		Object.entries(affinityData.sentiments).forEach(([sentimentType, value]) => {
			const weight = weights[sentimentType as AffinitySentimentType] || 1
			weightedSum += value * weight
			totalWeight += weight
		})

		// Normalize to 0-100 scale
		const maxPossibleWeightedSum = totalWeight * 100
		return Math.round(((weightedSum + maxPossibleWeightedSum) / (2 * maxPossibleWeightedSum)) * 100)
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
} 