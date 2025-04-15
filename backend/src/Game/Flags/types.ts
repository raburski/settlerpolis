export enum FlagScope {
	Player = 'player',
	Map = 'map',
	Global = 'global'
}

export interface Flag {
	name: string
	value: any
	scope: FlagScope
	playerId?: string
	mapId?: string
}

export interface SetFlagData {
	name: string
	value: any
	scope: FlagScope
	playerId?: string
	mapId?: string
}

export interface UnsetFlagData {
	name: string
	scope: FlagScope
	playerId?: string
	mapId?: string
} 