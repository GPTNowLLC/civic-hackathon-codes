# Plan — Comparison Mockup Detail Page Improvements

Date: 2026-05-04
Source conversation: `2026-05-04 11-07 I wonder if, regarding citation, the three categories.`
Page in scope: `site/comparison-mockup.html` (the detail page Brady liked best)
Live URL: http://localhost:8092/comparison-mockup.html

---

## What we agreed in the conversation

1. **Two columns, not three.** For the *detail* drill-down: only **out-of-the-box** vs **+MCP +enrichment**. The middle "+MCP only" column is needed for the high-level dashboard story (three-step roadmap) but adds noise on the detail page. Before/after is the punchier framing.
2. **Dynamically generated, not hand-coded.** The page should be rendered from the same evaluation data that powers the dashboard, parameterized by scenario.
3. **Four rubric dimensions, not three.** Replace today's three with:
   - **Accuracy** — is the response factually correct? Judged by an *adversarial* second LLM that looks things up agentically.
   - **Completeness** — did it cover the scenario holistically?
   - **Authoritative citations** — are sources from `portland.gov` (or recognized authoritative docs), not Redfin / random blogs?
   - **Consumability** — would an average Portland resident or business owner actually understand and act on it? (replaces "plain language", strengthened to ELI5 for residents/business owners.)
4. **Adversarial judging changes.** Today the same model that generates the answer also evaluates it. Switch the evaluator role to a different model (Claude with web/agentic lookup) primed to *disbelieve* the answer and verify claims — citation becomes its own dimension instead of a proxy for accuracy.
5. **Audience target locked in the enrichment prompt.** Add: *"the reader is someone who lives or works in the city of Portland — explain it like they have no permitting expertise."* This is what the city wrote in their challenge prompt.
6. **Pick one canonical scenario for the demo.** Tiny house at 4521 SE Belmont (current mockup) is fine. We don't need to wire up dynamic generation for all 7 — one rendered well is enough for the pitch.
7. **Optional flourish:** the enriched prompt could ask ChatGPT (or Claude) to render the comparison itself as an artifact, demonstrating that artifact rendering is part of "where users are headed." Defer; nice-to-have.

---

## Step-by-step plan

### Step 1 — Update the rubric file (low risk, fast)

`benchmarks/rubric.md`

