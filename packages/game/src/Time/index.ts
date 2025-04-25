import { EventManager, Event, EventClient } from '../events'
import { TimeEvents } from './events'
import { Time, TimeData, TimeUpdateEventData, TimeSpeedUpdateEventData, TimePauseEventData, TimeSyncEventData, MONTHS_IN_YEAR, DAYS_IN_MONTH } from './types'
import { Receiver } from '../Receiver'

export class TimeManager {
	private timeData: TimeData = {
		time: { 
			hours: 8, 
			minutes: 0,
			day: 1,
			month: 1,
			year: 1
		},
		isPaused: false,
		timeSpeed: 1000 // 1 real second = 1 game minute
	}
	private timeInterval: NodeJS.Timeout | null = null
	private lastBroadcastHour: number = 8

	constructor(
		private event: EventManager
	) {
		this.setupEventHandlers()
		this.startTime()
	}

	private setupEventHandlers() {
		// Handle time updates
		this.event.on(TimeEvents.SS.Update, (data: TimeUpdateEventData, client: EventClient) => {
			this.setTime(data.time, client)
		})

		// Handle time speed updates
		this.event.on(TimeEvents.SS.SetSpeed, (data: TimeSpeedUpdateEventData, client: EventClient) => {
			this.setTimeSpeed(data.timeSpeed, client)
		})

		// Handle pause/resume
		this.event.on(TimeEvents.SS.Pause, (_, client: EventClient) => {
			this.pause(client)
		})

		this.event.on(TimeEvents.SS.Resume, (_, client: EventClient) => {
			this.resume(client)
		})

		// Handle player connection to send initial time data
		this.event.on(Event.Players.CS.Connect, (_, client: EventClient) => {
			this.syncTime(client)
		})
	}

	private startTime() {
		if (this.timeInterval) {
			clearInterval(this.timeInterval)
		}

		this.timeInterval = setInterval(() => {
			if (!this.timeData.isPaused) {
				this.incrementTime()
			}
		}, this.timeData.timeSpeed)
	}

	private incrementTime() {
		const { hours, minutes, day, month, year } = this.timeData.time
		let newMinutes = minutes + 1
		let newHours = hours
		let newDay = day
		let newMonth = month
		let newYear = year

		if (newMinutes >= 60) {
			newMinutes = 0
			newHours = (newHours + 1) % 24
			
			if (newHours === 0) {
				newDay = (newDay % DAYS_IN_MONTH) + 1
				
				if (newDay === 1) {
					newMonth = (newMonth % MONTHS_IN_YEAR) + 1
					
					if (newMonth === 1) {
						newYear++
					}
				}
			}
		}

		this.timeData.time = { 
			hours: newHours, 
			minutes: newMinutes,
			day: newDay,
			month: newMonth,
			year: newYear
		}

		// Only broadcast update when hour changes
		if (newHours !== this.lastBroadcastHour) {
			this.lastBroadcastHour = newHours
			this.broadcastTimeUpdate()
		}
	}

	private broadcastTimeUpdate() {
		this.event.emit(Receiver.All, TimeEvents.SC.Updated, {
			time: this.timeData.time
		} as TimeUpdateEventData)
	}

	public setTime(time: Time, client: EventClient) {
		this.timeData.time = {
			hours: Math.max(0, Math.min(23, time.hours)),
			minutes: Math.max(0, Math.min(59, time.minutes)),
			day: Math.max(1, Math.min(DAYS_IN_MONTH, time.day)),
			month: Math.max(1, Math.min(MONTHS_IN_YEAR, time.month)),
			year: Math.max(1, time.year)
		}
		this.lastBroadcastHour = this.timeData.time.hours

		client.emit(Receiver.All, TimeEvents.SC.TimeSet, {
			time: this.timeData.time
		} as TimeUpdateEventData)
	}

	public setTimeSpeed(timeSpeed: number, client: EventClient) {
		this.timeData.timeSpeed = Math.max(100, timeSpeed) // Minimum 100ms per game minute
		this.startTime()

		client.emit(Receiver.All, TimeEvents.SC.SpeedSet, {
			timeSpeed: this.timeData.timeSpeed
		} as TimeSpeedUpdateEventData)
	}

	public pause(client: EventClient) {
		this.timeData.isPaused = true
		client.emit(Receiver.All, TimeEvents.SC.Paused, {
			isPaused: true
		} as TimePauseEventData)
	}

	public resume(client: EventClient) {
		this.timeData.isPaused = false
		client.emit(Receiver.All, TimeEvents.SC.Resumed, {
			isPaused: false
		} as TimePauseEventData)
	}

	private syncTime(client: EventClient) {
		client.emit(Receiver.Sender, TimeEvents.SC.Sync, {
			time: this.timeData.time,
			isPaused: this.timeData.isPaused,
			timeSpeed: this.timeData.timeSpeed
		} as TimeSyncEventData)
	}

	public getCurrentTime(): Time {
		return { ...this.timeData.time }
	}

	public isPaused(): boolean {
		return this.timeData.isPaused
	}

	public getTimeSpeed(): number {
		return this.timeData.timeSpeed
	}

	public getFormattedDate(): string {
		const { day, month, year } = this.timeData.time
		return `${day}/${month}/${year}`
	}

	public getFormattedTime(): string {
		const { hours, minutes } = this.timeData.time
		return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
	}
} 