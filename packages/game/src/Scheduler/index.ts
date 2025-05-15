import { EventManager, EventClient } from '../events'
import { ScheduledEvent, ScheduleOptions, ScheduleType } from './types'
import { SchedulerEvents } from './events'
import { TimeManager } from '../Time'
import { TimeEvents } from '../Time/events'
import { TimeUpdateEventData } from '../Time/types'
import { Time } from '../Time/types'
import { CronExpressionParser } from 'cron-parser'
import { v4 as uuidv4 } from 'uuid'
import { Receiver } from "../Receiver"
import { ConditionEffectManager } from '../ConditionEffect'

export class Scheduler {
	private scheduledEvents: Map<string, ScheduledEvent> = new Map()
	private timeouts: Map<string, NodeJS.Timeout> = new Map()
	private timeManager: TimeManager
	private _conditionEffectManager: ConditionEffectManager | null = null

	constructor(
		private event: EventManager,
		timeManager: TimeManager,
	) {
		this.timeManager = timeManager
		this.setupEventHandlers()
	}
	
	/**
	 * Set the ConditionEffectManager
	 */
	set conditionEffectManager(manager: ConditionEffectManager) {
		this._conditionEffectManager = manager
	}
	
	/**
	 * Get the ConditionEffectManager
	 */
	get conditionEffectManager(): ConditionEffectManager {
		if (!this._conditionEffectManager) {
			throw new Error('ConditionEffectManager not initialized in Scheduler')
		}
		return this._conditionEffectManager
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
		
		// Handle enable requests
		this.event.on(SchedulerEvents.SS.Enable, (data: { id: string }, client: EventClient) => {
			this.enableEvent(data.id, client)
		})
		
		// Handle disable requests
		this.event.on(SchedulerEvents.SS.Disable, (data: { id: string }, client: EventClient) => {
			this.disableEvent(data.id, client)
		})

		// Handle time updates from TimeManager
		this.event.on(TimeEvents.SC.Updated, (data: TimeUpdateEventData) => {
			this.checkGameTimeEvents(data.time)
		})
	}

	public loadSchedules(schedules: ScheduleOptions[]): string[] {
		const scheduledIds: string[] = []
		
		// Create a system client for initialization
		const systemClient: EventClient = {
			id: 'system-init',
			currentGroup: 'GLOBAL',
			emit: (to: Receiver, event: string, data: any, targetClientId?: string) => {
				this.event.emit(to, event, data, targetClientId)
			},
			setGroup: (group: string) => {
				// No-op for system client
			}
		};
		
		for (const schedule of schedules) {
			const id = this.schedule(schedule, systemClient)
			scheduledIds.push(id)
		}

		return scheduledIds
	}

