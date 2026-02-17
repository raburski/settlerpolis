import type { DialogueTree } from './types'
import type { DialogueSnapshot } from '../state/types'

export class DialogueState {
	public dialogues = new Map<string, DialogueTree>()
	public activeDialogues = new Map<string, string>()
	public currentNodes = new Map<string, string>()

	/* SERIALISATION */
	public serialize(): DialogueSnapshot {
		return {
			activeDialogues: Array.from(this.activeDialogues.entries()),
			currentNodes: Array.from(this.currentNodes.entries())
		}
	}

	public deserialize(state: DialogueSnapshot): void {
		this.activeDialogues.clear()
		this.currentNodes.clear()
		for (const [clientId, dialogueId] of state.activeDialogues) {
			this.activeDialogues.set(clientId, dialogueId)
		}
		for (const [clientId, nodeId] of state.currentNodes) {
			this.currentNodes.set(clientId, nodeId)
		}
	}

	public reset(): void {
		this.activeDialogues.clear()
		this.currentNodes.clear()
	}
}
