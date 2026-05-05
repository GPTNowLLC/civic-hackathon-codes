# STATUS — USS Civic Hackathon Codes

## State
OPERATIONAL — evaluation site live at http://localhost:8092/

## Mission summary
AI tool evaluation for Portland hackathon: "City Code & Regulation Search Assistant." Three-axis rubric: usefulness (0–3) + citation quality (0–3) + accuracy flags. 7 scenarios × 2 query types = 14-cell evaluation matrix. Challenge from the Bureau of Planning & Sustainability (Code Alignment program), presented at the OSU AI Incubation Lab kickoff: https://events.oregonstate.edu/event/incubation-lab-kick-off

## Active threads

- Benchmarks rubric (`benchmarks/rubric.md`): COMPLETE — 3D (usefulness + citation quality + audience-appropriateness)
- Site (`site/index.html`): COMPLETE — old 7×11 matrix, intact, unmodified
- Site (`site/three-column.html`): COMPLETE — three-column dashboard live at http://localhost:8092/three-column.html
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

| # | Scenario | Address | Neighborhood |
|---|---|---|---|
| 1 | Tiny house | 4521 SE Belmont St | Sunnyside |
| 2 | Fence height | 2847 NE 33rd Ave | Alameda |
| 3 | Tree removal | 2108 SW Park Ave | Goose Hollow |
| 4 | ADU / setbacks | 6234 N Missouri Ave | Arbor Lodge |
| 5 | Roof permit | 3421 SE 52nd Ave | Foster-Powell |
| 6 | Lot division | 1923 NW Hoyt St | Pearl District |
| 7 | Business A-board | 939 SW Morrison St | Downtown |

## Key difference from permits ship
Citation quality is a third scoring axis. The hackathon explicitly requires "authoritative sources cited" and "clear attribution to official documents." Score 0–3: no citation → vague reference → named Title → specific section. Evaluator prompt and site UI both reflect this.

## Server
- PID file: /tmp/civic-hackathon-codes-site.pid
- Log: /tmp/civic-hackathon-codes-site.log
- Port: 8092
- API: POST /api/evaluate — returns {"usefulness": 0-3, "citation_quality": 0-3, "rationale": "...", "accuracy_flags": [...], "data_quality_notes": "..."}

## Last patrol
2026-05-01 — Three-column pivot. WS-0 through WS-5 complete. Blocked on real AI tool runs for example cells.
