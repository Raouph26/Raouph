import * as THREE from 'three';
import { createRig } from './rig.js';
import { PartBuilder, actorMaterial, glowMaterial } from './builder.js';
import { screenTexture, labelTexture } from '../textures.js';
import { buildFrog } from './frog.js';
import { buildWeapon } from './weapons.js';

// ─────────────────────────────────────────────────────────────────────────────
// Boss assembly: a humanoid rig dressed from the boss's visual spec — body,
// head, weapon, extras — or a bespoke body (the robot vacuum, the other frog).
// Every head is meant to read from silhouette alone at lock-on distance.
// ─────────────────────────────────────────────────────────────────────────────

const K = { black: 0x141312, white: 0xf2efe6, steel: 0xb4bcc2, steelD: 0x7d858b, wood: 0x6b4a2a, woodD: 0x3e2b1a, gold: 0xc9a44e, red: 0xc0392b };

// Things the view animates per frame (spinners, typing dots, screens…)
function extras() { return { spin: [], bob: [], screens: [], glows: [], dots: [], rgb: [] }; }

// ── generic humanoid body ───────────────────────────────────────────────────
function dressBody(rig, v) {
  const P = rig.parts, S = rig.spec;
  const skin = v.skin, cloth = v.cloth, trim = v.trim, acc = v.accent;
  const dark = new THREE.Color(cloth).multiplyScalar(0.6).getHex();
  const robe = v.extras?.includes('robe');

  P.pelvis.box(S.chestW * .8, .24, S.chestD * .9, cloth, { y: .02 })
    .box(S.chestW * .86, .08, S.chestD * .98, dark, { y: .13 })
    .box(.1, .09, .05, trim, { y: .13, z: S.chestD * .5 });
  if (robe) {
    P.pelvis.cyl(S.chestW * .46, S.chestW * .7, S.hipH * .95, cloth, { y: -S.hipH * .45, seg: 8, shade: .45 })
      .cyl(S.chestW * .72, S.chestW * .72, .06, trim, { y: -S.hipH * .9, seg: 8 });
  } else {
    for (const sx of [-1, 1]) P.pelvis.box(S.chestW * .3, .3, .05, dark, { x: sx * S.chestW * .2, y: -.16, z: S.chestD * .46, rx: .1, shade: .4 });
  }

  P.spine.cyl(S.chestW * .42, S.chestW * .38, S.torsoH, cloth, { y: S.torsoH / 2, seg: 8 })
    .box(S.chestW * .5, S.torsoH * .8, .05, dark, { y: S.torsoH * .5, z: S.chestD * .47 });

  P.chest.box(S.chestW, S.chestH, S.chestD, cloth, { y: S.chestH / 2, shade: .25 })
    .box(S.chestW * 1.02, .08, S.chestD * 1.02, trim, { y: S.chestH * .95 })
    .box(S.chestW * .35, S.chestH * .6, .04, trim, { y: S.chestH * .45, z: S.chestD * .51 });
  for (const sx of [-1, 1]) P.chest.blob(S.chestW * .24, .12, S.chestD * .5, dark, { x: sx * S.shoulderW * 1.02, y: S.chestH * .82 });

  for (const side of ['R', 'L']) {
    P['upper' + side].cyl(.1 * S.limb, .085 * S.limb, S.upperLen, cloth, { y: -S.upperLen / 2, seg: 6 });
    P['fore' + side].cyl(.085 * S.limb, .07 * S.limb, S.foreLen, skin, { y: -S.foreLen / 2, seg: 6 })
      .cyl(.095 * S.limb, .09 * S.limb, S.foreLen * .35, dark, { y: -S.foreLen * .75, seg: 6 });
    P['hand' + side].blob(.085 * S.limb, .08, .08 * S.limb, skin, { y: -.06 });
    if (!robe) {
      P['thigh' + side].cyl(.14 * S.limb, .11 * S.limb, S.thighLen, cloth, { y: -S.thighLen / 2, seg: 7 });
      P['shin' + side].cyl(.11 * S.limb, .09 * S.limb, S.shinLen, dark, { y: -S.shinLen / 2, seg: 6 });
    } else {
      P['shin' + side].cyl(.09, .08, S.shinLen * .5, dark, { y: -S.shinLen * .75, seg: 6 });
    }
    P['foot' + side].box(.16 * S.limb, .1, .3 * S.limb, K.black, { y: -.05, z: .07 });
  }
}

