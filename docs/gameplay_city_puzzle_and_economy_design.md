# City Puzzle and Production Economy Design

## Purpose
This document captures concrete gameplay proposals that combine:
- puzzle-like city layout and neighborhood organization,
- deep production/logistics optimization,
- long-arc city goals without requiring seasons or scripted narrative events.

The design is constrained to fit the existing architecture (`WorkProvider`, `Needs`, `Storage`, `Trade`, `CityCharter`, `Roads`, `Buildings`).

## Core Loop (Target)
1. Player shapes road/building topology to create strong neighborhoods.
2. Neighborhood quality changes household advancement and labor stability.
3. Household demand evolves into culturally distinct consumption baskets.
4. Production chains and logistics are re-tuned for quantity, quality, and timing.
5. Surplus and premium outputs feed trade and Grand State Projects.

---

## 1) Service Coverage: Concrete Definition
`Service coverage` means: a house is considered served only if a service is both reachable and delivered with enough frequency.

For each service type (market goods, water, sanitation, faith, leisure, administration):
- `Reachability`: valid road path from service building to house.
- `Travel budget`: route time must be below service max distance/time.
- `Cadence`: deliveries/visits in last N in-game days must be above threshold.
- `Capacity pressure`: each service building has throughput cap; overload reduces effective coverage.

Coverage score per house/service:
- `coverage = reachable * cadenceScore * capacityScore`
- where `reachable` is `0` or `1`, and the rest are normalized `0..1`.

This uses current mechanics naturally:
- market vendors already perform deliveries,
- roads/pathfinding already exist,
- slow tick systems can recompute cadence windows.

---

## 2) Neighborhood System (Not Flat)
Single scalar score is not enough. Use a layered model:

## 2.1 Neighborhood Profile per House
Track these axes (0..100 each):
- `Access` (road travel time to critical services/jobs)
- `Service` (coverage completeness and cadence)
- `Amenity` (positive area effects)
- `Nuisance` (negative area effects: noise/smoke/crowding)
- `Prestige` (monuments/plazas/premium goods presence)

Compute an overall `NeighborhoodTier` by rules, not just sum:
- `Tier 0`: any critical service below minimum.
- `Tier 1`: critical services pass, low amenity.
- `Tier 2`: services + amenity threshold + nuisance below cap.
- `Tier 3`: high service reliability + prestige + low nuisance.

This avoids a flat "additive score blob".

## 2.2 Locality Modifiers
Each building can emit local modifiers:
- positive: `amenity`, `safety`, `hygiene`, `prestige`
- negative: `noise`, `pollution`, `odor`, `congestion`

Rules:
- radial falloff by tile distance,
- diminishing returns for stacking same source,
- hard caps so one dense cluster is not always best.

## 2.3 Worker Productivity Impact (Without Movement Speed Buffs)
Do not make workers "run faster". Instead change labor effectiveness through downtime and quality:

1. `Work Uptime`
- Better neighborhood tier around homes/workplaces reduces time lost to unmet needs.
- Effect: fewer interruptions, more consistent time on task.

2. `Reliability`
- Poor neighborhood conditions increase chance of partial task failures (aborted deliveries, delayed start, more idle between assignments).
- Effect applied in WorkProvider assignment success/cooldowns.

3. `Output Quality Bias`
- Workers operating from better-served districts have higher chance to produce `regular/premium` outputs (where applicable).

4. `Absence Pressure`
- Low service/hygiene neighborhoods increase temporary unavailability due to recovery (fatigue/health stress), not permanent death spikes.

This preserves existing movement simulation while making neighborhood design materially important.

---

## 3) Emergent Taste: Mechanics Proposals
Goal: culture shifts based on what the city actually does, not policy toggles.

## Proposal A: Consumption Imprint (Simple, Robust)
Maintain city-wide taste weights per tag/item (`0..1`):
- `taste[item]` increases when consumed by households.
- decays slowly over time toward neutral baseline.
- import-heavy items accelerate taste growth.

Demand baskets for each household tier pick preferred variants by current taste.

Pros:
- easy to explain,
- highly systemic,
- low UI burden.

## Proposal B: Cohort Adoption (Social Spread)
Households belong to cohorts (district + tier).
- Each cohort has local taste vector.
- Cohort taste drifts from local consumption and nearby high-prestige cohorts.
- City taste is aggregate of cohorts.

