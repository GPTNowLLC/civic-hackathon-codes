# STATUS — USS Civic Hackathon Codes

## State
OPERATIONAL — evaluation site live at http://localhost:8092/

## Mission summary
AI tool evaluation for Portland hackathon: "City Code & Regulation Search Assistant." Four-dimension rubric (Accuracy, Completeness, Authoritative Citations, Consumability — all 0–3, derived from atomized claims). 14-scenario corpus, address-specific. Challenge from the Bureau of Planning & Sustainability (Code Alignment program), presented at the OSU AI Incubation Lab kickoff: https://events.oregonstate.edu/event/incubation-lab-kick-off

## Active threads

- Benchmarks rubric (`benchmarks/rubric.md`): COMPLETE — 4D (Accuracy + Completeness + Authoritative Citations + Consumability)
- Site (`site/index.html`): COMPLETE — three-column comparison dashboard (promoted from former `three-column.html`)
- Site (`site/legacy-matrix.html`): ARCHIVED — original 7×11 evaluation matrix, kept for reference
- server.py: COMPLETE — all endpoints live: /api/evaluate (3D), /api/enrich (new), /api/three-column-state (new), /api/compare, /api/state, /api/responses
- Query corpus (`examples/`): STUBS COMPLETE (14 original) + THREE-COLUMN STUBS (3 rows: tiny-house, lot-division, adu-setbacks)
- Three-column examples: BLOCKED ON CHRIS — Col 1/2/3 responses need real AI tool runs (no fabrication)
- Enrichment skill (`skills/enrichment/`): COMPLETE — CLI + server endpoint
- Citation-quality-2 investigation: COMPLETE — root cause diagnosed, fix applied, validation pending MCP examples
- Presentation: NOT STARTED
- Recommendations: NOT STARTED

## Three-column pivot (completed 2026-05-01)

North star: Portland zoning data behind unreachable APIs — step function visible in Col 1 → Col 2.
Plan: `notes/plan-three-column-pivot.md`
Infrastructure complete. Three example row files structured and ready for real AI tool outputs.

## Server
- PID file: /tmp/civic-hackathon-codes-site.pid
- Log: /tmp/civic-hackathon-codes-site.log
- Port: 8092
- Endpoints:
  - GET  /api/state — original 2D state
  - POST /api/evaluate — returns {usefulness, citation_quality, audience_appropriateness, rationale, accuracy_flags, data_quality_notes}
  - POST /api/compare — cross-tool comparison report
  - GET/POST /api/responses — original response storage
  - GET/POST /api/three-column-state — three-column dashboard state (data/three-column-state.json)
  - POST /api/enrich — Column 3 enriched question generator

## Scenarios

Single source of truth: `data/scenarios.json` (14 scenarios). Summary:

| # | Scenario | Address |
|---|---|---|
| 1 | Tiny house | 831 SE 174th Ave |
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

## Key difference from permits ship
Authoritative Citations is a first-class scoring dimension (the hackathon brief explicitly requires "clear attribution to official documents"). The full four-dimension rubric is also broader than the permits ship's: it adds Completeness and Consumability so a response that's accurate but incomplete or accurate but unreadable is scored honestly.

## Server
- PID file: /tmp/civic-hackathon-codes-site.pid
- Log: /tmp/civic-hackathon-codes-site.log
- Port: 8092
- API: POST /api/evaluate — returns {"usefulness": 0-3, "citation_quality": 0-3, "rationale": "...", "accuracy_flags": [...], "data_quality_notes": "..."}

## Last patrol
2026-05-01 — Three-column pivot. WS-0 through WS-5 complete. Blocked on real AI tool runs for example cells.
