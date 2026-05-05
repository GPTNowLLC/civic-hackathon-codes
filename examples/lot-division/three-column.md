# Three-Column Evaluation — Scenario 6: Lot Division / Condos

**Address:** 1923 NW Hoyt St, Portland (Pearl District)
**Governing titles:** Title 33 Zoning Code (primary: Title 33.510 Central City, Title 33.660–33.700 Land Divisions)
**Date captured:** 2026-05-01
**North-star row:** YES — chosen specifically to demonstrate the Col 1 → Col 2 step function. Pearl District zoning is deep in Title 33.510 plan district overlays and Central City design review, which are entirely inaccessible to out-of-box AI without MCP-level data access.

---

## Question

> Can the lot at 1923 NW Hoyt St, Portland (Pearl District) be divided and developed into condos? What does the current zoning allow, and what is the process for lot division or condo conversion under Title 33?

---

## Why this is the north-star row

The Pearl District triggers multiple Title 33 layers that generic AI cannot know without data access:
- Base zone: likely CX (Central Commercial) or EX (Central Employment) — fundamentally different from residential Title 33.110
- Plan district: Title 33.510 Central City Plan District — imposes design review, ground-floor active use, FAR bonuses, parking maximums, historic resource protections
- Pearl District sub-area: additional standards in Title 33.510.225 that modify the base zone
- Inclusionary Housing: at 20+ units, 20% of units must meet IH requirements (Title 33.245)
- Design Review: mandatory for most new development in the Central City
- Lot division vs. condo plat distinction: critical and almost certainly conflated by out-of-box AI

Out-of-box AI (Column 1) either (a) gives generic Title 33 residential guidance (wrong zone entirely), or (b) admits it cannot confirm the zone and gets usefulness-capped at 2. Column 2 (+MCP) should retrieve the actual zone, overlay layers, and plan district applicability from PortlandMaps. That is the step function.

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

### Expected profile (hypothesis — the step-function bottom)
- Usefulness: 1 (or capped 2). AI likely does not know Pearl District is CX/EX, not residential. Will give generic residential lot-division guidance or hedge with "depends on your zoning."
- Citation quality: 0–1. May name "Title 33" generically. Unlikely to cite Title 33.510, 33.660, 33.245, or the Pearl District sub-area section without data access.
- Audience-appropriateness: 1–2. Pearl District context requires explaining CX zoning, FAR, plan districts — very hard to do accessibly without knowing what actually applies.
- Address-specific cap: VERY LIKELY to trigger. AI cannot confirm Pearl District zone from training data alone.

### Data quality notes (hypothesis)
- This is the hardest test for out-of-box AI: the property is in a plan district overlay, not a residential zone. Generic zoning guidance would be actively misleading (wrong setbacks, wrong height limits, wrong process).
- Expected outcome: AI either guesses wrong zone or admits uncertainty → cap triggers.

---

## Column 2 — +MCP (MCP-enabled, same base question)

**Tool:** PENDING — requires real AI tool run with MCP integration (PortlandMaps, BDS, Title 33 access)
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

### Expected profile (hypothesis — the step function peak)
- Usefulness: 2–3. MCP retrieves actual zone (CX or EX), confirms Pearl plan district, surfaces design review requirement, identifies Inclusionary Housing threshold. This is fundamentally different guidance than Column 1.
- Citation quality: 2–3. Should name Title 33.510 (Central City Plan District) and Title 33.660 (land divisions). Ideally cites 33.510.225 (Pearl District sub-area), 33.245 (Inclusionary Housing).
- Audience-appropriateness: 1–2. Information-dense; lots of plan district terminology.
- Address-specific cap: should NOT trigger if MCP retrieves actual PortlandMaps data.

### Data quality notes (hypothesis)
- Key test: does the MCP tool retrieve the plan district overlay, not just the base zone? Plan district data is a second lookup in PortlandMaps beyond the basic zone.
- Known gap: condo plat process under ORS Chapter 100 is state law, not Portland code — MCP may not surface it.

---

## Column 3 — +MCP +Enrichment (enriched question → MCP-enabled tool)

**Tool:** PENDING — requires real AI tool run with enriched question + MCP
**Model:** PENDING

### Enriched question (generated by `skills/enrichment/enrich.py`)

