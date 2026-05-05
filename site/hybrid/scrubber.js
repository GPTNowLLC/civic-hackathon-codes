/**
 * Scrubber — 3-position snap scrubber widget.
 *
 * Public API:
 *   const s = new Scrubber(container, {
 *     onPositionChange,   // (pos: number) => void   fractional 0..2 during drag
 *     onPositionCommit,   // (pos: 0|1|2) => void    integer on release/click/key
 *     initialPosition,    // 0|1|2 (default 0)
 *   });
 *   s.setPosition(pos, animate = true)   // pos may be fractional during animation
 *   s.getPosition()                      // returns committed integer 0|1|2
 *
 * Stops: 0 = "Out-of-Box", 1 = "+ City Data", 2 = "+ Better Question"
 */

const STOPS = [
  { idx: 0, badge: '1', title: 'Out-of-Box' },
  { idx: 1, badge: '2', title: '+ City Data' },
  { idx: 2, badge: '3', title: '+ Better Question' },
];

const MAX = STOPS.length - 1; // 2

export class Scrubber {
  constructor(container, opts = {}) {
    if (!container) throw new Error('Scrubber: container is required');
    this.container = container;
    this.onPositionChange = opts.onPositionChange || (() => {});
    this.onPositionCommit = opts.onPositionCommit || (() => {});

    // committed integer position (0|1|2)
    this._committed = clampInt(opts.initialPosition ?? 0);
    // current display position (fractional 0..2) — what handle/CSS reflects
    this._display = this._committed;

    // drag state
    this._dragging = false;
    this._pointerId = null;
    this._dragStartX = 0;
    this._dragStartPos = 0;

    // animation state
    this._rafId = null;
    this._animFrom = 0;
    this._animTo = 0;
    this._animStart = 0;
    this._animDur = 0;

    this._build();
    this._bind();
    this._renderHandle(this._display);
    this._renderLabels(this._display);
  }

  // ───────────────────────── Public ─────────────────────────

  /**
   * Set the position. If `pos` is fractional, the handle will reflect that
   * fractional value (used by orchestrator/animations). Integer positions
   * are treated as a committed move.
   */
  setPosition(pos, animate = true) {
    const clamped = clampFloat(pos);
    const isInteger = Math.abs(clamped - Math.round(clamped)) < 1e-6;
    const target = isInteger ? Math.round(clamped) : clamped;

    if (animate) {
      this._animateTo(target, isInteger ? 320 : 180);
    } else {
      this._cancelAnim();
      this._display = target;
      this._renderHandle(target);
      this._renderLabels(target);
    }

    if (isInteger) {
      const intPos = Math.round(target);
      if (intPos !== this._committed) {
        this._committed = intPos;
        this.onPositionCommit(intPos);
      }
    }
    // notify continuous listeners of the commanded position
    this.onPositionChange(target);
  }

  getPosition() {
    return this._committed;
  }

  // ───────────────────────── Build ─────────────────────────

  _build() {
    this.container.classList.add('scrubber-root');

    // Track wrapper (focusable, role=slider)
    const trackWrap = document.createElement('div');
    trackWrap.className = 'scrubber-track-wrap';
    trackWrap.setAttribute('role', 'slider');
    trackWrap.setAttribute('tabindex', '0');
    trackWrap.setAttribute('aria-valuemin', '0');
    trackWrap.setAttribute('aria-valuemax', String(MAX));
    trackWrap.setAttribute('aria-valuenow', String(this._committed));
    trackWrap.setAttribute('aria-label', 'AI variant scrubber');
    trackWrap.setAttribute(
      'aria-valuetext',
      STOPS[this._committed].title
    );
    this.trackWrap = trackWrap;

    // Track gradient
    const track = document.createElement('div');
    track.className = 'scrubber-track';
    trackWrap.appendChild(track);
    this.track = track;

    // Stop ticks on the track
    const stops = document.createElement('div');
    stops.className = 'scrubber-stops';
    STOPS.forEach((s) => {
      const tick = document.createElement('div');
      tick.className = 'scrubber-stop-tick';
      tick.style.left = `${pctOf(s.idx)}%`;
      stops.appendChild(tick);
    });
    track.appendChild(stops);

    // Handle
    const handle = document.createElement('div');
    handle.className = 'scrubber-handle';
    handle.setAttribute('aria-hidden', 'true');
    trackWrap.appendChild(handle);
    this.handle = handle;

    // Labels (badges + serif titles)
    const labels = document.createElement('div');
    labels.className = 'scrubber-labels';
    this.labelEls = STOPS.map((s) => {
      const lbl = document.createElement('div');
      lbl.className = 'scrubber-label';
      lbl.dataset.idx = String(s.idx);
      lbl.style.left = `${pctOf(s.idx)}%`;
      lbl.innerHTML = `
        <span class="scrubber-label-badge">${s.badge}</span>
        <span class="scrubber-label-title">${s.title}</span>
      `;
      labels.appendChild(lbl);
      return lbl;
    });

    this.container.appendChild(trackWrap);
    this.container.appendChild(labels);
  }

  // ───────────────────────── Events ─────────────────────────

