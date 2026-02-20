import { DEFAULT_DAY_PHASE_SPEEDS, getDayPhaseFromHour, type DayPhase, type TimeData } from './types'
import type { TimeSnapshot } from '../state/types'

const DEFAULT_TIME_DATA: TimeData = {
	time: {
		hours: 8,
		minutes: 0,
		day: 1,
		month: 1,
		year: 1
	},
	isPaused: false,
	timeSpeed: 1000, // 1 real second = 1 game minute
	dayPhaseSpeeds: { ...DEFAULT_DAY_PHASE_SPEEDS }
}

const createDefaultTimeData = (): TimeData => ({
	...DEFAULT_TIME_DATA,
	time: { ...DEFAULT_TIME_DATA.time },
	dayPhaseSpeeds: { ...DEFAULT_TIME_DATA.dayPhaseSpeeds }
})

export class TimeState {
	public timeData: TimeData = createDefaultTimeData()
	public lastBroadcastHour: number = DEFAULT_TIME_DATA.time.hours
	public lastBroadcastDayPhase: DayPhase = getDayPhaseFromHour(DEFAULT_TIME_DATA.time.hours)
	public tickAccumulatorMs = 0

	/* SERIALISATION */
	public serialize(): TimeSnapshot {
		return {
			timeData: {
				time: { ...this.timeData.time },
				isPaused: this.timeData.isPaused,
				timeSpeed: this.timeData.timeSpeed,
				dayPhaseSpeeds: { ...this.timeData.dayPhaseSpeeds }
			},
			lastBroadcastHour: this.lastBroadcastHour,
			lastBroadcastDayPhase: this.lastBroadcastDayPhase,
			tickAccumulatorMs: this.tickAccumulatorMs
		}
	}

	public deserialize(state: TimeSnapshot): void {
		const dayPhaseSpeeds = state.timeData.dayPhaseSpeeds
			? { ...DEFAULT_DAY_PHASE_SPEEDS, ...state.timeData.dayPhaseSpeeds }
			: { ...DEFAULT_DAY_PHASE_SPEEDS }

		this.timeData = {
			time: { ...state.timeData.time },
			isPaused: state.timeData.isPaused,
			timeSpeed: state.timeData.timeSpeed,
			dayPhaseSpeeds
		}
		this.lastBroadcastHour = state.lastBroadcastHour
		this.lastBroadcastDayPhase = state.lastBroadcastDayPhase ?? getDayPhaseFromHour(this.timeData.time.hours)
		this.tickAccumulatorMs = state.tickAccumulatorMs
	}

	public reset(): void {
		this.timeData = createDefaultTimeData()
		this.lastBroadcastHour = DEFAULT_TIME_DATA.time.hours
		this.lastBroadcastDayPhase = getDayPhaseFromHour(DEFAULT_TIME_DATA.time.hours)
		this.tickAccumulatorMs = 0
	}
}
