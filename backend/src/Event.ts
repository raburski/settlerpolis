export const Event = {
	Player: {
		Join: 'player:join',
		Joined: 'player:joined',
		Left: 'player:left',
		Moved: 'player:moved',
		Disconnected: 'player:disconnected',
		TransitionTo: 'player:transition-to'
	},
	Players: {
		List: 'players:list'
	},
	Chat: {
		Message: 'chat:message'
	},
	System: {
		Ping: 'system:ping'
	},
	Inventory: {
		Loaded: 'inventory:loaded',
		Drop: 'inventory:drop',
		PickUp: 'inventory:pickup',
		Consume: 'inventory:consume'
	},
	Scene: {
		AddItems: 'scene:add-items',
		RemoveItems: 'scene:remove-items'
	}
} as const 