  _bind() {
    // Pointer-down on handle => begin drag
    this.handle.addEventListener('pointerdown', (e) => this._onHandlePointerDown(e));
    // Pointer-down on track (not handle) => jump + animate
    this.trackWrap.addEventListener('pointerdown', (e) => {
      if (e.target === this.handle || this.handle.contains(e.target)) return;
      const pos = this._posFromClientX(e.clientX);
      const snap = Math.round(pos);
      this.trackWrap.focus();
      this.setPosition(snap, true);
    });

    // Label click => jump
    this.labelEls.forEach((lbl) => {
      lbl.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(lbl.dataset.idx);
        this.trackWrap.focus();
        this.setPosition(idx, true);
      });
    });

    // Keyboard: arrows step by one stop, Home/End to ends
    this.trackWrap.addEventListener('keydown', (e) => {
      let next = this._committed;
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          next = Math.max(0, this._committed - 1);
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          next = Math.min(MAX, this._committed + 1);
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = MAX;
          break;
        case '0':
        case '1':
        case '2': {
          const n = Number(e.key);
          if (n <= MAX) next = n;
          break;
        }
        default:
          return;
      }
      e.preventDefault();
      if (next !== this._committed) this.setPosition(next, true);
    });

    // Re-render on resize so percentage-based handle stays right (CSS handles
    // most of it, but we may need to recompute trackRect for drags)
    window.addEventListener('resize', () => {
      this._renderHandle(this._display);
    });
  }

  _onHandlePointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    this._cancelAnim();
    this._dragging = true;
    this._pointerId = e.pointerId;
    this._dragStartX = e.clientX;
    this._dragStartPos = this._display;
    this.handle.classList.add('is-dragging');
    this.handle.classList.remove('is-snapping');
    try {
      this.handle.setPointerCapture(e.pointerId);
    } catch (_) {}

    const onMove = (ev) => {
      if (!this._dragging || ev.pointerId !== this._pointerId) return;
      const pos = this._posFromClientX(ev.clientX);
      this._display = pos;
      this._renderHandle(pos);
      this._renderLabels(pos);
      this.onPositionChange(pos);
    };

    const onUp = (ev) => {
      if (ev.pointerId !== this._pointerId) return;
      this._dragging = false;
      this.handle.classList.remove('is-dragging');
      try {
        this.handle.releasePointerCapture(this._pointerId);
      } catch (_) {}
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);

      // snap to nearest stop with ease-out
      const snap = Math.round(clampFloat(this._display));
      this._animateTo(snap, 320);
      if (snap !== this._committed) {
        this._committed = snap;
        this.trackWrap.setAttribute('aria-valuenow', String(snap));
        this.trackWrap.setAttribute('aria-valuetext', STOPS[snap].title);
        this.onPositionCommit(snap);
      } else {
        // even if same stop, ensure ARIA reflects current
        this.trackWrap.setAttribute('aria-valuenow', String(snap));
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  // ───────────────────────── Animation ─────────────────────────

  _animateTo(targetPos, durationMs) {
    this._cancelAnim();
    const from = this._display;
    const to = clampFloat(targetPos);
    if (Math.abs(from - to) < 1e-4) {
      this._display = to;
      this._renderHandle(to);
      this._renderLabels(to);
      this._syncAria(to);
      return;
    }
    this._animFrom = from;
    this._animTo = to;
    this._animDur = Math.max(60, durationMs);
    this._animStart = performance.now();
    this.handle.classList.add('is-snapping');

    const tick = (now) => {
      const t = Math.min(1, (now - this._animStart) / this._animDur);
      const eased = easeOutCubic(t);
      const cur = this._animFrom + (this._animTo - this._animFrom) * eased;
      this._display = cur;
      this._renderHandle(cur);
      this._renderLabels(cur);
      this.onPositionChange(cur);
      if (t < 1) {
        this._rafId = requestAnimationFrame(tick);
      } else {
        this._rafId = null;
        this.handle.classList.remove('is-snapping');
        this._display = to;
        this._renderHandle(to);
        this._renderLabels(to);
        this._syncAria(to);
      }
    };
    this._rafId = requestAnimationFrame(tick);
  }

  _cancelAnim() {
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
      this.handle.classList.remove('is-snapping');
    }
  }

  _syncAria(pos) {
    const intPos = Math.round(clampFloat(pos));
    this.trackWrap.setAttribute('aria-valuenow', String(intPos));
    if (STOPS[intPos]) {
      this.trackWrap.setAttribute('aria-valuetext', STOPS[intPos].title);
    }
  }

  // ───────────────────────── Geometry ─────────────────────────

  _posFromClientX(clientX) {
    const rect = this.track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const frac = (clientX - rect.left) / rect.width;
    return clampFloat(frac * MAX);
  }

  _renderHandle(pos) {
    const p = clampFloat(pos);
    // Position the handle by left%, relative to the track wrap.
    // Track wrap spans the full width; track itself spans 100%, ticks at 0/50/100.
    this.handle.style.left = `${pctOf(p)}%`;
  }

  _renderLabels(pos) {
    const p = clampFloat(pos);
    const nearest = Math.round(p);
    this.labelEls.forEach((el, i) => {
      el.classList.toggle('is-active', i === nearest && Math.abs(p - i) < 0.25);
      el.classList.toggle('is-dim', Math.abs(p - i) > 0.85);
    });
  }
}

// ───────────────────────── helpers ─────────────────────────

function clampFloat(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > MAX) return MAX;
  return v;
}

function clampInt(v) {
  const n = Math.round(Number(v) || 0);
  if (n < 0) return 0;
  if (n > MAX) return MAX;
  return n;
}

function pctOf(pos) {
  return (clampFloat(pos) / MAX) * 100;
}

function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}
