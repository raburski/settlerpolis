import { EventBus } from '../EventBus'
import { Event, EventManager } from '../../../backend/src/Event'
import { PlayerJoinData, PlayerMovedData, ChatMessageData, PlayerSourcedData, InventoryData, DropItemData, DroppedItem, PickUpItemData, ConsumeItemData } from '../../../backend/src/DataTypes'
import { NetworkManager } from '../network/NetworkManager'
import { LocalManager } from '../network/LocalManager'
import { GameManager } from '../../../backend/src/Game'
import { PlayerData } from '../types'
import { Receiver } from '../../../backend/src/Receiver'

export enum Gender {
	Male = 'Male',
	Female = 'Female'
}

export interface PlayerAppearance {
	gender: Gender
}

export interface PlayerData extends PlayerSourcedData {
	id: string
	x: number
	y: number
	scene: string
	appearance: PlayerAppearance
}

const DEFAULT_APPEARANCE: PlayerAppearance = {
	gender: Gender.Male
}

export class MultiplayerService {
	private static instance: MultiplayerService | null = null
	private players: Map<string, PlayerData> = new Map()
	private currentScene: string | null = null
	private playerName: string = 'Player'

	private constructor(private event: EventManager) {
		// Listen for player:sendMessage events
		EventBus.on('player:sendMessage', this.handleSendMessage, this)
		// Listen for inventory drop events
		EventBus.on(Event.Inventory.Drop, this.handleDropItem, this)
		// Listen for inventory pickup events
		EventBus.on(Event.Inventory.PickUp, this.handlePickUpItem, this)
		// Listen for inventory consume events
		EventBus.on(Event.Inventory.Consume, this.handleConsumeItem, this)
	}

	private getAllNetworkEvents(): string[] {
		const events: string[] = []
		const addEvents = (obj: any) => {
			Object.values(obj).forEach(value => {
				if (typeof value === 'string') {
					events.push(value)
				} else if (typeof value === 'object') {
					addEvents(value)
				}
			})
		}
		addEvents(Event)
		return events
	}

	private setupNetworkEventForwarding() {
		if (!this.event) return

		// Get all possible events
		const events = this.getAllNetworkEvents()

		// Subscribe to each event and forward to EventBus
		events.forEach(eventName => {
			this.event.on(eventName, (data, client) => {
				// For events that need sourcePlayerId, add it from the client
                data = { ...data, sourcePlayerId: client.id }
                console.log('[MULTIPLAYER SERVICE] Feed into the EventBUS', eventName)
				EventBus.emit(eventName, data)
			})
		})
	}

	static getInstance(): MultiplayerService {
		if (!MultiplayerService.instance) {
			const IS_REMOTE_GAME = true
			if (IS_REMOTE_GAME) {
				const networkManager = new NetworkManager('https://hearty-rejoicing-production.up.railway.app')
				MultiplayerService.instance = new MultiplayerService(networkManager)
			} else {
				const localManager = new LocalManager()
				const gameManager = new GameManager(localManager.server)
				MultiplayerService.instance = new MultiplayerService(localManager.client)
			}
		}
		return MultiplayerService.instance
	}

	setPlayerName(name: string) {
		this.playerName = name
	}

	connect() {
		if (!this.event) return
		this.setupNetworkEventForwarding()
	}

	joinGame(x: number, y: number, scene: string, appearance: PlayerAppearance = DEFAULT_APPEARANCE) {
		if (!this.event) return

		this.currentScene = scene
		console.log(`Joining game in scene: ${scene}`)
		this.event.emit(Receiver.All, Event.Player.Join, { position: { x, y }, scene, appearance })
	}

	updatePosition(x: number, y: number) {
		if (!this.event || !this.currentScene) return
		
		this.event.emit(Receiver.All, Event.Player.Moved, { x, y })
	}

	transitionToScene(x: number, y: number, scene: string) {
		if (!this.event) return

		// Send transition event
		this.event.emit(Receiver.All, Event.Player.TransitionTo, {
			position: { x, y },
			scene
		})

		// Update current scene
		this.currentScene = scene
	}

	getPlayers(): PlayerData[] {
		return Array.from(this.players.values())
	}

	disconnect() {
		if (this.event instanceof NetworkManager) {
			this.event.disconnect()
		}
		this.event = null
		this.players.clear()
		this.currentScene = null
	}

	sendChatMessage(message: string) {
		if (!this.event || !this.currentScene) return

		const chatMessage: ChatMessageData = {
			message
		}

		this.event.emit(Receiver.NoSenderGroup, Event.Chat.Message, chatMessage)
	}

	private handleSendMessage = (message: string) => {
		this.sendChatMessage(message)
	}

	private handleDropItem = (data: DropItemData) => {
		if (!this.event) return
		this.event.emit(Receiver.All, Event.Inventory.Drop, data)
	}

	private handlePickUpItem = (data: PickUpItemData) => {
		if (!this.event) return
		this.event.emit(Receiver.All, Event.Inventory.PickUp, data)
	}

	private handleConsumeItem = (data: ConsumeItemData) => {
		if (!this.event) return
		this.event.emit(Receiver.All, Event.Inventory.Consume, data)
	}

	public async interactWithNPC(npcId: string) {
		if (!this.event) return
		this.event.emit(Receiver.All, Event.NPC.Interact, { npcId })
	}

	public async selectNPCResponse(npcId: string, dialogId: string, responseId: string) {
		if (!this.event) return
		this.event.emit(Receiver.All, Event.NPC.Dialog, { 
			npcId,
			dialogId,
			responseId
		})
	}

	public async closeNPCDialog(npcId: string) {
		if (!this.event) return
		this.event.emit(Receiver.All, Event.NPC.CloseDialog, { npcId })
	}

	public destroy(): void {
		this.disconnect()
		EventBus.off('player:sendMessage', this.handleSendMessage)
		EventBus.off(Event.Inventory.Drop, this.handleDropItem)
		EventBus.off(Event.Inventory.PickUp, this.handlePickUpItem)
		EventBus.off(Event.Inventory.Consume, this.handleConsumeItem)
	}
} 