// ── heads ───────────────────────────────────────────────────────────────────
const HEADS = {
  duck(h, v) {
    h.b.blob(.26, .25, .26, v.skin, { y: .22 })
      .blob(.22, .06, .2, v.trim, { y: .16, z: .26 })                          // bill
      .blob(.2, .04, .18, 0xc97a1e, { y: .12, z: .26 })
      .sphere(.04, K.black, { x: .16, y: .3, z: .17 }).sphere(.04, K.black, { x: -.16, y: .3, z: .17 })
      .cyl(.27, .3, .08, K.steelD, { y: .42, seg: 9 })                         // kettle hat
      .cyl(.4, .4, .03, K.steel, { y: .38, seg: 12 })
      .cone(.05, .12, v.skin, { y: .52, z: -.1, rx: -.5 });
  },
  grandpa(h, v) {
    h.b.blob(.22, .25, .22, v.skin, { y: .22 })
      .blob(.2, .2, .12, K.white, { y: .08, z: .12 })                            // beard
      .blob(.06, .05, .07, 0xc98a72, { y: .22, z: .22 })                         // nose
      .box(.1, .03, .03, K.white, { x: .08, y: .3, z: .2, rz: .2 })              // eyebrows
      .box(.1, .03, .03, K.white, { x: -.08, y: .3, z: .2, rz: -.2 })
      .torus(.055, .012, K.black, { x: .08, y: .26, z: .21, seg: 10 })           // glasses
      .torus(.055, .012, K.black, { x: -.08, y: .26, z: .21, seg: 10 })
      .cyl(.24, .24, .09, 0x5a4a36, { y: .43, seg: 10 })                         // flat cap
      .box(.36, .02, .16, 0x5a4a36, { y: .4, z: .16, rx: .15 });
  },
  shrimp(h, v) {
    for (let i = 0; i < 5; i++) {
      const a = i * .32;
      h.b.blob(.2 - i * .025, .16 - i * .015, .16 - i * .02, i % 2 ? v.skin : v.cloth, { y: .15 + Math.sin(a) * .28, z: Math.cos(a) * .2 - .1 + i * .02 });
    }
    h.b.cone(.08, .3, v.cloth, { y: .55, z: .2, rx: 1.1 })                       // rostrum spike
      .cyl(.012, .012, .9, v.trim, { x: .08, y: .6, z: .3, rx: -.6, rz: -.4 })   // antennae
      .cyl(.012, .012, .9, v.trim, { x: -.08, y: .6, z: .3, rx: -.6, rz: .4 })
      .sphere(.05, K.black, { x: .12, y: .38, z: .18 }).sphere(.05, K.black, { x: -.12, y: .38, z: .18 });
  },
  crab(h, v) {
    h.b.blob(.34, .14, .28, v.skin, { y: .12 })
      .cone(.05, .12, v.skin, { x: .3, y: .16, rz: -1.2 }).cone(.05, .12, v.skin, { x: -.3, y: .16, rz: 1.2 })
      .cyl(.025, .025, .18, v.skin, { x: .1, y: .26, z: .15 }).cyl(.025, .025, .18, v.skin, { x: -.1, y: .26, z: .15 })
      .sphere(.05, K.black, { x: .1, y: .36, z: .15 }).sphere(.05, K.black, { x: -.1, y: .36, z: .15 })
      .box(.14, .05, .05, v.trim, { y: .05, z: .26 });
  },
  bubble(h, v) {
    h.b.box(.62, .42, .18, K.white, { y: .26 })
      .box(.56, .5, .16, K.white, { y: .26 })
      .shape([[0, 0], [.14, 0], [0, -.16]], .14, K.white, { x: -.08, y: .06 });
    for (let i = -1; i <= 1; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), new THREE.MeshStandardMaterial({ color: 0x3a3f4a }));
      d.position.set(i * .13, .26, .1);
      h.group.add(d); h.fx.dots.push(d);
    }
  },
  capskey(h, v) {
    h.b.box(.6, .22, .6, 0xd8d6d0, { y: .12 }).box(.48, .12, .48, K.white, { y: .28 });
    plate(h, labelTexture('⇪', { bg: null, fg: '#2a2a2e', px: 90 }), .4, .4, { y: .345, rx: -Math.PI / 2 });
    glowDot(h, v.accent, .04, { x: .2, y: .35, z: .2 });
  },
  ribbon(h, v) {
    h.b.blob(.2, .22, .2, v.skin, { y: .2 })
      .cyl(.34, .34, .05, v.cloth, { y: .26, z: .2, rx: Math.PI / 2, seg: 14 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      h.b.box(.1, .12, .03, v.cloth, { x: Math.cos(a) * .36, y: .26 + Math.sin(a) * .36, z: .2, rz: a });
    }
    h.b.box(.14, .4, .02, v.cloth, { x: .1, y: -.1, z: .2, rz: .2 }).box(.14, .4, .02, v.cloth, { x: -.1, y: -.1, z: .2, rz: -.2 });
    plate(h, labelTexture('1ST', { bg: '#e0b646', fg: '#1f3f8a', px: 56, radius: 60 }), .36, .36, { y: .26, z: .23 });
  },
  botcube(h, v) {
    h.b.box(.46, .42, .42, v.skin, { y: .22 }).box(.5, .06, .46, v.cloth, { y: .03 })
      .box(.3, .06, .02, K.black, { y: .1, z: .215 })
      .cyl(.015, .015, .3, K.steelD, { y: .55 }).sphere(.05, v.accent, { y: .72 });
    glowDot(h, v.trim, .06, { x: .11, y: .26, z: .215 }); glowDot(h, v.trim, .06, { x: -.11, y: .26, z: .215 });
  },
  judge(h, v) {
    h.b.blob(.2, .24, .2, v.skin, { y: .22 })
      .box(.24, .06, .04, K.black, { y: .28, z: .19 })                           // stern visor brow
      .box(.12, .025, .02, 0x6a4a3a, { y: .12, z: .2 });
    for (let i = 0; i < 9; i++) {                                                // powdered wig curls
      const a = (i / 8) * Math.PI;
      h.b.blob(.1, .1, .1, K.white, { x: Math.cos(a) * .24, y: .38 + Math.sin(a) * .1, z: -.02 });
    }
    for (const sx of [-1, 1]) for (let j = 0; j < 3; j++) h.b.blob(.09, .08, .09, K.white, { x: sx * .25, y: .22 - j * .12, z: -.04 });
  },
  clock(h, v) {
    h.b.cyl(.36, .36, .1, K.black, { y: .28, rx: Math.PI / 2, seg: 18 })
      .cyl(.32, .32, .02, K.white, { y: .28, z: .05, rx: Math.PI / 2, seg: 18 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      h.b.box(.02, i % 3 ? .04 : .07, .01, K.black, { x: Math.sin(a) * .27, y: .28 + Math.cos(a) * .27, z: .065, rz: -a });
    }
    const hands = new THREE.Group(); hands.position.set(0, .28, .07);
    const hb = new PartBuilder();
    hb.box(.025, .2, .01, K.black, { y: .09 }).box(.03, .14, .01, K.black, { y: .06, rz: 2.1 }).sphere(.025, v.accent);
    hands.add(hb.build(h.mat)); h.group.add(hands); h.fx.spin.push({ obj: hands, axis: 'z', speed: -1.5 });
  },
  printer(h, v) {
    h.b.box(.62, .34, .5, v.skin, { y: .2 }).box(.66, .06, .54, 0xcfcac2, { y: .39 })
      .box(.44, .04, .2, 0x9a958c, { y: .1, z: .28 })                            // output tray
      .box(.34, .01, .24, K.white, { y: .13, z: .3, rx: .1 })                    // a page
      .box(.2, .06, .02, 0x2a2a2e, { x: .14, y: .3, z: .255 });
    glowDot(h, 0x46d160, .02, { x: .06, y: .3, z: .26 }); glowDot(h, 0xffb23f, .02, { x: .12, y: .3, z: .26 });
  },
  projector(h, v) {
    h.b.box(.08, .3, .08, K.steelD, { y: .1 });
    const scr = screenTexture('projector');
    screen(h, scr, .78, .56, { y: .5 }, 'projector');
    h.b.box(.84, .62, .04, K.black, { y: .5, z: -.03 });
  },
  hourglass(h, v) {
    h.b.cyl(.3, .3, .06, K.wood, { y: .02, seg: 10 }).cyl(.3, .3, .06, K.wood, { y: .72, seg: 10 });
    for (const [x, z] of [[.24, .24], [-.24, .24], [.24, -.24], [-.24, -.24]]) h.b.cyl(.025, .025, .7, K.woodD, { x, z, y: .37 });
    const glass = new THREE.Mesh(new THREE.ConeGeometry(.24, .32, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: .35, roughness: .1 }));
    glass.position.y = .53; glass.rotation.x = Math.PI; h.group.add(glass);
    const glass2 = glass.clone(); glass2.position.y = .21; glass2.rotation.x = 0; h.group.add(glass2);
    h.b.cone(.2, .18, v.accent, { y: .15 }).cone(.08, .1, v.accent, { y: .56, rx: Math.PI });
  },
  screenAd(h, v) {
    h.b.box(.74, .56, .3, 0x1c1c22, { y: .3 }).box(.2, .08, .2, 0x1c1c22, { y: .02 });
    screen(h, screenTexture('ad'), .66, .48, { y: .3, z: .155 }, 'ad');
  },
  phoneRing(h, v) {
    h.b.box(.36, .62, .06, 0x101014, { y: .32 });
    screen(h, screenTexture('phone', 192, 320), .32, .56, { y: .32, z: .032 }, 'phone');
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.5, .045, 8, 32), glowMaterial(0xffffff));
    ring.position.set(0, .34, -.1); h.group.add(ring); h.fx.glows.push(ring);
  },
  captcha(h, v) {
    h.b.box(.62, .52, .1, 0xe8e8e8, { y: .3 });
    screen(h, screenTexture('captcha'), .58, .46, { y: .3, z: .052 }, 'captcha');
  },
  battery(h, v) {
    h.b.box(.66, .38, .3, 0x202226, { y: .24 }).box(.08, .16, .16, 0x202226, { x: .37, y: .24 });
    screen(h, screenTexture('battery'), .6, .32, { y: .24, z: .152 }, 'battery');
  },
  eye(h, v) {
    h.b.cone(.36, .7, v.cloth, { y: .36, seg: 3 });
    const iris = screenTexture('ai', 256, 256);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(.2, 24), new THREE.MeshBasicMaterial({ map: iris.tex, toneMapped: false }));
    disc.position.set(0, .34, .19); disc.rotation.x = -.26; h.group.add(disc);
    h.fx.screens.push({ kind: 'ai', ...iris });
  },
  glitch(h, v) {
    h.b.box(.44, .44, .44, 0x15171b, { y: .24 });
    screen(h, screenTexture('glitch'), .4, .4, { y: .24, z: .225 }, 'glitch');
    for (const [c, dx] of [[0xff3bd4, .05], [0x3bd4ff, -.05]]) {
      const ghost = new THREE.Mesh(new THREE.BoxGeometry(.46, .46, .46), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .25, depthWrite: false }));
      ghost.position.set(dx, .24, 0); h.group.add(ghost); h.fx.rgb.push({ obj: ghost, dx });
    }
  },
  wireframe(h, v) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .5, 2, 2, 2), new THREE.MeshBasicMaterial({ color: v.skin, wireframe: true }));
    m.position.y = .26; h.group.add(m);
  },
  scroll(h, v) {
    h.b.box(.5, .62, .02, v.trim, { y: .34 })
      .cyl(.05, .05, .6, 0xc9b28a, { y: .66, rz: Math.PI / 2 }).cyl(.05, .05, .6, 0xc9b28a, { y: .02, rz: Math.PI / 2 });
    for (let i = 0; i < 6; i++) h.b.box(.36 - (i % 3) * .06, .02, .005, 0x5a4a3a, { x: -.02, y: .54 - i * .07, z: .015 });
    h.b.box(.08, .08, .005, v.accent, { x: .16, y: .14, z: .015, rz: .6 });
  },
  spinner(h, v) {
    h.b.sphere(.24, 0x1b1d24, { y: .24, seg: 12, rings: 8 });
    const ring = new THREE.Group(); ring.position.y = .24;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const d = new THREE.Mesh(new THREE.SphereGeometry(.035 + i * .004, 8, 6), glowMaterial(new THREE.Color(v.accent).lerp(new THREE.Color(0xffffff), i / 10)));
      d.position.set(Math.cos(a) * .42, Math.sin(a) * .42, 0);
      ring.add(d);
    }
    h.group.add(ring); h.fx.spin.push({ obj: ring, axis: 'z', speed: 4 });
  },
  crt(h, v) {
    h.b.box(.8, .66, .6, 0xcfc8b4, { y: .34 }).box(.56, .5, .3, 0xbdb6a2, { y: .34, z: -.42 })
      .box(.3, .08, .3, 0xbdb6a2, { y: .0 });
    screen(h, screenTexture('crt'), .68, .52, { y: .36, z: .305 }, 'crt');
  },
};

