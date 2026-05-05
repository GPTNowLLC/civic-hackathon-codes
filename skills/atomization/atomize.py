#!/usr/bin/env python3
"""
Atomization skill — turns a slot in three-column-state.json into a per-scenario
atomized-claims file at data/atoms/<scenario-id>.json.

The detail page (site/mockup-hybrid.html) renders the rich Venn / chips view
when an atoms file exists; otherwise it falls back to a three-card responses
view. This script is the bridge from "we ran an evaluation" to "the detail
page can show the Venn experience."

Usage:
    python3 atomize.py <scenario-id>          # one scenario
    python3 atomize.py --all                  # all scenarios missing atoms
    python3 atomize.py --all --force          # re-do everything
    python3 atomize.py <id> --dry-run         # print, don't write

The script:
    1. Loads scenarios.json for meta + three-column-state.json for the slot.
    2. Builds the literal `responses` block directly from slot fields (no LLM).
    3. Calls `claude -p --json-schema=...` to extract the `atoms` array.
    4. Writes the combined payload to data/atoms/<scenario-id>.json.

Calls `claude` CLI (same pattern as skills/enrichment/enrich.py). No SDK keys.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from typing import Any

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA_DIR = os.path.join(REPO_ROOT, 'data')
ATOMS_DIR = os.path.join(DATA_DIR, 'atoms')
SCENARIOS_FILE = os.path.join(DATA_DIR, 'scenarios.json')
THREECOL_FILE = os.path.join(DATA_DIR, 'three-column-state.json')
PROMPT_FILE = os.path.join(os.path.dirname(__file__), 'prompt.txt')

# ---- variant tool labels --------------------------------------------------
# The atoms-file `responses` block uses friendly labels distinct from the
# raw col1/col2/col3 metadata. These match the existing tiny-house.json.
VARIANT_LABELS = {
    'oob':      'OOB · no MCP, bare prompt',
    'mcp':      'MCP · PortlandMaps tools',
    'enhanced': 'Enhanced · MCP + enriched prompt',
}

# ---- JSON schema enforced on the LLM output -------------------------------
ATOM_SCHEMA = {
    "type": "object",
    "properties": {
        "atoms": {
            "type": "array",
            "minItems": 5,
            "items": {
                "type": "object",
                "properties": {
                    "id":             {"type": "string"},
                    "claim_short":    {"type": "string"},
                    "claim_full":     {"type": "string"},
                    "topic":          {"type": "string"},
                    "variants": {
                        "type": "array",
                        "minItems": 1,
                        "items": {"type": "string", "enum": ["oob", "mcp", "enhanced"]},
                    },
                    "specificity":    {"type": "number", "minimum": 0, "maximum": 1},
                    "actionability":  {"type": "number", "minimum": 0, "maximum": 1},
                    "correctness":    {"type": "string"},
                    "importance":     {"type": "integer", "minimum": 1, "maximum": 5},
                    "citation":       {"type": ["string", "null"]},
                    "verified_truth": {"type": "string"},
                },
                "required": [
                    "id", "claim_short", "claim_full", "topic", "variants",
                    "specificity", "actionability", "correctness",
                    "importance", "citation", "verified_truth",
                ],
                "additionalProperties": False,
            },
        }
    },
    "required": ["atoms"],
    "additionalProperties": False,
}


# ---- helpers --------------------------------------------------------------

def load_json(path: str) -> Any:
    with open(path, 'r') as f:
        return json.load(f)


def save_json(path: str, payload: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(payload, f, indent=2)
        f.write('\n')


def find_slot(state: dict, scenario_meta: dict) -> dict | None:
    direct = state.get(scenario_meta['address'])
    if direct and scenario_meta['id'] in direct:
        return direct[scenario_meta['id']]
    for v in state.values():
        if isinstance(v, dict) and scenario_meta['id'] in v:
            return v[scenario_meta['id']]
    return None


def resident_question(scenario_meta: dict) -> str:
    t = scenario_meta.get('template', '')
    addr = scenario_meta.get('address', '')
    if '(x)' in t:
        return t.replace('(x)', addr)
    return f"{t} (Address: {addr})" if addr else t


def fmt_flags(flags) -> str:
    if not flags:
        return '(none recorded)'
    if isinstance(flags, str):
        flags = [flags]
    return '\n'.join(f"  - {x}" for x in flags if str(x).strip())


def render_prompt(scenario_meta: dict, slot: dict) -> str:
    template = open(PROMPT_FILE, 'r').read()
    c1, c2, c3 = slot.get('col1', {}), slot.get('col2', {}), slot.get('col3', {})
    return template.format(
        scenario_id        = scenario_meta['id'],
        label              = scenario_meta.get('label', ''),
        resident_question  = resident_question(scenario_meta),
        address            = scenario_meta.get('address', ''),
        neighborhood       = scenario_meta.get('neighborhood', ''),

        oob_tool           = c1.get('tool', ''),
        oob_u              = c1.get('usefulness', ''),
        oob_c              = c1.get('citationQuality', ''),
        oob_aa             = c1.get('audienceAppropriateness', ''),
        oob_rationale      = c1.get('rationale', '(none)'),
        oob_flags          = fmt_flags(c1.get('accuracyFlags')),
        oob_dq             = c1.get('dataQualityNotes', '(none)'),
        oob_response       = c1.get('response', '(no response captured)'),

        mcp_tool           = c2.get('tool', ''),
        mcp_u              = c2.get('usefulness', ''),
        mcp_c              = c2.get('citationQuality', ''),
        mcp_aa             = c2.get('audienceAppropriateness', ''),
        mcp_rationale      = c2.get('rationale', '(none)'),
        mcp_flags          = fmt_flags(c2.get('accuracyFlags')),
        mcp_dq             = c2.get('dataQualityNotes', '(none)'),
        mcp_response       = c2.get('response', '(no response captured)'),

        enh_tool           = c3.get('tool', ''),
        enh_u              = c3.get('usefulness', ''),
        enh_c              = c3.get('citationQuality', ''),
        enh_aa             = c3.get('audienceAppropriateness', ''),
        enriched_question  = slot.get('enrichedQuestion', '(none)'),
        enh_rationale      = c3.get('rationale', '(none)'),
        enh_flags          = fmt_flags(c3.get('accuracyFlags')),
        enh_dq             = c3.get('dataQualityNotes', '(none)'),
        enh_response       = c3.get('response', '(no response captured)'),
    )


DEFAULT_EVALUATOR = 'claude'


def _strip_fences_and_parse(raw: str) -> dict:
    """Tolerate optional markdown fences and preamble; return parsed dict."""
    raw = raw.strip()
    if not raw:
        raise RuntimeError("evaluator returned empty output")
    if raw.startswith('```'):
        raw = raw.split('\n', 1)[1] if '\n' in raw else raw
        if raw.endswith('```'):
            raw = raw[:-3]
        raw = raw.strip()
        if raw.startswith('json\n'):
            raw = raw[5:]
    if not raw.lstrip().startswith('{'):
        idx = raw.find('{')
        if idx == -1:
            raise RuntimeError(f"no JSON object in evaluator output (head: {raw[:200]!r})")
        raw = raw[idx:]
    parsed = json.loads(raw)
    if 'atoms' not in parsed or not isinstance(parsed['atoms'], list):
        raise RuntimeError("response did not include an 'atoms' array")
    return parsed


def _call_claude_cli(prompt: str, model: str | None, timeout: int) -> dict:
    """Invoke the claude CLI. `model` is ignored unless explicitly set —
    the CLI uses its configured default when none is passed.

    NOTE: We deliberately do NOT pass `--json-schema`. With a long prompt the
    schema-validated path returns an empty `result` field (the model produces
    tool-use blocks instead of an assistant text turn). Plain text output
    with a strong "ONLY the JSON object" instruction works reliably.
    """
    cmd = ['claude', '-p', prompt, '--output-format', 'text']
    if model and model not in ('claude', 'claude-default'):
        cmd.extend(['--model', model])
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        err = result.stderr.strip() or result.stdout.strip() or '(no output)'
        raise RuntimeError(f"claude exited {result.returncode}: {err}")
    return _strip_fences_and_parse(result.stdout)


def _call_openai_sdk(prompt: str, model: str, timeout: int) -> dict:
    """Invoke the OpenAI SDK with JSON-object response format.

    Requires OPENAI_API_KEY in the environment. We use the Chat Completions
    API (broadest model coverage) and rely on the response_format json_object
    setting plus the prompt's "ONLY the JSON object" instruction.
    """
    if not os.environ.get('OPENAI_API_KEY'):
        raise RuntimeError(
            "OPENAI_API_KEY not set — required when --evaluator-model targets an OpenAI model"
        )
    try:
        from openai import OpenAI  # type: ignore
    except ImportError as e:
        raise RuntimeError(f"openai SDK not installed: {e}")
    client = OpenAI(timeout=timeout)
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    raw = (resp.choices[0].message.content or '').strip()
    return _strip_fences_and_parse(raw)


def call_evaluator(prompt: str, model: str, timeout: int = 600) -> dict:
    """Dispatch to the right backend based on model name.

    - 'claude' / 'claude-default' / anything starting with 'claude' → claude CLI
    - anything starting with 'gpt' or 'o1' / 'o3' / 'o4' → openai SDK
    - anything else → error
    """
    m = (model or DEFAULT_EVALUATOR).strip().lower()
    if m.startswith('claude') or m == 'claude-default':
        return _call_claude_cli(prompt, model, timeout)
    if m.startswith('gpt') or m.startswith('o1') or m.startswith('o3') or m.startswith('o4'):
        return _call_openai_sdk(prompt, model, timeout)
    raise RuntimeError(
        f"unknown evaluator model: {model!r}. Use a 'claude...' or 'gpt-...' / 'o1-...' identifier."
    )


def build_payload(scenario_meta: dict, slot: dict, atoms: list, evaluator_model: str) -> dict:
    c1, c2, c3 = slot.get('col1', {}), slot.get('col2', {}), slot.get('col3', {})
    return {
        "scenario":        scenario_meta['id'],
        "scenario_label":  scenario_meta.get('label', ''),
        "address":         scenario_meta.get('address', ''),
        "neighborhood":    scenario_meta.get('neighborhood', ''),
        "evaluator_model": evaluator_model,
        "responses": {
            "oob":      {"tool": c1.get('tool', VARIANT_LABELS['oob']),      "text": c1.get('response', '')},
            "mcp":      {"tool": c2.get('tool', VARIANT_LABELS['mcp']),      "text": c2.get('response', '')},
            "enhanced": {"tool": c3.get('tool', VARIANT_LABELS['enhanced']), "text": c3.get('response', '')},
        },
        "atoms": atoms,
    }


# ---- main -----------------------------------------------------------------

def atomize_one(scenario_id: str, force: bool, dry_run: bool, evaluator_model: str) -> str:
    """Returns 'wrote' | 'skipped' | 'no-slot' | 'empty-slot' | 'no-atoms'."""
    out_path = os.path.join(ATOMS_DIR, f"{scenario_id}.json")
    if os.path.exists(out_path) and not force and not dry_run:
        return 'skipped'

    scenarios = load_json(SCENARIOS_FILE)['scenarios']
    meta = next((s for s in scenarios if s['id'] == scenario_id), None)
    if not meta:
        raise SystemExit(f"unknown scenario id: {scenario_id}")

    state = load_json(THREECOL_FILE)
    slot = find_slot(state, meta)
    if not slot:
        return 'no-slot'

    # Refuse empty slots: if none of col1/col2/col3 has a real response,
    # there is nothing to atomize and a "successful" empty atoms file would
    # mislead the detail page (it would render an empty Venn instead of
    # falling back to the not-yet-evaluated message).
    cols = [slot.get('col1', {}), slot.get('col2', {}), slot.get('col3', {})]
    has_any_response = any(str(c.get('response') or '').strip() for c in cols)
    if not has_any_response:
        print(f"[atomize] {scenario_id}: SKIP — slot is empty (no responses recorded)", flush=True)
        return 'empty-slot'

    prompt = render_prompt(meta, slot)
    print(f"[atomize] {scenario_id}: calling {evaluator_model} (prompt {len(prompt)} chars)…", flush=True)
    result = call_evaluator(prompt, evaluator_model)
    atoms = result.get('atoms', [])
    print(f"[atomize] {scenario_id}: got {len(atoms)} atoms", flush=True)
    if not atoms:
        # The model produced no atoms even though responses exist; refuse to
        # write so we don't end up with a useless atoms file.
        return 'no-atoms'

    payload = build_payload(meta, slot, atoms, evaluator_model)

    if dry_run:
        print(json.dumps(payload, indent=2))
        return 'wrote'

    save_json(out_path, payload)
    print(f"[atomize] {scenario_id}: wrote {out_path}", flush=True)
    return 'wrote'


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description="Atomize an evaluation slot into data/atoms/<id>.json")
    p.add_argument('scenario', nargs='?', help='scenario id (e.g. fence-height)')
    p.add_argument('--all', action='store_true', help='atomize every scenario in scenarios.json')
    p.add_argument('--force', action='store_true', help='overwrite existing atoms files')
    p.add_argument('--dry-run', action='store_true', help='print the payload, do not write')
    p.add_argument(
        '--evaluator-model',
        default=os.environ.get('EVALUATOR_MODEL', DEFAULT_EVALUATOR),
        help=(
            "Model that performs the adversarial verification. Examples: "
            "'claude' (CLI default), 'claude-sonnet-4-6', 'gpt-5', 'gpt-4o', 'o1-preview'. "
            "Falls back to env EVALUATOR_MODEL, then 'claude'."
        ),
    )
    args = p.parse_args(argv)

    if not args.scenario and not args.all:
        p.error("provide a scenario id or --all")

    scenarios = load_json(SCENARIOS_FILE)['scenarios']
    targets = [s['id'] for s in scenarios] if args.all else [args.scenario]

    print(f"[atomize] evaluator model: {args.evaluator_model}", flush=True)

    results = {}
    for sid in targets:
        try:
            results[sid] = atomize_one(
                sid,
                force=args.force,
                dry_run=args.dry_run,
                evaluator_model=args.evaluator_model,
            )
        except subprocess.TimeoutExpired:
            print(f"[atomize] {sid}: TIMED OUT", file=sys.stderr)
            results[sid] = 'timeout'
        except Exception as err:
            print(f"[atomize] {sid}: ERROR {err}", file=sys.stderr)
            results[sid] = f'error: {err}'

    print("\n=== summary ===")
    for sid, r in results.items():
        print(f"  {sid:<20} {r}")
    bad = sum(1 for r in results.values() if r not in ('wrote', 'skipped'))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
