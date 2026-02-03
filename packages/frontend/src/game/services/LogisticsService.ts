import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import type { LogisticsRequest } from '@rugged/game/Settlers/WorkProvider/types'
import { UiEvents } from '../uiEvents'

class LogisticsService {
	private requests: LogisticsRequest[] = []
	private itemPriorities: string[] = []

	constructor() {
		EventBus.on(Event.Work.SC.LogisticsUpdated, (data: { requests: LogisticsRequest[], itemPriorities?: string[] }) => {
			this.requests = data.requests || []
			if (Array.isArray(data.itemPriorities)) {
				this.itemPriorities = data.itemPriorities
			}
			EventBus.emit(UiEvents.Logistics.Updated, {
				requests: this.requests,
				itemPriorities: this.itemPriorities
			})
		})
	}

	public getRequests(): LogisticsRequest[] {
		return this.requests
	}

	public getItemPriorities(): string[] {
		return this.itemPriorities
	}

	public setItemPriorities(itemPriorities: string[]): void {
		const next = Array.from(new Set(itemPriorities.filter(Boolean)))
		this.itemPriorities = next
		EventBus.emit(Event.Work.CS.SetLogisticsPriorities, { itemPriorities: next })
		EventBus.emit(UiEvents.Logistics.Updated, {
			requests: this.requests,
			itemPriorities: this.itemPriorities
		})
	}
}

export const logisticsService = new LogisticsService()
