import { EventManager, EventClient } from '../events'
import { ScheduledEvent, ScheduleOptions, ScheduleType } from './types'
import { SchedulerEvents } from './events'
import type { TimeManager } from '../Time'
import { Time, DAYS_IN_MONTH, MONTHS_IN_YEAR } from '../Time/types'
import { CronExpressionParser } from 'cron-parser'
import { v4 as uuidv4 } from 'uuid'
import { Receiver } from "../Receiver"
import type { ConditionEffectManager } from '../ConditionEffect'
import { Logger } from '../Logs'
import { BaseManager } from '../Managers'
import { SimulationEvents } from '../Simulation/events'
import type { SimulationTickData } from '../Simulation/types'
import type { SchedulerSnapshot } from '../state/types'

export interface SchedulerDeps {
	event: EventManager
	time: TimeManager
	conditionEffect: ConditionEffectManager
}

export class Scheduler extends BaseManager<SchedulerDeps> {
	private scheduledEvents: Map<string, ScheduledEvent> = new Map()
	private simulationTimeMs = 0

	constructor(
		managers: SchedulerDeps,
		private logger: Logger
	) {
		super(managers)
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		this.managers.event.on(SchedulerEvents.SS.Schedule, this.handleSchedulerSSSchedule)
		this.managers.event.on(SchedulerEvents.SS.Cancel, this.handleSchedulerSSCancel)
		this.managers.event.on(SchedulerEvents.SS.Enable, this.handleSchedulerSSEnable)
		this.managers.event.on(SchedulerEvents.SS.Disable, this.handleSchedulerSSDisable)
		this.managers.event.on(SimulationEvents.SS.Tick, this.handleSimulationSSTick)
	}

	/* EVENT HANDLERS */
	private readonly handleSimulationSSTick = (data: SimulationTickData): void => {
		this.handleSimulationTick(data)
	}

	private readonly handleSchedulerSSSchedule = (data: ScheduleOptions, client: EventClient): void => {
		this.schedule(data, client)
	}

	private readonly handleSchedulerSSCancel = (data: { id: string }, client: EventClient): void => {
		this.cancel(data.id, client)
	}

	private readonly handleSchedulerSSEnable = (data: { id: string }, client: EventClient): void => {
		this.enableEvent(data.id, client)
	}

	private readonly handleSchedulerSSDisable = (data: { id: string }, client: EventClient): void => {
		this.disableEvent(data.id, client)
	}

	private handleSimulationTick(data: SimulationTickData) {
		this.simulationTimeMs = data.nowMs
		this.processDueEvents()
	}

	/* METHODS */
	public loadSchedules(schedules: ScheduleOptions[]): string[] {
		const scheduledIds: string[] = []

		// Create a system client for initialization
		const systemClient: EventClient = {
			id: 'system-init',
			currentGroup: 'GLOBAL',
			emit: (to: Receiver, event: string, data: any, targetClientId?: string) => {
				this.managers.event.emit(to, event, data, targetClientId)
			},
			setGroup: (group: string) => {
				// No-op for system client
			}
		}

		for (const schedule of schedules) {
			const id = this.schedule(schedule, systemClient)
			scheduledIds.push(id)
		}

		return scheduledIds
	}

	private processDueEvents() {
		const currentTime = this.managers.time.getCurrentTime()
		const currentKey = this.getGameTimeKey(currentTime)
		const toExecute: ScheduledEvent[] = []

		for (const event of this.scheduledEvents.values()) {
			if (!event.isActive) continue

			if (event.schedule.type === ScheduleType.GameTime) {
				if (this.shouldTriggerGameTimeEvent(event, currentTime, currentKey)) {
					toExecute.push(event)
				}
				continue
			}

			if (event.nextRunAtSimMs !== undefined && this.simulationTimeMs >= event.nextRunAtSimMs) {
				toExecute.push(event)
			}
		}

		for (const event of toExecute) {
			this.executeEvent(event, currentKey)
		}
	}

