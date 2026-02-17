import { AffinityData, AffinitySentimentType, AffinitySentiments } from './types'
import type { AffinitySnapshot } from '../state/types'

export class AffinityState {
	public affinities: Map<string, AffinityData> = new Map()
	public npcWeights: Map<string, Partial<Record<AffinitySentimentType, number>>> = new Map()
	public simulationTimeMs = 0

	private getAffinityKey(playerId: string, npcId: string): string {
		return `${playerId}:${npcId}`
	}

	/* SETTERS / GETTERS */
	public loadAffinityWeights(affinityWeights: Record<string, AffinitySentiments>): void {
		Object.entries(affinityWeights).forEach(([npcId, weights]) => {
			this.npcWeights.set(npcId, weights)
		})
	}

	public getOrCreateAffinityData(playerId: string, npcId: string): AffinityData {
		const key = this.getAffinityKey(playerId, npcId)
		let affinityData = this.affinities.get(key)

		if (!affinityData) {
			const sentiments: Record<AffinitySentimentType, number> = {} as Record<AffinitySentimentType, number>
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

	/* SERIALISATION */
	public serialize(): AffinitySnapshot {
		return {
			affinities: Array.from(this.affinities.values()).map(affinity => ({
				...affinity,
				sentiments: { ...affinity.sentiments }
			})),
			simulationTimeMs: this.simulationTimeMs
		}
	}

	public deserialize(state: AffinitySnapshot): void {
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

	public reset(): void {
		this.affinities.clear()
		this.simulationTimeMs = 0
	}
}
