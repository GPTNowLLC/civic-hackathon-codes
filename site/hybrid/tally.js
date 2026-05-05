// tally.js — region-count panel + proportional summary tape.
// Public API:
//   const t = new Tally(panelContainer, tapeContainer, atoms);
//   t.setPosition(pos);                // pos in [0..2]
//   t.highlight(regionKey | null);     // external (hover-driven) highlight

import { regionForAtom } from "./data.js";

const REGION_ORDER = [
  "oob_only",
  "oob_mcp",
  "all_three",
  "mcp_only",
  "mcp_enhanced",
  "enhanced_only",
  "oob_enhanced",
];

const REGION_LABELS = {
  oob_only:        "OOB only",
  mcp_only:        "MCP only",
  enhanced_only:   "Enhanced only",
  oob_mcp:         "OOB & MCP",
  mcp_enhanced:    "MCP & Enhanced",
  oob_enhanced:    "OOB & Enhanced",
  all_three:       "All three",
};

// Tints per spec — mixes pre-computed.
const REGION_TINTS = {
  oob_only:      "#c5524a", // red
  mcp_only:      "#c89a3a", // amber
  enhanced_only: "#5a8a4f", // moss
  oob_mcp:       "#c67342", // terracotta
  mcp_enhanced:  "#9a924a", // amber-moss blend
  oob_enhanced:  "#85723e", // muted earth
  all_three:     "#5b5346", // neutral charcoal
};

// Position-driven emphasis: which region is "spotlit" at each scrubber stop.
const POS_TO_REGION = ["oob_only", "mcp_enhanced", "enhanced_only"];

function emphasisFor(pos, regionKey) {
  // Returns a 0..1 weight for how spotlit this region is at the given pos.
  const p = Math.max(0, Math.min(2, pos));
  // Distance in "stop units" (each stop is 1.0 wide) from this region's stop.
  const targetStop = POS_TO_REGION.indexOf(regionKey);
  if (targetStop < 0) {
    // Not a primary stop region — give it modest emphasis whenever it's
    // adjacent in pos. We linearly fall off from 0.4 at the nearest stop.
    let bestDist = 2;
    for (let i = 0; i < POS_TO_REGION.length; i++) {
      bestDist = Math.min(bestDist, Math.abs(p - i));
    }
    return Math.max(0, 0.35 * (1 - bestDist));
  }
  const dist = Math.abs(p - targetStop);
  if (dist >= 1) return 0;
  return 1 - dist; // linear taper
}

export class Tally {
  constructor(panelContainer, tapeContainer, atoms) {
    if (!panelContainer) throw new Error("Tally: panelContainer required");
    if (!tapeContainer) throw new Error("Tally: tapeContainer required");
    this.panelContainer = panelContainer;
    this.tapeContainer = tapeContainer;
    this.atoms = Array.isArray(atoms) ? atoms : [];
    this.counts = this._computeCounts();
    this._highlight = null;
    this._currentPos = 0;
    this.panelContainer.classList.add("tally-panel-root");
    this.tapeContainer.classList.add("tally-tape-root");
    this._buildPanel();
    this._buildTape();
    this.setPosition(0);
  }

  _computeCounts() {
    const counts = {};
    for (const k of REGION_ORDER) counts[k] = 0;
    for (const atom of this.atoms) {
      const r = regionForAtom(atom);
      if (r && r in counts) counts[r] += 1;
    }
    return counts;
  }

  _buildPanel() {
    const total = REGION_ORDER.reduce((s, k) => s + (this.counts[k] || 0), 0);
    const root = this.panelContainer;
    root.innerHTML = `
      <div class="tally-header">
        <span class="tally-title">Where the claims live</span>
        <span class="tally-total">${total} claims</span>
      </div>
      <ul class="tally-list" data-role="list"></ul>
    `;
    const list = root.querySelector('[data-role="list"]');
    this._rows = {};
    for (const key of REGION_ORDER) {
      const count = this.counts[key] || 0;
      const li = document.createElement("li");
      li.className = "tally-row";
      li.dataset.region = key;
      if (count === 0) li.classList.add("is-empty");
      li.style.setProperty("--tally-tint", REGION_TINTS[key]);
      li.innerHTML = `
        <span class="tally-row-bar" aria-hidden="true"></span>
        <span class="tally-row-label">${REGION_LABELS[key]}</span>
        <span class="tally-row-count">${count}</span>
      `;
      li.addEventListener("mouseenter", () => this._onRowHover(key));
      li.addEventListener("mouseleave", () => this._onRowHover(null));
      list.appendChild(li);
      this._rows[key] = li;
    }
  }

  _buildTape() {
    const total = REGION_ORDER.reduce((s, k) => s + (this.counts[k] || 0), 0);
    const root = this.tapeContainer;
    root.innerHTML = `
      <div class="tally-tape-label">Distribution of claims across the seven regions</div>
      <div class="tally-tape-bar" data-role="bar"></div>
      <div class="tally-tape-legend" data-role="legend"></div>
    `;
    const bar = root.querySelector('[data-role="bar"]');
    const legend = root.querySelector('[data-role="legend"]');
    this._segments = {};
    for (const key of REGION_ORDER) {
      const count = this.counts[key] || 0;
      const pct = total > 0 ? (count / total) * 100 : 0;
      const seg = document.createElement("div");
      seg.className = "tally-tape-seg";
      seg.dataset.region = key;
      if (count === 0) seg.classList.add("is-empty");
      seg.style.flexBasis = `${pct}%`;
      seg.style.background = REGION_TINTS[key];
      // Show count number when segment is wide enough; CSS will hide if too narrow.
      seg.innerHTML = `<span class="tally-tape-num">${count}</span>`;
      seg.title = `${REGION_LABELS[key]}: ${count}`;
      seg.addEventListener("mouseenter", () => this._onRowHover(key));
      seg.addEventListener("mouseleave", () => this._onRowHover(null));
      bar.appendChild(seg);
      this._segments[key] = seg;

      if (count > 0) {
        const li = document.createElement("span");
        li.className = "tally-tape-legend-item";
        li.innerHTML = `
          <span class="tally-tape-legend-swatch" style="background:${REGION_TINTS[key]}"></span>
          <span>${REGION_LABELS[key]}</span>
        `;
        legend.appendChild(li);
      }
    }
  }

  _onRowHover(regionKey) {
    // Internal hover-driven highlight. Orchestrator may also call highlight()
    // for cross-component coordination.
    this.highlight(regionKey);
    if (this._onHover) this._onHover(regionKey);
  }

  /** Set an external (e.g. hover-from-lobes) highlight. Pass null to clear. */
  highlight(regionKey) {
    this._highlight = regionKey || null;
    this._render();
  }

  setPosition(pos) {
    this._currentPos = Math.max(0, Math.min(2, pos));
    this._render();
  }

  _render() {
    const pos = this._currentPos;
    for (const key of REGION_ORDER) {
      const row = this._rows && this._rows[key];
      const seg = this._segments && this._segments[key];
      const emphasis = emphasisFor(pos, key);
      const isHL = this._highlight === key;
      const score = isHL ? 1 : emphasis;

      if (row) {
        row.style.setProperty("--tally-emphasis", score.toFixed(3));
        row.classList.toggle("is-emphasized", score > 0.55);
        row.classList.toggle("is-highlight", isHL);
      }
      if (seg) {
        seg.style.setProperty("--tally-emphasis", score.toFixed(3));
        seg.classList.toggle("is-emphasized", score > 0.55);
        seg.classList.toggle("is-highlight", isHL);
      }
    }
  }
}

export default Tally;
