import { Position } from '../types'

export interface MovementEntity {
	id: string
	position: Position
	mapName: string
	speed: number // pixels per second
}

export interface MovementTask {
	entityId: string
	path: Position[]
	currentStep: number
	targetType?: string // 'tool', 'building', 'spot', etc.
	targetId?: string
	timeoutId?: NodeJS.Timeout // Timeout ID for cleanup
	onStepComplete?: (task: MovementTask, position: Position) => void
	onPathComplete?: (task: MovementTask) => void
	onCancelled?: (task: MovementTask) => void
	createdAt: number
	lastProcessed: number
}

export interface MovementCallbacks {
	onStepComplete?: (position: Position) => void
	onPathComplete?: (task: MovementTask) => void
	onCancelled?: () => void
}

export interface MoveToPositionOptions {
	callbacks?: MovementCallbacks
	targetType?: string
	targetId?: string
}