function plate(h, tex, w, ht, o) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ht), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
  m.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  if (o.rx) m.rotation.x = o.rx;
  h.group.add(m);
  return m;
}
function screen(h, scr, w, ht, o, kind) {
  const m = plate(h, scr.tex, w, ht, o);
  m.material.transparent = false;
  h.fx.screens.push({ kind, ...scr, mesh: m });
}
function glowDot(h, color, r, o) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), glowMaterial(color));
  m.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  h.group.add(m); h.fx.glows.push(m);
}

// ── boss weapons (authored along +y from the grip) ──────────────────────────
const PROPS = {
  halberd: (b, v) => { b.cyl(.035, .04, 2.2, K.wood, { y: .7 }).shape([[0, 0], [.34, .1], [.36, .4], [0, .46]], .03, K.steel, { y: 1.45, x: .02 })
    .cone(.05, .3, K.steel, { y: 1.95 }).box(.12, .04, .04, K.steel, { x: -.08, y: 1.6 }); return { tip: 2.0, two: true }; },
  brick: (b) => { b.box(.24, .12, .12, K.red, { y: .06 }).box(.245, .012, .125, 0xb0a898, { y: .06 }).box(.012, .125, .125, 0xb0a898, { y: .06 }); return { tip: .15 }; },
  antennaWhip: (b, v) => { for (let i = 0; i < 8; i++) b.cyl(.03 - i * .003, .03 - i * .003, .2, v.trim, { y: .1 + i * .19, x: Math.sin(i * .3) * .05 }); return { tip: 1.6 }; },
  claws: null,
  keyboard: (b) => { b.box(.08, .4, .08, K.black, { y: .15 }).box(.2, 1.0, .06, 0x2a2c30, { y: .8 });
    for (let i = 0; i < 12; i++) b.box(.07, .07, .02, 0xd8d6d0, { x: (i % 2) * .09 - .045, y: .38 + Math.floor(i / 2) * .15, z: .04 }); return { tip: 1.3 }; },
  bigKey: (b) => { b.cyl(.05, .05, 1.2, K.steelD, { y: .45 }).box(.36, .2, .28, 0xd8d6d0, { y: 1.15 }).box(.28, .06, .2, K.white, { y: 1.27 }); return { tip: 1.3, two: true }; },
  rapier: (b, v) => { b.torus(.08, .012, K.gold, { y: .02, rx: Math.PI / 2 }).box(.03, 1.2, .03, K.steel, { y: .65 }).box(.08, .2, .01, v.cloth, { x: .05, y: .1 }); return { tip: 1.25 }; },
  baton: (b, v) => { b.cyl(.04, .045, 1.0, K.steelD, { y: .45 }).cyl(.05, .05, .08, v.trim, { y: .9 }); return { tip: 1.0 }; },
  gavel: (b, v) => { b.cyl(.045, .05, 1.5, K.wood, { y: .6 }).cyl(.15, .15, .44, K.woodD, { y: 1.42, rz: Math.PI / 2, seg: 10 })
    .cyl(.16, .16, .05, v.accent, { x: .16, y: 1.42, rz: Math.PI / 2, seg: 10 }).cyl(.16, .16, .05, v.accent, { x: -.16, y: 1.42, rz: Math.PI / 2, seg: 10 }); return { tip: 1.5, two: true }; },
  clockhand: (b, v) => { b.box(.06, .2, .06, K.black, { y: 0 }).shape([[-.05, 0], [.05, 0], [.03, 1.0], [.12, 1.02], [0, 1.25], [-.12, 1.02], [-.03, 1.0]], .03, K.black, { y: .1 })
    .torus(.09, .02, v.accent, { y: .7, seg: 10 }); return { tip: 1.3 }; },
  stapler: (b, v) => { b.box(.24, .9, .18, 0x2a2c30, { y: .5 }).box(.22, .86, .08, v.accent, { y: .55, z: .12 }).box(.26, .1, .22, K.steelD, { y: 1.0 }); return { tip: 1.0 }; },
  pointerStaff: (b, v) => { b.cyl(.02, .03, 1.8, K.steelD, { y: .7 }).cyl(.035, .035, .1, K.black, { y: .0 }); return { tip: 1.6, glowTip: v.accent, two: true }; },
  clockScythe: (b, v) => { b.cyl(.04, .045, 2.2, K.woodD, { y: .7 }).shape([[0, 0], [.12, 0], [-.9, .3], [-.95, .2]], .04, K.black, { y: 1.75 })
    .torus(.12, .025, v.accent, { y: 1.8, seg: 12 }); return { tip: 1.9, tipX: -.9, two: true }; },
  skipSign: (b, v) => { b.cyl(.04, .04, 1.4, K.steelD, { y: .55 }); return { tip: 1.5, sign: 'skip ad ▶', two: true }; },
  selfieStick: (b) => { b.cyl(.02, .025, 1.6, K.black, { y: .7 }).box(.14, .26, .03, 0x101014, { y: 1.55 }).box(.12, .22, .01, 0xffd1e6, { y: 1.55, z: .02 }); return { tip: 1.6, two: true }; },
  checkmark: (b, v) => { b.box(.06, .4, .06, K.black, { y: .1 }).box(.1, .5, .05, v.accent, { x: -.12, y: .5, rz: .6 }).box(.1, 1.1, .05, v.accent, { x: .2, y: .85, rz: -.5 }); return { tip: 1.3 }; },
  cable: (b, v) => { b.cyl(.03, .03, 1.1, 0x1a1a1a, { y: .5 }).box(.14, .2, .08, 0xe8e8e8, { y: 1.1 }).box(.06, .08, .02, K.steel, { y: 1.24 }); return { tip: 1.28 }; },
  feedBlade: (b, v) => { b.cyl(.04, .045, 1.9, 0x1a1522, { y: .6 });
    for (let i = 0; i < 8; i++) { const a = i * .17; b.box(.16 - i * .012, .14, .03, i % 2 ? 0xb4a8e0 : v.accent, { x: -Math.sin(a) * .7, y: 1.55 + (1 - Math.cos(a)) * .3, rz: a + .3 }); }
    return { tip: 1.9, tipX: -1.0, two: true }; },
  wireSword: (b) => { b.box(.1, .3, .1, 0x46ff8a, { y: 0 }).box(.5, .06, .1, 0x46ff8a, { y: .18 }).box(.22, 1.5, .05, 0x46ff8a, { y: .95 }); return { tip: 1.7, wire: true, two: true }; },
  redPen: (b, v) => { b.cyl(.05, .05, 1.7, v.accent, { y: .7 }).cone(.05, .2, 0xe8dcc0, { y: 1.65 }).cone(.015, .06, v.accent, { y: 1.78 }).box(.02, .5, .03, K.steel, { x: .05, y: .2 }); return { tip: 1.8, two: true }; },
  progressBar: (b, v) => { b.box(.06, .3, .06, K.black, { y: .05 }).box(.2, 1.6, .08, 0x1b1d24, { y: 1.0 });
    for (let i = 0; i < 7; i++) b.box(.14, .18, .02, v.accent, { y: .3 + i * .2, z: .05 }); return { tip: 1.8, two: true }; },
  powerMace: (b, v) => { b.cyl(.045, .05, 1.4, K.steelD, { y: .55 }).sphere(.19, 0xcfc8b4, { y: 1.35, seg: 12, rings: 8 })
    .torus(.1, .022, v.accent, { y: 1.35, z: .185, seg: 12, arc: Math.PI * 1.6, rz: Math.PI * .7 }).box(.03, .11, .02, v.accent, { y: 1.4, z: .19 }); return { tip: 1.5, two: true }; },
  needle: null,
};

