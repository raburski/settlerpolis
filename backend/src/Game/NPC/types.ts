import { Position } from '../../types'
import { PlayerSourcedData } from '../Players/types'
import { AffinitySentimentType } from '../Affinity/types'

export interface NPCMessageCondition {
	check: () => boolean
	message: string
}

export interface NPCMessages {
	default: string
	conditions?: Array<{
		check: () => boolean
		message: string
	}>
}

export interface NPC {
	id: string
	name: string
	position: Position
	scene: string
	messages?: NPCMessages
	path?: Position[]
	speed: number
}

export interface NPCInteractData extends PlayerSourcedData {
	npcId: string
}

export interface NPCMessageData {
	npcId: string
	message: string
}

export interface NPCGoData {
	npcId: string
	position?: Position
	spotName?: string
}

export interface NPCGoResponseData {
	npcId: string
	position: Position
}