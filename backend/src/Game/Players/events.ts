export const PlayersEvents = {
	CS: {
		Join: 'cs:players:join',
		Moved: 'cs:players:moved',
		TransitionTo: 'cs:players:transition-to',
		DropItem: 'cs:players:drop_item',
		PickupItem: 'cs:players:pickup_item'
	},
	SC: {
		Joined: 'sc:players:joined',
		Left: 'sc:players:left',
		Disconnected: 'sc:players:disconnected',
		List: 'sc:players:list'
	}
} as const 