function buildProp(id, v, mat) {
  const b = new PartBuilder();
  const spec = PROPS[id]?.(b, v) ?? { tip: 1 };
  const g = new THREE.Group();
  const m = b.build(spec.wire ? actorMaterial({ wire: true }) : mat);
  if (m) g.add(m);
  if (spec.sign) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(.8, .4), new THREE.MeshBasicMaterial({ map: labelTexture(spec.sign, { bg: '#111', fg: '#fff', px: 48, w: 256, h: 128 }), toneMapped: false, side: THREE.DoubleSide }));
    sign.position.y = 1.45; g.add(sign);
  }
  if (spec.glowTip) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(.05, 8, 6), glowMaterial(spec.glowTip));
    d.position.y = spec.tip; g.add(d);
  }
  const base = new THREE.Object3D(); base.position.y = spec.tip * 0.45;
  const tip = new THREE.Object3D(); tip.position.set(spec.tipX ?? 0, spec.tip, 0);
  g.add(base, tip);
  g.userData = { base, tip, two: !!spec.two };
  return g;
}

function buildClaw(v, mat, big = 1) {
  const b = new PartBuilder();
  b.blob(.22 * big, .18 * big, .3 * big, v.skin, { y: .08, z: .18 })
    .blob(.08 * big, .06 * big, .3 * big, v.skin, { x: .1 * big, y: .12, z: .45 * big, ry: -.2 })
    .blob(.08 * big, .06 * big, .28 * big, v.trim, { x: -.1 * big, y: .06, z: .44 * big, ry: .2 });
  return b.build(mat);
}

