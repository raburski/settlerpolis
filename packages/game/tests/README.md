# Testing Framework

This directory contains the testing infrastructure for the Settlerpolis game engine.

## Setup

The testing framework uses [Vitest](https://vitest.dev/) for running tests. Install dependencies:

```bash
npm install
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Test Structure

```
tests/
├── helpers/
│   ├── MockEventManager.ts    # Mock implementation of EventManager
│   ├── GameTestHelper.ts      # Helper utilities for testing
│   └── setup.ts               # Test setup utilities
├── fixtures/                  # Reusable test data
│   ├── buildings.ts           # Common building definitions
│   ├── items.ts               # Common item definitions
│   └── index.ts               # Export all fixtures
├── integration/               # Integration tests
│   └── building-construction.test.ts
└── unit/                      # Unit tests (future)
```

## Usage

### Basic Test Setup

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestGame } from '../helpers/setup'
import { Event } from '../../src/events'

describe('My Test Suite', () => {
	let game: ReturnType<typeof createTestGame>['game']
	let eventManager: ReturnType<typeof createTestGame>['eventManager']
	let helper: ReturnType<typeof createTestGame>['helper']

	beforeEach(() => {
		const setup = createTestGame({
			// Optional: provide test content
			buildings: [/* ... */],
			items: [/* ... */]
		})
		game = setup.game
		eventManager = setup.eventManager
		helper = setup.helper
		eventManager.clearEventHistory()
	})

	it('should do something', async () => {
		// Dispatch an event
		helper.dispatch(Event.Buildings.CS.Place, {
			buildingId: 'house',
			position: { x: 100, y: 100 }
		})

		// Wait for and expect an event (uses default timeout)
		const placed = await helper.expectEvent(Event.Buildings.SC.Placed)

		expect(placed.data.building.buildingId).toBe('house')
	})
})
```

### Dispatching Events

The `helper.dispatch()` method automatically handles both client-to-server (`cs:`) and server-to-server (`ss:`) events:

```typescript
// Client-to-server event (with optional client ID)
helper.dispatch(Event.Buildings.CS.Place, {
	buildingId: 'house',
	position: { x: 100, y: 100 }
}, { clientId: 'player-1' })

// Server-to-server event
helper.dispatch(Event.Buildings.SS.Tick, {
	buildingId: 'building-1',
	resources: { logs: 10 }
})
```

### Expecting Events

The `expectEvent` method has a default timeout of 1000ms, so you can use it without any options:

```typescript
// Wait for an event (uses default 1000ms timeout)
const event = await helper.expectEvent(Event.Buildings.SC.Placed)

// Custom timeout (pass number directly)
const event = await helper.expectEvent(Event.Buildings.SC.Placed, 100)

// Expect event with specific data
await helper.expectEvent(Event.Buildings.SC.Placed, {
	data: { building: { buildingId: 'house' } }
})

// Expect event sent to specific receiver
await helper.expectEvent(Event.Buildings.SC.Placed, {
	to: Receiver.Sender
})

// Custom timeout with options
await helper.expectEvent(Event.Buildings.SC.Placed, {
	data: { building: { buildingId: 'house' } },
	timeout: 500
})

// Change default timeout for all expectEvent calls
helper.setDefaultTimeout(2000) // 2 seconds
```

### Event History

Query emitted events:

```typescript
// Get all emitted events
const allEvents = eventManager.getEmittedEvents()

// Get events by type
const placedEvents = eventManager.getEventsByType(Event.Buildings.SC.Placed)

// Get events by prefix
const buildingEvents = eventManager.getEventsByPrefix('sc:buildings:')

// Clear event history
eventManager.clearEventHistory()
```

### Time Simulation

Simulate time passing for time-based tests:

```typescript
// Advance time by 10 seconds
helper.advanceTime(10)
```

## MockEventManager

The `MockEventManager` implements the `EventManager` interface and:
- Tracks all emitted events for assertions
- Executes event handlers synchronously
- Provides query methods for event history
- Supports simulating client join/leave

## GameTestHelper

The `GameTestHelper` provides utilities for:
- Dispatching events (automatically handles `cs:` and `ss:` prefixes)
- Waiting for events with timeouts
- Expecting specific events with data validation
- Simulating time passage

### Using Test Fixtures

Instead of defining buildings and items inline, import fixtures directly for better readability:

```typescript
import { house, storehouse } from '../fixtures/buildings'
import { logs, stone, planks } from '../fixtures/items'

beforeEach(() => {
	const setup = createTestGame({
		buildings: [house, storehouse],
		items: [logs, stone, planks]
	})
	// ...
})
```

Or import from the fixtures index:
```typescript
import { house, logs, stone } from '../fixtures'
```

Available fixtures:
- **Buildings**: `house`, `storehouse`, `woodcutterHut`
- **Items**: `logs`, `stone`, `planks`, `carrot`, `hammer`, `axe`, `buildingFoundation`

## Best Practices

1. **Test Isolation**: Always clear event history in `beforeEach`
2. **Timeouts**: Use reasonable timeouts for async event waiting (default: 1000ms)
3. **Event Data**: Be specific about event data when possible
4. **Test Content**: Use fixtures instead of inline definitions for better readability
5. **Async Testing**: Use async/await for event waiting

## Examples

See `integration/building-construction.test.ts` for a complete example.

