import type { CityCharterTier } from './types'
import type { CityCharterSnapshot } from '../state/types'
import type { MapId, PlayerId } from '../ids'

export type CityCharterState = {
	playerId: PlayerId
	mapId: MapId
	currentTierId: string
	claimedTierIds: string[]
	unlockedFlags: string[]
	currentTierRequirementsMet: boolean
	buffsActive: boolean
	isEligibleForNext: boolean
}

export class CityCharterManagerState {
	public tiers: CityCharterTier[] = []
	public tiersById = new Map<string, CityCharterTier>()
	public defaultTierId: string | null = null
	public states = new Map<string, CityCharterState>()

	private getStateKey(playerId: PlayerId, mapId: MapId): string {
		return `${playerId}:${mapId}`
	}

	public serialize(): CityCharterSnapshot {
		return {
			states: Array.from(this.states.values()).map(state => ({
				playerId: state.playerId,
				mapId: state.mapId,
				currentTierId: state.currentTierId,
				claimedTierIds: [...state.claimedTierIds],
				unlockedFlags: [...state.unlockedFlags]
			}))
		}
	}

	public deserialize(snapshot: CityCharterSnapshot): void {
		this.states.clear()
		for (const entry of snapshot.states) {
			const state: CityCharterState = {
				playerId: entry.playerId,
				mapId: entry.mapId,
				currentTierId: entry.currentTierId,
				claimedTierIds: [...entry.claimedTierIds],
				unlockedFlags: [...entry.unlockedFlags],
				currentTierRequirementsMet: true,
				buffsActive: true,
				isEligibleForNext: false
			}
			this.states.set(this.getStateKey(entry.playerId, entry.mapId), state)
		}
	}

	public reset(): void {
		this.states.clear()
	}
}
