# Hybrid Mockup Requirements — "The Scrubber + The Shape of Knowing"

**Status:** spec, ready to dispatch to subagents
**Author:** Commodore session, 2026-05-04
**Target file path (final artifact):** `site/mockup-hybrid.html` plus supporting JS/JSON files
**Live URL once built:** `http://localhost:8092/mockup-hybrid.html`
**Prior art:**
- `site/mockup-b-scrubber.html` — the scrubber concept (interaction)
- `site/mockup-e-overlap.html` — the lobe / Venn concept (geometry)
- `site/mockup-d-constellation.html`, `site/mockup-f-atlas.html`, `site/mockup-a-journey.html`, `site/mockup-c-cost.html` — sibling explorations, glance only
- `examples/tiny-house/three-column.md` — scenario source

---

## 1. Project context (read before doing anything else)

Audience: non-technical staff at the City of Portland, Bureau of Planning & Sustainability. They are evaluating whether AI tools are usable for residents asking property/code questions. They will see this in slides and possibly live demo at the hackathon final.

Mission of the visualization: make the *information difference* between three AI variants (Out-of-Box, +MCP data, +MCP +Enrichment) **immediately legible without narration**. The reader must be able to look at the page, manipulate one control, and walk away saying "the MCP+enrichment AI told the resident X specific actionable things the out-of-box AI couldn't."

The unique selling point of this hybrid: **temporal-axis storytelling (scrubber) PLUS set-relationship geometry (lobes)** in one view. The scrubber answers "what happens when we add tools?" The lobes answer "what does each variant uniquely contribute?" Neither single mockup answers both questions; this one does.

---

## 2. The concept in one paragraph

A page dominated by a single morphing Venn-style diagram of three soft, overlapping organic lobes (OOB / MCP / Enhanced). Every information atom from any AI variant is rendered as a labeled chip floating in the lobe region(s) it belongs to. Above the lobes sits a single big 3-position scrubber: OOB → +City Data → +Better Question. As the user drags the scrubber, the lobes inflate, deflate, and emphasize: at position 0 only the OOB lobe is "live" (others ghosted); at position 1 the MCP lobe inflates and most chips populate; at position 2 the Enhanced lobe completes the picture and the page reaches its full geometry. Supporting widgets — a confidence-to-act gauge, a citation provenance bar, and a side panel showing the literal AI response — animate in lockstep. The reader can drag, click any chip for the verified truth, or click any lobe to filter. URL `?pos=0|1|2` deep-links each state.

---

## 3. What this combines from B and E

**From B (Scrubber):**
- 3-position snap scrubber as the dominant interactive control (drag / click / keyboard / `?pos=` param)
- Real-time lockstep transformation across multiple panels
- Confidence-to-act gauge that sweeps red → amber → green
- Citation provenance bar that fills with chips as variants come online
- Literal AI response text that morphs/fades as you scrub
- Microinteractions: count-up, tween, snap

**From E (Shape of Knowing):**
- Three soft organic lobes (NOT crisp Venn circles), Venn-correct topology
- Every claim atom rendered as a labeled chip inside the appropriate region(s)
- Strikethrough/red overlay on wrong claims; dashed border on admitted gaps
- Tally panel (count per region)
- Bottom proportional summary tape (single bar split by region count)
- Region-highlight interaction (click a lobe to lift it, dim others)

**New (only in the hybrid):**
- Lobes MORPH with scrubber position — they don't just appear; they breathe. Position 0: OOB lobe at full size, MCP/Enhanced lobes are ghost outlines. Position 1: MCP lobe inflates, OOB ghosts. Position 2: Enhanced lobe completes, all three at proportional sizes.
- Chips animate from "off-canvas reservoir" into their lobe positions as their owning variant comes online during the scrub
- Drag the scrubber across position 1.5 → mid-animation state must be visually coherent (not jittery)

---

## 4. Hard design principles (do not compromise)