// ── extras ──────────────────────────────────────────────────────────────────
function dressExtras(rig, v, fx, mat) {
  const P = rig.parts, S = rig.spec, ex = v.extras ?? [];
  const dark = new THREE.Color(v.cloth).multiplyScalar(0.6).getHex();
  if (ex.includes('tabard')) P.chest.box(S.chestW * .6, S.chestH * .9, .04, v.accent, { y: S.chestH * .5, z: S.chestD * .52 })
    .box(S.chestW * .14, S.chestH * .5, .045, K.white, { y: S.chestH * .55, z: S.chestD * .53 });
  if (ex.includes('cardigan')) {
    P.chest.box(S.chestW * 1.06, S.chestH * .98, S.chestD * 1.06, v.cloth, { y: S.chestH * .5 })
      .box(S.chestW * .18, S.chestH * .98, .02, 0xe8e0d0, { y: S.chestH * .5, z: S.chestD * .54 });
    for (let i = 0; i < 4; i++) P.chest.sphere(.025, 0x3a2a1a, { x: .06, y: S.chestH * (.2 + i * .2), z: S.chestD * .55 });
  }
  if (ex.includes('shell')) {
    for (let i = 0; i < 4; i++) P.chest.blob(S.chestW * (.55 - i * .06), .1, .12, v.cloth, { y: S.chestH * (.9 - i * .24), z: -S.chestD * .5 });
  }
  if (ex.includes('tail')) for (let i = 0; i < 3; i++) P.pelvis.blob(.12 + i * .04, .05, .18, i === 2 ? v.trim : v.cloth, { y: -.1 - i * .12, z: -.3 - i * .08, rx: .6 });
  if (ex.includes('hoodie')) P.chest.blob(S.chestW * .5, .2, .22, v.cloth, { y: S.chestH + .05, z: -.2 })
    .cyl(.012, .012, .25, K.white, { x: .08, y: S.chestH * .75, z: S.chestD * .52 }).cyl(.012, .012, .25, K.white, { x: -.08, y: S.chestH * .75, z: S.chestD * .52 });
  if (ex.includes('cape')) P.chest.box(S.chestW * 1.1, S.chestH + S.torsoH + .5, .04, v.accent, { y: S.chestH - (S.chestH + S.torsoH + .5) / 2, z: -S.chestD * .56, rx: .08, shade: .4 });
  if (ex.includes('robe')) P.chest.box(S.chestW * 1.2, .14, S.chestD * 1.15, v.trim, { y: S.chestH * .92 });
  if (ex.includes('tie')) P.chest.box(.06, .06, .03, v.accent, { y: S.chestH * .9, z: S.chestD * .52 }).box(.08, S.chestH * .75, .025, v.accent, { y: S.chestH * .48, z: S.chestD * .52 });
  if (ex.includes('antenna')) P.head.cyl(.01, .01, .3, K.steelD, { x: .12, y: .6, z: -.05, rz: -.3 });
  if (ex.includes('halo')) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(.42, .03, 8, 32), glowMaterial(v.accent));
    halo.rotation.x = Math.PI / 2; halo.position.y = .95;
    rig.joints.head.add(halo); fx.glows.push(halo); fx.bob.push({ obj: halo, amp: .04, speed: 2 });
  }
  void dark; void mat;
}

