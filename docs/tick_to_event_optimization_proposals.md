# Tick-to-Event Optimization Proposals

## Purpose
Capture performance and responsiveness proposals discovered during the tick-logic review, without implementing code yet.

## Scope
This document targets simulation modules currently driven by periodic `SimulationEvents.SS.Tick` loops and proposes where event-driven or deadline-driven processing can safely replace full periodic scans.

## High-Level Findings
- A few modules are naturally time-driven and should remain tick-based.
- Several modules currently do broad scans each tick/second and can be converted to:
	- event-triggered invalidation + targeted recompute
	- deadline queues (next due time)
	- incremental caches/indexes
- The biggest immediate win is `WorkProvider` + `LogisticsCoordinator`.

---

## 1) WorkProvider + LogisticsCoordinator (highest priority)

### Current pattern
- `WorkProviderManager.handleSimulationTick` runs a chain of global operations every tick.
- `LogisticsCoordinator.tick()` refreshes construction/consumption/warehouse requests and emits updates each run.
- Construction and road assignment scans are called from the same tick path.

### Proposal
Replace broad per-tick recomputation with dirty-event driven recomputation.

### Design
1. Add invalidation triggers (dirty sets/queues) instead of full scans.
	- Mark buildings/maps dirty on storage changes, building resource/stage changes, assignment changes, and road job changes.
2. Recompute only for dirty entities.
	- Keep separate dirty groups:
		- `dirtyConstructionBuildings`
		- `dirtyConsumptionBuildings`
		- `dirtyWarehouseBuildings`
		- `dirtyLogisticsMapsForBroadcast`
3. Make logistics broadcasts change-driven.
	- Emit only if payload for a map changed from previous snapshot/hash.
4. Move worker assignment attempts to event-triggered scheduling.
	- Trigger construction/road assignment when jobs/buildings/availability change.
	- Keep low-frequency fallback audit for safety.
5. Keep a reconciliation fallback.
	- Run a slower periodic audit (for example 3-5s) to recover from missed invalidations.

### Expected impact
- Lower unnecessary looping over all buildings/requests each tick.
- Faster response to real state changes (no waiting for next broad pass).
- Reduced network/UI churn from repeated unchanged logistics broadcasts.

### Main risks
- Missed invalidation paths could stall requests or assignments.
- Requires careful event contract definition between `Buildings`, `Storage`, `Roads`, and `WorkProvider`.

---

## 2) CityCharter requirement evaluation

### Current pattern
- Re-evaluates all tracked states every second.
- Each refresh rebuilds requirement context by scanning population/buildings/storage.

### Proposal
- Switch to event-triggered refresh per `(playerId, mapId)` state.
- Trigger on relevant changes only:
	- population updates
	- building stage/count updates
	- storage total changes (or bucket-level change notifications)
- Keep periodic slow fallback audit for correctness.

### Expected impact
- Removes repeated full requirement recomputation when nothing changed.

---

## 3) Population house spawn scheduling

### Current pattern
- Iterates all `houseSpawnSchedule` entries on each simulation tick.

### Proposal
- Use next-due scheduling:
	- Track earliest `nextSpawnAtMs`.
	- Skip schedule scan until that deadline is reached.
	- Process due houses and compute next earliest deadline.

### Expected impact
- Same behavior, less constant overhead with larger house counts.

---

## 4) NeedInterruptController cooldown handling

### Current pattern
- Decrements cooldown counters for all tracked settlers each tick.

### Proposal
- Store absolute `cooldownUntilMs` per need.
- Check cooldown validity only when need triggers occur.

### Expected impact
- Removes periodic cooldown decrement loop entirely.

---

## 5) ResourceNodes lifecycle checks (regen/spoil/despawn)

### Current pattern
- Scans all nodes every tick for maturity/spoil/despawn transitions.

### Proposal
- Introduce deadline-driven processing:
	- maintain next due times for node transitions
	- process only due nodes when `nowMs >= nextDueAtMs`
- Alternative interim step: run node lifecycle checks on slower tick instead of base tick.

### Expected impact
- Significant reduction in full-node scans.

---

## 6) Wildlife processing (respawn/verify/roam)

### Current pattern
- Multiple tick listeners; interval logic managed via accumulators.
- Roam/verify iterate broad structures.

### Proposal
- Consolidate into one scheduler path using next-due timestamps.
- Process respawn, verify, and roam only when respective due time is reached.
- Optional: move costly verify path to very slow cadence or trigger by map/resource topology changes.

### Expected impact
- Less repeated overhead while preserving existing behavior windows.

---

## 7) NPC routine checks

### Current pattern
- Called from simulation tick and exits unless time key changed.

### Proposal
- Trigger routine checks from time-change event (minute boundary), not simulation tick polling.
- Add an internal minute update event from `TimeManager` if needed.

### Expected impact
- Eliminates unnecessary per-tick time-string checks.

---

## 8) Trade route state machine

### Current pattern
- Iterates all routes each second to drive loading/travel/cooldown state changes.

### Proposal
- Hybrid model:
	- Event-driven for loading readiness (storage/availability changes).
	- Deadline-driven for outbound/return/cooldown timers using per-route wake times.
- Keep small periodic safety pass.

### Expected impact
- Lower route scanning overhead and better responsiveness to storage changes.

---

## 9) Loot cleanup and item lookup

### Current pattern
- Periodic expiration pass scans map item lists.
- Expired removal path uses `includes` in filter, creating avoidable quadratic behavior.

### Proposal
- Use a min-expiry structure or map-level next-expiry timestamps to avoid broad scans.
- Replace `includes` filtering with `Set` membership during cleanup.

### Expected impact
- Lower cleanup cost and better scaling with item count.

---

## 10) Storage spoilage and totals computations

### Current pattern
- Spoilage tick iterates all slots for all storages.
- Totals/capacity/quantity operations repeatedly scan structures.

### Proposal
- Track spoilable slots index; iterate only spoilage-relevant slots.
- Add cached aggregates per `(mapId, playerId, itemType)` invalidated on storage mutations.
- Reuse cached quantities/capacities in heavy caller paths.

### Expected impact
- Lower periodic slot iteration and reduced repeated aggregation cost.

---

## Modules That Should Stay Tick-Driven
- `Movement`: active movement tasks require continuous time progression and are already scoped to active tasks.
- `NeedsSystem`: already uses slower tick cadence and change-gated broadcasting; not a primary candidate.
- `SimulationManager` base tick itself remains the core clock.

---

## Suggested Rollout Order
1. `WorkProvider` + `LogisticsCoordinator` (dirty-event model + broadcast dedupe + fallback audit).
2. `CityCharter`, `Population` spawn scheduling, `NeedInterruptController` cooldown timestamps.
3. `ResourceNodes`, `Wildlife`, `Trade` deadline scheduling.
4. `Loot` and `Storage` cache/index optimizations.

---

## Validation Strategy (for later implementation)
- Add metrics before/after:
	- loop counts per module
	- recompute counts
	- emitted event counts
	- mean/max tick processing time
- Assert no gameplay regressions:
	- logistics request fulfillment
	- construction progression/completion
	- trade route cycle correctness
	- spawn/respawn timing bounds
	- UI consistency for charter/logistics/needs

