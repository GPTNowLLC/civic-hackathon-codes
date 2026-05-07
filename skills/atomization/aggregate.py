#!/usr/bin/env python3
"""
Aggregate atomized claims into the four rubric dimensions per variant.

For each scenario's atoms file (data/atoms/<scenario>.json), compute four 0–3
scores per variant (oob / mcp / enhanced):

  - accuracy
  - completeness
  - authoritative_citations
  - consumability

Persist the result under data/three-column-state.json at the matching slot, in
a `derivedScores` object alongside col1/col2/col3. Also includes the
evaluator_model used during atomization so the detail page can display it.

Usage:
    python3 aggregate.py <scenario-id>          # one scenario
    python3 aggregate.py --all                  # every atoms file present
    python3 aggregate.py <id> --dry-run         # print, don't persist

The scoring formulas mirror benchmarks/rubric.md. Keep them in sync.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import sys
from typing import Any, Iterable

REPO_ROOT     = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA_DIR      = os.path.join(REPO_ROOT, 'data')
ATOMS_DIR     = os.path.join(DATA_DIR, 'atoms')
SCENARIOS     = os.path.join(DATA_DIR, 'scenarios.json')
THREECOL      = os.path.join(DATA_DIR, 'three-column-state.json')

VARIANTS = ('oob', 'mcp', 'enhanced')

# ── correctness credit table ───────────────────────────────────────────────
CORRECT_FAMILY = {
    'correct', 'correct-vague', 'correct-action', 'correct-judg',
    'correct-range', 'hedge-correct',
}
PARTIAL_FAMILY = {'vague-correct', 'vague-action'}
WRONG_FAMILY   = {'WRONG', 'PARTIAL-WRONG'}
SKIP_FAMILY    = {'admitted-gap'}


def correctness_credit(value: str) -> float | None:
    """Return per-atom credit for accuracy. None means 'skip — don't count'."""
    if value in CORRECT_FAMILY:
        return 1.0
    if value in PARTIAL_FAMILY:
        return 0.6
    if value in WRONG_FAMILY:
        return 0.0
    if value in SKIP_FAMILY:
        return None
    # Unknown correctness label: treat conservatively as zero credit but count.
    return 0.0


# ── citation authority bucketing ───────────────────────────────────────────
AUTHORITATIVE_PATTERNS = [
    re.compile(r'^\s*PCC\b', re.I),
    re.compile(r'^\s*Title\s+\d+', re.I),
    re.compile(r'portland\.gov', re.I),
    re.compile(r'^\s*PortlandMaps', re.I),
    re.compile(r'\bBDS\b', re.I),
    re.compile(r'Oregon\s+Revised\s+Statutes', re.I),
    re.compile(r'^\s*ORS\s+\d+', re.I),
    re.compile(r'Portland\s+City\s+Code', re.I),
    re.compile(r'^\s*OSSC\b', re.I),    # Oregon Structural Specialty Code
    re.compile(r'^\s*ORSC\b', re.I),    # Oregon Residential Specialty Code
    re.compile(r'^\s*OPSC\b', re.I),    # Oregon Plumbing Specialty Code
]
THIRD_PARTY_PATTERNS = [
    re.compile(r'redfin', re.I),
    re.compile(r'zillow', re.I),
    re.compile(r'wikipedia', re.I),
    re.compile(r'nolo', re.I),
    re.compile(r'biggerpockets', re.I),
    re.compile(r'realtor\.com', re.I),
]


def citation_credit(value: Any) -> float:
    """0.0 (none/non-authoritative), 0.3 (third-party), or 1.0 (authoritative)."""
    if value is None:
        return 0.0
    s = str(value).strip()
    if not s:
        return 0.0
    for pat in AUTHORITATIVE_PATTERNS:
        if pat.search(s):
            return 1.0
    for pat in THIRD_PARTY_PATTERNS:
        if pat.search(s):
            return 0.3
    return 0.0


def atom_citation_for(atom: dict, variant: str) -> Any:
    """Per-variant citation lookup with legacy fallback.

    New atoms files carry `citation_by_variant: {oob, mcp, enhanced}` so each
    variant is credited only for what THAT variant actually cited. Older atoms
    files have only a single `citation` field that was the merged best-citation
    across variants — we fall back to it for backwards compatibility.
    """
    cbv = atom.get('citation_by_variant')
    if isinstance(cbv, dict) and variant in cbv:
        return cbv.get(variant)
    return atom.get('citation')


