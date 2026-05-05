## Ship's Charter

- Ship name: **USS Civic Hackathon Codes**
- Commissioned: 2026-04-29
- Commodore: main Claude Code session (talks to Chris)
- Captain type: cron-triggered patrol + on-demand dispatch via `Agent(subagent_type="ship-captain")`
- Doctrine: load the `ship-captain` skill at session start and obey it. STATUS.md, notes/patrol-log.md, and the chat-delivered patrol report are mandatory every run.
- Slug in Mission Control: `civic-hackathon-codes` (http://localhost:4747)
- Ship type: **research ship** — produces evaluation artifacts and consulting deliverables, not code
- Project-specific standing orders (override fleet doctrine):
  - Captain does NOT push to remotes. No external messages.
  - All deliverable artifacts live in this repo. Nothing gets sent to the city without Chris's explicit approval.
  - Scope: Track 1 only — AI tool evaluation of homeowner code & regulation queries. Process analytics are out of scope.
  - Sister ship: `civic-hackathon-permits` (separate repo) — shares rubric philosophy, site architecture, and server pattern. Borrow freely; do not modify the permits ship.

# Civic Hackathon Codes & Regulations

AI tool evaluation for the City of Portland hackathon: "City Code & Regulation Search Assistant."

## Mission

Hackathon challenge from the Bureau of Planning & Sustainability (Code Alignment program), presented at the OSU AI Incubation Lab kickoff (https://events.oregonstate.edu/event/incubation-lab-kick-off):

> People who live and work in the city of Portland have questions about what they can do on their property. It is difficult for them to find answers to seemingly simple questions, leading to frustration and confusion. It is not uncommon for people to work on their property without knowing the rules, which can result in code violations at best and safety hazards at worst.
>
> **How might we help community members easily find and apply relevant rules and regulations to real-world situations, with clear references to authoritative sources?**

This ship builds the benchmark: can ChatGPT, Claude, Grok, Gemini, and Perplexity answer real Portland code questions accurately, usefully, and with proper citations?

## Data sources (from hackathon brief)

- Title 4: Original Art Murals
- Title 10: Erosion and Sediment Control
- Title 11: Trees
- Title 17: Public Improvements
- Title 18: Noise Control
- Title 24: Building Regulations
- Title 25: Plumbing Regulations
- Title 26: Electrical Regulations
- Title 27: Heating and Ventilating Regulations
- Title 28: Floating Structures
- Title 29: Property Maintenance Regulations
- Title 31: Fire Regulations (coordinate with PF&R)
- Title 32: Signs and Related Regulations
- Title 33: Zoning Code
- Transportation Admin Rules: https://www.portland.gov/transportation/development/commonly-referenced-transportation-code-and-administrative-rules
- Sewer, Stormwater & Erosion Control: https://www.portland.gov/policies/environment-built/sewer-stormwater-erosion-control
- Building Official Determinations, Administrative Rules, Code Guides, Program Guides

## The benchmark

Four scoring dimensions, all 0–3, derived from atomized claims rather than a single end-of-response score (full definitions and aggregation formulas in `benchmarks/rubric.md`):

1. **Accuracy** — are the specific factual claims actually correct?
2. **Completeness** — did the response cover the things a resident needs to act?
3. **Authoritative Citations** — sources from `portland.gov` / Portland Titles, vs. blogs / nothing?
4. **Consumability** — would an average Portland resident or business owner understand and act on this?

Adversarial protocol: the model that *generates* a response must not be the model that *evaluates* it. The evaluator atomizes the response, verifies each atom, and the four dimension scores are computed deterministically from the atoms.

## Query corpus (14 scenarios)

Single source of truth: `data/scenarios.json`. The original hackathon brief listed 7 sample questions; the corpus was expanded to 14 to cover more of Portland's code surface (sewer, signage, accessory structures, historic-district edge cases) and to spread across neighborhoods.

| # | Scenario | Address |
|---|---|---|
| 1 | Tiny house | 831 SE 174th Ave (Hazelwood / Centennial) |
| 2 | ADU setbacks | 5112 SE Belmont St |
| 3 | Fence height | 3220 NE 33rd Ave |
| 4 | Building records | 1719 SE Ladd Ave |
| 5 | Pergola | 4773 SE 52nd Ave |
| 6 | Front porch extension | 2145 SE Ladd Ave |
| 7 | Workshop / pole barn | 450 NE 103rd Ave |
| 8 | Lot division / condos | 4435 SE Belmont St |
| 9 | Cesspool / sewer | 6624 N Missouri Ave |
| 10 | Second driveway | 4043 NE 33rd Ave |
| 11 | Roof replacement permit | 5500 SE Belmont St |
| 12 | Finish basement | 1860 SE Ladd Ave |
| 13 | A-board sign | 1022 SW Morrison St |
| 14 | Tree removal (front yard) | 3413 NE 33rd Ave |

## Deliverables

- `benchmarks/rubric.md` — four-dimension rubric (Accuracy + Completeness + Authoritative Citations + Consumability)
- `examples/` — scored AI evaluations, one directory per scenario
- `deliverables/presentation/` — consulting pitch to city
- `deliverables/recommendations.md` — data improvement recommendations

## Layout

- `examples/`      — worked AI query evaluations (one subdir per scenario)
- `benchmarks/`    — rubric and scoring methodology
- `deliverables/`  — presentation deck, recommendations doc
- `case-studies/`  — hackathon brief and background context
- `data/`          — raw API data if needed
- `notes/`         — patrol log, session notes, handover docs
- `STATUS.md`      — ship state card

## Patrol scope

Each patrol, the captain:
1. Checks STATUS.md for open threads and blockers
2. Checks `benchmarks/rubric.md` — draft if missing
3. Checks `examples/` — how many scenarios scored?
4. Checks `deliverables/` completeness
5. If `site/` is empty: bootstrap from sister ship (`civic-hackathon-permits`)
6. Updates STATUS.md and patrol-log, emits report