1. **The scrubber is the page's gravitational center.** Big, satisfying, snap animation, halo. Not a tab bar. Not radio buttons. A real handle.
2. **Lobes are organic, not crisp.** SVG paths with mild noise/curl, or `filter: blur` on circles. Editorial, not textbook.
3. **Every chip is the actual claim text** (abbreviated to ≤8 words for chip face; full text in tooltip). No placeholder text.
4. **The geometry must be readable without instruction.** A staffer who has never seen the page must understand within 10 seconds that there are three variants, that chips live in regions, and that dragging the scrubber changes what's shown.
5. **No ASCII-art Venn, no traffic lights, no dashboard cards, no three-column layouts.** That ground is salted.
6. **Reference aesthetic:** NYT graphics desk, the Pudding's set-theory pieces, Observable's editorial notebooks. Light or warm-paper background. Strong typographic hierarchy. Serif for prose, mono for citations.
7. **Local server URLs:** `http://localhost:8092/...` — http only, no https.
8. **Server is already running on port 8092.** Don't restart it; it serves `site/` and exposes `/api/evaluate`. Touching `server.py` is out of scope for this work.

---

## 5. File layout

```
site/
  mockup-hybrid.html             # main page shell
  hybrid/
    style.css                    # shared styles
    data.js                      # atom corpus loader (loads JSON, exposes API)
    scrubber.js                  # scrubber widget
    lobes.js                     # morphing Venn lobes (SVG)
    chips.js                     # chip placement + animation
    gauge.js                     # confidence gauge
    citations.js                 # citation provenance bar
    response.js                  # literal AI response text panel
    tally.js                     # region-count panel + summary tape
    orchestrator.js              # wires scrubber position → all subsystems
data/
  atoms/
    tiny-house.json              # canonical 25-atom corpus + variant responses
```

Each JS module is **self-contained**, exports a class with a documented constructor and `setPosition(pos)` method. The orchestrator owns position state and broadcasts to all modules. This lets subagents work in parallel without stepping on each other's files.

---

## 6. Canonical atom schema (LOCKED — do not modify)

All atom data, in any scenario, conforms to:

```jsonc
{
  "scenario": "tiny-house",
  "scenario_label": "Can I build a tiny house on my lot?",
  "address": "4521 SE Belmont St, Portland, OR 97215",
  "neighborhood": "Sunnyside",
  "responses": {
    // literal AI response text shown in the side panel for each variant
    "oob":      { "tool": "ChatGPT (no MCP)", "text": "..." },
    "mcp":      { "tool": "Claude (PortlandMaps MCP)", "text": "..." },
    "enhanced": { "tool": "Claude (MCP + enriched prompt)", "text": "..." }
  },
  "atoms": [
    {
      "id": "A1",
      "claim_short": "ADU rules generally apply",       // ≤8 words, chip face
      "claim_full": "ADU rules generally apply to this property under Title 33.",
      "topic": "definitions",                            // see topic enum
      "variants": ["oob", "mcp", "enhanced"],            // membership for Venn lobes
      "specificity": 0.15,                               // 0..1
      "actionability": 0.20,                             // 0..1
      "correctness": "vague-correct",                    // see correctness enum
      "importance": 2,                                   // 1..5
      "citation": null,                                  // null OR string e.g. "PCC 33.205.040"
      "verified_truth": "Title 33.205 governs ADUs; statement is directionally correct but not actionable."
    }
  ]
}
```

**Topic enum** (used for clustering/coloring): `zoning`, `definitions`, `size`, `setbacks`, `permits`, `costs`, `sequence`, `address`

**Correctness enum:** `correct` | `correct-action` | `correct-range` | `correct-judg` | `correct-vague` | `vague-correct` | `vague-action` | `hedge-correct` | `PARTIAL-WRONG` | `WRONG` | `admitted-gap`

Visual mapping:
- `correct*` → solid chip, no overlay
- `vague-*`, `hedge-*` → dotted-bottom chip border
- `PARTIAL-WRONG` → red diagonal stripe overlay
- `WRONG` → red strikethrough + red diagonal hatch overlay
- `admitted-gap` → dashed chip border, italic text