# ── consumability helpers ──────────────────────────────────────────────────
JARGON_TOKENS = {
    'ADU', 'FAR', 'SDC', 'SDCs', 'DAR', 'BDS', 'PCC', 'ORS',
    'OSSC', 'ORSC', 'OPSC', 'IRC', 'IBC', 'CFC', 'NFPA',
    'PBOT', 'BES', 'PWB', 'IPR', 'RIP',
}
WORD_RE = re.compile(r"[A-Za-z][A-Za-z'\-]*")


def jargon_penalty(text: str) -> float:
    """Penalty in [0, 0.30]. 0.10 per (jargon-token / 100 words)."""
    if not text:
        return 0.0
    words = WORD_RE.findall(text)
    if not words:
        return 0.0
    jargon_count = sum(1 for w in words if w in JARGON_TOKENS)
    per_100 = jargon_count / (len(words) / 100.0) if words else 0.0
    return min(0.30, 0.10 * per_100)


# ── score mapping ──────────────────────────────────────────────────────────
def to_three(raw: float) -> int:
    """Map a [0, 1] raw score to a 0..3 integer."""
    if raw is None:
        return 0
    return max(0, min(3, int(round(raw * 3))))


# ── core: per-variant scoring ──────────────────────────────────────────────
def variant_atoms(atoms: list[dict], variant: str) -> list[dict]:
    return [a for a in atoms if variant in (a.get('variants') or [])]


def score_accuracy(atoms_v: list[dict]) -> tuple[int, dict]:
    weighted_credit = 0.0
    total_weight    = 0.0
    counted = 0
    skipped = 0
    for a in atoms_v:
        credit = correctness_credit(a.get('correctness', ''))
        if credit is None:
            skipped += 1
            continue
        w = max(1, int(a.get('importance', 1)))
        total_weight    += w
        weighted_credit += w * credit
        counted += 1
    raw = weighted_credit / total_weight if total_weight else 0.0
    return to_three(raw), {
        'raw': round(raw, 3),
        'counted_atoms': counted,
        'skipped_admitted_gaps': skipped,
    }


def score_completeness(atoms_v: list[dict], must_cover: list[str]) -> tuple[int, dict]:
    if not must_cover:
        return 0, {'raw': 0.0, 'note': 'no must_cover defined'}
    topics = {a.get('topic') for a in atoms_v if a.get('topic')}
    covered = topics & set(must_cover)
    raw = len(covered) / len(must_cover)
    score = to_three(raw)
    # Address-specific cap: admitted-gap on address/zoning topics caps at 2.
    capped = False
    for a in atoms_v:
        if a.get('correctness') == 'admitted-gap' and a.get('topic') in {'address', 'zoning'}:
            if score > 2:
                score = 2
                capped = True
            break
    return score, {
        'raw': round(raw, 3),
        'covered_topics': sorted(covered),
        'missing_topics': sorted(set(must_cover) - covered),
        'capped_due_to_admitted_gap': capped,
    }


# Topics that are workflow/meta and don't fairly demand a code citation.
NON_CITABLE_TOPICS = {'sequence', 'process', 'address'}


def score_citations(atoms_v: list[dict], variant: str) -> tuple[int, dict]:
    # Only count atoms that (a) carry a verifiable factual claim and (b) are
    # on a topic where a code citation is reasonable to expect. "Call BDS"
    # and "I couldn't look up the parcel" don't need PCC citations.
    factual = [
        a for a in atoms_v
        if correctness_credit(a.get('correctness', '')) is not None
        and a.get('topic') not in NON_CITABLE_TOPICS
    ]
    if not factual:
        return 0, {'raw': 0.0, 'note': 'no citable factual atoms'}
    total = sum(citation_credit(atom_citation_for(a, variant)) for a in factual)
    raw = total / len(factual)
    bucket_counts = {'authoritative': 0, 'third_party': 0, 'none_or_other': 0}
    for a in factual:
        c = citation_credit(atom_citation_for(a, variant))
        if   c >= 1.0: bucket_counts['authoritative']  += 1
        elif c > 0.0:  bucket_counts['third_party']    += 1
        else:          bucket_counts['none_or_other']  += 1
    return to_three(raw), {
        'raw': round(raw, 3),
        'buckets': bucket_counts,
        'denominator_atoms': len(factual),
    }


def score_consumability(atoms_v: list[dict], response_text: str) -> tuple[int, dict]:
    if not atoms_v:
        return 0, {'raw': 0.0, 'note': 'no atoms'}
    avg_action = sum(float(a.get('actionability', 0.0)) for a in atoms_v) / len(atoms_v)
    penalty = jargon_penalty(response_text or '')
    raw = max(0.0, avg_action - penalty)
    return to_three(raw), {
        'raw': round(raw, 3),
        'mean_actionability': round(avg_action, 3),
        'jargon_penalty': round(penalty, 3),
    }


