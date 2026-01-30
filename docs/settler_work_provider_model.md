# Settler Work Provider Model — Implemented Architecture

Date: 2026-01-30
Status: Implemented (full revamp, all-at-once)
Scope: Work/harvest/production/transport + tool pickup (no needs yet)

## What changed
- Removed Jobs/Harvest/Production managers and the job state machine.
- Removed Population state-machine transitions tied to jobs.
- Replaced all work orchestration with the WorkProvider system.

## Code map (authoritative modules)
- Orchestrator + assignment: `packages/game/src/Settlers/WorkProvider/index.ts` (`WorkProviderManager`)
- Provider registry: `packages/game/src/Settlers/WorkProvider/ProviderRegistry.ts`
- Providers:
  - Building: `packages/game/src/Settlers/WorkProvider/providers/BuildingProvider.ts`
  - Logistics: `packages/game/src/Settlers/WorkProvider/providers/LogisticsProvider.ts`
- Action execution: `packages/game/src/Settlers/WorkProvider/ActionSystem.ts`
- Reservations: `packages/game/src/Settlers/WorkProvider/ReservationSystem.ts`
- Types/events: `packages/game/src/Settlers/WorkProvider/types.ts`, `packages/game/src/Settlers/WorkProvider/events.ts`

Population + Building integration:
- Settler assignment + state: `packages/game/src/Population/index.ts`
- Assignment stored in `SettlerStateContext.assignmentId/providerId`: `packages/game/src/Population/types.ts`
- Building storage + construction needs: `packages/game/src/Buildings/index.ts`

## Runtime flow (server)
1. UI requests worker -> `PopulationEvents.CS.RequestWorker`.
2. `WorkProviderManager` selects settler, creates `WorkAssignment`, sets state to `Assigned`, and binds to a provider.
3. Provider emits a `WorkStep` via `requestNextStep`.
4. `WorkProviderManager` compiles step into `WorkAction[]` and enqueues to `ActionSystem`.
5. `ActionSystem` executes actions (move/harvest/produce/transport) and emits action events.
6. Step completion -> next step requested; logistics workers unassign if no pending requests.

## Behavior coverage (concrete, in code)
### Woodcutter hut (harvest logs)
- Source: `content/settlerpolis/buildings.ts` (harvest node type + required profession)
- Provider: `BuildingProvider`
- Steps:
  - Ensure profession (AcquireTool if mismatch)
  - Harvest node (move -> wait -> harvest)
  - Deliver to building storage

### Sawmill (produce planks)
- Source: `content/settlerpolis/buildings.ts` (production recipe)
- Provider: `BuildingProvider`
- Steps:
  - Ensure profession
  - If inputs missing -> `LogisticsProvider.requestInput`
  - Produce (withdraw inputs -> wait -> deliver outputs)
  - If output full -> `LogisticsProvider.requestOutput`

### Transport (logistics)
- Provider: `LogisticsProvider`
- Requests:
  - Input (building missing inputs)
  - Output (building output full)
  - Construction input (buildings under construction)
- Steps:
  - Transport from storage or ground item -> target building storage/construction

## Tool pickup semantics (capability, not work)
- Assignment happens immediately; settler remains assigned while prerequisites are satisfied.
- Provider returns `acquire_tool` when profession mismatch.
- `WorkProviderManager` reserves tool from loot and issues move + pickup + change profession actions.
- If no tool available, settler waits and retries; assignment stays reserved.

## Data-driven dependencies
- Building definitions control harvest/production recipes and required professions.
- Logistics requests are emitted based on storage capacity and construction needs.
- Relationships are discoverable in provider code + content definitions.

## Event bus integration (server-side)
- Work Provider events (ss:):
  - `ss:work:assignment-created`
  - `ss:work:assignment-removed`
  - `ss:work:step-issued`
  - `ss:work:step-completed`
  - `ss:work:step-failed`
  - `ss:work:action-completed`
  - `ss:work:action-failed`
- Population events (sc:):
  - `sc:population:worker-assigned`
  - `sc:population:worker-unassigned`

## Removed systems (no longer authoritative)
- `packages/game/src/Jobs`
- `packages/game/src/Harvest`
- `packages/game/src/Population/StateMachine.ts`
- `packages/game/src/Population/transitions`
- `packages/game/src/Production/index.ts`

## Known gaps / next extensions
- Needs interrupt system (eat/sleep) not implemented yet.
- Additional providers can be added without touching the orchestrator.
- If we want a visual graph, export `WorkStep` dependencies into a JSON tree (see `docs/settler_lifecycle_architecture.md`).
