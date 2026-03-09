# Guild System Foundation

Purpose: define a concrete, implementation-ready guild system that deepens city-building before patrons/monuments.

## 1. Design Intent

Guilds should:
- create strategic city layout constraints
- add medium-term planning to production chains
- improve buildings through active visits, not passive global aura
- use systems already in game (work, movement, logistics, building state)

## 2. Core Rules

## 2.1 Placement Constraint

- guild buildings cannot be placed within `guildMinDistanceTiles` of another guild.
- reason: avoid dense buff stacking and force deliberate city planning.

## 2.2 Choose Guild Type

Each guild building is assigned one type:
- `mining`
- `farming`
- `industry`
- `logistics`
- `civic` (optional, can be phase 2)

Type is chosen in the building panel after the guild is placed.

### Profession mapping by guild type

- `mining` -> `Prospector`
- `farming` -> `Farmer`
- `industry` -> `Metallurgist` (or dedicated foreman role later)
- `logistics` -> `Vendor` (or dedicated quartermaster role later)
- `civic` -> `Builder` (placeholder, can be replaced by dedicated civic steward later)

### Type-change rules

- guild type can be changed, but only once per day.
- the change lock resets on `morning` phase.
- on guild type change:
1. unassign current guild worker
2. clear current guild action queue
3. issue worker request for new mapped profession
4. rebuild valid target list for jobs/buffs

## 2.3 Two Guild Functions

1. Guild own job loop:
- guild workers run user-issued point-and-click tasks.

2. Building visit buffs:
- guild agents visit eligible buildings and apply a timed buff.
- buff expires and must be refreshed via another visit.

Fallback rule:
- if no user-issued task is queued for `X` time, guild worker switches to auto-support mode and runs building-visit buffs.

## 3. Concrete Buff Proposals

## 3.1 Mining Guild

Targets:
- `stone_mine`, `coal_mine`, `iron_mine`, `gold_mine`, `iron_smelter`, `gold_smelter`

Visit buff options:
- `+10% extraction speed` on mines for `8` in-game hours
- `+5% output chance` for mined resource (low probability bonus)

Own tasks:
- prospecting task dispatch (existing fantasy fit)

## 3.2 Farming Guild

Targets:
- `farm`, `windmill`, `bakery`

Visit buff options:
- `-10% grow time` on farm plots (or equivalent harvest cycle improvement)
- `+10% processing speed` on grain/flour/bread chain buildings

Own point-and-click jobs:
- field survey: player clicks an area to prioritize for plot optimization
- irrigation check: player clicks farms to run temporary crop-loss protection

## 3.3 Industry Guild

Targets:
- `sawmill`, `charcoal_kiln`, `armory`, `blacksmith`, `mint`, smelters

Visit buff options:
- `-10% recipe productionTime`
- small chance to reduce one input unit consumption over cycle windows

Own point-and-click jobs:
- workshop inspection: click a production building to prioritize it for next buff cycle
- process audit: click one chain anchor to reduce jam risk for short window

## 3.4 Logistics Guild

Targets:
- `market`, `well`, `storehouse`, `trading_post`, `trading_port`

Visit buff options:
- `+1 carrying batch equivalent` for assigned service loops
- faster request turnaround for logistics jobs in visited building

Own point-and-click jobs:
- route marking: click start/end area to prioritize logistics requests along corridor
- surge support: click one building to temporarily raise refill priority

## 3.5 Civic Guild (Optional Phase 2)

Targets:
- plaza/forum/shrine/library line once available

Own point-and-click jobs:
- event prep: click civic POI to increase evening capacity readiness
- order patrol planning: click troubled area for temporary night-risk mitigation

## 3.6 Buff System Technical Design

Full technical design moved to:
- `docs/brainstorm/17_guild_buff_system_technical.md`

## 4. Anti-Exploit Constraints

- one building can have only one guild buff at a time.
- same guild cannot reapply buff to same building before `cooldown`.
- each guild has a max number of active buffed buildings based on guild level.
- agent travel time matters; remote buildings receive buffs less often.

## 5. Progression and Upgrades

Guild levels:
- Level 1: max `1` active buff
- Level 2: max `2` active buffs
- Level 3: max `3` active buffs

Buff duration rule:
- default buff duration is one in-game day (until next morning phase transition).
- buffs can be refreshed by revisits if slot cap allows.

Upgrade costs can use:
- planks, stone, iron bars, coins (existing economy fit)

## 6. Runtime Design

## 6.1 Suggested manager

New manager:
- `packages/game/src/Guilds/GuildManager.ts`

Responsibilities:
- enforce placement distance
- track guild definitions and instances
- schedule guild agent visits
- apply and expire timed buffs
- expose state to UI

## 6.2 Data additions

Content additions:
```ts
guild?: {
  typeOptions: Array<'mining' | 'farming' | 'industry' | 'logistics' | 'civic'>
  minDistanceTiles: number
  baseActiveBuffCap: number
  mappedProfessionByType: Record<string, string>
  typeChangeLockResetsOn: 'morning'
}
```

Runtime state:
```ts
guildInstanceState: {
  guildId: string
  guildType: string
  level: number
  typeChangedToday: boolean
  assignedProfessionType: string
  activeBuffs: Array<{ buildingInstanceId: string; buffId: string; expiresAt: number }>
  clickTasks: Array<{ taskId: string; taskType: string; target: unknown; createdAt: number }>
  visitQueue: string[]
}
```

## 7. UI Requirements

- Guild panel: type selector, level, daily type-change lock status, active buffs, next planned visits.
- Building info: current guild buff and remaining duration.
- Placement UI: show forbidden radius around existing guilds.
- Guild panel: user task queue for point-and-click actions.

## 8. MVP Scope

Phase 1:
- only `mining guild`
- placement spacing rule
- panel type selection
- profession mapping and daily type-change lock
- prospecting point-and-click task
- idle fallback to building buffs
- max 1 active one-day buff

Phase 2:
- add farming and industry guilds
- add logistics guild
- add guild level upgrades

## 9. Testing Checklist

- cannot place guild too close to existing guild
- buff applies only to eligible building types
- buff expires correctly and is re-applied via visit loop
- no multi-guild stacking on a single building
- guild type can change only once per day and resets in morning
- guild worker is re-assigned to mapped profession on type change
- save/load preserves active buffs and timers
