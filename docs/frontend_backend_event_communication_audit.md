# Frontend/Backend Event Communication Audit

Date: 2026-04-21

## Objective
Understand how frontend and backend communicate today (local/worker/remote), then identify concrete scalability and latency improvements for a future internet deployment.

## Current Communication Paths

### 1) UI -> EventBus -> Transport
- Frontend UI emits domain events through `EventBus`.
- `MultiplayerService` forwards all `cs:*` events from `EventBus` to the active `EventManager`.
- It also subscribes to all known event names and re-emits incoming network events back to `EventBus`.

Relevant files:
- `packages/frontend/src/game/services/MultiplayerService.ts`
- `packages/frontend/src/game/EventBus.ts`

### 2) Transport modes
- Local in-process bridge: `LocalManager` (client and server instantiated together in one process).
- Worker bridge: `WorkerManager` + `engineWorker` (`GameManager` runs in worker, UI in main thread).
- Remote bridge: `NetworkManager` using Socket.IO.

Relevant files:
- `packages/frontend/src/game/network/LocalManager.ts`
- `packages/frontend/src/game/network/WorkerManager.ts`
- `packages/frontend/src/game/network/engineWorker.ts`
- `packages/frontend/src/game/network/NetworkManager.ts`

### 3) Backend routing
- `EventBusManager` routes by prefix:
  - `cs:*` from network to game handlers
  - `sc:*` from game to network
  - `ss:*` internal server-only dispatch
- `NetworkManager` handles groups, socket registration, and fanout.

Relevant files:
- `packages/backend/src/EventBusManager.ts`
- `packages/backend/src/NetworkManager.ts`
- `packages/backend/src/index.ts`

## Key Findings

### A. Remote mode is not currently selectable by environment
- Frontend hardcodes `IS_REMOTE_GAME = false`.
- Remote URL is hardcoded in code path rather than using `VITE_SERVER_URL`.

Impact:
- Hard to stage/prod test real internet transport behavior.
- Blocks realistic latency/load validation before rollout.

### B. Broad subscription model creates avoidable overhead
- `MultiplayerService` discovers all event names recursively and subscribes transport handlers for every event.
- Event catalog currently contains roughly 203 event constants (`45 cs`, `95 sc`, `63 ss` by scan of `*events.ts`).

Impact:
- High listener count on client even though only a subset is needed at runtime.
- More work per connect/disconnect, larger memory footprint, harder profiling.

### C. Local bridge clones every payload via JSON serialization
- `LocalManager` uses `JSON.stringify/parse` for each forwarded event payload.

Impact:
- Adds CPU overhead and allocation pressure in local mode.
- Can mask real transport costs and skew profiling results.

### D. Backend network debug logging is enabled in hot paths
- `packages/backend/src/NetworkManager.ts` sets `debug = true`.
- Logs are emitted on connection, event registration, event receipt, routing, timeout scans, and timestamp updates.

Impact:
- Significant throughput reduction under load.
- Increased event-loop contention and noisy logs.

### E. Listener attachment scales with `events x sockets`
- Backend attaches per-socket handlers for each registered event name.
- Frontend similarly installs one socket listener per event name when active.

Impact:
- Linear growth in listeners with both event surface and concurrent connections.
- Higher memory and setup overhead as player count grows.

### F. Worker/main-thread message queue has no backpressure policy
- `WorkerManager` buffers pending messages until ready.
- No queue ceiling or coalescing policy for high-frequency event bursts.

Impact:
- Potential memory growth and burst latency after stalls.

## Internet-Ready Scalability Plan

### Phase 1: Low-risk wins (do first)
1. Make transport mode and server URL env-driven:
   - Replace hardcoded `IS_REMOTE_GAME` and URL with `VITE_GAME_REMOTE` + `VITE_SERVER_URL`.
2. Disable backend debug logs by default:
   - Gate logs behind env flag.
3. Split event forwarding into directional catalogs:
   - Only subscribe incoming `sc:*` transport events for UI forwarding.
   - Keep `cs:*` forwarding from `EventBus.onAny`.

Expected result:
- Less listener overhead, cleaner remote testing, immediate throughput gains.

### Phase 2: Transport efficiency
1. Replace per-event socket listeners with central dispatch:
   - Use `socket.onAny` in frontend/backend transport adapters.
2. Introduce event envelope metadata:
   - `event`, `scope` (map/player), `priority`, `sequence`, `sentAt`.
3. Add coalescing for high-churn state:
   - Merge repeated updates per entity/map inside a short window (for example 20-50ms) before send.

Expected result:
- Lower handler churn and packet count.
- Better tolerance to network jitter.

### Phase 3: Interest management and sharding preparation
1. Formalize audience filters by scope:
   - Keep map-level channels.
   - Add optional area-of-interest slices for dense maps.
2. Move toward instance-per-world (or per-map-cluster) server topology:
   - Front transport remains same interface; backend simulation instances scale horizontally.
3. Add admission/backpressure policies:
   - Queue caps and drop/degrade policy for non-critical visual updates.

Expected result:
- Predictable scaling with player and map growth.

## Performance Instrumentation To Add Before/After Changes
1. Event counters by name and direction (`cs/sc/ss`) per second.
2. Payload size histograms per event.
3. End-to-end latency markers (`sentAt -> receivedAt`) for sampled events.
4. Queue depth metrics for worker and network send paths.
5. Per-tick simulation + network flush durations.

## Concrete hotspots (code anchors)
- Hardcoded local mode and remote URL:
  - `packages/frontend/src/game/network/index.ts`
- Full-event subscription fanout:
  - `packages/frontend/src/game/services/MultiplayerService.ts`
- Local JSON clone on every event:
  - `packages/frontend/src/game/network/LocalManager.ts`
- Backend debug enabled + hot-path logs:
  - `packages/backend/src/NetworkManager.ts`
- Prefix routing boundary:
  - `packages/backend/src/EventBusManager.ts`

