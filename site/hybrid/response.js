/**
 * response.js — W6 of the hybrid mockup.
 *
 * Right-side panel with two stacked sections:
 *   1. TOP: Literal AI response text (cross-fades when scrubber position
 *      crosses 0.5 or 1.5). Phrases that match an atom's claim_short for
 *      the current variant are subtly underlined; hovering one emits an
 *      onPhraseHover(atomId) event so the orchestrator can highlight the
 *      matching chip.
 *   2. BOTTOM: Pinned-atom detail card. Empty state until a chip is
 *      clicked; persists across scrubber moves until the close button is
 *      hit (or pinAtom(null) is called).
 *
 * Variant selection by position:
 *   pos < 0.5      → oob
 *   0.5 ≤ pos <1.5 → mcp
 *   pos ≥ 1.5      → enhanced
 *
 * Threshold-crossing logic: we track the currently-rendered variant id
 * and only animate when the resolved variant changes. Fractional position
 * updates that don't cross a threshold are no-ops for the top panel.
 *
 * Public API:
 *   new ResponsePanel(container, data)
 *   response.setPosition(pos)        // 0..2
 *   response.pinAtom(atomId | null)  // null clears
 *   response.onPhraseHover(callback) // callback(atomId | null)
 */

import Data from './data.js';

const FADE_MS = 200;

// Correctness → badge color/label mapping (per spec).
const CORRECTNESS_STYLE = {
  'correct':         { color: '#5a8a4f', label: 'correct' },
  'correct-action':  { color: '#5a8a4f', label: 'correct action' },
  'correct-range':   { color: '#5a8a4f', label: 'correct range' },
  'correct-judg':    { color: '#5a8a4f', label: 'correct judgment' },
  'correct-vague':   { color: '#c89a3a', label: 'correct but vague' },
  'vague-correct':   { color: '#c89a3a', label: 'vague-correct' },
  'vague-action':    { color: '#c89a3a', label: 'vague action' },
  'hedge-correct':   { color: '#c89a3a', label: 'hedge-correct' },
  'PARTIAL-WRONG':   { color: '#d05b3a', label: 'partially wrong' },
  'WRONG':           { color: '#a53428', label: 'wrong' },
  'admitted-gap':    { color: '#7a6f60', label: 'admitted gap' },
};

// Variant → display label.
const VARIANT_LABEL = {
  oob:      'no tools',
  mcp:      'PortlandMaps MCP',
  enhanced: 'MCP + enriched prompt',
};

// Variant → tool fallback (overridden by responses[v].tool when present).
const VARIANT_TOOL = {
  oob:      'ChatGPT',
  mcp:      'Claude',
  enhanced: 'Claude',
};

// ---------- helpers ---------------------------------------------------------

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

// Normalize a string for substring matching: lowercase, strip punctuation
// (keep word chars + spaces), collapse whitespace, trim.
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Resolve a fractional position (0..2) to a variant id.
function variantForPosition(pos) {
  if (pos < 0.5) return 'oob';
  if (pos < 1.5) return 'mcp';
  return 'enhanced';
}

// Stop-words skipped when generating fallback content-word n-grams.
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'to', 'is', 'are', 'be', 'and', 'or', 'in', 'on',
  'at', 'for', 'with', 'by', 'as', 'that', 'this', 'these', 'those', 'it',
  'its', 'will', 'may', 'can', 'all', 'any', 'so', 'from', 'into', 'than',
  'then', 'but', 'not', 'no', 'your', 'you', 'we', 'our',
]);

/**
 * Generate candidate phrase needles for an atom's claim_short. We try the
 * full normalized phrase first; if that's not present in the response we
 * fall back to the longest contiguous run of "content" words (n-grams of
 * 3+ non-stopwords) and finally to single distinctive content words paired
 * with their immediate neighbor. The first hit wins for that atom.
 */
