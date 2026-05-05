// scenario-payload.js — single unified loader for any scenario detail view.
//
// All views (mockup-hybrid, mockup-b-scrubber, future variants) call
// loadScenarioPayload(id) and read whatever fields they need from the
// returned payload. New views can mix-and-match without re-implementing
// the fetch / merge / derivation logic.
//
// Sources fetched, in this order:
//   /data/scenarios.json            — meta (label, address, neighborhood, etc.)
//   /data/three-column-state.json   — verbatim responses, scores, rationale
//   /data/atoms/<id>.json           — atomized claims (optional)
//
// Returned shape (see SCHEMA notes below). Designed so that a view can
// render a partial UI if some fields are missing — e.g. atoms is [] for
// scenarios that haven't been atomized; variants entries are null for
// variants without recorded responses.

// ───────────────────────────────────────────────────────────────────────
// Region-of-Venn helper (used by the hybrid view's Lobes / Chips modules).
// Re-exported here so the lib module is the single import surface.
// ───────────────────────────────────────────────────────────────────────
export function regionForAtom(atom) {
  const v = new Set(atom && atom.variants ? atom.variants : []);
  const o = v.has('oob');
  const m = v.has('mcp');
  const e = v.has('enhanced');
  if (o && m && e) return 'all_three';
  if (o && m && !e) return 'oob_mcp';
  if (o && !m && e) return 'oob_enhanced';
  if (!o && m && e) return 'mcp_enhanced';
  if (o && !m && !e) return 'oob_only';
  if (!o && m && !e) return 'mcp_only';
  if (!o && !m && e) return 'enhanced_only';
  return null;
}

// ───────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────
const POSITIONS = [
  { idx: 0, variantId: 'oob',      col: 'col1',
    label: 'Out-of-Box',  desc: 'just a chatbot',
    metaData: 'none',     metaPrompt: "user's words" },
  { idx: 1, variantId: 'mcp',      col: 'col2',
    label: '+ City Data', desc: 'MCP to PortlandMaps + PCC',
    metaData: 'PortlandMaps + PCC', metaPrompt: "user's words" },
  { idx: 2, variantId: 'enhanced', col: 'col3',
    label: '+ Better Question', desc: 'resident-framed prompt',
    metaData: 'PortlandMaps + PCC + BDS guides', metaPrompt: 'enriched (resident-framed)' },
];

// Curated topic → human-readable question. Atoms produced by the
// atomization skill use these topic keys; unknown topics are humanized
// at runtime.
const TOPIC_LABELS = {
  zoning:      'What zone is the parcel?',
  size:        'Maximum size?',
  setbacks:    'Setback requirements?',
  permits:     'Which permits are required?',
  sequence:    'Permit sequence?',
  costs:       'Cost / SDC ballpark?',
  fees:        'Fees breakdown?',
  citations:   'Code sections cited?',
  definitions: 'Key definitions?',
  trees:       'Tree code (Title 11)?',
  signs:       'Sign rules (Title 32)?',
  sewer:       'Sewer / stormwater?',
  electrical:  'Electrical code?',
  plumbing:    'Plumbing code?',
  hvac:        'HVAC / mechanical code?',
  structural:  'Structural requirements?',
  process:     'Process / next steps?',
  safety:      'Safety / fire?',
  address:     'Address-specific data?',
  other:       'Other considerations?',
};

const CORRECT_KINDS = new Set([
  'correct', 'correct-action', 'correct-range', 'correct-judg',
  'correct-vague', 'hedge-correct', 'vague-correct', 'vague-action',
]);
const GAP_KINDS = new Set(['admitted-gap']);
const WRONG_KINDS = new Set(['WRONG', 'PARTIAL-WRONG']);

// ───────────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────────
const _cache = new Map();