	private shouldTriggerGameTimeEvent(event: ScheduledEvent, currentTime: Time, currentKey: string): boolean {
		const [targetHours, targetMinutes] = (event.schedule.value as string).split(':').map(Number)
		const { day, month, year } = event.schedule

		if (day && day !== currentTime.day) return false
		if (month && month !== currentTime.month) return false
		if (year && year !== currentTime.year) return false

		if (currentTime.hours !== targetHours || currentTime.minutes !== targetMinutes) {
			return false
		}

		return event.lastRunAtGameTimeKey !== currentKey
	}

	private getGameTimeKey(time: Time): string {
		const hours = time.hours.toString().padStart(2, '0')
		const minutes = time.minutes.toString().padStart(2, '0')
		return `${time.year}-${time.month}-${time.day} ${hours}:${minutes}`
	}

	private getGameMinutes(time: Time): number {
		const months = (time.year - 1) * MONTHS_IN_YEAR + (time.month - 1)
		const days = months * DAYS_IN_MONTH + (time.day - 1)
		return (days * 24 * 60) + (time.hours * 60) + time.minutes
	}

	private getCronNextRunAtSimMs(event: ScheduledEvent): number | undefined {
		const value = event.schedule.value
		if (typeof value !== 'string') {
			return undefined
		}

		const baseMinutes = this.getGameMinutes(this.managers.time.getCurrentTime())
		const baseDate = new Date(Date.UTC(2000, 0, 1, 0, 0, 0) + baseMinutes * 60 * 1000)
		const interval = CronExpressionParser.parse(value, { currentDate: baseDate })
		const nextDate = interval.next().toDate()
		const diffMinutes = Math.max(1, Math.ceil((nextDate.getTime() - baseDate.getTime()) / (60 * 1000)))
		const timeSpeed = this.managers.time.getTimeSpeed()
		return this.simulationTimeMs + diffMinutes * timeSpeed
	}

	private calculateNextRunAtSimMs(event: ScheduledEvent): number | undefined {
		switch (event.schedule.type) {
			case ScheduleType.Interval:
				return this.simulationTimeMs + (event.schedule.value as number)
			case ScheduleType.Cron:
				return this.getCronNextRunAtSimMs(event)
			case ScheduleType.Once: {
				const value = event.schedule.value as number
				if (value >= this.simulationTimeMs) {
					return value
				}
				return this.simulationTimeMs + value
			}
			case ScheduleType.GameTime:
				return undefined
			default:
				throw new Error(`Unsupported schedule type: ${event.schedule.type}`)
		}
	}

	private schedule(options: ScheduleOptions, client: EventClient): string {
		const id = options.id || uuidv4()
		const event: ScheduledEvent = {
			id,
			schedule: options.schedule,
			isActive: true, // Events are active by default
			createdAt: this.managers.time.getCurrentTime(),
			condition: options.condition,
			conditions: options.conditions,
			effect: options.effect,
			effects: options.effects
		}

		// Store the event
		this.scheduledEvents.set(id, event)

		// Calculate next run time for sim-time schedules
		if (event.schedule.type !== ScheduleType.GameTime) {
			event.nextRunAtSimMs = this.calculateNextRunAtSimMs(event)
		}

		// Notify client if provided
		if (client) {
			client.emit(Receiver.Sender, SchedulerEvents.SS.Scheduled, {
				id,
				nextRunAtSimMs: event.nextRunAtSimMs,
				isActive: event.isActive
			})
		}

		return id
	}

