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
	position: {
		x: number
		y: number
	}
	scene: string
	messages?: NPCMessages
}

export interface NPCInteractData extends PlayerSourcedData {
	npcId: string
}

export interface NPCMessageData {
	npcId: string
	message: string
} 