# Tacoma Current Feature Set and Code Findings

Snapshot date: 2026-02-22  
Scope: current implementation and active content in this repository, based on engine, frontend, and `content/settlerpolis`.

## 1. What Is Implemented Right Now

### 1.1 Core simulation and module layout

The game is built as an event-driven simulation with many domain modules wired in `packages/game/src/index.ts`.

Major implemented runtime modules include:
- time and day phases
- simulation tick cadence
- map and map objects
- movement and pathing
- buildings and construction stages
- storage, reservations, and spoilage
- settlers: work, actions, behaviour, needs
- population and profession assignment
- roads
- resource nodes and prospecting
- wildlife (deer ecosystem)
- trade routes and world map integration
- city charter progression
- reputation
- quests, dialogue, triggers, cutscenes, flags, condition-effect engine
- snapshot save/load

### 1.2 Economy and production

Current economy is strongly supply-chain based:
- 32 building definitions in `content/settlerpolis/buildings.json`.
- Categories: storage (4), civil (5), industry (6), food (6), metalwork (8), infrastructure (3).
- Warehousing is implemented (`storehouse`, `granary`, `vault`, `food_cellar`) with slot-based storage logic.
- Construction is staged and resource-fed (materials delivered before build completion).
- Production includes single-recipe and multi-recipe buildings in `content/settlerpolis/buildings.generated.ts`.
- Logistics requests and reservations are integrated with building IO and trade IO.

Representative chains already present:
- extraction and refinement: ore -> bar -> coin/tool/weapon
- timber: logs -> planks / coal
- food: grain -> flour -> bread
- hunting/fishing and settlement consumption

### 1.3 Settlers and labor model

Labor model is already systemic:
- profession-capable workforce (`content/settlerpolis/professions.ts`)
- tool-driven profession change (`content/settlerpolis/professionTools.ts` and item metadata)
- worker assignment and unassignment in production buildings
- interruptible need handling for hunger/fatigue
- behaviour and action layers separated into dedicated modules

Starting setup:
- population: 1 builder, 6 carriers (`content/settlerpolis/startingPopulation.ts`)
- tools and stockpiles seeded in `content/settlerpolis/startingItems.ts`

### 1.4 Time and day/night

Day phases are implemented as first-class simulation state:
- phases: morning, midday, evening, night
- per-phase simulation speeds (`packages/game/src/Time/types.ts`)
- fast-forward to selected phase (`packages/game/src/Time/index.ts`)
- frontend day-moment controls in top bar (`packages/frontend/src/game/components/TopBar.tsx`)

This gives a strong foundation for day/night gameplay dynamics without adding seasons.

### 1.5 Trade, world map, and meta progression

Trade and progression are already live:
- world map nodes + offers in `content/settlerpolis/worldMap.ts`
- route lifecycle state machine in `packages/game/src/Trade/index.ts`
- route types include land and sea
- reputation gain integrated with trade arrival completion
- city charter tiers and unlock flags in `content/settlerpolis/cityCharters.ts` and `packages/game/src/CityCharter`

### 1.6 UI surface area already available

Frontend gameplay already exposes substantial control:
- construction, road placement, work area placement
- building details including workers and production settings
- stock panel, logistics panel, delivery priorities
- population, charter, reputation, world map panels
- save/load panel
- day-moment toggle

Main paths:
- `packages/frontend/src/game/components/UIContainer.tsx`
- `packages/frontend/src/game/components/*Panel.tsx`
- `packages/frontend/src/game/services/*.ts`

## 2. Active Content vs Dormant Narrative Content

Narrative systems are implemented in engine code, but active narrative content is currently thin.

### 2.1 Active now
- quests list includes `catch_the_rabbit` (`content/settlerpolis/quests/index.ts`)
- cutscene list includes `rabbit_escape` (`content/settlerpolis/cutscenes/index.ts`)

### 2.2 Not currently enabled in content index
- NPC list currently exported as empty (`content/settlerpolis/npcs/index.ts`)
- trigger list currently exported as empty (`content/settlerpolis/triggers/index.ts`)
- schedules and flags content indexes are also empty

Important detail: example NPC and trigger files exist (`miss_hilda`, `rabbit`, `rabbit_escape`), but are commented out at index level, so their story flow is currently inactive by default.

## 3. Fit Against Inspiration Targets

### 3.1 Settlers 4 fit
- strong worker/profession identity
- visible production chain dependency
- logistics as core challenge

### 3.2 Zeus/Poseidon fit
- city charter progression can anchor civic rank and prestige
- world map and reputation can anchor diplomacy and faction standing
- existing quest/dialogue stack can support city-state narrative arcs

### 3.3 Farthest Frontier fit
- settlement survival pressure can be expressed through food/logistics/labor stress
- trade, storage, and needs systems can carry hardship dynamics
- day/night already exists as a lever for dynamic pressure and behavior variation

## 4. Practical Design Implications

The fastest path to stronger story identity is not a deep engine rewrite. Most core systems already exist.

High-impact approach:
1. Activate and expand narrative content (NPCs, triggers, schedules, quest chains).
2. Add day/night-sensitive systems (not seasonal) to create rhythm and tension.
3. Tie narrative consequences into charter unlocks, reputation, and trade.

## 5. Key Implementation Readiness Notes

- Engine-level quest/trigger/dialogue/condition-effect scaffolding is ready.
- Progression systems (charter and reputation) are ready to carry narrative outcomes.
- Day/night simulation is ready to drive dynamic modifiers.
- Main gap is content activation and data authoring, plus a few targeted manager extensions for new mechanics.

