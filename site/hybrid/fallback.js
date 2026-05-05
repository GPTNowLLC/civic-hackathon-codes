// fallback.js — renders the "real data" detail view for scenarios that
// don't have an atomized-claims file yet. Pulls verbatim from
// data/three-column-state.json and presents the three AI variant
// responses + scores + rationale + accuracy flags + data quality notes.
//
// Mounted by orchestrator.js when /data/atoms/<scenario>.json is missing.

const VARIANT_META = [
  { col: 'col1', label: 'OOB · Opus 4.7 (no tools)',          eyebrow: 'Variant 1 · Out-of-the-box' },
  { col: 'col2', label: 'MCP · Opus 4.7 + PortlandMaps',      eyebrow: 'Variant 2 · With city data (MCP)' },
  { col: 'col3', label: 'Enhanced · MCP + enriched prompt',   eyebrow: 'Variant 3 · MCP + better question' },
];

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function scoreBadge(label, value) {
  if (value === null || value === undefined || value === '') {
    return `<span class="fb-score s-na"><span class="label">${label}</span><span class="val">–</span></span>`;
  }
  const n = Number(value);
  const cls = (Number.isFinite(n) && n >= 0 && n <= 3) ? `s-${n}` : 's-na';
  return `<span class="fb-score ${cls}"><span class="label">${label}</span><span class="val">${escapeHtml(value)}</span></span>`;
}

function listOrEmpty(items, emptyMsg) {
  const arr = Array.isArray(items) ? items.filter(x => x && String(x).trim()) : [];
  if (!arr.length) return `<div class="fb-empty">${escapeHtml(emptyMsg)}</div>`;
  return `<ul class="fb-list">${arr.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
}

function renderCard(meta, colData) {
  const cd = colData || {};
  const tool = cd.tool || '(unspecified)';
  const model = cd.model || '';
  const response = cd.response || '';
  const rationale = cd.rationale || '';
  const accuracyFlags = cd.accuracyFlags || [];
  const dataQualityNotes = cd.dataQualityNotes || '';

  return `
    <article class="fallback-card ${meta.col}">
      <header class="fb-card-head">
        <span class="fb-card-eyebrow">${escapeHtml(meta.eyebrow)}</span>
        <h2 class="fb-card-tool">${escapeHtml(tool)}</h2>
        ${model ? `<span class="fb-card-model">${escapeHtml(model)}</span>` : ''}
      </header>

      <div class="fb-scores">
        ${scoreBadge('U',  cd.usefulness)}
        ${scoreBadge('C',  cd.citationQuality)}
        ${scoreBadge('AA', cd.audienceAppropriateness)}
      </div>

      <section class="fb-section">
        <h3>Verbatim response</h3>
        ${ response
            ? `<div class="fb-response">${escapeHtml(response)}</div>`
            : `<div class="fb-empty">No response captured for this variant.</div>` }
      </section>

      ${ rationale ? `
        <section class="fb-section">
          <h3>Scoring rationale</h3>
          <div class="fb-rationale">${escapeHtml(rationale)}</div>
        </section>` : '' }

      <details class="fb-collapsible">
        <summary>Accuracy flags (${Array.isArray(accuracyFlags) ? accuracyFlags.length : 0})</summary>
        <div style="margin-top:8px;">${listOrEmpty(accuracyFlags, 'No accuracy flags recorded.')}</div>
      </details>

      ${ dataQualityNotes ? `
        <details class="fb-collapsible">
          <summary>Data-quality notes</summary>
          <div class="fb-rationale" style="margin-top:8px;">${escapeHtml(dataQualityNotes)}</div>
        </details>` : '' }
    </article>
  `;
}

function renderQuestion(scenarioMeta, slot) {
  const residentQ = (() => {
    if (!scenarioMeta) return '';
    const t = scenarioMeta.template || '';
    if (t.includes('(x)')) return t.replace('(x)', scenarioMeta.address || '');
    return scenarioMeta.address ? `${t} (Address: ${scenarioMeta.address})` : t;
  })();

  const enriched = slot && slot.enrichedQuestion ? slot.enrichedQuestion : '';

  return `
    <section class="fallback-question">
      <h2>Resident question</h2>
      <p class="resident-q">${escapeHtml(residentQ)}</p>
      ${ enriched ? `
        <div class="enriched">
          <span class="enriched-label">Enriched (variant 3 prompt)</span>
          ${escapeHtml(enriched)}
        </div>` : '' }
    </section>
  `;
}

/**
 * Render the fallback into a host element.
 *
 * @param {HTMLElement} host       target element (#fallback-detail)
 * @param {object}      slot       three-column-state slot for this scenario
 * @param {object}      scenarioMeta  entry from scenarios.json
 */
export function renderFallback(host, slot, scenarioMeta) {
  if (!host) return;
  if (!slot) {
    host.innerHTML = `
      <div class="fb-load-error">
        <strong>No evaluation data for this scenario yet.</strong><br/>
        <span style="opacity:0.8; font-size: 13px;">
          The atomized-claims file (<code>data/atoms/${escapeHtml(scenarioMeta && scenarioMeta.id || 'unknown')}.json</code>)
          is missing and no entry was found in <code>data/three-column-state.json</code> for the
          configured address.
        </span>
      </div>
    `;
    return;
  }

  // If the slot exists but every variant has an empty response, the
  // scenario hasn't been evaluated yet — show a single banner instead of
  // three empty cards.
  const anyResponse = ['col1', 'col2', 'col3'].some(k => {
    const v = slot[k];
    return v && typeof v.response === 'string' && v.response.trim().length > 0;
  });
  if (!anyResponse) {
    host.innerHTML = `
      ${renderQuestion(scenarioMeta, slot)}
      <div class="fb-load-error">
        <strong>This scenario has not been evaluated yet.</strong><br/>
        <span style="opacity:0.85; font-size: 13.5px;">
          The slot exists in <code>three-column-state.json</code> but no variant responses have
          been recorded. Once evaluations are run for the OOB, MCP, and Enhanced configurations,
          re-run <code>python3 skills/atomization/atomize.py ${escapeHtml(scenarioMeta && scenarioMeta.id || '&lt;id&gt;')}</code>
          to generate the atomized-claims file and unlock the Venn view here.
        </span>
      </div>
    `;
    return;
  }

  const cardsHtml = VARIANT_META.map(m => renderCard(m, slot[m.col])).join('');

  host.innerHTML = `
    ${renderQuestion(scenarioMeta, slot)}
    <div class="fallback-responses">${cardsHtml}</div>
  `;
}

export default { renderFallback };