---

## 7. The initial atom corpus (tiny-house)

This is the data-of-record for the first scenario. All earlier mockups (B, D, E, F) used a hand-extracted version of this corpus; the JSON file in `data/atoms/tiny-house.json` is the canonical version. The data subagent (workstream W1) writes this file from the table below, including the literal `responses.oob.text`, `responses.mcp.text`, `responses.enhanced.text` that the response panel consumes.

```
A1  | ADU rules generally apply                              | O,M,E   | definitions | spec 0.15 | act 0.20 | vague-correct  | imp 2 | none
A2  | Most lots permit ~1,000 sf second dwelling             | O       | size        | spec 0.55 | act 0.30 | WRONG          | imp 5 | none
A3  | Setbacks ~5 ft from all property lines                 | O       | setbacks    | spec 0.50 | act 0.35 | PARTIAL-WRONG  | imp 4 | none
A4  | Will need a building permit                            | O,M,E   | permits     | spec 0.30 | act 0.40 | vague-correct  | imp 3 | none
A5  | Contact City permitting office                         | O       | sequence    | spec 0.20 | act 0.45 | vague-action   | imp 2 | none
A6  | Cannot retrieve address-specific zoning data           | O       | address     | spec 0.10 | act 0.05 | admitted-gap   | imp 5 | none
A7  | Base zone is R2.5 single-dwelling                      | M,E     | zoning      | spec 0.95 | act 0.50 | correct        | imp 5 | PortlandMaps
A8  | No overlay zones detected                              | M,E     | zoning      | spec 0.90 | act 0.55 | correct        | imp 4 | PortlandMaps
A9  | ADU permitted under Title 33.205                       | M,E     | definitions | spec 0.85 | act 0.55 | correct        | imp 5 | PCC 33.205
A10 | Max ADU 800 sf or 75% of main, whichever less          | M,E     | size        | spec 0.95 | act 0.60 | correct        | imp 5 | PCC 33.205.040
A11 | Front 10', side 5', rear 5' setbacks                   | M,E     | setbacks    | spec 0.95 | act 0.65 | correct        | imp 5 | PCC 33.110.220
A12 | Height limit 20'                                       | M,E     | size        | spec 0.95 | act 0.55 | correct        | imp 4 | PCC 33.205
A13 | Permits: building + plumbing + electrical + mechanical | M,E     | permits     | spec 0.80 | act 0.65 | correct        | imp 5 | none
A14 | SDCs apply (water, sewer, transportation, parks)       | M,E     | costs       | spec 0.65 | act 0.45 | correct-vague  | imp 4 | none
A15 | Stormwater management may be required                  | M,E     | permits     | spec 0.45 | act 0.30 | hedge-correct  | imp 3 | none
A16 | THOW not permitted as permanent residence              | E       | definitions | spec 0.85 | act 0.75 | correct        | imp 5 | PCC 33.910
A17 | Tiny house must be on foundation, treated as ADU       | E       | definitions | spec 0.85 | act 0.75 | correct        | imp 5 | PCC 33.205
A18 | Rear yard placement easiest                            | E       | setbacks    | spec 0.70 | act 0.85 | correct-judg   | imp 3 | none
A19 | SDCs typically $15,000-$25,000                         | E       | costs       | spec 0.90 | act 0.75 | correct-range  | imp 5 | BDS Code Guide
A20 | Building permit fees separate from SDCs                | E       | costs       | spec 0.75 | act 0.70 | correct        | imp 3 | none
A21 | Step 1: free zoning confirmation at BDS                | E       | sequence    | spec 0.85 | act 0.95 | correct-action | imp 5 | none
A22 | Step 2: site plan                                      | E       | sequence    | spec 0.80 | act 0.90 | correct-action | imp 4 | none
A23 | Step 3: building permit application                    | E       | sequence    | spec 0.85 | act 0.90 | correct-action | imp 4 | none
A24 | Step 4: plumbing/electrical/mechanical sub-permits     | E       | sequence    | spec 0.85 | act 0.85 | correct-action | imp 4 | none
A25 | Step 5: erosion control before excavation              | E       | sequence    | spec 0.85 | act 0.85 | correct-action | imp 4 | none
```

