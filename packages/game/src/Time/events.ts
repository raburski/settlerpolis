export const TimeEvents = {
	CS: {
		FastForwardToPhase: 'cs:time:fast-forward-to-phase'
	},
	SS: {
		Update: 'ss:time:update',
		SetSpeed: 'ss:time:set-speed',
		Pause: 'ss:time:pause',
		Resume: 'ss:time:resume',
		DayPhaseSync: 'ss:time:day-phase-sync'
	},
	SC: {
		Updated: 'sc:time:updated',
		TimeSet: 'sc:time:time-set',
		SpeedSet: 'sc:time:speed-set',
		Paused: 'sc:time:paused',
		Resumed: 'sc:time:resumed',
		Sync: 'sc:time:sync',
		DayPhaseSync: 'sc:time:day-phase-sync'
	}
} as const
