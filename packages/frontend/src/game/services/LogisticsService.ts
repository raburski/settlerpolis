import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import type { LogisticsRequest } from '@rugged/game/Settlers/WorkProvider/types'
import { UiEvents } from '../uiEvents'

class LogisticsService {
	private requests: LogisticsRequest[] = []

	constructor() {
		EventBus.on(Event.Work.SC.LogisticsUpdated, (data: { requests: LogisticsRequest[] }) => {
			this.requests = data.requests || []
			EventBus.emit(UiEvents.Logistics.Updated, this.requests)
		})
	}

	public getRequests(): LogisticsRequest[] {
		return this.requests
	}
}

export const logisticsService = new LogisticsService()
