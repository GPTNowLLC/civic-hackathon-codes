# Dispatch Plan — Three-Column Dashboard Pivot

**Date:** 2026-05-01
**Presentation date:** 2026-05-11 (~7 working days)
**Captain:** USS Civic Hackathon Codes

---

## North-star framing

The single finding the dashboard must land: Portland zoning data is stuck behind APIs public AI tools cannot reach. The step function from Column 1 → Column 2 on zoning-heavy questions is the proof. Every workstream serves that finding.

---

## Column model

| Column | Name | Description |
|--------|------|-------------|
| 1 | Out-of-box | AI tool with no MCP, no enrichment. Baseline. |
| 2 | +MCP | Same tool with MCP enabled (PortlandMaps, Title 33 access). |
| 3 | +MCP +Enrichment | Enriched question (WS-2 skill) → MCP-enabled tool. |

Address is a per-row attribute, not a top-level pivot axis. The address-across matrix is dropped from the primary view.

---

## Workstreams and file ownership (write-conflict avoidance)

### WS-0 — Captain wake-up + plan (this document)
- **Files:** `notes/plan-three-column-pivot.md` (this file), `STATUS.md`
- **Status:** EXECUTING NOW

### WS-1 — Three-column dashboard UI
- **Files:** `site/three-column.html` (new clean page, not a refactor of index.html)
- **Rationale for new page:** index.html is a 1056-line file with its own state model, 11-address matrix, and distinct URL. A clean rewrite at `/three-column` is faster, avoids write conflicts with WS-3, and leaves the existing evaluator 100% intact. The new page is additive.
- **Server change needed:** none — existing static file serving handles it automatically.
- **No WS-3 conflict:** WS-3 touches `server.py` + `benchmarks/rubric.md` only. WS-1 owns `site/three-column.html` only.

### WS-2 — Enrichment skill (Column 3 generator)
- **Files:** `skills/enrichment/enrich.py` (new), `skills/enrichment/prompt.txt` (new), `server.py` (new endpoint `/api/enrich`)
- **server.py touch:** add `/api/enrich` endpoint only. No changes to existing eval/compare/state endpoints.
- **No conflict with WS-1:** WS-1 does not touch server.py.
- **No conflict with WS-3:** WS-3 adds `audience_appropriateness` to eval prompt + JSON. WS-2 adds a separate `/api/enrich` endpoint. Different code sections, no overlap.

### WS-3 — Audience-appropriateness grading dimension
- **Files:** `benchmarks/rubric.md` (add Dimension 3, renumber Accuracy Flags to Dimension 4), `server.py` (EVAL_PROMPT_TEMPLATE + JSON schema)
- **server.py touch:** modify EVAL_PROMPT_TEMPLATE string and JSON schema only. Does not touch endpoints, routing, or static serving.
- **Sequencing note:** WS-3 edits server.py; WS-2 also edits server.py. These edit different sections (WS-2: new endpoint in do_POST; WS-3: prompt string at top). Apply WS-3 first, then WS-2 adds the endpoint. Or apply in parallel to different code regions — captain will apply WS-3 prompt edits, then WS-2 endpoint addition, as sequential steps within this single session.

### WS-4 — Citation-quality-2 investigation
- **Files:** `notes/citation-quality-2-investigation.md` (new, read-only investigation first)
- **server.py:** conditional — only if root cause is a prompt tweak (defer to after WS-3 lands).
- **No conflict:** read-only investigation; server.py edit is conditional and deferred.

### WS-5 — Example rows (3–5 cells)
- **Files:** `examples/tiny-house/three-column.md`, `examples/adu-setbacks/three-column.md`, `examples/lot-division/three-column.md` (zoning-heavy north-star row), `data/three-column-state.json`
- **Depends on:** WS-1 (UI), WS-2 (enrichment skill), WS-3 (third dimension). Execute after those land.
- **Honesty doctrine:** no fabricated AI outputs. Cells that cannot be run live are marked PENDING with explicit notes.

---

## Dispatch order

1. **WS-0** — DONE (this document).
2. **Parallel execution** (captain executes sequentially within session, treating as parallel work units):
   - WS-3 (rubric + server.py eval prompt) — first, as it touches server.py before WS-2.
   - WS-4 (investigation note) — read-only, no conflicts.
   - WS-1 (new three-column.html) — new file, no conflicts.
   - WS-2 (enrichment skill + server.py endpoint) — after WS-3 server.py edit is complete.
3. **WS-5** — after WS-1+2+3 are all landed.

---

## Key decisions

- **New page, not refactor.** `site/three-column.html` at `/three-column` path. Existing `site/index.html` unchanged. The server already serves any file from `site/`.
- **No address matrix in three-column view.** Each row is a scenario. Address shown as a per-row attribute.
- **Enrichment is a server endpoint.** `POST /api/enrich` takes `{question}`, returns `{enriched_question}`. Thin Python wrapper around a Claude CLI call. The UI calls it client-side; the user then copies the enriched question to their MCP tool and pastes the result as Column 3 input.
- **Honesty on Column 1/2/3 cells.** Since we cannot programmatically query ChatGPT/Claude/Grok/Gemini here, Column 1/2 cells are populated from real tool runs captured in the examples files. If not yet run, cell shows PENDING with a clear note.
- **Priority row:** lot-division at 1923 NW Hoyt St (Pearl District) — zoning-heavy, demonstrates the step function. Tiny-house ADU is mandatory per requirements.
