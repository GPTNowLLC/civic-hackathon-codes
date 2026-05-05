# Evaluation Rubric — Portland Code & Regulation AI Benchmark

Every AI response is scored on **four dimensions**. Scores are *derived from atomized claims*, not from a single end-of-response scoring pass. The atomization step (see "Adversarial protocol" below) is the verification work; the four numbers shown on the dashboard and detail pages are aggregations over the atoms.

The hackathon challenge (from the Bureau of Planning & Sustainability, Code Alignment program; presented at the [OSU AI Incubation Lab kickoff](https://events.oregonstate.edu/event/incubation-lab-kick-off)) asks: *"How might we help community members easily find and apply relevant rules and regulations to real-world situations, with clear references to authoritative sources?"* Authoritative citations are therefore a primary scoring axis — not a secondary check.

---

## The four dimensions

| # | Dimension | What it measures | Range |
|---|---|---|---|
| 1 | **Accuracy** | Are the specific factual claims actually correct? | 0–3 |
| 2 | **Completeness** | Did the response cover the things a resident needs to act? | 0–3 |
| 3 | **Authoritative Citations** | Are sources from portland.gov / Portland Titles, or from Redfin / blogs / nothing? | 0–3 |
| 4 | **Consumability** | Would an average Portland resident or business owner understand and act on this? | 0–3 |

A response can score independently on each: high accuracy + low completeness is a real outcome (the AI was right about the things it said but missed half the topic), as is high accuracy + low authoritativeness (the AI was right but cited nothing the resident can verify), and so on. The four dimensions are intentionally not collapsed into a composite.

---

## Adversarial protocol — how scores are produced

**The model that generates a response must not be the model that evaluates it.** Self-evaluation is too generous: the same model that wrote a confident-sounding answer is unlikely to flag its own confident-sounding errors.

The pipeline is:

1. **Generate.** A "user-where-they-are" model (e.g. consumer ChatGPT for Column 1) produces a response to the resident's question.
2. **Atomize / verify.** A *different* model — the **evaluator** — receives the verbatim response and breaks it into atomic claims via `skills/atomization/atomize.py`. For each atom it produces:
   - `correctness` — one of: `correct`, `correct-vague`, `correct-action`, `correct-judg`, `correct-range`, `vague-correct`, `vague-action`, `hedge-correct`, `PARTIAL-WRONG`, `WRONG`, `admitted-gap`.
   - `verified_truth` — what is actually correct, grounded in evaluator's own lookup.
   - `citation`, `topic`, `specificity`, `actionability`, `importance` — additional metadata.
3. **Aggregate.** The four 0–3 dimension scores are computed deterministically from the atoms (formulas below).

The evaluator model is **configurable**. For the hackathon: default evaluator is Claude (best agentic lookup), but `--evaluator-model` accepts an OpenAI model so we can demonstrate the cross-evaluation matrix (Claude judging GPT, GPT judging Claude) on demand. The evaluator-model used is recorded in each atoms file so the detail page can show "verified by: <model>".

---

## Dimension 1: Accuracy (0–3)

**Question:** of the specific factual claims this response made, how many were actually correct?

Aggregation formula:

```
let A = atoms attributed to this variant
let importance = atom.importance (1–5)
let weight(atom) = importance(atom)
let credit(atom) =
    1.0  if correctness ∈ {correct, correct-vague, correct-action, correct-judg, correct-range, hedge-correct}
    0.6  if correctness ∈ {vague-correct, vague-action}
    0.0  if correctness ∈ {WRONG, PARTIAL-WRONG}
    skip if correctness == admitted-gap   # admitted gaps don't penalize accuracy
let raw = sum(weight·credit) / sum(weight)
score = floor(raw × 3 + 0.5)              # 0..3, with 0.83+ → 3
```

| Score | Interpretation |
|---|---|
| 0 | Mostly wrong on the specifics that matter. |
| 1 | Mix of right and wrong; the resident can't trust unverified claims. |
| 2 | Right on most specifics but with at least one material error. |
| 3 | All material specifics check out under independent verification. |

**Note:** `admitted-gap` atoms (where the AI honestly said "I don't know") do not penalize accuracy. They penalize completeness instead.

---

## Dimension 2: Completeness (0–3)

**Question:** did this response cover the topics a resident actually needs to act on?

Each scenario in `data/scenarios.json` carries a `must_cover` array — the topics a complete answer must hit (e.g. for tiny-house: `["zoning", "size", "setbacks", "permits", "costs", "sequence"]`). Topics use the same vocabulary as atom `topic` fields.

Aggregation:

```
let covered = distinct topics across this variant's atoms ∩ must_cover
score = round(3 × |covered| / |must_cover|)
```

| Score | Interpretation |
|---|---|
| 0 | Missed almost everything material. |
| 1 | Hit a few topics, missed most. |
| 2 | Covered most topics; one or two material gaps. |
| 3 | Covered every topic on the must-cover list. |

**Address-specific cap:** if any atom for this variant has `correctness == admitted-gap` on a topic in `{address, zoning}`, completeness is capped at 2. Admitting the AI couldn't reach property data is honesty about *the data gap* — but it still means the resident didn't get parcel-specific guidance and the response is therefore not complete.

---

## Dimension 3: Authoritative Citations (0–3)

**Question:** are the cited sources actually authoritative for Portland code?

This is *not* the same as "is the citation specific?" A vague reference to "portland.gov" is more authoritative than a precise-looking citation to a Redfin listing or a third-party blog. The hackathon brief said *authoritative*, not *specific*; this dimension reflects that.

Each atom's `citation` is bucketed by source authority:

| Bucket | Examples | Credit |
|---|---|---|
| **authoritative** | `PCC 33.205.040`, `Title 11`, `portland.gov/...`, `PortlandMaps`, `BDS Code Guide`, `Oregon Revised Statutes ...` | 1.0 |
| **plausible-third-party** | `Redfin`, `Zillow`, `Wikipedia`, real-estate blog | 0.3 |
| **non-authoritative** | random forum, unattributed | 0.0 |
| **none** | `null` | 0.0 |

Aggregation:

```
let A = atoms attributed to this variant where atom carries any factual claim
let raw = sum(credit(atom.citation)) / |A|
score = floor(raw × 3 + 0.5)
```

| Score | Interpretation |
|---|---|
| 0 | No authoritative sources at all. |
| 1 | Mostly uncited or third-party-cited. |
| 2 | Mix — some Portland sources, some non-authoritative. |
| 3 | Cited claims overwhelmingly resolve to portland.gov / Portland Titles / authoritative state sources. |

---

## Dimension 4: Consumability (0–3)

**Question:** would an average Portland resident or business owner — someone who lives or works in the city, with no permitting expertise — understand this response and feel equipped to act on it?

This is the city's stated audience: *"People who live and work in the city of Portland have questions about what they can do on their property."* It is not a contractor, not a planner, not a code-fluent reader.

Aggregation:

```
let A = atoms attributed to this variant
let raw = mean(actionability(atom)) for atom ∈ A
let jargon_penalty = 0.10 × (count of unexplained jargon tokens / 100 words)   # cap at 0.30
score = floor((raw - jargon_penalty) × 3 + 0.5)
```

Unexplained-jargon detection lives in the aggregator and looks for un-glossed acronyms (ADU, FAR, SDC, DAR, BDS) and code-citation shorthand without a plain-language gloss. The penalty is bounded to keep the dimension stable.

| Score | Interpretation |
|---|---|
| 0 | Inaccessible. Jargon-dense, no scaffolding. |
| 1 | Partially accessible. Mostly readable but unexplained terms. |
| 2 | Accessible. Key terms defined, concrete next steps stated. |
| 3 | Resident-ready. Plainly written, anticipates resident-level confusion, scaffolds next steps. |

---

## Diagnostic outputs (not scored)

### Accuracy Flags

Specific factual claims a Portland city official should verify. Materialized as the per-atom `correctness` and `verified_truth` fields. Surfaced on the detail page beside each atom.

### Data Quality Notes

Signals about how well the city's data served the AI tool — diagnostic information for the city's data-improvement recommendations.

- Did the response appear to dig through a PDF rather than structured data?
- For address-specific queries: did the AI successfully retrieve property data, or did it admit the gap?
- Were cited section numbers plausible (real Portland code) or hallucinated?
- Did the response time out or hit a rate limit?

---

## Three-column interpretation guide

The dashboard renders three columns; the detail page renders only two (oob vs. enhanced) for cleaner side-by-side comparison.

| Column | What it represents | Expected profile |
|---|---|---|
| **Column 1 — out-of-box** | Frontier model, no MCP, bare prompt. The "where users actually are" baseline. | Accuracy 1–2, Completeness 1, Citations 0–1, Consumability 2 |
| **Column 2 — +MCP** | Frontier model + PortlandMaps MCP, bare prompt. Closes the data gap only. | Accuracy 2–3, Completeness 2–3, Citations 2–3, Consumability 1–2 |
| **Column 3 — +MCP +enrichment** | Frontier model + MCP + enriched prompt with audience locked. The "best-AI-can-do" reference. | Accuracy 3, Completeness 3, Citations 3, Consumability 3 |

The most important step functions for the presentation:
- **Col 1 → Col 2 on Citations** — closes the data-access gap.
- **Col 2 → Col 3 on Consumability** — closes the audience gap.

A fourth, currently-unmeasured column would be "what a Portland code expert would write." Whether Col 3 approaches that bar is the open question the hackathon team punts to the city to validate.

---

## What scores tell us about data gaps

| Pattern | Diagnosis |
|---|---|
| High accuracy, low citations | AI knows the rules but can't find or cite source docs. Data may be paywalled, in PDFs, or not indexed. |
| Low accuracy, high citations | AI found a source but mis-summarized it. Source structure or AI summarization is the problem. |
| Both low across all three columns | Source data itself is the problem — no AI can help if rules aren't machine-readable. |
| Both high on generic queries, both capped on address-specific | Public data doesn't expose property-specific lookups programmatically. PortlandMaps gap. |
| Accuracy high, completeness low across columns | AI is conservative — only says what it can ground. Could be retrieval breadth or context window. |

---

## Keeping rubric and code in sync

This document is the canonical scoring spec. The implementations live in:

- `skills/atomization/atomize.py` — extracts atoms via the configurable evaluator.
- `skills/atomization/aggregate.py` — derives the four scores from an atoms file (per-variant).
- `data/scenarios.json` — `must_cover` topic list per scenario (drives Completeness).
- `server.py` — `/api/evaluate` and `/api/three-column-state` use the aggregated scores.
- `site/comparison-mockup.html` (and the server-rendered `/comparison/<id>`) — display.

**If you change the rubric here, update the aggregator, the evaluator prompt, and the detail page in the same change.**
