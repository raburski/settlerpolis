/// <reference lib="webworker" />

import { GameManager, Receiver } from '@rugged/game'
import type { EventManager, EventCallback, LifecycleCallback, EventClient, GameSnapshotV1 } from '@rugged/game'
import { FrontendMapUrlService } from '../services/MapUrlService'
import type { WorkerMessageFromMain, WorkerMessageToMain, WorkerEventMessage } from './workerProtocol'

const postToMain = (message: WorkerMessageToMain) => {
	self.postMessage(message)
}

class WorkerEventClient implements EventClient {
	private _currentGroup = 'GLOBAL'

	constructor(
		public readonly id: string,
		private emitFn: (to: Receiver, event: string, data: any, targetClientId?: string) => void
	) {}

	get currentGroup(): string {
		return this._currentGroup
	}

	setGroup(group: string): void {
		this._currentGroup = group
	}

	emit(to: Receiver, event: string, data: any, targetClientId?: string): void {
		this.emitFn(to, event, data, targetClientId)
	}
}

class WorkerEventBus implements EventManager {
	private handlers: Map<string, EventCallback[]> = new Map()
	private joinedCallbacks = new Set<LifecycleCallback>()
	private leftCallbacks = new Set<LifecycleCallback>()
	private client: WorkerEventClient

	constructor() {
		this.client = new WorkerEventClient('server', (to, event, data, targetClientId) => {
			this.emit(to, event, data, targetClientId, this.client)
		})
	}

	getClient(): WorkerEventClient {
		return this.client
	}

	on<T>(event: string, callback: EventCallback<T>): void {
		if (!this.handlers.has(event)) {
			this.handlers.set(event, [])
		}
		this.handlers.get(event)?.push(callback as EventCallback)
	}

	off<T>(event: string, callback: EventCallback<T>): void {
		const handlers = this.handlers.get(event)
		if (!handlers) return
		const next = handlers.filter(handler => handler !== callback)
		if (next.length === 0) {
			this.handlers.delete(event)
		} else {
			this.handlers.set(event, next)
		}
	}

	onJoined(callback: LifecycleCallback): void {
		this.joinedCallbacks.add(callback)
	}

	onLeft(callback: LifecycleCallback): void {
		this.leftCallbacks.add(callback)
	}

	notifyJoined(): void {
		this.joinedCallbacks.forEach(callback => callback(this.client))
	}

	notifyLeft(): void {
		this.leftCallbacks.forEach(callback => callback(this.client))
	}

	handleClientEvent(event: string, data: any): void {
		if (event.startsWith('ss:')) {
			// Server-to-server events should never originate from clients.
			return
		}
		const handlers = this.handlers.get(event)
		if (!handlers || handlers.length === 0) {
			return
		}
		for (const handler of handlers) {
			handler(data, this.client)
		}
	}

	emit(to: Receiver, event: string, data: any, targetClientId?: string, originalClient?: EventClient): void {
		if (event.startsWith('sc:')) {
			if (debug && shouldLogEvent(event)) {
				console.log('[Worker] SC event send', event, data)
			}
			const message: WorkerEventMessage = {
				type: 'event',
				direction: 'server',
				to,
				event,
				data,
				targetClientId
			}
			postToMain(message)
			return
		}

		if (event.startsWith('ss:')) {
			const handlers = this.handlers.get(event) || []
			for (const handler of handlers) {
				handler(data, originalClient ?? this.client)
			}
			return
		}

		if (event.startsWith('cs:')) {
			console.error(`[WorkerEventBus] Server attempted to emit client event: ${event}`)
			return
		}

		// Fallback: treat unknown events as server->client
		const message: WorkerEventMessage = {
			type: 'event',
			direction: 'server',
			to,
			event,
			data,
			targetClientId
		}
		postToMain(message)
	}

	// Local-mode semantics: forward all server->client events. Client-side filtering can ignore NoSenderGroup.
}

let eventBus: WorkerEventBus | null = null
let gameManager: GameManager | null = null
let debug = false

const shouldLogEvent = (event: string): boolean => {
	if (!event) return false
	return (
		event.startsWith('cs:players') ||
		event.startsWith('cs:population') ||
		event.startsWith('sc:players') ||
		event.startsWith('sc:population') ||
		event.startsWith('sc:loot') ||
		event.startsWith('sc:inventory') ||
		event.startsWith('sc:map')
	)
}

const handleInit = (message: WorkerMessageFromMain & { type: 'init' }) => {
	if (eventBus && gameManager) {
		return
	}
	const bus = new WorkerEventBus()
	const mapUrlService = new FrontendMapUrlService(message.mapBaseUrl)
	const options = {
		simulationTickMs: message.simulationTickMs,
		logAllowlist: message.logAllowlist
	}
	debug = Boolean(message.debug)
	gameManager = new GameManager(bus, message.content, mapUrlService, options)
	eventBus = bus
	postToMain({ type: 'ready' })
}

const handleSnapshotSerialize = (requestId: string) => {
	if (!gameManager) return
	const snapshot = gameManager.serialize()
	postToMain({ type: 'snapshot:serialized', requestId, snapshot })
}

const handleSnapshotDeserialize = (requestId: string, snapshot: GameSnapshotV1) => {
	if (!gameManager) return
	gameManager.deserialize(snapshot)
	postToMain({ type: 'snapshot:deserialized', requestId })
}

self.onmessage = (event: MessageEvent<WorkerMessageFromMain>) => {
	const message = event.data
	if (!message) return

	switch (message.type) {
		case 'init':
			handleInit(message)
			break
		case 'connect':
			eventBus?.notifyJoined()
			break
		case 'disconnect':
			eventBus?.notifyLeft()
			break
		case 'event':
			if (message.direction === 'client') {
				if (debug && shouldLogEvent(message.event)) {
					console.log('[Worker] CS event received', message.event, message.data)
				}
				eventBus?.handleClientEvent(message.event, message.data)
			} else if (message.direction === 'server') {
				// Server-side emits triggered from main thread (proxy)
				eventBus?.emit(message.to, message.event, message.data, message.targetClientId)
			}
			break
		case 'snapshot:serialize':
			handleSnapshotSerialize(message.requestId)
			break
		case 'snapshot:deserialize':
			handleSnapshotDeserialize(message.requestId, message.snapshot)
			break
		default:
			break
	}
}