Pros:
- creates neighborhood identity,
- supports interesting district specialization.

Cost:
- more state and UI complexity.

## Proposal C: Prestige Pull + Trade Pressure
Two forces:
- `Prestige Pull`: higher-tier households pull toward premium/elite goods.
- `Trade Pressure`: frequent imports create preference for imported categories.

Pros:
- strong link to trade gameplay.

Cost:
- needs careful anti-snowball balancing.

## Recommended for v1
Hybrid A + C:
- start with global Consumption Imprint,
- add small Prestige Pull and Trade Pressure modifiers.
- defer cohort-level simulation until later.

---

## 4) Product Quality Tiers (Cheap / Regular / Premium) In Practice
Apply only to selected finished goods first (bread, ale, clothing, furniture, tools, preserved food).

## 4.1 Production Modes
Each eligible building recipe gets 3 modes:

- `Cheap`
  - lower input complexity,
  - faster cycle time,
  - lower quality output and lower satisfaction value.

- `Regular`
  - baseline current recipe behavior.

- `Premium`
  - extra/stricter inputs,
  - slower cycle,
  - better quality output, stronger satisfaction, better trade value.

## 4.2 Data Model Sketch
`ItemStack` gains:
- `quality: "cheap" | "regular" | "premium"` (default `regular` for backward compatibility).

`Recipe` gains optional `modeVariants`:
- per mode: input multipliers, extra required tags/items, output quantity multiplier, base quality.

## 4.3 Gameplay Effects
1. Household basket fulfillment:
- premium units contribute more "need value" than regular/cheap.

2. Trade:
- contracts may require minimum quality,
- premium gets price/reputation multipliers.

3. Grand Projects:
- some stages require premium quotas to prevent pure quantity rushing.

4. Logistics/Storage:
- quality-aware reservation preference (preserve premium for luxury/project first).

## 4.4 Balancing Constraints
- Premium should be profitable but not universally dominant.
- Cheap should be viable emergency stabilization.
- Regular should remain efficient default for most of the game.

---

## 6) Grand State Projects (Goal Buildings)
Grand projects are multi-stage city goals with explicit chain and neighborhood requirements.

Each project:
- occupies a unique large footprint,
- has 3-5 construction/commissioning stages,
- consumes deliveries over time,
- grants permanent city modifiers.

## Project A: Great Harbor Exchange
Theme: trade republic.

Requirements:
- trade hub building operational,
- minimum reputation,
- minimum stable food stock threshold.

Stage demands (example):
- timber/stone/iron/tools for build,
- premium clothing/ale/furniture for commissioning.

Effects:
- +route capacity,
- +contract slot,
- +export price bonus for premium goods.

## Project B: Civic University
Theme: knowledge city.

Requirements:
- medium/high neighborhood tier households,
- library/school chain active,
- stable service coverage in core district.

Stage demands:
- paper/books/tools + premium furniture.

Effects:
- passive Knowledge generation,
- unlock advanced process upgrades,
- small productivity reliability boost city-wide.

## Project C: Treasury Mint Complex
Theme: fiscal state.

Requirements:
- metal chain maturity,
- trade income floor,
- low unrest proxy (via neighborhood/service metrics).

Stage demands:
- large metal/tool quotas, plus premium security goods.

Effects:
- reduced trade tariff costs,
- better contract penalties mitigation,
- unlock high-value diplomatic contracts.

## Project D: Public Works Forum
Theme: civic infrastructure.

Requirements:
- broad service coverage,
- hygiene and water thresholds in dense districts.

Stage demands:
- stone/lumber/tools + luxury consumables for inauguration.

Effects:
- stronger positive area effects from civic buildings,
- reduced nuisance impact in adjacent districts,
- improved household tier-up stability.

---

## Recommended Implementation Sequence
1. Neighborhood profile + locality emitters + tier gating.
2. Service coverage cadence model linked to market/vendor and core services.
3. Emergent taste (A + C hybrid) feeding household baskets.
4. Quality tiers for a limited goods subset.
5. First Grand Project (`Great Harbor Exchange`) as end-to-end test case.

## Acceptance Criteria (v1)
- Player can identify and improve weak neighborhoods through clear metrics.
- City demand composition changes over time from actual play, not scripted switch.
- Quality choice creates real tradeoff decisions in at least 3 chains.
- At least one Grand Project provides a meaningful mid/late objective.
