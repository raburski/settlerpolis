## Settlers IV Feature Parity Plan

### Goal
Build a Settlers IV-inspired settlement RTS on top of the existing `@rugged/game` architecture, reusing the event-driven backend/frontend separation while introducing the economy, logistics, and combat depth the franchise requires.

### High-Level Pillars
- **Economy Loop**  
	Multi-tier resource chains (raw → refined → advanced) managed through Buildings, Workers, and supply priorities.
- **Logistics & Population**  
	Citizens, carriers, and transport routes that move goods between production, storage, and construction sites.
- **Territory & Infrastructure**  
	Map ownership, building placement constraints, and upgrade paths.
- **Military & Conflict**  
	Unit recruitment, formations, combat resolution, and enemy AI.
- **Narrative & Progression**  
	Campaign missions, scripted objectives, and progression rewards.

---

### Systems Inventory

**Economy Systems**
- `ResourceCatalog`  
	Define raw, refined, and luxury resources; extends `ItemsManager` metadata with production time, storage class, and decay rules.
- `BuildingManager`  
	New manager handling construction queues, worker assignment, production timers, and upgrade stages. Emits `Event.Buildings.*`.
- `ProductionPipelines`  
	Data-driven pipeline definitions mapping required inputs → outputs, rate modifiers, and byproducts. Integrates with `Scheduler` for ticks.
- `StorageManager`  
	Warehouses, granaries, and stock limits. Hooks into Inventory for per-building and global stock tracking.
- `EconomyAI`  
	Automated balancing of worker ratios, production priorities, and idling detection.

**Population & Logistics**
- `PopulationManager`  
	Tracks settlers by profession (carrier, builder, soldier, specialist). Handles housing capacity, morale, and reproduction.
- `CarrierRoutingService`  
	Pathfinding for goods transport; leverages `MapManager` layers for roads, waterways, and teleport structures.
- `TransportNodes`  
	Interfaces for docks, shipyards, and ports; manage loading/unloading events.
- `JobAssignmentSystem`  
	Schedules settlers to tasks (construction, harvesting, guarding) using `Scheduler`.

**Territory & Infrastructure**
- `TerritoryManager`  
	Computes owned tiles via watchtowers, military presence, or special buildings. Gates building placement events.
- `ConstructionPlanner`  
	User-facing previews, validation against terrain, and obstruction detection using `MapObjects`.
- `RoadNetwork`  
	Data structure for roads/bridges with speed modifiers; interacts with CarrierRouting.
- `EnvironmentalHazards`  
	Forests regrowth, mining depletion, natural disasters. Uses `ConditionEffectManager`.

**Military & Conflict**
- `ArmyManager`  
	Handles battalions, morale, formations, and orders. Emits `Event.Military.*`.
- `CombatResolver`  
	Runs battle ticks (melee/ranged/siege), terrain bonuses, and casualty reporting.
- `GarrisonSystem`  
	Assigns soldiers to defensive buildings; integrates with Territory defense bonuses.
- `EnemyAIBrain`  
	Strategies for skirmishes and campaign AI factions, built on top of `NPCManager`.

**Narrative & Progression**
- `CampaignManager`  
	Sequenced missions, win/lose conditions, and cutscene triggers (reuse `CutsceneManager`, `QuestManager`).
- `TechTree`  
	Unlocks for buildings, units, and upgrades. Uses Flags/Affinity to represent faction progress.
- `AchievementService`  
	Meta goals tracked via `FlagsManager` and `ConditionEffectManager`.

**UI & Feedback**
- `EconomyDashboard`  
	React overlay for resource trends, worker allocation, and bottlenecks.
- `ConstructionUI`  
	Building catalog, placement ghost, and upgrade actions interacting with `EventBus`.
- `MilitaryHUD`  
	Formation controls, stance toggles, and minimap pings.
- `NotificationCenter`  
	Prioritized toast/log system for shortages, attacks, and objectives (ties to `SystemManager`).

---

### Implementation Roadmap

**Phase 0 — Framework Prep (Weeks 1-2)**
- Extend `GameContent` schema with buildings, professions, techs, and missions while keeping optional hooks for future factions.
- Set up `Event.Buildings`, `Event.Economy`, `Event.Territory`, `Event.Military` namespaces and shared type definitions.
- Bootstrap `content/settlers/` pack with placeholder assets and a baseline map tailored for a single faction.
- Confirm multiplayer handshake flow (lobby to shared session) using existing event bus and `Receiver.Group`.

**Phase 1 — Settlement MVP (Weeks 3-6)**
- Implement `BuildingManager`, `ConstructionPlanner`, and minimal `ResourceCatalog` with wood and stone loops.
- Add professions via `PopulationManager` (builder, carrier, lumberjack, miner) and integrate with `JobAssignmentSystem`.
- Deliver `ConstructionUI` and foundational HUD (resource counts, population slots).
- Ensure multiplayer sync of construction, inventory, and map ownership flows without AI opponents.
- Result: Players collaborate to gather resources, place structures, and expand territory.

