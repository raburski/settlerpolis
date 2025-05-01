import { EventBus } from '../EventBus'
import { Receiver, Event, EventManager } from '@rugged/game'
import { PlayerJoinData, PlayerMovedData, ChatMessageData, PlayerSourcedData, InventoryData, DropItemData, DroppedItem, PickUpItemData, ConsumeItemData } from '../../../backend/src/DataTypes'
import { NetworkManager } from '../network/NetworkManager'
import { LocalManager } from '../network/LocalManager'
import { PlayerData } from '../types'

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
	mapId: string
	appearance: PlayerAppearance
}

const DEFAULT_APPEARANCE: PlayerAppearance = {
	gender: Gender.Male
}

export class MultiplayerService {
	private debug: boolean = false
    private events: string[]
	private handleCSEvent = (eventName: string, data: any) => {
		if (eventName && eventName.startsWith('cs:') && this.event) {
			if (this.debug) {
				console.log('[MULTIPLAYER SERVICE] Forwarding CS event:', eventName, data)
			}
			this.event.emit(Receiver.All, eventName, data)
		}
	}

	constructor(private event: EventManager) {
		this.events = this.getAllNetworkEvents()
		EventBus.onAny(this.handleCSEvent)
        this.setupNetworkEventForwarding()
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

		// Subscribe to each event and forward to EventBus
		this.events.forEach(eventName => {
			this.event.on(eventName, (data, client) => {
				if (this.debug) {
					console.log('[MULTIPLAYER SERVICE] Feed into the EventBUS', eventName)
				}
				EventBus.emit(eventName, data)
			})
		})
	}

	public destroy(): void {
		EventBus.offAny(this.handleCSEvent)
        this.events.forEach(eventName => {
            // todo add handlers:
			// this.event.off(eventName)
		})
	}
} 