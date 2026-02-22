# Foundational City-Building Mechanics (Before "Crown" Systems)

This document focuses on practical, core-loop mechanics that make everyday city management richer before adding high-level systems like patrons, monuments, or advanced incident chains.

## 1. Design Goal

Build a stronger "normal life of the city" layer:
- household supply that affects actual settler behavior
- visible neighborhood evolution without abstract global scores
- city layout decisions that matter for service and logistics

No seasons are assumed here.

## 2. Candidate Mechanics (Down-to-Earth)

## 2.1 Vendor-Driven Household Services (Expand Existing Food/Water)

Use existing vendor-style delivery as the base service model.  
Current base already supports food and water distribution. Extend this with a third pillar: household fuel.

Core loop:
1. Houses request specific goods.
2. Vendors/carriers deliver goods physically.
3. Residents react to missing goods with concrete behavior changes.

### Service Set A: Essentials (Now)

Goods:
- water
- staple food (`bread`, `carrot`)

Concrete in-game effects:
- if missing water: residents are more likely to break current activity and run a "fetch water" behavior
- if missing food: higher chance of hunger interrupts during work time
- repeated misses: house cannot advance to higher household tier (see 2.2)

### Service Set B: Household Fuel (Near-Term)

Goods:
- `charcoal` (already in content)

Concrete in-game effects:
- no fuel at night: residents lose part of night rest window and wake later
- repeated no-fuel nights: residents skip optional evening outings and go straight home
- repeated misses: house cannot advance to higher household tier

### Service Set C: Sanitation Supply (After Sanitation Loop Exists)

Goods:
- `soap` or `lime` (new item, optional)

Concrete in-game effects:
- if missing while area is dirty: hygiene decay accelerates
- if supplied: slows down household hygiene decay

Likely module touch points:
- `packages/game/src/Buildings`
- `packages/game/src/Population`
- `packages/game/src/Storage`
- `packages/game/src/Settlers/Work`

## 2.2 Neighborhood Quality as Emergent Visual Development (No Labels, No Composite Score)

No master neighborhood score and no info-tag spam.  
Neighborhood quality should be read from the world itself.

### Proposal A: Household Development Tiers (Visual + Functional)

Anno-style house upgrades can make sense here, with one adjustment: upgrades should be based on delivery consistency and city hygiene, not abstract taxes/market classes.

Each house progresses through tiers based on sustained supply and cleanliness:
- Tier 1: rough dwelling (baseline)
- Tier 2: maintained home (clean yard, lit windows, minor props)
- Tier 3: prosperous home (decorative facade, cleaner frontage, denser evening activity)

Sample upgrade gates (rolling window):
- water + food delivered on most recent days
- no severe local waste overflow for N nights
- at least periodic evening social participation

Functional outputs are intentionally not finalized here because they must align with the settler spawning model.  
Detailed alternatives are moved to:
- `docs/brainstorm/16_settler_spawn_and_household_growth.md`

Safe baseline output (if we keep it simple):
- Tier 1 -> Tier 2: +housing capacity only
- Tier 2 -> Tier 3: +housing capacity and better disruption resistance

### Proposal B: Street Condition Visuals

Street condition should change from simulation side effects:
- clean streets in serviced areas
- visible trash piles and muddy/dirty patches where sanitation fails
- darker, emptier streets where fuel and lighting fail

This links directly to sanitation and night-order systems.

### Proposal C: Building Context Contrast

Quality is also shown by adjacency:
- homes near smoke-heavy industry stay visually rough unless compensated by sanitation/services
- homes near plazas and well-serviced roads improve faster

This naturally pushes realistic zoning without explicit district score mechanics.

## 2.3 Building Maintenance and Upkeep

Deferred for now.

## 2.4 Commute Friction and Congestion (Use Existing Movement Constraints)

Since congestion already exists through settler movement limits, focus on exposing current behavior:
- show delay causes in building UI (`waiting worker`, `worker delayed by congestion`, `input delayed`)
- highlight chronic chokepoints on map
- let road improvements visibly remove those slowdowns

No additional congestion simulation layer is required now.

## 2.5 Guild System Instead of District Specialization

Keep this in the core plan, but details are moved to:
- `docs/brainstorm/14_guild_system_foundation.md`

Summary:
- guild spacing rule (cannot place too close)
- guild type selection (mining/farming/industry/logistics/civic)
- guild own tasks + timed building buff visits

## 2.6 Sanitation and Health

Keep this in the core plan, but full specifics are moved to:
- `docs/brainstorm/15_sanitation_and_health_foundation.md`

Summary:
- waste generation and collection chain
- local dirt accumulation on map
- concrete behavior and productivity penalties tied to sanitation failure

## 3. Suggested Order of Implementation

1. Expand household supply loop (water, food, charcoal).
2. Add household development tiers with visible world changes.
3. Implement guild system foundation.
4. Implement sanitation and health foundation.
5. Improve congestion visibility and feedback.

## 4. Minimum Data Additions

Add content-level metadata (example):
- `householdNeeds` targets on houses (`water`, `food`, `fuel`)
- `householdTierRules` for progression gates
- `householdTierVisuals` and optional capacity bonuses
- `streetConditionSources` from sanitation and lighting systems

Add runtime state (example):
- `householdStockByHouseId`
- `householdTierByHouseId`
- `householdUpgradeProgressByHouseId`
- `streetDirtByTile`

## 5. MVP Package Recommendation

If you want one practical package first:
- household essentials + fuel delivery
- basic house tier progression (Tier 1 -> Tier 2)
- visible street dirt accumulation from missed sanitation

This creates immediate city-building depth with minimal abstract systems.
