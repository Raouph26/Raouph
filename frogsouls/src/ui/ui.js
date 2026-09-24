// ─────────────────────────────────────────────────────────────────────────────
// The UI: HUD, banners, menus. HTML over the canvas — crisp at any resolution
// and cheap. Menus are driven by one Menu class that works the same with a
// mouse, a finger, a keyboard or a gamepad.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const fmt = (n) => Math.floor(n).toLocaleString('en-US');

export const FLY_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="14" rx="4" ry="5.5" fill="currentColor"/><circle cx="12" cy="7.5" r="3" fill="currentColor"/><ellipse cx="6.5" cy="10" rx="5" ry="2.6" fill="currentColor" opacity=".45" transform="rotate(-25 6.5 10)"/><ellipse cx="17.5" cy="10" rx="5" ry="2.6" fill="currentColor" opacity=".45" transform="rotate(25 17.5 10)"/></svg>`;
const FLASK_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2h6v2h-1v4.2l4.6 7.9A3.3 3.3 0 0 1 15.8 21H8.2a3.3 3.3 0 0 1-2.8-4.9L10 8.2V4H9z" fill="currentColor"/></svg>`;

export class UI {
  constructor(root) {
    this.root = root;
    this.hudEl = $('#hud', root);
    this.hp = $('#hpbar i', root); this.hpGhost = $('#hpbar u', root); this.hpBar = $('#hpbar', root);
    this.st = $('#stbar i', root); this.stBar = $('#stbar', root);
    this.flaskEl = $('#flask', root); this.flaskN = $('#flask b', root);
    this.fliesEl = $('#flies', root); this.fliesN = $('#flies b', root);
    this.bossEl = $('#boss', root); this.bossName = $('#boss .bn', root); this.bossEpi = $('#boss .be', root);
    this.bossHp = $('#boss .bar i', root); this.bossGhost = $('#boss .bar u', root); this.bossLabel = $('#boss .bl', root);
    this.reticle = $('#reticle', root);
    this.sayEl = $('#say', root);
    this.promptEl = $('#prompt', root);
    this.bannerEl = $('#banner', root);
    this.areaEl = $('#area', root);
    this.introEl = $('#intro', root);
    this.toastEl = $('#toast', root);
    this.fadeEl = document.getElementById('fade');
    this.menuEl = $('#menu', root);
    this.titleEl = $('#title', root);
    this.touchRoot = $('#touch', root);
    this.ruleEl = $('#rule', root);
    this.flaskIcon = FLASK_SVG;
    $('#flask .ic', root).innerHTML = FLASK_SVG;
    $('#flies .ic', root).innerHTML = FLY_SVG;
    this._ghost = 1; this._bossGhost = 1; this._flies = null;
    this.menu = null;
    this._timers = {};
    this.touch = matchMedia('(pointer: coarse)').matches;
    root.classList.toggle('is-touch', this.touch);
  }

  setDevice(d) { this.root.dataset.device = d; }

  // ── HUD ───────────────────────────────────────────────────────────────────
  showHud(on, { boss = false } = {}) {
    this.hudEl.classList.toggle('on', on);
    this.bossEl.classList.toggle('on', on && boss);
    this.touchRoot.classList.toggle('on', on && this.touch);
  }

  updateHud(dt, s) {
    const hpF = Math.max(0, s.hp / s.maxHp);
    this.hpBar.style.setProperty('--w', (s.maxHp / 100) * 26 + 'vw');
    this.hp.style.transform = `scaleX(${hpF})`;
    this._ghost = this._ghost < hpF ? hpF : this._ghost + (hpF - this._ghost) * Math.min(1, dt * 2.2);
    this.hpGhost.style.transform = `scaleX(${this._ghost})`;
    this.hpBar.classList.toggle('low', hpF < .25);
    this.stBar.style.setProperty('--w', (s.maxStamina / 100) * 20 + 'vw');
    this.st.style.transform = `scaleX(${Math.max(0, s.stamina / s.maxStamina)})`;
    this.flaskN.textContent = s.flasks;
    this.flaskEl.classList.toggle('empty', s.flasks <= 0);
    this.flaskEl.classList.toggle('banned', !!s.noHeal);
    if (this._flies == null) this._flies = s.flies;
    this._flies += (s.flies - this._flies) * Math.min(1, dt * 4);
    if (Math.abs(this._flies - s.flies) < 1) this._flies = s.flies;
    this.fliesN.textContent = fmt(this._flies);

    if (s.boss) {
      const b = s.boss;
      this.bossName.textContent = b.name;
      this.bossEpi.textContent = b.epithet;
      this.bossHp.style.transform = `scaleX(${Math.max(0, b.hpFrac)})`;
      this._bossGhost = this._bossGhost < b.hpFrac ? b.hpFrac : this._bossGhost + (b.hpFrac - this._bossGhost) * Math.min(1, dt * 1.8);
      this.bossGhost.style.transform = `scaleX(${this._bossGhost})`;
      this.bossLabel.textContent = b.label ?? '';
      this.bossLabel.classList.toggle('danger', !!b.danger);
    }
    if (s.reticle) { this.reticle.classList.add('on'); this.reticle.style.transform = `translate(${s.reticle.x}px, ${s.reticle.y}px)`; }
    else this.reticle.classList.remove('on');
    if (s.say) {
      if (this.sayEl.dataset.text !== s.say.text) { this.sayEl.textContent = s.say.text; this.sayEl.dataset.text = s.say.text; }
      this.sayEl.classList.add('on');
      this.sayEl.style.transform = `translate(${s.say.x}px, ${s.say.y}px) translate(-50%, -100%)`;
    } else this.sayEl.classList.remove('on');
  }