---

## 8. Subagent workstream split

Eight parallelizable workstreams. Dependencies marked. Each agent writes to its own file(s) only. Each agent reads this requirements doc, then ships a self-contained module.

### W1 — Data Foundation (BLOCKING, must finish before W2-W7 integrate)

**Files:** `data/atoms/tiny-house.json`, `site/hybrid/data.js`

**Tasks:**
- Author the canonical JSON for the tiny-house scenario from the corpus table in §7
- For `responses.oob.text`, write a plausible 80–120-word ChatGPT-style response that contains the OOB atoms verbatim (vague phrasing, "1,000 sf", "5 ft setbacks", admitted gap on address-specifics)
- For `responses.mcp.text`, write a plausible 100–140-word MCP-tool-augmented response (specific PCC sections, R2.5, correct numbers, but technical jargon, no plain-English sequencing)
- For `responses.enhanced.text`, write a plausible 180–220-word enriched response (plain-language, definitions disambiguated, dollar ranges, numbered sequence of next steps)
- All three response texts must be readable as natural English — they will be displayed in the side panel
- Build `data.js` that fetches `data/atoms/tiny-house.json` and exposes:
  - `await Data.load(scenario)` → returns full payload
  - `Data.atoms()` → array
  - `Data.atomsForVariant(variantId)` → filtered
  - `Data.regionCounts()` → `{ oob_only, mcp_only, enhanced_only, oob_mcp, mcp_enhanced, oob_enhanced, all_three }`
  - `Data.responseForVariant(variantId)` → `{ tool, text }`

**Acceptance:** JSON validates against the schema in §6, three response texts pass a "would a reasonable person believe a real AI wrote this" sniff test, regionCounts returns the correct partition counts (5 / 0 / 10 / 0 / 9 / 0 / 1 for the corpus above — verify by hand).

### W2 — Scrubber (parallel after W1 schema is known)

**Files:** `site/hybrid/scrubber.js`, `site/hybrid/scrubber.css`

**Tasks:**
- 3-position snap scrubber: 0 = OOB, 1 = +City Data, 2 = +Better Question
- Handle is a 56–64 px ringed disc with a halo. Track is gradient-filled red→amber→green proportional to position
- Stop labels in big serif (≥24 px Fraunces / Newsreader / similar)
- Interactions: drag, click on stop label, click on track position, arrow keys (←/→), URL param `?pos=0|1|2`
- Snap behavior: on release, animate to nearest stop with ease-out
- Continuous position during drag (clients may receive fractional position 0..2; intermediate states matter for animation interpolation)
- Public API: `new Scrubber(container, { onPositionChange: pos => ... })`, `scrubber.setPosition(pos, animate=true)`, `scrubber.getPosition()`
- Keyboard focus visible
- Mobile: works with touch

**Acceptance:** Drag from 0 to 2 produces smooth callbacks; arrow keys move by one stop; `?pos=2` deep-link initializes at position 2; visual is the page's hero element.

### W3 — Morphing Venn Lobes (parallel after W1)

**Files:** `site/hybrid/lobes.js`, `site/hybrid/lobes.css`

**Tasks:**
- Render three organic blob-shaped regions in SVG with Venn-correct topology (7 regions including the empty ones)
- Lobes use SVG `<path d="...">` with smooth bezier curves, NOT `<circle>`. Add subtle path warping for organic feel (small random control-point jitter, deterministic by seed so layout is stable across reloads)
- Each lobe has a `targetScale` (0..1) driven by scrubber position:
  - At pos 0: oob=1.0, mcp=0.15 (ghost), enhanced=0.15 (ghost)
  - At pos 1: oob=0.6, mcp=1.0, enhanced=0.2 (ghost)
  - At pos 2: oob=0.45, mcp=0.85, enhanced=1.0
  - Interpolate linearly for fractional positions
