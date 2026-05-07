#!/usr/bin/env python3
"""
One-shot backfill: populate `citation_by_variant` on existing atoms files.

Older atoms files (pre per-variant-citation schema) carry a single `citation`
field per atom. That single value was effectively the "best" citation across
the variants that made the claim — which inflated col1 (OOB) citation scores
because the aggregator credited OOB for citations actually produced by the
enhanced response.

This script reads each `data/atoms/<scenario>.json`, and for every atom with
a non-null `citation` string, populates an explicit
`citation_by_variant: {oob, mcp, enhanced}` object using a substring
heuristic:

    - Build candidate tokens from the citation (e.g. "PCC 33.205.040.C" →
      ["pcc 33.205.040", "33.205.040"]).
    - For each variant in the atom's `variants` array, scan that variant's
      verbatim response text. If ANY candidate token is found
      (case-insensitive), set `citation_by_variant[v] = citation`. Otherwise
      set it to null.
    - Variants NOT in `variants` are omitted from the object — they made no
      claim, so per-variant citation is meaningless for them.

The heuristic is intentionally conservative: it never *adds* citation credit
beyond what the legacy single-field would have given. It only *removes*
credit where the cited token clearly does not appear in that variant's text.

For atoms with `citation = null` the object is set to null; nothing changes.

Usage:
    python3 backfill_citation_by_variant.py             # all atoms files
    python3 backfill_citation_by_variant.py <scenario>  # one
    python3 backfill_citation_by_variant.py --dry-run   # show diffs only
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from typing import Any

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ATOMS_DIR = os.path.join(REPO_ROOT, 'data', 'atoms')

VARIANTS = ('oob', 'mcp', 'enhanced')

# Token extraction patterns. Each match contributes the matched token + its
# numeric suffix (where applicable) as a separate candidate.
RE_PCC      = re.compile(r'(PCC\s+(\d+(?:\.\d+)+))', re.I)
RE_TITLE    = re.compile(r'(Title\s+\d+)', re.I)
RE_ORS      = re.compile(r'(ORS\s+(\d+(?:\.\d+)*))', re.I)
RE_PDXURL   = re.compile(r'(portland\.gov[/\w\-\.]*)', re.I)
RE_PMAPS    = re.compile(r'(PortlandMaps)', re.I)
RE_BDSGUIDE = re.compile(r'(BDS\s+Code\s+Guide)', re.I)
RE_OSSC     = re.compile(r'\b(OSSC|ORSC|OPSC)\b')
RE_BARE_NUM = re.compile(r'(\d{2,}\.\d+(?:\.\d+)*)')  # e.g. "33.205.040"
RE_HYPHEN_ID = re.compile(r'(\d{4,}(?:-\d+){2,})')   # e.g. "2009-149664-000-00"


def candidate_tokens(citation: str) -> list[str]:
    """Return lowercase substring tokens that, if any appear in a response
    text, indicate that variant cited this source."""
    tokens: list[str] = []
    s = citation.strip()
    if not s:
        return tokens

    for m in RE_PCC.finditer(s):
        tokens.append(m.group(1).lower())            # "pcc 33.205.040"
        tokens.append(m.group(2).lower())            # "33.205.040"
    for m in RE_ORS.finditer(s):
        tokens.append(m.group(1).lower())
        tokens.append(m.group(2).lower())
    for m in RE_TITLE.finditer(s):
        tokens.append(m.group(1).lower())
    for m in RE_PDXURL.finditer(s):
        tokens.append(m.group(1).lower())
        tokens.append('portland.gov')  # also credit a bare portland.gov mention
    for m in RE_PMAPS.finditer(s):
        tokens.append(m.group(1).lower())     # "portlandmaps"
        tokens.append('portland maps')        # spaced variant some responses use
    for m in RE_BDSGUIDE.finditer(s):
        tokens.append(m.group(1).lower())
    for m in RE_OSSC.finditer(s):
        tokens.append(m.group(1).lower())
    # Bare numeric refs (e.g. when citation is just "33.205.040").
    for m in RE_BARE_NUM.finditer(s):
        tokens.append(m.group(1).lower())
    # Hyphenated permit/file ids (e.g. "2009-149664-000-00").
    for m in RE_HYPHEN_ID.finditer(s):
        tokens.append(m.group(1).lower())

    if not tokens:
        # Fall back to the whole citation as a single substring.
        tokens.append(s.lower())

    # De-dup, preserve order.
    seen = set()
    uniq = []
    for t in tokens:
        if t not in seen:
            seen.add(t)
            uniq.append(t)
    return uniq


def variant_cited(citation: str, response_text: str) -> bool:
    """True if any candidate token derived from `citation` appears
    (case-insensitively) in `response_text`."""
    if not citation or not response_text:
        return False
    haystack = response_text.lower()
    for tok in candidate_tokens(citation):
        if not tok:
            continue
        if tok in haystack:
            return True
    return False


def backfill_atom(atom: dict, responses: dict) -> tuple[dict, dict]:
    """Return (updated_atom, change_summary). change_summary lists per-variant
    decisions for logging/diff."""
    citation = atom.get('citation')
    variants = atom.get('variants') or []
    summary: dict[str, Any] = {'id': atom.get('id'), 'citation': citation, 'variants': list(variants)}

    if citation is None:
        atom['citation_by_variant'] = None
        summary['result'] = 'null-citation'
        return atom, summary

    cbv: dict[str, Any] = {}
    decisions = {}
    for v in VARIANTS:
        if v not in variants:
            continue  # variant didn't make the claim; no per-variant citation
        text = (responses.get(v) or {}).get('text', '') or ''
        if variant_cited(citation, text):
            cbv[v] = citation
            decisions[v] = 'kept'
        else:
            cbv[v] = None
            decisions[v] = 'cleared'
    atom['citation_by_variant'] = cbv
    summary['decisions'] = decisions
    return atom, summary


def backfill_file(path: str, dry_run: bool) -> dict:
    with open(path, 'r') as f:
        data = json.load(f)
    atoms = data.get('atoms') or []
    responses = data.get('responses') or {}

    counts = {'kept': 0, 'cleared': 0, 'null-citation': 0, 'atoms': 0}
    sample_diffs: list[dict] = []

    for atom in atoms:
        counts['atoms'] += 1
        _, summary = backfill_atom(atom, responses)
        if summary.get('result') == 'null-citation':
            counts['null-citation'] += 1
            continue
        for v, dec in (summary.get('decisions') or {}).items():
            counts[dec] += 1
        # Capture a sample where any variant got cleared (the interesting case)
        if any(d == 'cleared' for d in (summary.get('decisions') or {}).values()):
            if len(sample_diffs) < 3:
                sample_diffs.append(summary)

    if not dry_run:
        tmp = path + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(data, f, indent=2)
            f.write('\n')
        os.replace(tmp, path)

    return {'path': path, 'counts': counts, 'samples': sample_diffs}


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser()
    p.add_argument('scenario', nargs='?', help='single scenario id (default: all atoms files)')
    p.add_argument('--dry-run', action='store_true')
    args = p.parse_args(argv)

    if args.scenario:
        targets = [os.path.join(ATOMS_DIR, f"{args.scenario}.json")]
    else:
        targets = sorted(
            os.path.join(ATOMS_DIR, f) for f in os.listdir(ATOMS_DIR) if f.endswith('.json')
        )

    print(f"backfilling {len(targets)} file(s) (dry_run={args.dry_run})\n")
    grand = {'kept': 0, 'cleared': 0, 'null-citation': 0, 'atoms': 0}
    for path in targets:
        if not os.path.exists(path):
            print(f"  MISS  {path}")
            continue
        result = backfill_file(path, args.dry_run)
        print(f"  {os.path.basename(path):<26}  {result['counts']}")
        for k, v in result['counts'].items():
            grand[k] += v
        for s in result['samples']:
            print(f"      sample  {s['id']}  citation={s['citation']!r}")
            print(f"              variants={s['variants']}  decisions={s['decisions']}")

    print(f"\nTOTAL  {grand}")
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
