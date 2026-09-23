export class HUD {
  constructor() {
    this.hp = document.querySelector('#hp > i');
    this.hpGhost = document.querySelector('#hp > u');
    this.st = document.querySelector('#st > i');
    this.bossbar = document.getElementById('bossbar');
    this.bossName = document.querySelector('#bossbar .name');
    this.bb = document.querySelector('#bb > i');
    this.bbGhost = document.querySelector('#bb > u');
    this.center = document.getElementById('center');
    this.centerBig = document.querySelector('#center .big');
    this.centerSub = document.querySelector('#center .sub');
    this.deaths = document.getElementById('deaths');
    this.lockdot = document.getElementById('lockdot');
    this._ghostHp = 1; this._ghostBoss = 1;
  }

  update(dt, player, boss, reticle) {
    const hpF = Math.max(0, player.hp / 100);
    this.hp.style.transform = `scaleX(${hpF})`;
    this._ghostHp += (hpF - this._ghostHp) * Math.min(1, dt * 2.6);
    if (this._ghostHp < hpF) this._ghostHp = hpF;
    this.hpGhost.style.transform = `scaleX(${this._ghostHp})`;
    this.st.style.transform = `scaleX(${Math.max(0, player.stamina / 110)})`;

    const show = boss && boss.alive && boss.position.distanceTo(player.position) < 30;
    this.bossbar.classList.toggle('on', !!show);
    if (boss) {
      this.bossName.textContent = boss.name;
      const f = Math.max(0, boss.hpFrac);
      this.bb.style.transform = `scaleX(${f})`;
      this._ghostBoss += (f - this._ghostBoss) * Math.min(1, dt * 2.2);
      if (this._ghostBoss < f) this._ghostBoss = f;
      this.bbGhost.style.transform = `scaleX(${this._ghostBoss})`;
    }

    if (reticle) {
      this.lockdot.classList.add('on');
      this.lockdot.style.transform = `translate(${reticle.x}px, ${reticle.y}px)`;
    } else this.lockdot.classList.remove('on');

    this.deaths.textContent = player.deaths ? `DEATHS  ${player.deaths}` : '';
  }

  banner(big, sub) {
    this.centerBig.textContent = big;
    this.centerSub.textContent = sub ?? '';
    this.center.classList.add('on');
  }
  clearBanner() { this.center.classList.remove('on'); }

  resetGhosts() { this._ghostHp = 1; this._ghostBoss = 1; }
}
