import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// PLACEHOLDER RIG — built from many small primitives rather than six big boxes.
// Limbs are two-bone (shoulder→elbow→hand, hip→knee→foot) so the animation can
// actually bend them. Every joint is a named node; a real rigged GLB drops in
// later by matching the names in ASSETS.md. Combat never reads geometry.
// ─────────────────────────────────────────────────────────────────────────────

const MAT = (color, opts = {}) => new THREE.MeshStandardMaterial({
  color, roughness: opts.rough ?? .86, metalness: opts.metal ?? .04, flatShading: true });

function box(w, h, d, mat, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = cast; m.receiveShadow = cast;
  return m;
}

/** A bone that pivots at its top. Returns the pivot group; `.end` is the joint below. */
function bone(len, w, d, mat, { taper = 1, cast = true } = {}) {
  const g = new THREE.Group();
  const geo = taper === 1
    ? new THREE.BoxGeometry(w, len, d)
    : new THREE.CylinderGeometry(w * .5 * taper, w * .5, len, 6);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -len / 2;
  m.castShadow = cast; m.receiveShadow = cast;
  g.add(m);
  const end = new THREE.Group();
  end.position.y = -len;
  g.add(end);
  g.userData.end = end;
  g.userData.mesh = m;
  g.userData.len = len;
  return g;
}

// Build presets give each archetype a different silhouette from the same rig.
export const BUILDS = {
  normal:  { w:1.00, limb:1.00, head:1.00, shoulder:1.00, crown:0, hunch:0.00 },
  lean:    { w:0.82, limb:1.14, head:0.92, shoulder:0.88, crown:0, hunch:0.16 },
  heavy:   { w:1.42, limb:0.88, head:1.10, shoulder:1.45, crown:0, hunch:0.10 },
  long:    { w:0.92, limb:1.05, head:0.95, shoulder:1.18, crown:0, hunch:0.04, armExtra:1.34 },
  crowned: { w:1.18, limb:1.10, head:1.06, shoulder:1.30, crown:1, hunch:0.00 },
};

