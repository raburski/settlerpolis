import { Receiver } from '@rugged/game'
import type { EventManager, EventCallback, LifecycleCallback, EventClient, GameSnapshotV1, GameContent } from '@rugged/game'
import type { NetworkEventManager } from './NetworkManager'
import type { WorkerMessageFromMain, WorkerMessageToMain, WorkerEventMessage } from './workerProtocol'

const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

type PendingSnapshotRequest = {
	resolve: (snapshot: GameSnapshotV1) => void
	reject: (error: Error) => void
}

type PendingDeserializeRequest = {
	resolve: () => void
	reject: (error: Error) => void
}

class WorkerEventClient implements EventClient {
	private _currentGroup: string = 'GLOBAL'

	constructor(
		public readonly id: string
	) {}

	get currentGroup(): string {
		return this._currentGroup
	}

	setGroup(group: string): void {
		this._currentGroup = group
	}

	emit(_to: Receiver, _event: string, _data: any, _targetClientId?: string): void {
		// No-op: client emits are handled by WorkerEventManager.emit.
	}
}

class WorkerEventManager implements NetworkEventManager {
	private handlers: Map<string, EventCallback[]> = new Map()
	private joinedCallbacks = new Set<LifecycleCallback>()
	private leftCallbacks = new Set<LifecycleCallback>()
	private client: WorkerEventClient
	private hasReceivedMessage = false

	constructor(
		private workerManager: WorkerManager,
		private direction: 'client' | 'server'
	) {
		this.client = new WorkerEventClient(direction === 'client' ? 'client' : 'server')
	}

	connect(onConnect: () => {}): void {
		this.workerManager.connect(onConnect)
	}

	disconnect(): void {
		this.workerManager.disconnect()
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
		if (this.hasReceivedMessage) {
			callback(this.client)
		}
	}

	onLeft(callback: LifecycleCallback): void {
		this.leftCallbacks.add(callback)
	}

	emit(to: Receiver, event: string, data: any, groupName?: string): void {
		this.workerManager.sendEvent({
			direction: this.direction,
			to,
			event,
			data,
			groupName
		})
	}

	handleIncomingMessage(message: WorkerEventMessage): void {
		if (message.to === Receiver.NoSenderGroup) {
			return
		}
		if (!message.event) {
			return
		}

		if (!this.hasReceivedMessage) {
			this.hasReceivedMessage = true
			this.joinedCallbacks.forEach(callback => callback(this.client))
		}

		const handlers = this.handlers.get(message.event)
		if (!handlers || handlers.length === 0) {
			return
		}
		for (const handler of handlers) {
			handler(message.data, this.client)
		}
	}
}

export class WorkerManager {
	public readonly client: NetworkEventManager
	public readonly server: EventManager
	private worker: Worker | null = null
	private ready = false
	private pendingConnectCallbacks: Array<() => void> = []
	private pendingMessages: WorkerMessageFromMain[] = []
	private snapshotRequests = new Map<string, PendingSnapshotRequest>()
	private deserializeRequests = new Map<string, PendingDeserializeRequest>()
	private debug = false

	constructor(
		private options: {
			content: GameContent
			mapBaseUrl: string
			logAllowlist?: string[]
			simulationTickMs?: number
			silentLogs?: boolean
		}
	) {
		this.debug = String(import.meta.env.VITE_GAME_WORKER_DEBUG || '').toLowerCase() === 'true'
		this.client = new WorkerEventManager(this, 'client')
		this.server = new WorkerEventManager(this, 'server')
	}

	connect(onConnect: () => {}): void {
		if (this.ready) {
			onConnect()
			return
		}
		this.pendingConnectCallbacks.push(onConnect)
		this.ensureWorker()
	}

	disconnect(): void {
		if (!this.worker) return
		this.worker.postMessage({ type: 'disconnect' })
		this.worker.terminate()
		this.worker = null
		this.ready = false
		this.pendingMessages = []
		this.snapshotRequests.clear()
		this.deserializeRequests.clear()
	}

