import type { NPC, NPCRoutineStep } from './types'
import type { NPCSnapshot } from '../state/types'

export class NPCManagerState {
	public npcs: Map<string, NPC> = new Map()
	public pausedRoutines: Map<string, NPCRoutineStep> = new Map()
	public lastRoutineCheckKey: string | null = null

	/* SERIALISATION */
	public serialize(): NPCSnapshot {
		return {
			npcs: Array.from(this.npcs.values()).map(npc => ({
				...npc,
				position: { ...npc.position },
				attributes: npc.attributes ? { ...npc.attributes } : undefined
			})),
			pausedRoutines: Array.from(this.pausedRoutines.entries()).map(([npcId, step]) => ([
				npcId,
				{ ...step }
			])),
			lastRoutineCheckKey: this.lastRoutineCheckKey
		}
	}

	public deserialize(state: NPCSnapshot): void {
		this.npcs.clear()
		this.pausedRoutines.clear()
		this.lastRoutineCheckKey = state.lastRoutineCheckKey

		for (const npc of state.npcs) {
			this.npcs.set(npc.id, {
				...npc,
				position: { ...npc.position },
				attributes: npc.attributes ? { ...npc.attributes } : undefined
			})
		}

		for (const [npcId, step] of state.pausedRoutines) {
			this.pausedRoutines.set(npcId, { ...step })
		}
	}

	public reset(): void {
		this.npcs.clear()
		this.pausedRoutines.clear()
		this.lastRoutineCheckKey = null
	}
}