export function buildActor({
  scale = 1, skin = 0x6d8f4e, cloth = 0x2a2d28, accent = 0x8fae4b,
  belly = null, build = 'normal', eyes = true,
} = {}) {
  const B = BUILDS[build] ?? BUILDS.normal;
  const W = B.w, L = B.limb;

  const mSkin  = MAT(skin);
  const mBelly = MAT(belly ?? new THREE.Color(skin).lerp(new THREE.Color(0xffffff), .28).getHex());
  const mCloth = MAT(cloth, { rough: .95 });
  const mDark  = MAT(new THREE.Color(cloth).multiplyScalar(.55).getHex(), { rough: .95 });
  const mTrim  = MAT(accent, { rough: .5, metal: .3 });
  const mLeather = MAT(new THREE.Color(cloth).lerp(new THREE.Color(0x6b4a2a), .5).getHex(), { rough: .9 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  root.add(body);

  // ── pelvis ──
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.92 * L;
  body.add(pelvis);
  pelvis.add(box(.46 * W, .26, .34 * W, mCloth));

  // hip wrap + belt hardware
  const belt = box(.50 * W, .10, .38 * W, mLeather);
  belt.position.y = .12; pelvis.add(belt);
  const buckle = box(.10, .09, .05, mTrim);
  buckle.position.set(0, .12, .20 * W); pelvis.add(buckle);
  for (const s of [-1, 1]) {           // hanging cloth strips
    const strip = box(.13, .40, .05, mDark);
    strip.position.set(s * .17 * W, -.12, .17 * W);
    strip.rotation.x = .12; pelvis.add(strip);
  }

  // ── torso ──
  const spine = new THREE.Group();
  spine.position.y = .22;
  pelvis.add(spine);

  const torso = box(.54 * W, .52, .36 * W, mCloth);
  torso.position.y = .26; spine.add(torso);
  const bellyPlate = box(.34 * W, .40, .06, mBelly);
  bellyPlate.position.set(0, .24, .18 * W); spine.add(bellyPlate);

  const chest = new THREE.Group();
  chest.position.y = .52;
  chest.rotation.x = B.hunch;
  spine.add(chest);

  const ribs = box(.58 * W, .34, .40 * W, mSkin);
  ribs.position.y = .15; chest.add(ribs);
  const collar = box(.50 * W, .10, .34 * W, mLeather);
  collar.position.y = .32; chest.add(collar);
  // back strap
  const strap = box(.09, .62, .05, mLeather);
  strap.position.set(.10 * W, .06, -.18 * W); strap.rotation.z = .2; chest.add(strap);

  // ── head ──
  const neck = new THREE.Group();
  neck.position.y = .34;
  chest.add(neck);
  const head = new THREE.Group();
  neck.add(head);

  const hs = B.head;
  const skull = box(.40 * hs, .30 * hs, .40 * hs, mSkin);
  skull.position.y = .17 * hs;
  head.add(skull);
  const jaw = box(.36 * hs, .13 * hs, .42 * hs, mSkin);
  jaw.position.set(0, .05 * hs, .02 * hs); head.add(jaw);
  const mouth = box(.30 * hs, .03, .06, mDark);
  mouth.position.set(0, .04 * hs, .21 * hs); head.add(mouth);
  // throat sac — the one unmistakably frog detail
  const sac = box(.26 * hs, .12 * hs, .14 * hs, mBelly);
  sac.position.set(0, -.02 * hs, .12 * hs); head.add(sac);
  // brow ridge
  const brow = box(.42 * hs, .06, .30 * hs, mSkin);
  brow.position.set(0, .33 * hs, .02); head.add(brow);

  if (eyes) for (const s of [-1, 1]) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(.105 * hs, 10, 8),
      MAT(0xe9e5d6, { rough: .45 }));
    dome.position.set(s * .15 * hs, .37 * hs, .04); dome.castShadow = true; head.add(dome);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(.05 * hs, 8, 6), MAT(0x14100d, { rough: .35 }));
    pupil.position.set(s * .155 * hs, .375 * hs, .125 * hs); head.add(pupil);
    const lid = box(.20 * hs, .05, .18 * hs, mSkin);
    lid.position.set(s * .15 * hs, .45 * hs, .02); head.add(lid);
  }
  if (B.crown) {
    for (let i = -2; i <= 2; i++) {
      const sp = box(.05, .20 + Math.abs(i) * -.03, .05, mTrim);
      sp.position.set(i * .10 * hs, .44 * hs, -.02); sp.rotation.z = i * .12;
      head.add(sp);
    }
  }

  // ── arms ──
  const armExtra = B.armExtra ?? 1;
  const arms = {};
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const shoulder = new THREE.Group();
    shoulder.position.set(s * .32 * W * B.shoulder, .22, 0);
    chest.add(shoulder);

    const pad = box(.20 * W * B.shoulder, .15, .24 * W, mLeather);
    pad.position.y = .04; shoulder.add(pad);
    const rivet = box(.06, .06, .06, mTrim);
    rivet.position.set(s * .07, .07, 0); shoulder.add(rivet);

    const upper = bone(.34 * L * armExtra, .15 * W, .15 * W, mSkin);
    shoulder.add(upper);
    const elbowPad = box(.14, .07, .14, mLeather);
    elbowPad.position.y = -.02; upper.userData.end.add(elbowPad);

    const fore = bone(.32 * L * armExtra, .12 * W, .12 * W, mSkin);
    upper.userData.end.add(fore);
    const wrap = box(.135, .13, .135, mCloth);
    wrap.position.y = -.08; fore.add(wrap);

    const hand = new THREE.Group();
    fore.userData.end.add(hand);
    const palm = box(.13, .12, .10, mSkin);
    palm.position.y = -.05; hand.add(palm);
    for (let f = -1; f <= 1; f++) {      // three fat frog fingers
      const fin = box(.035, .11, .035, mSkin);
      fin.position.set(f * .042, -.15, .01); fin.rotation.x = -.25;
      hand.add(fin);
    }
    arms[side] = { shoulder, upper, fore, hand };
  }

  // ── legs ──
  const legs = {};
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const hip = new THREE.Group();
    hip.position.set(s * .15 * W, -.06, 0);
    pelvis.add(hip);

    const thigh = bone(.42 * L, .19 * W, .21 * W, mCloth);
    hip.add(thigh);
    const kneeCap = box(.17, .08, .17, mLeather);
    kneeCap.position.y = -.01; thigh.userData.end.add(kneeCap);

    const shin = bone(.40 * L, .15 * W, .16 * W, mCloth);
    thigh.userData.end.add(shin);
    const greave = box(.16, .18, .17, mLeather);
    greave.position.y = -.10; shin.add(greave);

    const ankle = new THREE.Group();
    shin.userData.end.add(ankle);
    const foot = box(.17, .08, .30, mSkin);
    foot.position.set(0, -.04, .07); ankle.add(foot);
    for (let tIdx = -1; tIdx <= 1; tIdx++) {   // webbed toes
      const toe = box(.05, .05, .12, mSkin);
      toe.position.set(tIdx * .055, -.04, .25); ankle.add(toe);
    }
    legs[side] = { hip, thigh, shin, ankle };
  }

  // weapon socket rides the right hand
  const weapon = new THREE.Group();
  arms.R.hand.add(weapon);

  root.userData.rig = {
    body, pelvis, spine, chest, neck, head, weapon,
    armL: arms.L, armR: arms.R, legL: legs.L, legR: legs.R,
    hand: arms.R.hand,
  };
  root.userData.accent = accent;
  root.userData.build = B;
  return root;
}

