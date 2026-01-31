# Settler Lifecycle Architecture (Implemented)

Date: 2026-01-30
Status: Implemented (full revamp)
Owner: (TBD)

## Goals
- Full refactor of settler lifecycle, not partial changes.
- Clean, modular, and discoverable code layout.
- Data-driven relationships (what can happen, when, and why).
- Code-driven execution (how it happens) inside clearly named modules.
- Event-driven by default; ticks only as support.
- Easy to add new jobs/behaviors with minimal coupling.

## Verified behaviors (must work)
These are in content and now supported by the new system:

1) Woodcutter hut harvests logs
- Building: `woodcutter_hut` in `content/settlerpolis/buildings.ts`
- Harvests tree nodes and stores logs in the hut storage.

2) Sawmill produces planks from logs
- Building: `sawmill` in `content/settlerpolis/buildings.ts`
- Uses production recipe: logs -> planks
- Inputs and outputs go through storage.

3) Transport/carry
- Logistics moves items from storage or ground to target buildings.
- Used for inputs, outputs, and construction resources.

4) Employment + eligibility
- Settler must be assigned to a building to do its work.
- If a tool/profession is missing, the assignment remains reserved while the settler fetches the tool.

5) Tool pickup to change profession
- Tools defined in `content/settlerpolis/professionTools.ts`.
- Tools are reserved from loot, picked up, and then profession changes.

## Implemented architecture (authoritative)
### Core modules
- Orchestration + assignment: `packages/game/src/Settlers/WorkProvider/index.ts` (`WorkProviderManager`)
- Providers:
  - Building: `packages/game/src/Settlers/WorkProvider/providers/BuildingProvider.ts`
  - Logistics: `packages/game/src/Settlers/WorkProvider/providers/LogisticsProvider.ts`
- Action execution: `packages/game/src/Settlers/WorkProvider/ActionSystem.ts`
- Reservations: `packages/game/src/Settlers/WorkProvider/ReservationSystem.ts`
- Types/events: `packages/game/src/Settlers/WorkProvider/types.ts`, `packages/game/src/Settlers/WorkProvider/events.ts`

### Work/needs split (current + future)
- Work is the execution lane for assigned settlers.
- Needs (eat/sleep) are intended as interrupts but are not implemented yet.
- Tool pickup is a capability prerequisite, not “work”. It is triggered by assignment and executed before work.

### Orchestration (“brain”)
We evaluated three options (central orchestrator, goal planner, behavior graph). We implemented the **central orchestrator** pattern with strict boundaries:
- `WorkProviderManager` owns assignment + step orchestration.
- Providers own domain logic (building vs logistics).
- ActionSystem owns execution details.
This keeps the flow readable while avoiding a giant state machine.

## Runtime flow (server)
1. UI requests worker -> `PopulationEvents.CS.RequestWorker`.
2. `WorkProviderManager` assigns settler, records `WorkAssignment`, sets state to `Assigned`.
3. Provider returns a `WorkStep` via `requestNextStep`.
4. Step compiles to `WorkAction[]` and is executed by `ActionSystem`.
5. On completion, provider is queried again for the next step.

## Work steps (concrete, in code)
- `acquire_tool`: reserve tool -> move -> pickup -> change profession
- `harvest`: move to node -> wait -> harvest -> deliver to storage
- `produce`: withdraw inputs -> wait -> deliver outputs
- `transport`: move/pickup -> deliver to storage or construction
- `wait`: backoff/retry

## Data-driven dependencies (current)
- Building definitions drive harvest/production and required professions.
- Storage capacity + resource availability gate step issuance.
- Logistics requests are derived from building needs and storage pressure.

## Event integration
Work Provider events (server-side):
- `ss:work:assignment-created`
- `ss:work:assignment-removed`
- `ss:work:step-issued`
- `ss:work:step-completed`
- `ss:work:step-failed`
- `ss:work:action-completed`
- `ss:work:action-failed`

Population events (client-facing):
- `sc:population:worker-assigned`
- `sc:population:worker-unassigned`
- `sc:population:settler-updated`

## Graph-based representation (JSON, optional)
We can still represent dependencies as a graph for visualization. This is optional and not runtime-critical.

```json
{
  "nodes": [
    { "id": "assigned", "type": "state" },
    { "id": "capability_tool", "type": "capability" },
    { "id": "work_harvest", "type": "work" },
    { "id": "work_production", "type": "work" },
    { "id": "work_transport", "type": "work" },
    { "id": "idle", "type": "state" }
  ],
  "edges": [
    { "from": "assigned", "to": "capability_tool", "when": "profession_missing" },
    { "from": "capability_tool", "to": "work_harvest", "when": "assigned_to_harvest" },
    { "from": "capability_tool", "to": "work_production", "when": "assigned_to_production" },
    { "from": "assigned", "to": "work_transport", "when": "assigned_to_logistics" },
    { "from": "work_harvest", "to": "assigned", "when": "step_complete" },
    { "from": "work_production", "to": "assigned", "when": "step_complete" }
  ]
}
```

## Tree-view schema (JSON-first)
This is a tree-friendly schema that is easy to inspect with JSON viewers.

```json
{
  "version": 1,
  "domains": {
    "assignment": {
      "states": {
        "assigned": {
          "description": "Settler reserved for a provider",
          "on_enter": ["evaluate_prereqs"]
        }
      }
    },
    "capabilities": {
      "tool_pickup": {
        "description": "Acquire tool to satisfy profession",
        "triggered_by": ["assignment.assigned"],
        "requires": ["tool.available", "settler.idle"],
        "steps": ["reserve_tool", "move_to_tool", "pickup_tool", "change_profession"],
        "unblocks": ["work.harvest", "work.production"]
      }
    },
    "work": {
      "harvest": {
        "requires": ["assignment.assigned", "profession.ok", "resource.node_available", "storage.capacity_available"],
        "steps": ["move_to_node", "harvest", "deliver_to_storage"]
      },
      "production": {
        "requires": ["assignment.assigned", "profession.ok", "inputs.available"],
        "steps": ["withdraw_inputs", "produce", "deliver_outputs"]
      },
      "transport": {
        "requires": ["assignment.assigned", "logistics.request_available"],
        "steps": ["pickup_item", "deliver_item"]
      }
    }
  }
}
```

## Removed legacy systems
- `packages/game/src/Jobs`
- `packages/game/src/Harvest`
- `packages/game/src/Population/StateMachine.ts`
- `packages/game/src/Population/transitions`
- `packages/game/src/Production/index.ts`

## Next extensions (if/when)
- Needs interrupt system (eat/sleep).
- Provider-specific work nodes or recipes (more job types).
- Export graph JSON to a small visualization page if desired.