// ── the robot vacuum: a disc with a knife arm ───────────────────────────────
function buildVacuum(v) {
  const mat = actorMaterial({ rim: v.trim, rimStrength: .5 });
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const b = new PartBuilder();
  b.cyl(1.05, 1.1, .32, v.skin, { y: .22, seg: 24 })
    .cyl(.95, .95, .04, v.cloth, { y: .4, seg: 24 })
    .cyl(.3, .3, .06, v.accent, { y: .42, z: -.2, seg: 16 })
    .box(1.2, .18, .18, 0x3a3c40, { y: .18, z: .98 })                            // bumper
    .cyl(.08, .08, .24, 0x555, { x: .7, y: .08, z: .55, rz: Math.PI / 2 })
    .cyl(.08, .08, .24, 0x555, { x: -.7, y: .08, z: .55, rz: Math.PI / 2 });
  const shell = b.build(mat); body.add(shell);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.98, .025, 6, 40), glowMaterial(v.trim));
  ring.rotation.x = Math.PI / 2; ring.position.y = .41; body.add(ring);
  // knife arm on a turret
  const turret = new THREE.Group(); turret.position.set(0, .45, .2); body.add(turret);
  const ab = new PartBuilder();
  ab.cyl(.14, .16, .16, 0x3a3c40, { y: .08 }).box(.08, .6, .08, 0x2a2c30, { y: .45, z: .1, rx: .5 });
  turret.add(ab.build(mat));
  const hand = new THREE.Group(); hand.position.set(0, .7, .35); turret.add(hand);
  const kb = new PartBuilder();
  kb.box(.07, .22, .06, 0x2a1a10, { y: 0 }).box(.14, .7, .02, K.steel, { y: .45, x: .02 }).box(.02, .7, .03, K.steelD, { y: .45, x: -.05 });
  const knife = kb.build(mat); knife.rotation.x = Math.PI / 2 - .3; hand.add(knife);
  const base = new THREE.Object3D(); base.position.y = .3; knife.add(base);
  const tip = new THREE.Object3D(); tip.position.y = .85; knife.add(tip);
  return { kind: 'vacuum', root, body, turret, knifeHand: hand, material: mat, fx: { ...extras(), glows: [ring] }, weapon: { userData: { base, tip } } };
}

