export const Event = {
	Player: {
		Join: 'player:join',
		Joined: 'player:joined',
		Left: 'player:left',
		Moved: 'player:moved',
		Disconnected: 'player:disconnected'
	},
	Players: {
		List: 'players:list'
	},
	Chat: {
		Message: 'chat:message'
	},
	System: {
		Ping: 'system:ping'
	}
} as const 