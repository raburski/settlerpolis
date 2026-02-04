import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import { UiEvents } from '../uiEvents'

class ReputationService {
	private reputationByPlayer = new Map<string, number>()

	constructor() {
		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		EventBus.on(Event.Reputation.SC.Updated, (data: { playerId: string; reputation: number }) => {
			if (!data?.playerId) return
			this.reputationByPlayer.set(data.playerId, data.reputation)
			this.emitUpdate()
		})
	}

	private emitUpdate(): void {
		EventBus.emit(UiEvents.Reputation.Updated, {
			reputationByPlayer: new Map(this.reputationByPlayer)
		})
	}

	public requestState(): void {
		EventBus.emit(Event.Reputation.CS.RequestState, {})
	}

	public getReputation(playerId?: string): number {
		if (playerId) {
			return this.reputationByPlayer.get(playerId) || 0
		}
		const first = Array.from(this.reputationByPlayer.values())[0]
		return first || 0
	}
}

export const reputationService = new ReputationService()
