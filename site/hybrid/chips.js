/**
 * chips.js — W4 of the hybrid mockup.
 *
 * Renders atom chips inside the SVG diagram, one per atom. Chips are
 * placed by anchoring at the centroid of their Venn region (provided by
 * the Lobes module), then settled by a short force-directed pass so chips
 * within a region don't overlap. Once placed, chip POSITIONS are static —
 * only their visual state (active vs. ghosted, highlight, correctness
 * overlay) updates when the scrubber moves.
 *
 * Public API:
 *   new Chips(svgGroupOrSvg, atoms, lobes)
 *   chips.setPosition(pos)               // 0..2, updates ghosting
 *   chips.highlight(regionKey | null)    // brighten chips in region, dim others
 *   chips.onClick(callback)              // callback(atom)
 *   chips.destroy()                      // remove all DOM
 */

import Data from './data.js';

const NS = 'http://www.w3.org/2000/svg';

// Variant tints — match Lobes.
const VARIANT_COLOR = {
  oob:      '#c5524a',
  mcp:      '#c89a3a',
  enhanced: '#5a8a4f',
};

// Region key -> ordered list of variants in that region (used to pick
// outline colors for multi-variant chips).
const REGION_VARIANTS = {
  oob_only:       ['oob'],
  mcp_only:       ['mcp'],
  enhanced_only:  ['enhanced'],
  oob_mcp:        ['oob', 'mcp'],
  mcp_enhanced:   ['mcp', 'enhanced'],
  oob_enhanced:   ['oob', 'enhanced'],
  all_three:      ['oob', 'mcp', 'enhanced'],
};

// Chip geometry (viewBox units = the lobes 1000×800 system).
const CHIP_HEIGHT = 22;
const CHIP_PAD_X = 8;
const CHIP_MIN_WIDTH = 72;
const CHIP_MAX_WIDTH = 138;
// Approximate width in viewBox units per character at the chip-face font
// size (we render text at ~10px and the chip is in viewBox space).
const CHAR_WIDTH = 4.8;
const CITATION_BADGE_PADDING = 12; // extra width when a citation badge is present
const CHIP_GAP = 3; // minimum gap between chips after force pass

// Force-directed iteration.
const FD_ITERATIONS = 140;
const FD_REPULSION_K = 0.42;
const FD_CENTROID_K = 0.014;

// -------- variant emergence thresholds (mirror W5) -------------------------
function smoothstep(a, b, t) {
  if (t <= a) return 0;
  if (t >= b) return 1;
  const x = (t - a) / (b - a);
  return x * x * (3 - 2 * x);
}

function variantStrength(variant, pos) {
  switch (variant) {
    case 'oob':
      // Full strength while OOB is the dominant story; gradually dims as
      // Enhanced takes over but never fully disappears.
      if (pos < 1) return 1;
      return Math.max(0, 1 - (pos - 1) * 0.5);
    case 'mcp':
      return smoothstep(0.4, 0.7, pos);
    case 'enhanced':
      return smoothstep(1.4, 1.7, pos);
    default:
      return 0;
  }
}

// Activeness for an atom = max strength across its variants.
function chipActiveness(atom, pos) {
  let best = 0;
  for (const v of atom.variants || []) {
    const s = variantStrength(v, pos);
    if (s > best) best = s;
  }
  return best;
}

// Choose a "dominant" variant for outline coloring. For multi-variant
// chips we prefer the strongest at the moment of full reveal; this is
// stable across positions because we use a simple priority.
function dominantVariant(atom) {
  const variants = atom.variants || [];
  // Priority: enhanced > mcp > oob (highest-tier source wins).
  if (variants.includes('enhanced')) return 'enhanced';
  if (variants.includes('mcp')) return 'mcp';
  if (variants.includes('oob')) return 'oob';
  return 'oob';
}

