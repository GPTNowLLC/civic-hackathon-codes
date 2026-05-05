/**
 * orchestrator.js — W8 of the hybrid mockup.
 *
 * Owns the single source of truth for scrubber position and broadcasts it
 * to every visualization module. Wires cross-module interactions:
 *   - chip click   → ResponsePanel.pinAtom
 *   - phrase hover → chip + lobe region highlight
 *   - tally row hover → lobe + chip region highlight
 *   - scrubber commit → ?pos=N URL deep-link
 *
 * Mounted by mockup-hybrid.html as the only <script type="module">.
 *
 * Data flow: this view (and every other detail view) reads from
 * `lib/scenario-payload.js` — the unified loader. It returns a normalized
 * payload covering meta / variants / atoms / derivations. Modules that
 * pre-date the unification (ResponsePanel, etc.) get a small compat object
 * built from the unified payload.
 */

import { loadScenarioPayload, regionForAtom } from '../lib/scenario-payload.js';
import { Scrubber } from './scrubber.js';
import { Lobes } from './lobes.js';
import { Chips } from './chips.js';
import { Gauge } from './gauge.js';
import { Citations } from './citations.js';
import { Tally } from './tally.js';
import { ResponsePanel } from './response.js';
import { renderFallback } from './fallback.js';

// ---------- helpers --------------------------------------------------------

function clampPos(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 2) return 2;
  return n;
}

function readInitialPos() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('pos');
    if (raw == null) return 0;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(2, n));
  } catch (_) {
    return 0;
  }
}

function readScenarioId() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('scenario');
    if (!raw) return 'tiny-house';
    if (!/^[a-z0-9-]+$/i.test(raw)) return 'tiny-house';
    return raw;
  } catch (_) {
    return 'tiny-house';
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function applyHeader(meta) {
  if (!meta) {
    setText('page-title', 'Scenario detail');
    return;
  }
  setText('page-eyebrow',
    `PORTLAND CODE & REGULATION SEARCH ASSISTANT · SCENARIO ${meta.num || '?'}`);
  setText('page-title', meta.label || 'Scenario detail');
  const addressBits = [meta.address, meta.neighborhood].filter(Boolean);
  setText('page-address', addressBits.join(' · '));
}

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`orchestrator: missing #${id} container`);
  return el;
}

function showFatal(message) {
  const host = document.getElementById('response-host');
  const safe = String(message == null ? 'unknown error' : message)
    .replace(/[<>&]/g, ' ');
  if (host) {
    host.innerHTML = `
      <div style="
        padding: 20px;
        font-family: 'Fraunces', Georgia, serif;
        color: #6b3a36;
        background: #fdf3ef;
        border: 1px solid #d6a89f;
        border-radius: 8px;
        margin: 12px;
        font-size: 15px;
        line-height: 1.5;
      ">
        <strong>Could not load the scenario.</strong><br/>
        <span style="opacity:0.8; font-size: 13px;">${safe}</span>
      </div>
    `;
  }
  console.error('[hybrid] fatal:', message);
}

// ResponsePanel and a few other modules pre-date the unified payload.
// Build a small compat object that mirrors the legacy atoms-file shape
// (`{atoms, responses}`) so they keep working without modification.
function buildLegacyResponseData(payload) {
  const variants = payload.variants || [];
  const responses = {};
  for (const v of variants) {
    if (!v) continue;
    responses[v.id] = {
      tool: v.tool || v.label,
      text: v.response || '',
    };
  }
  return { atoms: payload.atoms || [], responses };
}

async function renderFallbackView(payload) {
  document.body.classList.add('has-fallback');
  const host = document.getElementById('fallback-detail');
  if (host) host.hidden = false;

  // Reconstruct the legacy "slot" shape the existing fallback renderer
  // expects (col1 / col2 / col3 + enrichedQuestion).
  const v = payload.variants || [];
  const slot = {
    col1: variantToColShape(v[0]),
    col2: variantToColShape(v[1]),
    col3: variantToColShape(v[2]),
    enrichedQuestion: payload.question && payload.question.enriched ? payload.question.enriched : '',
  };
  renderFallback(host, slot, payload.meta);
}

function variantToColShape(variant) {
  if (!variant) return {};
  return {
    tool:                    variant.tool,
    model:                   variant.model,
    response:                variant.response,
    usefulness:              variant.scores ? variant.scores.usefulness : null,
    citationQuality:         variant.scores ? variant.scores.citationQuality : null,
    audienceAppropriateness: variant.scores ? variant.scores.audienceAppropriateness : null,
    rationale:               variant.rationale,
    accuracyFlags:           variant.accuracyFlags,
    dataQualityNotes:        variant.dataQualityNotes,
  };
}

// ---------- main -----------------------------------------------------------

