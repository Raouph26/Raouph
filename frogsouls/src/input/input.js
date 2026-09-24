// ─────────────────────────────────────────────────────────────────────────────
// One input stream from every device. Keyboard+mouse, gamepad and touch all
// write into the same state; the game reads actions, never devices.
//
//   Keyboard: WASD move · mouse look · LMB light · F heavy · RMB (hold) block
//             C parry · Space roll · Shift sprint · R heal · Q/Tab lock-on
//             E interact · Esc pause
//   Gamepad:  LS move · RS look · R1 light · R2 heavy · L1 block · L2 parry
//             B roll (hold to sprint) · X heal · A interact · R3 lock · Start
//   Touch:    left stick (push to the rim to sprint) · drag right to look ·
//             buttons on the right
// ─────────────────────────────────────────────────────────────────────────────

const PRESS = ['light', 'heavy', 'roll', 'parry', 'heal', 'lock', 'interact', 'pause', 'up', 'down', 'left', 'right', 'confirm', 'back'];

export class Input {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.move = { x: 0, y: 0 };           // x right, y forward, 0..1
    this.look = { x: 0, y: 0 };           // accumulated this frame (pixels-ish)
    this.held = { sprint: false, block: false };
    this.pressed = new Set();
    this.device = matchMedia('(pointer: coarse)').matches ? 'touch' : 'kb';
    this.keys = new Set();
    this.mouse = { left: false, right: false, locked: false };
    this.sens = 1;
    this.invertY = false;
    this.menuMode = false;                 // menus eat directional input
    this.pad = { prev: [], rollDown: -1, sprinting: false, repeat: {} };
    this.touch = { stick: null, look: null, sx: 0, sy: 0, x: 0, y: 0, block: false, sprint: false };
    this._bindKeyboard();
    this._bindMouse();
    if (ui) this._bindTouch(ui);
  }

  press(a) { this.pressed.add(a); }
  took(a) { if (this.pressed.has(a)) { this.pressed.delete(a); return true; } return false; }
  has(a) { return this.pressed.has(a); }

  // ── keyboard ──────────────────────────────────────────────────────────────
  _bindKeyboard() {
    const map = {
      Space: 'roll', KeyF: 'heavy', KeyC: 'parry', KeyR: 'heal', KeyQ: 'lock', Tab: 'lock', KeyE: 'interact',
      Escape: 'pause', Enter: 'confirm', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Backspace: 'back',
    };
    addEventListener('keydown', (e) => {
      if (e.repeat && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return;
      if (e.target?.tagName === 'INPUT') return;
      this.device = 'kb';
      this.keys.add(e.code);
      const a = map[e.code];
      if (a) { this.press(a); if (e.code === 'Tab' || e.code === 'Space') e.preventDefault(); }
      if (e.code === 'Escape') this.press('back');
      if (this.menuMode) {
        if (e.code === 'KeyW') this.press('up'); if (e.code === 'KeyS') this.press('down');
        if (e.code === 'KeyA') this.press('left'); if (e.code === 'KeyD') this.press('right');
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; this.held.block = false; });
  }

  _bindMouse() {
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      this.device = 'kb';
      if (!this.mouse.locked && !this.menuMode) { c.requestPointerLock?.()?.catch?.(() => {}); }
      if (e.button === 0) { this.mouse.left = true; this.press('light'); }
      if (e.button === 2) this.mouse.right = true;
      if (e.button === 1) { e.preventDefault(); this.press('lock'); }
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.left = false; if (e.button === 2) this.mouse.right = false; });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.mouse.locked) return;
      this.look.x += e.movementX * 0.9; this.look.y += e.movementY * 0.9;
    });
    document.addEventListener('pointerlockchange', () => { this.mouse.locked = document.pointerLockElement === c; });
  }

  releasePointer() { if (document.pointerLockElement) document.exitPointerLock?.(); }

  // ── touch ─────────────────────────────────────────────────────────────────
  _bindTouch(ui) {
    const root = ui.touchRoot;
    if (!root) return;
    const zone = root.querySelector('#tzone');
    const stick = root.querySelector('#tstick'), knob = root.querySelector('#tknob');
    const R = 54;
    // left half: a stick that appears under the thumb; right half: camera drag
    zone.addEventListener('pointerdown', (e) => {
      this.device = 'touch';
      const left = e.clientX < innerWidth * 0.42;
      if (left && this.touch.stick == null) {
        this.touch.stick = e.pointerId; this.touch.sx = e.clientX; this.touch.sy = e.clientY;
        stick.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; stick.classList.add('on');
      } else if (!left && this.touch.look == null) {
        this.touch.look = e.pointerId; this.touch.lx = e.clientX; this.touch.ly = e.clientY;
      }
      zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.touch.stick) {
        const dx = e.clientX - this.touch.sx, dy = e.clientY - this.touch.sy;
        const m = Math.hypot(dx, dy), k = m > R ? R / m : 1;
        this.touch.x = dx * k / R; this.touch.y = -dy * k / R;
        this.touch.sprint = m > R * 1.25;
        knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      } else if (e.pointerId === this.touch.look) {
        this.look.x += (e.clientX - this.touch.lx) * 2.2; this.look.y += (e.clientY - this.touch.ly) * 2.2;
        this.touch.lx = e.clientX; this.touch.ly = e.clientY;
        this.touch.lastLook = performance.now();
      }
    });
    const end = (e) => {
      if (e.pointerId === this.touch.stick) { this.touch.stick = null; this.touch.x = this.touch.y = 0; this.touch.sprint = false; knob.style.transform = ''; stick.classList.remove('on'); }
      if (e.pointerId === this.touch.look) this.touch.look = null;
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    const btn = (sel, action, hold) => {
      const el = root.querySelector(sel);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation(); this.device = 'touch';
        el.classList.add('press');
        if (hold) this.touch[hold] = true; else this.press(action);
        navigator.vibrate?.(8);
      });
      const up = () => { el.classList.remove('press'); if (hold) this.touch[hold] = false; };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
    };
    btn('#bAtk', 'light'); btn('#bHvy', 'heavy'); btn('#bRoll', 'roll'); btn('#bPar', 'parry');
    btn('#bBlk', null, 'block'); btn('#bHeal', 'heal'); btn('#bLock', 'lock'); btn('#bAct', 'interact'); btn('#bPause', 'pause');
  }

  // ── gamepad ───────────────────────────────────────────────────────────────
  _pollPad(dt) {
    const pads = navigator.getGamepads?.() ?? [];
    const gp = [...pads].find((p) => p && p.connected);
    if (!gp) return null;
    const b = (i) => !!gp.buttons[i]?.pressed;
    const prev = this.pad.prev;
    const down = (i) => b(i) && !prev[i];
    const any = gp.buttons.some((x) => x?.pressed) || gp.axes.some((a) => Math.abs(a) > .3);
    if (any) this.device = 'pad';
    const dz = (v) => (Math.abs(v) < .16 ? 0 : (v - Math.sign(v) * .16) / .84);

    if (down(5)) this.press('light');
    if (down(7)) this.press('heavy');
    if (down(6)) this.press('parry');
    if (down(2)) this.press('heal');
    if (down(11) || down(3)) this.press('lock');
    if (down(0)) { this.press('interact'); this.press('confirm'); }
    if (down(9)) this.press('pause');
    if (down(1)) this.press('back');
    // roll on release, sprint while held (the souls convention)
    if (b(1) && !prev[1]) this.pad.rollDown = performance.now();
    if (!b(1) && prev[1]) { if (performance.now() - this.pad.rollDown < 280) this.press('roll'); this.pad.rollDown = -1; }
    this.pad.sprinting = (b(1) && performance.now() - this.pad.rollDown > 280) || b(10);
    // d-pad / stick for menus, with repeat
    const dirs = { up: b(12) || gp.axes[1] < -.6, down: b(13) || gp.axes[1] > .6, left: b(14) || gp.axes[0] < -.6, right: b(15) || gp.axes[0] > .6 };
    // first press fires at once, then repeats after a pause while held
    const r = this.pad.repeat;
    for (const [k, on] of Object.entries(dirs)) {
      if (!on) { r[k] = null; continue; }
      if (r[k] == null) { this.press(k); r[k] = .35; continue; }
      r[k] -= dt;
      if (r[k] <= 0) { this.press(k); r[k] = .12; }
    }
    this.pad.prev = gp.buttons.map((x) => !!x?.pressed);
    return { lx: dz(gp.axes[0]), ly: -dz(gp.axes[1]), rx: dz(gp.axes[2] ?? 0), ry: dz(gp.axes[3] ?? 0), block: b(4) };
  }

  /** Call once per frame before the game reads input. */
  update(dt) {
    const pad = this._pollPad(dt);
    let mx = 0, my = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.menuMode) { mx = 0; my = 0; }
    if (pad && (Math.abs(pad.lx) + Math.abs(pad.ly)) > 0) { mx = pad.lx; my = pad.ly; }
    if (this.touch.stick != null) { mx = this.touch.x; my = this.touch.y; }
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    this.move.x = mx; this.move.y = my;

    if (pad) { this.look.x += pad.rx * 560 * dt; this.look.y += pad.ry * 380 * dt; }
    this.held.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.pad.sprinting || this.touch.sprint;
    this.held.block = this.mouse.right || !!pad?.block || this.touch.block;
  }

  /** The camera reads this, then the frame ends. */
  consumeLook() {
    const s = this.sens * (this.device === 'touch' ? .0042 : .0026);
    const out = { x: this.look.x * s, y: this.look.y * s * (this.invertY ? -1 : 1) };
    this.look.x = 0; this.look.y = 0;
    return out;
  }

  endFrame() {
    // unconsumed presses live for one frame only; the sim has its own buffer
    for (const a of PRESS) this.pressed.delete(a);
  }
}
