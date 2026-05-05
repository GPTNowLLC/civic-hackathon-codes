# Civic Hackathon Codes — Portland Code & Regulation AI Benchmark

How well can today's general-purpose AI assistants answer real questions about Portland's city code? This repo is the benchmark — a scored corpus of 14 homeowner and small-business code questions, each tested against general-purpose AI assistants and against tool-augmented variants that can reach Portland's data.

Built for the City of Portland Bureau of Planning & Sustainability (Code Alignment program) challenge, presented at the [OSU AI Incubation Lab kickoff](https://events.oregonstate.edu/event/incubation-lab-kick-off).

## The challenge

> How might we help community members easily find and apply relevant rules and regulations to real-world situations, with clear references to authoritative sources?

People ask seemingly simple questions — *Can I build a tiny house? How tall can my fence be? Do I need a permit to replace my roof?* — and struggle to find authoritative answers. Working without knowing the rules leads to code violations at best and safety hazards at worst. The hackathon brief explicitly requires "clear attribution to official documents," so authoritative citations are a first-class scoring axis here, not an afterthought.

## The rubric — four dimensions

Every AI response is scored on four 0–3 dimensions. Scores are *derived from atomized claims*, not from a single end-of-response scoring pass — the verification work happens at the atom level and the four numbers are deterministic aggregations.

| # | Dimension | What it measures |
|---|---|---|
| 1 | **Accuracy** | Are the specific factual claims actually correct? |
| 2 | **Completeness** | Did the response cover the things a resident needs to act? |
| 3 | **Authoritative Citations** | Are sources from `portland.gov` / Portland Titles, or from blogs / nothing? |
| 4 | **Consumability** | Would an average Portland resident or business owner understand and act on this? |

The four are intentionally not collapsed into a composite — a response that is accurate but incomplete, or accurate but uncitable, is a real outcome the rubric should reflect honestly.

**Adversarial protocol:** the model that *generates* a response is never the model that *evaluates* it. The evaluator atomizes the response into individual claims, verifies each one, and the four scores are computed deterministically from the atoms. Full methodology and aggregation formulas: [`benchmarks/rubric.md`](benchmarks/rubric.md).

## The corpus — 14 scenarios

Single source of truth: [`data/scenarios.json`](data/scenarios.json). The original hackathon brief listed 7 sample questions; the corpus was expanded to 14 to cover more of Portland's code surface (sewer, signage, accessory structures, historic-district edge cases) and to spread across neighborhoods.

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

Scored evaluations live in [`examples/`](examples/), with one subdirectory per scenario.

## Running the dashboard

The repo ships with a small Python server that serves the static evaluation site and a few JSON APIs:

```bash
python3 server.py
# → http://localhost:8092/
```

The main page is the three-column comparison dashboard: out-of-the-box AI vs. AI + Portland data (MCP) vs. AI + Portland data + a better-formed question. The legacy full evaluation matrix is still available at [`/legacy-matrix.html`](site/legacy-matrix.html).

No dependencies beyond the Python 3 standard library for the static + state endpoints. Atomization and enrichment scripts under [`skills/`](skills/) call out to OpenAI and read `OPENAI_API_KEY` from the environment.

## Repo layout

| Path | Purpose |
|---|---|
| `benchmarks/rubric.md` | Four-dimension scoring rubric and methodology |
| `examples/` | Scored AI evaluations, one directory per scenario |
| `case-studies/hackathon-brief.md` | Full problem statement, sample questions, data sources |
| `site/index.html` | Three-column comparison dashboard (main page) |
| `site/legacy-matrix.html` | Original full evaluation matrix (archived) |
| `site/` (rest) | Mockup variants and dashboard JS/CSS |
| `data/scenarios.json` | Canonical 14-scenario list |
| `data/atoms/` | Atomized claims per scenario |
| `data/state.json`, `data/three-column-state.json` | Persisted dashboard state |
| `skills/atomization/` | Splits AI responses into verifiable atomic claims |
| `skills/enrichment/` | Adds context to atoms via second-pass LLM |
| `server.py` | Static + API server (port 8092) |
| `notes/` | Planning notes, requirements docs, patrol log |
| `STATUS.md` | Current ship state |

## Data sources

The hackathon provides access to Portland City Code: Titles 4, 10, 11, 17, 18, 24–29, 31–33 (zoning, building, plumbing, electrical, trees, signs, etc.), plus Transportation Administrative Rules, BES policies, Building Official Determinations, and Code Guides. The full list is in [`case-studies/hackathon-brief.md`](case-studies/hackathon-brief.md).

## Working hypothesis

Current AI tools can tell people *what rules exist* (modest Accuracy and Completeness) but cannot reliably cite *authoritative sources* at the section level (Authoritative Citations near zero), and they generally can't reach property-specific data at all. The data gap is a structured-access problem: Portland's code is publicly available but not in a form general-purpose AI can attribute precisely. The benchmark exists to measure that gap and inform what an authoritative civic code retrieval layer would need to provide.
