# Idea 1: Patron Powers and Wrath

Goal: add a mythic civic layer inspired by Zeus/Poseidon style city favor, while staying grounded in Tacoma's economy-first loop.

## 1. Design Intent

This system should:
- reward long-term city identity choices
- create meaningful tradeoffs, not flat buffs
- interact with existing economy and progression systems
- use day/night as a gameplay driver (no seasons)

## 2. Core Loop

1. Player aligns with one or more patrons/factions.
2. Day-to-day actions raise or lower favor with each patron.
3. Favor thresholds unlock blessings; low favor can trigger wrath events.
4. Night amplifies risk and opportunity for some patron effects.
5. Patron standing feeds into charter progression, incidents, and quests.

## 3. Patron Set Proposal

Initial set (example):
- `patron_solar_tribunal` (order, law, civic discipline)
- `patron_tide_compact` (trade, sea routes, diplomacy)
- `patron_forge_oath` (industry, metallurgy, labor intensity)
- `patron_wild_covenant` (food chain, hunting, land stewardship)

Each patron has:
- favor range (for example `-100` to `100`)
- threshold tiers (`hostile`, `uneasy`, `neutral`, `favored`, `devoted`)
- passive rules and triggered events
- day/night modifiers

## 4. How Favor Changes

Favor deltas should come from existing systems:
- trade shipment arrival and route uptime (`TradeManager`)
- charter claims and civic thresholds (`CityCharterManager`)
- production and storage signals (industry, spoilage, shortages)
- incident/quest outcomes (dialogue/choice consequences)
- decree-like actions (future extension)

Example favor mapping:
- complete sea trade route: `+2 Tide Compact`
- maintain high bread shortages for long periods: `-2 Solar Tribunal`
- sustained iron-bar throughput: `+1 Forge Oath`
- over-hunting deer nodes beyond threshold: `-2 Wild Covenant`

## 5. Day/Night Dynamics

Day/night should be used as a controlled multiplier:
- night can increase chance of wrath incidents for low-favor patrons
- evening can boost ritual or festival actions that increase favor
- morning can process "daily patron judgment" summary events
- patron-specific rules can use `DayPhase` checks

Examples:
- `Tide Compact`: night sea routes have higher risk but +reputation reward.
- `Forge Oath`: evening/night industrial shifts raise output but increase fatigue pressure.
- `Wild Covenant`: night hunting penalties if over-exploitation flags are active.

## 6. Data Model Proposal

Add new content file:
- `content/settlerpolis/patrons.ts`

Example shape:
```ts
export type PatronDefinition = {
  id: string
  name: string
  description: string
  thresholds: Array<{ id: string; min: number; max: number }>
  dayPhaseRules?: Array<{
    phase: 'morning' | 'midday' | 'evening' | 'night'
    modifierId: string
    value: number
  }>
  blessings?: Array<{ thresholdId: string; effectId: string }>
  wrath?: Array<{ thresholdId: string; incidentTableId: string }>
}
```

Add state snapshot:
- per-player favor by patron
- last daily evaluation timestamp
- active patron effects

## 7. Runtime Integration Map

### 7.1 New manager

Add `PatronManager` under `packages/game/src/Patron`:
- subscribes to domain events (trade, charter, production, quest outcomes)
- tracks favor per player
- evaluates threshold transitions
- emits UI sync events and trigger hooks

### 7.2 Existing modules to connect

- `packages/game/src/Time`: day-phase hooks for scheduled evaluation
- `packages/game/src/Reputation`: optional coupled reward path
- `packages/game/src/CityCharter`: optional patron-gated tier requirements
- `packages/game/src/ConditionEffect`: add patron condition/effect types
- `packages/game/src/Quest` and `packages/game/src/Triggers`: branching by patron state
- `packages/frontend/src/game/components/ReputationPanel.tsx`: extend or sibling panel for patron standings

## 8. UI and Player Feedback

Recommended UI additions:
- patron dashboard panel with favor meters and threshold markers
- event feed entries when threshold crosses occur
- tooltip on modifiers showing source and expiration
- day/night icon on rules that change by phase

## 9. MVP Scope

Phase 1:
- 2 patrons only (Solar Tribunal, Tide Compact)
- favor gain from trade and one civic metric
- one blessing tier and one wrath tier each
- night modifier applied only to one route-risk rule

Phase 2:
- add Forge Oath and Wild Covenant
- integrate quest outcomes and charter requirements
- add stronger day-phase-specific interactions

## 10. Risks and Mitigations

Risks:
- hidden math can feel unfair
- too many systems tied at once can reduce readability

Mitigations:
- show exact favor deltas in UI logs
- keep threshold counts small at launch
- add deterministic debug tools to force favor transitions

## 11. Why This Fits The Game

This adds Zeus/Poseidon-style civic myth pressure while preserving Tacoma's existing strengths: logistics, production, progression, and world trade.  
It also uses already-implemented day/night simulation to create narrative rhythm without introducing seasonal complexity.

