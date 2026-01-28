import { EventManager, EventCallback, LifecycleCallback, EventClient } from '../../src/events'
import { Receiver } from '../../src/types'

export type EventRecord = {
	to: Receiver
	event: string
	data: any
	groupName?: string
	timestamp: number
}

type EventHandler<T = any> = {
	event: string
	callback: EventCallback<T>
}

export class MockEventManager implements EventManager {
	private handlers: Map<string, EventHandler[]> = new Map()
	private joinedHandlers: LifecycleCallback[] = []
	private leftHandlers: LifecycleCallback[] = []
	
	// Event history for assertions
	private emittedEvents: EventRecord[] = []
	
	// Mock client for testing
	private mockClient: EventClient = {
		id: 'test-client',
		currentGroup: 'test-group',
		setGroup: (group: string) => {
			this.mockClient.currentGroup = group
		},
		emit: (to: Receiver, event: string, data: any, groupName?: string) => {
			this.emit(to, event, data, groupName)
		}
	}

	on<T>(event: string, callback: EventCallback<T>): void {
		const handlers = this.handlers.get(event) || []
		handlers.push({ event, callback: callback as EventCallback })
		this.handlers.set(event, handlers)
	}

	off<T>(event: string, callback: EventCallback<T>): void {
		const handlers = this.handlers.get(event)
		if (!handlers) {
			return
		}

		const nextHandlers = handlers.filter(handler => handler.callback !== callback)
		if (nextHandlers.length === 0) {
			this.handlers.delete(event)
			return
		}

		this.handlers.set(event, nextHandlers)
	}

	onJoined(callback: LifecycleCallback): void {
		this.joinedHandlers.push(callback)
	}

	onLeft(callback: LifecycleCallback): void {
		this.leftHandlers.push(callback)
	}

	emit(to: Receiver, event: string, data: any, groupName?: string): void {
		// Record the event
		this.emittedEvents.push({
			to,
			event,
			data: JSON.parse(JSON.stringify(data)), // Deep clone
			groupName,
			timestamp: Date.now()
		})

		// Trigger handlers synchronously
		const handlers = this.handlers.get(event) || []
		handlers.forEach(handler => {
			try {
				handler.callback(data, this.mockClient)
			} catch (error) {
				console.error(`Error in handler for ${event}:`, error)
			}
		})
	}

	// Test helper methods
	getMockClient(): EventClient {
		return this.mockClient
	}

	simulateClientJoin(clientId?: string, groupId?: string): void {
		if (clientId) this.mockClient.id = clientId
		if (groupId) this.mockClient.currentGroup = groupId
		this.joinedHandlers.forEach(callback => callback(this.mockClient))
	}

	simulateClientLeave(): void {
		this.leftHandlers.forEach(callback => callback(this.mockClient))
	}

	// Event history queries
	getEmittedEvents(): EventRecord[] {
		return [...this.emittedEvents]
	}

	getEventsByType(eventType: string): EventRecord[] {
		return this.emittedEvents.filter(e => e.event === eventType)
	}

	getEventsByPrefix(prefix: string): EventRecord[] {
		return this.emittedEvents.filter(e => e.event.startsWith(prefix))
	}

	clearEventHistory(): void {
		this.emittedEvents = []
	}

	// Assertion helpers
	expectEvent(eventType: string, options?: {
		data?: any
		to?: Receiver
		count?: number
	}): EventRecord[] {
		const matches = this.getEventsByType(eventType).filter(record => {
			if (options?.to && record.to !== options.to) return false
			if (options?.data) {
				return this.deepEqual(record.data, options.data)
			}
			return true
		})

		if (options?.count !== undefined) {
			if (matches.length !== options.count) {
				throw new Error(
					`Expected ${options.count} events of type ${eventType}, but got ${matches.length}`
				)
			}
		}

		return matches
	}

	private deepEqual(a: any, b: any): boolean {
		return JSON.stringify(a) === JSON.stringify(b)
	}

	// Expose handlers for GameTestHelper
	getHandlers(): Map<string, EventHandler[]> {
		return this.handlers
	}
}

