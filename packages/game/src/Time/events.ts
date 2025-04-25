export const TimeEvents = {
	SS: {
		Update: 'time:ss:update',
		SetSpeed: 'time:ss:set-speed',
		Pause: 'time:ss:pause',
		Resume: 'time:ss:resume'
	},
	SC: {
		Updated: 'time:sc:updated',
		TimeSet: 'time:sc:time-set',
		SpeedSet: 'time:sc:speed-set',
		Paused: 'time:sc:paused',
		Resumed: 'time:sc:resumed',
		Sync: 'time:sc:sync'
	}
} as const 