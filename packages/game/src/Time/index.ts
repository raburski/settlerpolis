import { EventManager, Event, EventClient } from '../events'
import { TimeEvents } from './events'
import { Time, TimeData, TimeUpdateEventData, TimeSpeedUpdateEventData, TimePauseEventData, TimeSyncEventData, MONTHS_IN_YEAR, DAYS_IN_MONTH } from './types'
import { Receiver } from '../Receiver'
import { SimulationEvents } from '../Simulation/events'
import { SimulationTickData } from '../Simulation/types'
import { Logger } from '../Logs'

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
	private lastBroadcastHour: number = 8
	private tickAccumulatorMs = 0

	constructor(
		private event: EventManager,
		private logger: Logger
	) {
		this.setupEventHandlers()
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

		// Advance time based on simulation ticks
		this.event.on(SimulationEvents.SS.Tick, (data: SimulationTickData) => {
			this.handleSimulationTick(data)
		})
	}

	private handleSimulationTick(data: SimulationTickData) {
		if (this.timeData.isPaused) {
			return
		}

		this.tickAccumulatorMs += data.deltaMs
		const minutesToAdvance = Math.floor(this.tickAccumulatorMs / this.timeData.timeSpeed)
		if (minutesToAdvance <= 0) {
			return
		}

		this.tickAccumulatorMs -= minutesToAdvance * this.timeData.timeSpeed
		this.incrementTime(minutesToAdvance)
	}

	private incrementTime(minutesToAdvance: number = 1) {
		let { hours, minutes, day, month, year } = this.timeData.time

		for (let i = 0; i < minutesToAdvance; i++) {
			minutes += 1
			if (minutes >= 60) {
				minutes = 0
				hours = (hours + 1) % 24
				
				if (hours === 0) {
					day = (day % DAYS_IN_MONTH) + 1
					
					if (day === 1) {
						month = (month % MONTHS_IN_YEAR) + 1
						
						if (month === 1) {
							year++
						}
					}
				}
			}
		}

		this.timeData.time = { 
			hours,
			minutes,
			day,
			month,
			year
		}

		// Only broadcast update when hour changes
		if (hours !== this.lastBroadcastHour) {
			this.lastBroadcastHour = hours
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