	sendEvent(message: Omit<WorkerEventMessage, 'type'>): void {
		const payload: WorkerEventMessage = { type: 'event', ...message }
		if (this.debug && message.event) {
			if (
				message.event.startsWith('cs:players') ||
				message.event.startsWith('cs:population') ||
				message.event.startsWith('sc:players') ||
				message.event.startsWith('sc:population') ||
				message.event.startsWith('sc:loot') ||
				message.event.startsWith('sc:inventory') ||
				message.event.startsWith('sc:map')
			) {
				console.log('[WorkerManager] send', message.direction, message.event, message.data)
			}
		}
		this.postMessage(payload)
	}

	requestSnapshot(): Promise<GameSnapshotV1> {
		const requestId = this.buildRequestId('snapshot')
		return new Promise((resolve, reject) => {
			this.snapshotRequests.set(requestId, { resolve, reject })
			this.postMessage({ type: 'snapshot:serialize', requestId })
		})
	}

	loadSnapshot(snapshot: GameSnapshotV1): Promise<void> {
		const requestId = this.buildRequestId('load')
		return new Promise((resolve, reject) => {
			this.deserializeRequests.set(requestId, { resolve, reject })
			this.postMessage({ type: 'snapshot:deserialize', requestId, snapshot })
		})
	}

	private ensureWorker(): void {
		if (this.worker) return
		this.worker = new Worker(new URL('./engineWorker.ts', import.meta.url), { type: 'module' })
		this.worker.onmessage = (event: MessageEvent<WorkerMessageToMain>) => {
			this.handleWorkerMessage(event.data)
		}
		this.worker.onerror = (event) => {
			console.error('[WorkerManager] Worker error', event)
		}
		const initMessage: WorkerMessageFromMain = {
			type: 'init',
			content: this.options.content,
			mapBaseUrl: this.options.mapBaseUrl,
			logAllowlist: this.options.logAllowlist,
			simulationTickMs: this.options.simulationTickMs,
			silentLogs: this.options.silentLogs,
			debug: this.debug
		}
		this.worker.postMessage(initMessage)
	}

	private handleWorkerMessage(message: WorkerMessageToMain): void {
		switch (message.type) {
			case 'ready':
				this.ready = true
				this.flushPendingMessages()
				this.worker?.postMessage({ type: 'connect' })
				this.pendingConnectCallbacks.forEach(callback => callback())
				this.pendingConnectCallbacks = []
				break
			case 'event':
				if (message.direction === 'server') {
					if (this.debug && message.event) {
						if (
							message.event.startsWith('sc:players') ||
							message.event.startsWith('sc:population') ||
							message.event.startsWith('sc:loot') ||
							message.event.startsWith('sc:inventory') ||
							message.event.startsWith('sc:map')
						) {
							console.log('[WorkerManager] recv', message.event, message.data)
						}
					}
					(this.client as WorkerEventManager).handleIncomingMessage(message)
				}
				break
			case 'snapshot:serialized': {
				const pending = this.snapshotRequests.get(message.requestId)
				if (pending) {
					this.snapshotRequests.delete(message.requestId)
					pending.resolve(message.snapshot)
				}
				break
			}
			case 'snapshot:deserialized': {
				const pending = this.deserializeRequests.get(message.requestId)
				if (pending) {
					this.deserializeRequests.delete(message.requestId)
					pending.resolve()
				}
				break
			}
			default:
				break
		}
	}

	private postMessage(message: WorkerMessageFromMain): void {
		if (!this.worker || !this.ready) {
			this.pendingMessages.push(message)
			return
		}
		this.worker.postMessage(message)
	}

	private flushPendingMessages(): void {
		if (!this.worker || !this.ready) return
		for (const message of this.pendingMessages) {
			this.worker.postMessage(message)
		}
		this.pendingMessages = []
	}

	private buildRequestId(prefix: string): string {
		return `${prefix}:${Math.random().toString(36).slice(2)}:${perfNow().toFixed(3)}`
	}
}
