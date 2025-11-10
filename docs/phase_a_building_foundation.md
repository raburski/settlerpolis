## Phase A — Construction Foundation Plan

### Objective
Deliver a fully playable construction slice where players can choose a starter structure, place it on the map, watch foundation-to-complete progress, and cancel if needed. The slice must operate in local and remote multiplayer modes, exercising the shared simulation core and frontend UI pipeline end-to-end.

---

### Existing Building Blocks
- **Map Objects (`packages/game/src/MapObjects`)**  
	Already handles placement/removal of generic placeables using item metadata (`placement.size`, `blocksPlacement`). Buildings should layer on these primitives to avoid duplicating collision code.  
	```188:214:packages/game/src/MapObjects/index.ts
	public placeObject(playerId: string, data: PlaceObjectData, client: EventClient): boolean {
		// ... existing code ...
	}
	```
- **Items Metadata (`packages/game/src/Items/types.ts`)**  
	Supports defining `placement` footprint for `ItemCategory.Placeable`. We can reuse this to describe building footprint but will need richer building-specific fields (production timers, costs).
- **Scheduler (`packages/game/src/Scheduler`)**  
	Provides ticking infrastructure consumed by quests/time systems; construction timers should subscribe here.  
- **Event Infrastructure (`packages/game/src/events.ts`)**  
	Event routing already segments `cs:`/`sc:`/`ss:` flows through adapters. New building events must be added to the shared `Event` namespace so both adapters auto-wire them.

---

### Shared Game Package Additions (`packages/game`)

**1. Content Schema**
- Extend `GameContent` with:
	- `buildings: BuildingDefinition[]` describing costs, footprint, construction time, unlock flags.
	- Optional `professions` stub if worker assignment is needed later (define but leave empty for Phase A).  
	```20:30:packages/game/src/types.ts
	export interface GameContent {
		// ... existing fields ...
		buildings: BuildingDefinition[]
	}
	```
- Introduce `src/Buildings/types.ts` for:
	- `BuildingDefinition`, `BuildingState`, `ConstructionStage`, `BuildingId`.
	- Input cost specification (items/resources) and UI metadata (icon, category).

**2. Events**
- Add `BuildingEvents` file mirroring other modules:
	- `Event.Buildings.CS.Place`, `.CS.Cancel`, `.CS.RequestPreview`.
	- `Event.Buildings.SC.Placed`, `.SC.Progress`, `.SC.Completed`, `.SC.Cancelled`.
	- `Event.Buildings.SS.Tick` for scheduler-driven updates (internal).
- Update `events.ts` to export `Buildings` namespace so adapters auto-register subscriptions.

**3. Manager**
- Create `src/Buildings/index.ts` implementing `BuildingManager`:
	- Keep per-map dictionaries keyed by `mapId` + `buildingInstanceId`.
	- Handle `cs:` requests:
		1. Validate player's inventory/resources.
		2. Call into `MapObjectsManager.placeObject` with placeholder/foundation asset.
		3. Reserve materials (remove from inventory or mark outstanding).
		4. Emit `sc:buildings.placed` with initial progress (0%).
	- Register with `Scheduler` to receive tick callbacks (e.g., every second). Each tick updates progress and emits `sc:buildings.progress`. Completed structures emit `sc:buildings.completed` and optionally replace the foundation MapObject with final sprite metadata.
	- On `cs:buildings.cancel`, refund partial materials and emit `sc:buildings.cancelled`.
	- Provide getters so other managers/UI can query building states during join/transition; piggyback on `Players.CS.Join` to send existing buildings to new client (similar to `MapObjectsManager.sendMapObjectsToClient`).
- Inject `BuildingManager` inside `GameManager` initialization sequence (after `MapObjectsManager`, before `PlayersManager`) so it can use inventory and map references.

**4. MapObjects Integration**
- Extend `MapObject.metadata` to include `buildingId`, `stage`, `progress`, enabling Phaser to render different animations.
- Add helper in `MapObjectsManager.placeObject` to accept optional `metadata` from `BuildingManager`. Avoid modifying collision logic.

**5. Inventory Interaction**
- Define simple `ConstructionCost` resolver inside `BuildingManager` to call `InventoryManager.hasItems` and `removeItems`. Use optimistic locking pattern (check before removal, rollback if placement or collision fails).

**6. Content Loader**
- Update `ContentLoader.loadBuildings()` to read new `buildings` array and register with `BuildingManager`.  
	- Optionally seed `MapObjectsManager` with any pre-placed buildings defined in content.

---

### Backend Adapter Touchpoints (`packages/backend`)
- **Event Bus**  
	No structural changes; adding `Event.Buildings.*` ensures `EventBusManager` proxies the new `cs:` calls from clients to the shared manager.
- **NetworkManager**  
	Ensure building events participate in group routing. `Receiver.Group` ensures only map participants receive updates; `BuildingManager` should pass `groupName` (map id) when emitting.
- **REST API (Optional)**  
	Expose `/api/buildings` read-only endpoint if frontend wants to fetch building catalog outside of event stream; for Phase A, content pack data can be embedded client-side, so this can be deferred.
- **Data Persistence (Future)**  
	Phase A runs in-memory. Document where persistence hooks would go (e.g., before calling `inventoryManager.removeItems`), but actual storage is out of scope.

---

### Frontend Adapter Scope (`packages/frontend`)

**1. Data Flow**
- `MultiplayerService` already forwards every shared event. Once `Event.Buildings` exists, React/Phaser systems will automatically receive `sc:` packets; no extra wiring needed beyond subscribing in UI/scene layers.

