# Knowledge and Culture Trees (Initial Design)

## Purpose
Define a specific progression model that complements:
- neighborhood puzzle gameplay,
- evolving consumption tastes,
- quality-tier production,
- grand project goals.

This is an initial tree set intended for first implementation pass.

## Progression Currencies
Use two independent currencies:
- `Knowledge` (technical capability)
- `Culture` (social identity and demand shaping)

## 1) Knowledge: How It Accumulates
Primary generation per slow/very slow tick:
1. `Education throughput`
- from school/library/university-like buildings and assigned workers.
2. `Industrial learning`
- bonus from running advanced production chains consistently.
3. `Project milestones`
- one-time Knowledge rewards from Grand Project stage completions.

Modifiers:
- high neighborhood/service reliability in knowledge districts increases output.
- repeated chain failures reduce temporary efficiency (representing disruption).

Anti-snowball:
- soft catch-up boost when total Knowledge is below era expectation.
- diminishing returns when stacking identical knowledge buildings too tightly.

## 2) Culture: How It Accumulates
Culture should be mostly emergent from play:

Primary sources:
1. `Consumption diversity and stability`
- households fulfilling comfort/luxury needs generate Culture.
2. `Public life intensity`
- markets, plazas, bathhouses, taverns, temples, festivals (if present later).
3. `Trade exposure`
- sustained imports of culturally tagged goods build related Culture aspects.
4. `Prestige environment`
- monuments/civic buildings in high-tier neighborhoods.

Penalties:
- long-term shortage of staple/comfort goods drains Culture growth.
- severe nuisance concentrations reduce Culture efficiency.

Anti-snowball:
- culture gain scales with satisfied population share rather than absolute size only.

## 3) Tree Structure Rules
1. Both trees are node graphs with prerequisites.
2. Some nodes are mutually exclusive (identity-defining choices).
3. Era gates require:
- minimum population tier + at least one prior Grand Project stage.
4. Tree nodes unlock:
- building types,
- production mode modifiers,
- service/locality mechanics,
- trade and project capabilities.

---

## 4) Initial Knowledge Tree

## Era I: Foundations
1. `Surveying`
- Effect: unlocks neighborhood overlay precision and better placement previews.

2. `Road Engineering I`
- Effect: modest road movement reliability bonus (not raw speed spikes).

3. `Standardized Tooling`
- Effect: tool recipes slightly cheaper; lower tool shortage downtime.

4. `Ledger Practices`
- Effect: better logistics request prioritization visibility and reserve controls.

## Era II: Urban Systems
1. `Road Engineering II`
- Prereq: Road Engineering I
- Effect: reduced congestion penalties in dense road networks.

2. `Public Sanitation`
- Effect: unlocks sanitation service building and hygiene locality emitter.

3. `Process Control`
- Effect: unlocks `regular/premium` stability upgrades in selected workshops.

4. `Warehouse Methods`
- Effect: improved storage reservation behavior and reduced handling waste.

## Era III: Industrial Administration
1. `Mechanized Workshops`
- Effect: unlocks advanced production buildings or upgrades.

2. `Quality Certification`
- Prereq: Process Control
- Effect: premium output consistency bonus and contract eligibility boost.

3. `Maritime Logistics`
- Effect: better trade route turnaround and loading efficiency.

4. `Scholarly Institutions`
- Effect: unlocks Civic University Grand Project path.

## Era IV: State Capacity
1. `Bureaucratic Standardization`
- Effect: global reduction in assignment churn and operational downtime.

2. `Infrastructure Corps`
- Effect: better upkeep/repair cadence for roads and civic services.

3. `Strategic Industry`
- Effect: major throughput bonuses for designated strategic chains.

4. `Administrative Science`
- Effect: converts portion of Culture surplus into Knowledge trickle.

---

## 5) Initial Culture Tree

## Era I: Communal Identity
1. `Market Traditions`
- Effect: market coverage cadence bonus; small happiness from stable supply.

2. `Shared Rituals`
- Effect: unlocks early faith/civic amenity service.

3. `Craft Pride`
- Effect: cheap-to-regular quality transition easier for artisan goods.

4. `Local Fairs`
- Effect: periodic temporary demand spike + Culture burst if fulfilled.

## Era II: Civic Character
1. `Urban Etiquette`
- Effect: nuisance penalties softened in medium-tier neighborhoods.

2. `Public Festivity`
- Effect: unlocks festival-like temporary city buff mechanic (resource sink).

3. `Merchant Culture`
- Effect: increased Culture from successful trade contracts.

4. `Domestic Standards`
- Effect: raises house tier-up requirements but grants stronger tier rewards.

## Era III: Social Doctrine (Exclusive Branch Pair)
1. `Civic Humanism`
- Effect: stronger amenity/prestige benefits; better household stability.

2. `Mercantile Pragmatism`
- Effect: stronger trade/revenue bonuses; weaker amenity effects.

Mutual exclusivity:
- choosing one locks the other for this run.

## Era IV: Legacy Identity (Exclusive Branch Pair)
1. `Patronage Commonwealth`
- Effect: Culture heavily boosts Grand Project speed and district quality.

2. `Commercial Hegemony`
- Effect: Culture heavily boosts export value and contract leverage.

Mutual exclusivity:
- one legacy identity per run.

---

## 6) Example Costs and Pacing
Initial balancing target (subject to testing):
- Era I nodes: 50-120 points each.
- Era II nodes: 140-260 points each.
- Era III nodes: 300-500 points each.
- Era IV nodes: 600+ points each and hard era prerequisites.

Unlock cadence target:
- Early game: new node every 5-8 minutes.
- Mid game: every 10-15 minutes.
- Late game: major unlock every 20+ minutes.

---

## 7) Integration with Existing Systems
1. `CityCharter` remains the macro era gate and unlock authority.
2. `KnowledgeTreeManager` and `CultureTreeManager` evaluate unlocks and apply modifiers.
3. `Needs`, `Buildings`, `WorkProvider`, `Trade` read resolved modifier tables.
4. Demand basket resolver uses active Culture nodes plus emergent taste vector.

## Suggested Event Contracts
- `cs:tech.unlockNode`
- `sc:tech.treeSync`
- `ss:tech.knowledgeDelta`
- `ss:tech.cultureDelta`
- `ss:tech.nodeActivated`

---

## 8) Minimal First Slice
Implement smallest meaningful subset:
1. Knowledge Era I + Culture Era I only.
2. One exclusive choice pair postponed.
3. Tie effects to:
- market cadence,
- neighborhood nuisance modifiers,
- premium output consistency.

Done criteria:
- Player makes at least 4 meaningful progression choices.
- Choices visibly alter city puzzle and production decisions.