export async function loadScenarioPayload(scenarioId) {
  if (!scenarioId) throw new Error('loadScenarioPayload: scenarioId required');
  if (_cache.has(scenarioId)) return _cache.get(scenarioId);

  // Fetch meta first — its address disambiguates the three-column-state
  // lookup when the same scenario id appears under multiple address keys
  // (only the canonical address typically has populated response data).
  const [meta, atoms] = await Promise.all([
    fetchScenarioMeta(scenarioId),
    fetchAtoms(scenarioId),
  ]);
  const slot = await fetchSlot(scenarioId, meta);

  const variants = buildVariants(slot, atoms);
  const subquestions = buildSubquestions(atoms);
  const citationsByPosition = buildCitationsByPosition(atoms);
  const gaugeByPosition = buildGaugeByPosition(variants, subquestions, citationsByPosition);

  const payload = {
    meta,
    question: {
      resident: meta ? composeResidentQuestion(meta) : '',
      enriched: slot && slot.enrichedQuestion ? slot.enrichedQuestion : null,
    },
    variants,
    atoms,
    derivations: {
      subquestions,
      citationsByPosition,
      gaugeByPosition,
    },
    // Convenience flags so views can short-circuit.
    hasAtoms:      Array.isArray(atoms) && atoms.length > 0,
    hasAnyResponse: variants.some(v => v && v.hasResponse),
  };

  _cache.set(scenarioId, payload);
  return payload;
}

// ───────────────────────────────────────────────────────────────────────
// Fetch helpers
// ───────────────────────────────────────────────────────────────────────
async function fetchScenarioMeta(scenarioId) {
  try {
    const resp = await fetch('/data/scenarios.json');
    if (!resp.ok) return null;
    const doc = await resp.json();
    const list = (doc && doc.scenarios) || [];
    return list.find(s => s.id === scenarioId) || null;
  } catch (_) { return null; }
}

async function fetchSlot(scenarioId, meta) {
  try {
    const resp = await fetch('/data/three-column-state.json');
    if (!resp.ok) return null;
    const state = await resp.json();
    // 1. Direct hit on the canonical address from scenarios.json — this is
    //    the slot the evaluator filled in.
    if (meta && meta.address && state[meta.address] && state[meta.address][scenarioId]) {
      return state[meta.address][scenarioId];
    }
    // 2. Any bucket whose slot has at least one populated response.
    for (const v of Object.values(state)) {
      if (v && typeof v === 'object' && v[scenarioId]) {
        const slot = v[scenarioId];
        const hasData = ['col1', 'col2', 'col3'].some(c =>
          slot[c] && typeof slot[c].response === 'string' && slot[c].response.trim());
        if (hasData) return slot;
      }
    }
    // 3. Fall back to the first occurrence (even if empty) so the question/
    //    enrichedQuestion meta is still available.
    for (const v of Object.values(state)) {
      if (v && typeof v === 'object' && v[scenarioId]) return v[scenarioId];
    }
  } catch (_) {}
  return null;
}

async function fetchAtoms(scenarioId) {
  try {
    const resp = await fetch(`/data/atoms/${scenarioId}.json`);
    if (!resp.ok) return [];
    const doc = await resp.json();
    return Array.isArray(doc.atoms) ? doc.atoms : [];
  } catch (_) {
    return [];
  }
}

// ───────────────────────────────────────────────────────────────────────
// Variant assembly
// ───────────────────────────────────────────────────────────────────────
function buildVariants(slot, atoms) {
  const out = POSITIONS.map(p => {
    const cd = (slot && slot[p.col]) ? slot[p.col] : null;
    const hasResponse = !!(cd && typeof cd.response === 'string' && cd.response.trim());
    if (!cd || !hasResponse) {
      return {
        id: p.variantId,
        position: p.idx,
        label: p.label,
        desc: p.desc,
        tool: '',
        model: '',
        response: '',
        scores: { usefulness: null, citationQuality: null,
                  audienceAppropriateness: null, composite: null },
        rationale: '',
        accuracyFlags: [],
        dataQualityNotes: '',
        metaData: p.metaData,
        metaPrompt: p.metaPrompt,
        hasResponse: false,
      };
    }
    const u = nullableInt(cd.usefulness);
    const c = nullableInt(cd.citationQuality);
    const aa = nullableInt(cd.audienceAppropriateness);
    const composite = (u != null && c != null && aa != null) ? (u + c + aa) : null;
    return {
      id: p.variantId,
      position: p.idx,
      label: p.label,
      desc: p.desc,
      tool: cd.tool || '',
      model: cd.model || '',
      response: cd.response,
      scores: { usefulness: u, citationQuality: c,
                audienceAppropriateness: aa, composite },
      rationale: cd.rationale || '',
      accuracyFlags: Array.isArray(cd.accuracyFlags) ? cd.accuracyFlags : [],
      dataQualityNotes: cd.dataQualityNotes || '',
      metaData: p.metaData,
      metaPrompt: p.metaPrompt,
      hasResponse: true,
    };
  });
  return out;
}