**Phase 2 — Logistics & Mid-Tier Economy (Weeks 7-12)**
- Introduce `ProductionPipelines` for processed goods (planks, bricks) and a simple food chain (grain to bread).
- Stand up `StorageManager`, `CarrierRoutingService`, and `RoadNetwork` (earth roads) to expose transport bottlenecks.
- Expand UI with `EconomyDashboard`, shortage alerts, and production queue indicators.
- Add multiplayer-safe pause and reconnection handling for longer sessions.
- Result: Sustainable settlement loops with tangible logistics decisions.

**Phase 3 — Territory & Defensive Play (Weeks 13-16)**
- Activate `TerritoryManager` with watchtower building and placement gates keyed to owned land.
- Implement `GarrisonSystem` plus a small defensive roster (militia, archer) trained from a barracks.
- Add starter `ArmyManager` features for squad creation and move/attack commands (no AI rivals yet).
- Provide `MilitaryHUD` basics and combat feedback through `NotificationCenter`.
- Result: Human players can spar in multiplayer and defend their settlements.

**Phase 4 — Campaign & Progression Skeleton (Weeks 17-20)**
- Layer `CampaignManager` atop `QuestManager` for scripted objectives and mission win or lose states.
- Introduce `TechTree` unlocks scoped to the single faction (e.g., road upgrades, advanced weapons).
- Build a guided tutorial mission using narrative tooling and contextual notifications.
- Result: Onboarding loop and curated scenarios ready for early access.

**Phase 5 — Polish & Extensibility (Weeks 21+)**
- Harden multiplayer: lobby flow, save or load snapshots, desync detection.
- Prepare hooks for future factions (asset variants, balance tables) without enabling them yet.
- Tackle performance (pathfinding optimization, economic tick batching) and tooling upgrades.
- Stage AI settlement behaviors for a later milestone.

---

### Asset Requirements

**Maps & Terrain**
- Large multi-biome maps with height layers, water bodies, resource nodes, and neutral territories.
- Specialized tilesets for roads, buildings-in-progress, and faction-specific decorations.

**Buildings**
- Concept art + sprite sheets for each building stage (foundation, construction, operating, upgraded).  
- Separate assets per faction (Humans, Elves, Dark Tribe equivalents) if desired.
- UI icons for building menu, upgrades, and state indicators (idle/no workers/no input).

**Units & Population**
- Settler sprites per profession (carrier, woodcutter, miner, baker, etc.) with work animations.  
- Military units: melee, ranged, cavalry, support, siege; include idle/walk/attack/death cycles.
- Portraits for hero units and advisors (leveraged in dialogues and cutscenes).

**Resources & Goods**
- Item icons for logs, planks, stone, iron, weapons, food tiers, magical resources.  
- World props (stockpiles, crates, carts) for map decoration and feedback.

**UI & UX**
- Custom HUD panels, minimap frames, resource bars, and population meters.  
- Tooltip art, progress bars for production queues, priority sliders.
- Campaign map illustrations and victory/defeat screens.

**Audio**
- Ambient loops per biome, building operation SFX, unit voice confirmations, combat effects.  
- UI feedback sounds for placement, alerts, and achievements.

**Narrative**
- Mission briefs, in-game dialogue scripts, cutscenes (storyboards + animations).  
- Localization-ready text files for objectives, tutorials, and tooltips.

---

### Integration Notes
- **Event Namespacing**  
	Add `Event.Buildings`, `Event.Economy`, `Event.Military`, `Event.Territory` domains to `packages/game`.
- **Content Schema**  
	Extend `GameContent` with new arrays: `buildings`, `professions`, `techTree`, `campaignMissions`.  
	Mirror with authoring scripts under `content/settlers/`.
- **Networking**  
	Leverage existing `Receiver.Group` semantics for map-based territories; consider per-army channels for combat updates.
- **Performance**  
	Batch economic ticks via `Scheduler` to avoid frame stalls in browser; consider Web Workers for heavy pathfinding.
- **Tooling**  
	Enhance `scripts/export-maps.js` to handle additional layers (roads/resource spawns) and generate building placement masks.

---

### Current Scope Decisions
- Launch with a single playable faction while keeping schema extensions ready for additional factions.
- Skip naval gameplay for the first milestone; water remains a terrain constraint only.
- Treat multiplayer sessions (co-op settlement and PvP skirmish) as first-class requirements from Phase 1 onward.
- Defer advanced settlement AI and trader behaviors until core player-versus-player loop is stable.

