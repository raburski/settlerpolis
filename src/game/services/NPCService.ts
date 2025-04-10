import { Dialog, NPC } from '../../../backend/src/DataTypes'
import { Event } from '../../../backend/src/Event'
import { EventBus } from '../EventBus'
import { MultiplayerService } from './MultiplayerService'

export class NPCService {
	private currentDialog: Dialog | null = null
	private currentNPC: NPC | null = null

	constructor(
		private eventBus: EventBus,
		private multiplayerService: MultiplayerService
	) {
		this.setupEventListeners()
	}

	private setupEventListeners() {
		// Listen for dialog updates from the server
		this.eventBus.on(Event.NPC.Dialog, (data: { npcId: string, dialog: Dialog | null }) => {
			this.currentDialog = data.dialog
			
			if (data.dialog === null) {
				// Dialog was closed
				this.currentNPC = null
			} else if (!this.currentNPC) {
				// If we don't have currentNPC yet, create a minimal one with just the id
				this.currentNPC = { id: data.npcId } as NPC
			}
			
			// Forward the dialog to any UI components
			this.eventBus.emit(Event.NPC.DialogUpdate, data)
		})

		// Listen for NPC messages
		this.eventBus.on(Event.NPC.Message, (data: { npcId: string, message: string }) => {
			this.eventBus.emit('npc:displayMessage', data)
		})
	}

	public async interact(npc: NPC) {
		if (this.currentDialog) {
			return
		}

		this.currentNPC = npc
		await this.multiplayerService.interactWithNPC(npc.id)
	}

	public async selectResponse(responseIndex: number) {
		if (!this.currentDialog || !this.currentNPC || !this.currentDialog.responses) {
			return
		}

		const response = this.currentDialog.responses[responseIndex]
		if (!response) return

		await this.multiplayerService.selectNPCResponse(
			this.currentNPC.id,
			this.currentDialog.id,
			response.id
		)
	}

	public closeDialog() {
		if (!this.currentNPC) return

		const npcId = this.currentNPC.id
		this.multiplayerService.closeNPCDialog(npcId)
	}

	public destroy() {
		this.eventBus.off(Event.NPC.Dialog)
		this.eventBus.off(Event.NPC.DialogUpdate)
	}
} 