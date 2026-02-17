import { EventManager, Event, EventClient } from '../events'
import { TimeEvents } from './events'
import { Time, TimeUpdateEventData, TimeSpeedUpdateEventData, TimePauseEventData, TimeSyncEventData, MONTHS_IN_YEAR, DAYS_IN_MONTH } from './types'
import { Receiver } from '../Receiver'
import { SimulationEvents } from '../Simulation/events'
import { SimulationTickData } from '../Simulation/types'
import { Logger } from '../Logs'
import type { TimeSnapshot } from '../state/types'
import { TimeState } from './TimeState'

export class TimeManager {
	private readonly state = new TimeState()

	constructor(
		private event: EventManager,
		private logger: Logger
	) {
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		this.event.on(TimeEvents.SS.Update, this.handleTimeSSUpdate)
		this.event.on(TimeEvents.SS.SetSpeed, this.handleTimeSSSetSpeed)
		this.event.on(TimeEvents.SS.Pause, this.handleTimeSSPause)
		this.event.on(TimeEvents.SS.Resume, this.handleTimeSSResume)
		this.event.on(Event.Players.CS.Connect, this.handlePlayersCSConnect)
		this.event.on(SimulationEvents.SS.Tick, this.handleSimulationSSTick)
	}

	/* EVENT HANDLERS */
	private readonly handleSimulationSSTick = (data: SimulationTickData): void => {
		this.handleSimulationTick(data)
	}

	private readonly handleTimeSSUpdate = (data: TimeUpdateEventData, client: EventClient): void => {
		this.setTime(data.time, client)
	}

	private readonly handleTimeSSSetSpeed = (data: TimeSpeedUpdateEventData, client: EventClient): void => {
		this.setTimeSpeed(data.timeSpeed, client)
	}

	private readonly handleTimeSSPause = (_data: unknown, client: EventClient): void => {
		this.pause(client)
	}

	private readonly handleTimeSSResume = (_data: unknown, client: EventClient): void => {
		this.resume(client)
	}

	private readonly handlePlayersCSConnect = (_data: unknown, client: EventClient): void => {
		this.syncTime(client)
	}

	private handleSimulationTick(data: SimulationTickData) {
		if (this.state.timeData.isPaused) {
			return
		}

		this.state.tickAccumulatorMs += data.deltaMs
		const minutesToAdvance = Math.floor(this.state.tickAccumulatorMs / this.state.timeData.timeSpeed)
		if (minutesToAdvance <= 0) {
			return
		}

		this.state.tickAccumulatorMs -= minutesToAdvance * this.state.timeData.timeSpeed
		this.incrementTime(minutesToAdvance)
	}

	/* METHODS */
	private incrementTime(minutesToAdvance: number = 1) {
		let { hours, minutes, day, month, year } = this.state.timeData.time

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

		this.state.timeData.time = {
			hours,
			minutes,
			day,
			month,
			year
		}

		// Only broadcast update when hour changes
		if (hours !== this.state.lastBroadcastHour) {
			this.state.lastBroadcastHour = hours
			this.broadcastTimeUpdate()
		}
	}

	private broadcastTimeUpdate() {
		this.event.emit(Receiver.All, TimeEvents.SC.Updated, {
			time: this.state.timeData.time
		} as TimeUpdateEventData)
	}

	public setTime(time: Time, client: EventClient) {
		this.state.timeData.time = {
			hours: Math.max(0, Math.min(23, time.hours)),
			minutes: Math.max(0, Math.min(59, time.minutes)),
			day: Math.max(1, Math.min(DAYS_IN_MONTH, time.day)),
			month: Math.max(1, Math.min(MONTHS_IN_YEAR, time.month)),
			year: Math.max(1, time.year)
		}
		this.state.lastBroadcastHour = this.state.timeData.time.hours

		client.emit(Receiver.All, TimeEvents.SC.TimeSet, {
			time: this.state.timeData.time
		} as TimeUpdateEventData)
	}

	public setTimeSpeed(timeSpeed: number, client: EventClient) {
		this.state.timeData.timeSpeed = Math.max(100, timeSpeed) // Minimum 100ms per game minute

		client.emit(Receiver.All, TimeEvents.SC.SpeedSet, {
			timeSpeed: this.state.timeData.timeSpeed
		} as TimeSpeedUpdateEventData)
	}

	public pause(client: EventClient) {
		this.state.timeData.isPaused = true
		client.emit(Receiver.All, TimeEvents.SC.Paused, {
			isPaused: true
		} as TimePauseEventData)
	}

	public resume(client: EventClient) {
		this.state.timeData.isPaused = false
		client.emit(Receiver.All, TimeEvents.SC.Resumed, {
			isPaused: false
		} as TimePauseEventData)
	}

	private syncTime(client: EventClient) {
		client.emit(Receiver.Sender, TimeEvents.SC.Sync, {
			time: this.state.timeData.time,
			isPaused: this.state.timeData.isPaused,
			timeSpeed: this.state.timeData.timeSpeed
		} as TimeSyncEventData)
	}

	public getCurrentTime(): Time {
		return { ...this.state.timeData.time }
	}

	public isPaused(): boolean {
		return this.state.timeData.isPaused
	}

	public getTimeSpeed(): number {
		return this.state.timeData.timeSpeed
	}

	public getFormattedDate(): string {
		const { day, month, year } = this.state.timeData.time
		return `${day}/${month}/${year}`
	}

	public getFormattedTime(): string {
		const { hours, minutes } = this.state.timeData.time
		return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
	}

	serialize(): TimeSnapshot {
		return this.state.serialize()
	}

	deserialize(state: TimeSnapshot): void {
		this.state.deserialize(state)
	}

	reset(): void {
		this.state.reset()
	}
}
