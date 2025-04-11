export const PlayersEvents = {
	CS: {
		Join: 'cs:players:join',
		Moved: 'cs:players:moved',
		TransitionTo: 'cs:players:transition-to'
	},
	SC: {
		Joined: 'sc:players:joined',
		Left: 'sc:players:left',
		Disconnected: 'sc:players:disconnected',
		List: 'sc:players:list'
	}
} as const 