```
I'm a homeowner in Portland with no land-use or code expertise. I own the property at 1923 NW Hoyt
St, Portland, OR (Pearl District) and I'm exploring whether I can divide the lot and develop it into
condominiums. I want plain-language guidance I can act on, with specific citations I can verify.

Please answer the following, in plain language, with specific Portland City Code section numbers
(e.g., Title 33.660, Title 33.110, etc.) for every rule you cite, and a brief plain-English
explanation of what each rule means in practice for my situation:

1. Current zoning and what it allows
   - Base zone for 1923 NW Hoyt St (likely CX or EX — confirm and cite).
   - Allowed uses, max height, FAR, density, setbacks, lot coverage.
   - Pearl District / Central City Plan District overlays (Title 33.510 and related): design review,
     historic resource review, required ground-floor active use, parking maximums.
   - Any historic district, conservation district, or design overlay zones.

2. Lot division vs. condominium conversion — these are two different things
   - Clearly distinguish: land division (Title 33.660–33.700) vs. condo plat (ORS Chapter 100).
   - Which is feasible here and what are the trade-offs?
   - Minimum lot size, frontage, dimensional standards for division in this zone — cite the section.

3. Process, sequence, and triggers
   - Step-by-step land division process (pre-app conference, Type II/III review, tentative plan, final plat).
   - Step-by-step condo plat process if going that route.
   - Permits triggered: building (Title 24), plumbing (Title 25), electrical (Title 26), mechanical
     (Title 27), site development, erosion control (Title 10), tree permits (Title 11), public works /
     frontage (Title 17), signs (Title 32).
   - Is Design Review required and at what threshold?

4. Trees, stormwater, and right-of-way
   - Title 11 tree preservation/removal rules for development sites.
   - Stormwater Management Manual obligations.
   - Frontage improvements likely required by PBOT (Title 17).

5. Who to contact, in what order (BDS, BPS, PBOT, BES, Land Use Services)

6. Cost and timeline expectations

7. Common mistakes / gotchas in the Pearl specifically
   - Historic resources, contributing structures, demolition delay rules.
   - Required ground-floor active use, window transparency, weather protection standards.
   - Parking maximums (not minimums) and TDM requirements.
   - Inclusionary Housing (IH) thresholds — at what unit count does IH kick in? (Title 33.245)
   - SDC implications.

8. Next steps — a numbered checklist

9. Accuracy caveats — flag anything requiring address-specific data verification

Please cite every rule with specific Title and section number so I can verify it on portland.gov.
Treat me as intelligent but entirely new to Portland land-use code.
```

### Response
```
PENDING — no fabricated output. Chris to run the enriched question above in MCP-enabled tool and paste response here.
```

### Scores
| Dimension | Score | Label |
|---|---|---|
| Usefulness | PENDING | — |
| Citation quality | PENDING | — |
| Audience-appropriateness | PENDING | — |

### Expected profile (hypothesis — target outcome)
- Usefulness: 3. Enriched question explicitly asks for land division vs. condo distinction, sequenced permit list, who to contact, IH threshold, common gotchas. These are all things Column 2 likely misses.
- Citation quality: 3. Enriched question demands specific section numbers for every rule.
- Audience-appropriateness: 3. Enriched question explicitly requests plain language, acronym definitions, and "treat me as new to Portland land-use code."

---

## Cross-column notes

**The north-star demonstration:** This row is the clearest proof of the data-access gap. If Column 1 gives residential setbacks for a CX-zoned lot (actively wrong) and Column 2 gives plan-district-aware guidance with Title 33.510 citations, the step function is visible and undeniable.

**Accuracy items to flag for city expert review:**
- Confirm actual base zone for 1923 NW Hoyt St (CX? EX? Mixed use?)
- Confirm Pearl District sub-area boundary — is this lot in the Pearl sub-area or the Alphabet District?
- Title 33.510.225 — Pearl District sub-area ground-floor active use requirement — does it apply here?
- Inclusionary Housing: 20-unit threshold and 20% set-aside — confirm current rules (amended by Portland City Council 2023–2024)
- Land division minimum lot size in CX zone — confirm the relevant section
- ORS Chapter 100 condo plat process — state law, not Portland code; AI may conflate the two

**Data gap to surface:**
- PortlandMaps plan district data (overlays beyond base zone) is a known gap for MCP integrations. If Column 2 also misses the Pearl plan district and only returns the base zone, this becomes a second-order finding: MCP access helped, but plan district overlay data is still incomplete.
