import { Position } from '../../types'

export interface PlayerSourcedData {
	sourcePlayerId?: string
}

export interface Player {
	playerId: string
	position: Position
	scene: string
	appearance?: any // TODO: Define appearance type
}

export interface PlayerJoinData extends PlayerSourcedData {
	position: Position
	scene: string
	appearance?: any
}

export interface PlayerTransitionData extends PlayerSourcedData {
	position: Position
	scene: string
}

export interface PlayerMoveData extends PlayerSourcedData {
	x: number
	y: number
} 