- Lobes also fade opacity with scale: ghost lobes are dashed-outline only, no fill
- Tints: OOB (warm red, e.g. `#c5524a`), MCP (amber, e.g. `#c89a3a`), Enhanced (moss green, e.g. `#5a8a4f`). Fill is the tint at low alpha (~0.18); stroke is the tint at full alpha
- Lobe centers are stable (do NOT reposition with scale changes; chips depend on stable region geometry)
- Public API: `new Lobes(svgContainer, layout)`, `lobes.setPosition(pos)`, `lobes.regionCenter(regionKey)` → returns `{x, y}` for chip placement, `lobes.highlight(regionKey | null)`, `lobes.lobePath(variantId, scale)` for testing
- Region keys: `'oob_only' | 'mcp_only' | 'enhanced_only' | 'oob_mcp' | 'mcp_enhanced' | 'oob_enhanced' | 'all_three'`

**Acceptance:** Drag scrubber from 0→2 and the lobes visibly inflate/deflate continuously; geometry is Venn-correct (3 sets, 7 regions); ghost lobes read as ghosts (dashed, no fill); regionCenter returns positions inside the visible region for all 7 regions.

### W4 — Chip Placement & Animation (depends on W1 + W3)

**Files:** `site/hybrid/chips.js`, `site/hybrid/chips.css`

**Tasks:**
- For each atom, render a chip: rounded rect with `claim_short` text + tiny citation badge (if any)
- Chip placement: use `lobes.regionCenter(region)` as anchor, then run a simple force-directed pass (mutual repulsion + region-centroid attraction) so chips inside the same region don't overlap
- Chips must stay INSIDE their region polygon — clamp positions if force pass pushes them outside (use point-in-polygon test against `lobes.lobePath`)
- Chips owned by ghost lobes (lobes at scale < 0.5) are themselves ghosted: lower opacity, smaller scale
- Wrong claims: red diagonal hatch overlay + strikethrough on text
- Admitted gaps: dashed border, italic text
- Hover: chip lifts (transform), shows tooltip with `claim_full`, citation, correctness verdict, verified_truth
- Click: pin a side panel detail card (handled by W6)
- Public API: `new Chips(svgContainer, atoms, lobes)`, `chips.setPosition(pos)` (which re-runs ghosting), `chips.highlight(regionKey | null)`, `chips.onClick(callback)`

**Acceptance:** All 25 chips are rendered, none overlap with each other, none escape their region polygon, tooltip works, ghosting visibly tracks scrubber position.

### W5 — Supporting Widgets: Gauge, Citations, Tally (parallel after W1)

**Files:** `site/hybrid/gauge.js`, `site/hybrid/citations.js`, `site/hybrid/tally.js` and matching `.css`

**Tasks:**

*Gauge:*
- Semicircular confidence gauge, needle sweeps from "Speculative" (red) at left through "Informed but stuck" (amber) to "Ready Monday AM" (green) at right
- Position 0 → needle at ~15%; position 1 → ~55%; position 2 → ~92%
- Smooth tween on position change
- API: `new Gauge(container)`, `gauge.setPosition(pos)`

*Citations:*
- Horizontal bar that fills with citation chips as the scrubber moves
- Chip styles: vague-quoted (italic, gray border) for OOB; mono PCC sections (e.g. "PCC 33.205.040") for MCP; mono + authoritative-source chips ("BDS Code Guide", "PortlandMaps") for Enhanced
- Chips fade/slide in as their owning variant's atoms come online
- API: `new Citations(container, atoms)`, `citations.setPosition(pos)`

*Tally:*
- Compact panel listing the 7 region tallies (5 / 0 / 10 / 0 / 9 / 0 / 1)
- Plus a horizontal proportional summary tape at the bottom of the page (single bar split into 7 segments, widths proportional to counts, colored by region)
- Both update only labels, not counts (counts are static for a given scenario) — but row highlighting can respond to scrubber position (the row whose lobe is currently emphasized lights up)
- API: `new Tally(panelContainer, tapeContainer, atoms)`, `tally.setPosition(pos)`, `tally.highlight(regionKey | null)`

