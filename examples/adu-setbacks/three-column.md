# Three-Column Evaluation — Scenario 4: ADU / Setbacks

**Address:** 6234 N Missouri Ave, Portland (Arbor Lodge)
**Governing titles:** Title 33 Zoning Code (primarily Title 33.205 Accessory Dwelling Units, Title 33.110 Single-Dwelling Zones)
**Date captured:** 2026-05-01

---

## Question

> Can I add an ADU to my property at 6234 N Missouri Ave, Portland (Arbor Lodge)? What are the setback requirements, size limits, and permit process for this specific address and zoning?

---

## Why this row is useful alongside the tiny-house row

Tiny-house (Scenario 1) focuses on the structure-type disambiguation (ADU vs. THOW). This row focuses on the setback mechanics and size limits that depend on the specific zoning classification and lot dimensions. Arbor Lodge is a residential neighborhood (likely R5 or R7) where the standard ADU rules apply without the Sunnyside Conservation District overlay — a cleaner test of zoning data access.

The column step-function test here: does MCP retrieve this property's actual lot dimensions and confirm whether a detached ADU fits within the required setbacks?

---

## Column 1 — Out-of-box (no MCP, no enrichment)

**Tool:** PENDING — requires real AI tool run (ChatGPT 5.5 or Claude Opus 4.7, no MCP context)
**Model:** PENDING

### Response
```
PENDING — no fabricated output. Chris to run this query in ChatGPT/Claude with no MCP and paste response here.
```

### Scores
| Dimension | Score | Label |
|---|---|---|
| Usefulness | PENDING | — |
| Citation quality | PENDING | — |
| Audience-appropriateness | PENDING | — |

### Expected profile (hypothesis)
- Usefulness: 1–2. Will give general ADU rules (800 sf max, setbacks from Title 33.205) but cannot confirm actual lot dimensions or zone for this address. Address-specific cap likely triggers.
- Citation quality: 0–1. May name "Title 33" generically; specific 33.205 section unlikely.
- Audience-appropriateness: 2. ADU is a common topic; AI prose tends to be accessible for this scenario.

---

## Column 2 — +MCP (MCP-enabled, same base question)

**Tool:** PENDING — requires real AI tool run with MCP integration
**Model:** PENDING

### Response
```
PENDING — no fabricated output. Chris to run this query in MCP-enabled tool and paste response here.
```

### Scores
| Dimension | Score | Label |
|---|---|---|
| Usefulness | PENDING | — |
| Citation quality | PENDING | — |
| Audience-appropriateness | PENDING | — |

### Expected profile (hypothesis)
- Usefulness: 2–3 (cap does not apply if MCP retrieves actual zone + lot data).
- Citation quality: 2–3. Should cite Title 33.205 specifically; ideally 33.205.040 (standards) or 33.205.060 (size limits).
- Audience-appropriateness: 1–2. Technical information may include unexplained terms.

---

## Column 3 — +MCP +Enrichment (enriched question → MCP-enabled tool)

**Tool:** PENDING — requires real AI tool run with enriched question + MCP
**Model:** PENDING

### Enriched question

To generate: `python3 skills/enrichment/enrich.py "Can I add an ADU to my property at 6234 N Missouri Ave, Portland (Arbor Lodge)? What are the setback requirements, size limits, and permit process for this specific address and zoning?"`

Run this and paste the output into the MCP-enabled tool. The enrichment will surface:
- ADU type distinction (detached vs. attached vs. garage conversion vs. basement)
- Lot coverage and FAR implications
- SDC charges specific to ADU (Portland has ADU SDC waiver program historically — confirm current status)
- Utility connection requirements
- Oregon House Bill 2001 (2019) and subsequent legislation expanding ADU rights statewide
- Historic or design overlay check (Arbor Lodge is not a historic district but worth confirming)

### Response
```
PENDING — no fabricated output. Chris to run the enriched question in MCP-enabled tool and paste response here.
```

### Scores
| Dimension | Score | Label |
|---|---|---|
| Usefulness | PENDING | — |
| Citation quality | PENDING | — |
| Audience-appropriateness | PENDING | — |

---

## Accuracy items to flag for city expert review (once cells are populated)

- ADU maximum size: 800 sf or 75% of main dwelling floor area, whichever is less — confirm current Title 33.205 language (may have been amended post-HB 2001)
- ADU SDC waiver program: was it extended beyond 2021? Current status?
- Detached ADU rear setback: 5 ft from side/rear per 33.205.040(D)? Confirm.
- Whether Arbor Lodge has any overlay zones (conservation district, design overlay) that modify standards
- Oregon HB 2001 impact: does it override Title 33.205 minimum lot size requirements for ADUs?
