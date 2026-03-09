# Global Buff System (Technical Proposal)

Purpose: define a reusable buff system used by multiple gameplay features.  
Guilds are one buff producer that applies buffs to buildings through this shared system.

## 1. Core Requirements

- buff system is global, not tied to any one feature
- any source can apply buffs (guilds, events, policies, buildings, quests)
- targets can be buildings first (MVP), later settlers/city/player
- buffs support timed expiration and explicit source ownership
- consumers read resolved modifiers; base values are never mutated directly

## 2. Data Model

## 2.1 Buff definition (content-side)

```ts
type BuffDefinition = {
  id: string
  targetKind: 'building' | 'settler' | 'city' | 'player'
  tags?: string[]
  effects: {
    productionTimeMultiplier?: number
    extractionRateMultiplier?: number
    logisticsPriorityAdd?: number
    outputChanceBonus?: number
  }
}
```

## 2.2 Active buff (runtime)

```ts
type ActiveBuff = {
  activeBuffId: string
  buffId: string
  sourceType: 'guild' | 'event' | 'policy' | 'building' | 'quest'
  sourceId: string
  targetKind: 'building' | 'settler' | 'city' | 'player'
  targetId: string
  startedAtDayKey: string
  expiresAtMorningDayKey?: string
  expiresAtMs?: number
}
```

## 2.3 Source-local state (example: guild)

Sources may keep their own caps/queues locally.  
For guilds this can remain in guild state:

```ts
type GuildRuntimeState = {
  guildBuildingInstanceId: string
  level: number
  maxActiveBuffs: number
  activeBuffIds: string[]
}
```

## 3. Application Rules (Global)

1. Source requests buff application through global service.
2. Global service validates:
- buff definition exists
- target exists and target kind matches
- source-level constraints (optional callback, e.g. guild cap)
3. If valid, create `ActiveBuff`.
4. Emit update event.

## 4. Expiration Rules (Global)

Primary:
- remove buffs on morning/day-key transition if `expiresAtMorningDayKey` reached
- remove buffs on absolute timestamp expiry if `expiresAtMs` reached

Secondary:
- target removed
- source removed
- source-specific invalidation (example: guild type changed)

## 5. Stacking Rules

Global defaults:
- multiple sources may apply buffs to same target
- each buff definition can declare stacking policy later (phase 2)

Guild-specific override:
- guild source enforces "one guild buff per building target" in guild manager logic

## 6. Effect Resolution Strategy

Use a resolved-modifier read model:

- systems (production/logistics/etc.) ask `BuffService` for active modifiers by target
- `BuffService` merges active buffs into a computed snapshot
- caller applies snapshot to base runtime calculations

Benefits:
- no base-stat drift
- clean save/load
- unified debug output

## 7. Event API Sketch

Global events:
- `ss:buff:apply`
- `ss:buff:remove`
- `sc:buff:sync`

Payload example:
```ts
{
  activeBuffId: string
  buffId: string
  sourceType: string
  sourceId: string
  targetKind: string
  targetId: string
  expiresAtMorningDayKey?: string
}
```

## 8. Manager Structure

Suggested shared modules:
- `packages/game/src/Buffs/BuffManager.ts`
- `packages/game/src/Buffs/BuffResolver.ts`

Guild integration:
- `GuildManager` uses `BuffManager` API to apply/remove buffs
- guild caps, target eligibility, and one-buff-per-target rules stay in guild code

## 9. Save/Load

Persist globally:
- buff definitions loaded from content
- active buff list with source/target/expiry

On load:
- rebuild indices by target and by source
- drop invalid records for missing target/source

## 10. Debug and UI

Debug:
- list active buffs by target
- list active buffs by source
- force morning transition to test day-based expiry

UI:
- target panel (building) shows active buffs and source
- source panel (guild) shows active buffs it owns

## 11. Guild Usage on Top of Global System

Guild-specific behavior remains:
- level-based cap (1/2/3)
- one-day buff duration (until morning)
- one guild buff per building target
- clear guild-owned buffs when guild type changes

Guilds do not define buff storage logic anymore; they call global buff APIs.

## 12. MVP Scope

Phase 1:
- implement global buff manager for building targets
- guilds as first source using the global manager
- morning-expiry support
- resolved modifiers used by production path

Phase 2:
- add more source types (events/policies)
- add stacking policy per buff definition
- add settler/city target kinds
