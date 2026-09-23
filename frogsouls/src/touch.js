// Touch controls: a floating left stick and a right-hand button cluster.
// Feeds the same buffered actions the keyboard does, so the combat code never
// learns there is more than one input device.

export class Touch {
  constructor(root, input) {
    this.input = input;
    this.active = false;
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this._blockHeld = false;
    this._blockStart = 0;

    if (!matchMedia('(pointer: coarse)').matches) return;
    this.active = true;
    root.classList.add('touch');

    const stickEl = root.querySelector('#stick');
    const knobEl = root.querySelector('#knob');

    // ── left half: movement stick, appears where the thumb lands ──
    const zone = root.querySelector('#stickzone');
    zone.addEventListener('pointerdown', (e) => {
      if (this.stick.id !== null) return;
      this.stick.id = e.pointerId;
      this.stick.ox = e.clientX; this.stick.oy = e.clientY;
      stickEl.style.left = e.clientX + 'px';
      stickEl.style.top = e.clientY + 'px';
      stickEl.classList.add('on');
      zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stick.id) return;
      const dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
      const R = 52, m = Math.hypot(dx, dy), k = m > R ? R / m : 1;
      this.stick.x = (dx * k) / R; this.stick.y = (dy * k) / R;
      knobEl.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    });
    const end = (e) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick.id = null; this.stick.x = this.stick.y = 0;
      knobEl.style.transform = 'translate(0,0)';
      stickEl.classList.remove('on');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    // ── right side: action buttons ──
    const tap = (sel, action) => {
      const el = root.querySelector(sel);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); el.classList.add('press');
        input.push(action);
      });
      el.addEventListener('pointerup', () => el.classList.remove('press'));
      el.addEventListener('pointercancel', () => el.classList.remove('press'));
    };
    tap('#bLight', 'light');
    tap('#bHeavy', 'heavy');
    tap('#bRoll',  'roll');
    tap('#bLock',  'lock');

    // guard button: tap = parry, hold = block (same rule as RMB)
    const g = root.querySelector('#bGuard');
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault(); g.classList.add('press');
      this._blockHeld = true; this._blockStart = performance.now();
    });
    const gEnd = () => {
      if (!this._blockHeld) return;
      g.classList.remove('press');
      if (performance.now() - this._blockStart < 190) input.push('parry');
      this._blockHeld = false;
    };
    g.addEventListener('pointerup', gEnd);
    g.addEventListener('pointercancel', gEnd);

    // sprint when the stick is pushed to the rim
    this.sprintThreshold = 0.92;
  }

  get blocking() {
    return this._blockHeld && performance.now() - this._blockStart >= 190;
  }
  get sprinting() { return Math.hypot(this.stick.x, this.stick.y) > this.sprintThreshold; }

  /** @returns true if the stick is giving a direction */
  axis(out) {
    const m = Math.hypot(this.stick.x, this.stick.y);
    if (m < 0.18) { out.set(0, 0); return false; }
    out.set(this.stick.x / m, this.stick.y / m);
    return true;
  }
}