	private checkGameTimeEvents(currentTime: Time) {
		for (const [id, event] of this.scheduledEvents) {
			// Skip inactive events
			if (!event.isActive) continue;
			
			if (event.schedule.type === ScheduleType.GameTime) {
				const [targetHours, targetMinutes] = (event.schedule.value as string).split(':').map(Number)
				const { day, month, year } = event.schedule

				// Check if the specified date matches (if provided)
				if (day && day !== currentTime.day) continue
				if (month && month !== currentTime.month) continue
				if (year && year !== currentTime.year) continue

				// Check if the time matches
				if (currentTime.hours === targetHours && currentTime.minutes === targetMinutes) {
					// Execute event (which will check conditions and apply effects)
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
			schedule: options.schedule,
			isActive: true, // Events are active by default
			createdAt: this.timeManager.getCurrentTime(),
			condition: options.condition,
			conditions: options.conditions,
			effect: options.effect,
			effects: options.effects
		}

		// Calculate next run time
		event.nextRun = this.calculateNextRun(event)

		// Store the event
		this.scheduledEvents.set(id, event)

		// Set up timeout for non-game-time events
		if (event.schedule.type !== ScheduleType.GameTime) {
			this.scheduleNextExecution(event)
		}

		// Notify client if provided
		if (client) {
			client.emit(Receiver.Sender, SchedulerEvents.SS.Scheduled, {
				id,
				nextRun: event.nextRun,
				isActive: event.isActive
			})
		}

		return id
	}
	
	private scheduleNextExecution(event: ScheduledEvent): void {
		// Clear any existing timeout
		this.clearEventTimeout(event.id)
		
		// Only schedule if the event is active
		if (event.isActive && event.nextRun) {
			const timeout = setTimeout(() => {
				this.executeEvent(event)
			}, event.nextRun.getTime() - Date.now())
			
			this.timeouts.set(event.id, timeout)
		}
	}
	
	private clearEventTimeout(id: string): void {
		const timeout = this.timeouts.get(id)
		if (timeout) {
			clearTimeout(timeout)
			this.timeouts.delete(id)
		}
	}

	private executeEvent(event: ScheduledEvent): void {
		// Skip execution if the event is not active
		if (!event.isActive) return;
		
		// Create a proper mock client that implements the EventClient interface
		const mockClient: EventClient = {
			id: 'system-scheduler',
			currentGroup: 'GLOBAL',
			emit: (to: Receiver, event: string, data: any, targetClientId?: string) => {
				this.event.emit(to, event, data, targetClientId)
			},
			setGroup: (group: string) => {
				// No-op for mock client
			}
		};
		
		// Check conditions if the ConditionEffectManager is available
		if (this._conditionEffectManager) {
			// Check single condition if present
			if (event.condition && !this._conditionEffectManager.checkCondition(event.condition, mockClient)) {
				console.log(`Scheduled event ${event.id} condition not met, skipping execution`)
				// Schedule next execution for recurring events
				if (this.isRecurringEvent(event)) {
					event.nextRun = this.calculateNextRun(event)
					this.scheduleNextExecution(event)
				}
				return;
			}
			
			// Check multiple conditions if present
			if (event.conditions && event.conditions.length > 0) {
				const allConditionsMet = event.conditions.every(condition => 
					this._conditionEffectManager!.checkCondition(condition, mockClient)
				);
				
				if (!allConditionsMet) {
					console.log(`Scheduled event ${event.id} conditions not met, skipping execution`)
					// Schedule next execution for recurring events
					if (this.isRecurringEvent(event)) {
						event.nextRun = this.calculateNextRun(event)
						this.scheduleNextExecution(event)
					}
					return;
				}
			}
		}

		// Update last run time
		event.lastRun = new Date()

		// Apply effects if the ConditionEffectManager is available
		if (this._conditionEffectManager) {
			// Apply single effect if present
			if (event.effect) {
				this._conditionEffectManager.applyEffect(event.effect, mockClient)
			}
			
			// Apply multiple effects if present
			if (event.effects && event.effects.length > 0) {
				event.effects.forEach(effect => {
					this._conditionEffectManager!.applyEffect(effect, mockClient)
				});
			}
		}

		// Handle recurring events
		if (this.isRecurringEvent(event)) {
			event.nextRun = this.calculateNextRun(event)
			this.scheduleNextExecution(event)
		} else if (event.schedule.type === ScheduleType.Once) {
			// Remove one-time events after execution
			this.scheduledEvents.delete(event.id)
			this.timeouts.delete(event.id)
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

		// Clear timeout if exists
		this.clearEventTimeout(id)

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
				event.nextRun = this.calculateNextRun(event)
				this.scheduleNextExecution(event)
			}
			
			// Update the event
			this.scheduledEvents.set(id, event)
		}
		
		// Notify client
		client.emit(Receiver.Sender, SchedulerEvents.SS.Enable, {
			success: true,
			id,
			nextRun: event.nextRun
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
			
			// Clear any pending timeout
			this.clearEventTimeout(id)
			
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
} 