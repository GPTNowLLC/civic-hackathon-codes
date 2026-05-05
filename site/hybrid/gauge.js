// gauge.js — semicircular confidence-to-act gauge for the hybrid mockup.
// Public API:
//   const g = new Gauge(container);
//   g.setPosition(pos);   // pos in [0..2], fractional
// The gauge owns its DOM. The orchestrator (W8) feeds scrubber positions in.

const ARC_RED   = "#c5524a";
const ARC_AMBER = "#c89a3a";
const ARC_MOSS  = "#5a8a4f";

// Angular range: needle sweeps -90deg (left, "Speculative") to +90deg (right,
// "Ready Monday AM"). Position fractions chosen per spec:
//   pos 0 -> 15% of arc, pos 1 -> 55%, pos 2 -> 92%.
const POS_TO_FRAC = [0.15, 0.55, 0.92];

function fracForPosition(pos) {
  const p = Math.max(0, Math.min(2, pos));
  if (p <= 1) return POS_TO_FRAC[0] + (POS_TO_FRAC[1] - POS_TO_FRAC[0]) * p;
  return POS_TO_FRAC[1] + (POS_TO_FRAC[2] - POS_TO_FRAC[1]) * (p - 1);
}

function angleForFrac(frac) {
  // -90deg at frac=0, +90deg at frac=1 (in radians)
  return (-90 + 180 * frac) * (Math.PI / 180);
}

function labelForFrac(frac) {
  if (frac < 0.33) return { text: "Speculative", cls: "s-0" };
  if (frac < 0.72) return { text: "Informed but stuck", cls: "s-1" };
  return { text: "Ready Monday AM", cls: "s-2" };
}

export class Gauge {
  constructor(container) {
    if (!container) throw new Error("Gauge: container required");
    this.container = container;
    this.container.classList.add("gauge-root");
    this._build();
    this._currentFrac = fracForPosition(0);
    this._targetFrac = this._currentFrac;
    this._raf = null;
    this._render(this._currentFrac);
  }

  _build() {
    const root = this.container;
    root.innerHTML = `
      <div class="gauge-frame">
        <svg class="gauge-svg" viewBox="0 0 200 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <defs>
            <linearGradient id="gauge-track-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"  stop-color="${ARC_RED}"/>
              <stop offset="50%" stop-color="${ARC_AMBER}"/>
              <stop offset="100%" stop-color="${ARC_MOSS}"/>
            </linearGradient>
          </defs>
          <!-- Track: semicircle arc from (20,100) to (180,100) over the top -->
          <path class="gauge-track-bg"
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke="#e7dccb"
                stroke-width="14"
                stroke-linecap="round"/>
          <path class="gauge-track"
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke="url(#gauge-track-grad)"
                stroke-width="14"
                stroke-linecap="round"
                opacity="0.92"/>
          <!-- Tick marks at the three named stops -->
          <g class="gauge-ticks">
            <line x1="20"  y1="100" x2="20"  y2="86" />
            <line x1="100" y1="20"  x2="100" y2="34" />
            <line x1="180" y1="100" x2="180" y2="86" />
          </g>
          <!-- Hub + needle (rotated around hub) -->
          <g class="gauge-needle-group" transform="rotate(0 100 100)">
            <line class="gauge-needle" x1="100" y1="100" x2="100" y2="30" />
            <circle class="gauge-hub" cx="100" cy="100" r="6" />
          </g>
        </svg>
        <div class="gauge-labels">
          <span class="gauge-label gauge-label-left">Speculative</span>
          <span class="gauge-label gauge-label-mid">Informed<br/>but stuck</span>
          <span class="gauge-label gauge-label-right">Ready Monday&nbsp;AM</span>
        </div>
        <div class="gauge-readout">
          <div class="gauge-value s-0" data-role="value">Speculative</div>
          <div class="gauge-pct"   data-role="pct">15%</div>
        </div>
      </div>
    `;
    this._needleGroup = root.querySelector(".gauge-needle-group");
    this._valueEl = root.querySelector('[data-role="value"]');
    this._pctEl = root.querySelector('[data-role="pct"]');
  }

  setPosition(pos) {
    this._targetFrac = fracForPosition(pos);
    this._scheduleTween();
  }

  _scheduleTween() {
    if (this._raf) return;
    const step = () => {
      this._raf = null;
      const delta = this._targetFrac - this._currentFrac;
      if (Math.abs(delta) < 0.001) {
        this._currentFrac = this._targetFrac;
        this._render(this._currentFrac);
        return;
      }
      // ease toward target — 18% per frame is smooth at 60Hz
      this._currentFrac += delta * 0.18;
      this._render(this._currentFrac);
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  _render(frac) {
    const angleDeg = -90 + 180 * frac;
    if (this._needleGroup) {
      this._needleGroup.setAttribute("transform", `rotate(${angleDeg.toFixed(2)} 100 100)`);
    }
    const lbl = labelForFrac(frac);
    if (this._valueEl) {
      this._valueEl.className = `gauge-value ${lbl.cls}`;
      this._valueEl.textContent = lbl.text;
    }
    if (this._pctEl) {
      this._pctEl.textContent = `${Math.round(frac * 100)}%`;
    }
  }
}

export default Gauge;