function candidateNeedles(claimShort) {
  const norm = normalize(claimShort);
  if (!norm) return [];
  const out = [norm];
  const words = norm.split(' ').filter(Boolean);
  // Build n-grams from full word list (length 4, 3) — these are
  // surface-form runs that survive minor article differences if either
  // side already lacks the article. Then try content-only n-grams.
  for (const n of [5, 4, 3]) {
    if (words.length >= n) {
      for (let i = 0; i <= words.length - n; i++) {
        const ng = words.slice(i, i + n).join(' ');
        if (ng !== norm) out.push(ng);
      }
    }
  }
  // Content-word n-grams (skip stopwords AND keep order).
  const content = words.filter(w => !STOP_WORDS.has(w));
  for (const n of [4, 3, 2]) {
    if (content.length >= n) {
      for (let i = 0; i <= content.length - n; i++) {
        out.push(content.slice(i, i + n).join(' '));
      }
    }
  }
  // De-duplicate while preserving order, sort by length descending so we
  // try the most specific match first.
  const seen = new Set();
  const dedup = [];
  for (const n of out) {
    if (!seen.has(n) && n.length >= 5) {
      seen.add(n);
      dedup.push(n);
    }
  }
  dedup.sort((a, b) => b.length - a.length);
  return dedup;
}

/**
 * Find positional ranges in `text` that match each atom's claim_short.
 * Returns an array of { start, end, atomId } indexed into the ORIGINAL
 * text. We track a parallel index map from normalized character position
 * back to original character position so the highlight wraps the right
 * slice of the source text.
 *
 * Match strategy: try the full normalized claim first, then sequentially
 * shorter n-grams (see candidateNeedles). Per atom we pick the FIRST hit
 * (longest needle wins by ordering). Overlaps across atoms are resolved
 * by preferring earlier and longer ranges.
 */
function findPhraseRanges(text, atoms) {
  if (!text) return [];
  // Build normalized text + index map (normIdx → origIdx of START of glyph).
  const orig = text;
  const normChars = [];
  const normToOrig = [];
  let lastWasSpace = true;
  for (let i = 0; i < orig.length; i++) {
    const ch = orig[i];
    const lower = ch.toLowerCase();
    if (/[a-z0-9]/.test(lower)) {
      normChars.push(lower);
      normToOrig.push(i);
      lastWasSpace = false;
    } else {
      // Treat any non-alphanumeric as a space, but collapse runs.
      if (!lastWasSpace) {
        normChars.push(' ');
        normToOrig.push(i);
        lastWasSpace = true;
      }
    }
  }
  // Strip leading/trailing spaces to mirror normalize().
  while (normChars.length && normChars[0] === ' ') {
    normChars.shift();
    normToOrig.shift();
  }
  while (normChars.length && normChars[normChars.length - 1] === ' ') {
    normChars.pop();
    normToOrig.pop();
  }
  const normText = normChars.join('');

  const ranges = [];
  for (const atom of atoms) {
    const needles = candidateNeedles(atom.claim_short);
    if (!needles.length) continue;
    // Pick the first (longest) needle that appears in the text. Then
    // record up to one match per atom — multi-match would over-clutter
    // the response body for paraphrased text.
    let matched = false;
    for (const needle of needles) {
      if (needle.length < 5) continue;
      const idx = normText.indexOf(needle);
      if (idx === -1) continue;
      const startOrig = normToOrig[idx];
      const lastNormIdx = idx + needle.length - 1;
      const lastOrigIdx = normToOrig[lastNormIdx];
      const endOrig = lastOrigIdx + 1;
      ranges.push({ start: startOrig, end: endOrig, atomId: atom.id });
      matched = true;
      break;
    }
    // (matched === false → atom has no matching phrase in this text;
    //  it remains visible in the chip diagram but is not underlined here.)
    void matched;
  }
  // Sort by start, drop overlaps (prefer earlier/longer).
  ranges.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const merged = [];
  let lastEnd = -1;
  for (const r of ranges) {
    if (r.start >= lastEnd) {
      merged.push(r);
      lastEnd = r.end;
    }
  }
  return merged;
}

// Build innerHTML for a text body with the supplied phrase ranges
// turned into <span class="response-phrase" data-atom-id="..."> wrappers.
function renderTextWithHighlights(text, ranges) {
  if (!text) return '';
  if (!ranges.length) return escapeHtml(text);
  let out = '';
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) out += escapeHtml(text.slice(cursor, r.start));
    out += `<span class="response-phrase" data-atom-id="${escapeHtml(r.atomId)}">${escapeHtml(text.slice(r.start, r.end))}</span>`;
    cursor = r.end;
  }
  if (cursor < text.length) out += escapeHtml(text.slice(cursor));
  return out;
}

// ---------- ResponsePanel --------------------------------------------------