	private executeEvent(event: ScheduledEvent, gameTimeKey?: string): void {
		// Skip execution if the event is not active
		if (!event.isActive) return;
		
		// Create a proper mock client that implements the EventClient interface
		const mockClient: EventClient = {
			id: 'system-scheduler',
			currentGroup: 'GLOBAL',
			emit: (to: Receiver, event: string, data: any, targetClientId?: string) => {
				this.managers.event.emit(to, event, data, targetClientId)
			},
			setGroup: (group: string) => {
				// No-op for mock client
			}
		};
		
		// Check single condition if present
		if (event.condition && !this.managers.conditionEffect.checkCondition(event.condition, mockClient)) {
			this.logger.debug(`Scheduled event ${event.id} condition not met, skipping execution`)
			// Schedule next execution for recurring events
			if (this.isRecurringEvent(event)) {
				event.nextRunAtSimMs = this.calculateNextRunAtSimMs(event)
			}
			return;
		}
		
		// Check multiple conditions if present
		if (event.conditions && event.conditions.length > 0) {
			const allConditionsMet = event.conditions.every(condition => 
				this.managers.conditionEffect.checkCondition(condition, mockClient)
			);
			
			if (!allConditionsMet) {
				this.logger.debug(`Scheduled event ${event.id} conditions not met, skipping execution`)
				// Schedule next execution for recurring events
				if (this.isRecurringEvent(event)) {
					event.nextRunAtSimMs = this.calculateNextRunAtSimMs(event)
				}
				return;
			}
		}

		// Update last run time
		event.lastRunAtSimMs = this.simulationTimeMs
		if (event.schedule.type === ScheduleType.GameTime && gameTimeKey) {
			event.lastRunAtGameTimeKey = gameTimeKey
		}

		// Apply single effect if present
		if (event.effect) {
			this.managers.conditionEffect.applyEffect(event.effect, mockClient)
		}
		
		// Apply multiple effects if present
		if (event.effects && event.effects.length > 0) {
			event.effects.forEach(effect => {
				this.managers.conditionEffect.applyEffect(effect, mockClient)
			});
		}

		// Handle recurring events
		if (this.isRecurringEvent(event)) {
			event.nextRunAtSimMs = this.calculateNextRunAtSimMs(event)
		} else if (event.schedule.type === ScheduleType.Once) {
			// Remove one-time events after execution
			this.scheduledEvents.delete(event.id)
		}
	}
	
	/**
	 * Check if an event is recurring (interval or cron)
	 */
	private isRecurringEvent(event: ScheduledEvent): boolean {
		return (
			event.schedule.type === ScheduleType.Interval || 
			event.schedule.type === ScheduleType.Cron
		);
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

		// Remove the event 
		this.scheduledEvents.delete(id)

		// Notify client
		client.emit(Receiver.Sender, SchedulerEvents.SS.Cancelled, {
			success: true,
			id
		})
	}
	
	private enableEvent(id: string, client: EventClient): void {
		const event = this.scheduledEvents.get(id)
		if (!event) {
			client.emit(Receiver.Sender, SchedulerEvents.SS.Enable, {
				success: false,
				error: 'Event not found',
				id
			})
			return
		}
		
		// Only do something if the event is currently inactive
		if (!event.isActive) {
			// Mark event as active
			event.isActive = true
			
			// Recalculate next run time if needed
			if (event.schedule.type !== ScheduleType.GameTime) {
				event.nextRunAtSimMs = this.calculateNextRunAtSimMs(event)
			}
			
			// Update the event
			this.scheduledEvents.set(id, event)
		}
		
		// Notify client
		client.emit(Receiver.Sender, SchedulerEvents.SS.Enable, {
			success: true,
			id,
			nextRunAtSimMs: event.nextRunAtSimMs
		})
	}
	
	private disableEvent(id: string, client: EventClient): void {
		const event = this.scheduledEvents.get(id)
		if (!event) {
			client.emit(Receiver.Sender, SchedulerEvents.SS.Disable, {
				success: false,
				error: 'Event not found',
				id
			})
			return
		}
		
		// Only do something if the event is currently active
		if (event.isActive) {
			// Mark event as inactive
			event.isActive = false
			
			// Update the event
			this.scheduledEvents.set(id, event)
		}
		
		// Notify client
		client.emit(Receiver.Sender, SchedulerEvents.SS.Disable, {
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

	serialize(): SchedulerSnapshot {
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

	deserialize(state: SchedulerSnapshot): void {
		this.scheduledEvents.clear()
		for (const event of state.events) {
			this.scheduledEvents.set(event.id, {
				...event,
				createdAt: { ...event.createdAt }
			})
		}
		this.simulationTimeMs = state.simulationTimeMs
	}

	reset(): void {
		this.scheduledEvents.clear()
		this.simulationTimeMs = 0
	}
}
