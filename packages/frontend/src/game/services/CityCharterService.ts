import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import type { CityCharterStateData } from '@rugged/game'
import { UiEvents } from '../uiEvents'

type NotificationType = 'info' | 'warning' | 'success' | 'error'

class CityCharterServiceClass {
	private state: CityCharterStateData | null = null

	constructor() {
		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		const handleState = (data: CityCharterStateData) => {
			const previous = this.state
			this.state = data
			EventBus.emit(UiEvents.CityCharter.Updated, data)
			this.maybeNotify(previous, data)
		}

		EventBus.on(Event.CityCharter.SC.State, handleState)
		EventBus.on(Event.CityCharter.SC.Updated, handleState)
	}

	private maybeNotify(previous: CityCharterStateData | null, next: CityCharterStateData): void {
		if (!previous) {
			return
		}
		if (!previous.isEligibleForNext && next.isEligibleForNext && next.nextTier) {
			this.emitNotification(
				`Charter upgrade available: ${next.nextTier.name}`,
				'success'
			)
		}
		if (previous.currentTierRequirementsMet && !next.currentTierRequirementsMet) {
			this.emitNotification(
				`Charter buffs inactive: ${next.currentTier.name} requirements not met`,
				'warning'
			)
		}
		if (!previous.currentTierRequirementsMet && next.currentTierRequirementsMet) {
			this.emitNotification(
				`Charter buffs restored: ${next.currentTier.name}`,
				'success'
			)
		}
	}

	private emitNotification(message: string, type: NotificationType): void {
		EventBus.emit(UiEvents.Notifications.UiNotification, { message, type })
	}

	public getState(): CityCharterStateData | null {
		return this.state
	}

	public requestState(): void {
		EventBus.emit(Event.CityCharter.CS.RequestState, {})
	}

	public claimNextTier(): void {
		EventBus.emit(Event.CityCharter.CS.Claim, {})
	}
}

export const cityCharterService = new CityCharterServiceClass()
