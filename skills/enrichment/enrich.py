#!/usr/bin/env python3
"""
Enrichment skill — Column 3 generator.

Takes a bare user question and produces an enriched question: what the resident
*should have asked*, surfacing related considerations they didn't think to raise.

Usage (CLI):
    python3 enrich.py "Can I build a tiny house on my lot?"

Usage (import):
    from enrich import enrich_question
    enriched = enrich_question("Can I build a tiny house on my lot?")

The enriched question is intended to be fed back into an MCP-enabled AI tool
to produce the Column 3 answer in the three-column dashboard.
"""

import os
import subprocess
import sys

PROMPT_FILE = os.path.join(os.path.dirname(__file__), 'prompt.txt')


def load_prompt_template():
    with open(PROMPT_FILE, 'r') as f:
        return f.read()


def enrich_question(question: str) -> str:
    """
    Enrich a bare user question using Claude CLI.
    Returns the enriched question as a string.
    Raises RuntimeError on failure.
    """
    template = load_prompt_template()
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


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 enrich.py '<question>'", file=sys.stderr)
        sys.exit(1)
    question = ' '.join(sys.argv[1:])
    try:
        enriched = enrich_question(question)
        print(enriched)
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
