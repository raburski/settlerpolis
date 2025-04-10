import { EventManager, Event } from '../Event'
import { NPC, NPCInteractData, NPCDialogData, PlayerJoinData, PlayerTransitionData } from '../DataTypes'
import { Receiver } from '../Receiver'
import { v4 as uuidv4 } from 'uuid'

// Example NPC data
const EXAMPLE_NPC: NPC = {
	id: 'innkeeper',
	name: 'Innkeeper',
	position: { x: 100, y: 400 },
	scene: 'FarmScene',
	dialog: [
		{
			id: 'greeting',
			text: 'Welcome to my inn, traveler! How can I help you today?',
			responses: [
				{
					id: 'ask_room',
					text: 'Do you have any rooms available?',
					nextDialogId: 'room_response'
				},
				{
					id: 'ask_drink',
					text: 'I could use a drink.',
					nextDialogId: 'drink_response'
				},
				{
					id: 'goodbye',
					text: 'Nothing, just looking around.',
					nextDialogId: 'goodbye_response'
				}
			]
		},
		{
			id: 'room_response',
			text: 'We do have rooms available, but they are all currently under renovation. Check back later!',
			responses: [
				{
					id: 'back_to_greeting',
					text: 'Let me ask you something else.',
					nextDialogId: 'greeting'
				}
			]
		},
		{
			id: 'drink_response',
			text: 'Here\'s our finest mózgotrzep! That\'ll be... oh wait, first one\'s on the house!',
			responses: [
				{
					id: 'accept_drink',
					text: 'Thanks!',
					action: 'give_drink',
                    nextDialogId: 'goodbye_response'
				}
			]
		},
		{
			id: 'goodbye_response',
			text: 'Feel free to look around. Let me know if you need anything!'
		}
	]
}

export class NPCManager {
	private npcs: Map<string, NPC> = new Map()

	constructor(private event: EventManager) {
		// Add example NPC
		this.npcs.set(EXAMPLE_NPC.id, EXAMPLE_NPC)
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		// Send NPCs list when player joins or transitions to a scene
		this.event.on<PlayerJoinData>(Event.Player.Join, (data, client) => {
			const sceneNPCs = this.getSceneNPCs(data.scene)
			if (sceneNPCs.length > 0) {
				client.emit(Receiver.Sender, Event.NPC.List, { npcs: sceneNPCs })
			}
		})

		this.event.on<PlayerTransitionData>(Event.Player.TransitionTo, (data, client) => {
			const sceneNPCs = this.getSceneNPCs(data.scene)
			if (sceneNPCs.length > 0) {
				client.emit(Receiver.Sender, Event.NPC.List, { npcs: sceneNPCs })
			}
		})

		// Handle NPC interactions
		this.event.on<NPCInteractData>(Event.NPC.Interact, (data, client) => {
			const npc = this.npcs.get(data.npcId)
			if (!npc) return

			// Start with the first dialog
			const initialDialog = npc.dialog[0]
			client.emit(Receiver.Sender, Event.NPC.Dialog, {
				npcId: npc.id,
				dialog: initialDialog
			})
		})

		// Handle dialog responses
		this.event.on<NPCDialogData>(Event.NPC.Dialog, (data, client) => {
			const npc = this.npcs.get(data.npcId)
			if (!npc || !data.responseId) return

			// Find the current dialog
			const currentDialog = npc.dialog.find(d => d.id === data.dialogId)
			if (!currentDialog?.responses) return

			// Find the selected response
			const response = currentDialog.responses.find(r => r.id === data.responseId)
			if (!response) return

			// Handle response action if any
			if (response.action === 'give_drink') {
                // TODO: update local inventory!

				// Emit inventory event to give the player a drink
				client.emit(Receiver.Sender, Event.Inventory.Loaded, {
					inventory: {
						items: [{
							id: uuidv4(),
							name: 'Mózgotrzep',
							type: 'Consumable'
						}]
					}
				})
			}

			// If there's a next dialog, send it
			if (response.nextDialogId) {
				const nextDialog = npc.dialog.find(d => d.id === response.nextDialogId)
				if (nextDialog) {
					client.emit(Receiver.Sender, Event.NPC.Dialog, {
						npcId: npc.id,
						dialog: nextDialog
					})
				}
			}
		})

		// Handle dialog closing
		this.event.on(Event.NPC.CloseDialog, (data: { npcId: string }, client) => {
			// Send null dialog to indicate dialog is closed
			client.emit(Receiver.Sender, Event.NPC.Dialog, {
				npcId: data.npcId,
				dialog: null
			})
		})
	}

	private getSceneNPCs(scene: string): NPC[] {
		return Array.from(this.npcs.values()).filter(npc => npc.scene === scene)
	}
} 