// ── entry point ─────────────────────────────────────────────────────────────
export function buildBoss(def) {
  const v = def.visual;
  if (v.body === 'vacuum') return buildVacuum(v);
  if (v.body === 'frog') {
    const f = buildFrog(v.variant ?? 'other');
    const w = buildWeapon(v.weapon ?? 'needle', f.material);
    f.rig.joints.socket.add(w);
    return { kind: 'frog', rig: f.rig, root: f.rig.root, material: f.material, scarf: f.scarf, weapon: w, fx: extras(), twoHand: false, frog: f };
  }

  const rig = createRig(v.build ?? 'normal');
  const mat = actorMaterial({ rim: v.wire ? v.skin : 0xb0c4e0, rimStrength: v.wire ? .8 : .38, wire: !!v.wire });
  const fx = extras();
  dressBody(rig, v);
  const headGroup = new THREE.Group();
  const h = { b: rig.parts.head, group: headGroup, fx, mat };
  const scale = rig.spec.head;
  (HEADS[v.head] ?? HEADS.botcube)(h, v);
  dressExtras(rig, v, fx, mat);
  rig.finalize(mat);
  headGroup.scale.setScalar(scale);
  rig.joints.head.add(headGroup);
  // head parts built into the merged mesh also need the head-size scale
  for (const m of rig.joints.head.children) if (m.isMesh) m.scale.setScalar(scale);

  let weapon = null, twoHand = false;
  if (v.weapon === 'claws') {
    rig.joints.handR.add(buildClaw(v, mat, 1.3));
    rig.joints.handL.add(buildClaw(v, mat, 1.0));
    const base = new THREE.Object3D(), tip = new THREE.Object3D(); tip.position.set(0, -.2, .6);
    rig.joints.handR.add(base, tip);
    weapon = { userData: { base, tip } };
  } else if (v.weapon && v.weapon !== 'none') {
    weapon = buildProp(v.weapon, v, mat);
    rig.joints.socket.add(weapon);
    twoHand = weapon.userData.two;
  }
  return { kind: 'humanoid', rig, root: rig.root, material: mat, weapon, fx, twoHand };
}
