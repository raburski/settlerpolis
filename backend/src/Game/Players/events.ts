export const PlayersEvents = {
	CS: {
		Join: 'cs:players:join',
		Move: 'cs:players:move',
		TransitionTo: 'cs:players:transition-to',
		DropItem: 'cs:players:drop_item',
		PickupItem: 'cs:players:pickup_item'
	},
	SC: {
		Joined: 'sc:players:joined',
		Left: 'sc:players:left',
		List: 'sc:players:list'
	}
} as const 