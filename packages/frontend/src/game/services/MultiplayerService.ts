import { EventBus } from '../EventBus'
import { Receiver, Event, EventManager } from '@rugged/game'

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
	private debug: boolean = true // Enable debug for building catalog
    private events: string[]
	private networkHandlers = new Map<string, (data: any, client: any) => void>()
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
		console.log('[MultiplayerService] Initializing with events:', this.events.length, 'events')
		console.log('[MultiplayerService] Building catalog event:', Event.Buildings?.SC?.Catalog)
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
		if (!this.event) {
			console.warn('[MultiplayerService] No event manager, cannot setup forwarding')
			return
		}

		// Subscribe to each event and forward to EventBus
		this.events.forEach(eventName => {
			const handler = (data, client) => {
				if (this.debug) {
					console.log('[MULTIPLAYER SERVICE] Received event from server, forwarding to EventBus:', eventName, data)
				}
				EventBus.emit(eventName, data)
			}
			this.networkHandlers.set(eventName, handler)
			this.event.on(eventName, handler)
		})
		console.log('[MultiplayerService] Set up forwarding for', this.events.length, 'events')
	}

	public destroy(): void {
		EventBus.offAny(this.handleCSEvent)
		this.networkHandlers.forEach((handler, eventName) => {
			this.event.off(eventName, handler)
		})
		this.networkHandlers.clear()
	}
}
