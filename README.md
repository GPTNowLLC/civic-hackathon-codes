# Civic Hackathon Codes — Portland Code & Regulation AI Benchmark

How well can today's general-purpose AI assistants answer real questions about Portland's city code? This repo is the benchmark — a scored corpus of homeowner and small-business code questions evaluated against ChatGPT, Claude, Grok, Gemini, and Perplexity.

Built for the City of Portland Bureau of Planning & Sustainability (Code Alignment program) challenge, presented at the [OSU AI Incubation Lab kickoff](https://events.oregonstate.edu/event/incubation-lab-kick-off).

## The challenge

> How might we help community members easily find and apply relevant rules and regulations to real-world situations, with clear references to authoritative sources?

People ask seemingly simple questions — *Can I build a tiny house? How tall can my fence be? Do I need a permit to replace my roof?* — and struggle to find authoritative answers. Working without knowing the rules leads to code violations at best and safety hazards at worst. The hackathon brief explicitly requires "clear attribution to official documents," so citation quality is a first-class scoring axis here, not an afterthought.

## The benchmark

Each AI response is scored on three dimensions:

1. **Usefulness (0–3)** — does it help the resident actually decide what to do?
2. **Citation quality (0–3)** — are the sources authoritative (`portland.gov`, named Title, specific section) or vague?
3. **Accuracy flags** — specific factual claims a Portland code official should verify.

**Address-specific cap:** if the AI admits it cannot retrieve property-specific data, max usefulness = 2.

Full rubric in [`benchmarks/rubric.md`](benchmarks/rubric.md).

## Query corpus

Seven scenarios drawn from the hackathon's sample questions, each tested twice (generic + address-specific) — 14 evaluation cells total:

| # | Scenario | Address |
|---|---|---|
| 1 | Tiny house on my lot | 4521 SE Belmont St (Sunnyside) |
| 2 | Fence height (front/back/side yard) | 2847 NE 33rd Ave (Alameda) |
| 3 | Tree removal (front yard) | 2108 SW Park Ave (Goose Hollow) |
| 4 | ADU / setback requirements | 6234 N Missouri Ave (Arbor Lodge) |
| 5 | Roof replacement permit | 3421 SE 52nd Ave (Foster-Powell) |
| 6 | Lot division / condos | 1923 NW Hoyt St (Pearl District) |
| 7 | Business A-board sign | 939 SW Morrison St (Downtown) |

Scored evaluations live in [`examples/`](examples/), one subdirectory per scenario.

## Running the dashboard

The repo ships with a small Python server that serves the static evaluation site and a few JSON APIs:

```bash
python3 server.py
# → http://localhost:8092/
```

No dependencies beyond the Python 3 standard library for the static + state endpoints. Atomization and enrichment scripts under [`skills/`](skills/) call out to OpenAI and read `OPENAI_API_KEY` from the environment.

## Repo layout

| Path | Purpose |
|---|---|
| `benchmarks/rubric.md` | Scoring rubric and methodology |
| `examples/` | 7 × 2 matrix of scored AI evaluations (one dir per scenario) |
| `case-studies/hackathon-brief.md` | Full problem statement, sample questions, data sources |
| `site/` | Evaluation dashboard (static HTML/JS/CSS, multiple mockup variants) |
| `data/` | Scenario definitions, atoms, dashboard state |
| `skills/atomization/` | Splits AI responses into verifiable atomic claims |
| `skills/enrichment/` | Adds context to atoms via second-pass LLM |
| `server.py` | Static + API server (port 8092) |
| `notes/` | Planning notes, requirements docs, patrol log |
| `STATUS.md` | Current ship state |

## Data sources

The hackathon provides access to Portland City Code: Titles 4, 10, 11, 17, 18, 24–29, 31–33 (zoning, building, plumbing, electrical, trees, signs, etc.), plus Transportation Administrative Rules, BES policies, Building Official Determinations, and Code Guides. The full list is in [`case-studies/hackathon-brief.md`](case-studies/hackathon-brief.md).

## Working hypothesis

Current AI tools can tell people *what rules exist* (usefulness 1–2) but cannot reliably cite *authoritative sources* at the section level (citation quality 0–1). The data gap is a structured-access problem: Portland's code is publicly available but not in a form general-purpose AI can attribute precisely. The benchmark exists to measure that gap and inform what an authoritative civic code retrieval layer would need to provide.
