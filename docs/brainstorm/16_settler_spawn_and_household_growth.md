# Settler Spawn and Household Growth Options

Purpose: replace overly simplistic Settlers-4-style spawning with a model that fits Tacoma's household and city-service gameplay.

## 1. Problem Statement

Current approach can feel too binary:
- house exists -> settlers spawn by simple cadence

This ignores city conditions (supply reliability, sanitation, social life, housing quality).

## 2. Design Goals

- make population growth react to how well the city functions
- keep behavior legible and tunable
- avoid heavy simulation overhead
- integrate with household tiers from `document 10`

## 3. Candidate Spawn Models

## 3.1 Model A: Capacity + Cooldown (Simple Evolution)

Rules:
- each house has capacity by tier
- empty capacity + cooldown completion enables spawn attempt
- spawn attempt succeeds only if minimum household conditions are met

Minimum conditions (example):
- water delivered recently
- food delivered recently
- no severe sanitation overflow nearby

Pros:
- easy to implement over current model
- predictable and clear

Cons:
- still somewhat mechanical if conditions are too simple

## 3.2 Model B: Household Growth Meter (Recommended)

Each house accumulates `growthProgress` daily.

Progress gain sources:
- good supply reliability
- clean surroundings
- evening civic participation in area

Progress blockers/penalties:
- missed essentials
- local persistent dirt
- repeated night disorder nearby

When meter reaches threshold:
- spawn one new settler if capacity permits
- reset meter partially (not fully) for continued growth rhythm

Pros:
- smooth and expressive
- ties directly into city-building quality

Cons:
- requires careful tuning to avoid hidden behavior

## 3.3 Model C: Household Maturation Stages + Spawn Windows

Rules:
- house must mature to stage thresholds (young -> stable -> thriving)
- spawn only allowed in specific day windows (for example morning)
- each stage has a spawn cooldown and risk profile

Pros:
- strong thematic pacing

Cons:
- more complex than needed for first pass

## 4. Recommended First Implementation

Use Model B with strict caps:
- growth meter per house
- one spawn max per house per day
- hard citywide spawn cap by charter tier
- fallback to no-growth (not immediate decay) for short disruptions

## 5. What Household Tiers Should Affect

Suggested effects:
- Tier 1: low capacity, low growth gain
- Tier 2: higher capacity, medium growth gain
- Tier 3: higher capacity, better disruption tolerance

Avoid adding direct worker productivity buffs here.  
Population system should mainly control:
- capacity
- growth speed
- resilience to disruption

## 6. Concrete Formula Sketch (Example)

Per house per day:
`growthDelta = base + essentialsBonus + cleanlinessBonus + socialBonus - shortagePenalty - disorderPenalty`

Clamp:
- `growthDelta` minimum `0` for MVP
- upgrade to negative growth only in later phase if needed

Spawn trigger:
- if `growthProgress >= threshold` and `currentResidents < capacity` then spawn 1 settler

## 7. Engine Integration

Likely modules:
- `PopulationManager`: spawn execution and caps
- `BuildingsManager`: house tier and capacity
- `Storage/Service flows`: supply reliability input
- `SanitationManager`: cleanliness input
- `NightOrderManager`: disorder penalty input
- `TimeManager`: daily tick and morning reset

## 8. Data Additions

House runtime:
```ts
houseGrowthState: {
  houseId: string
  tier: 1 | 2 | 3
  capacity: number
  residents: number
  growthProgress: number
  lastSpawnDay: number
}
```

Global runtime:
```ts
populationGrowthState: {
  cityDailySpawnCap: number
  spawnedToday: number
}
```

## 9. MVP Scope

Phase 1:
- Model B growth meter
- tier-based capacity
- essentials and sanitation inputs only
- spawn at morning phase

Phase 2:
- social/night inputs
- charter-based dynamic spawn caps
- migration-style external arrivals

