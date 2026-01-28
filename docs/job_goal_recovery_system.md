# Job/Goal Recovery System

## Goals
- Prevent settlers from getting stuck when targets disappear or goals become invalid.
- Provide a single source of truth for what each settler is doing.
- Make state transitions deterministic and self-healing.
- Scale cleanly to future mechanics (combat, hauling, harvesting, construction).

## Core Concepts

### Job
A job is the canonical record of *intent*.

```ts
type JobStatus = 'pending' | 'active' | 'completed' | 'cancelled' | 'failed'

type Job = {
	jobId: string
	jobType: 'tool_pickup' | 'move_to_building' | 'harvest' | 'transport' | 'construction' | 'production'
	ownerSettlerId?: string
	targetType: 'tool' | 'building' | 'resource' | 'item' | 'position'
	targetId?: string
	mapName: string
	playerId: string
	requiredProfession?: ProfessionType
	reservations: Reservation[]
	createdAt: number
	status: JobStatus
	reason?: string
}
```

### Reservation
Guarantees exclusivity on a target. Only one job can own a target.

```ts
type Reservation = {
	reservationId: string
	jobId: string
	targetType: 'tool' | 'building_slot' | 'resource' | 'item'
	targetId: string
	createdAt: number
	expiresAt?: number
}
```

## System Architecture

### JobsManager (single source of truth)
- Creates jobs.
- Assigns jobs to settlers.
- Maintains job state.
- Cancels jobs when targets become invalid.
- Owns reservation lifecycle.

### Target Managers (reservation providers)
- `LootManager` for tools/items
- `BuildingsManager` for worker slots
- `ResourceNodesManager` for harvest nodes
- `StorageManager` for transport reservations

Each manager should expose:
- `reserveTarget(targetId, jobId): Reservation | null`
- `releaseReservation(reservationId): void`
- `isReservationValid(reservationId): boolean`

### State Machine (execution layer)
Settlers do not pick targets directly. They execute jobs.

States are allowed only if a valid job exists:
- `Idle` (no job)
- `MovingToTool` (jobType=tool_pickup)
- `MovingToBuilding` (jobType=production/construction)
- `MovingToResource` (jobType=harvest)
- `Working`, `Harvesting`, `CarryingItem`

## Job Lifecycle

1) **Create job**
   - Check target availability.
   - Reserve target(s).
   - If reservation fails -> reject job.

2) **Assign job**
   - Pick eligible idle settler.
   - Set `ownerSettlerId`.
   - Move to active state.

3) **Execute job**
   - State machine transitions driven by job type.
   - Each transition validates target + reservation.

4) **Complete or cancel**
   - On success -> `completed`.
   - On failure -> `failed` or `cancelled`.
   - Always release reservations.

## Validation Rules (Self-Healing)

### On job start
- Target exists.
- Reservation valid.
- Required profession available (or tool pickup job exists).

### On path completion
- Target exists.
- Reservation still held by current job.
- If invalid -> cancel job and transition settler to Idle.

### Periodic watchdog
Server tick:
- If settler has a job but job is missing or invalid -> cancel job, set Idle.
- If job has no owner but still active -> cancel job (or reassign).

## Invalidating Events
Each target manager must emit invalidation events:

- `building_destroyed`
- `resource_depleted`
- `loot_despawned`
- `storage_reservation_invalidated`

JobsManager listens and cancels jobs referencing those targets.

## UI/Request Flow Examples

### Tool pickup (carrier -> woodcutter)
1) UI requests `tool_pickup` job for profession.
2) JobsManager finds a tool, reserves it, assigns carrier.
3) Settler moves to tool.
4) On pickup -> change profession, release reservation, job completed.

### Building destroyed mid-path
1) `BuildingsManager` emits `building_destroyed`.
2) JobsManager cancels all jobs with target=building.
3) Settler gets cancel event, transitions to Idle.

### Resource already harvested
1) `ResourceNodesManager` emits `resource_depleted`.
2) JobsManager cancels harvest jobs.
3) Settler returns Idle and releases reservation.

## Transition Rules (Standardized)

Every transition must accept a `jobId` and validate:
- job exists
- job is active
- reservation valid

Failure -> `cancelJob(jobId, reason)` and transition to Idle.

## Minimal Migration Plan

1) **Add reservation support**
   - Tool reservation in `LootManager`.
   - Resource reservation in `ResourceNodesManager`.
   - Building slot reservation in `BuildingsManager`.

2) **Create job types**
   - Convert tool pickup to jobs first.
   - Convert harvest next.
   - Convert building work next.

3) **Add watchdog**
   - Periodic validation of active jobs.

4) **Deprecate direct transitions**
   - All movement transitions should be job‑driven.

## Benefits
- No stuck settlers.
- Deterministic recovery.
- Easier debugging (job state is explicit).
- Scales to new features without fragile edge cases.
