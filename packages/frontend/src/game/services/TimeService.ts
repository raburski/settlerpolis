import {
	DAY_PHASES,
	DEFAULT_DAY_PHASE_SPEEDS,
	Event,
	getDayPhaseFromHour,
	isDayPhase,
	type DayPhase,
	type DayPhaseSpeeds,
	type Time,
	type TimeDayPhaseSyncEventData,
	type TimeSyncEventData
} from '@rugged/game'
import { EventBus } from '../EventBus'

const DEFAULT_TIME: Time = {
	hours: 8,
	minutes: 0,
	day: 1,
	month: 1,
	year: 1
}

const TICK_INTERVAL_MS = 200

export interface TimeSimulationState {
	time: Time
	isPaused: boolean
	dayPhase: DayPhase
	dayPhaseTimeSpeed: number
	dayPhaseSpeeds: DayPhaseSpeeds
}

const cloneTime = (time: Time): Time => ({
	hours: time.hours,
	minutes: time.minutes,
	day: time.day,
	month: time.month,
	year: time.year
})

const normalizePhaseSpeed = (value: unknown, fallback: number): number => {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return fallback
	}
	return Math.max(100, value)
}

const normalizePhaseSpeeds = (input: unknown, fallback: DayPhaseSpeeds): DayPhaseSpeeds => {
	if (!input || typeof input !== 'object') {
		return { ...fallback }
	}
	const source = input as Partial<Record<DayPhase, unknown>>
	const next: DayPhaseSpeeds = { ...fallback }
	for (const phase of DAY_PHASES) {
		next[phase] = normalizePhaseSpeed(source[phase], fallback[phase])
	}
	return next
}

const incrementTimeOneMinute = (time: Time): Time => {
	let hours = time.hours
	let minutes = time.minutes + 1
	let day = time.day
	let month = time.month
	let year = time.year

	if (minutes >= 60) {
		minutes = 0
		hours = (hours + 1) % 24
		if (hours === 0) {
			day += 1
			if (day > 30) {
				day = 1
				month += 1
				if (month > 12) {
					month = 1
					year += 1
				}
			}
		}
	}

	return {
		hours,
		minutes,
		day,
		month,
		year
	}
}

export class TimeService {
	private state: TimeSimulationState = {
		time: { ...DEFAULT_TIME },
		isPaused: false,
		dayPhase: getDayPhaseFromHour(DEFAULT_TIME.hours),
		dayPhaseTimeSpeed: DEFAULT_DAY_PHASE_SPEEDS[getDayPhaseFromHour(DEFAULT_TIME.hours)],
		dayPhaseSpeeds: { ...DEFAULT_DAY_PHASE_SPEEDS }
	}
	private listeners = new Set<(state: TimeSimulationState) => void>()
	private tickTimer: number | null = null
	private tickAccumulatorMs = 0
	private lastTickAtMs = Date.now()

	constructor() {
		EventBus.on(Event.Time.SC.Sync, this.handleSync)
		EventBus.on(Event.Time.SC.DayPhaseSync, this.handleDayPhaseSync)
		EventBus.on(Event.Time.SC.TimeSet, this.handleTimeSet)
		EventBus.on(Event.Time.SC.Paused, this.handlePaused)
		EventBus.on(Event.Time.SC.Resumed, this.handleResumed)
		this.tickTimer = window.setInterval(this.handleTick, TICK_INTERVAL_MS)
	}

	private readonly handleSync = (data: TimeSyncEventData): void => {
		this.applySync(data)
	}

	private readonly handleDayPhaseSync = (data: TimeDayPhaseSyncEventData): void => {
		this.applySync(data)
	}

	private readonly handleTimeSet = (data: { time?: Time }): void => {
		if (!data?.time) {
			return
		}
		this.applySync({ time: data.time })
	}

	private readonly handlePaused = (data: { isPaused?: boolean }): void => {
		this.state.isPaused = Boolean(data?.isPaused)
		this.lastTickAtMs = Date.now()
		this.notify()
	}

	private readonly handleResumed = (data: { isPaused?: boolean }): void => {
		this.state.isPaused = Boolean(data?.isPaused)
		this.lastTickAtMs = Date.now()
		this.notify()
	}

	private readonly handleTick = (): void => {
		if (this.state.isPaused) {
			this.lastTickAtMs = Date.now()
			return
		}

		const nowMs = Date.now()
		const deltaMs = Math.max(0, nowMs - this.lastTickAtMs)
		this.lastTickAtMs = nowMs
		if (deltaMs <= 0) {
			return
		}

		this.tickAccumulatorMs += deltaMs
		let changed = false

		while (this.tickAccumulatorMs >= this.state.dayPhaseTimeSpeed) {
			this.tickAccumulatorMs -= this.state.dayPhaseTimeSpeed
			this.state.time = incrementTimeOneMinute(this.state.time)
			this.state.dayPhase = getDayPhaseFromHour(this.state.time.hours)
			this.state.dayPhaseTimeSpeed = this.state.dayPhaseSpeeds[this.state.dayPhase]
			changed = true
		}

		if (changed) {
			this.notify()
		}
	}

	private applySync(payload: Partial<TimeSyncEventData & TimeDayPhaseSyncEventData>): void {
		const nextTime = payload.time ? cloneTime(payload.time) : cloneTime(this.state.time)
		const nextSpeeds = normalizePhaseSpeeds(payload.dayPhaseSpeeds, this.state.dayPhaseSpeeds)
		const nextPhase = isDayPhase(payload.dayPhase)
			? payload.dayPhase
			: getDayPhaseFromHour(nextTime.hours)
		const nextPhaseSpeed = normalizePhaseSpeed(payload.dayPhaseTimeSpeed, nextSpeeds[nextPhase])

		this.state = {
			time: nextTime,
			isPaused: typeof payload.isPaused === 'boolean' ? payload.isPaused : this.state.isPaused,
			dayPhase: nextPhase,
			dayPhaseTimeSpeed: nextPhaseSpeed,
			dayPhaseSpeeds: nextSpeeds
		}

		this.tickAccumulatorMs = 0
		this.lastTickAtMs = Date.now()
		this.notify()
	}

	private notify(): void {
		const snapshot = this.getState()
		for (const listener of this.listeners) {
			listener(snapshot)
		}
	}

	public getState(): TimeSimulationState {
		return {
			time: cloneTime(this.state.time),
			isPaused: this.state.isPaused,
			dayPhase: this.state.dayPhase,
			dayPhaseTimeSpeed: this.state.dayPhaseTimeSpeed,
			dayPhaseSpeeds: { ...this.state.dayPhaseSpeeds }
		}
	}

	public subscribe(listener: (state: TimeSimulationState) => void): () => void {
		this.listeners.add(listener)
		listener(this.getState())
		return () => {
			this.listeners.delete(listener)
		}
	}

	public fastForwardToDayPhase = (dayPhase: DayPhase): void => {
		EventBus.emit(Event.Time.CS.FastForwardToPhase, { dayPhase })
	}

	public destroy(): void {
		if (this.tickTimer !== null) {
			window.clearInterval(this.tickTimer)
			this.tickTimer = null
		}
		EventBus.off(Event.Time.SC.Sync, this.handleSync)
		EventBus.off(Event.Time.SC.DayPhaseSync, this.handleDayPhaseSync)
		EventBus.off(Event.Time.SC.TimeSet, this.handleTimeSet)
		EventBus.off(Event.Time.SC.Paused, this.handlePaused)
		EventBus.off(Event.Time.SC.Resumed, this.handleResumed)
		this.listeners.clear()
	}
}

export const timeService = new TimeService()