export class ResponsePanel {
  /**
   * @param {HTMLElement} container — usually #response-host
   * @param {object} data — payload from data.js (object with `responses`,
   *   `atoms`) OR the Data module itself (we fall back to Data.* if needed).
   */
  constructor(container, data) {
    if (!container) throw new Error('ResponsePanel: container required');
    this.container = container;
    this.data = data || null;

    this._currentVariant = null;
    this._pos = 0;
    this._pinnedAtomId = null;
    this._phraseHoverCb = null;
    this._fadeTimer = null;

    this._build();
    // Initial render: variant for position 0 = oob.
    this._renderResponse('oob', /* animate */ false);
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  setPosition(pos) {
    const clamped = Math.max(0, Math.min(2, pos));
    this._pos = clamped;
    const want = variantForPosition(clamped);
    if (want !== this._currentVariant) {
      this._renderResponse(want, /* animate */ true);
    }
  }

  pinAtom(atomId) {
    this._pinnedAtomId = atomId || null;
    this._renderPinned();
  }

  onPhraseHover(callback) {
    this._phraseHoverCb = typeof callback === 'function' ? callback : null;
  }

  destroy() {
    if (this._fadeTimer) {
      clearTimeout(this._fadeTimer);
      this._fadeTimer = null;
    }
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
  }

  // ---------------------------------------------------------------------
  // DOM scaffolding
  // ---------------------------------------------------------------------

  _build() {
    this.container.classList.add('response-root');
    this.container.innerHTML = `
      <section class="response-section response-top" aria-label="Literal AI response">
        <header class="response-header">
          <span class="response-tool" data-role="tool">—</span>
          <span class="response-sep" aria-hidden="true">·</span>
          <span class="response-variant" data-role="variant">—</span>
        </header>
        <div class="response-body" data-role="body" aria-live="polite"></div>
      </section>

      <section class="response-section atom-detail-section" aria-label="Pinned atom detail">
        <header class="atom-detail-header">
          <span class="atom-detail-eyebrow">PINNED CLAIM</span>
          <button type="button" class="atom-detail-close" data-role="close" aria-label="Clear pinned claim">×</button>
        </header>
        <div class="atom-detail-body" data-role="atom-body">
          <div class="atom-detail-empty">
            <svg class="atom-detail-empty-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.4"/>
              <path d="M8 12.5l3 3 5-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="atom-detail-empty-text">Click any chip to see the verified truth</span>
          </div>
        </div>
      </section>
    `;

    this._toolEl    = this.container.querySelector('[data-role="tool"]');
    this._variantEl = this.container.querySelector('[data-role="variant"]');
    this._bodyEl    = this.container.querySelector('[data-role="body"]');
    this._atomBody  = this.container.querySelector('[data-role="atom-body"]');
    this._closeBtn  = this.container.querySelector('[data-role="close"]');

    // Initially hide the close button — only useful when something is pinned.
    this._closeBtn.style.display = 'none';
    this._closeBtn.addEventListener('click', () => this.pinAtom(null));

    // Phrase hover delegation on the response body.
    this._bodyEl.addEventListener('mouseover', (ev) => {
      const target = ev.target.closest('.response-phrase');
      if (!target || !this._bodyEl.contains(target)) return;
      const id = target.getAttribute('data-atom-id');
      if (this._phraseHoverCb) this._phraseHoverCb(id);
    });
    this._bodyEl.addEventListener('mouseout', (ev) => {
      const target = ev.target.closest('.response-phrase');
      if (!target) return;
      // Only fire null when actually leaving the phrase (relatedTarget is
      // outside the phrase span).
      const next = ev.relatedTarget;
      if (next && target.contains(next)) return;
      if (this._phraseHoverCb) this._phraseHoverCb(null);
    });
  }

  // ---------------------------------------------------------------------
  // Top section: literal response
  // ---------------------------------------------------------------------

  _allAtoms() {
    if (this.data && Array.isArray(this.data.atoms)) return this.data.atoms;
    if (this.data && typeof this.data.atoms === 'function') return this.data.atoms();
    return Data.atoms() || [];
  }

  _responseFor(variantId) {
    if (this.data && this.data.responses && this.data.responses[variantId]) {
      return this.data.responses[variantId];
    }
    if (this.data && typeof this.data.responseForVariant === 'function') {
      return this.data.responseForVariant(variantId);
    }
    return Data.responseForVariant(variantId);
  }

  _atomsForVariant(variantId) {
    const all = this._allAtoms();
    return all.filter(a => Array.isArray(a.variants) && a.variants.includes(variantId));
  }

  _renderResponse(variantId, animate) {
    const resp = this._responseFor(variantId) || { tool: VARIANT_TOOL[variantId] || '—', text: '' };
    const variantLabel = VARIANT_LABEL[variantId] || variantId;
    const atoms = this._atomsForVariant(variantId);
    const ranges = findPhraseRanges(resp.text, atoms);
    const html = renderTextWithHighlights(resp.text, ranges);

    const swap = () => {
      this._toolEl.textContent = resp.tool || VARIANT_TOOL[variantId] || '—';
      this._variantEl.textContent = variantLabel;
      this._bodyEl.innerHTML = html;
      this._currentVariant = variantId;
      // Variant tint via data attribute (consumed by CSS).
      this.container.setAttribute('data-variant', variantId);
    };

    if (this._fadeTimer) {
      clearTimeout(this._fadeTimer);
      this._fadeTimer = null;
    }

    if (!animate) {
      swap();
      this._bodyEl.classList.remove('response-fading-out');
      this._bodyEl.classList.add('response-fading-in');
      // Force a reflow then drop the in class after animation completes
      // so a subsequent fade starts cleanly.
      // (Browsers will run the CSS transition on initial class add.)
      return;
    }

    // Cross-fade: fade out, swap, fade in.
    this._bodyEl.classList.remove('response-fading-in');
    this._bodyEl.classList.add('response-fading-out');
    this._fadeTimer = setTimeout(() => {
      swap();
      this._bodyEl.classList.remove('response-fading-out');
      this._bodyEl.classList.add('response-fading-in');
      this._fadeTimer = setTimeout(() => {
        this._bodyEl.classList.remove('response-fading-in');
        this._fadeTimer = null;
      }, FADE_MS);
    }, FADE_MS);
  }

  // ---------------------------------------------------------------------
  // Bottom section: pinned atom card
  // ---------------------------------------------------------------------

  _findAtom(atomId) {
    if (!atomId) return null;
    return this._allAtoms().find(a => a.id === atomId) || null;
  }

  _renderPinned() {
    if (!this._pinnedAtomId) {
      this._closeBtn.style.display = 'none';
      this._atomBody.innerHTML = `
        <div class="atom-detail-empty">
          <svg class="atom-detail-empty-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.4"/>
            <path d="M8 12.5l3 3 5-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="atom-detail-empty-text">Click any chip to see the verified truth</span>
        </div>
      `;
      return;
    }
    const atom = this._findAtom(this._pinnedAtomId);
    if (!atom) {
      this._closeBtn.style.display = 'none';
      this._atomBody.innerHTML = `<div class="atom-detail-empty"><span class="atom-detail-empty-text">Atom not found.</span></div>`;
      return;
    }
    this._closeBtn.style.display = '';

    const cs = CORRECTNESS_STYLE[atom.correctness] || { color: '#7a6f60', label: atom.correctness || 'unknown' };
    const variants = Array.isArray(atom.variants) ? atom.variants : [];

    const citationPill = atom.citation
      ? `<span class="atom-detail-citation" data-has="yes">${escapeHtml(atom.citation)}</span>`
      : `<span class="atom-detail-citation atom-detail-citation-none" data-has="no">(no citation)</span>`;

    const badge = `
      <span class="atom-detail-badge" style="--badge-color: ${cs.color};">
        <span class="atom-detail-badge-dot" aria-hidden="true"></span>
        ${escapeHtml(cs.label)}
      </span>
    `;

    const variantPills = ['oob', 'mcp', 'enhanced'].map(v => {
      const present = variants.includes(v);
      return `<span class="atom-detail-variant-pill${present ? ' is-present' : ''}" data-variant="${v}">${escapeHtml(v)}</span>`;
    }).join('');

    this._atomBody.innerHTML = `
      <div class="atom-detail-card" data-correctness="${escapeHtml(atom.correctness || '')}">
        <blockquote class="atom-detail-claim">${escapeHtml(atom.claim_full || atom.claim_short || '')}</blockquote>

        <div class="atom-detail-meta">
          ${citationPill}
          ${badge}
        </div>

        <div class="atom-detail-truth-wrap">
          <span class="atom-detail-truth-label">Verified truth</span>
          <blockquote class="atom-detail-truth">${escapeHtml(atom.verified_truth || '—')}</blockquote>
        </div>

        <div class="atom-detail-variants">
          <span class="atom-detail-variants-label">Variants:</span>
          <span class="atom-detail-variant-pills">${variantPills}</span>
        </div>
      </div>
    `;
  }
}

export default ResponsePanel;