  resetBossBar() { this._bossGhost = 1; this._ghost = 1; }

  prompt(p) {
    if (!p) { this.promptEl.classList.remove('on'); $('#bAct', this.root)?.classList.remove('on'); return; }
    this.promptEl.innerHTML = `<kbd>${p.key}</kbd><span>${p.text}</span>${p.sub ? `<em>${p.sub}</em>` : ''}`;
    this.promptEl.classList.toggle('locked', !!p.locked);
    this.promptEl.classList.add('on');
    $('#bAct', this.root)?.classList.toggle('on', !p.locked);
  }

  // ── banners & cards ───────────────────────────────────────────────────────
  _flash(el, key, dur) {
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    clearTimeout(this._timers[key]);
    if (dur) this._timers[key] = setTimeout(() => el.classList.remove('on'), dur * 1000);
  }

  banner(title, sub, kind = 'death', dur = 0) {
    this.bannerEl.className = `banner ${kind}`;
    this.bannerEl.innerHTML = `<div class="bt">${title}</div>${sub ? `<div class="bs">${sub}</div>` : ''}`;
    this._flash(this.bannerEl, 'banner', dur);
  }
  hideBanner() { this.bannerEl.classList.remove('on'); }

  area(name, epithet) {
    this.areaEl.innerHTML = `<div class="an">${name}</div><div class="ae">${epithet ?? ''}</div>`;
    this._flash(this.areaEl, 'area', 4);
  }

  intro(name, epithet, world) {
    this.introEl.innerHTML = `<div class="iw">${world ?? ''}</div><div class="in">${name}</div><div class="ie">${epithet}</div>`;
    this._flash(this.introEl, 'intro', 2.9);
    this.root.classList.add('letterbox');
    clearTimeout(this._timers.lb);
    this._timers.lb = setTimeout(() => this.root.classList.remove('letterbox'), 2900);
  }

  rule(text) { this.ruleEl.textContent = text; this._flash(this.ruleEl, 'rule', 3.2); }

  toast(text, dur = 2.4) { this.toastEl.textContent = text; this._flash(this.toastEl, 'toast', dur); }

  fade(to, dur = .35) {
    this.fadeEl.style.transition = `opacity ${dur}s ease`;
    this.fadeEl.style.opacity = to;
    return new Promise((r) => setTimeout(r, dur * 1000 + 20));
  }

  // ── title ─────────────────────────────────────────────────────────────────
  showTitle(on) { this.titleEl.classList.toggle('on', on); }

