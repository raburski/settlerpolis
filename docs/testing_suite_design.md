# Testing Suite Design for Settlerpolis

## Overview

This document explores the design of a comprehensive testing suite for the Settlerpolis game engine. The primary goal is to enable testing of the `GameManager` as a whole system, with the ability to mock the `EventManager` to dispatch events and wait/expect specific events to be emitted.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Mock EventManager Design](#mock-eventmanager-design)
3. [Event Dispatching and Assertions](#event-dispatching-and-assertions)
4. [Test Structure and Organization](#test-structure-and-organization)
5. [Testing Patterns](#testing-patterns)
6. [Example Test Cases](#example-test-cases)
7. [Implementation Roadmap](#implementation-roadmap)

## Architecture Overview

### Current System Architecture

The `GameManager` is the central orchestrator that:
- Takes an `EventManager` interface as a dependency
- Initializes multiple managers (Buildings, Population, Jobs, Storage, Production, etc.)
- All managers communicate through the `EventManager` using events prefixed with:
  - `cs:` - Client-to-Server events
  - `sc:` - Server-to-Client events  
  - `ss:` - Server-to-Server (internal) events

### Testing Goals

1. **Integration Testing**: Test `GameManager` and its subsystems working together
2. **Event-Driven Testing**: Dispatch events and verify expected events are emitted
3. **Isolation**: Mock external dependencies (EventManager, MapUrlService)
4. **Reproducibility**: Tests should be deterministic and fast
5. **Observability**: Track all events for debugging and verification

## Mock EventManager Design

### Core Interface

The mock `EventManager` should implement the same interface as the real one:

```typescript
interface EventManager {
	on<T>(event: string, callback: EventCallback<T>): void
	onJoined(callback: LifecycleCallback): void
	onLeft(callback: LifecycleCallback): void
	emit(to: Receiver, event: string, data: any, groupName?: string): void
}
```

### MockEventManager Implementation

```typescript
type EventRecord = {
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
}
```

## Event Dispatching and Assertions

### Test Helper Utilities

```typescript
export class GameTestHelper {
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
		const handlers = this.eventManager['handlers'].get(event) || []
		handlers.forEach(handler => {
			handler.callback(data, client)
		})
	}

	// Wait for an event (with timeout)
	async waitForEvent(
		eventType: string,
		timeout: number = 1000,
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
		options?: {
			data?: any
			to?: Receiver
			timeout?: number
		}
	): Promise<EventRecord> {
		if (options?.timeout) {
			return this.waitForEvent(eventType, options.timeout, record => {
				if (options.to && record.to !== options.to) return false
				if (options.data) {
					return JSON.stringify(record.data) === JSON.stringify(options.data)
				}
				return true
			})
		}

		const matches = this.eventManager.expectEvent(eventType, options)
		if (matches.length === 0) {
			throw new Error(`Expected event ${eventType} was not emitted`)
		}
		return Promise.resolve(matches[matches.length - 1])
	}

	// Advance time (for time-based tests)
	advanceTime(seconds: number): void {
		// Dispatch time tick events
		for (let i = 0; i < seconds; i++) {
			this.dispatch('ss:time:tick', { delta: 1000 })
		}
	}
}
```

## Test Structure and Organization

### Directory Structure

```
packages/game/
├── src/
│   └── ...
└── tests/
    ├── unit/
    │   ├── Buildings/
    │   ├── Population/
    │   └── ...
    ├── integration/
    │   ├── building-construction.test.ts
    │   ├── resource-collection.test.ts
    │   ├── production-pipeline.test.ts
    │   └── ...
    ├── helpers/
    │   ├── MockEventManager.ts
    │   ├── GameTestHelper.ts
    │   ├── TestContent.ts
    │   └── fixtures/
    └── setup.ts
```

### Test Setup

```typescript
// tests/setup.ts
import { GameManager } from '../src/index'
import { MockEventManager } from './helpers/MockEventManager'
import { GameTestHelper } from './helpers/GameTestHelper'
import { GameContent } from '../src/types'
import { MapUrlService } from '../src/Map/types'

export function createTestGame(content?: Partial<GameContent>): {
	game: GameManager
	eventManager: MockEventManager
	helper: GameTestHelper
} {
	const eventManager = new MockEventManager()
	
	const defaultContent: GameContent = {
		items: [],
		quests: [],
		npcs: [],
		cutscenes: [],
		flags: [],
		schedules: [],
		triggers: [],
		maps: {},
		...content
	}

	const mockMapUrlService: MapUrlService = {
		getMapUrl: async (mapId: string) => {
			return `/maps/${mapId}.json`
		}
	}

	const game = new GameManager(eventManager, defaultContent, mockMapUrlService)
	const helper = new GameTestHelper(game, eventManager)

	return { game, eventManager, helper }
}
```

## Testing Patterns

### Pattern 1: Event-Driven Integration Test

Test a complete flow by dispatching events and verifying outcomes:

```typescript
describe('Building Construction Flow', () => {
	it('should complete building construction when resources are delivered', async () => {
		const { eventManager, helper } = createTestGame({
			buildings: [/* building definitions */],
			items: [/* item definitions */]
		})

		// 1. Place a building
		helper.dispatch(Event.Buildings.CS.Place, {
			buildingType: 'house',
			position: { x: 100, y: 100 }
		})

		// 2. Verify building was placed
		await helper.expectEvent(Event.Buildings.SC.Placed, {
			timeout: 100
		})

		// 3. Deliver resources
		helper.dispatch(Event.Buildings.SS.Tick, {
			buildingId: 'building-1',
			resources: { logs: 10, stone: 5 }
		})

		// 4. Verify construction progress
		await helper.expectEvent(Event.Buildings.SC.Progress, {
			timeout: 100
		})

		// 5. Complete construction
		helper.advanceTime(10) // Simulate 10 seconds

		// 6. Verify completion
		await helper.expectEvent(Event.Buildings.SC.Completed, {
			timeout: 100
		})
	})
})
```

### Pattern 2: State Verification Test

Verify internal state after events:

```typescript
describe('Population Management', () => {
	it('should spawn settlers when house is completed', async () => {
		const { game, eventManager, helper } = createTestGame({
			buildings: [/* house definition */],
			startingPopulation: [{ profession: 'builder', count: 1 }]
		})

		// Complete a house
		helper.dispatch(Event.Buildings.SS.HouseCompleted, {
			buildingId: 'house-1'
		})

		// Wait for settler spawn event
		await helper.expectEvent(Event.Population.SC.SettlerSpawned, {
			timeout: 100
		})

		// Verify settler was created (if we expose getters)
		// This would require adding test-friendly getters to GameManager
		const settlers = game['populationManager']['settlers']
		expect(settlers.size).toBeGreaterThan(0)
	})
})
```

### Pattern 3: Event Sequence Test

Verify a sequence of events occurs in order:

```typescript
describe('Production Pipeline', () => {
	it('should process production when inputs are available', async () => {
		const { helper } = createTestGame({
			buildings: [/* sawmill definition */],
			items: [/* planks, logs definitions */]
		})

		// Start production
		helper.dispatch(Event.Production.CS.Start, {
			buildingId: 'sawmill-1',
			recipeId: 'logs-to-planks'
		})

		// Verify input request
		const inputRequest = await helper.expectEvent(
			Event.Storage.SC.InputRequested,
			{ timeout: 100 }
		)

		// Deliver inputs
		helper.dispatch(Event.Storage.SS.ItemsDelivered, {
			buildingId: 'sawmill-1',
			items: [{ itemType: 'logs', quantity: 1 }]
		})

		// Verify production started
		await helper.expectEvent(Event.Production.SC.Started, {
			timeout: 100
		})

		// Advance time to complete production
		helper.advanceTime(5)

		// Verify output produced
		await helper.expectEvent(Event.Production.SC.Completed, {
			timeout: 100
		})
	})
})
```

### Pattern 4: Error Handling Test

Test error scenarios:

```typescript
describe('Error Handling', () => {
	it('should handle invalid building placement', async () => {
		const { helper } = createTestGame()

		// Try to place building at invalid location
		helper.dispatch(Event.Buildings.CS.Place, {
			buildingType: 'house',
			position: { x: -100, y: -100 } // Invalid position
		})

		// Should not emit Placed event
		const placedEvents = helper.eventManager.getEventsByType(
			Event.Buildings.SC.Placed
		)
		expect(placedEvents).toHaveLength(0)
	})
})
```

## Example Test Cases

### Example 1: Complete Building Construction

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestGame } from './setup'
import { Event } from '../src/events'
import { Receiver } from '../src/types'

describe('Building Construction Integration', () => {
	let game: GameManager
	let eventManager: MockEventManager
	let helper: GameTestHelper

	beforeEach(() => {
		const setup = createTestGame({
			buildings: [
				{
					id: 'house',
					name: 'House',
					constructionStages: [
						{ resources: { logs: 10, stone: 5 }, time: 10 }
					]
				}
			],
			items: [
				{ id: 'logs', name: 'Logs' },
				{ id: 'stone', name: 'Stone' }
			]
		})
		game = setup.game
		eventManager = setup.eventManager
		helper = setup.helper
	})

	it('should construct a building when resources are delivered', async () => {
		// Place building
		helper.dispatch(Event.Buildings.CS.Place, {
			buildingType: 'house',
			position: { x: 100, y: 100 }
		}, { clientId: 'player-1' })

		// Verify placement
		const placed = await helper.expectEvent(
			Event.Buildings.SC.Placed,
			{ timeout: 100 }
		)
		expect(placed.data.buildingType).toBe('house')

		// Simulate resource delivery
		helper.dispatch(Event.Buildings.SS.Tick, {
			buildingId: placed.data.buildingId,
			resources: { logs: 10, stone: 5 }
		})

		// Verify stage change
		await helper.expectEvent(Event.Buildings.SC.StageChanged, {
			timeout: 100
		})

		// Advance time to complete construction
		helper.advanceTime(10)

		// Verify completion
		const completed = await helper.expectEvent(
			Event.Buildings.SC.Completed,
			{ timeout: 100 }
		)
		expect(completed.data.buildingId).toBe(placed.data.buildingId)
	})
})
```

### Example 2: Resource Collection and Transport

```typescript
describe('Resource Collection Flow', () => {
	it('should collect resources from ground and transport to building', async () => {
		const { helper } = createTestGame({
			buildings: [/* building definition */],
			items: [/* item definitions */]
		})

		// Place building requiring resources
		helper.dispatch(Event.Buildings.CS.Place, {
			buildingType: 'house',
			position: { x: 100, y: 100 }
		})

		const placed = await helper.expectEvent(
			Event.Buildings.SC.Placed,
			{ timeout: 100 }
		)

		// Spawn item on ground
		helper.dispatch(Event.Loot.SS.Spawn, {
			itemType: 'logs',
			position: { x: 50, y: 50 },
			quantity: 1
		})

		// Request transport job
		helper.dispatch(Event.Jobs.SS.RequestTransport, {
			buildingId: placed.data.buildingId,
			itemType: 'logs',
			quantity: 1
		})

		// Verify job was created
		await helper.expectEvent(Event.Jobs.SC.JobCreated, {
			timeout: 100
		})

		// Verify settler picked up item
		await helper.expectEvent(Event.Population.SC.ItemPickedUp, {
			timeout: 100
		})

		// Verify item delivered
		await helper.expectEvent(Event.Buildings.SC.ResourcesChanged, {
			timeout: 100
		})
	})
})
```

### Example 3: Production Pipeline

```typescript
describe('Production System', () => {
	it('should produce items when inputs are available', async () => {
		const { helper } = createTestGame({
			buildings: [
				{
					id: 'sawmill',
					name: 'Sawmill',
					production: {
						recipes: [{
							id: 'logs-to-planks',
							inputs: [{ itemType: 'logs', quantity: 1 }],
							outputs: [{ itemType: 'planks', quantity: 2 }],
							duration: 5
						}]
					}
				}
			],
			items: [
				{ id: 'logs', name: 'Logs' },
				{ id: 'planks', name: 'Planks' }
			]
		})

		// Start production
		helper.dispatch(Event.Production.CS.Start, {
			buildingId: 'sawmill-1',
			recipeId: 'logs-to-planks'
		})

		// Verify input request
		await helper.expectEvent(Event.Storage.SC.InputRequested, {
			timeout: 100
		})

		// Deliver inputs
		helper.dispatch(Event.Storage.SS.ItemsDelivered, {
			buildingId: 'sawmill-1',
			items: [{ itemType: 'logs', quantity: 1 }]
		})

		// Verify production started
		await helper.expectEvent(Event.Production.SC.Started, {
			timeout: 100
		})

		// Advance time
		helper.advanceTime(5)

		// Verify production completed
		const completed = await helper.expectEvent(
			Event.Production.SC.Completed,
			{ timeout: 100 }
		)
		expect(completed.data.outputs).toContainEqual({
			itemType: 'planks',
			quantity: 2
		})
	})
})
```

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Set up testing framework (Vitest recommended for TypeScript)
- [ ] Implement `MockEventManager` class
- [ ] Implement `GameTestHelper` class
- [ ] Create test setup utilities
- [ ] Write basic integration test example

### Phase 2: Core Testing Infrastructure (Week 2)
- [ ] Add event history tracking and querying
- [ ] Implement event waiting/expectation utilities
- [ ] Add time simulation helpers
- [ ] Create test content fixtures
- [ ] Document testing patterns

### Phase 3: Test Coverage (Week 3-4)
- [ ] Building construction tests
- [ ] Resource collection tests
- [ ] Production pipeline tests
- [ ] Population management tests
- [ ] Job assignment tests
- [ ] Storage system tests

### Phase 4: Advanced Features (Week 5)
- [ ] Performance testing utilities
- [ ] Stress testing helpers
- [ ] Test coverage reporting
- [ ] CI/CD integration
- [ ] Test documentation and examples

## Testing Framework Recommendation

### Vitest

**Why Vitest:**
- Native TypeScript support
- Fast execution (uses Vite)
- Jest-compatible API
- Built-in coverage
- Good ESM support
- Active development

**Installation:**
```bash
npm install -D vitest @vitest/ui
```

**Configuration (`vitest.config.ts`):**
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html']
		}
	}
})
```

## Best Practices

### 1. Test Isolation
- Each test should be independent
- Use `beforeEach` to set up fresh game instances
- Clear event history between tests

### 2. Event Assertions
- Be specific about event data when possible
- Use timeouts for async event waiting
- Verify event order when sequence matters

### 3. Test Content
- Use minimal test content fixtures
- Only include what's necessary for the test
- Reuse common fixtures across tests

### 4. Async Testing
- Use async/await for event waiting
- Set reasonable timeouts
- Handle timeout errors gracefully

### 5. Debugging
- Log event history when tests fail
- Use descriptive test names
- Add comments for complex test flows

## Future Enhancements

### 1. Visual Test Runner
- Create a UI to visualize event flows
- Show event timeline in tests
- Debug failed tests interactively

### 2. Property-Based Testing
- Use libraries like fast-check for property-based tests
- Generate random event sequences
- Verify invariants hold

### 3. Performance Testing
- Measure event processing time
- Test with large numbers of entities
- Profile memory usage

### 4. Snapshot Testing
- Snapshot game state at key points
- Verify state transitions
- Detect regressions

## Conclusion

This testing suite design provides a solid foundation for testing the Settlerpolis game engine. By mocking the `EventManager` and providing utilities to dispatch and expect events, we can write comprehensive integration tests that verify the game's behavior end-to-end.

The key advantages of this approach:
- **Isolation**: Tests don't require network or external services
- **Speed**: Synchronous event processing makes tests fast
- **Observability**: Full event history for debugging
- **Flexibility**: Easy to test various scenarios and edge cases
- **Maintainability**: Clear patterns and utilities reduce boilerplate

Next steps:
1. Implement the `MockEventManager` and `GameTestHelper` classes
2. Set up Vitest configuration
3. Write initial test cases for critical flows
4. Iterate based on testing needs