// Width estimate from claim_short.
function estimateChipWidth(atom) {
  const text = (atom.claim_short || '').trim();
  let w = text.length * CHAR_WIDTH + CHIP_PAD_X * 2;
  if (atom.citation) w += CITATION_BADGE_PADDING + (String(atom.citation).length * 3.2);
  return Math.max(CHIP_MIN_WIDTH, Math.min(CHIP_MAX_WIDTH, w));
}

// Bounding-box overlap (with gap padding). Returns separating vector to
// push `a` away from `b` so they no longer overlap; null if no overlap.
// Picks axis of minimum penetration so chips slide cleanly past each
// other; if dx is exactly 0, breaks the symmetry by adding tiny jitter.
function overlapVector(a, b) {
  let dx = a.x - b.x;
  let dy = a.y - b.y;
  if (dx === 0 && dy === 0) {
    // Total stack: nudge one chip arbitrarily so the next iteration
    // resolves with a real direction.
    dx = (a.atom && a.atom.id ? (a.atom.id.charCodeAt(1) % 5) - 2 : 1) || 1;
    dy = 1;
  }
  const minX = (a.w + b.w) / 2 + CHIP_GAP;
  const minY = (a.h + b.h) / 2 + CHIP_GAP;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax >= minX || ay >= minY) return null;
  // Penetration along each axis.
  const px = minX - ax;
  const py = minY - ay;
  // Push along the axis of minimum penetration.
  if (px < py) {
    return { x: (dx >= 0 ? 1 : -1) * px, y: 0, mag: px };
  }
  return { x: 0, y: (dy >= 0 ? 1 : -1) * py, mag: py };
}

// -------------------------------------------------------------------------
// Chips class
// -------------------------------------------------------------------------
export class Chips {
  /**
   * @param {SVGElement} svgGroupOrSvg  pass the inner <g id="chips-layer">
   *                                     (preferred) or the parent <svg>.
   * @param {Array} atoms                array of atom objects.
   * @param {Lobes} lobes                instance from lobes.js.
   * @param {object} [opts]              { width, height } — viewBox dims.
   */
  constructor(svgGroupOrSvg, atoms, lobes, opts = {}) {
    if (!svgGroupOrSvg) throw new Error('Chips: svg group required');
    this.layer = svgGroupOrSvg;
    // Walk up to find the root svg (used for tooltip positioning).
    let svg = svgGroupOrSvg;
    while (svg && svg.tagName && svg.tagName.toLowerCase() !== 'svg') svg = svg.parentNode;
    this.svg = svg || svgGroupOrSvg;
    this.atoms = (atoms || []).slice();
    this.lobes = lobes;
    this.width = opts.width ?? 1000;
    this.height = opts.height ?? 800;

    this._clickCb = null;
    this._highlightKey = null;
    this._currentPos = 0;
    this._chips = []; // [{atom, region, x, y, w, h, group, ...}]
    this._tooltip = null;
    this._destroyed = false;
    this._onMove = this._onMove.bind(this);
    this._onScroll = this._onScroll.bind(this);

    this._ensureDefs();
    this._build();
    this._layout();
    this._render();
    this.setPosition(0);
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------
  setPosition(pos) {
    this._currentPos = Math.max(0, Math.min(2, pos));
    for (const c of this._chips) {
      const a = chipActiveness(c.atom, this._currentPos);
      this._applyActiveness(c, a);
    }
  }

  highlight(regionKey) {
    this._highlightKey = regionKey || null;
    for (const c of this._chips) {
      const dimmed = this._highlightKey && c.region !== this._highlightKey;
      const lit = this._highlightKey && c.region === this._highlightKey;
      c.group.classList.toggle('chip-dimmed', !!dimmed);
      c.group.classList.toggle('chip-lit', !!lit);
    }
  }

  onClick(callback) {
    this._clickCb = typeof callback === 'function' ? callback : null;
  }

  destroy() {
    this._destroyed = true;
    while (this.layer.firstChild) this.layer.removeChild(this.layer.firstChild);
    this._removeTooltip();
    window.removeEventListener('scroll', this._onScroll, true);
    window.removeEventListener('resize', this._onScroll);
  }

  // ---------------------------------------------------------------------
  // SVG defs (hatch / stripe patterns for correctness overlays)
  // ---------------------------------------------------------------------
  _ensureDefs() {
    let defs = this.svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS(NS, 'defs');
      this.svg.insertBefore(defs, this.svg.firstChild);
    }

    if (!this.svg.querySelector('#chip-hatch-red')) {
      // Diagonal red stripe for PARTIAL-WRONG / WRONG.
      const pat = document.createElementNS(NS, 'pattern');
      pat.setAttribute('id', 'chip-hatch-red');
      pat.setAttribute('patternUnits', 'userSpaceOnUse');
      pat.setAttribute('width', '6');
      pat.setAttribute('height', '6');
      pat.setAttribute('patternTransform', 'rotate(45)');
      const bg = document.createElementNS(NS, 'rect');
      bg.setAttribute('width', '6');
      bg.setAttribute('height', '6');
      bg.setAttribute('fill', 'transparent');
      pat.appendChild(bg);
      const stripe = document.createElementNS(NS, 'rect');
      stripe.setAttribute('width', '2');
      stripe.setAttribute('height', '6');
      stripe.setAttribute('fill', '#c5524a');
      stripe.setAttribute('opacity', '0.55');
      pat.appendChild(stripe);
      defs.appendChild(pat);
    }
  }

