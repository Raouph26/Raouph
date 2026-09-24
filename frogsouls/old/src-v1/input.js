// Keyboard + mouse, with a short input buffer so presses during recovery
// still land — the thing that separates "responsive" from "sticky".

const BUFFER = 0.24;

export class Input {
  constructor(canvas) {
    this.touch = null;          // set by Touch once it attaches
    this.keys = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false };
    this._buf = new Map();      // action -> time remaining
    this._rightDownAt = -1;
    this.rightHeldTime = 0;
    this.pointerLocked = false;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space')   this.push('roll');
      if (e.code === 'KeyQ')    this.push('heavy');
      if (e.code === 'Tab')   { e.preventDefault(); this.push('lock'); }
      if (e.code === 'KeyR')    this.push('retry');
      if (e.code === 'Digit1')  this.push('w1');
      if (e.code === 'Digit2')  this.push('w2');
      if (e.code === 'Digit3')  this.push('w3');
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.pointerLocked) { canvas.requestPointerLock?.(); return; }
      if (e.button === 0) { this.mouse.left = true; this.push('light'); }
      if (e.button === 2) { this.mouse.right = true; this._rightDownAt = performance.now(); }
      if (e.button === 1) { e.preventDefault(); this.push('lock'); }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) {
        this.mouse.right = false;
        // A TAP of RMB is a parry. A HOLD is a block. One button, souls-style.
        if (this._rightDownAt > 0 && performance.now() - this._rightDownAt < 190) this.push('parry');
        this._rightDownAt = -1;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
  }

  push(a) { this._buf.set(a, BUFFER); }
  /** Consume a buffered action if present. */
  take(a) { if (this._buf.has(a)) { this._buf.delete(a); return true; } return false; }
  peek(a) { return this._buf.has(a); }
  clear() { this._buf.clear(); }

  down(code) { return this.keys.has(code); }
  get blocking() {
    if (this.touch?.blocking) return true;
    return this.mouse.right && this._rightDownAt > 0 &&
           performance.now() - this._rightDownAt >= 190;
  }

  /** Raw WASD as a camera-relative 2D vector. */
  moveAxis(out) {
    if (this.touch?.active && this.touch.axis(out)) return true;
    let x = 0, z = 0;
    if (this.down('KeyW') || this.down('ArrowUp'))    z -= 1;
    if (this.down('KeyS') || this.down('ArrowDown'))  z += 1;
    if (this.down('KeyA') || this.down('ArrowLeft'))  x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    const m = Math.hypot(x, z);
    out.set(m ? x / m : 0, m ? z / m : 0);
    return m > 0;
  }

  get sprinting() {
    return this.down('ShiftLeft') || this.down('ShiftRight') || !!this.touch?.sprinting;
  }

  endFrame(dt) {
    this.mouse.dx = 0; this.mouse.dy = 0;
    for (const [k, t] of this._buf) {
      const n = t - dt;
      if (n <= 0) this._buf.delete(k); else this._buf.set(k, n);
    }
  }
}
