import { EventManager, Event, EventClient } from '../events'
import { TimeEvents } from './events'
import {
	DAYS_IN_MONTH,
	DayPhase,
	getDayPhaseFromHour,
	isDayPhase,
	MONTHS_IN_YEAR,
	Time,
	TimeDayPhaseSyncEventData,
	TimeFastForwardToPhaseEventData,
	TimePauseEventData,
	TimeSpeedUpdateEventData,
	TimeSyncEventData,
	TimeUpdateEventData
} from './types'
import { Receiver } from '../Receiver'
import { SimulationEvents } from '../Simulation/events'
import { SimulationTickData } from '../Simulation/types'
import { Logger } from '../Logs'
import type { TimeSnapshot } from '../state/types'
import { TimeState } from './TimeState'

const MIN_TIME_SPEED_MS = 100
const DAY_PHASE_START_HOUR: Record<DayPhase, number> = {
	morning: 6,
	midday: 12,
	evening: 17,
	night: 21
}

export class TimeManager {
	private readonly state = new TimeState()

	constructor(
		private event: EventManager,
		private logger: Logger
	) {
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		this.event.on<TimeFastForwardToPhaseEventData>(TimeEvents.CS.FastForwardToPhase, this.handleTimeCSFastForwardToPhase)
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

	private readonly handleTimeCSFastForwardToPhase = (data: TimeFastForwardToPhaseEventData, client: EventClient): void => {
		this.fastForwardToDayPhase(data?.dayPhase, client)
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
		while (true) {
			const currentPhase = this.getCurrentDayPhase()
			const currentPhaseSpeed = this.getDayPhaseTimeSpeed(currentPhase)
			if (this.state.tickAccumulatorMs < currentPhaseSpeed) {
				break
			}
			this.state.tickAccumulatorMs -= currentPhaseSpeed
			this.incrementTime(1)
			const nextPhase = this.getCurrentDayPhase()
			if (nextPhase !== currentPhase) {
				this.state.lastBroadcastDayPhase = nextPhase
				this.broadcastDayPhaseSync()
			}
		}
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
	}

	private getCurrentDayPhase(): DayPhase {
		return getDayPhaseFromHour(this.state.timeData.time.hours)
	}

	private getDayPhaseTimeSpeed(dayPhase: DayPhase): number {
		const configured = this.state.timeData.dayPhaseSpeeds[dayPhase]
		if (!Number.isFinite(configured)) {
			return MIN_TIME_SPEED_MS
		}
		return Math.max(MIN_TIME_SPEED_MS, configured)
	}

	private buildTimeSyncData(): TimeSyncEventData {
		const dayPhase = this.getCurrentDayPhase()
		return {
			time: { ...this.state.timeData.time },
			isPaused: this.state.timeData.isPaused,
			timeSpeed: this.state.timeData.timeSpeed,
			dayPhase,
			dayPhaseTimeSpeed: this.getDayPhaseTimeSpeed(dayPhase),
			dayPhaseSpeeds: { ...this.state.timeData.dayPhaseSpeeds }
		}
	}

	private buildDayPhaseSyncData(): TimeDayPhaseSyncEventData {
		const dayPhase = this.getCurrentDayPhase()
		return {
			time: { ...this.state.timeData.time },
			isPaused: this.state.timeData.isPaused,
			dayPhase,
			dayPhaseTimeSpeed: this.getDayPhaseTimeSpeed(dayPhase),
			dayPhaseSpeeds: { ...this.state.timeData.dayPhaseSpeeds }
		}
	}

	private broadcastDayPhaseSync(): void {
		this.event.emit(Receiver.All, TimeEvents.SC.DayPhaseSync, this.buildDayPhaseSyncData())
	}

	private incrementDateByOneDay(time: Time): Time {
		let { day, month, year } = time
		day = (day % DAYS_IN_MONTH) + 1
		if (day === 1) {
			month = (month % MONTHS_IN_YEAR) + 1
			if (month === 1) {
				year += 1
			}
		}
		return {
			...time,
			day,
			month,
			year
		}
	}

	private calculateFastForwardTarget(targetPhase: DayPhase): Time {
		const current = this.state.timeData.time
		const currentPhase = this.getCurrentDayPhase()
		if (currentPhase === targetPhase) {
			return { ...current }
		}

		const currentMinuteOfDay = current.hours * 60 + current.minutes
		const targetMinuteOfDay = DAY_PHASE_START_HOUR[targetPhase] * 60
		if (currentMinuteOfDay < targetMinuteOfDay) {
			return {
				...current,
				hours: DAY_PHASE_START_HOUR[targetPhase],
				minutes: 0
			}
		}

		const nextDay = this.incrementDateByOneDay(current)
		return {
			...nextDay,
			hours: DAY_PHASE_START_HOUR[targetPhase],
			minutes: 0
		}
	}

	private fastForwardToDayPhase(dayPhase: unknown, client: EventClient): void {
		if (!isDayPhase(dayPhase)) {
			return
		}
		this.state.timeData.time = this.calculateFastForwardTarget(dayPhase)
		this.state.tickAccumulatorMs = 0
		this.state.lastBroadcastHour = this.state.timeData.time.hours
		this.state.lastBroadcastDayPhase = this.getCurrentDayPhase()

		client.emit(Receiver.All, TimeEvents.SC.TimeSet, {
			time: this.state.timeData.time
		} as TimeUpdateEventData)
		client.emit(Receiver.All, TimeEvents.SC.DayPhaseSync, this.buildDayPhaseSyncData())
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
		this.state.lastBroadcastDayPhase = this.getCurrentDayPhase()
		this.state.tickAccumulatorMs = 0

		client.emit(Receiver.All, TimeEvents.SC.TimeSet, {
			time: this.state.timeData.time
		} as TimeUpdateEventData)
		client.emit(Receiver.All, TimeEvents.SC.DayPhaseSync, this.buildDayPhaseSyncData())
	}

	public setTimeSpeed(timeSpeed: number, client: EventClient) {
		this.state.timeData.timeSpeed = Math.max(MIN_TIME_SPEED_MS, timeSpeed) // Minimum 100ms per game minute
		for (const phase of Object.keys(this.state.timeData.dayPhaseSpeeds) as DayPhase[]) {
			this.state.timeData.dayPhaseSpeeds[phase] = this.state.timeData.timeSpeed
		}

		client.emit(Receiver.All, TimeEvents.SC.SpeedSet, {
			timeSpeed: this.state.timeData.timeSpeed
		} as TimeSpeedUpdateEventData)
		client.emit(Receiver.All, TimeEvents.SC.DayPhaseSync, this.buildDayPhaseSyncData())
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
		client.emit(Receiver.Sender, TimeEvents.SC.Sync, this.buildTimeSyncData())
	}

	public getCurrentTime(): Time {
		return { ...this.state.timeData.time }
	}

	public isPaused(): boolean {
		return this.state.timeData.isPaused
	}

	public getTimeSpeed(): number {
		return this.getDayPhaseTimeSpeed(this.getCurrentDayPhase())
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
