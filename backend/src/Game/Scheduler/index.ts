import { EventManager, EventClient } from '../../events'
import { ScheduledEvent, ScheduleOptions, ScheduleType } from './types'
import { SchedulerEvents } from './events'
import { WorldManager } from '../World'
import { WorldEvents } from '../World/events'
import { WorldTimeUpdateEventData } from '../World/types'
import { WorldTime } from '../World/types'
import { CronExpressionParser } from 'cron-parser'
import { v4 as uuidv4 } from 'uuid'
import { Receiver } from "../../Receiver"
import { defaultSchedules } from "./content"

export class Scheduler {
	private scheduledEvents: Map<string, ScheduledEvent> = new Map()
	private timeouts: Map<string, NodeJS.Timeout> = new Map()
	private worldManager: WorldManager

	constructor(
		private event: EventManager,
		worldManager: WorldManager,
		schedules: ScheduleOptions[] = defaultSchedules
	) {
		this.worldManager = worldManager
		this.setupEventHandlers()
		this.loadSchedules(schedules)
	}

	private setupEventHandlers() {
		// Handle schedule requests
		this.event.on(SchedulerEvents.SS.Schedule, (data: ScheduleOptions, client: EventClient) => {
			this.schedule(data, client)
		})

		// Handle cancel requests
		this.event.on(SchedulerEvents.SS.Cancel, (data: { id: string }, client: EventClient) => {
			this.cancel(data.id, client)
		})

		// Handle time updates from WorldManager
		this.event.on(WorldEvents.SC.Updated, (data: WorldTimeUpdateEventData) => {
			this.checkGameTimeEvents(data.time)
		})
	}

	public loadSchedules(schedules: ScheduleOptions[]): string[] {
		const scheduledIds: string[] = []
		
		for (const schedule of schedules) {
			const id = this.schedule(schedule, null as any) // We use null as client since this is initialization
			scheduledIds.push(id)
		}

		return scheduledIds
	}

	private checkGameTimeEvents(currentTime: WorldTime) {
		for (const [id, event] of this.scheduledEvents) {
			if (event.schedule.type === ScheduleType.GameTime && event.isActive) {
				const [targetHours, targetMinutes] = (event.schedule.value as string).split(':').map(Number)
				const { day, month, year } = event.schedule

				// Check if the specified date matches (if provided)
				if (day && day !== currentTime.day) continue
				if (month && month !== currentTime.month) continue
				if (year && year !== currentTime.year) continue

				// Check if the time matches
				if (currentTime.hours === targetHours && currentTime.minutes === targetMinutes) {
					this.executeEvent(event)
				}
			}
		}
	}

	private calculateNextRun(event: ScheduledEvent): Date {
		const now = new Date()

		switch (event.schedule.type) {
			case ScheduleType.Interval:
				return new Date(now.getTime() + (event.schedule.value as number))
			case ScheduleType.Cron:
				const interval = CronExpressionParser.parse(event.schedule.value as string)
				return interval.next().toDate()
			case ScheduleType.Once:
				return new Date(event.schedule.value as number)
			case ScheduleType.GameTime:
				// For game-time events, we don't need to calculate next run
				// as they are handled by checkGameTimeEvents
				return now
			default:
				throw new Error(`Unsupported schedule type: ${event.schedule.type}`)
		}
	}

	private schedule(options: ScheduleOptions, client: EventClient): string {
		const id = options.id || uuidv4()
		const event: ScheduledEvent = {
			id,
			eventType: options.eventType,
			payload: options.payload,
			schedule: options.schedule,
			isActive: true
		}

		// Calculate next run time
		event.nextRun = this.calculateNextRun(event)

		// Store the event
		this.scheduledEvents.set(id, event)

		// Set up timeout for non-game-time events
		if (event.schedule.type !== ScheduleType.GameTime) {
			const timeout = setTimeout(() => {
				this.executeEvent(event)
			}, event.nextRun.getTime() - Date.now())

			this.timeouts.set(id, timeout)
		}

		// Notify client if provided
		if (client) {
			client.emit(Receiver.Sender, SchedulerEvents.SS.Scheduled, {
				id,
				eventType: event.eventType,
				nextRun: event.nextRun
			})
		}

		return id
	}

	private executeEvent(event: ScheduledEvent): void {
		// Emit the scheduled event
		this.event.emit(Receiver.All, event.eventType, event.payload)

		// Update last run time
		event.lastRun = new Date()

		// Handle recurring events
		if (event.schedule.type === ScheduleType.Interval || event.schedule.type === ScheduleType.Cron) {
			event.nextRun = this.calculateNextRun(event)
			const timeout = setTimeout(() => {
				this.executeEvent(event)
			}, event.nextRun.getTime() - Date.now())
			this.timeouts.set(event.id, timeout)
		} else if (event.schedule.type === ScheduleType.Once) {
			// Remove one-time events after execution
			this.scheduledEvents.delete(event.id)
			this.timeouts.delete(event.id)
		}
	}

	private cancel(id: string, client: EventClient): void {
		const event = this.scheduledEvents.get(id)
		if (!event) {
			client.emit(Receiver.Sender, SchedulerEvents.SS.Cancelled, {
				success: false,
				error: 'Event not found'
			})
			return
		}

		// Clear timeout if exists
		const timeout = this.timeouts.get(id)
		if (timeout) {
			clearTimeout(timeout)
			this.timeouts.delete(id)
		}

		// Mark event as inactive
		event.isActive = false
		this.scheduledEvents.set(id, event)

		// Notify client
		client.emit(Receiver.Sender, SchedulerEvents.SS.Cancelled, {
			success: true,
			id
		})
	}

	public getScheduledEvents(): ScheduledEvent[] {
		return Array.from(this.scheduledEvents.values())
	}

	public getEventById(id: string): ScheduledEvent | undefined {
		return this.scheduledEvents.get(id)
	}
} 