# Idea 5: Frontier Incidents and Quests

Goal: create a living frontier narrative layer through recurring incidents and branching quest chains, driven by city state and day/night rhythm.

## 1. Design Intent

Incidents should:
- emerge from simulation state, not only scripted cutscenes
- present meaningful choices with economic consequences
- link directly into quests, dialogue, flags, and progression
- keep replay value high through weighted variation
- avoid seasonal mechanics and use day/night cadence instead

## 2. System Overview

Introduce an incident director that periodically evaluates conditions and triggers incidents from weighted pools.

High-level loop:
1. Evaluate city state (food, labor, trade, reputation, charter, patron/faction values).
2. Select eligible incidents from category pools.
3. Trigger incident entry event (chat, dialogue, marker, objective).
4. Resolve through player action, timed outcomes, or neglect.
5. Apply effects (resources, reputation, flags, quests, NPC states, unlocks).

## 3. Incident Categories

Initial category proposals:
- `trade_disputes`: caravan theft claims, tariff conflicts, forged contracts
- `civic_order`: labor unrest, housing stress, black market emergence
- `wild_border`: predator pressure, poacher conflict, sacred grove disputes
- `faction_faith`: shrine desecration rumors, oath-breaking allegations
- `infrastructure`: mine collapse, granary contamination, route blockage

Each category can have short, medium, and chain incidents.

## 4. Day/Night Dynamics (No Seasons)

Day-phase weighting can shape encounter rhythm:
- morning: inspections, policy, court petitions
- midday: trade and labor incidents
- evening: social unrest, market events
- night: stealth, sabotage, smuggling, wildlife risk

Mechanics:
- each incident definition can include a `phaseWeight` map
- some incidents only unlock at night
- unresolved incidents can escalate at dawn checkpoints
- player can use day-moment controls to fast-forward toward preferred windows

## 5. Data Model Proposal

Add content files:
- `content/settlerpolis/incidents/index.ts`
- `content/settlerpolis/incidents/*.ts`

Example shape:
```ts
export type IncidentDefinition = {
  id: string
  category: string
  title: string
  description: string
  cooldownHours?: number
  maxOccurrences?: number
  phaseWeight?: Partial<Record<'morning' | 'midday' | 'evening' | 'night', number>>
  conditions: unknown[]
  onTrigger?: unknown[]
  choices?: Array<{
    id: string
    label: string
    conditions?: unknown[]
    effects: unknown[]
    followUpQuestId?: string
  }>
  onTimeout?: unknown[]
  escalationIncidentId?: string
}
```

## 6. Runtime Integration Map

### 6.1 Engine

Recommended module:
- `packages/game/src/Incidents` with `IncidentManager`

Core dependencies:
- `TimeManager` for day-phase windows and cooldowns
- `CityCharterManager` and `ReputationManager` for gating and outcomes
- `TradeManager`, `StorageManager`, `PopulationManager` for condition inputs
- `QuestManager`, `DialogueManager`, `TriggerManager` for branching flows
- `ConditionEffectManager` for unified condition checks and effects
- `FlagsManager` for persistence and anti-repeat controls

### 6.2 Event bus extensions

Add events such as:
- `cs:incident:choose`
- `sc:incident:triggered`
- `sc:incident:updated`
- `sc:incident:resolved`

### 6.3 Frontend

UI additions:
- incident feed panel (active and resolved)
- choice modal for high-priority incidents
- map markers for incident locations
- day/night risk indicator in top bar or side panel

Likely touch points:
- `packages/frontend/src/game/components/Notifications.tsx`
- `packages/frontend/src/game/components/Quests.tsx`
- `packages/frontend/src/game/components/SystemMessages.tsx`
- `packages/frontend/src/game/components/TopBar.tsx`

## 7. Incident -> Quest Chain Pattern

Recommended pattern:
1. Trigger incident from simulation condition.
2. Present 2 to 3 choices.
3. Choice starts or updates a quest chain.
4. Quest outcomes set flags and alter reputation/charter/patron values.
5. Future incident eligibility changes based on those flags.

This reuses existing quest and condition-effect systems instead of replacing them.

## 8. Example Chains

### 8.1 Night Smuggler Ring

Trigger:
- low bread stock + night + active trade route

Choices:
- crack down now (cost labor, gain civic reputation)
- strike deal (gain resources, lose civic standing)
- ignore (chance of escalation)

Escalation:
- dawn riot incident if unresolved for two nights

### 8.2 Collapsed Iron Shaft

Trigger:
- iron mine active + high production pressure + evening/night

Choices:
- emergency rescue (resource cost, morale gain)
- seal and delay (faster recovery, reputation loss)
- blame contractor (opens legal quest branch)

### 8.3 Sacred Grove Dispute

Trigger:
- over-hunting and woodland depletion conditions

Choices:
- enforce conservation zone
- fund replanting works
- dismiss complaint

Outcomes influence later trade and civic incident pools.

## 9. MVP Scope

Phase 1:
- incident manager with weighted random selection
- 8 to 12 incidents across 3 categories
- simple choice handling with direct effects
- one escalation path
- day/night weighting for at least 4 incidents

Phase 2:
- longer chain incidents with multi-step quests
- faction or patron-dependent variants
- higher UI fidelity and map-level context

## 10. Testing Strategy

Engine tests:
- eligibility filtering
- day/night weighting logic
- cooldown and anti-repeat behavior
- deterministic seed behavior for incident selection
- branch outcome application via condition/effect

Gameplay validation:
- verify that incidents are frequent enough to matter but not spammy
- ensure choices have visible tradeoffs
- confirm no single dominant choice path

## 11. Why This Fits The Inspirations

This approach delivers the civic storytelling and city-state drama expected from Zeus/Poseidon inspiration while preserving Settlers-like chain pressure.  
Using day/night windows provides Farthest Frontier-like tension pacing without adding seasonal simulation.

