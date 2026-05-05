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

Three scoring dimensions (codes & regs requires citation quality — this is the key difference from the permits ship):

**Usefulness (0–3):** Does the response help the person actually decide what to do?
- 0: Accurate but unactionable
- 1: Directionally helpful but vague
- 2: Actionable — specific requirements, next steps
- 3: Fully useful — covers the scenario holistically with concrete guidance

**Citation quality (0–3):** Did the AI cite authoritative sources? (Hackathon constraint: "Ensure authoritative sources are cited. Clear attribution to official documents.")
- 0: No citations
- 1: Vague reference ("check Portland's zoning code")
- 2: Named the right Title or administrative rule ("Title 33 Zoning Code", "Title 11")
- 3: Specific section citation ("Title 33.110.220", "PCC 28.01.030") with correct attribution

**Accuracy flags:** Specific factual claims a Portland code official should verify.

**Address-specific cap:** Same as permits ship — if AI admits it cannot retrieve address-specific data, max usefulness = 2.

## Query corpus (7 scenarios × 2 query types = 14 cells)

From the hackathon's sample questions:

| # | Scenario | Address |
|---|---|---|
| 1 | Tiny house on my lot | 4521 SE Belmont St (Sunnyside) |
| 2 | Fence height (front/back/side yard) | 2847 NE 33rd Ave (Alameda) |
| 3 | Tree removal (front yard) | 2108 SW Park Ave (Goose Hollow) |
| 4 | ADU / setback requirements | 6234 N Missouri Ave (Arbor Lodge) |
| 5 | Roof replacement permit | 3421 SE 52nd Ave (Foster-Powell) |
| 6 | Lot division / condos | 1923 NW Hoyt St (Pearl District) |
| 7 | Business A-board sign | 939 SW Morrison St (Downtown) |

## Deliverables

- `benchmarks/rubric.md` — three-axis rubric (usefulness + citation quality + accuracy flags)
- `examples/` — 7×2 matrix of scored AI evaluations
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
