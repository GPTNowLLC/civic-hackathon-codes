// data.js — atom corpus loader for the hybrid mockup
// Exposes a Data API used by all other modules. Caches the fetched payload
// per scenario so repeated calls are cheap.

const REGION_KEYS = [
  "oob_only",
  "mcp_only",
  "enhanced_only",
  "oob_mcp",
  "mcp_enhanced",
  "oob_enhanced",
  "all_three",
];

const _cache = new Map();
let _current = null; // most recently loaded payload

/**
 * Determine which Venn region an atom belongs to based on its `variants`
 * membership array. Returns one of the 7 region keys.
 */
export function regionForAtom(atom) {
  const v = new Set(atom.variants || []);
  const o = v.has("oob");
  const m = v.has("mcp");
  const e = v.has("enhanced");
  if (o && m && e) return "all_three";
  if (o && m && !e) return "oob_mcp";
  if (o && !m && e) return "oob_enhanced";
  if (!o && m && e) return "mcp_enhanced";
  if (o && !m && !e) return "oob_only";
  if (!o && m && !e) return "mcp_only";
  if (!o && !m && e) return "enhanced_only";
  return null; // empty membership — not expected
}

/**
 * Async-load a scenario JSON file. Caches by scenario name; subsequent calls
 * with the same scenario short-circuit to the cached payload.
 *
 * @param {string} scenario  scenario slug, e.g. "tiny-house"
 * @returns {Promise<object>} full payload conforming to the §6 schema
 */
export async function load(scenario) {
  if (_cache.has(scenario)) {
    _current = _cache.get(scenario);
    return _current;
  }
  const url = `/data/atoms/${scenario}.json`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const err = new Error(`Data.load: failed to fetch ${url} (${resp.status})`);
    err.status = resp.status;
    throw err;
  }
  const payload = await resp.json();
  _cache.set(scenario, payload);
  _current = payload;
  return payload;
}

/** Return the atoms array from the most recently loaded payload. */
export function atoms() {
  if (!_current) return [];
  return _current.atoms || [];
}

/**
 * Return atoms whose variants list includes the given variant id.
 * @param {"oob"|"mcp"|"enhanced"} variantId
 */
export function atomsForVariant(variantId) {
  return atoms().filter((a) => Array.isArray(a.variants) && a.variants.includes(variantId));
}

/**
 * Count atoms in each of the 7 Venn regions.
 * @returns {{oob_only:number, mcp_only:number, enhanced_only:number, oob_mcp:number, mcp_enhanced:number, oob_enhanced:number, all_three:number}}
 */
export function regionCounts() {
  const counts = REGION_KEYS.reduce((o, k) => ((o[k] = 0), o), {});
  for (const a of atoms()) {
    const r = regionForAtom(a);
    if (r && r in counts) counts[r] += 1;
  }
  return counts;
}

/**
 * Return the literal AI response object for a variant.
 * @param {"oob"|"mcp"|"enhanced"} variantId
 * @returns {{tool:string, text:string} | null}
 */
export function responseForVariant(variantId) {
  if (!_current || !_current.responses) return null;
  return _current.responses[variantId] || null;
}

/** The full payload, if any has been loaded. */
export function payload() {
  return _current;
}

const Data = {
  load,
  atoms,
  atomsForVariant,
  regionCounts,
  responseForVariant,
  regionForAtom,
  payload,
  REGION_KEYS,
};

export default Data;
