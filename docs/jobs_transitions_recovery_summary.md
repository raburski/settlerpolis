# Jobs, Transitions, and Recovery: Current State

This document summarizes what has been implemented so far around jobs, transitions, and recovery behavior.

## Jobs (Current Behavior)

### Where jobs live
- `packages/game/src/Jobs/index.ts`

### What jobs do today
- Jobs are created by `JobsManager` and stored as `JobAssignment`.
- Construction/production jobs are created as **pending** until the worker arrives at the building.
- Harvest jobs are created **active** immediately and reserve a resource node.
- Transport jobs are created and handled by JobsManager’s transport flow.
- Job status transitions are updated by transitions (ex: builder arrives -> job becomes active).

### Where jobs connect to transitions
- `PopulationManager.assignWorkerToJob` kicks off transitions based on job assignment.
- Transitions read `settler.stateContext.jobId` and query `JobsManager` for job data.
- `MovingToBuilding_Working` calls `JobsManager.assignWorkerToJob()` to set job to active.

## Transitions (Current Behavior)

### Where transitions live
- `packages/game/src/Population/transitions/*`

### What was changed
- Immediate‑arrival edge case: if `moveToPosition` returns `false`, the transition now emits
  `MovementEvents.SS.StepComplete` and `MovementEvents.SS.PathComplete` on the next tick.
  - Implemented in:
    - `Idle_MovingToTool`
    - `Idle_MovingToBuilding`
    - `Idle_MovingToResource`
    - `Idle_MovingToItem`

### Tool pickup safety
- `Idle_MovingToTool` now validates loot reservation in `completed`.
- If the reservation is lost, it returns `Idle`.

## Loot Reservations (Tool Pickup)

### Where it lives
- `packages/game/src/Loot/index.ts`

### What was added
- `reserveItem(itemId, ownerId)`
- `releaseReservation(itemId, ownerId?)`
- `isReservationValid(itemId, ownerId)`
- `isItemAvailable(itemId)`
- `getAvailableItemByType(mapId, itemType)`

### Usage
- `PopulationManager.requestProfessionToolPickup` reserves the tool before starting movement.
- `PopulationManager.findToolOnMap` now returns only **available (unreserved)** tools.
- Reservations are released on pickup or cleanup.

## Recovery Tick (Safety Net)

### Where it lives
- `PopulationManager.startRecoveryTickLoop` / `processRecoveryTick`
- `packages/game/src/Population/index.ts`

### Why it was added
To prevent settlers from getting stuck when:
- target disappears
- job cancels
- reservation is lost
- no path or no completion is triggered

### What it does
Every second, it:
- Validates jobs for settlers with `stateContext.jobId`.
  - **Important:** jobs are allowed to be `pending`.
  - Recovery happens only if job is `cancelled` or `completed`.
- Validates tool pickups (tool exists and reservation valid).
- Validates building work (building still exists).
- Validates harvest (node exists and reservation matches).
- Validates transport (job still exists).

If validation fails, it:
- Cancels movement
- Releases tool reservation (if applicable)
- Cancels the job (if applicable)
- Sets settler to `Idle`
- Emits `PopulationEvents.SC.SettlerUpdated`

## Summary of Files Modified

- `packages/game/src/Loot/index.ts`
  - Tool reservations + availability helpers
- `packages/game/src/Population/index.ts`
  - Recovery tick + tool reservation flow
- `packages/game/src/Population/transitions/Idle_MovingToTool.ts`
  - Reservation validation + immediate arrival
- `packages/game/src/Population/transitions/Idle_MovingToBuilding.ts`
  - Immediate arrival
- `packages/game/src/Population/transitions/Idle_MovingToResource.ts`
  - Immediate arrival
- `packages/game/src/Population/transitions/Idle_MovingToItem.ts`
  - Immediate arrival

## Open Gaps

- Jobs are **not yet defined as explicit transition graphs**.
- Recovery tick remains a safety net until transitions and jobs are unified.
- Target invalidation events (building destroyed/resource depleted/loot despawned) are not yet wired into JobsManager for immediate cancelation.
