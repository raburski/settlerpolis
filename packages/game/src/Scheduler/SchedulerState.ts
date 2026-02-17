import type { ScheduledEvent } from './types'
import type { SchedulerSnapshot } from '../state/types'

export class SchedulerState {
	public scheduledEvents: Map<string, ScheduledEvent> = new Map()
	public simulationTimeMs = 0

	/* SERIALISATION */
	public serialize(): SchedulerSnapshot {
		return {
			events: Array.from(this.scheduledEvents.values()).map(event => ({
				...event,
				createdAt: { ...event.createdAt },
				nextRunAtSimMs: event.nextRunAtSimMs,
				lastRunAtSimMs: event.lastRunAtSimMs,
				lastRunAtGameTimeKey: event.lastRunAtGameTimeKey
			})),
			simulationTimeMs: this.simulationTimeMs
		}
	}

	public deserialize(state: SchedulerSnapshot): void {
		this.scheduledEvents.clear()
		for (const event of state.events) {
			this.scheduledEvents.set(event.id, {
				...event,
				createdAt: { ...event.createdAt }
			})
		}
		this.simulationTimeMs = state.simulationTimeMs
	}

	public reset(): void {
		this.scheduledEvents.clear()
		this.simulationTimeMs = 0
	}
}