// ─────────────────────────────────────────────────────────────────────────────
// Weapons, also built up from parts: grip wrap, guard, fuller, pommel, rivets.
// `userData.tip` is the node combat traces for the hitbox.
// ─────────────────────────────────────────────────────────────────────────────
export function buildWeaponMesh(kind, accent) {
  const g = new THREE.Group();
  const steel = MAT(0xb4bcc2, { rough: .34, metal: .72 });
  const dark  = MAT(0x2a2520, { rough: .95, metal: 0 });
  const wrap  = MAT(0x3d2f22, { rough: .98, metal: 0 });
  const trim  = MAT(accent, { rough: .45, metal: .45 });

  // grip: three wrapped segments so it doesn't read as one bar
  for (let i = 0; i < 3; i++) {
    const seg = box(.075, .085, .075, i % 2 ? wrap : dark);
    seg.position.y = -.04 - i * .088;
    g.add(seg);
  }
  const pommel = box(.10, .07, .10, trim);
  pommel.position.y = .035; g.add(pommel);

  let tipY;
  if (kind === 'rapier') {
    const guard = new THREE.Mesh(new THREE.TorusGeometry(.10, .018, 6, 12), steel);
    guard.rotation.x = Math.PI / 2; guard.position.y = -.30; g.add(guard);
    const quillon = box(.30, .03, .03, steel);
    quillon.position.y = -.30; g.add(quillon);
    const blade = box(.042, 1.30, .042, steel);
    blade.position.y = -.98; g.add(blade);
    const ridge = box(.016, 1.24, .062, steel);
    ridge.position.y = -.98; g.add(ridge);
    const point = new THREE.Mesh(new THREE.ConeGeometry(.032, .16, 4), steel);
    point.position.y = -1.70; point.rotation.x = Math.PI; g.add(point);
    tipY = -1.76;

  } else if (kind === 'maul') {
    const haft = box(.085, 1.15, .085, wrap);
    haft.position.y = -.80; g.add(haft);
    for (let i = 0; i < 3; i++) {       // binding rings down the haft
      const ring = box(.10, .045, .10, dark);
      ring.position.y = -.46 - i * .30; g.add(ring);
    }
    const headBlock = box(.34, .40, .30, MAT(0x6e6a63, { rough: .82, metal: .3 }));
    headBlock.position.y = -1.48; g.add(headBlock);
    for (const s of [-1, 1]) {          // cheek plates
      const cheek = box(.06, .34, .26, steel);
      cheek.position.set(s * .19, -1.48, 0); g.add(cheek);
    }
    for (const s of [-1, 1]) for (const z of [-1, 1]) {   // studs
      const stud = box(.055, .055, .055, trim);
      stud.position.set(s * .11, -1.36, z * .13); g.add(stud);
    }
    const spike = new THREE.Mesh(new THREE.ConeGeometry(.09, .22, 4), steel);
    spike.position.y = -1.79; spike.rotation.x = Math.PI; g.add(spike);
    tipY = -1.72;

  } else { // cleaver
    const guard = box(.30, .055, .11, steel);
    guard.position.y = -.30; g.add(guard);
    for (const s of [-1, 1]) {
      const lang = box(.045, .16, .07, steel);
      lang.position.set(s * .12, -.38, 0); g.add(lang);
    }
    const blade = box(.20, .92, .045, steel);
    blade.position.y = -.84; g.add(blade);
    const fuller = box(.055, .80, .058, MAT(0x8d9499, { rough: .4, metal: .7 }));
    fuller.position.y = -.84; g.add(fuller);
    const spine2 = box(.045, .90, .062, dark);
    spine2.position.set(-.085, -.84, 0); g.add(spine2);
    const belly2 = box(.11, .30, .042, steel);   // the cleaver's forward weight
    belly2.position.set(.06, -1.22, 0); g.add(belly2);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.10, .20, 4), steel);
    nose.position.y = -1.40; nose.rotation.x = Math.PI; nose.rotation.y = Math.PI / 4;
    g.add(nose);
    tipY = -1.44;
  }

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  const tip = new THREE.Object3D();
  tip.position.y = tipY;
  g.add(tip);
  g.userData.tip = tip;

  // Hangs blade-down from the fist, so a relaxed arm reads as a lowered guard
  // and a swing carries the blade forward on its own.
  g.rotation.x = 0.12;
  return g;
}
