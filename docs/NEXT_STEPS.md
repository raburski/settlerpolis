Settlerpolis Next Steps

Purpose
This document outlines the next features and improvements to move the project toward Settlers IV-style gameplay, while staying compatible with the current architecture.

Guiding goals (short term)
- Deliver a playable settlement loop: place building → gather resources → transport → construction completes → production runs → storage reflects changes.
- Keep the simulation deterministic and event-driven across local and remote modes.
- Add only the minimum UI needed to visualize the new loop.

Phase 0: Stability & tooling (1–2 weeks)
1) Content pack cleanup
- Curate the new single content pack to remove story-only assets that don’t serve the RTS loop.
- Add a minimal Settlers-style map with resource nodes and clearer terrain layers (forest, quarry, fertile land).

2) Data schema tightening
- Define explicit building categories and production pipeline metadata in `BuildingDefinition`.
- Add resource node definitions to the content pack (trees, rocks, etc.) and expose them to `MapObjectsManager`.

3) Event payload typing coverage
- Add payload types for any missing events used in UI or managers.
- Establish a rule: new events must be added to `EventPayloads`.

Phase 1: Core settlement loop (2–4 weeks)
1) Resource nodes and harvesting
- Add a `ResourceNodeManager` (or extend `MapObjectsManager`) to define harvestable nodes.
- Add events:
  - cs:resources:harvest (client request)
  - sc:resources:node-updated (depletion state)
- Populate map with harvestable nodes in content pack.

2) Simple carrier logistics
- Implement a “pickup → deliver” job chain for carriers:
  - Source: node output or dropped items
  - Destination: building storage or construction site
- Reuse `JobsManager` and `StorageManager` with explicit reservation flows.

3) Construction completion loop
- Enforce building costs coming from storage/transport rather than free placement.
- Add a short UI status per building: missing inputs, waiting for builders, constructing, complete.

Phase 2: Production chains (4–6 weeks)
1) Tier-1 production buildings
- Woodcutter → logs
- Sawmill → planks
- Stonecutter/quarry → stone

2) Production priorities
- Allow buildings to request inputs from nearest storage (simple heuristic).
- Add a basic priority level in `BuildingDefinition` (low/normal/high).

3) Storage variety
- Add separate storage types (warehouse, granary) with capacity rules.
- Add UI that shows global stock and per-building buffer.

Phase 3: Territory & expansion (6–8 weeks)
1) Territory gating
- Implement `TerritoryManager` to control buildable area.
- Add watchtower building to expand territory.

2) Roads & speed
- Simple road layer that reduces travel time.
- Expose road cost and placement rules in content pack.

Phase 4: Population & military baseline (8–12 weeks)
1) Population needs
- Housing capacity required for growth.
- Basic food chain (grain → bread).

2) Military foundation
- Add `ArmyManager` with a single unit type and guard behavior.
- Add a simple aggression trigger (e.g., neutral camps).

Immediate recommendations (start next)
1) Resource nodes + harvesting
Why: unlocks the “Settlers loop” and makes construction inputs real.
Suggested scope:
- Add node definitions (tree, stone) to content pack.
- Add `ResourceNodeManager` with spawn/harvest/depletion.
- Add carrier jobs to transport node output to a storage building.

2) Storage-visible UI
Why: supports player feedback and debugging.
Suggested scope:
- Show a global stock summary in the HUD.
- For a selected building, show its input buffer and output buffer.

3) Construction input enforcement
Why: establishes the chain from resource → transport → build completion.
Suggested scope:
- Require actual deliveries to start building progress.
- Provide a temporary “missing resources” state and UI label.

Potential follow-ups
- Desync detection: add a periodic hash of key simulation state.
- Save/load: serialize the deterministic state for persistence and replays.
- Performance: batch tick processing and consider worker pools for pathfinding.

Open questions
- Do we want a single-faction prototype or multiple factions from day one?
- How strict should we be about realism vs. responsiveness in the early loop?
- Is the focus co-op, PvP, or both for early milestones?
