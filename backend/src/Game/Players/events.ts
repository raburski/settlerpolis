export const PlayersEvents = {
	CS: {
		Connect: 'cs:players:connect',
		Join: 'cs:players:join',
		Move: 'cs:players:move',
		TransitionTo: 'cs:players:transition-to',
		DropItem: 'cs:players:drop_item',
		PickupItem: 'cs:players:pickup_item'
	},
	SC: {
		Connected: 'sc:players:connected',
		Joined: 'sc:players:joined',
		Left: 'sc:players:left',
	}
} as const 