# Night Order, Lighting Puzzle, and City Risk

This document proposes a night system where bad outcomes are influenced by multiple city factors, with lighting as one important but not sole lever.

## 1. Design Goal

Create an interesting night phase that:
- introduces meaningful risk management
- uses lighting as a strategic resource sink
- depends on broader city health, not only brightness
- rewards city layout and policy decisions

## 2. Risk Model (Multi-Factor)

Night risk should be driven by a combined score:
- darkness exposure
- hunger and low household quality
- unemployment and idle population pressure
- overcrowding and poor social venue access
- sanitation burden and visible filth

Example:
`nightRisk = darkScore + deprivationScore + disorderScore - socialMitigation`

## 3. Lighting System as a Puzzle

## 3.1 Core Concept

Lighting is not global. It is spatial and capacity-limited:
- lamps/torches/watchfires illuminate radius
- each source consumes a resource (oil, tallow, charcoal, etc.)
- illumination overlaps can be wasteful if overstacked
- dark corridors near houses, market streets, and crossings increase risk

This creates a placement and budget puzzle.

## 3.2 Fuel System and Delivery Timing

Use shared logistics for both households and lighting, with explicit timing priority.

### Daily fuel delivery order

1. Morning/day:
- vendors prioritize household fuel requests first (cooking/heating baseline).

2. Late afternoon/evening:
- remaining fuel capacity is used for lamp refills.
- each lamp source requests one nightly fuel load.

3. Night start:
- lamps with sufficient fuel ignite.
- lamps without delivered fuel stay dark.

This creates a direct tradeoff: weak household fuel supply can also reduce night lighting coverage.

### Accepted lamp fuels (multi-fuel support)

Let lamp posts accept multiple fuel types from day one.

Domestic fuel options:
- `tallow` (animal-fat lamps; linked to hunting chain)
- `lamp_oil` (fish/seed oil lamps; linked to processing chain)

Imported premium option:
- `whale_oil` or `refined_oil` (import-only, best burn efficiency)

Suggested burn values (example):
- tallow: `1.0` base night unit
- lamp_oil: `1.25` night units
- imported oil: `1.75` night units

This keeps the system simple while allowing later economic depth.

### Story fit guidance

If the city is early frontier:
- start with tallow first

If the city becomes trade-oriented:
- unlock/import premium oil via world-map trade nodes

If the city develops coastal economy:
- add lamp_oil local production path

## 3.3 No Policy Layer (For Now)

For initial implementation, skip policy presets.
- player decisions are made through placement and fuel availability only
- this keeps the system legible while tuning base behavior

## 4. Night Events and Severity

Event ladder:
- minor: petty theft, spoiled shipments, missing small quantities
- moderate: warehouse breach, market disorder, reputation hit
- severe (rare): assault/murder and major social shock

Additional event ideas:
- vandalized road segment (temporary movement slowdown until repaired)
- lamp sabotage chain (selected lights fail next evening unless fixed)
- tavern brawl spillover (temporary evening POI capacity reduction)
- arson attempt (small random stock loss if area is dark and dirty)
- rumor panic (temporary reputation dip unless civic participation is high)
- missing courier (delayed trade departure next morning)

Severity is influenced by:
- risk score
- district type
- existing unresolved pressures
- social mitigation accumulated in evening (`entertainment`, `worship`, `civic`)

Important: severe outcomes should be rare and signposted by prolonged neglect.

## 5. Mitigation Systems

Non-light mitigations:
- improved evening social participation (lower disorder carry-over)
- household food/water/fuel reliability
- sanitation cleanup effectiveness
- emergency ration or relief policies
- fast response jobs at dawn

This ensures players have multiple valid strategies.

## 6. Data Model Proposal

Building additions:
```ts
lightingSource?: {
  radiusTiles: number
  acceptedFuelTypes: Array<'tallow' | 'lamp_oil' | 'refined_oil'>
  baseFuelPerNight: number
  slotCapacity?: number
}
```

Night state snapshot:
```ts
nightState: {
  cityRiskScore: number
  districtRisk: Record<string, number>
  fuelConsumed: number
  socialMitigation: {
    entertainment: number
    worship: number
    civic: number
  }
  eventsLastNight: Array<{ id: string; severity: string }>
}
```

## 7. Runtime Integration Map

Engine:
- `TimeManager`: trigger night evaluation and dawn resolution
- `StorageManager`: theft targets and quantity impacts
- `ReputationManager`: civic/order reputation outcomes
- `PopulationManager`: impacts from severe events
- `SettlerBehaviourManager`: evening-to-night transition state handling

Potential new manager:
- `NightOrderManager` for risk scoring and event resolution

Frontend:
- night risk panel
- illumination overlay
- fuel status per light source
- morning report feed ("What happened last night")

## 8. Balancing Rules

Recommended safeguards:
- hard cap max losses per night
- guarantee early warning before severe events
- diminishing returns on excessive light overlap
- clear player feedback on top risk contributors

## 9. MVP Scope

Phase 1:
- illumination overlay + multi-fuel lamp support
- citywide risk score from 3 factors (darkness, hunger, sanitation/disorder)
- 3 event types (petty theft, disorder, vandalized road)
- morning report and simple mitigation suggestions

Phase 2:
- district risk refinement and more event variety
- richer event table and severe rarity path
- link outcomes into quest/incident systems later