  // ── menus ─────────────────────────────────────────────────────────────────
  openMenu(spec) {
    this.closeMenu();
    this.menu = new Menu(this.menuEl, spec);
    this.menuEl.classList.add('on');
    return this.menu;
  }
  closeMenu() {
    if (this.menu) this.menu.destroy();
    this.menu = null;
    this.menuEl.classList.remove('on');
    this.menuEl.className = '';
  }
  get menuOpen() { return !!this.menu; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Menu: a vertical list of items. Arrow/D-pad moves focus, left/right adjusts,
// confirm activates, back closes. Clicks and taps do the obvious thing.
//   { title, kicker, cls, items: [...], onBack, side: html }
//   item: { label, sub, action, disabled, value } | { slider } | { toggle } | { choice } | { html }
// ─────────────────────────────────────────────────────────────────────────────
export class Menu {
  constructor(el, spec) {
    this.el = el;
    this.spec = spec;
    el.className = 'on ' + (spec.cls ?? '');
    el.innerHTML = '';
    const panel = h('div', 'panel');
    if (spec.kicker) panel.appendChild(h('div', 'mk', spec.kicker));
    if (spec.title) panel.appendChild(h('div', 'mt', spec.title));
    if (spec.lead) panel.appendChild(h('div', 'ml', spec.lead));
    const body = h('div', 'mbody');
    if (spec.side) body.appendChild(h('div', 'mside', spec.side));
    this.list = h('div', 'mlist');
    body.appendChild(this.list);
    panel.appendChild(body);
    if (spec.foot) panel.appendChild(h('div', 'mfoot', spec.foot));
    el.appendChild(panel);
    this.items = [];
    this.render(spec.items);
    this.focus = Math.max(0, this.items.findIndex((it) => it.focusable && !it.spec.disabled));
    this._paint();
  }

  render(items) {
    this.list.innerHTML = '';
    this.items = [];
    for (const it of items) {
      let row;
      if (it.html != null) { row = h('div', 'mi info', it.html); this.items.push({ spec: it, row, focusable: false }); this.list.appendChild(row); continue; }
      row = h('button', 'mi');
      row.type = 'button';
      if (it.disabled) row.classList.add('disabled');
      if (it.cls) row.classList.add(...it.cls.split(' '));
      const lab = h('span', 'lab', it.label);
      row.appendChild(lab);
      if (it.sub) row.appendChild(h('span', 'sub', it.sub));
      const val = h('span', 'val');
      row.appendChild(val);
      const entry = { spec: it, row, val, focusable: true };
      this.items.push(entry);
      this.list.appendChild(row);
      row.addEventListener('pointerenter', () => { if (matchMedia('(hover: hover)').matches) { this.focus = this.items.indexOf(entry); this._paint(); } });
      row.addEventListener('click', (e) => {
        this.focus = this.items.indexOf(entry);
        if (it.slider || it.choice) {
          const r = row.getBoundingClientRect();
          this.adjust((e.clientX - r.left) / r.width > .5 ? 1 : -1);
        } else this.activate();
      });
      this._value(entry);
    }
  }

  _value(e) {
    const it = e.spec;
    if (it.slider) {
      const v = it.get(), k = (v - it.min) / (it.max - it.min);
      e.val.innerHTML = `<i class="track"><i style="width:${(k * 100).toFixed(0)}%"></i></i><b>${it.fmt ? it.fmt(v) : Math.round(k * 100)}</b>`;
    } else if (it.toggle) e.val.innerHTML = `<b>${it.get() ? 'ON' : 'OFF'}</b>`;
    else if (it.choice) e.val.innerHTML = `<b>‹ ${it.get().toUpperCase()} ›</b>`;
    else if (it.value != null) e.val.innerHTML = typeof it.value === 'function' ? it.value() : it.value;
  }

  _paint() {
    this.items.forEach((e, i) => e.row.classList.toggle('focus', i === this.focus));
    this.items[this.focus]?.row.scrollIntoView?.({ block: 'nearest' });
  }

  move(d) {
    const n = this.items.length;
    for (let k = 1; k <= n; k++) {
      const i = (this.focus + d * k + n * 4) % n;
      if (this.items[i].focusable) { this.focus = i; break; }
    }
    this._paint();
  }

  adjust(d) {
    const e = this.items[this.focus]; if (!e) return false;
    const it = e.spec;
    if (it.slider) { it.set(Math.min(it.max, Math.max(it.min, +(it.get() + d * it.step).toFixed(3)))); this._value(e); return true; }
    if (it.toggle) { it.set(!it.get()); this._value(e); return true; }
    if (it.choice) { const o = it.options, i = o.indexOf(it.get()); it.set(o[(i + d + o.length) % o.length]); this._value(e); return true; }
    return false;
  }

  activate() {
    const e = this.items[this.focus]; if (!e) return;
    const it = e.spec;
    if (it.disabled) { this.spec.onDenied?.(it); return; }
    if (it.toggle) { this.adjust(1); return; }
    if (it.slider || it.choice) { this.adjust(1); return; }
    it.action?.(it, this);
  }

  refresh(items) { const f = this.focus; this.render(items ?? this.spec.items); this.focus = Math.min(f, this.items.length - 1); if (!this.items[this.focus]?.focusable) this.move(1); this._paint(); }

  /** Feed menu actions from the input layer. Returns true if something happened. */
  handle(input, sfx) {
    let acted = false;
    if (input.took('up')) { this.move(-1); sfx?.('uiMove'); acted = true; }
    if (input.took('down')) { this.move(1); sfx?.('uiMove'); acted = true; }
    if (input.took('left')) { if (this.adjust(-1)) sfx?.('uiMove'); acted = true; }
    if (input.took('right')) { if (this.adjust(1)) sfx?.('uiMove'); acted = true; }
    if (input.took('confirm') || input.took('interact')) { this.activate(); acted = true; }
    if (input.took('back') || input.took('pause')) { this.spec.onBack?.(); acted = true; }
    return acted;
  }

  destroy() { this.el.innerHTML = ''; }
}
