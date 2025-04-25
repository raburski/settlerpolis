export const PlayersEvents = {
	CS: {
		Connect: 'cs:players:connect',
		Join: 'cs:players:join',
		Move: 'cs:players:move',
		TransitionTo: 'cs:players:transition-to',
		DropItem: 'cs:players:drop_item',
		PickupItem: 'cs:players:pickup_item',
		Equip: 'cs:players:equip',
		Unequip: 'cs:players:unequip',
		Place: 'cs:players:place'
	},
	SC: {
		Connected: 'sc:players:connected',
		Joined: 'sc:players:joined',
		Left: 'sc:players:left',
		Move: 'sc:players:move',
		Equip: 'sc:players:equip',
		Unequip: 'sc:players:unequip'
	},
} as const 