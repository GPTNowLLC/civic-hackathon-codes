#!/usr/bin/env python3
"""
Civic Hackathon Codes — static + API server.
Serves site/ as static files and handles POST /api/evaluate.
Binds 0.0.0.0:8092.
"""

import json
import logging
import os
import re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

SITE_DIR = os.path.join(os.path.dirname(__file__), 'site')
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
STATE_FILE = os.path.join(DATA_DIR, 'state.json')
THREECOL_STATE_FILE = os.path.join(DATA_DIR, 'three-column-state.json')
SCENARIOS_FILE = os.path.join(DATA_DIR, 'scenarios.json')
ATOMS_DIR = os.path.join(DATA_DIR, 'atoms')
PORT = 8092


def load_state():
    try:
        with open(STATE_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def load_threecol_state():
    try:
        with open(THREECOL_STATE_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_threecol_state(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = THREECOL_STATE_FILE + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, THREECOL_STATE_FILE)


def save_state(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = STATE_FILE + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, STATE_FILE)

EVAL_PROMPT_TEMPLATE = """\
You are an adversarial evaluator. Treat the AI response below with healthy skepticism — your job is not to summarize it, it is to verify it. Look up specific claims against authoritative Portland sources where possible (PCC, portland.gov, PortlandMaps, BDS guides). Flag anything you cannot verify.

QUERY:
{query}

AI RESPONSE:
{response}

{must_cover_block}
Score on the following four-dimension rubric. Each dimension is independent — a response can score high on one and low on another.

ACCURACY (0-3): Of the specific factual claims this response made, how many are actually correct?
- 0: Mostly wrong on the specifics that matter. Multiple material errors.
- 1: Mix of right and wrong. Some checkable claims fail verification.
- 2: Right on most specifics with at least one material error or unverifiable specific claim.
- 3: All material specific claims (code sections, numbers, thresholds, zone classifications) check out under independent verification.

Honest "I don't know" admissions about address-specific data do NOT penalize accuracy. They are diagnostic for completeness.

COMPLETENESS (0-3): Did the response cover the topics a resident actually needs to act on this scenario?
- 0: Missed almost everything material to the resident's decision.
- 1: Hit a few topics, missed most of what's needed to act.
- 2: Covered most topics; one or two material gaps remain.
- 3: Covered every must-cover topic for this scenario thoroughly.

Address-specific cap: if the response explicitly admits it could not retrieve property data (zoning, overlays, parcel info), completeness is capped at 2 regardless of general-guidance breadth. "I couldn't pull the exact zoning", "PortlandMaps blocks programmatic lookups", "almost certainly true given the address" are all admitted-gap signals.

AUTHORITATIVE CITATIONS (0-3): Are cited sources from authoritative Portland code sources, vs. third-party or none?
- 0: No authoritative sources. Either no citations, or only third-party (Redfin, Zillow, blogs, Wikipedia).
- 1: Mostly uncited or third-party-cited. One vague reference to "Portland's code" without a Title.
- 2: Mix — some Portland Title/section references, some non-authoritative or missing.
- 3: Cited claims overwhelmingly resolve to portland.gov, PCC sections, Portland Titles, BDS guides, ORS, or PortlandMaps. Specific section numbers preferred but a URL into portland.gov also counts as authoritative.

Note: PortlandMaps is authoritative for *property data*, not for code citations. Specifying both a Title and a section number scores 3 (e.g., "PCC 33.205.040", "Title 33.110.220"). A URL to a Redfin listing or third-party real-estate site does NOT count as authoritative.

CONSUMABILITY (0-3): Would an average Portland resident or business owner — someone who lives or works in the city, with no permitting or code expertise — understand and act on this response?
- 0: Inaccessible. Jargon-dense, assumes expertise, unexplained acronyms (ADU, FAR, SDC, BDS, PCC), no scaffolding.
- 1: Partially accessible. Mostly readable but unexplained terminology. Resident could follow with effort.
- 2: Accessible. Key terms defined or contextualized. Concrete next steps stated.
- 3: Resident-ready. Plainly written, anticipates resident-level confusion, scaffolds next steps explicitly. Treats the reader as intelligent but unfamiliar with code processes.

ACCURACY FLAGS:
List specific factual claims a Portland city official should verify. Only flag claims that are specific enough to be right or wrong (code section numbers, fee amounts, setback distances, height limits, permit thresholds, specific process steps, zoning classifications). Do not flag general statements. Additionally: any claim the AI labels as an inference (rather than drawn from actual city data) must be flagged.

DATA QUALITY NOTES:
Signals about how well the city's data served the AI: did it dig through PDFs? Were answers hedged due to missing data? For address-specific queries: did it retrieve property-specific data, or fall back to generic guidance? Were cited section numbers plausible (real Portland code) or hallucinated?

Return ONLY valid JSON. ALL FOUR score fields are required — do not omit any of accuracy, completeness, authoritative_citations, consumability. Each must be an integer in [0,3]:

{{"accuracy": 0-3, "completeness": 0-3, "authoritative_citations": 0-3, "consumability": 0-3, "rationale": "<1-2 sentences explaining the lowest score>", "accuracy_flags": ["<claim>", ...], "data_quality_notes": "<notes or empty string>"}}
"""

COMPARE_PROMPT_TEMPLATE = """\
You are comparing {n} AI tools' responses to the same Portland, Oregon city code and regulation question. This is a consulting analysis for the City of Portland hackathon.

QUERY:
{query}

TOOL EVALUATIONS:
{tool_summaries}

Write a structured comparison report with these sections:

## Score Summary
A table with columns: Tool | Usefulness (0-3) | Citation Quality (0-3) | Accuracy Flags | Key Strength

## Standout Responses
Which tool(s) performed best and specifically why — what they covered, cited, or got right that others missed.

## Unique Findings
For each specific fact, code requirement, section citation, or warning raised by only ONE tool and missed by the others: note which tool raised it, what it is, and why it matters to a Portland homeowner. If no unique findings, say so.

## Citation Quality Comparison
How the tools differed in citing authoritative sources. Which cited specific Title/section numbers? Which gave vague references or none? Did any cite the wrong Title or section?

## Qualitative Differences
How the tools differed in depth, confidence, specificity, and approach to this code question. What distinguishes the best from the weakest?

## Gaps
Important code requirements or citations relevant to this question that NO tool addressed, but should have been.

Be specific and grounded in the actual responses. Avoid generic praise. This analysis evaluates AI readiness for Portland city services, specifically the hackathon challenge: "Help community members easily find and apply relevant rules with clear references to authoritative sources."

Return the report as clean markdown only.
"""

VALID_SCENARIOS = {
    'tiny-house', 'fence-height', 'tree-removal',
    'adu-setbacks', 'roof-permit', 'lot-division', 'business-sign',
}
VALID_QUERY_TYPES = {'generic', 'address'}

ENRICHMENT_PROMPT_FILE = os.path.join(os.path.dirname(__file__), 'skills', 'enrichment', 'prompt.txt')


def run_enrich(question: str) -> str:
    """Call Claude CLI to enrich a bare user question into Column 3 input. Returns enriched question string."""
    try:
        with open(ENRICHMENT_PROMPT_FILE, 'r') as f:
            template = f.read()
    except FileNotFoundError:
        raise RuntimeError(f"Enrichment prompt file not found: {ENRICHMENT_PROMPT_FILE}")

    prompt = template.format(question=question)
    result = subprocess.run(
        ['claude', '-p', prompt, '--output-format', 'text'],
        capture_output=True,
        text=True,
        timeout=90,
    )
    if result.returncode != 0:
        err = result.stderr.strip() or result.stdout.strip() or '(no output)'
        raise RuntimeError(f"claude exited {result.returncode}: {err}")
    enriched = result.stdout.strip()
    if not enriched:
        raise RuntimeError("Enrichment returned empty output")
    return enriched

MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff2':'font/woff2',
    '.woff': 'font/woff',
    '.ttf':  'font/ttf',
}


def extract_json(text):
    """Find the first {...} block in text and parse it as JSON."""
    start = text.find('{')
    end = text.rfind('}')
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in output")
    return json.loads(text[start:end + 1])


def run_compare(query, tools):
    """Call Claude CLI to generate a cross-tool comparison report. Returns {"report": str}."""
    usefulness_labels = ['Unactionable', 'Vague', 'Actionable', 'Fully useful']
    citation_labels = ['No citations', 'Vague reference', 'Named Title', 'Specific section']
    summaries = []
    for t in tools:
        flags = t.get('accuracy_flags', [])
        flags_text = '\n'.join(f'  {i+1}. {f}' for i, f in enumerate(flags)) if flags else '  (none)'
        u = t.get('usefulness', 0)
        cq = t.get('citation_quality')
        cq_line = f"Citation Quality: {cq}/3 — {citation_labels[cq]}\n" if cq is not None else ''
        summary = (
            f"--- {t.get('label', t.get('id', '?'))} | {t.get('model', 'unknown')} ---\n"
            f"Usefulness: {u}/3 — {usefulness_labels[u]}\n"
            f"{cq_line}"
            f"Rationale: {t.get('rationale', '—')}\n"
            f"Accuracy Flags ({len(flags)}):\n{flags_text}\n"
            f"Data Quality: {t.get('data_quality_notes', '—')}\n\n"
            f"Response:\n{str(t.get('response', ''))[:2000]}"
        )
        summaries.append(summary)
    prompt = COMPARE_PROMPT_TEMPLATE.format(
        n=len(tools),
        query=query,
        tool_summaries='\n\n'.join(summaries),
    )
    result = subprocess.run(
        ['claude', '-p', prompt, '--output-format', 'text'],
        capture_output=True, text=True, timeout=120,
    )
    if result.returncode != 0:
        err = result.stderr.strip() or result.stdout.strip() or '(no output on stderr or stdout)'
        print(f"[compare] claude failed (rc={result.returncode}). prompt_len={len(prompt)}", flush=True)
        print(f"[compare] stdout: {result.stdout!r}", flush=True)
        print(f"[compare] stderr: {result.stderr!r}", flush=True)
        raise RuntimeError(f"claude exited {result.returncode}: {err}")
    return {'report': result.stdout.strip()}


def _must_cover_for(scenario_id: str) -> list[str]:
    """Look up must_cover for a scenario; empty list if unknown."""
    if not scenario_id:
        return []
    try:
        with open(SCENARIOS_FILE, 'r') as f:
            scenarios = json.load(f).get('scenarios', [])
    except (FileNotFoundError, json.JSONDecodeError):
        return []
    meta = next((s for s in scenarios if s.get('id') == scenario_id), None)
    return (meta or {}).get('must_cover', []) or []


def run_eval(query, response, scenario_id: str = ''):
    """Call Claude CLI to score a query/response pair on the four-dim rubric.

    If scenario_id is provided, the must_cover topic list for that scenario
    is injected into the prompt so the completeness dimension has a concrete
    reference. Returns dict.
    """
    must_cover = _must_cover_for(scenario_id)
    if must_cover:
        block = (
            "MUST-COVER TOPICS for this scenario (use as the completeness reference — "
            "score 3 if all are addressed, 2 if one or two are missing, 1 if most are "
            "missing, 0 if almost none are addressed):\n"
            f"  {', '.join(must_cover)}\n\n"
        )
    else:
        # No scenario_id supplied — instruct the model to infer the must-cover
        # set from the question itself rather than skip the completeness field.
        block = (
            "MUST-COVER TOPICS: no scenario id was provided. Infer the topics a "
            "complete answer would cover from the question itself (e.g. zoning, "
            "permits, setbacks, sequence, costs as applicable) and score "
            "completeness against that inferred set. You MUST still return a "
            "completeness score in [0,3] — do not omit the field.\n\n"
        )
    prompt = EVAL_PROMPT_TEMPLATE.format(
        query=query, response=response, must_cover_block=block,
    )
    try:
        result = subprocess.run(
            ['claude', '-p', prompt, '--output-format', 'text'],
            capture_output=True,
            text=True,
            timeout=300,
        )
    except subprocess.TimeoutExpired:
        print(f"[eval] timed out after 300s. prompt_len={len(prompt)}", flush=True)
        raise RuntimeError(
            f"Evaluator timed out after 5 minutes (response length {len(response)} chars). "
            "Try a shorter response or re-run."
        )
    if result.returncode != 0:
        err = result.stderr.strip() or result.stdout.strip() or '(no output on stderr or stdout)'
        print(f"[eval] claude failed (rc={result.returncode}). prompt_len={len(prompt)}", flush=True)
        print(f"[eval] stdout: {result.stdout!r}", flush=True)
        print(f"[eval] stderr: {result.stderr!r}", flush=True)
        raise RuntimeError(f"claude exited {result.returncode}: {err}")
    return extract_json(result.stdout)


# ── Comparison detail page (server-side render) ────────────────────────────
# Mirrors site/comparison-mockup.html visual style, but two columns (oob vs
# enhanced), four rubric bars, no composite total. Sourced from data files.

import html as _html

# Same authority buckets as skills/atomization/aggregate.py — keep in sync.
_AUTHORITATIVE_RE = re.compile(
    r'(^\s*PCC\b|^\s*Title\s+\d+|portland\.gov|^\s*PortlandMaps|\bBDS\b|'
    r'Oregon\s+Revised\s+Statutes|^\s*ORS\s+\d+|Portland\s+City\s+Code|'
    r'^\s*OSSC\b|^\s*ORSC\b|^\s*OPSC\b)',
    re.I,
)
_THIRD_PARTY_RE = re.compile(
    r'(redfin|zillow|wikipedia|nolo|biggerpockets|realtor\.com)',
    re.I,
)


def _citation_chip_class(citation: str | None) -> str:
    if not citation:
        return 'chip-none'
    if _AUTHORITATIVE_RE.search(citation):
        return 'chip-good'
    if _THIRD_PARTY_RE.search(citation):
        return 'chip-meh'
    return 'chip-bad'


def _bar_html(score: int) -> str:
    """Three cells filled to `score`, color-coded by score."""
    if score <= 1:    cls = 'f-1'
    elif score == 2:  cls = 'f-2'
    else:             cls = 'f-3'
    cells = []
    for i in range(3):
        cells.append(f'<span class="cell {cls if i < score else ""}"></span>')
    return ''.join(cells)


def _format_response_paragraphs(text: str) -> str:
    text = (text or '').strip()
    if not text:
        return '<p><em>No response captured for this variant.</em></p>'
    # Split on blank lines; tolerate single-line responses.
    parts = re.split(r'\n\s*\n', text)
    if len(parts) == 1:
        # Try sentence-grouping for readability.
        parts = [text]
    return '\n'.join(f'<p>{_html.escape(p).replace(chr(10), "<br>")}</p>' for p in parts)


# ── Atom → response-text span mapping ───────────────────────────────────────
# Drives the inline highlights on /comparison/<id>. Atoms in
# site/data/atoms/<scenario>.json carry a paraphrase of each claim plus a
# correctness label and citation, but no character offsets pointing into the
# response. We infer the span by extracting strong anchor tokens from the atom
# (PCC sections, numbers with units, zone codes, Portland-specific acronyms),
# locating their densest cluster in the response text, and snapping the window
# to a clause/sentence boundary.

_CORRECTNESS_TO_HL = {
    'correct':         'hl-good',
    'correct-action':  'hl-good',
    'correct-judg':    'hl-good',
    'correct-range':   'hl-good',
    'hedge-correct':   'hl-meh',
    'correct-vague':   'hl-meh',
    'vague-correct':   'hl-meh',
    'vague-action':    'hl-meh',
    'admitted-gap':    'hl-missing',
    'PARTIAL-WRONG':   'hl-bad',
    'WRONG':           'hl-bad',
}

_PCC_ANCHOR_RE = re.compile(
    r'\b(?:PCC\s*)?(?:\d{2}\.\d{3}(?:\.\d{2,3}[A-Z]?)?'
    r'|Title\s+\d+(?:\.\d+)*'
    r'|Chapter\s+33\.\d+'
    r'|ARA[- ]?\d[\d.]*)',
    re.I,
)
_NUMBER_UNIT_RE = re.compile(
    r'\b\d{1,4}(?:,\d{3})?(?:\.\d+)?\s*'
    r'(?:sq\s*ft|sqft|sq\.\s*ft|sf|ft|feet|acres?|%|years?|months?|weeks?|days?|hours?)\b',
    re.I,
)
_DOLLAR_RE = re.compile(r'\$\s?\d{1,3}(?:,\d{3})*(?:\s*[-–]\s*\$?\s?\d{1,3}(?:,\d{3})*)?(?:K|k|M)?\b')
_TOKEN_RE = re.compile(
    r'\b(?:'
    r'R\d{1,2}(?:\.\d)?'                # zone codes: R7, R2.5
    r'|RH|IH|CG|CM|CN|CO|CS|CX|EG|EX|IG|IR|OS'  # other zone abbreviations
    r'|PortlandMaps|portland\.gov\S*|PP&D|BES|BDS|PBOT|ORSC|OSSC|ARA'
    r'|SDC[s]?|THOW|ADU[s]?|RIP'
    r'|Title\s+\d+'
    r')\b',
    re.I,
)


def _atom_anchor_patterns(atom: dict) -> list[re.Pattern]:
    """Compile regex patterns identifying this atom's distinctive tokens."""
    patterns: list[re.Pattern] = []
    seen: set[str] = set()
    sources = [
        atom.get('citation') or '',
        atom.get('claim_full') or '',
        atom.get('claim_short') or '',
    ]
    blob = ' ​ '.join(sources)
    for regex in (_PCC_ANCHOR_RE, _NUMBER_UNIT_RE, _DOLLAR_RE, _TOKEN_RE):
        for m in regex.finditer(blob):
            tok = m.group(0).strip()
            key = tok.lower()
            if key in seen or len(tok) < 2:
                continue
            seen.add(key)
            # Match in the response text with whitespace tolerance for
            # multi-word tokens like "Title 33".
            esc = re.escape(tok)
            esc = re.sub(r'\\\s+', r'\\s+', esc)
            # PCC tokens often appear with or without a "PCC " prefix in prose.
            if regex is _PCC_ANCHOR_RE and not tok.upper().startswith('PCC'):
                esc = r'(?:PCC\s+)?' + esc
            patterns.append(re.compile(esc, re.I))
    return patterns


def _find_atom_span(text: str, atom: dict) -> tuple[int, int] | None:
    """Locate the densest cluster of the atom's anchors and snap to clause."""
    patterns = _atom_anchor_patterns(atom)
    if not patterns:
        return None
    hits: list[tuple[int, int]] = []
    for pat in patterns:
        for m in pat.finditer(text):
            hits.append((m.start(), m.end()))
    if not hits:
        return None
    hits.sort()

    WINDOW = 140
    best_count = 0
    best = (hits[0][0], hits[0][1])
    n = len(hits)
    for i in range(n):
        j = i
        while j < n and hits[j][1] - hits[i][0] <= WINDOW:
            j += 1
        count = j - i
        if count > best_count:
            best_count = count
            best = (hits[i][0], hits[j - 1][1])

    start, end = best
    # Snap left to a clause boundary (sentence, semicolon, or newline).
    left_floor = max(0, start - 80)
    snap_l = max(
        text.rfind('. ', left_floor, start),
        text.rfind('\n', left_floor, start),
        text.rfind('; ', left_floor, start),
    )
    if snap_l == -1:
        # Walk back to a word boundary.
        ws = text.rfind(' ', max(0, start - 24), start)
        snap_l = ws if ws != -1 else max(0, start - 24)
    else:
        # Step past the punctuation/whitespace.
        while snap_l < start and text[snap_l] in '.;\n ':
            snap_l += 1

    right_ceil = min(len(text), end + 100)
    snap_r = min(
        x for x in (
            text.find('. ', end, right_ceil),
            text.find('\n', end, right_ceil),
            text.find('; ', end, right_ceil),
        ) if x != -1
    ) if any(text.find(s, end, right_ceil) != -1 for s in ('. ', '\n', '; ')) else -1
    if snap_r == -1:
        ws = text.find(' ', end, min(len(text), end + 32))
        snap_r = ws if ws != -1 else min(len(text), end + 32)
    else:
        snap_r += 1  # include terminal punct

    # Cap runaway highlights (max ~260 chars).
    if snap_r - snap_l > 260:
        mid = (start + end) // 2
        snap_l = max(snap_l, mid - 130)
        snap_r = min(snap_r, mid + 130)

    return (snap_l, snap_r)


_OVERLAP_PRIORITY = {
    'WRONG': 4, 'PARTIAL-WRONG': 4,
    'admitted-gap': 3,
    'hedge-correct': 2, 'correct-vague': 2, 'vague-correct': 2, 'vague-action': 2,
    'correct': 1, 'correct-action': 1, 'correct-judg': 1, 'correct-range': 1,
}


def _build_atom_spans(text: str, atoms: list[dict], variant: str) -> list[dict]:
    """List of {start, end, atom} ranges; flags beat correct claims on overlap."""
    spans: list[dict] = []
    for a in atoms:
        if variant not in (a.get('variants') or []):
            continue
        loc = _find_atom_span(text, a)
        if loc is None:
            continue
        spans.append({'start': loc[0], 'end': loc[1], 'atom': a})

    spans.sort(key=lambda s: (s['start'], -s['end']))
    resolved: list[dict] = []
    for s in spans:
        if not resolved or s['start'] >= resolved[-1]['end']:
            resolved.append(s)
            continue
        last = resolved[-1]
        s_pri  = _OVERLAP_PRIORITY.get(s['atom'].get('correctness') or '', 0) * 10  + int(s['atom'].get('importance') or 1)
        l_pri  = _OVERLAP_PRIORITY.get(last['atom'].get('correctness') or '', 0) * 10 + int(last['atom'].get('importance') or 1)
        if s_pri > l_pri:
            resolved[-1] = s
    return resolved


def _render_highlighted_response(text: str, atoms: list[dict], variant: str) -> str:
    """Render response text as paragraphs with atom-driven inline <mark> spans."""
    text = (text or '').strip()
    if not text:
        return '<p><em>No response captured for this variant.</em></p>'
    spans = _build_atom_spans(text, atoms, variant) if atoms else []

    out: list[str] = []
    cursor = 0
    for s in spans:
        if s['start'] < cursor:
            continue
        out.append(_html.escape(text[cursor:s['start']]))
        a = s['atom']
        cls = _CORRECTNESS_TO_HL.get(a.get('correctness') or '', 'hl-meh')
        tip_parts = [a.get('claim_short') or '', a.get('correctness') or '']
        if a.get('citation'):
            tip_parts.append(a['citation'])
        tip = ' · '.join(p for p in tip_parts if p)
        out.append(f'<mark class="{cls}" title="{_html.escape(tip)}">')
        out.append(_html.escape(text[s['start']:s['end']]))
        out.append('</mark>')
        cursor = s['end']
    out.append(_html.escape(text[cursor:]))

    rendered = ''.join(out)
    paragraphs = re.split(r'\n\s*\n', rendered)
    return '\n'.join(
        f'<p>{p.replace(chr(10), "<br>")}</p>' for p in paragraphs if p.strip()
    )


def _missing_topics_for(atoms: list[dict], variant: str) -> list[str]:
    """Topics covered by some other variant but absent from this one."""
    universe: set[str] = set()
    own: set[str] = set()
    for a in atoms or []:
        t = a.get('topic')
        if not t:
            continue
        universe.add(t)
        if variant in (a.get('variants') or []):
            own.add(t)
    return sorted(universe - own)


def _load_atoms(scenario_id: str) -> tuple[list[dict], dict]:
    """Return (atoms, responses_by_variant) for a scenario, or ([], {}) if missing."""
    p = os.path.join(ATOMS_DIR, f'{scenario_id}.json')
    if not os.path.exists(p):
        return [], {}
    try:
        with open(p, 'r') as f:
            data = json.load(f) or {}
    except (json.JSONDecodeError, OSError):
        return [], {}
    return (data.get('atoms') or []), (data.get('responses') or {})


def _unique_citations_for(atoms: list[dict], variant: str) -> list[str]:
    seen = []
    for a in atoms:
        if variant not in (a.get('variants') or []):
            continue
        cbv = a.get('citation_by_variant')
        if isinstance(cbv, dict) and variant in cbv:
            c = cbv.get(variant)
        else:
            c = a.get('citation')
        if c and c not in seen:
            seen.append(c)
    return seen


_CORRECTNESS_VALUE = {
    'correct':         1.00,
    'correct-action':  1.00,
    'correct-judg':    1.00,
    'correct-range':   1.00,
    'hedge-correct':   0.85,
    'correct-vague':   0.70,
    'admitted-gap':    0.60,
    'vague-correct':   0.50,
    'vague-action':    0.50,
    'PARTIAL-WRONG':   0.30,
    'WRONG':           0.00,
}


def _is_authoritative_citation(c: str) -> bool:
    if not c:
        return False
    s = c.strip().lower()
    prefixes = ('pcc', 'title ', 'ara-', 'ara ', 'portland.gov', 'portlandoregon.gov', 'portlandmaps')
    return s.startswith(prefixes)


def _derive_scores_from_atoms(atoms: list[dict], variant: str) -> dict:
    """Compute the four rubric scores for one variant from atomic claims.
    Returns ints in [0,3] keyed by snake_case rubric names. Mirrors the legend
    at server.py ~line 584 — scores are weighted by atom importance.
    """
    own = [a for a in atoms if variant in (a.get('variants') or [])]
    if not own:
        return {'accuracy': 0, 'completeness': 0, 'authoritative_citations': 0, 'consumability': 0}

    def _imp(a): return max(1, int(a.get('importance') or 1))

    total_imp = sum(_imp(a) for a in own) or 1

    accuracy = sum(_imp(a) * _CORRECTNESS_VALUE.get(a.get('correctness') or '', 0.0) for a in own) / total_imp

    universe_topics = {a.get('topic') for a in atoms if a.get('topic')}
    own_topics = {a.get('topic') for a in own if a.get('topic')}
    completeness = (len(own_topics) / len(universe_topics)) if universe_topics else 0.0

    def _cite_for(a):
        cbv = a.get('citation_by_variant')
        if isinstance(cbv, dict) and variant in cbv:
            return cbv.get(variant)
        return a.get('citation')
    cited_imp = sum(_imp(a) for a in own if _cite_for(a))
    auth_imp  = sum(_imp(a) for a in own if _is_authoritative_citation(_cite_for(a) or ''))
    if cited_imp == 0:
        auth_share = 0.0
    else:
        coverage = cited_imp / total_imp
        auth_share = (auth_imp / cited_imp) * coverage

    consumability = sum(_imp(a) * float(a.get('actionability') or 0) for a in own) / total_imp

    def _bucket(x: float) -> int:
        return max(0, min(3, round(x * 3)))

    return {
        'accuracy':                _bucket(accuracy),
        'completeness':            _bucket(completeness),
        'authoritative_citations': _bucket(auth_share),
        'consumability':           _bucket(consumability),
    }


# ── Coverage matrix: topic × variant status grid ──────────────────────────
# Drives the at-a-glance "what each column missed" header on the comparison
# page. Status per (topic, variant) is derived from the atoms tagged with that
# variant, prioritising flaws (a single WRONG drags the cell red) so the row
# tells the reader where score deltas come from.

_TOPIC_LABELS = {
    'zoning':     'Zoning / overlays',
    'setbacks':   'Setbacks',
    'size':       'Size / height limits',
    'address':    'Address-specific facts',
    'sequence':   'Next steps / sequence',
    'process':    'Permit process',
    'fees':       'Permit fees',
    'costs':      'Construction cost',
    'sewer':      'Sewer / stormwater',
    'trees':      'Tree code',
    'safety':     'Safety / hazards',
}


def _topic_status_for_variant(atoms: list[dict], topic: str, variant: str) -> str:
    """Returns 'covered' | 'weak' | 'wrong' | 'missing' for one cell."""
    own = [
        a for a in atoms
        if a.get('topic') == topic and variant in (a.get('variants') or [])
    ]
    if not own:
        return 'missing'
    cs = [a.get('correctness') or '' for a in own]
    if any(c in ('WRONG', 'PARTIAL-WRONG') for c in cs):
        return 'wrong'
    if any(c in ('correct', 'correct-action', 'correct-judg', 'correct-range')
           for c in cs):
        return 'covered'
    return 'weak'


_STATUS_GLYPH = {
    'covered': '✓',
    'weak':    '~',
    'wrong':   '✗',
    'missing': '—',
}
_STATUS_LABEL = {
    'covered': 'covered',
    'weak':    'hedged',
    'wrong':   'wrong',
    'missing': 'not covered',
}


def _topic_universe_sorted(atoms: list[dict],
                           variants: list[str]) -> list[str]:
    """Topics ordered: most differentiating between variants first, then by
    total importance, then alphabetical. Differentiating means the variants
    disagree on coverage status — exactly the rows the audience cares about.
    """
    topics = sorted({a.get('topic') for a in atoms if a.get('topic')})
    importance = {t: 0 for t in topics}
    for a in atoms:
        t = a.get('topic')
        if not t:
            continue
        importance[t] += int(a.get('importance') or 1)

    def key(t):
        statuses = {_topic_status_for_variant(atoms, t, v) for v in variants}
        diff = len(statuses)
        return (-diff, -importance[t], t)

    return sorted(topics, key=key)


def _render_coverage_matrix(atoms: list[dict],
                            variant_columns: list[tuple[str, str, str]]) -> str:
    """Topic × column grid. variant_columns is [(variant_key, label, color_class), ...].
    Returns full <section> HTML or '' when there are no atoms.
    """
    if not atoms:
        return ''

    variant_keys = [v for v, _, _ in variant_columns]
    topics = _topic_universe_sorted(atoms, variant_keys)
    if not topics:
        return ''

    # Header row
    head_cells = ['<div class="cm-corner">Topic</div>']
    for _, label, color_class in variant_columns:
        head_cells.append(
            f'<div class="cm-head {color_class}">{_html.escape(label)}</div>'
        )

    # Body rows
    body_rows: list[str] = []
    for topic in topics:
        label = _TOPIC_LABELS.get(topic, topic.replace('_', ' ').title())
        cells = [f'<div class="cm-topic">{_html.escape(label)}</div>']
        for variant_key, _, _ in variant_columns:
            status = _topic_status_for_variant(atoms, topic, variant_key)
            glyph = _STATUS_GLYPH[status]
            tip   = f'{label}: {_STATUS_LABEL[status]}'
            cells.append(
                f'<div class="cm-cell cm-{status}" title="{_html.escape(tip)}">'
                f'<span class="cm-glyph">{glyph}</span></div>'
            )
        body_rows.append(''.join(cells))

    # Auto-takeaway: which topics each variant uniquely missed vs. enhanced.
    takeaway_html = _render_coverage_takeaway(atoms, variant_columns, topics)

    grid_cols_css = '220px ' + ' '.join('1fr' for _ in variant_columns)
    return f'''
<section class="coverage-matrix">
  <div class="cm-header">
    <span class="cm-eyebrow">At a glance</span>
    <h2>Why the scores differ</h2>
  </div>
  <div class="cm-legend">
    <span><span class="cm-chip cm-covered">✓</span>covered with a verifiable claim</span>
    <span><span class="cm-chip cm-weak">~</span>hedged or vague</span>
    <span><span class="cm-chip cm-wrong">✗</span>wrong claim</span>
    <span><span class="cm-chip cm-missing">—</span>topic not addressed</span>
  </div>
  {takeaway_html}
  <div class="cm-grid" style="grid-template-columns: {grid_cols_css};">
    {''.join(head_cells)}
    {''.join(body_rows)}
  </div>
</section>
'''


def _render_coverage_takeaway(atoms: list[dict],
                              variant_columns: list[tuple[str, str, str]],
                              topics: list[str]) -> str:
    """One sentence per column summarising what it missed vs. the union of
    topics covered by any column. Highlights the gap story."""
    items = []
    for variant_key, label, color_class in variant_columns:
        missed = []
        for topic in topics:
            status = _topic_status_for_variant(atoms, topic, variant_key)
            if status == 'missing':
                missed.append(_TOPIC_LABELS.get(topic, topic).lower())
            elif status == 'wrong':
                missed.append(_TOPIC_LABELS.get(topic, topic).lower() + ' (wrong)')
        if missed:
            gaps = ', '.join(missed)
            items.append(
                f'<li class="cm-takeaway-item {color_class}">'
                f'<span class="cm-takeaway-label">{_html.escape(label)}</span>'
                f'<span class="cm-takeaway-gaps">missed: {_html.escape(gaps)}</span>'
                f'</li>'
            )
        else:
            items.append(
                f'<li class="cm-takeaway-item {color_class}">'
                f'<span class="cm-takeaway-label">{_html.escape(label)}</span>'
                f'<span class="cm-takeaway-gaps cm-takeaway-clean">covered every topic above</span>'
                f'</li>'
            )
    return f'<ul class="cm-takeaway">{"".join(items)}</ul>'


_COL_TO_VARIANT = {'col1': 'oob', 'col2': 'mcp', 'col3': 'enhanced'}


def _overlay_atom_scores(state: dict) -> dict:
    """Backfill col1/col2/col3 rubric scores from site/data/atoms/<scenario>.json
    when (and only when) the cell has no manual scores yet. Manual /api/evaluate
    results are authoritative and must never be overwritten — atomization is a
    separate, slower workflow and its scores can lag behind the latest response.
    Empty cells (no response) are zeroed so the Clear buttons work.
    """
    if not isinstance(state, dict):
        return state
    atoms_cache: dict[str, list] = {}
    for addr, scenarios in state.items():
        if not isinstance(scenarios, dict):
            continue
        for sid, slot in scenarios.items():
            if not isinstance(slot, dict):
                continue
            if sid not in atoms_cache:
                p = os.path.join(ATOMS_DIR, f'{sid}.json')
                if os.path.exists(p):
                    try:
                        with open(p, 'r') as f:
                            atoms_cache[sid] = (json.load(f) or {}).get('atoms') or []
                    except (json.JSONDecodeError, OSError):
                        atoms_cache[sid] = []
                else:
                    atoms_cache[sid] = []
            atoms = atoms_cache[sid]
            if not atoms:
                continue
            for col_key, variant in _COL_TO_VARIANT.items():
                col = slot.get(col_key)
                if not isinstance(col, dict):
                    continue
                # Honor explicit clears: if the saved cell has no response,
                # actively null out any stored scores so prior contamination
                # (older builds wrote overlaid scores into the saved state)
                # doesn't keep resurrecting on refresh.
                if not (col.get('response') or '').strip():
                    col['accuracy']               = None
                    col['completeness']           = None
                    col['authoritativeCitations'] = None
                    col['consumability']          = None
                    continue
                # Backfill only — never overwrite a manual evaluation. If any
                # rubric score is already set, the user has evaluated this cell
                # and atoms (which are produced by a separate, slower workflow)
                # may be stale.
                already_scored = (
                    col.get('accuracy') is not None
                    or col.get('completeness') is not None
                    or col.get('authoritativeCitations') is not None
                    or col.get('consumability') is not None
                )
                if already_scored:
                    continue
                if not any(variant in (a.get('variants') or []) for a in atoms):
                    continue
                derived = _derive_scores_from_atoms(atoms, variant)
                col['accuracy']               = derived['accuracy']
                col['completeness']           = derived['completeness']
                col['authoritativeCitations'] = derived['authoritative_citations']
                col['consumability']          = derived['consumability']
    return state


def _render_column(*, num: int, label: str, tool: str, model: str,
                   response_text: str, citations: list[str],
                   scores: dict, color_class: str,
                   atoms: list[dict] | None = None,
                   variant: str | None = None) -> str:
    """Render one of the two detail columns. Atoms drive inline highlights."""
    chips = ''
    if citations:
        chips = ''.join(
            f'<span class="chip {_citation_chip_class(c)}">{_html.escape(c)}</span>'
            for c in citations
        )
    else:
        chips = '<span class="chip chip-none">no citations</span>'
    rubric_rows = []
    for label_text, key in [
        ('Accurate', 'accuracy'),
        ('Complete', 'completeness'),
        ('Cited',    'authoritative_citations'),
        ('Useful',   'consumability'),
    ]:
        s = int(scores.get(key, 0))
        rubric_rows.append(
            f'<div class="rubric-row">'
            f'<span class="rubric-label">{label_text}</span>'
            f'<div class="battery">{_bar_html(s)}</div>'
            f'<span class="rubric-score">{s}<span class="denom">/3</span></span>'
            f'</div>'
        )
    tool_line = _html.escape(tool or '')
    if model:
        tool_line += f' · <span style="opacity:0.7">{_html.escape(model)}</span>'

    if atoms and variant:
        body_html = _render_highlighted_response(response_text, atoms, variant)
        missing = _missing_topics_for(atoms, variant)
    else:
        body_html = _format_response_paragraphs(response_text)
        missing = []

    missing_html = ''
    if missing:
        tags = ''.join(
            f'<span class="ghost-topic">[no {_html.escape(t)} info]</span>'
            for t in missing
        )
        missing_html = (
            f'<div class="missing-topics">'
            f'<span class="label">Topics this answer didn’t cover</span>'
            f'{tags}</div>'
        )

    return f'''
    <article class="col {color_class}">
      <header class="col-header">
        <div class="col-title"><span class="num">{num}</span>{_html.escape(label)}</div>
        <div class="col-tool">{tool_line}</div>
      </header>
      <div class="rubric">
        {''.join(rubric_rows)}
      </div>
      <div class="response">
        {body_html}
        {missing_html}
      </div>
      <div class="citations">
        <span class="label">Sources cited</span>
        {chips}
      </div>
    </article>'''


_COMPARISON_PAGE = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title} — Three-column AI comparison</title>
<style>
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: #f5f4ef; color: #1f2933; line-height: 1.5;
    padding: 32px 40px 80px;
  }}
  .page-header {{ max-width: 1600px; margin: 0 auto 28px; }}
  .eyebrow {{
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em;
    color: #6b7280; font-weight: 600; margin-bottom: 6px;
  }}
  .page-header h1 {{
    font-size: 28px; font-weight: 700; color: #111827;
    letter-spacing: -0.01em; margin-bottom: 10px;
  }}
  .page-header .deck {{ font-size: 15px; color: #4b5563; max-width: 880px; }}
  .crumbs {{ font-size: 12px; color: #6b7280; margin-top: 10px; }}
  .crumbs a {{ color: #1d4ed8; text-decoration: none; }}
  .crumbs a:hover {{ text-decoration: underline; }}

  .scenario {{
    max-width: 1600px; margin: 0 auto 24px;
    background: #fff; border: 1px solid #d6d3c7; border-left: 4px solid #1d4ed8;
    padding: 18px 22px; border-radius: 4px;
    display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: center;
  }}
  .scenario-q {{ font-size: 16px; color: #111827; font-weight: 500; }}
  .scenario-q .label {{
    display: block; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.12em; color: #6b7280; font-weight: 600; margin-bottom: 4px;
  }}
  .scenario-meta {{
    font-size: 12px; color: #4b5563; text-align: right;
    border-left: 1px solid #e5e7eb; padding-left: 24px;
  }}
  .scenario-meta strong {{ color: #111827; }}

  .grid {{
    max-width: 1600px; margin: 0 auto;
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
  }}
  .col {{
    background: #fff; border: 1px solid #d6d3c7; border-radius: 4px;
    display: flex; flex-direction: column; overflow: hidden;
  }}
  .col-header {{
    padding: 14px 18px; border-bottom: 1px solid #e5e7eb;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
  }}
  .col-1 .col-header {{ background: #fef2f2; border-bottom-color: #fecaca; }}
  .col-2 .col-header {{ background: #fef3c7; border-bottom-color: #fcd34d; }}
  .col-3 .col-header {{ background: #f0fdf4; border-bottom-color: #bbf7d0; }}
  .col-title {{ font-size: 13px; font-weight: 700; color: #111827; letter-spacing: -0.01em; }}
  .col-title .num {{
    display: inline-block; width: 20px; height: 20px; border-radius: 50%;
    text-align: center; line-height: 20px; font-size: 11px; margin-right: 6px;
    color: #fff; font-weight: 700;
  }}
  .col-1 .num {{ background: #dc2626; }}
  .col-2 .num {{ background: #d97706; }}
  .col-3 .num {{ background: #16a34a; }}
  .col-tool {{
    font-size: 10px; color: #6b7280; text-transform: uppercase;
    letter-spacing: 0.08em; font-weight: 600;
  }}

  .response {{
    padding: 16px 18px; font-size: 13px; line-height: 1.6; color: #1f2933; flex: 1;
  }}
  .response p {{ margin-bottom: 10px; }}

  /* Atom-driven inline highlights — see _render_highlighted_response */
  .response mark {{
    background: transparent; color: inherit;
    padding: 0 2px; border-radius: 1px; cursor: help;
  }}
  .response mark.hl-good {{
    background: linear-gradient(180deg, transparent 60%, #bbf7d0 60%);
  }}
  .response mark.hl-meh {{
    background: linear-gradient(180deg, transparent 60%, #fde68a 60%);
  }}
  .response mark.hl-bad {{
    background: linear-gradient(180deg, transparent 60%, #fecaca 60%);
    text-decoration: line-through wavy #dc2626;
    text-decoration-thickness: 1px;
  }}
  .response mark.hl-missing {{
    color: #b91c1c; font-style: italic;
    background: #fef2f2; padding: 0 4px; border-radius: 2px;
  }}

  .missing-topics {{
    margin-top: 14px; padding: 10px 12px;
    background: #fafaf7; border: 1px dashed #d6d3c7; border-radius: 4px;
    display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  }}
  .missing-topics .label {{
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em;
    color: #6b7280; font-weight: 600; margin-right: 4px;
  }}
  .ghost-topic {{
    font-size: 11px; color: #b91c1c; font-style: italic;
    background: #fff; padding: 2px 8px; border-radius: 10px;
    border: 1px dashed #fca5a5;
  }}

  .citations {{
    padding: 10px 18px; border-top: 1px solid #e5e7eb; background: #fafaf7;
    display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  }}
  .citations .label {{
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em;
    color: #6b7280; font-weight: 600; margin-right: 4px;
  }}
  .chip {{
    font-size: 11px; padding: 3px 8px; border-radius: 10px;
    font-weight: 500; font-family: "SF Mono", Menlo, monospace;
  }}
  .chip-good {{ background: #dcfce7; color: #166534; border: 1px solid #86efac; }}
  .chip-meh  {{ background: #fef3c7; color: #854d0e; border: 1px solid #fcd34d; }}
  .chip-bad  {{ background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }}
  .chip-none {{ background: #f3f4f6; color: #6b7280; border: 1px dashed #d1d5db; font-style: italic; }}

  .rubric {{ padding: 14px 18px; border-bottom: 2px solid #e5e7eb; background: #fff; }}
  .rubric-row {{
    display: grid; grid-template-columns: 170px 1fr 40px;
    align-items: center; gap: 10px; margin-bottom: 8px; font-size: 11px;
  }}
  .rubric-row:last-child {{ margin-bottom: 0; }}
  .rubric-label {{
    color: #4b5563; text-transform: uppercase; letter-spacing: 0.06em;
    font-weight: 600; font-size: 10px;
  }}
  .battery {{
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; height: 14px;
  }}
  .cell {{ background: #e5e7eb; border-radius: 2px; }}
  .cell.f-1 {{ background: #dc2626; }}
  .cell.f-2 {{ background: #ca8a04; }}
  .cell.f-3 {{ background: #16a34a; }}
  .rubric-score {{
    font-size: 13px; font-weight: 700; color: #111827; text-align: right;
    font-variant-numeric: tabular-nums;
  }}
  .rubric-score .denom {{ color: #9ca3af; font-weight: 400; font-size: 11px; }}

  .verifier-badge {{
    max-width: 1600px; margin: 24px auto 0;
    padding: 12px 18px; background: #eef2ff; border: 1px solid #c7d2fe;
    border-radius: 4px; font-size: 12px; color: #3730a3;
  }}
  .verifier-badge strong {{ color: #1e1b4b; font-family: "SF Mono", Menlo, monospace; }}

  /* ── Coverage matrix ── */
  .coverage-matrix {{
    max-width: 1600px; margin: 0 auto 24px;
    background: #fff; border: 1px solid #d6d3c7; border-radius: 4px;
    padding: 20px 24px;
  }}
  .cm-header {{ margin-bottom: 16px; }}
  .cm-eyebrow {{
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em;
    color: #6b7280; font-weight: 700;
  }}
  .cm-header h2 {{
    font-size: 18px; font-weight: 700; color: #111827;
    margin: 4px 0 6px; letter-spacing: -0.01em;
  }}
  .cm-deck {{ font-size: 12px; color: #4b5563; max-width: 880px; }}

  .cm-grid {{
    display: grid;
    border: 1px solid #e5e7eb; border-radius: 4px; overflow: hidden;
    font-size: 12px;
  }}
  .cm-corner, .cm-head {{
    padding: 10px 14px; font-weight: 700; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.06em;
    background: #fafaf7; border-bottom: 1px solid #e5e7eb;
    color: #111827;
  }}
  .cm-head.col-1 {{ background: #fef2f2; color: #991b1b; }}
  .cm-head.col-2 {{ background: #fef3c7; color: #854d0e; }}
  .cm-head.col-3 {{ background: #f0fdf4; color: #166534; }}
  .cm-corner {{ color: #6b7280; }}

  .cm-topic {{
    padding: 10px 14px; font-weight: 600; color: #1f2933;
    background: #fafaf7; border-bottom: 1px solid #f1efe8;
    border-right: 1px solid #e5e7eb;
  }}
  .cm-cell {{
    padding: 10px 12px; text-align: center;
    border-bottom: 1px solid #f1efe8;
    border-right: 1px solid #f1efe8;
    display: flex; align-items: center; justify-content: center;
  }}
  .cm-cell:last-child {{ border-right: none; }}
  .cm-grid > .cm-topic:last-of-type,
  .cm-grid > .cm-topic:last-of-type ~ .cm-cell {{ border-bottom: none; }}

  .cm-glyph {{
    display: inline-flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 50%;
    font-size: 14px; font-weight: 700; line-height: 1;
  }}
  .cm-covered {{ background: #ecfdf5; }}
  .cm-covered .cm-glyph {{ background: #16a34a; color: #fff; }}
  .cm-weak    {{ background: #fffbeb; }}
  .cm-weak    .cm-glyph {{ background: #ca8a04; color: #fff; }}
  .cm-wrong   {{ background: #fef2f2; }}
  .cm-wrong   .cm-glyph {{ background: #dc2626; color: #fff; }}
  .cm-missing {{ background: #fafaf7; }}
  .cm-missing .cm-glyph {{ background: #d1d5db; color: #6b7280; }}

  .cm-legend {{
    margin-bottom: 14px; display: flex; flex-wrap: wrap; gap: 18px;
    font-size: 11px; color: #4b5563;
  }}
  .cm-legend > span {{ display: inline-flex; align-items: center; gap: 6px; }}
  .cm-chip {{
    display: inline-flex; align-items: center; justify-content: center;
    width: 18px; height: 18px; border-radius: 50%;
    font-size: 11px; font-weight: 700; color: #fff;
  }}
  .cm-chip.cm-covered {{ background: #16a34a; }}
  .cm-chip.cm-weak    {{ background: #ca8a04; }}
  .cm-chip.cm-wrong   {{ background: #dc2626; }}
  .cm-chip.cm-missing {{ background: #d1d5db; color: #6b7280; }}

  .cm-takeaway {{
    list-style: none; margin-bottom: 18px;
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
  }}
  .cm-takeaway-item {{
    padding: 10px 12px; border-radius: 4px;
    font-size: 12px; line-height: 1.45;
    border-left: 3px solid #d1d5db; background: #fafaf7;
  }}
  .cm-takeaway-item.col-1 {{ border-left-color: #dc2626; background: #fef2f2; }}
  .cm-takeaway-item.col-2 {{ border-left-color: #d97706; background: #fffbeb; }}
  .cm-takeaway-item.col-3 {{ border-left-color: #16a34a; background: #f0fdf4; }}
  .cm-takeaway-label {{
    display: block; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.08em; font-weight: 700; color: #111827; margin-bottom: 4px;
  }}
  .cm-takeaway-gaps {{ color: #4b5563; }}
  .cm-takeaway-clean {{ color: #166534; font-weight: 600; }}

  .legend {{
    max-width: 1600px; margin: 24px auto 0;
    padding: 18px 22px; background: #fff; border: 1px solid #d6d3c7; border-radius: 4px;
    font-size: 12px; color: #4b5563;
  }}
  .legend h3 {{
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em;
    color: #111827; margin-bottom: 10px;
  }}
  .legend ul {{ list-style: none; }}
  .legend li {{ margin-bottom: 6px; }}
</style>
</head>
<body>

<div class="page-header">
  <div class="eyebrow">City of Portland · AI Code Search Hackathon · Track 1 evaluation</div>
  <h1>{headline}</h1>
  <div class="crumbs"><a href="/">← back to dashboard</a></div>
</div>

<section class="scenario">
  <div class="scenario-q">
    <span class="label">The resident's question</span>
    {question}
  </div>
  <div class="scenario-meta">
    <strong>{address}</strong><br>
    {neighborhood}<br>
    <span style="color: #6b7280;">Scenario #{num}</span>
  </div>
</section>

{coverage_matrix}

<div class="grid">
{col_oob}
{col_mcp}
{col_enhanced}
</div>

<aside class="legend">
  <h3>How to read the highlights</h3>
  <ul style="display:grid; grid-template-columns:repeat(2,1fr); gap:6px 24px; margin-bottom:14px;">
    <li><mark class="hl-good">verifiable, correctly cited</mark></li>
    <li><mark class="hl-meh">vague or hedged — directionally right</mark></li>
    <li><mark class="hl-bad">wrong number or contradicted by code</mark></li>
    <li><mark class="hl-missing">AI admitted it can’t answer</mark></li>
  </ul>
  <p style="font-size:11px; color:#6b7280; margin-bottom:14px;">Hover any highlight to see the underlying claim, its correctness label, and citation.</p>

  <h3>How to read the rubric</h3>
  <ul>
    <li><strong>Accurate</strong> — does the response get the rules right?</li>
    <li><strong>Complete</strong> — did it cover the topics this scenario calls for?</li>
    <li><strong>Cited</strong> — does it point to portland.gov / Portland Titles rather than third-party sources?</li>
    <li><strong>Useful</strong> — would an average Portland resident understand and act on this?</li>
  </ul>
  <p style="opacity:0.7; margin-top:8px;">Scores are sourced from the dashboard evaluation; refresh after re-running on the dashboard.</p>
</aside>

</body>
</html>
'''


_CITATION_RE = re.compile(r'\b(?:PCC\s*\d[\d.]*|Title\s*\d+(?:\.\d+)*|ARA[- ]\d[\d.]*|portland\.gov/\S+|portlandoregon\.gov/\S+|PortlandMaps(?:\.com)?)', re.IGNORECASE)


def _extract_citations_from_text(text: str) -> list[str]:
    if not text:
        return []
    seen = []
    for m in _CITATION_RE.finditer(text):
        c = m.group(0).rstrip('.,;:)')
        if c not in seen:
            seen.append(c)
    return seen


def _scores_from_col(col: dict) -> dict:
    return {
        'accuracy':                int(col.get('accuracy') or 0),
        'completeness':            int(col.get('completeness') or 0),
        'authoritative_citations': int(col.get('authoritativeCitations') or 0),
        'consumability':           int(col.get('consumability') or 0),
    }


def render_comparison_html(scenario_id: str) -> tuple[str, int]:
    """Render the 2-column comparison detail page.

    Reads directly from three-column-state.json so the comparison page is a
    pure projection of the dashboard. col1 → out-of-the-box, col3 → enhanced.
    """
    try:
        with open(SCENARIOS_FILE, 'r') as f:
            scenarios = json.load(f)['scenarios']
    except (FileNotFoundError, json.JSONDecodeError) as e:
        return f'<h1>500</h1><p>scenarios.json missing or invalid: {_html.escape(str(e))}</p>', 500

    meta = next((s for s in scenarios if s['id'] == scenario_id), None)
    if not meta:
        return f'<h1>404</h1><p>Unknown scenario: {_html.escape(scenario_id)}</p>', 404

    state = load_threecol_state()
    slot = None
    direct = state.get(meta['address'])
    if direct and scenario_id in direct:
        slot = direct[scenario_id]
    else:
        for v in state.values():
            if isinstance(v, dict) and scenario_id in v:
                slot = v[scenario_id]; break
    slot = slot or {}
    col1 = slot.get('col1') or {}
    col2 = slot.get('col2') or {}
    col3 = slot.get('col3') or {}

    # Question text — replace (x) placeholder with address
    template = meta.get('template', '')
    question = template.replace('(x)', meta.get('address', '')) if '(x)' in template else template
    if meta.get('address') and '(x)' not in template:
        question = f'{template} (Address: {meta["address"]})'

    # Atoms are the source of truth for inline highlights AND for the response
    # text that was actually scored. Prefer atom-file text over state when both
    # exist, so highlights line up with the words the rubric was applied to.
    atoms, atom_responses = _load_atoms(scenario_id)

    oob_text = (atom_responses.get('oob') or {}).get('text') or col1.get('response') or ''
    mcp_text = (atom_responses.get('mcp') or {}).get('text') or col2.get('response') or ''
    enh_text = (atom_responses.get('enhanced') or {}).get('text') or col3.get('response') or ''

    col_oob = _render_column(
        num=1, label='Out-of-the-box AI',
        tool=col1.get('tool') or 'Out-of-the-box',
        model=col1.get('model', ''),
        response_text=oob_text,
        citations=_extract_citations_from_text(oob_text),
        scores=_scores_from_col(col1), color_class='col-1',
        atoms=atoms, variant='oob',
    )
    col_mcp = _render_column(
        num=2, label='AI + city data',
        tool=col2.get('tool') or 'MCP',
        model=col2.get('model', ''),
        response_text=mcp_text,
        citations=_extract_citations_from_text(mcp_text),
        scores=_scores_from_col(col2), color_class='col-2',
        atoms=atoms, variant='mcp',
    )
    col_enh = _render_column(
        num=3, label='AI + data + better question',
        tool=col3.get('tool') or 'MCP + enriched',
        model=col3.get('model', ''),
        response_text=enh_text,
        citations=_extract_citations_from_text(enh_text),
        scores=_scores_from_col(col3), color_class='col-3',
        atoms=atoms, variant='enhanced',
    )

    coverage_matrix = _render_coverage_matrix(
        atoms,
        variant_columns=[
            ('oob',      'Out-of-the-box AI',          'col-1'),
            ('mcp',      'AI + city data',             'col-2'),
            ('enhanced', 'AI + data + better question', 'col-3'),
        ],
    )

    body = _COMPARISON_PAGE.format(
        title=_html.escape(meta.get('label', scenario_id)),
        headline=_html.escape(meta.get('label') or scenario_id),
        question=_html.escape(question),
        address=_html.escape(meta.get('address', '')),
        neighborhood=_html.escape(meta.get('neighborhood', '')),
        num=meta.get('num', '?'),
        coverage_matrix=coverage_matrix,
        col_oob=col_oob,
        col_mcp=col_mcp,
        col_enhanced=col_enh,
    )
    return body, 200


class Handler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        # Suppress standard request logs; only print errors.
        pass

    def _send_json(self, data, status=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        # Normalise path
        path = self.path.split('?')[0].rstrip('/')

        if path == '/api/state':
            self._send_json(load_state())
            return

        if path == '/api/three-column-state':
            self._send_json(_overlay_atom_scores(load_threecol_state()))
            return

        if path == '/api/responses':
            state = load_state()
            self._send_json(state.get('responses', {}))
            return

        # Server-side rendered comparison detail page: /comparison/<scenario-id>
        if path.startswith('/comparison/'):
            scenario_id = path[len('/comparison/'):].strip('/')
            # tolerate trailing .html
            if scenario_id.endswith('.html'):
                scenario_id = scenario_id[:-5]
            if scenario_id:
                body, status = render_comparison_html(scenario_id)
                body_b = body.encode('utf-8')
                self.send_response(status)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(body_b)))
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(body_b)
                return

        if path == '' or path == '/' or path == '/three-column' or path == '/three-column.html':
            path = '/index.html'

        # Resolve file
        rel = path.lstrip('/')
        file_path = os.path.join(SITE_DIR, *rel.split('/'))
        file_path = os.path.normpath(file_path)

        # Security: must stay within SITE_DIR
        if not file_path.startswith(os.path.realpath(SITE_DIR)):
            self.send_response(403)
            self.end_headers()
            return

        if not os.path.isfile(file_path):
            self.send_response(404)
            self.end_headers()
            return

        ext = os.path.splitext(file_path)[1].lower()
        mime = MIME_TYPES.get(ext, 'application/octet-stream')

        try:
            with open(file_path, 'rb') as f:
                body = f.read()
            self.send_response(200)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(body)))
            # Avoid serving stale HTML/JS — the dashboard is mid-development
            # and field names have changed multiple times in a session.
            if ext in ('.html', '.js'):
                self.send_header('Cache-Control', 'no-cache, must-revalidate')
                self.send_header('Pragma', 'no-cache')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(body)
        except OSError as e:
            print(f"[server] read error: {e}", file=sys.stderr)
            self.send_response(500)
            self.end_headers()

    def do_POST(self):
        path = self.path.split('?')[0]
        if path not in ('/api/evaluate', '/api/compare', '/api/state', '/api/responses', '/api/enrich', '/api/three-column-state'):
            self.send_response(404)
            self._send_cors_headers()
            self.end_headers()
            return

        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            data = json.loads(body)
        except Exception as e:
            self._send_json({'error': f'bad request: {e}'}, 400)
            return

        if path == '/api/evaluate':
            try:
                query = str(data.get('query', '')).strip()
                response = str(data.get('response', '')).strip()
                scenario_id = str(data.get('scenario_id', '')).strip()
                if not query or not response:
                    self._send_json({'error': 'query and response are required'}, 400)
                    return
                result = run_eval(query, response, scenario_id=scenario_id)
                self._send_json(result)
            except Exception as e:
                print(f"[server] eval error: {e}", file=sys.stderr)
                self._send_json({'error': str(e)}, 500)

        elif path == '/api/compare':
            try:
                query = str(data.get('query', '')).strip()
                tools = data.get('tools', [])
                if not query or not tools:
                    self._send_json({'error': 'query and tools are required'}, 400)
                    return
                result = run_compare(query, tools)
                self._send_json(result)
            except Exception as e:
                print(f"[server] compare error: {e}", file=sys.stderr)
                self._send_json({'error': str(e)}, 500)

        elif path == '/api/state':
            try:
                save_state(data)
                self._send_json({'ok': True})
            except Exception as e:
                print(f"[server] state save error: {e}", file=sys.stderr)
                self._send_json({'error': str(e)}, 500)

        elif path == '/api/responses':
            try:
                scenario = str(data.get('scenario', '')).strip()
                query_type = str(data.get('query_type', '')).strip()
                tool = str(data.get('tool', '')).strip()
                response_text = str(data.get('response', '')).strip()
                model = str(data.get('model', '')).strip()

                if not scenario or not query_type or not tool or not response_text:
                    self._send_json({'error': 'scenario, query_type, tool, and response are required'}, 400)
                    return
                if scenario not in VALID_SCENARIOS:
                    self._send_json({'error': f'unknown scenario; valid: {sorted(VALID_SCENARIOS)}'}, 400)
                    return
                if query_type not in VALID_QUERY_TYPES:
                    self._send_json({'error': 'query_type must be "generic" or "address"'}, 400)
                    return

                state = load_state()
                state.setdefault('responses', {}).setdefault(scenario, {}).setdefault(query_type, {})[tool] = {
                    'model': model,
                    'response': response_text,
                }
                save_state(state)
                self._send_json({'ok': True, 'key': f'responses.{scenario}.{query_type}.{tool}'})
            except Exception as e:
                print(f"[server] responses error: {e}", file=sys.stderr)
                self._send_json({'error': str(e)}, 500)

        elif path == '/api/enrich':
            try:
                question = str(data.get('question', '')).strip()
                if not question:
                    self._send_json({'error': 'question is required'}, 400)
                    return
                enriched = run_enrich(question)
                self._send_json({'enriched_question': enriched})
            except Exception as e:
                print(f"[server] enrich error: {e}", file=sys.stderr)
                self._send_json({'error': str(e)}, 500)

        elif path == '/api/three-column-state':
            try:
                save_threecol_state(data)
                self._send_json({'ok': True})
            except Exception as e:
                print(f"[server] three-column-state save error: {e}", file=sys.stderr)
                self._send_json({'error': str(e)}, 500)


def main():
    server = HTTPServer(('0.0.0.0', PORT), Handler)
    print(f"[server] http://0.0.0.0:{PORT}/ (site: {SITE_DIR})", file=sys.stderr)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