**2. UI Components (`game/components`)**
- Add `ConstructionPanel.tsx` to list available `BuildingDefinition`s, using data imported from content pack. Integrate into `UIContainer`.  
- Implement `BuildingButton` subcomponent that dispatches `cs:buildings.place` events via `EventBus.emit`.
- Provide `BuildingStatusHUD` overlay to show active constructions, using `useEffect` to subscribe to `sc:buildings.progress` via `EventBus`.

**3. Placement Ghost**
- In Phaser scene (likely `MapScene` or whichever handles interactions), add a placement controller:
	- Listen for `ConstructionPanel` selections through `EventBus` (e.g., `ui:construction.select`).  
	- Render translucent sprite matching building footprint, snap to grid, and enforce collision via `MapObjectsManager` sync (client can call `cs:buildings.requestPreview` for server validation or locally approximate using known footprints).
	- Emit `cs:buildings.place` when player confirms placement with final coordinates.

**4. Map Objects Rendering**
- Extend existing map object rendering to handle building metadata:
	- If `metadata.stage === 'foundation'`, show foundation sprite.
	- On `sc:buildings.progress`, update progress bar UI tied to object.
	- On completion, swap to final sprite and maybe enable additional interactions (Phase B placeholder hooks).

**5. Cancel Interaction**
- Provide UI or hotkey to cancel a selected construction site, emitting `cs:buildings.cancel` with the building instance id.

**6. Content Synchronization**
- Ensure building catalog is loaded before UI renders:
	- Import from content pack at build-time alongside existing item data, or request via new `sc:buildings.catalog` event triggered when client joins.
- Update `scripts/load-content.js` to copy building sprites (foundations, completed states) into `public/assets/buildings`.

---

### Content Pack Updates (`content/settlers`)
- Add `buildings.ts` enumerating Phase A structures (e.g., `woodcutter_hut`, `storehouse`).  
- Update pack `index.ts` to export `buildings` field.  
- Provide placeholder sprites (`assets/buildings/<id>_foundation.png`, `<id>_complete.png`).  
- Define construction costs using existing items (`logs`, `stone`). If necessary, create simple resource items in `items.ts`.

---

### Event/State Lifecycle
1. **Selection**  
	Frontend UI selects building → `EventBus.emit('ui:construction.select', buildingId)`.  
	Phaser shows footprint ghost.
2. **Placement Request**  
	Ghost confirm → `EventBus.emit(Event.Buildings.CS.Place, { buildingId, position })`.  
	MultiplayerService forwards to shared core.
3. **Validation & Reservation**  
	`BuildingManager` checks inventory, map collision, and queue capacity. On success:
	- Deduct materials via `InventoryManager`.  
	- Reserve map slot by calling `MapObjectsManager.placeObject` with metadata stage `foundation`.  
	- Emit `sc:buildings.placed` + initial progress.
4. **Progress Loop**  
	Scheduler tick → `BuildingManager` increments progress. Emits `sc:buildings.progress` per update.  
	Frontend updates progress overlay.
5. **Completion**  
	When progress reaches 100%:
	- Update `MapObject.metadata.stage = 'completed'`.  
	- Emit `sc:buildings.completed`, optionally include new interaction data (e.g., available jobs).  
	- Frontend swaps sprite, removes progress UI.
6. **Cancellation**  
	If player cancels:
	- `BuildingManager` stops timer, refunds partial materials, removes MapObject, and emits `sc:buildings.cancelled`.

---

### Files To Touch (Initial Implementation)
- `packages/game/src/types.ts` – extend `GameContent`.
- `packages/game/src/events.ts` – register `Buildings` namespace.
- `packages/game/src/Buildings/` – new directory for manager, events, types.
- `packages/game/src/GameManager.ts` – inject `BuildingManager`.
- `packages/game/src/ContentLoader/index.ts` – load buildings list.
- `packages/backend/src` – no new files; ensure imports update if TypeScript strict mode requires.
- `packages/frontend/src/game/components/ConstructionPanel.tsx` – new UI panel.
- `packages/frontend/src/game/components/UIContainer.tsx` – include `ConstructionPanel`.
- `packages/frontend/src/game/scenes/MapScene.ts` (or equivalent) – placement logic.
- `packages/frontend/src/game/EventBus.ts` consumers – subscribe to new `sc:` events.
- `packages/frontend/scripts/load-content.js` – copy building sprites.
- `content/<pack>/buildings.ts` and `index.ts` – define building catalog.
- `public/assets/buildings/*` – new assets (copied by script).

---

### Testing & Verification
- **Unit-like**: Add Jest or lightweight tests inside `packages/game` verifying `BuildingManager` state transitions (place → progress → completion → cancel).  
- **Manual**:  
	1. Run local simulation; verify UI lists buildings, placement ghost aligns to grid, progress completes.  
	2. Launch backend + remote frontend; ensure both clients see consistent progress updates and cancellations.  
	3. Attempt placements without resources to confirm graceful rejection (`sc:system.error` or dedicated failure event).  
	4. Reconnect mid-construction to verify state resync (BuildingManager should replay active buildings on join).

---

### Future Hooks (Phase B+)
- Worker assignment: store `requiredProfession` per building and emit vacancy events once completed.
- Production integration: once goods system exists, buildings should emit `sc:economy.*` events when operational.
- Territory gating: coordinate with planned `TerritoryManager` to restrict placement.

This plan ensures Phase A builds on existing infrastructure, minimizes duplication, and leaves extensibility points for subsequent phases while remaining fully playable in both local and remote configurations.

