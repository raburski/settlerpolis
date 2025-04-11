import { Position } from '../../types'
import { PlayerSourcedData } from '../Players/types'

export interface NPCMessageCondition {
	check: () => boolean
	message: string
}

export interface NPCMessages {
	default: string
	conditions?: NPCMessageCondition[]
}

export interface NPC {
	id: string
	name: string
	position: Position
	scene: string
	dialogueId?: string // Reference to a dialogue tree in the Dialogue system
	messages?: NPCMessages
}

export interface NPCInteractData extends PlayerSourcedData {
	npcId: string
}

export interface NPCMessageData {
	npcId: string
	message: string
} 