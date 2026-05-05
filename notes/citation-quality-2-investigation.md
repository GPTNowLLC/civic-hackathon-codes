# Citation Quality 2 Investigation

**Date:** 2026-05-01
**Investigator:** Captain (WS-4)

## Symptom

MCP-enabled responses are scoring 2 on citation quality even when they appear to cite specific PCC sections.

## Reproduction

No live example cells are populated yet (examples stubs only as of this writing). The investigation is therefore based on rubric analysis and evaluator prompt inspection. This note will be updated once real MCP-enabled responses are scored.

## Hypotheses tested

### Hypothesis A: Evaluator prompt is too strict on the "specific section" bar

**Assessment: PARTIALLY CONFIRMED — prompt language is correct but ambiguous on URLs.**

The evaluator prompt (as of pre-WS-3) reads:
- Score 3: "Specific section citation ('Title 33.110.220', 'PCC 28.01.030') or direct URL to the authoritative document"

This is correct and matches the rubric. However, MCP-enabled tools often cite with a pattern like:
> "Under Title 33 Section 33.205 (Accessory Dwelling Units)..."

This should earn a 3. If it's scoring 2, one likely cause is the evaluator seeing "Title 33 Section 33.205" and treating it as Title-level (score 2) rather than section-level (score 3). The evaluator LLM may be uncertain whether "Section 33.205" is specific enough when it appears without "PCC" prefix or the "33." section dot-notation.

**Recommended fix:** Add a clarifying note to the evaluator prompt: "A citation like 'Title 33 Section 33.205' or 'Title 33.205.060' counts as a specific section (score 3). The 'PCC' prefix is not required."

### Hypothesis B: MCP responses are citing Title-level only

**Assessment: PLAUSIBLE but unconfirmed without live data.**

Some MCP integrations surface document titles ("PortlandMaps Zoning Code") but not section numbers because the underlying API returns document metadata, not parsed section references. This would correctly score 2.

**To confirm:** Run a real MCP-enabled response and check whether it contains any subsection numbers (e.g., "33.205.060") or only Title-level identifiers.

### Hypothesis C: Evaluator undercounts URL citations as "vague"

**Assessment: POSSIBLE for PortlandMaps direct links.**

A PortlandMaps URL like `https://www.portlandmaps.com/detail/index.cfm?action=Detail&PropertyID=12345` is property-data-lookup URL, not a code citation URL. It should not earn a 3 for citation quality. However, a URL like `https://library.municode.com/or/portland/codes/code_of_ordinances?nodeId=TIT33PLZO_CH33.205ACDWUN` does point to the specific section and should earn a 3.

The evaluator may be conflating these. The fix is to clarify: "A URL to the authoritative code document at the specific section level (e.g., municode.com, portland.gov/bps/zoning-code) counts as a 3. A property lookup URL (portlandmaps.com) does not count as a citation."

## Root cause (working theory)

The most likely root cause is **Hypothesis A**: the evaluator LLM is borderline-treating "Title 33 Section 33.205" as a Title-level citation rather than section-level, especially when the citation is embedded in running prose without the "PCC" shorthand prefix.

## Recommended fix

Apply a clarifying note to the `EVAL_PROMPT_TEMPLATE` in `server.py` under the CITATION QUALITY rubric:

```
NOTE on score 3: A citation like "Title 33 Section 33.205.060" or "Title 33.205.060(C)" 
counts as specific-section (score 3) — the PCC prefix is not required. A URL pointing 
directly to a specific code section on municode.com or portland.gov counts as score 3. 
A PortlandMaps property-lookup URL (portlandmaps.com) is a data source, not a code 
citation, and does not count toward citation quality.
```

## Status

- Fix drafted above.
- Applying to server.py as a prompt addendum.
- Will need validation once live MCP examples are populated (WS-5).

## Next step

Apply the prompt clarification now (low risk, improves precision). Flag to Chris that confirmation requires a real MCP-enabled example cell to be scored.
