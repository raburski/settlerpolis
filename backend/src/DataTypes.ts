import { Position } from "./types"

export interface PlayerSourcedData {
    sourcePlayerId?: string
}

export interface PlayerJoinData extends PlayerSourcedData {
    position: Position
    scene: string
}

export interface PlayerMovedData extends PlayerSourcedData {
    x: number
    y: number
}

export interface ChatMessageData extends PlayerSourcedData {
    message: string
}