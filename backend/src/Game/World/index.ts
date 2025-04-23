import { EventManager, Event, EventClient } from '../../events'
import { WorldEvents } from './events'
import { WorldTime, WorldTimeData, WorldTimeUpdateEventData, WorldTimeSpeedUpdateEventData, WorldTimePauseEventData, WorldTimeSyncEventData, MONTHS_IN_YEAR, DAYS_IN_MONTH } from './types'
import { Receiver } from '../../Receiver'

export class WorldManager {
	private timeData: WorldTimeData = {
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
		this.event.on(WorldEvents.SS.Update, (data: WorldTimeUpdateEventData, client: EventClient) => {
			this.setTime(data.time, client)
		})

		// Handle time speed updates
		this.event.on(WorldEvents.SS.SetSpeed, (data: WorldTimeSpeedUpdateEventData, client: EventClient) => {
			this.setTimeSpeed(data.timeSpeed, client)
		})

		// Handle pause/resume
		this.event.on(WorldEvents.SS.Pause, (_, client: EventClient) => {
			this.pause(client)
		})

		this.event.on(WorldEvents.SS.Resume, (_, client: EventClient) => {
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
		this.event.emit(Receiver.All, WorldEvents.SC.Updated, {
			time: this.timeData.time
		} as WorldTimeUpdateEventData)
	}

	public setTime(time: WorldTime, client: EventClient) {
		this.timeData.time = {
			hours: Math.max(0, Math.min(23, time.hours)),
			minutes: Math.max(0, Math.min(59, time.minutes)),
			day: Math.max(1, Math.min(DAYS_IN_MONTH, time.day)),
			month: Math.max(1, Math.min(MONTHS_IN_YEAR, time.month)),
			year: Math.max(1, time.year)
		}
		this.lastBroadcastHour = this.timeData.time.hours

		client.emit(Receiver.All, WorldEvents.SC.TimeSet, {
			time: this.timeData.time
		} as WorldTimeUpdateEventData)
	}

	public setTimeSpeed(timeSpeed: number, client: EventClient) {
		this.timeData.timeSpeed = Math.max(100, timeSpeed) // Minimum 100ms per game minute
		this.startTime()

		client.emit(Receiver.All, WorldEvents.SC.SpeedSet, {
			timeSpeed: this.timeData.timeSpeed
		} as WorldTimeSpeedUpdateEventData)
	}

	public pause(client: EventClient) {
		this.timeData.isPaused = true
		client.emit(Receiver.All, WorldEvents.SC.Paused, {
			isPaused: true
		} as WorldTimePauseEventData)
	}

	public resume(client: EventClient) {
		this.timeData.isPaused = false
		client.emit(Receiver.All, WorldEvents.SC.Resumed, {
			isPaused: false
		} as WorldTimePauseEventData)
	}

	private syncTime(client: EventClient) {
		client.emit(Receiver.Sender, WorldEvents.SC.Sync, {
			time: this.timeData.time,
			isPaused: this.timeData.isPaused,
			timeSpeed: this.timeData.timeSpeed
		} as WorldTimeSyncEventData)
	}

	public getCurrentTime(): WorldTime {
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