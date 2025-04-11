import { EventManager, EventClient } from '../../events'
import { ScheduledEvent, ScheduleOptions } from './types'
import { SchedulerEvents } from './events'
import { defaultSchedules } from './content'
import { CronExpressionParser } from 'cron-parser'
import { v4 as uuidv4 } from 'uuid'
import { Receiver } from "../../Receiver"

export class Scheduler {
	private scheduledEvents: Map<string, ScheduledEvent> = new Map()
	private timeouts: Map<string, NodeJS.Timeout> = new Map()

	constructor(
		private event: EventManager,
		schedules: ScheduleOptions[] = defaultSchedules
	) {
		// // Clean up intervals on process exit
		// process.on('SIGINT', () => this.cleanup())
		// process.on('SIGTERM', () => this.cleanup())

		// Load provided schedules or defaults
		this.loadSchedules(schedules)
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		// Handle external schedule requests
		this.event.on(SchedulerEvents.SS.Schedule, (data: ScheduleOptions) => {
			this.schedule(data)
		})

		// Handle external cancel requests
		this.event.on(SchedulerEvents.SS.Cancel, (data: { id: string }) => {
			this.cancel(data.id)
		})
	}

	loadSchedules(schedules: ScheduleOptions[]): string[] {
		const scheduledIds: string[] = []
		
		for (const schedule of schedules) {
			const id = this.schedule(schedule)
			scheduledIds.push(id)
		}

		return scheduledIds
	}

	schedule(options: ScheduleOptions): string {
		const id = options.id || uuidv4()
		const scheduledEvent: ScheduledEvent = {
			...options,
			id,
			isActive: true,
			lastRun: undefined,
			nextRun: this.calculateNextRun(options.schedule)
		}

		this.scheduledEvents.set(id, scheduledEvent)
		this.scheduleNext(scheduledEvent)

		this.event.emit(Receiver.All, SchedulerEvents.SS.Scheduled, {
			eventId: id,
			schedule: options.schedule
		})

		return id
	}

	cancel(eventId: string): boolean {
		const event = this.scheduledEvents.get(eventId)
		if (!event) return false

		event.isActive = false
		this.clearTimeout(eventId)
		this.scheduledEvents.delete(eventId)

		this.event.emit(Receiver.All, SchedulerEvents.SS.Cancelled, { eventId })
		return true
	}

	private scheduleNext(scheduledEvent: ScheduledEvent) {
		if (!scheduledEvent.isActive) return

		const now = Date.now()
		const nextRun = scheduledEvent.nextRun?.getTime() || now

		if (nextRun <= now) {
			this.executeEvent(scheduledEvent)
			return
		}

		const timeout = setTimeout(() => {
			this.executeEvent(scheduledEvent)
		}, nextRun - now)

		this.timeouts.set(scheduledEvent.id, timeout)
	}

	private executeEvent(scheduledEvent: ScheduledEvent) {
		if (!scheduledEvent.isActive) return

		this.event.emit(Receiver.All, scheduledEvent.eventType, scheduledEvent.payload)
		this.event.emit(Receiver.All, SchedulerEvents.SS.Triggered, {
			eventId: scheduledEvent.id,
			eventType: scheduledEvent.eventType
		})

		scheduledEvent.lastRun = new Date()

		if (scheduledEvent.schedule.type === 'once') {
			this.cancel(scheduledEvent.id)
			return
		}

		scheduledEvent.nextRun = this.calculateNextRun(scheduledEvent.schedule)
		this.scheduleNext(scheduledEvent)
	}

	private calculateNextRun(schedule: ScheduleOptions['schedule']): Date {
		const now = new Date()

		switch (schedule.type) {
			case 'interval':
				return new Date(now.getTime() + Number(schedule.value))
				
			case 'cron':
				const interval = CronExpressionParser.parse(schedule.value as string)
				return interval.next().toDate()
				
			case 'once':
				return new Date(Number(schedule.value))
				
			default:
				throw new Error('Invalid schedule type')
		}
	}

	private clearTimeout(eventId: string) {
		const timeout = this.timeouts.get(eventId)
		if (timeout) {
			clearTimeout(timeout)
			this.timeouts.delete(eventId)
		}
	}

	private cleanup() {
		for (const [eventId] of this.timeouts) {
			this.cancel(eventId)
		}
	}
} 