function nullableInt(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ───────────────────────────────────────────────────────────────────────
// Subquestion derivation
// Group atoms by topic; for each topic emit one sub-question with
// per-position state ("empty" | "vague" | "specific" | "gap").
// Returned sorted by max-importance descending; capped at 12 items.
// ───────────────────────────────────────────────────────────────────────
function buildSubquestions(atoms) {
  if (!atoms || !atoms.length) return [];

  // Group atoms by topic key.
  const byTopic = new Map();
  for (const a of atoms) {
    const t = (a.topic || 'other').toLowerCase();
    if (!byTopic.has(t)) byTopic.set(t, []);
    byTopic.get(t).push(a);
  }

  const subs = [];
  for (const [topic, items] of byTopic.entries()) {
    const maxImportance = items.reduce((m, a) => Math.max(m, a.importance || 0), 0);
    const states = {};
    const aiSrc  = {};
    for (const p of POSITIONS) {
      const forVariant = items.filter(a =>
        Array.isArray(a.variants) && a.variants.includes(p.variantId));
      states[p.idx] = stateForVariant(forVariant);
      aiSrc[p.idx]  = sourceForVariant(forVariant);
    }
    subs.push({
      key: topic,
      q: TOPIC_LABELS[topic] || humanizeTopic(topic),
      maxImportance,
      states,
      aiSrc,
    });
  }

  // Sort: most important topics first; cap to 12.
  subs.sort((a, b) => b.maxImportance - a.maxImportance);
  return subs.slice(0, 12);
}

function stateForVariant(items) {
  if (!items.length) return { state: 'empty', a: '— not addressed —', truth: '', truthSrc: '' };

  // Pick the highest-importance, then most-specific atom in this topic
  // for this variant. That's the one we'll surface.
  const best = [...items].sort((a, b) => {
    if ((b.importance || 0) !== (a.importance || 0)) return (b.importance || 0) - (a.importance || 0);
    return (b.specificity || 0) - (a.specificity || 0);
  })[0];

  const corr = best.correctness || '';
  const spec = Number(best.specificity || 0);
  const isGap = GAP_KINDS.has(corr);
  const isWrong = WRONG_KINDS.has(corr);

  let state;
  if (isGap) state = 'gap';
  else if (isWrong) state = 'vague';
  else if (CORRECT_KINDS.has(corr) && spec >= 0.7) state = 'specific';
  else state = 'vague';

  return {
    state,
    a:        best.claim_short || best.claim_full || '',
    truth:    best.verified_truth || '',
    truthSrc: best.citation || '',
  };
}

function sourceForVariant(items) {
  if (!items.length) return '—';
  const cited = items.filter(a => a.citation);
  if (cited.length) return cited.map(a => a.citation).join(', ');
  return 'AI generality';
}

function humanizeTopic(topic) {
  if (!topic) return 'Other?';
  const w = topic.replace(/[-_]/g, ' ');
  return w.charAt(0).toUpperCase() + w.slice(1) + '?';
}

// ───────────────────────────────────────────────────────────────────────
// Citations by position
// ───────────────────────────────────────────────────────────────────────
function buildCitationsByPosition(atoms) {
  const out = [[], [], []];
  if (!atoms || !atoms.length) return out;

  for (const p of POSITIONS) {
    const seen = new Map(); // citation text -> {text, cls}
    for (const a of atoms) {
      if (!a.citation) continue;
      if (!Array.isArray(a.variants) || !a.variants.includes(p.variantId)) continue;
      const text = String(a.citation).trim();
      if (!text) continue;
      const cls = classifyCitation(text);
      if (!seen.has(text)) seen.set(text, { text, cls });
    }
    out[p.idx] = [...seen.values()];
  }
  return out;
}

function classifyCitation(text) {
  // 'specific': PCC / Title section refs
  // 'deep'   : BDS code guide, manual, brochure, administrative rule
  // 'vague'  : everything else (AI generality, "the city")
  if (/PCC\s*\d|Title\s*\d|\d{2}\.\d{2,}/i.test(text)) return 'specific';
  if (/PortlandMaps/i.test(text)) return 'specific';
  if (/code\s*guide|brochure|manual|admin(istrative)?\s*rule|BDS|BES|PBOT|trn-|swmm/i.test(text)) return 'deep';
  return 'vague';
}

// ───────────────────────────────────────────────────────────────────────
// Per-position gauge / readiness summary
// ───────────────────────────────────────────────────────────────────────
function buildGaugeByPosition(variants, subquestions, citationsByPosition) {
  return POSITIONS.map(p => {
    const v = variants[p.idx];
    const composite = v && v.scores ? v.scores.composite : null;
    const specCount = subquestions.filter(s => s.states[p.idx].state === 'specific').length;
    const gapCount  = subquestions.filter(s => s.states[p.idx].state === 'gap').length;
    const cites = citationsByPosition[p.idx] || [];
    const verifiableCites = cites.filter(c => c.cls !== 'vague').length;

    const tier = readinessTier(composite, specCount, p.idx);
    const pct = tier.pct;
    return {
      position: p.idx,
      composite,
      compositeStr: (composite != null) ? `${composite} / 9` : '–',
      pct,
      specCount,
      gapCount,
      verifiableCites,
      gaugeValue: tier.value,
      gaugeCls:   tier.cls,
      gaugeSmall: tier.small,
      walkawayCls: tier.walkawayCls,
      walkaway:   tier.walkaway,
      actMonday:  tier.actMonday,
      citeQuality: citeQualityLabel(cites),
      specificity: specCount === 0 ? 'low' : specCount < 4 ? 'medium' : specCount < 8 ? 'high' : 'highest',
    };
  });
}

function readinessTier(composite, specCount, posIdx) {
  // Use composite when present; fall back to specificity at the position.
  const score = (composite != null) ? composite : (specCount * 1.2);
  if (score < 4) {
    return {
      pct: 18, cls: 's-0', value: 'Speculative', walkawayCls: 'hot', actMonday: 'no',
      small: 'Vibes only — no specific numbers, no zone confirmation, no permit sequence.',
      walkaway: '"I think I can probably do something. Sounds like I need a permit. I\'ll just start designing."',
    };
  }
  if (score < 7) {
    return {
      pct: 62, cls: 's-1', value: 'Informed but stuck', walkawayCls: 'warn', actMonday: 'maybe',
      small: 'Specific numbers and citations. But the answer is dense and the sequence is unclear.',
      walkaway: '"OK, here are some specifics. But what do I file first, and how much will it cost?"',
    };
  }
  return {
    pct: 96, cls: 's-2', value: 'Ready Monday AM', walkawayCls: 'good', actMonday: 'yes',
    small: 'Plain language, sequenced steps, dollar ranges, residual gaps named honestly.',
    walkaway: '"I know my zone, my limits, my next calls, and which permits to file in what order."',
  };
}

function citeQualityLabel(cites) {
  const total = cites.length;
  if (!total) return 'none · 0/3';
  const deep = cites.filter(c => c.cls === 'deep').length;
  const spec = cites.filter(c => c.cls === 'specific').length;
  if (deep >= 2) return 'deep · 3/3';
  if (spec >= 1) return 'specific · 2/3';
  return 'vague · 1/3';
}

// ───────────────────────────────────────────────────────────────────────
// Question composition
// ───────────────────────────────────────────────────────────────────────
function composeResidentQuestion(meta) {
  const t = meta.template || '';
  if (t.includes('(x)')) return t.replace('(x)', meta.address || '');
  return meta.address ? `${t} (${meta.address})` : t;
}

// ───────────────────────────────────────────────────────────────────────
// Default export
// ───────────────────────────────────────────────────────────────────────
export default { loadScenarioPayload, regionForAtom };
