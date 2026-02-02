export type RenderType =
	| 'player'
	| 'npc'
	| 'settler'
	| 'loot'
	| 'mapObject'
	| 'building'
	| 'road'
	| 'item'
	| 'ground'
	| 'portal'

export interface RenderDescriptor {
	id: string
	type: RenderType
	position: { x: number; y: number; z?: number }
	rotation?: { x?: number; y?: number; z?: number }
	size: { width: number; length: number; height: number }
	appearance?: {
		emojiKey?: string
		materialKey?: string
		tint?: string
	}
	flags?: {
		pickable?: boolean
		castShadow?: boolean
	}
}

export interface ModelContext {
	renderer: {
		createBox: (id: string, size: { width: number; length: number; height: number }) => any
		setMeshPosition: (mesh: any, x: number, y: number, z: number) => void
		setMeshRotation: (mesh: any, x: number, y: number, z: number) => void
		applyEmoji: (mesh: any, emoji: string) => void
		applyTint: (mesh: any, hex: string) => void
		setPickable: (mesh: any, pickable: boolean) => void
	}
}

export type ModelBuilder = (descriptor: RenderDescriptor, context: ModelContext) => any
