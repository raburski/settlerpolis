import { Event } from './events'

export enum EventDirection {
	ClientToServer = 'CLIENT_TO_SERVER',
	ServerToClient = 'SERVER_TO_CLIENT',
	ServerToServer = 'SERVER_TO_SERVER'
}

export type NetworkEventCatalog = Record<EventDirection, ReadonlySet<string>>

const buildNetworkEventCatalog = (): NetworkEventCatalog => {
	const clientToServer = new Set<string>()
	const serverToClient = new Set<string>()
	const serverToServer = new Set<string>()

	const walk = (value: unknown): void => {
		if (!value || typeof value !== 'object') {
			return
		}

		Object.values(value).forEach((entry) => {
			if (typeof entry === 'string') {
				if (entry.startsWith('cs:')) {
					clientToServer.add(entry)
				} else if (entry.startsWith('sc:')) {
					serverToClient.add(entry)
				} else if (entry.startsWith('ss:')) {
					serverToServer.add(entry)
				}
				return
			}

			walk(entry)
		})
	}

	walk(Event)

	return {
		[EventDirection.ClientToServer]: clientToServer,
		[EventDirection.ServerToClient]: serverToClient,
		[EventDirection.ServerToServer]: serverToServer
	}
}

export const NETWORK_EVENT_CATALOG: NetworkEventCatalog = buildNetworkEventCatalog()

export const isEventInDirection = (eventName: string, direction: EventDirection): boolean => {
	return NETWORK_EVENT_CATALOG[direction].has(eventName)
}

