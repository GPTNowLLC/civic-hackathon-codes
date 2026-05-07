#!/usr/bin/env python3
"""Generate a self-contained static export of the dashboard for offline / hosted-
data-free distribution to the city. Output lands in `site-static/`. Re-run after
any change to data/ or site/index.html.

Static export differs from the live dashboard in three ways:
  1. State is inlined as a JS const — no /api/three-column-state fetch.
  2. Editing UI (Save / Evaluate / Enrich / Clear) is hidden via CSS.
  3. Detail links point to ./comparison/<id>.html (pre-rendered) rather than
     /comparison/<id> (server-rendered).
"""

import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE_DIR = os.path.join(ROOT, 'site')
DATA_DIR = os.path.join(ROOT, 'data')
OUT_DIR  = os.path.join(ROOT, 'site-static')

sys.path.insert(0, ROOT)
import server  # noqa: E402  — reuse render_comparison_html + atom overlay


# ── Helpers ────────────────────────────────────────────────────────────────

def load_json(path):
    with open(path, 'r') as f:
        return json.load(f)


def write_text(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write(text)


# ── Index page rewrite ─────────────────────────────────────────────────────

INLINE_LOAD_BLOCK = """function initState3col() {
  // Static export: state is inlined as window.__STATIC_STATE__.
  SCENARIOS_3COL.forEach(s => ensureBucket(s.address));
  if (window.__STATIC_STATE__) {
    mergeAddressMap(window.__STATIC_STATE__);
  }
}
"""

NOOP_PERSIST_BLOCK = """function persistState3col() {
  /* static export — no persistence */
}
"""

STATIC_MODE_CSS = """
  /* ── Static export: hide live-dashboard editing UI ── */
  .detail-input-section,
  .detail-enrich-btn,
  .detail-clear-all-btn,
  .enriched-q-block:not(.has-content) { display: none !important; }
  .row-detail-link.variant-b { display: none !important; }
"""


def patch_index_html(state):
    src_path = os.path.join(SITE_DIR, 'index.html')
    with open(src_path, 'r') as f:
        html = f.read()

    # 1) Inline state via a <script> ahead of the main script so initState3col
    #    can read it. Place it before the closing </body> right before the
    #    `<script>` block? Simpler: inject just after `<body>`.
    inlined = (
        '<script>window.__STATIC_STATE__ = '
        + json.dumps(state)
        + ';</script>'
    )
    if '<body>' in html:
        html = html.replace('<body>', '<body>\n' + inlined + '\n', 1)
    else:
        # Fallback — prepend before first <script> tag
        html = re.sub(r'(<script\b)', inlined + r'\n\1', html, count=1)

    # 2) Replace initState3col body to drop the /api fetch.
    html = re.sub(
        r'function initState3col\(\) \{.*?\n\}\n',
        INLINE_LOAD_BLOCK,
        html,
        count=1,
        flags=re.DOTALL,
    )

    # 3) Replace persistState3col body to no-op.
    html = re.sub(
        r'function persistState3col\(\) \{.*?\n\}\n',
        NOOP_PERSIST_BLOCK,
        html,
        count=1,
        flags=re.DOTALL,
    )

    # 4) Stub network calls in evalCol / runEnrich so the (hidden) buttons
    #    don't error if a curious user pokes them via DevTools.
    html = html.replace(
        "fetch('/api/evaluate', {",
        "if (true) { alert('Static export — evaluation runs only on the live dashboard.'); return; } fetch('/api/evaluate', {",
    )
    html = html.replace(
        "fetch('/api/enrich', {",
        "if (true) { alert('Static export — enrichment runs only on the live dashboard.'); return; } fetch('/api/enrich', {",
    )

    # 5) Detail link path: /comparison/<id> → comparison/<id>.html
    html = html.replace(
        'href="/comparison/${encodeURIComponent(s.id)}"',
        'href="comparison/${encodeURIComponent(s.id)}.html"',
    )

    # 5b) Absolute → relative for sibling pages, so links work under a project
    #     subpath like https://<user>.github.io/civic-hackathon-codes/.
    html = html.replace('href="/rubric.html"', 'href="rubric.html"')
    html = html.replace('href="/" class="active"', 'href="index.html" class="active"')

    # 6) Inject static-mode CSS and a banner so the audience knows what they're
    #    looking at.
    html = html.replace('</style>', STATIC_MODE_CSS + '\n</style>', 1)

    # 7) Title tweak for the static build.
    html = html.replace(
        '<title>Portland Code AI — Three-Column Comparison</title>',
        '<title>Portland Code AI — Static evaluation snapshot</title>',
        1,
    )

    return html


# ── Comparison detail rewrite ──────────────────────────────────────────────

def patch_comparison_html(html: str) -> str:
    """Adjust the back-link and any /comparison absolute paths for static use."""
    html = html.replace(
        '<a href="/">← back to dashboard</a>',
        '<a href="../index.html">← back to dashboard</a>',
        1,
    )
    return html


# ── Rubric page rewrite ───────────────────────────────────────────────────

def patch_rubric_html(html: str) -> str:
    """Rewrite absolute sibling-page links so the page works under a project
    subpath on GitHub Pages."""
    html = html.replace('href="/rubric.html"', 'href="rubric.html"')
    html = html.replace('href="/"', 'href="index.html"')
    return html


# ── Build ──────────────────────────────────────────────────────────────────

def build():
    if os.path.exists(OUT_DIR):
        shutil.rmtree(OUT_DIR)
    os.makedirs(OUT_DIR)

    # Load + atom-overlay the three-column state, same projection the live
    # comparison page uses, so static dashboard scores match static detail
    # pages.
    state = server.load_threecol_state()
    state = server._overlay_atom_scores(state)

    scenarios = load_json(server.SCENARIOS_FILE).get('scenarios', [])

    # Index
    index_html = patch_index_html(state)
    write_text(os.path.join(OUT_DIR, 'index.html'), index_html)

    # Rubric (sibling page reachable from the nav bar)
    rubric_src = os.path.join(SITE_DIR, 'rubric.html')
    if os.path.isfile(rubric_src):
        with open(rubric_src, 'r') as f:
            rubric_html = f.read()
        rubric_html = patch_rubric_html(rubric_html)
        write_text(os.path.join(OUT_DIR, 'rubric.html'), rubric_html)

    # Pre-render comparison pages. Only emit pages for scenarios with atoms —
    # the live page also degrades when atoms are missing, but for the city
    # audience we'd rather omit the link than show an empty page. Today the
    # dashboard links every row; we render whatever atoms we have and let the
    # broken links 404 (acceptable for now — see notes).
    comp_dir = os.path.join(OUT_DIR, 'comparison')
    os.makedirs(comp_dir, exist_ok=True)
    rendered = []
    skipped  = []
    for s in scenarios:
        sid = s['id']
        body, status = server.render_comparison_html(sid)
        if status != 200:
            skipped.append((sid, status))
            continue
        body = patch_comparison_html(body)
        write_text(os.path.join(comp_dir, f'{sid}.html'), body)
        rendered.append(sid)

    # Copy any auxiliary site assets that index.html may load (lib/, data/).
    # The live dashboard references /api/* only — no static asset deps today —
    # but copy lib/ and site/data/ if present so future additions Just Work.
    for sub in ('lib', 'data'):
        src = os.path.join(SITE_DIR, sub)
        if os.path.isdir(src):
            shutil.copytree(src, os.path.join(OUT_DIR, sub))

    print(f"[static] wrote {OUT_DIR}/index.html")
    print(f"[static] rendered {len(rendered)} comparison page(s): {', '.join(rendered) or '(none)'}")
    if skipped:
        print(f"[static] skipped {len(skipped)}: {skipped}")


if __name__ == '__main__':
    build()
