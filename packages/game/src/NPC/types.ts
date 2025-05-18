import { Position } from '../types'
import { PlayerSourcedData } from '../Players/types'
import { AffinityData, AffinitySentiments, AffinitySentimentType } from '../Affinity/types'

export enum NPCState {
	Idle = 'idle',
	Moving = 'moving'
}

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

export interface NPCRoutineStep {
	time: string // e.g. "08:00", "14:30"
	spot: string // Named spot or tile reference from map
	action?: string // Optional behavior
}

export interface NPCRoutine {
	steps: NPCRoutineStep[]
}

export interface NPC {
	id: string
	name: string
	position: Position
	mapId: string
	initialSpot?: string
	currentSpot?: string
	messages?: NPCMessages
	path?: Position[]
	speed: number
	routine?: NPCRoutine
	currentAction?: string
	attributes?: Record<string, any>
	state?: NPCState
	active?: boolean // defaults to true, if false NPC is disabled
}

export interface NPCInteractData extends PlayerSourcedData {
	npcId: string
}

export interface NPCMessageData {
	npcId: string
	message?: string
	emoji?: string
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