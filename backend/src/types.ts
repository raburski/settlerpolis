export interface Position {
	x: number
	y: number
}

// Re-export types from modules
export * from './Game/Players/types'
export * from './Game/Chat/types'
export * from './Game/NPC/types'
export * from './Game/Inventory/types'
export * from './Game/Dialogue/types'