**Acceptance:** Gauge needle smoothly tracks scrubber; citation bar visibly densifies left-to-right with scrub; tally panel is legible and the proportional tape reads as a small infographic in its own right.

### W6 — Side Panel: Response Text + Drilldown (depends on W1, W4)

**Files:** `site/hybrid/response.js`, `site/hybrid/sidepanel.css`

**Tasks:**
- Right-side (or bottom on narrow viewports) panel with two stacked sections:

  *Top: Literal AI Response*
  - Heading: tool name + variant label (e.g. "Claude · MCP + enriched prompt")
  - Body: the literal `responses.<variant>.text` from the JSON
  - As scrubber moves between positions, cross-fade the text (200ms fade-out, swap, 200ms fade-in)
  - At fractional positions, show the dominant variant (round nearest)
  - Words/phrases that match an atom in the current variant are subtly underlined; hovering one scrolls/highlights the corresponding chip in the diagram

  *Bottom: Pinned Atom Detail*
  - Empty state: "Click any chip to see the verified truth"
  - Pinned state: chip's `claim_full`, citation (mono), correctness pill, verified_truth (in a quote-block)
  - Pinning persists across scrubber moves

- API: `new ResponsePanel(container, data)`, `response.setPosition(pos)`, `response.pinAtom(atomId | null)`

**Acceptance:** Response text cross-fades cleanly when scrubber crosses 0.5 or 1.5; pinned atom card is readable; click-on-chip in W4 successfully pins here.

### W7 — Page Shell, Layout, Typography (parallel after others are stubbed)

**Files:** `site/mockup-hybrid.html`, `site/hybrid/style.css`

**Tasks:**
- HTML page structure: `<header>` (title, scenario label, address pill), `<main>` containing the scrubber, the SVG diagram region, the supporting widgets panel, and the side panel; `<footer>` with the proportional summary tape and a small legend
- Load Google Fonts (Fraunces or Newsreader serif, JetBrains Mono mono, Inter or default sans for body)
- Warm-paper background (`#f6f1e7` or similar), strong typographic hierarchy
- Responsive: looks great at 1440 wide; degrades acceptably at 1024 wide; doesn't have to work on mobile (city presentation is desktop-projector)
- Imports the eight JS modules and instantiates them via `orchestrator.js`
- Provides DOM containers with stable IDs that the modules consume

**Acceptance:** Page loads with no console errors, all module containers exist, layout is sturdy at 1440 and 1024, fonts load.

### W8 — Orchestrator (depends on W1-W7 stubs)

**Files:** `site/hybrid/orchestrator.js`

**Tasks:**
- Single source of truth: `state.position` (number 0..2)
- On page load: read `?pos=` query param if present, else default to 0; instantiate Data, await load
- Instantiate all modules, wire scrubber's `onPositionChange` to broadcast to lobes, chips, gauge, citations, tally, response
- Wire chip clicks (from W4) to `response.pinAtom`
- Wire lobe/tally region highlights bidirectionally: hover/click a tally row highlights the corresponding lobe AND chips; hover/click a lobe highlights the tally row
- Throttle position updates to 60fps using `requestAnimationFrame`
- On scrubber release, push `?pos=N` to URL (history.replaceState, no reload)

**Acceptance:** Drag the scrubber and ALL widgets update in lockstep with no jitter; URL updates on release; click-on-chip pins detail panel; hover synchronization between lobes and tally works both ways.

---

## 9. Build sequence (recommended dispatch order)

Phase 1 (sequential): **W1** writes data + JSON. This unblocks everyone.

Phase 2 (parallel, dispatch as 5 subagents simultaneously): **W2, W3, W5, W7** can all start once schema is locked. **W4** waits briefly for W3's `regionCenter` API to be stubbed (~5 min lead time).

Phase 3 (sequential): **W6** depends on W4 for chip-click events. Start when W4 is ~70% done.

