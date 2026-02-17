import type { TimeData } from './types'
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
	timeSpeed: 1000 // 1 real second = 1 game minute
}

const createDefaultTimeData = (): TimeData => ({
	...DEFAULT_TIME_DATA,
	time: { ...DEFAULT_TIME_DATA.time }
})

export class TimeState {
	public timeData: TimeData = createDefaultTimeData()
	public lastBroadcastHour: number = DEFAULT_TIME_DATA.time.hours
	public tickAccumulatorMs = 0

	/* SERIALISATION */
	public serialize(): TimeSnapshot {
		return {
			timeData: {
				time: { ...this.timeData.time },
				isPaused: this.timeData.isPaused,
				timeSpeed: this.timeData.timeSpeed
			},
			lastBroadcastHour: this.lastBroadcastHour,
			tickAccumulatorMs: this.tickAccumulatorMs
		}
	}

	public deserialize(state: TimeSnapshot): void {
		this.timeData = {
			time: { ...state.timeData.time },
			isPaused: state.timeData.isPaused,
			timeSpeed: state.timeData.timeSpeed
		}
		this.lastBroadcastHour = state.lastBroadcastHour
		this.tickAccumulatorMs = state.tickAccumulatorMs
	}

	public reset(): void {
		this.timeData = createDefaultTimeData()
		this.lastBroadcastHour = DEFAULT_TIME_DATA.time.hours
		this.tickAccumulatorMs = 0
	}
}