  // ---------------------------------------------------------------------
  // Build SVG chip nodes (positions filled in by _layout afterward)
  // ---------------------------------------------------------------------
  _build() {
    // Clear any existing children (e.g. if reconstructed).
    while (this.layer.firstChild) this.layer.removeChild(this.layer.firstChild);

    for (const atom of this.atoms) {
      const region = (Data && typeof Data.regionForAtom === 'function')
        ? Data.regionForAtom(atom)
        : this._regionForAtomLocal(atom);
      if (!region) continue;

      const variants = REGION_VARIANTS[region] || [];
      const dom = dominantVariant(atom);
      const w = estimateChipWidth(atom);
      const h = CHIP_HEIGHT;

      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', `chip chip-region-${region} chip-dom-${dom} chip-correct-${atom.correctness}`);
      g.setAttribute('data-atom-id', atom.id);
      g.setAttribute('data-region', region);
      g.style.cursor = 'pointer';

      // Two-tone outline for multi-variant chips: render a back rect tinted
      // by the secondary color, slightly larger; the front rect is the chip.
      let outerRect = null;
      if (variants.length > 1) {
        const sec = variants.find(v => v !== dom) || dom;
        outerRect = document.createElementNS(NS, 'rect');
        outerRect.setAttribute('class', 'chip-outer');
        outerRect.setAttribute('rx', '9');
        outerRect.setAttribute('ry', '9');
        outerRect.setAttribute('fill', 'none');
        outerRect.setAttribute('stroke', VARIANT_COLOR[sec]);
        outerRect.setAttribute('stroke-width', '0.75');
        outerRect.setAttribute('opacity', '0.65');
        g.appendChild(outerRect);
      }

      // Main chip rect.
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('class', 'chip-rect');
      rect.setAttribute('rx', '8');
      rect.setAttribute('ry', '8');
      rect.setAttribute('fill', '#fbf6ec');
      rect.setAttribute('stroke', VARIANT_COLOR[dom]);
      rect.setAttribute('stroke-width', '1.4');
      g.appendChild(rect);

      // Correctness overlay rect (hatch) — sits above main rect, below text.
      let overlay = null;
      if (atom.correctness === 'PARTIAL-WRONG' || atom.correctness === 'WRONG') {
        overlay = document.createElementNS(NS, 'rect');
        overlay.setAttribute('class', 'chip-overlay-hatch');
        overlay.setAttribute('rx', '8');
        overlay.setAttribute('ry', '8');
        overlay.setAttribute('fill', 'url(#chip-hatch-red)');
        overlay.setAttribute('pointer-events', 'none');
        g.appendChild(overlay);
      }

      // Dotted-bottom accent for vague-* / hedge-* / correct-vague.
      let bottomLine = null;
      if (/^(vague-|hedge-|correct-vague)/.test(atom.correctness)) {
        bottomLine = document.createElementNS(NS, 'line');
        bottomLine.setAttribute('class', 'chip-dotted-bottom');
        bottomLine.setAttribute('stroke', VARIANT_COLOR[dom]);
        bottomLine.setAttribute('stroke-width', '1');
        bottomLine.setAttribute('stroke-dasharray', '1.5 2');
        bottomLine.setAttribute('opacity', '0.7');
        g.appendChild(bottomLine);
      }

      // Chip face text.
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('class', 'chip-text');
      text.setAttribute('text-anchor', 'start');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-size', '10');
      text.setAttribute('fill', '#3a2f24');
      text.textContent = atom.claim_short || '';
      if (atom.correctness === 'admitted-gap') {
        text.setAttribute('font-style', 'italic');
      }
      g.appendChild(text);

      // Strikethrough line for WRONG.
      let strike = null;
      if (atom.correctness === 'WRONG') {
        strike = document.createElementNS(NS, 'line');
        strike.setAttribute('class', 'chip-strike');
        strike.setAttribute('stroke', '#a23028');
        strike.setAttribute('stroke-width', '1.4');
        strike.setAttribute('opacity', '0.85');
        g.appendChild(strike);
      }

      // Citation badge (mono).
      let badgeBg = null;
      let badgeText = null;
      if (atom.citation) {
        badgeBg = document.createElementNS(NS, 'rect');
        badgeBg.setAttribute('class', 'chip-badge-bg');
        badgeBg.setAttribute('rx', '3');
        badgeBg.setAttribute('ry', '3');
        badgeBg.setAttribute('fill', VARIANT_COLOR[dom]);
        badgeBg.setAttribute('opacity', '0.18');
        g.appendChild(badgeBg);

        badgeText = document.createElementNS(NS, 'text');
        badgeText.setAttribute('class', 'chip-badge');
        badgeText.setAttribute('text-anchor', 'start');
        badgeText.setAttribute('dominant-baseline', 'middle');
        badgeText.setAttribute('font-size', '8');
        badgeText.setAttribute('font-family', 'JetBrains Mono, ui-monospace, monospace');
        badgeText.setAttribute('fill', VARIANT_COLOR[dom]);
        badgeText.textContent = String(atom.citation);
        g.appendChild(badgeText);
      }

      // Apply correctness modifiers to rect (dashed border for admitted-gap).
      if (atom.correctness === 'admitted-gap') {
        rect.setAttribute('stroke-dasharray', '4 3');
      }

      // Wire interactions.
      g.addEventListener('mouseenter', () => this._showTooltip(atom, g));
      g.addEventListener('mousemove', this._onMove);
      g.addEventListener('mouseleave', () => this._hideTooltip());
      g.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (this._clickCb) this._clickCb(atom);
      });