Phase 4 (sequential): **W8** orchestrator wires everything. Last to run.

Phase 5 (sequential): **integration QA** — single agent loads the page, walks through three scrubber positions, captures screenshots at `?pos=0|1|2`, exercises every interaction, and reports defects.

Total: **8 subagents + 1 QA pass.** Phase 1 + Phase 2 + Phase 3 + Phase 4 + QA could run in roughly 3 sequential time-slices if the parallel work is dispatched together.

---

## 10. Cross-cutting acceptance criteria (must pass before declaring done)

1. **Local URL works:** `http://localhost:8092/mockup-hybrid.html` loads without console errors
2. **Deep links work:** `?pos=0`, `?pos=1`, `?pos=2` each initialize the page in the correct state
3. **Scrubber drag is smooth:** dragging the handle from 0 to 2 produces visible morphing of lobes, chip ghosting, gauge needle, citation chips, and response text — no judder, no flashing
4. **Geometry tells the story:** at position 0 the page reads as "this AI gave the resident very little"; at position 2 the page is dense with green chips and the OOB lobe is visibly dwarfed
5. **Wrong claims are visible:** A2 (~1,000 sf) and A3 (5 ft setbacks) have red overlays and read as "wrong" without the user clicking anything
6. **Click any chip → side panel populates** with verified truth
7. **Hover any tally row → corresponding lobe lights up** (and vice versa)
8. **No three-column layouts anywhere on the page**
9. **No external runtime dependencies beyond Google Fonts + (optional) D3**
10. **Server is untouched:** no changes to `server.py`

---

## 11. Out of scope (do not do these in this round)

- Live AI calls (no API integrations to OpenAI/Anthropic/etc. — responses are static text in JSON)
- Live PortlandMaps MCP calls (the `mcp__claude_ai_Portland_Maps_MCP__*` tools just appeared in the session but wiring real data is a separate ship)
- Other scenarios beyond tiny-house (the architecture must SUPPORT 7 scenarios via JSON files, but only tiny-house gets populated this round)
- Mobile responsive (desktop only)
- Server changes
- Pushing to remotes, posting to issues, sending anything outside this repo

---

## 12. Stretch goals (do only if time remains after acceptance)

- Address-input field that calls `mcp__claude_ai_Portland_Maps_MCP__suggest_portlandmaps_address` and pre-flights real zoning lookups for any Portland address (puts the "live demo" wow factor on top of the static visualization)
- Scenario picker dropdown that swaps the JSON file (no code changes — just a different `data/atoms/<scenario>.json`)
- Animated "ghost trail" behind the scrubber handle as it moves (handle leaves a fading wake)
- Print-mode CSS that flattens the page to a single static slide-friendly image
- Click-and-hold scrub on touch screens

---

## 13. References for the Phase 5 QA agent

When QA runs, screenshot every state and read each back:

```
agent-browser open http://localhost:8092/mockup-hybrid.html?pos=0
agent-browser screenshot /tmp/hybrid-pos0.png --full
agent-browser open http://localhost:8092/mockup-hybrid.html?pos=1
agent-browser screenshot /tmp/hybrid-pos1.png --full
agent-browser open http://localhost:8092/mockup-hybrid.html?pos=2
agent-browser screenshot /tmp/hybrid-pos2.png --full
```

Then exercise: drag, keyboard, click chip, click lobe, click tally row. Capture defects and fix or escalate.

---

## 14. New-session boot prompt (paste this in)

> Read `notes/hybrid-mockup-requirements.md` (relative to the repo root) and execute it. Dispatch subagents per §8-9. Auto mode is active; minimize interruptions. The deliverable is a working `site/mockup-hybrid.html` that satisfies all of §10. Begin with W1 (data foundation) as a single subagent; once it reports completion, dispatch W2/W3/W5/W7 in parallel as four subagents in one message; then W4; then W6; then W8; then a single QA agent for Phase 5. Report final local URL and three screenshot paths.

---

End of spec.
