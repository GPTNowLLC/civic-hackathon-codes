# Patrol Log — USS Civic Hackathon Codes

Append-only. Each entry added by the captain at end of session.

---

## 2026-05-01 — Three-Column Pivot (captain dispatch)

- triggered_by: Commodore dispatch — "Execute three-column pivot per requirements doc"
- exit_status: ok
- workstreams_completed:
  - WS-0: plan written to `notes/plan-three-column-pivot.md`, STATUS.md updated
  - WS-1: `site/three-column.html` (980 lines) — three-column dashboard at http://localhost:8092/three-column.html
    - 7 scenario rows (collapsible), 3 columns (Out-of-box / +MCP / +MCP+Enrichment)
    - Per-cell score badges: U (usefulness), C (citation quality), AA (audience-appropriateness)
    - Step-function visual highlight on column cells where scores improve col-to-col
    - Expandable detail panel: full response text, all three scores, accuracy flags, data quality notes
    - Inline "enter response" + "Evaluate" buttons wired to /api/evaluate
    - "Generate enriched question" button wired to /api/enrich
    - Findings panel auto-populates step-function observations from filled cells
    - State persisted to localStorage + /api/three-column-state
  - WS-2: `skills/enrichment/enrich.py` (66 lines) + `skills/enrichment/prompt.txt` (24 lines)
    - CLI tool: `python3 skills/enrichment/enrich.py "<question>"` → enriched question
    - Server endpoint: POST /api/enrich {question} → {enriched_question}
    - Confirmed working: tiny-house and lot-division enrichments tested live
  - WS-3: `benchmarks/rubric.md` updated — Dimension 3 (audience-appropriateness 0–3) added,
    accuracy flags renumbered to Dimension 4, three-column interpretation table added
    `server.py` EVAL_PROMPT_TEMPLATE updated — audience_appropriateness in rubric + JSON schema
    Confirmed working: /api/evaluate now returns audience_appropriateness field
  - WS-4: `notes/citation-quality-2-investigation.md` — root cause (Hypothesis A: evaluator
    treats "Title 33 Section 33.205" as Title-level not section-level); prompt clarification
    applied to server.py EVAL_PROMPT_TEMPLATE; validation pending live MCP examples
  - WS-5: three example row files created (PENDING for actual AI tool runs):
    - `examples/tiny-house/three-column.md` (152 lines) — mandatory row, enriched question captured live
    - `examples/lot-division/three-column.md` (180 lines) — north-star zoning-heavy row, Pearl District
    - `examples/adu-setbacks/three-column.md` (108 lines) — ADU setbacks, Arbor Lodge
- server_changes:
  - POST /api/enrich (new) — enrichment skill endpoint
  - GET/POST /api/three-column-state (new) — persists three-column dashboard state to data/three-column-state.json
  - EVAL_PROMPT_TEMPLATE: added audience_appropriateness dimension + citation quality clarifications
  - Backward-compatible: existing /api/evaluate, /api/compare, /api/state, /api/responses all intact
- proof:
  - curl http://localhost:8092/ | grep 'Portland Code' → "Portland Code" confirmed (old dashboard intact)
  - curl http://localhost:8092/three-column.html | grep -c 'scenario-row' → 6 (seven rows + template)
  - curl http://localhost:8092/api/three-column-state → {} (clean state, ready for data entry)
  - curl POST /api/evaluate (fence query) → {"usefulness":1,"citation_quality":2,"audience_appropriateness":2,...} confirmed
  - python3 skills/enrichment/enrich.py "tiny-house question" → 60-line enriched question generated
  - python3 skills/enrichment/enrich.py "lot-division Pearl District" → 80-line enriched question generated
- open_dependencies:
  - Chris must run real AI tool queries (out-of-box and MCP-enabled) for Col 1 and Col 2 cells; no fabricated outputs per honesty doctrine
  - Expert (city-side) accuracy grading of example rows — external dependency, cannot be done by captain
  - teammate "embarrass RAG" slide: see patrol report
- notes: Presentation date 2026-05-11. Server restarted to pick up changes (PID in /tmp/civic-hackathon-codes-site.pid). Port 8092 unchanged. Old 7×11 single-cell evaluator (index.html) is fully intact and unmodified.

---

## 2026-04-29 — Site Build (captain dispatch)

- triggered_by: Commodore dispatch — "Build the full evaluation site (clone from sister ship, update for codes & regs)"
- exit_status: ok
- files_touched:
  - server.py (new) — port 8092, STATIC_DIR=site/, evaluator prompt updated for citation_quality, returns {"usefulness","citation_quality","rationale","accuracy_flags","data_quality_notes"}
  - site/index.html (new) — 7 scenarios × 2 query types × 5 AI tools, 2D scoring UI (usefulness + citation quality both 0-3), citationQuality in state, setCitationScore(), map center [45.52,-122.67] zoom 12
  - benchmarks/rubric.md (new) — three-axis rubric, address-specific cap, citation quality 4-level table, 2D interpretation matrix
  - examples/tiny-house/generic.md + address.md (new)
  - examples/fence-height/generic.md + address.md (new)
  - examples/tree-removal/generic.md + address.md (new)
  - examples/adu-setbacks/generic.md + address.md (new)
  - examples/roof-permit/generic.md + address.md (new)
  - examples/lot-division/generic.md + address.md (new)
  - examples/business-sign/generic.md + address.md (new)
  - case-studies/hackathon-brief.md (new) — problem statement, sample questions, data sources, stakeholders
  - STATUS.md (updated) — state OPERATIONAL
- proof:
  - curl http://localhost:8092/ | grep 'Portland Code' → "Portland Code" confirmed
  - curl POST /api/evaluate (tree removal / Title 11) → {"usefulness":1,"citation_quality":2,"rationale":"...","accuracy_flags":[],"data_quality_notes":"..."} confirmed
- notes: Sister ship (civic-hackathon-permits) used as base; key additions are citation_quality scoring axis throughout (prompt, UI, state, stubs). 14 example stubs ready for AI response entry. Server running as background process.

---

## 2026-04-29 — Commissioning

- triggered_by: Commodore (commissioning)
- exit_status: ok
- files_read: (none — first entry)
- files_touched: CLAUDE.md, STATUS.md, notes/patrol-log.md (scaffolded)
- duration_sec: n/a
- notes: Ship commissioned. Mission: Portland hackathon "City Code & Regulation Search Assistant" (BPS Code Alignment program; OSU AI Incubation Lab kickoff). 7 scenarios from hackathon sample questions × 2 query types = 14-cell matrix. Key difference from sister ship civic-hackathon-permits: three scoring axes (usefulness + citation quality + accuracy flags). Site bootstrap dispatched to captain. Port: 8092.
