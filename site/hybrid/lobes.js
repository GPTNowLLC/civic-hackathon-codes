/**
 * Morphing Venn Lobes — W3 of the hybrid mockup.
 *
 * Three soft, organic, Venn-correct lobes rendered in SVG. Lobe centers
 * are FIXED — only their radii morph based on scrubber position. Region
 * centroids returned by `regionCenter` come from the IDEALIZED Venn
 * (full-radius circles) so chip placement stays stable across positions.
 *
 * Public API:
 *   new Lobes(svgElement, { width, height, seed })
 *   setPosition(pos)         // 0..2 fractional, animates
 *   regionCenter(regionKey)  // {x,y} stable centroid
 *   regionContains(key, x, y)
 *   highlight(regionKey|null)
 *   getLobeBounds(variantId)
 */

const VARIANTS = ['oob', 'mcp', 'enhanced'];

const COLORS = {
  oob:      { line: '#c5524a', fill: '#c5524a' },
  mcp:      { line: '#c89a3a', fill: '#c89a3a' },
  enhanced: { line: '#5a8a4f', fill: '#5a8a4f' },
};

const LABELS = {
  oob:      { title: 'out-of-box',  sub: 'NO TOOLS' },
  mcp:      { title: '+ city data', sub: 'MCP DATA ACCESS' },
  enhanced: { title: '+ better question', sub: 'ENRICHED PROMPT' },
};

// Scrubber → target scale per variant.
const TARGET_SCALES = {
  // pos 0
  0: { oob: 1.00, mcp: 0.15, enhanced: 0.15 },
  1: { oob: 0.60, mcp: 1.00, enhanced: 0.20 },
  2: { oob: 0.45, mcp: 0.85, enhanced: 1.00 },
};

const GHOST_THRESHOLD = 0.30;

// Number of bezier control points around each lobe.
const LOBE_POINTS = 18;

// SVG namespace.
const NS = 'http://www.w3.org/2000/svg';

// -------- deterministic seeded noise ---------------------------------------
// Tiny mulberry32 PRNG → reproducible per-seed jitter.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Linear interpolation.
function lerp(a, b, t) { return a + (b - a) * t; }

// Catmull-Rom → cubic bezier path, closed loop.
function smoothClosedPath(points) {
  const n = points.length;
  if (n < 3) return '';
  let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d + ' Z';
}