async function init() {
  const initialPos = readInitialPos();
  const scenarioId = readScenarioId();

  let payload;
  try {
    payload = await loadScenarioPayload(scenarioId);
  } catch (err) {
    showFatal(err && err.message ? err.message : err);
    return;
  }
  console.info(`[hybrid] scenario=${scenarioId} hasAtoms=${payload.hasAtoms} hasAnyResponse=${payload.hasAnyResponse}`);

  applyHeader(payload.meta);

  // No atoms = fall back to the three-card view (or "not yet evaluated"
  // notice if the slot is empty too). That fallback handles both cases.
  if (!payload.hasAtoms) {
    await renderFallbackView(payload);
    return;
  }

  const atoms = payload.atoms;
  const legacyData = buildLegacyResponseData(payload);

  // Resolve container references per the HTML's documented contract.
  const scrubberHost   = $('scrubber-host');
  const lobesSvg       = $('lobes-svg');
  const chipsLayer     = $('chips-layer');
  const responseHost   = $('response-host');
  const gaugeHost      = $('gauge-host');
  const citationsHost  = $('citations-host');
  const tallyPanelHost = $('tally-panel-host');
  const tallyTapeHost  = $('tally-tape-host');

  // Mount visualization modules first.
  const lobes = new Lobes(lobesSvg, { width: 1000, height: 800 });
  const chips = new Chips(chipsLayer, atoms, lobes, { width: 1000, height: 800 });
  const gauge     = new Gauge(gaugeHost);
  const citations = new Citations(citationsHost, atoms);
  const tally     = new Tally(tallyPanelHost, tallyTapeHost, atoms);
  const response  = new ResponsePanel(responseHost, legacyData);

  // ---- state -------------------------------------------------------------
  let position = initialPos;

  // ---- broadcast (rAF-throttled) -----------------------------------------
  let rafPending = false;
  let pendingPos = position;
  function scheduleBroadcast(pos) {
    pendingPos = pos;
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const p = pendingPos;
      position = p;
      lobes.setPosition(p);
      chips.setPosition(p);
      gauge.setPosition(p);
      citations.setPosition(p);
      tally.setPosition(p);
      response.setPosition(p);
    });
  }

  // ---- highlights --------------------------------------------------------
  function setRegionHighlight(regionKey) {
    lobes.highlight(regionKey);
    chips.highlight(regionKey);
    tally.highlight(regionKey);
  }

  // ---- chip clicks → pin -------------------------------------------------
  chips.onClick((atom) => {
    if (atom && atom.id) response.pinAtom(atom.id);
  });

  // ---- phrase hover → region highlight -----------------------------------
  response.onPhraseHover((atomId) => {
    if (!atomId) {
      setRegionHighlight(null);
      return;
    }
    const atom = atoms.find(a => a.id === atomId);
    if (!atom) {
      setRegionHighlight(null);
      return;
    }
    const region = regionForAtom(atom);
    if (region) setRegionHighlight(region);
  });

  // ---- tally row/segment hover → region highlight ------------------------
  function wireRegionHoverDelegate(rootEl, selector) {
    rootEl.addEventListener('mouseover', (ev) => {
      const target = ev.target.closest(selector);
      if (!target || !rootEl.contains(target)) return;
      const region = target.getAttribute('data-region');
      if (!region) return;
      lobes.highlight(region);
      chips.highlight(region);
    });
    rootEl.addEventListener('mouseout', (ev) => {
      const target = ev.target.closest(selector);
      if (!target) return;
      const next = ev.relatedTarget;
      if (next && target.contains(next)) return;
      lobes.highlight(null);
      chips.highlight(null);
    });
  }
  wireRegionHoverDelegate(tallyPanelHost, '.tally-row');
  wireRegionHoverDelegate(tallyTapeHost,  '.tally-tape-seg');

  // ---- scrubber LAST so its initial broadcast hits a fully-mounted page
  // eslint-disable-next-line no-unused-vars
  const scrubber = new Scrubber(scrubberHost, {
    initialPosition: initialPos,
    onPositionChange: (pos) => scheduleBroadcast(clampPos(pos)),
    onPositionCommit: (pos) => {
      const intPos = Math.max(0, Math.min(2, Math.round(pos)));
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('pos', String(intPos));
        history.replaceState(null, '', url.toString());
      } catch (_) {}
    },
  });

  // Initial broadcast.
  lobes.setPosition(initialPos);
  chips.setPosition(initialPos);
  gauge.setPosition(initialPos);
  citations.setPosition(initialPos);
  tally.setPosition(initialPos);
  response.setPosition(initialPos);

  console.info(`[hybrid] mounted. position=${initialPos} atoms=${atoms.length}`);

  window.__hybrid = {
    get position() { return position; },
    scrubber, lobes, chips, gauge, citations, tally, response, payload, atoms,
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
