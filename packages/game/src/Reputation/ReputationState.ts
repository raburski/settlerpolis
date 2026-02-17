import type { PlayerId } from '../ids'
import type { ReputationSnapshot } from './types'

export class ReputationState {
	public reputationByPlayer: Map<PlayerId, number> = new Map()

	/* SETTERS / GETTERS */
	public addReputation(playerId: PlayerId, delta: number): number {
		const current = this.reputationByPlayer.get(playerId) || 0
		const next = current + delta
		this.reputationByPlayer.set(playerId, next)
		return next
	}

	public setReputation(playerId: PlayerId, value: number): number {
		this.reputationByPlayer.set(playerId, value)
		return value
	}

	public getReputation(playerId: PlayerId): number {
		return this.reputationByPlayer.get(playerId) || 0
	}

	/* SERIALISATION */
	public serialize(): ReputationSnapshot {
		return {
			reputation: Array.from(this.reputationByPlayer.entries())
		}
	}

	public deserialize(state: ReputationSnapshot): void {
		this.reputationByPlayer = new Map(state.reputation || [])
	}

	public reset(): void {
		this.reputationByPlayer.clear()
	}
}
