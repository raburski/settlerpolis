import { Event } from '../../events'

export const WorldEvents = {
	SS: {
		Update: 'world:ss:update',
		SetTime: 'world:ss:set-time',
		SetSpeed: 'world:ss:set-speed',
		Pause: 'world:ss:pause',
		Resume: 'world:ss:resume'
	},
	SC: {
		Updated: 'world:sc:updated',
		TimeSet: 'world:sc:time-set',
		SpeedSet: 'world:sc:speed-set',
		Paused: 'world:sc:paused',
		Resumed: 'world:sc:resumed',
		Sync: 'world:sc:sync'
	}
} as const 