// citations.js — horizontal citation provenance bar.
// Public API:
//   const c = new Citations(container, atoms);
//   c.setPosition(pos);   // pos in [0..2]
//
// Each unique citation across the atom corpus is rendered as a chip. Chips
// emerge in left-to-right strata as the scrubber crosses thresholds tied to
// which AI variant first contributed that citation:
//
//   "vague"    (OOB-only atoms with no citation)  -> visible at pos >= 0
//   "mcp"      (citation first introduced by MCP) -> visible at pos >= 0.5
//   "enhanced" (citation only in Enhanced)        -> visible at pos >= 1.5
//
// A chip can also appear earlier if its variant is already on (e.g. an MCP
// citation also held by Enhanced is "mcp" tier; a citation appearing only on
// Enhanced is "enhanced" tier).

const VARIANT_RANK = { oob: 0, mcp: 1, enhanced: 2 };

function variantTierFor(atomsForCitation) {
  // Return the lowest-rank variant that introduces this citation.
  let minRank = Infinity;
  for (const a of atomsForCitation) {
    for (const v of a.variants || []) {
      const r = VARIANT_RANK[v];
      if (r != null && r < minRank) minRank = r;
    }
  }
  if (minRank === 0) return "oob";
  if (minRank === 1) return "mcp";
  if (minRank === 2) return "enhanced";
  return "mcp";
}

// Threshold below which a chip is hidden / above which it's revealed.
function thresholdForTier(tier) {
  if (tier === "oob") return 0;     // visible immediately
  if (tier === "mcp") return 0.5;   // emerges as MCP comes online
  if (tier === "enhanced") return 1.5; // emerges as Enhanced comes online
  return 0.5;
}

// Group atoms into "citation buckets". An OOB atom with no citation collapses
// into a single shared "vague" chip.
function buildChips(atoms) {
  const byCitation = new Map();
  let vagueAtoms = [];

  for (const a of atoms) {
    const cite = a.citation;
    const isOOBNoCite = (!cite) && (a.variants || []).length === 1 && a.variants[0] === "oob";
    if (isOOBNoCite) {
      vagueAtoms.push(a);
      continue;
    }
    if (!cite) continue; // skip atoms with no formal citation that aren't OOB-only
    if (!byCitation.has(cite)) byCitation.set(cite, []);
    byCitation.get(cite).push(a);
  }

  const chips = [];
  if (vagueAtoms.length) {
    chips.push({
      key: "__vague__",
      label: "(no citation)",
      tier: "oob",
      style: "vague",
      threshold: 0,
      atomCount: vagueAtoms.length,
    });
  }

  // Sort citations: PCC first (mono+amber), then proper-name authorities
  // (mono+authority badge), then anything else. Within a group, alpha.
  const entries = [...byCitation.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [cite, list] of entries) {
    const tier = variantTierFor(list);
    const isPCC = /^PCC\b/i.test(cite) || /^Title\b/i.test(cite);
    const style = tier === "enhanced" && !isPCC ? "authority"
                : isPCC ? "code"
                : tier === "mcp" ? "code"
                : "authority";
    chips.push({
      key: cite,
      label: cite,
      tier,
      style,
      threshold: thresholdForTier(tier),
      atomCount: list.length,
    });
  }

  // Stable order: vague first, then code (PCC), then authorities, each by tier
  chips.sort((a, b) => {
    if (a.style === "vague") return -1;
    if (b.style === "vague") return 1;
    if (a.style !== b.style) {
      // code before authority
      return a.style === "code" ? -1 : 1;
    }
    return a.label.localeCompare(b.label);
  });

  return chips;
}

export class Citations {
  constructor(container, atoms) {
    if (!container) throw new Error("Citations: container required");
    this.container = container;
    this.container.classList.add("citations-root");
    this.atoms = Array.isArray(atoms) ? atoms : [];
    this.chips = buildChips(this.atoms);
    this._currentPos = 0;
    this._build();
    this.setPosition(0);
  }

  _build() {
    const root = this.container;
    root.innerHTML = `
      <div class="citations-header">
        <span class="citations-title">Citations</span>
        <span class="citations-meta" data-role="meta">0 / ${this.chips.length}</span>
      </div>
      <div class="citations-track" data-role="track"></div>
    `;
    this._track = root.querySelector('[data-role="track"]');
    this._meta = root.querySelector('[data-role="meta"]');

    // Stagger transition delay so chips emerge left-to-right when activated.
    this.chips.forEach((chip, idx) => {
      const el = document.createElement("span");
      el.className = `citations-chip citations-chip-${chip.style}`;
      el.dataset.tier = chip.tier;
      el.dataset.key = chip.key;
      el.style.transitionDelay = `${(idx % 6) * 30}ms`;

      // Label text + (optional) authority/count badge
      const labelEl = document.createElement("span");
      labelEl.className = "citations-chip-label";
      labelEl.textContent = chip.label;
      el.appendChild(labelEl);

      if (chip.style === "authority") {
        const badge = document.createElement("span");
        badge.className = "citations-chip-badge";
        badge.textContent = "authority";
        el.appendChild(badge);
      } else if (chip.atomCount > 1) {
        const badge = document.createElement("span");
        badge.className = "citations-chip-count";
        badge.textContent = `×${chip.atomCount}`;
        el.appendChild(badge);
      }

      this._track.appendChild(el);
      chip._el = el;
    });
  }

  setPosition(pos) {
    const p = Math.max(0, Math.min(2, pos));
    this._currentPos = p;
    let activeCount = 0;
    for (const chip of this.chips) {
      const active = p >= chip.threshold - 1e-6;
      if (active) activeCount += 1;
      // Smooth fade-in across a small window above the threshold so dragging
      // through 0.5 / 1.5 doesn't pop. window width ~0.25.
      const t = (p - chip.threshold) / 0.25;
      const opacity = active ? Math.max(0.35, Math.min(1, t * 0.7 + 0.5)) : 0;
      const translate = active ? "0px" : "-8px";
      const scale = active ? 1 : 0.9;
      const el = chip._el;
      if (!el) continue;
      el.style.opacity = opacity.toFixed(3);
      el.style.transform = `translateX(${translate}) scale(${scale})`;
      el.classList.toggle("is-active", active);
    }
    if (this._meta) {
      this._meta.textContent = `${activeCount} / ${this.chips.length}`;
    }
  }
}

export default Citations;
