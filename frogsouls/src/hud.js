export class HUD {
  constructor() {
    this.hp = document.querySelector('#hp > i');
    this.hpGhost = document.querySelector('#hp > u');
    this.st = document.querySelector('#st > i');
    this.bars = document.getElementById('bars');
    this.bossbar = document.getElementById('bossbar');
    this.bossName = document.querySelector('#bossbar .name');
    this.bossSub = document.querySelector('#bossbar .sub');
    this.bb = document.querySelector('#bb > i');
    this.bbGhost = document.querySelector('#bb > u');
    this.center = document.getElementById('center');
    this.centerBig = document.querySelector('#center .big');
    this.centerSub = document.querySelector('#center .sub');
    this.place = document.getElementById('place');
    this.placeName = document.querySelector('#place .pn');
    this.placeSub = document.querySelector('#place .ps');
    this.prompt = document.getElementById('prompt');
    this.deaths = document.getElementById('deaths');
    this.lockdot = document.getElementById('lockdot');
    this._gh = 1; this._gb = 1;
  }

  setCombat(on) {
    this.bossbar.classList.toggle('on', on);
    this.bars.classList.toggle('on', true);
  }

  setPlace(name, sub) {
    this.placeName.textContent = name;
    this.placeSub.textContent = sub ?? '';
    this.place.classList.remove('show');
    void this.place.offsetWidth;          // restart the fade
    this.place.classList.add('show');
  }

  setPrompt(gate) {
    if (!gate) { this.prompt.classList.remove('on'); return; }
    this.prompt.classList.add('on');
    this.prompt.classList.toggle('locked', !!gate.locked);
    this.prompt.querySelector('.pl').textContent = gate.label;
    this.prompt.querySelector('.psub').textContent = gate.sub ?? '';
  }

  update(dt, player, boss, reticle, mode) {
    const hpF = Math.max(0, player.hp / 100);
    this.hp.style.transform = `scaleX(${hpF})`;
    this._gh += (hpF - this._gh) * Math.min(1, dt * 2.6);
    if (this._gh < hpF) this._gh = hpF;
    this.hpGhost.style.transform = `scaleX(${this._gh})`;
    this.st.style.transform = `scaleX(${Math.max(0, player.stamina / 110)})`;

    if (boss && mode === 'fight') {
      this.bossName.textContent = boss.name;
      this.bossSub.textContent = boss.epithet ?? '';
      const f = Math.max(0, boss.hpFrac);
      this.bb.style.transform = `scaleX(${f})`;
      this._gb += (f - this._gb) * Math.min(1, dt * 2.2);
      if (this._gb < f) this._gb = f;
      this.bbGhost.style.transform = `scaleX(${this._gb})`;
    }

    if (reticle && mode === 'fight') {
      this.lockdot.classList.add('on');
      this.lockdot.style.transform = `translate(${reticle.x}px, ${reticle.y}px)`;
    } else this.lockdot.classList.remove('on');

    this.deaths.textContent = player.deaths ? `DEATHS ${player.deaths}` : '';
  }

  banner(big, sub) {
    this.centerBig.textContent = big;
    this.centerSub.textContent = sub ?? '';
    this.center.classList.add('on');
  }
  clearBanner() { this.center.classList.remove('on'); }
  resetGhosts() { this._gh = 1; this._gb = 1; }
}