      this.layer.appendChild(g);

      this._chips.push({
        atom,
        region,
        x: 0,
        y: 0,
        w,
        h,
        group: g,
        rect,
        outerRect,
        overlay,
        bottomLine,
        text,
        strike,
        badgeBg,
        badgeText,
      });
    }

    // Tooltip cleanup on scroll/resize (keeps it pinned correctly).
    window.addEventListener('scroll', this._onScroll, true);
    window.addEventListener('resize', this._onScroll);
  }

  _regionForAtomLocal(atom) {
    const v = new Set(atom.variants || []);
    const o = v.has('oob'), m = v.has('mcp'), e = v.has('enhanced');
    if (o && m && e) return 'all_three';
    if (o && m) return 'oob_mcp';
    if (m && e) return 'mcp_enhanced';
    if (o && e) return 'oob_enhanced';
    if (o) return 'oob_only';
    if (m) return 'mcp_only';
    if (e) return 'enhanced_only';
    return null;
  }

  // ---------------------------------------------------------------------
  // Force-directed layout per region.
  // ---------------------------------------------------------------------
  _layout() {
    // Group chips by region.
    const byRegion = {};
    for (const c of this._chips) {
      (byRegion[c.region] ||= []).push(c);
    }

    // Initial seed positions: distribute chips on a small grid centered
    // on the region centroid. Grid layout converges much faster than a
    // ring for >6 chips because chips of width ~150 don't fit on a small
    // ring without massive overlap.
    for (const region of Object.keys(byRegion)) {
      const center = this.lobes.regionCenter(region);
      const list = byRegion[region];
      const n = list.length;
      // Choose column count: 1 for n<=2, 2 for n<=6, 3 otherwise.
      const cols = n <= 2 ? 1 : n <= 6 ? 2 : 3;
      const rows = Math.ceil(n / cols);
      const colStep = (CHIP_MAX_WIDTH * 0.55);
      const rowStep = (CHIP_HEIGHT + 6);
      list.forEach((c, i) => {
        const r = Math.floor(i / cols);
        const col = i % cols;
        const x0 = center.x + (col - (cols - 1) / 2) * colStep;
        const y0 = center.y + (r - (rows - 1) / 2) * rowStep;
        c.x = x0;
        c.y = y0;
      });

      this._runForcePass(list, center);

      // Iterative clamp + resolve. Each round: clamp out-of-region chips
      // toward the centroid, then run a non-springy overlap-resolve pass.
      // Repeat until stable (or budget exhausted).
      for (let round = 0; round < 6; round++) {
        let anyClamped = false;
        for (const c of list) {
          if (this._clampToRegion(c, region, center)) anyClamped = true;
        }
        const moved = this._runResolvePass(list);
        if (!anyClamped && !moved) break;
      }
      // Final clamp pass — guarantee in-region (may re-overlap slightly,
      // but bounded by region size).
      for (const c of list) {
        this._clampToRegion(c, region, center);
      }
    }
  }

  _runForcePass(list, center) {
    const n = list.length;
    if (n === 0) return;
    for (let iter = 0; iter < FD_ITERATIONS; iter++) {
      const alpha = 1 - iter / FD_ITERATIONS;
      // Mutual repulsion based on bbox overlap.
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = list[i], b = list[j];
          const v = overlapVector(a, b);
          if (!v) continue;
          const fx = v.x * FD_REPULSION_K * alpha;
          const fy = v.y * FD_REPULSION_K * alpha;
          a.x += fx;
          a.y += fy;
          b.x -= fx;
          b.y -= fy;
        }
      }
      // Centroid spring: pull each chip toward the region centroid.
      for (const c of list) {
        c.x += (center.x - c.x) * FD_CENTROID_K;
        c.y += (center.y - c.y) * FD_CENTROID_K;
      }
    }
  }

  _runResolvePass(list) {
    const n = list.length;
    let everMoved = false;
    for (let iter = 0; iter < 60; iter++) {
      let moved = false;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = list[i], b = list[j];
          const v = overlapVector(a, b);
          if (!v) continue;
          a.x += v.x * 0.5;
          a.y += v.y * 0.5;
          b.x -= v.x * 0.5;
          b.y -= v.y * 0.5;
          moved = true;
          everMoved = true;
        }
      }
      if (!moved) break;
    }
    return everMoved;
  }

  // Returns true if the chip needed clamping.

  // Walk the chip's center toward the region centroid in small steps until
  // regionContains() reports true. Cap iterations so a chip never gets
  // lost if its region happens to be empty (it won't, but be safe).
  _clampToRegion(c, regionKey, center) {
    if (!this.lobes || typeof this.lobes.regionContains !== 'function') return false;
    if (this.lobes.regionContains(regionKey, c.x, c.y)) return false;
    let steps = 0;
    while (steps < 30 && !this.lobes.regionContains(regionKey, c.x, c.y)) {
      c.x += (center.x - c.x) * 0.18;
      c.y += (center.y - c.y) * 0.18;
      steps++;
    }
    if (!this.lobes.regionContains(regionKey, c.x, c.y)) {
      // Last resort: snap to the centroid.
      c.x = center.x;
      c.y = center.y;
    }
    return true;
  }

  // ---------------------------------------------------------------------
  // Render: write final coords into SVG attributes.
  // ---------------------------------------------------------------------
  _render() {
    for (const c of this._chips) {
      const left = c.x - c.w / 2;
      const top = c.y - c.h / 2;
      // Use transform on the group for active-state scaling later.
      c.group.setAttribute('transform', `translate(${left.toFixed(2)} ${top.toFixed(2)})`);

      c.rect.setAttribute('x', '0');
      c.rect.setAttribute('y', '0');
      c.rect.setAttribute('width', c.w.toFixed(2));
      c.rect.setAttribute('height', c.h.toFixed(2));

      if (c.outerRect) {
        c.outerRect.setAttribute('x', '-1.5');
        c.outerRect.setAttribute('y', '-1.5');
        c.outerRect.setAttribute('width', (c.w + 3).toFixed(2));
        c.outerRect.setAttribute('height', (c.h + 3).toFixed(2));
      }

      if (c.overlay) {
        c.overlay.setAttribute('x', '0');
        c.overlay.setAttribute('y', '0');
        c.overlay.setAttribute('width', c.w.toFixed(2));
        c.overlay.setAttribute('height', c.h.toFixed(2));
      }

      if (c.bottomLine) {
        c.bottomLine.setAttribute('x1', '6');
        c.bottomLine.setAttribute('x2', (c.w - 6).toFixed(2));
        c.bottomLine.setAttribute('y1', (c.h - 3).toFixed(2));
        c.bottomLine.setAttribute('y2', (c.h - 3).toFixed(2));
      }

      // Text + (optional) badge layout. If there's a citation badge, the
      // text sits left and the badge sits flush to the right.
      const hasCite = !!c.atom.citation;
      const badgeText = c.badgeText ? c.badgeText.textContent : '';
      const badgeW = hasCite ? Math.max(20, badgeText.length * 4.2 + 6) : 0;
      const textRight = c.w - CHIP_PAD_X - (hasCite ? badgeW + 6 : 0);

      c.text.setAttribute('x', String(CHIP_PAD_X));
      c.text.setAttribute('y', (c.h / 2).toFixed(2));
      // Truncate with native SVG: clip-path is overkill — instead, if the
      // text width estimate exceeds available width, drop characters.
      const maxChars = Math.floor((textRight - CHIP_PAD_X) / CHAR_WIDTH);
      const txt = c.atom.claim_short || '';
      if (txt.length > maxChars && maxChars > 4) {
        c.text.textContent = txt.slice(0, maxChars - 1) + '…';
      }

      if (c.strike) {
        c.strike.setAttribute('x1', '6');
        c.strike.setAttribute('x2', (textRight).toFixed(2));
        c.strike.setAttribute('y1', (c.h / 2).toFixed(2));
        c.strike.setAttribute('y2', (c.h / 2).toFixed(2));
      }

      if (c.badgeBg && c.badgeText) {
        const bx = c.w - CHIP_PAD_X - badgeW + 4;
        c.badgeBg.setAttribute('x', bx.toFixed(2));
        c.badgeBg.setAttribute('y', '4');
        c.badgeBg.setAttribute('width', badgeW.toFixed(2));
        c.badgeBg.setAttribute('height', (c.h - 8).toFixed(2));
        c.badgeText.setAttribute('x', (bx + 3).toFixed(2));
        c.badgeText.setAttribute('y', (c.h / 2).toFixed(2));
      }
    }
  }

  // ---------------------------------------------------------------------
  // Activeness / ghosting.
  // ---------------------------------------------------------------------
  _applyActiveness(c, activeness) {
    // active = 1.0 → full opacity & scale; ghosted scales to 0.92, fades.
    const opacity = 0.32 + 0.68 * activeness;
    const scale = 0.92 + 0.08 * activeness;
    const left = c.x - c.w / 2;
    const top = c.y - c.h / 2;
    // Apply a translate to position + a scale around the chip center.
    // Simpler: translate(left, top) scale(s) translate(-cx*(1-1/s), ...)
    // Keep it readable: translate to chip top-left, then scale, then
    // counter-translate so the chip stays centered.
    const cx = c.w / 2;
    const cy = c.h / 2;
    const tx = left + cx - cx * scale;
    const ty = top + cy - cy * scale;
    c.group.setAttribute('transform', `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(3)})`);
    c.group.style.opacity = String(opacity);
    c.group.classList.toggle('chip-active', activeness > 0.5);
    c.group.classList.toggle('chip-ghost', activeness <= 0.5);
  }

  // ---------------------------------------------------------------------
  // Tooltip (HTML overlay positioned over SVG using getBoundingClientRect).
  // ---------------------------------------------------------------------
  _ensureTooltip() {
    if (this._tooltip) return this._tooltip;
    const el = document.createElement('div');
    el.className = 'chip-tooltip';
    el.setAttribute('role', 'tooltip');
    el.style.position = 'absolute';
    el.style.pointerEvents = 'none';
    el.style.opacity = '0';
    document.body.appendChild(el);
    this._tooltip = el;
    return el;
  }

  _showTooltip(atom, group) {
    const el = this._ensureTooltip();
    const correctness = atom.correctness || '';
    const cite = atom.citation
      ? `<span class="chip-tooltip-cite">${escapeHtml(atom.citation)}</span>`
      : `<span class="chip-tooltip-cite chip-tooltip-cite-none">no citation</span>`;
    el.innerHTML = `
      <div class="chip-tooltip-head">
        <span class="chip-tooltip-correctness chip-tooltip-correctness-${escapeAttr(correctness)}">${escapeHtml(correctness)}</span>
        ${cite}
      </div>
      <div class="chip-tooltip-claim">${escapeHtml(atom.claim_full || atom.claim_short || '')}</div>
      <div class="chip-tooltip-truth">
        <span class="chip-tooltip-label">Verified:</span>
        ${escapeHtml(atom.verified_truth || '—')}
      </div>
    `;
    // Lift the chip a touch on hover.
    group.classList.add('chip-hover');
    this._activeHoverGroup = group;
    this._positionTooltipOver(group);
    el.style.opacity = '1';
  }

  _hideTooltip() {
    if (this._activeHoverGroup) {
      this._activeHoverGroup.classList.remove('chip-hover');
      this._activeHoverGroup = null;
    }
    if (this._tooltip) this._tooltip.style.opacity = '0';
  }

  _removeTooltip() {
    if (this._tooltip && this._tooltip.parentNode) {
      this._tooltip.parentNode.removeChild(this._tooltip);
    }
    this._tooltip = null;
  }

  _onMove(ev) {
    if (!this._tooltip || this._tooltip.style.opacity === '0') return;
    if (this._activeHoverGroup) this._positionTooltipOver(this._activeHoverGroup);
  }

  _onScroll() {
    if (this._activeHoverGroup) this._positionTooltipOver(this._activeHoverGroup);
  }

  _positionTooltipOver(group) {
    if (!this._tooltip) return;
    const rect = group.getBoundingClientRect();
    const tip = this._tooltip;
    // Place above the chip; if it would clip, place below.
    const tipRect = tip.getBoundingClientRect();
    const margin = 10;
    let top = rect.top + window.scrollY - tipRect.height - margin;
    let left = rect.left + window.scrollX + rect.width / 2 - tipRect.width / 2;
    if (top < window.scrollY + 8) {
      top = rect.bottom + window.scrollY + margin;
    }
    // Keep on-screen horizontally.
    const minLeft = window.scrollX + 8;
    const maxLeft = window.scrollX + document.documentElement.clientWidth - tipRect.width - 8;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
  }
}

// -------- helpers ----------------------------------------------------------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}
function escapeAttr(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '_');
}

export default Chips;