export class Lobes {
  constructor(svgElement, opts = {}) {
    this.svg = svgElement;
    this.width = opts.width ?? 1000;
    this.height = opts.height ?? 800;
    this.seed = opts.seed ?? 42;
    // viewBox crop — by default, focus the visible window on the lobes
    // themselves and trim ~140px of dead vertical space + ~60px each side.
    // Internal geometry still uses width/height; only the rendered window changes.
    this.viewBox = opts.viewBox ?? { x: 90, y: 110, w: 820, h: 600 };

    // --- Geometry. Equilateral triangle of lobe centers, fixed. ----------
    // Visual center of the diagram.
    const cx = this.width / 2;
    const cy = this.height / 2 + 10;

    // Center-to-vertex of the triangle of lobe-centers.
    // Side length s; circumradius R = s / sqrt(3).
    const triangleSide = 240;
    const R = triangleSide / Math.sqrt(3); // ≈ 138.6

    // OOB top-left, MCP top-right, Enhanced bottom-center.
    // Equilateral with one vertex pointing DOWN.
    this.centers = {
      oob:      { x: cx - triangleSide / 2, y: cy - R / 2 },
      mcp:      { x: cx + triangleSide / 2, y: cy - R / 2 },
      enhanced: { x: cx,                    y: cy + R },
    };

    // Full-size lobe radius. Must satisfy r > side/2 for proper Venn-3
    // overlap (each pair intersects), but r < side*sqrt(3)/2 keeps the
    // outer arcs from swallowing the third center.
    this.fullRadius = 200;

    // Triangle centroid — used as the natural center of `all_three`.
    this.triCentroid = {
      x: (this.centers.oob.x + this.centers.mcp.x + this.centers.enhanced.x) / 3,
      y: (this.centers.oob.y + this.centers.mcp.y + this.centers.enhanced.y) / 3,
    };

    // --- Per-variant deterministic angular jitter (organic blob) ---------
    // Each control point gets a stable radius offset so the blob looks
    // hand-drawn but is identical across reloads.
    this.jitter = {};
    VARIANTS.forEach((v, vi) => {
      const rng = mulberry32(this.seed + vi * 1009);
      const offsets = [];
      for (let i = 0; i < LOBE_POINTS; i++) {
        // ±10% radius wobble + small angular phase shift.
        offsets.push({
          rMul: 0.92 + rng() * 0.16,
          phase: (rng() - 0.5) * 0.08,
        });
      }
      this.jitter[v] = offsets;
    });

    // --- Animation state -------------------------------------------------
    this.currentScale = { oob: 1.0, mcp: 0.15, enhanced: 0.15 };
    this.targetScale  = { oob: 1.0, mcp: 0.15, enhanced: 0.15 };
    this._raf = null;
    this._highlightKey = null;

    this._buildSvg();
    this._render();

    // Pre-compute idealized region centroids (depend on full-radius circles
    // and lobe centers — both fixed, so this never changes).
    this._regionCenters = this._computeRegionCenters();
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------
  setPosition(pos) {
    const p = Math.max(0, Math.min(2, pos));
    const lo = Math.floor(p);
    const hi = Math.min(2, lo + 1);
    const t = p - lo;
    const a = TARGET_SCALES[lo];
    const b = TARGET_SCALES[hi];
    VARIANTS.forEach(v => {
      this.targetScale[v] = lerp(a[v], b[v], t);
    });
    this._startTween();
  }

  regionCenter(regionKey) {
    const c = this._regionCenters[regionKey];
    if (!c) throw new Error(`Unknown region: ${regionKey}`);
    return { x: c.x, y: c.y };
  }

  regionContains(regionKey, x, y) {
    const inO = this._inCircle('oob', x, y);
    const inM = this._inCircle('mcp', x, y);
    const inE = this._inCircle('enhanced', x, y);
    switch (regionKey) {
      case 'oob_only':       return inO && !inM && !inE;
      case 'mcp_only':       return !inO && inM && !inE;
      case 'enhanced_only':  return !inO && !inM && inE;
      case 'oob_mcp':        return inO && inM && !inE;
      case 'mcp_enhanced':   return !inO && inM && inE;
      case 'oob_enhanced':   return inO && !inM && inE;
      case 'all_three':      return inO && inM && inE;
      default: return false;
    }
  }

  highlight(regionKey) {
    this._highlightKey = regionKey;
    this._applyHighlight();
  }

  getLobeBounds(variantId) {
    const c = this.centers[variantId];
    const r = this.fullRadius * (this.currentScale[variantId] || 0);
    return { cx: c.x, cy: c.y, r, x: c.x - r, y: c.y - r, w: 2 * r, h: 2 * r };
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------
  _inCircle(variant, x, y) {
    const c = this.centers[variant];
    const dx = x - c.x, dy = y - c.y;
    return dx * dx + dy * dy <= this.fullRadius * this.fullRadius;
  }

  _buildSvg() {
    const svg = this.svg;
    svg.classList.add('lobes-svg');
    const vb = this.viewBox;
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // <defs> with soft blur filter.
    const defs = document.createElementNS(NS, 'defs');
    const filter = document.createElementNS(NS, 'filter');
    filter.setAttribute('id', 'lobe-soft');
    filter.setAttribute('x', '-10%');
    filter.setAttribute('y', '-10%');
    filter.setAttribute('width', '120%');
    filter.setAttribute('height', '120%');
    const blur = document.createElementNS(NS, 'feGaussianBlur');
    blur.setAttribute('stdDeviation', '2');
    filter.appendChild(blur);
    defs.appendChild(filter);
    svg.appendChild(defs);

    // Group order: fills first (mix-blend-mode multiply), then strokes,
    // then labels on top.
    this.fillG = document.createElementNS(NS, 'g');
    this.fillG.setAttribute('class', 'lobe-fills');
    this.fillG.setAttribute('filter', 'url(#lobe-soft)');
    svg.appendChild(this.fillG);

    this.strokeG = document.createElementNS(NS, 'g');
    this.strokeG.setAttribute('class', 'lobe-strokes');
    svg.appendChild(this.strokeG);

    this.labelG = document.createElementNS(NS, 'g');
    this.labelG.setAttribute('class', 'lobe-labels');
    svg.appendChild(this.labelG);

    this.fills = {};
    this.strokes = {};
    this.labels = {};

    VARIANTS.forEach(v => {
      const fill = document.createElementNS(NS, 'path');
      fill.setAttribute('class', `lobe-fill lobe-fill-${v}`);
      fill.setAttribute('fill', COLORS[v].fill);
      fill.setAttribute('data-variant', v);
      this.fillG.appendChild(fill);
      this.fills[v] = fill;

      const stroke = document.createElementNS(NS, 'path');
      stroke.setAttribute('class', `lobe-stroke lobe-stroke-${v}`);
      stroke.setAttribute('stroke', COLORS[v].line);
      stroke.setAttribute('data-variant', v);
      this.strokeG.appendChild(stroke);
      this.strokes[v] = stroke;

      // Label group (text + sub-text).
      const lbl = document.createElementNS(NS, 'text');
      lbl.setAttribute('class', `lobe-label lobe-label-${v}`);
      lbl.setAttribute('fill', COLORS[v].line);
      lbl.setAttribute('data-variant', v);
      const ttl = document.createElementNS(NS, 'tspan');
      ttl.textContent = LABELS[v].title;
      lbl.appendChild(ttl);
      const sub = document.createElementNS(NS, 'tspan');
      sub.setAttribute('class', 'lobe-label-sub');
      sub.setAttribute('dy', '14');
      sub.setAttribute('x', '0');
      sub.textContent = LABELS[v].sub;
      lbl.appendChild(sub);
      this.labelG.appendChild(lbl);
      this.labels[v] = lbl;
    });

    // Position labels just outside each lobe along its outward radial.
    this._positionLabels();
  }

  _positionLabels() {
    VARIANTS.forEach(v => {
      const c = this.centers[v];
      const t = this.triCentroid;
      const dx = c.x - t.x, dy = c.y - t.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      const r = this.fullRadius;
      // Push label slightly outside the full lobe perimeter.
      const lx = c.x + ux * (r + 28);
      const ly = c.y + uy * (r + 28);
      const lbl = this.labels[v];
      lbl.setAttribute('x', lx.toFixed(1));
      lbl.setAttribute('y', ly.toFixed(1));
      // Anchor: right-side label anchors to start; left to end; bottom to middle.
      let anchor = 'middle';
      if (v === 'oob') anchor = 'end';
      else if (v === 'mcp') anchor = 'start';
      lbl.setAttribute('text-anchor', anchor);
      lbl.querySelectorAll('tspan').forEach((ts, i) => {
        if (i === 1) {
          ts.setAttribute('x', lx.toFixed(1));
        }
      });
    });
  }

  _lobePath(variant, scale) {
    const c = this.centers[variant];
    const r = this.fullRadius * scale;
    const jitter = this.jitter[variant];
    const points = [];
    for (let i = 0; i < LOBE_POINTS; i++) {
      const baseAngle = (i / LOBE_POINTS) * Math.PI * 2;
      const j = jitter[i];
      const angle = baseAngle + j.phase;
      const radius = r * j.rMul;
      points.push([c.x + Math.cos(angle) * radius, c.y + Math.sin(angle) * radius]);
    }
    return smoothClosedPath(points);
  }

  _render() {
    VARIANTS.forEach(v => {
      const scale = Math.max(0.001, this.currentScale[v]);
      const d = this._lobePath(v, scale);
      this.fills[v].setAttribute('d', d);
      this.strokes[v].setAttribute('d', d);

      const ghost = scale < GHOST_THRESHOLD;
      this.fills[v].classList.toggle('ghost', ghost);
      this.strokes[v].classList.toggle('ghost', ghost);
      this.labels[v].classList.toggle('ghost', ghost);
    });
    this._applyHighlight();
  }

  _applyHighlight() {
    const key = this._highlightKey;
    const lit = new Set();
    if (key) {
      const map = {
        oob_only: ['oob'],
        mcp_only: ['mcp'],
        enhanced_only: ['enhanced'],
        oob_mcp: ['oob', 'mcp'],
        mcp_enhanced: ['mcp', 'enhanced'],
        oob_enhanced: ['oob', 'enhanced'],
        all_three: ['oob', 'mcp', 'enhanced'],
      };
      (map[key] || []).forEach(v => lit.add(v));
    }
    this.svg.classList.toggle('highlight-active', !!key);
    VARIANTS.forEach(v => {
      const on = lit.has(v);
      this.fills[v].classList.toggle('lit', on);
      this.strokes[v].classList.toggle('lit', on);
    });
  }

  _startTween() {
    if (this._raf) return;
    const step = () => {
      let stillMoving = false;
      VARIANTS.forEach(v => {
        const cur = this.currentScale[v];
        const tgt = this.targetScale[v];
        const diff = tgt - cur;
        if (Math.abs(diff) > 0.0015) {
          // Ease toward target — ~7 frames to settle.
          this.currentScale[v] = cur + diff * 0.18;
          stillMoving = true;
        } else {
          this.currentScale[v] = tgt;
        }
      });
      this._render();
      if (stillMoving) {
        this._raf = requestAnimationFrame(step);
      } else {
        this._raf = null;
      }
    };
    this._raf = requestAnimationFrame(step);
  }

  // -------------------------------------------------------------------
  // Idealized region centroids.
  //
  // Standard Venn-3 with three congruent circles centered on an
  // equilateral triangle: the seven region centroids have closed-form
  // offsets from the triangle centroid. We use heuristic anchor points
  // chosen to land safely INSIDE each region (not on a boundary).
  //
  // For an equilateral triangle of lobe centers:
  //   • all_three: triangle centroid (lies inside all three discs).
  //   • {X}_only:  push from triangle centroid through center(X), well
  //                outside the other two discs.
  //   • {X}_{Y} (pair-only):  midpoint of centers(X,Y) pulled SLIGHTLY
  //                away from center(Z) so it leaves the all-three core.
  // -------------------------------------------------------------------
  _computeRegionCenters() {
    const t = this.triCentroid;
    const cO = this.centers.oob;
    const cM = this.centers.mcp;
    const cE = this.centers.enhanced;
    const r = this.fullRadius;

    // For "X only", anchor slightly past lobe-X's center, outward from
    // triangle centroid. The full-radius circles of the other two lobes
    // do NOT reach this far when the anchor is at distance ≈ r * 0.62
    // from cX (which is well inside lobe X but outside lobes Y,Z).
    const onlyOffset = r * 0.55;
    const onlyPoint = (cX) => {
      const dx = cX.x - t.x, dy = cX.y - t.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      return { x: cX.x + (dx / d) * onlyOffset, y: cX.y + (dy / d) * onlyOffset };
    };

    // For pair {X,Y} only: midpoint of cX,cY, then nudged OPPOSITE
    // direction from cZ (the excluded lobe).
    const pairPoint = (cX, cY, cZ) => {
      const mx = (cX.x + cY.x) / 2, my = (cX.y + cY.y) / 2;
      const vx = mx - cZ.x, vy = my - cZ.y;
      const d = Math.sqrt(vx * vx + vy * vy) || 1;
      // Nudge the midpoint a bit further away from cZ.
      const nudge = r * 0.18;
      return { x: mx + (vx / d) * nudge, y: my + (vy / d) * nudge };
    };

    return {
      oob_only:       onlyPoint(cO),
      mcp_only:       onlyPoint(cM),
      enhanced_only:  onlyPoint(cE),
      oob_mcp:        pairPoint(cO, cM, cE),
      mcp_enhanced:   pairPoint(cM, cE, cO),
      oob_enhanced:   pairPoint(cO, cE, cM),
      all_three:      { x: t.x, y: t.y },
    };
  }
}

export default Lobes;
