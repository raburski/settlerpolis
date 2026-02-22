# Idea 3: Monument Projects

Goal: introduce prestige mega-projects that convert economy mastery into long-form civic achievements, with strong visual and narrative payoff.

## 1. Design Intent

Monuments should:
- feel like major city milestones
- require multi-chain logistics, not just one resource dump
- create strategic tension in workforce allocation
- tie directly to charter, reputation, and story
- use day/night for pacing and risk options

## 2. Monument Concept Set

Initial examples:
- `Hall of Oaths` (civic authority, charter acceleration)
- `Beacon of Asterfall` (trade range/risk benefits)
- `Foundry of the First Flame` (industry throughput identity)

Each monument is one high-effort project with staged phases and scripted milestone events.

## 3. Core Mechanics

### 3.1 Multi-stage build pipeline

A monument is split into structured stages:
1. `site_preparation`
2. `foundation`
3. `frame`
4. `finishing`
5. `consecration`

Each stage has:
- required resources
- minimum workforce assignment
- optional prerequisites (flags, reputation, charter tier)
- milestone event on completion

### 3.2 Workforce commitment model

Add explicit labor modes for monument jobs:
- `balanced`: low disruption, slow progress
- `focused`: medium disruption, faster progress
- `push`: high disruption, fastest progress with penalties

Penalty examples:
- increased settler fatigue accumulation
- temporary productivity drop in non-monument buildings

### 3.3 Day/night construction dynamics

No seasons. Use day-phase dynamics:
- default: construction efficiency highest during morning and midday
- optional night shift toggle for monuments
- night shift gives speed bonus but increases fatigue and incident chance
- dawn checkpoint can apply daily quality/safety validation

This gives an explicit strategic choice: speed now vs city strain later.

## 4. Data Model Proposal

Add content file:
- `content/settlerpolis/monuments.ts`

Example structure:
```ts
export type MonumentStage = {
  id: string
  name: string
  requiredItems: Array<{ itemType: string; quantity: number }>
  minWorkers: number
  baseWorkUnits: number
  unlockConditions?: unknown[]
  onCompleteEffects?: unknown[]
}

export type MonumentDefinition = {
  id: string
  name: string
  description: string
  charterTierRequired?: string
  reputationRequired?: number
  stages: MonumentStage[]
  dayPhaseModifiers?: Array<{
    phase: 'morning' | 'midday' | 'evening' | 'night'
    workRateMultiplier: number
    fatigueMultiplier?: number
    incidentRiskAdd?: number
  }>
}
```

## 5. Runtime Integration Map

### 5.1 Engine

Recommended module:
- `packages/game/src/Monuments` with `MonumentManager`

Dependencies:
- `BuildingManager` for placement and stage ownership
- `StorageManager` and reservation flow for material intake
- `PopulationManager` and work assignment for labor commitment
- `SettlerNeedsManager` for fatigue penalties
- `CityCharterManager` for unlock gating and rewards
- `ReputationManager` for diplomatic/prestige outcomes
- `TimeManager` for phase modifiers
- `ConditionEffectManager` for milestone scripts

### 5.2 Frontend

UI changes:
- monument panel in construction flow
- stage progress view in building info panel
- labor mode toggle and night-shift toggle
- warnings when citywide strain crosses thresholds

Likely touch points:
- `packages/frontend/src/game/components/ConstructionPanel.tsx`
- `packages/frontend/src/game/components/BuildingInfoPanel.tsx`
- `packages/frontend/src/game/components/CityCharterPanel.tsx`
- `packages/frontend/src/game/services/ProductionService.ts`

## 6. Example Monument Walkthrough

`Hall of Oaths`:
1. Requirement: `market-town` charter, reputation >= 20.
2. Stage `foundation`: high stone and logs.
3. Stage `frame`: planks + iron bars.
4. Stage `finishing`: bread/water support budget + tools.
5. Consecration event at morning, grants:
- charter claim cost reduction
- one-time reputation burst
- unlock flag for elite incident/quest chain

Night-shift option:
- +20% stage work rate at night
- +30% fatigue gain on assigned workers
- +10% incident chance for safety-related events

## 7. MVP Scope

Phase 1:
- one monument (`Hall of Oaths`)
- 3 stages only
- no custom art requirement for first pass
- one day/night modifier rule (night shift)

Phase 2:
- 2 additional monuments
- milestone cutscenes and quest branches
- stronger charter and patron synergies

## 8. Balance and Telemetry

Track:
- total build time by stage
- resource bottleneck frequencies
- labor shortfall periods
- night-shift usage rate
- post-completion city stability metrics

Balance target:
- monument is a major commitment, not a default early-game rush
- clear payoff without becoming mandatory every run

## 9. Why This Fits The Inspirations

This delivers the civic spectacle and prestige progression expected from Zeus/Poseidon influence, while preserving Settlers-like chain management and Farthest Frontier-like settlement pressure.  
Day/night integration adds tactical rhythm without seasonal complexity.

