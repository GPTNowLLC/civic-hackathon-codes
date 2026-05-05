# Requirements — Three-Column Dashboard Pivot

**Source:** transcript review 2026-05-01. Presentation date: **2026-05-11** (~7 working days).
**Audience:** Claude Code session that will dispatch subagents against this ship.
**Captain dispatch path:** `Agent(subagent_type="ship-captain")` — captain reads CLAUDE.md, then fans out crew per the doctrine.

---

## North star

The single sharpest finding to demonstrate:

> Portland's zoning data is stuck behind APIs the public AI tools can't reach. Enabling that access is the unlock.

The dashboard must make this land as a **step function** between Column 1 → Column 2 on zoning-heavy questions. Everything else is supporting evidence.

---

## Scope of this work

In scope:
- Reformat dashboard to a three-column comparison.
- Build the enrichment skill that produces Column 3.
- Add audience-appropriateness as a third grading dimension.
- Investigate why MCP-enabled responses still score 2 on citation quality.
- Generate 3–5 strong example rows (not the full 7×2 grid).

Out of scope (flag, don't build):
- Resident/contractor toggle UI for enrichment (future work — default to "based on everything you know about me").
- Expert (city-side) accuracy grading of examples.
- Any external publication. Captain still does not push.

---

## Workstreams

Five workstreams. Workstreams 1, 2, 3, 4 can run in parallel after workstream 0. Workstream 5 depends on 1+2+3.

### WS-0 — Captain wake-up + plan (sequential, blocks others)

- Captain reads CLAUDE.md, STATUS.md, latest patrol-log entry.
- Captain reads this requirements doc.
- Captain sketches a 1-page plan in `notes/plan-three-column-pivot.md` listing which crew it will dispatch, in what order, and which files each touches (write-conflict avoidance).
- Captain updates STATUS.md "Active threads" to reflect the pivot.

### WS-1 — Three-column dashboard rework (UI)

**Owner crew:** ship-planner first (decide column model), then implementer.
**Files:** `site/index.html`, possibly new `site/three-column.html` if a clean rewrite is faster than refactor.

Requirements:
- Each row = one question.
- Three columns: **Out-of-box** → **+MCP** → **+MCP +enrichment**.
- Drop the "addresses across" axis from the primary view. Address can be a per-row attribute, not a top-level pivot.
- Row drill-in shows the three answer texts side-by-side (collapsed by default; expand to compare).
- Each cell shows the three rubric scores (usefulness, citation quality, audience-appropriateness) and any accuracy flags.
- Visual polish is "demo-grade, not pretty." Navigable > beautiful.
- Keep the existing server endpoints working; do not break the 7×2 single-cell evaluator. The new view is additive.

Acceptance:
- Page loads at `http://localhost:8092/` (or a clearly named alternate path) with at least 3 example rows populated end-to-end (Column 1, 2, 3 all filled).
- One row is the tiny-house ADU canonical example.
- One row is a zoning-heavy question chosen specifically to demonstrate the Column 1 → Column 2 step function.

### WS-2 — Enrichment skill (Column 3 generator)

**Owner crew:** implementer + small experiment.
**Files:** new `skills/enrichment/` directory (or reuse existing skill conventions if the repo has any), `server.py` if a new endpoint is needed.

Requirements:
- Input: the bare user question (e.g., "can I build a tiny house on my lot?").
- Output: the enriched question — what the resident *should* have asked. Includes:
  - Audience inference (default approach: "based on everything you know about me" — i.e., the model infers from context rather than asking).
  - Related considerations the user didn't surface (contractor expectations, phasing, who to call, timeline implications).
  - Diagram or visual asset requests where useful.
- The enriched question gets fed back to the same MCP-enabled tool to produce the Column 3 answer.
- Implementation hint: this is a prompt + a thin runner. Do not over-engineer. A single Claude API call with prompt caching is sufficient.

Acceptance:
- Running enrichment on the tiny-house ADU question produces a visibly richer Column 3 answer than Column 2 — the enrichment is doing real work, not just rephrasing.
- The skill is reusable for any of the 7 scenarios.

### WS-3 — Audience-appropriateness grading dimension

**Owner crew:** implementer.
**Files:** `benchmarks/rubric.md`, `server.py` (evaluator prompt + JSON schema).

Requirements:
- Add a third dimension: **audience-appropriateness (0–3)**.
- Grader framing: "given the average Portland resident with no code/permitting expertise, would they understand this response and feel equipped to act on it?"
- Score levels (draft — let the implementer refine):
  - 0: Jargon-dense, assumes domain expertise, off-putting.
  - 1: Mostly accessible but uses unexplained terminology.
  - 2: Accessible to a motivated resident, defines key terms.
  - 3: Plainly written, anticipates resident-level confusion, scaffolds the next steps.
- Update `benchmarks/rubric.md` (Dimension 3 currently is "Accuracy Flags" — renumber, don't replace).
- Update the evaluator JSON in `server.py` to return `audience_appropriateness: 0-3`.
- Update `site/` UI cells to render the new dimension.

Acceptance:
- Re-evaluating an existing example produces all three scores without breaking the page.
- The rubric and the evaluator prompt are in sync (the rubric has a "keep these in sync" note already).

### WS-4 — Citation-quality 2 investigation

**Owner crew:** bug-hunter or equivalent investigator (read-only first, then propose fix).
**Files:** investigation note in `notes/citation-quality-2-investigation.md`, possibly fixes in `server.py` evaluator prompt.

Question:
- The MCP-enabled rows are scoring 2 on citation quality even when they cite specific PCC sections. Why?
- Hypotheses to test: (a) evaluator prompt is too strict on the "specific section" bar; (b) MCP responses are citing Title-level only; (c) evaluator is undercounting URL citations as "vague."

Acceptance:
- A short note in `notes/` with: reproduction (which example), root cause, recommended fix.
- If the fix is a prompt tweak, apply it. If it's a deeper data issue, flag it and stop.

### WS-5 — Example rows (3–5 strong cells)

**Owner crew:** content/research crew.
**Depends on:** WS-1 (UI exists), WS-2 (enrichment runs), WS-3 (third dim live).
**Files:** `examples/<scenario>/three-column.md` per row (or whatever shape WS-1 settles on).

Requirements:
- Pick scenarios that maximize diff between columns. Mandatory: tiny-house ADU.
- Strongly recommended: at least one zoning-heavy row to demonstrate the step-function finding.
- For each row, capture:
  - Question (verbatim).
  - Column 1 (out-of-box, real AI tool output — no MCP).
  - Column 2 (MCP-enabled, same tool).
  - Column 3 (enriched question → MCP-enabled).
  - All three scores per column. Accuracy flags.
- Do NOT fabricate AI responses. If a real run isn't possible, mark the cell pending and flag it to Chris.

Acceptance:
- 3–5 rows fully populated and visible in the dashboard.
- The zoning-row Column 1 → Column 2 diff is visually obvious.

---

## Cross-cutting requirements

- **Captain doctrine still applies.** No external pushes, no city-facing messages, all artifacts in this repo.
- **No fabricated AI outputs.** If a real tool can't be queried, leave the cell empty with a note. Honesty doctrine.
- **Patrol-log everything.** Each crew dispatch reports back; captain summarizes in `notes/patrol-log.md` and updates `STATUS.md`.
- **Server stays on port 8092.** Don't break existing flow.
- **Sister ship borrowing:** `civic-hackathon-permits` may have useful patterns. Read; do not modify.

---

## Suggested dispatch order

1. WS-0 (sequential).
2. Parallel: WS-1, WS-2, WS-3, WS-4.
3. WS-5 once 1+2+3 are landed.

Captain decides whether to fan out via `parallel-dispatch` skill or sequence based on write-conflict risk. WS-1 and WS-3 both touch `site/` and `server.py` — captain should sequence those or scope the file edits explicitly per crew.

---

## Reporting back to Chris

Captain emits one patrol report when the dispatch wave completes. Report must include:

- What landed in each WS.
- The PROOF line (file paths, line counts, screenshots if UI).
- Open dependencies on Chris (expert grading, teammate's RAG-embarrass slide question — does the new dashboard make it redundant?).
- Recommended next dispatch.

## Open questions to surface, not solve

- Teammate's "embarrass RAG" slide may be redundant once Column 1 of the new dashboard exists. Flag this to Chris in the patrol report; do not contact the teammate.
- Expert grading of accuracy + missing data sources (e.g., electrical-for-ADU) is an external dependency. Flag, don't attempt.