- Add **Accuracy** as Dimension 1 (currently usefulness is 1; bump usefulness/completeness order).
- Reframe **Citation Quality** → **Authoritative Citations**: scoring is now about source authority (portland.gov vs. Redfin vs. nothing), not just whether a section number exists.
- Reframe **Audience-Appropriateness** → **Consumability**, with ELI5 framing tied to "lives or works in Portland."
- Add **Completeness** as its own dimension (today it's smushed into usefulness).
- Document the adversarial-judge protocol: generation model ≠ evaluation model; evaluator is told to *verify*, not to summarize.

### Step 2 — Update the evaluator endpoint

`server.py` — `EVAL_PROMPT_TEMPLATE` and the `/api/evaluate` route.

- Return four scores instead of three: `accuracy`, `completeness`, `authoritative_citations`, `consumability`. Plus `accuracy_flags` and `data_quality_notes` as today.
- Change the prompt framing to adversarial: "Assume the response may be wrong. Verify each specific claim. Look up Portland Maps, portland.gov, the relevant Titles." (Actual web/MCP lookup capability depends on what we plumb in — at minimum, instruct the model to be skeptical and flag every unverified specific claim.)
- Use a different model for evaluation than for generation. Easiest: hardcode evaluator = Claude even when generator = ChatGPT/Grok/Perplexity. Already a separate call, so this is a model-id change.
- Keep address-specific cap rule, but apply it to **completeness** (you didn't pull the data → you can't be complete), not accuracy. Accuracy should reflect what *was* said, not what was missing.

### Step 3 — Update the enrichment prompt

`skills/enrichment/` — wherever the Column-3 prompt template lives.

- Add the audience locking line: *"The reader lives or works in the city of Portland and has no permitting expertise. Explain like they're an average resident or business owner."*
- Keep all existing zoning-data inserts.

### Step 4 — Make `comparison-mockup.html` data-driven

Two paths; recommend **A** for hackathon timeline:

- **A. Static-but-templated.** Convert the mockup to a small Jinja-style template rendered at request time by `server.py`, fed from `data/three-column-state.json`. URL: `/comparison/<scenario-id>`. Keeps the file small, no front-end framework. Reuses existing state file.
- **B. Client-side render.** Page fetches `/api/three-column-state` and renders columns in JS. More code; same outcome.

Either way:

- **Drop the middle column.** Use only `col-1` (out-of-box) and `col-3` (MCP+enrichment).
- **Replace the rubric strip** to show 4 dimensions.
- **Composite total** becomes /12 (or drop it; four small bars may communicate better than one number).
- **Citations chip row** stays — but recolor based on *authority* (green = portland.gov, yellow = third-party but plausible, red = Redfin / non-authoritative, gray = none) rather than specificity.
- **Highlight legend** stays.

### Step 5 — Pick and populate the canonical scenario

Tiny house at 4521 SE Belmont is already drafted. Capture two real runs (not the hand-written prose currently in the mockup):

- Out-of-box: a fresh ChatGPT run with no MCP, no enrichment. Paste into state file.
- MCP+enrichment: the existing best Claude+MCP+enriched-prompt result.

Run the new 4-dimension evaluator on both. Save scores into state.

### Step 6 — Top-of-page narrative line

The mockup's current deck — "Three versions of the same question" — needs to become **two versions**:

> "Two AI answers to the same question. Same address, same homeowner. The only difference: tooling and prompt. Read both to see what changes when an AI can reach the city's data and is briefed on who's asking."

### Step 7 — Wire detail page from dashboard

The dashboard (`three-column.html` or `index.html`) should link each scenario row to `/comparison/<scenario-id>`. Currently the comparison-mockup is orphaned. Add a "see detail →" affordance on the dashboard rows.

### Step 8 — Bonus, defer if time-boxed

- Render the enriched-prompt comparison **as a ChatGPT artifact** during the live demo. Slide content: "we asked GPT to draw its own before/after." Cute but not required.
- Add a "did the AI run agentic verification?" badge — a small reassurance to the city that we used a separate, skeptical evaluator.

---

## Order of operations (recommended)

1. Rubric file (Step 1) — pure docs, unblocks everyone.
2. Evaluator endpoint (Step 2) — biggest leverage; everything downstream needs the new scores.
3. Enrichment prompt (Step 3) — small change.
4. Re-run the two canonical responses through the new evaluator (Step 5).
5. Template the comparison page, drop middle column, render 4-dim rubric (Step 4 + Step 6).
6. Link from dashboard (Step 7).

Steps 1–3 are low-risk text changes. Step 2 needs a real test against the live evaluator. Step 4 is the biggest unknown — server-side templating in stdlib Python is fine, but we have to confirm `server.py`'s current shape supports it without pulling in Flask. (It uses `BaseHTTPRequestHandler` today; a small string-template render is enough.)

---

## Decisions (2026-05-04 review with Chris)

- **Dashboard stays 3-column.** Only the detail-view side-by-side text comparison drops to 2 columns.
- **Adversarial evaluator** — yes, real agentic verification. We already have it: `skills/atomization/atomize.py` shells out to `claude` CLI and produces atoms with `correctness` and `verified_truth` per claim. Make the model configurable (Claude or ChatGPT) so we can swap evaluator-vs-generator pairs.
- **Configurable evaluator model** — yes. Plumb a `--model` / `evaluator_model` setting through atomize.py and `/api/evaluate`. Default to Claude.
- **Add the city's audience phrase** to enrichment — yes.
- **Dynamic detail page** — yes.
- **Real responses, always.** Both columns sourced from real AI runs across all 7 scenarios. No paraphrasing.
- **Composite score (my recommendation): drop the single number.** Show four bars + the walkaway quote. A `/12` total invites the wrong question ("which AI wins?") when the actual story is "out-of-box fails specifically on accuracy and authoritative citations — those are the data-access gaps." Four bars expose the failure shape; one number obscures it. The walkaway quote already carries the qualitative summary. If we want a glanceable cue, color-code each bar's worst score and skip the number entirely.

---

## Revised scope from those decisions

### Atomization is the evaluator

Today's `/api/evaluate` is a one-pass scoring call (same model, generator-style prompt). The actual verification work is happening in atomization. Consolidate:

- Promote `skills/atomization/` to be the canonical evaluation pipeline. The scoring numbers shown on the comparison page are *derived from atoms*, not from a separate scoring call. That's how we get adversarial guarantees: the model is reasoning over individual claims, not rubber-stamping a whole response.
- Derive each of the four dimensions from the atoms:
  - **Accuracy** = share of atoms where `correctness ∈ {correct, correct-vague, correct-action, correct-judg, correct-range, hedge-correct}`, weighted by `importance`. WRONG / PARTIAL-WRONG drag it down.
  - **Completeness** = coverage of expected-topic atoms. Define a per-scenario "must-cover" topic list (zoning, size, setbacks, permits, sequence, costs); score is share covered.
  - **Authoritative citations** = share of atoms whose `citation` resolves to portland.gov / a recognized Portland Title vs. Redfin / null / non-authoritative.
  - **Consumability** = average `actionability` across the response's atoms, with a penalty for jargon density (compute from response text or have the evaluator emit a separate `consumability` field per response).

### Evaluator-model configurability

- Add `EVALUATOR_MODEL` env var (or CLI flag `--evaluator-model`) to `skills/atomization/atomize.py` and any new scoring call.
- Add a small adapter so the same prompt can dispatch to either `claude -p` or an OpenAI-style call. Both already have JSON-mode capability.
- Record `evaluator_model` in each atoms file so the detail page can show "verified by: Claude" or "verified by: GPT-5" — this is itself part of the story.

### Boil-the-ocean run plan

Seven scenarios × two columns = 14 real runs (we drop the middle MCP-only column from the *detail* render but keep capturing it for the dashboard). Per scenario:

1. Run **Column 1** (out-of-box, no MCP, bare prompt) on real ChatGPT (or whatever consumer-frontier tool we want to represent "where users are"). Save the response verbatim.
2. Run **Column 3** (MCP + enriched prompt) on Claude with PortlandMaps MCP. Save the response.
3. Run atomization with the *other* model as evaluator (so generator ≠ evaluator).
4. Derive 4-dim scores, persist.

That's the work. The detail-page render is cheap once the data exists.

### Composite-score policy

- Drop the `/12` composite from the detail page.
- Keep the four bars. Each bar gets a color cue based on its own score (red ≤ 1, amber = 2, green = 3).
- Walkaway quote stays as the qualitative anchor.
- Dashboard (3-col) can keep its existing composite if it helps the eye scan rows — but switch from `/9` to `/12` and label dimensions clearly.

---

## Updated order of operations

1. Rubric file rewrite — add Accuracy and Completeness, reframe Citation → Authoritative Citations, reframe Audience → Consumability. Document derive-from-atoms scoring. *(Step 1)*
2. Atomization upgrades — add evaluator-model knob, add `consumability` per response, add `must-cover-topics` per scenario in `data/scenarios.json`. *(Step 2)*
3. Aggregator — small Python that reads an atoms file and emits the four 0–3 scores. Persist into `three-column-state.json`. *(Step 2.5)*
4. Enrichment prompt — add the audience phrase. *(Step 3)*
5. Capture real runs for all 7 × 2 columns. *(Step 5)*
6. Re-atomize all scenarios with the new pipeline + record evaluator_model. *(Step 5)*
7. Template the comparison page (server-side render in `server.py`), drop middle column, render four bars from aggregated scores, drop composite total. *(Steps 4 + 6)*
8. Wire dashboard rows → detail URLs. *(Step 7)*
9. Demo-day flourish (optional): ChatGPT-artifact rendering of the comparison. *(Step 8)*
