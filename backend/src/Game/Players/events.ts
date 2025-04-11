export const PlayerEvents = {
	CS: {
		Join: 'cs:player:join',
		Moved: 'cs:player:moved',
		TransitionTo: 'cs:player:transition-to'
	},
	SC: {
		Joined: 'sc:player:joined',
		Left: 'sc:player:left',
		Disconnected: 'sc:player:disconnected',
		List: 'sc:player:list'
	}
} as const 