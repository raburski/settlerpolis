import { Position } from '../types'
import { PlayerSourcedData } from '../Players/types'
import { AffinityData, AffinitySentiments, AffinitySentimentType } from '../Affinity/types'

export enum NPCState {
	Idle = 'idle',
	Moving = 'moving'
}

export enum Direction {
	Down = 'down',
	Up = 'up',
	Left = 'left',
	Right = 'right'
}

export interface NPCAnimation {
	frames: number[] // Frame indices for animation
	frameRate: number
	repeat: number // -1 for infinite
}

export type DirectionalAnimations = {
	[key in Direction]?: NPCAnimation
}

export interface NPCAssets {
	avatar?: string // Path to the avatar image
	spritesheet: string // Path to the spritesheet containing all animation frames
	animations: {
		[idle: string]: DirectionalAnimations | NPCAnimation // Can be directional or single animation
	}
	frameWidth: number // Width of each frame in the spritesheet
	frameHeight: number // Height of each frame in the spritesheet
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
	interactable?: boolean // defaults to false, if true NPC can be interacted with
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