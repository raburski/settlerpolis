import type { EventClient, EventManager } from '../events'
import { Event } from '../events'
import { ReputationEvents } from './events'
import { Receiver } from '../Receiver'
import type { ReputationSnapshot, ReputationUpdatedData } from './types'
import type { PlayerId } from '../ids'

export * from './events'
export * from './types'

export class ReputationManager {
	private reputationByPlayer = new Map<PlayerId, number>()

	constructor(
		private event: EventManager
	) {
		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		this.event.on(Event.Players.CS.Join, (_data, client) => {
			this.sendReputation(client)
		})

		this.event.on(ReputationEvents.CS.RequestState, (_data, client) => {
			this.sendReputation(client)
		})
	}

	private sendReputation(client: EventClient): void {
		const reputation = this.getReputation(client.id)
		client.emit(Receiver.Sender, ReputationEvents.SC.Updated, {
			playerId: client.id,
			reputation
		} satisfies ReputationUpdatedData)
	}

	public addReputation(playerId: PlayerId, delta: number): number {
		const current = this.reputationByPlayer.get(playerId) || 0
		const next = current + delta
		this.reputationByPlayer.set(playerId, next)
		this.event.emit(Receiver.Client, ReputationEvents.SC.Updated, {
			playerId,
			reputation: next
		} satisfies ReputationUpdatedData, playerId)
		return next
	}

	public setReputation(playerId: PlayerId, value: number): number {
		this.reputationByPlayer.set(playerId, value)
		this.event.emit(Receiver.Client, ReputationEvents.SC.Updated, {
			playerId,
			reputation: value
		} satisfies ReputationUpdatedData, playerId)
		return value
	}

	public getReputation(playerId: PlayerId): number {
		return this.reputationByPlayer.get(playerId) || 0
	}

	public serialize(): ReputationSnapshot {
		return {
			reputation: Array.from(this.reputationByPlayer.entries())
		}
	}

	public deserialize(state: ReputationSnapshot): void {
		this.reputationByPlayer = new Map(state.reputation || [])
	}

	reset(): void {
		this.reputationByPlayer.clear()
	}
}
