export interface NPC {
	id: string
	name: string
	position: {
		x: number
		y: number
	}
	scene: string
	dialogueId?: string // Reference to a dialogue tree in the Dialogue system
	messages?: {
		default: string
		conditions?: Array<{
			check: () => boolean
			message: string
		}>
	}
}

export interface NPCInteractData {
	npcId: string
}

export interface NPCMessageData {
	npcId: string
	message: string
} 