def compute_scores(atoms_payload: dict, must_cover: list[str]) -> dict:
    """Return per-variant scores dict suitable for embedding in state."""
    atoms = atoms_payload.get('atoms') or []
    responses = atoms_payload.get('responses') or {}
    out: dict[str, Any] = {
        'evaluator_model':   atoms_payload.get('evaluator_model', 'unknown'),
        'computed_at':       datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        'must_cover':        list(must_cover),
    }
    for v in VARIANTS:
        atoms_v = variant_atoms(atoms, v)
        text    = (responses.get(v) or {}).get('text', '')
        acc_score, acc_d   = score_accuracy(atoms_v)
        comp_score, comp_d = score_completeness(atoms_v, must_cover)
        cit_score, cit_d   = score_citations(atoms_v, v)
        con_score, con_d   = score_consumability(atoms_v, text)
        out[v] = {
            'accuracy':                acc_score,
            'completeness':            comp_score,
            'authoritative_citations': cit_score,
            'consumability':           con_score,
            '_detail': {
                'accuracy':                acc_d,
                'completeness':            comp_d,
                'authoritative_citations': cit_d,
                'consumability':           con_d,
                'atom_count':              len(atoms_v),
            },
        }
    return out


# ── slot lookup mirrors atomize.py ─────────────────────────────────────────
def find_slot(state: dict, scenario_meta: dict) -> tuple[str, str] | None:
    """Return (address_key, scenario_id) for the matching slot, or None."""
    direct = state.get(scenario_meta['address'])
    if direct and scenario_meta['id'] in direct:
        return scenario_meta['address'], scenario_meta['id']
    for k, v in state.items():
        if isinstance(v, dict) and scenario_meta['id'] in v:
            return k, scenario_meta['id']
    return None


# ── I/O helpers ────────────────────────────────────────────────────────────
def load_json(path: str) -> Any:
    with open(path, 'r') as f:
        return json.load(f)


def save_json(path: str, payload: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(payload, f, indent=2)
        f.write('\n')
    os.replace(tmp, path)


# ── main ───────────────────────────────────────────────────────────────────
def aggregate_one(scenario_id: str, dry_run: bool = False) -> str:
    """Returns 'wrote' | 'no-atoms' | 'no-meta' | 'no-slot'."""
    atoms_path = os.path.join(ATOMS_DIR, f"{scenario_id}.json")
    if not os.path.exists(atoms_path):
        return 'no-atoms'
    atoms_payload = load_json(atoms_path)

    scenarios = load_json(SCENARIOS)['scenarios']
    meta = next((s for s in scenarios if s['id'] == scenario_id), None)
    if not meta:
        return 'no-meta'
    must_cover = meta.get('must_cover') or []

    scores = compute_scores(atoms_payload, must_cover)

    if dry_run:
        print(json.dumps({scenario_id: scores}, indent=2))
        return 'wrote'

    state = load_json(THREECOL) if os.path.exists(THREECOL) else {}
    found = find_slot(state, meta)
    if not found:
        # Stand up a slot keyed by address so the next pipeline step finds it.
        addr = meta['address']
        state.setdefault(addr, {}).setdefault(scenario_id, {})
        found = (addr, scenario_id)
    addr_key, sid = found
    state[addr_key][sid]['derivedScores'] = scores
    save_json(THREECOL, state)
    print(f"[aggregate] {scenario_id}: wrote derivedScores into {THREECOL}", flush=True)
    return 'wrote'


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description="Aggregate atom files into 4-dim scores.")
    p.add_argument('scenario', nargs='?', help='scenario id (e.g. tiny-house)')
    p.add_argument('--all', action='store_true', help='aggregate every atoms file present')
    p.add_argument('--dry-run', action='store_true', help='print result, do not persist')
    args = p.parse_args(argv)

    if not args.scenario and not args.all:
        p.error("provide a scenario id or --all")

    if args.all:
        targets = sorted(
            os.path.splitext(f)[0]
            for f in os.listdir(ATOMS_DIR)
            if f.endswith('.json')
        )
    else:
        targets = [args.scenario]

    results = {}
    for sid in targets:
        try:
            results[sid] = aggregate_one(sid, dry_run=args.dry_run)
        except Exception as err:
            print(f"[aggregate] {sid}: ERROR {err}", file=sys.stderr)
            results[sid] = f'error: {err}'

    print("\n=== summary ===")
    for sid, r in results.items():
        print(f"  {sid:<20} {r}")
    bad = sum(1 for r in results.values() if r != 'wrote')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
