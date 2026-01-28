import { GameManager } from '../../src/index'
import { MockEventManager, EventRecord } from './MockEventManager'
import { Receiver } from '../../src/types'

export class GameTestHelper {
	private defaultTimeout = 1000 // Default timeout in milliseconds

	constructor(
		private gameManager: GameManager,
		private eventManager: MockEventManager
	) {}

	// Dispatch an event (automatically handles cs: and ss: prefixes)
	dispatch<T>(event: string, data: T, options?: { clientId?: string }): void {
		const isClientEvent = event.startsWith('cs:')
		
		// For client-to-server events, set up client context if provided
		if (isClientEvent && options?.clientId) {
			this.eventManager.simulateClientJoin(options.clientId)
		}
		
		const client = this.eventManager.getMockClient()
		const handlers = this.eventManager.getHandlers().get(event) || []
		handlers.forEach(handler => {
			handler.callback(data, client)
		})
	}

	// Wait for an event (with timeout)
	async waitForEvent(
		timeout: number,
		eventType: string,
		predicate?: (record: EventRecord) => boolean
	): Promise<EventRecord> {
		return new Promise((resolve, reject) => {
			const startTime = Date.now()
			const checkInterval = 10 // Check every 10ms

			const check = () => {
				const events = this.eventManager.getEventsByType(eventType)
				const matching = predicate
					? events.filter(predicate)
					: events

				if (matching.length > 0) {
					resolve(matching[matching.length - 1]) // Return most recent
					return
				}

				if (Date.now() - startTime > timeout) {
					reject(new Error(`Timeout waiting for event ${eventType}`))
					return
				}

				setTimeout(check, checkInterval)
			}

			check()
		})
	}

	// Expect an event to be emitted
	expectEvent(
		eventType: string,
		optionsOrTimeout?: number | {
			data?: any
			to?: Receiver
			timeout?: number
		}
	): Promise<EventRecord> {
		// Handle case where second parameter is just a timeout number
		let options: { data?: any; to?: Receiver; timeout?: number } | undefined
		if (typeof optionsOrTimeout === 'number') {
			options = { timeout: optionsOrTimeout }
		} else {
			options = optionsOrTimeout
		}

		// Use default timeout if none provided
		const timeout = options?.timeout ?? this.defaultTimeout

		return this.waitForEvent(timeout, eventType, record => {
			if (options?.to && record.to !== options.to) return false
			if (options?.data) {
				return JSON.stringify(record.data) === JSON.stringify(options.data)
			}
			return true
		})
	}

	// Set default timeout for expectEvent
	setDefaultTimeout(timeout: number): void {
		this.defaultTimeout = timeout
	}

	// Advance time (for time-based tests)
	advanceTime(seconds: number): void {
		// Dispatch time tick events
		for (let i = 0; i < seconds; i++) {
			this.dispatch('ss:time:tick', { delta: 1000 })
		}
	}
}

