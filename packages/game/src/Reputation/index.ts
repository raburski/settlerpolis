import type { EventClient, EventManager } from '../events'
import { Event } from '../events'
import { ReputationEvents } from './events'
import { Receiver } from '../Receiver'
import type { ReputationSnapshot, ReputationUpdatedData } from './types'
import type { PlayerId } from '../ids'
import { ReputationState } from './ReputationState'

export * from './events'
export * from './types'
export * from './ReputationState'

export class ReputationManager {
	public state = new ReputationState()

	constructor(
		private event: EventManager
	) {
		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		this.event.on(Event.Players.CS.Join, this.handlePlayersCSJoin)
		this.event.on(ReputationEvents.CS.RequestState, this.handleReputationCSRequestState)
	}

	/* EVENT HANDLERS */
	private readonly handlePlayersCSJoin = (_data: unknown, client: EventClient): void => {
		this.sendReputation(client)
	}

	private readonly handleReputationCSRequestState = (_data: unknown, client: EventClient): void => {
		this.sendReputation(client)
	}

	/* METHODS */
	private sendReputation(client: EventClient): void {
		const reputation = this.getReputation(client.id)
		client.emit(Receiver.Sender, ReputationEvents.SC.Updated, {
			playerId: client.id,
			reputation
		} satisfies ReputationUpdatedData)
	}

	public addReputation(playerId: PlayerId, delta: number): number {
		const next = this.state.addReputation(playerId, delta)
		this.event.emit(Receiver.Client, ReputationEvents.SC.Updated, {
			playerId,
			reputation: next
		} satisfies ReputationUpdatedData, playerId)
		return next
	}

	public setReputation(playerId: PlayerId, value: number): number {
		const next = this.state.setReputation(playerId, value)
		this.event.emit(Receiver.Client, ReputationEvents.SC.Updated, {
			playerId,
			reputation: next
		} satisfies ReputationUpdatedData, playerId)
		return next
	}

	public getReputation(playerId: PlayerId): number {
		return this.state.getReputation(playerId)
	}

	public serialize(): ReputationSnapshot {
		return this.state.serialize()
	}

	public deserialize(state: ReputationSnapshot): void {
		this.state.deserialize(state)
	}

	reset(): void {
		this.state.reset()
	}
}
