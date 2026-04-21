import { EventBus } from '../EventBus'
import { Receiver, EventManager, EventDirection, NETWORK_EVENT_CATALOG } from '@rugged/game'

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
	private debug: boolean
	private serverToClientEvents: string[]
	private networkHandlers = new Map<string, (data: any, client: any) => void>()
	private handleCSEvent = (eventName: string, data: any) => {
		if (
			eventName
			&& NETWORK_EVENT_CATALOG[EventDirection.ClientToServer].has(eventName)
			&& this.event
		) {
			const workerDebug = String(import.meta.env.VITE_GAME_WORKER_DEBUG || '').toLowerCase() === 'true'
			if (this.debug || (workerDebug && eventName.startsWith('cs:players'))) {
				console.log('[MULTIPLAYER SERVICE] Forwarding CS event:', eventName, data)
			}
			this.event.emit(Receiver.All, eventName, data)
		}
	}

	constructor(private event: EventManager) {
		const rawDebug = import.meta.env.VITE_GAME_MULTIPLAYER_DEBUG
		this.debug = String(rawDebug).toLowerCase() === 'true'
		this.serverToClientEvents = Array.from(NETWORK_EVENT_CATALOG[EventDirection.ServerToClient])
		if (this.debug) {
			console.log('[MultiplayerService] Event catalog sizes:', {
				CLIENT_TO_SERVER: NETWORK_EVENT_CATALOG[EventDirection.ClientToServer].size,
				SERVER_TO_CLIENT: NETWORK_EVENT_CATALOG[EventDirection.ServerToClient].size,
				SERVER_TO_SERVER: NETWORK_EVENT_CATALOG[EventDirection.ServerToServer].size
			})
		}
		EventBus.onAny(this.handleCSEvent)
		this.setupNetworkEventForwarding()
	}

	private setupNetworkEventForwarding() {
		if (!this.event) {
			console.warn('[MultiplayerService] No event manager, cannot setup forwarding')
			return
		}

		// Subscribe only to server->client events and forward to EventBus
		this.serverToClientEvents.forEach(eventName => {
			const handler = (data: any, _client: any) => {
				if (this.debug) {
					console.log('[MULTIPLAYER SERVICE] Received event from server, forwarding to EventBus:', eventName, data)
				}
				EventBus.emit(eventName, data)
			}
			this.networkHandlers.set(eventName, handler)
			this.event.on(eventName, handler)
		})
		if (this.debug) {
			console.log('[MultiplayerService] Set up forwarding for', this.serverToClientEvents.length, 'SERVER_TO_CLIENT events')
		}
	}

	public destroy(): void {
		EventBus.offAny(this.handleCSEvent)
		this.networkHandlers.forEach((handler, eventName) => {
			this.event.off(eventName, handler)
		})
		this.networkHandlers.clear()
	}
}
