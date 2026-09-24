import * as THREE from 'three';
import { createRig } from './rig.js';
import { actorMaterial, glowMaterial } from './builder.js';

// ─────────────────────────────────────────────────────────────────────────────
// The frog. A knight of the pond: faceted head, gold slit-pupil eyes, throat
// sac, fingertip pads, webbed feet, a leather harness, one pauldron on the
// sword arm and a crimson scarf that trails behind (secondary motion lives in
// the view). THE OTHER FROG is the same body in the wrong colours.
// ─────────────────────────────────────────────────────────────────────────────

export const FROG_PALETTES = {
  hero: {
    skin: 0x557f3c, skinDark: 0x3c5f2c, belly: 0xd8d2a2, eye: 0xe9e2c9, iris: 0xe0a93a, pupil: 0x0e0d0b,
    cloth: 0x2d2721, leather: 0x6e4c2b, metal: 0x8e959b, scarf: 0xa3242a, trim: 0xb89146, flask: 0x8dff72,
    rim: 0xa8c7ff,
  },
  other: {
    skin: 0x2f2839, skinDark: 0x1d1826, belly: 0x6c5f7c, eye: 0xf1e6e6, iris: 0xd1452e, pupil: 0x080608,
    cloth: 0x141118, leather: 0x3a2c3c, metal: 0x6d6c7c, scarf: 0x3a1f55, trim: 0xc9a34e, flask: 0xff5a8a,
    rim: 0xd08bff,
  },
};

export function buildFrog(variant = 'hero') {
  const C = FROG_PALETTES[variant] ?? FROG_PALETTES.hero;
  const rig = createRig('frog');
  const P = rig.parts, S = rig.spec;

  // ── pelvis: hip wrap, belt, pouches, the dew flask ─────────────────────────
  P.pelvis.cyl(.27, .25, .24, C.cloth, { y: .02, seg: 7 })
    .box(.60, .08, .48, C.leather, { y: .12 })
    .box(.11, .09, .05, C.trim, { y: .12, z: .245 })
    .box(.12, .13, .09, C.leather, { x: .27, y: .06, z: .12, ry: .3 })            // pouch (left)
    .box(.20, .30, .04, C.cloth, { y: -.14, z: .20, rx: .08, shade: .35 })         // front tabard
    .box(.26, .34, .04, C.cloth, { y: -.14, z: -.22, rx: -.1, shade: .35 })        // back tabard
    .cyl(.045, .05, .14, C.flask, { x: -.29, y: .04, z: .08 })                     // flask (right hip)
    .cyl(.03, .03, .04, C.trim, { x: -.29, y: .13, z: .08 });

  // ── torso: round belly, tunic, harness straps ──────────────────────────────
  P.spine.cyl(.28, .26, S.torsoH, C.cloth, { y: S.torsoH / 2, seg: 8 })
    .blob(.2, .17, .06, C.belly, { y: .2, z: .235 })
    .box(.07, .5, .04, C.leather, { x: -.06, y: .22, z: .27, rz: .55 })            // diagonal strap
    .box(.07, .5, .04, C.leather, { x: .06, y: .22, z: -.27, rz: -.55 });

  // ── chest: barrel chest, cuirass, pauldron, scarf wrap ─────────────────────
  P.chest.cyl(.30, .29, S.chestH, C.skin, { y: S.chestH / 2, seg: 8 })
    .blob(.2, .12, .05, C.belly, { y: .3, z: .255 })                               // throat/chest pale
    .box(.60, .22, .12, C.leather, { y: .12, z: .22, shade: .3 })                  // cuirass front
    .box(.58, .26, .1, C.leather, { y: .14, z: -.25, shade: .3 })                  // cuirass back
    .box(.05, .24, .02, C.trim, { x: .14, y: .12, z: .285 })
    .box(.05, .24, .02, C.trim, { x: -.14, y: .12, z: .285 })
    .blob(.17, .10, .16, C.metal, { x: -.33, y: .33, z: 0, rz: .35 })            // pauldron (sword arm)
    .blob(.13, .07, .13, C.metal, { x: -.34, y: .27, z: 0, rz: .5 })
    .box(.04, .04, .18, C.trim, { x: -.4, y: .36, z: 0, rz: .35 })
    .torus(.2, .07, C.scarf, { y: S.chestH - .02, rx: Math.PI / 2, tseg: 5, seg: 10 })  // scarf wrap
    .blob(.12, .1, .06, C.scarf, { x: .08, y: S.chestH - .04, z: .2 });            // scarf knot

  // ── head: wide faceted frog head, big domed eyes, throat sac ───────────────
  const hy = .1;
  P.head.blob(.31, .19, .29, C.skin, { y: hy + .06, z: .03, detail: 1 })
    .blob(.29, .1, .27, C.skin, { y: hy - .03, z: .05 })                            // jaw
    .blob(.21, .09, .14, C.belly, { y: hy - .09, z: .15 })                          // throat sac
    .box(.46, .02, .03, 0x1a1512, { y: hy - .005, z: .29, rx: -.05 })              // mouth line
    .blob(.06, .03, .05, C.skinDark, { x: .1, y: hy + .2, z: -.08 })               // spots
    .blob(.05, .025, .04, C.skinDark, { x: -.12, y: hy + .19, z: -.14 })
    .blob(.04, .02, .03, C.skinDark, { x: .02, y: hy + .22, z: .08 })
    .sphere(.015, 0x0e0d0b, { x: .05, y: hy + .13, z: .3 })                        // nostrils
    .sphere(.015, 0x0e0d0b, { x: -.05, y: hy + .13, z: .3 });
  for (const sx of [-1, 1]) {
    P.head.blob(.11, .1, .11, C.skin, { x: sx * .16, y: hy + .23, z: .09 })          // eye socket bump
      .sphere(.092, C.eye, { x: sx * .165, y: hy + .27, z: .12, seg: 12, rings: 8 })  // eyeball
      .blob(.06, .06, .02, C.iris, { x: sx * .175, y: hy + .275, z: .205 })          // iris
      .box(.07, .018, .02, C.pupil, { x: sx * .176, y: hy + .276, z: .222 })         // horizontal slit
      .blob(.1, .035, .08, C.skin, { x: sx * .165, y: hy + .35, z: .11, rz: sx * -.25 }); // lid ridge
  }

  // ── arms: skin, bracers, three fingers with fingertip pads ─────────────────
  for (const side of ['R', 'L']) {
    const up = P['upper' + side], fo = P['fore' + side], ha = P['hand' + side];
    up.cyl(.085, .075, S.upperLen, C.skin, { y: -S.upperLen / 2, seg: 6 })
      .blob(.09, .07, .09, C.skin, { y: -.02 });
    fo.cyl(.075, .065, S.foreLen, C.skin, { y: -S.foreLen / 2, seg: 6 })
      .cyl(.085, .08, .16, C.leather, { y: -S.foreLen * .55, seg: 6, shade: .3 })
      .box(.02, .14, .02, C.trim, { y: -S.foreLen * .55, z: .085 });
    ha.blob(.075, .06, .07, C.skin, { y: -.05 });
    for (const f of [-1, 0, 1]) {
      ha.box(.03, .1, .03, C.skin, { x: f * .04, y: -.12, z: .02, rx: -.2 })
        .sphere(.026, C.belly, { x: f * .04, y: -.18, z: .035, seg: 6, rings: 4 });
    }
  }

  // ── legs: cloth breeches, frog shins, big webbed feet ──────────────────────
  for (const side of ['R', 'L']) {
    const th = P['thigh' + side], sh = P['shin' + side], ft = P['foot' + side];
    th.cyl(.13, .1, S.thighLen, C.cloth, { y: -S.thighLen / 2, seg: 7 })
      .cyl(.115, .115, .08, C.leather, { y: -S.thighLen + .03, seg: 7 });
    sh.cyl(.085, .065, S.shinLen, C.skin, { y: -S.shinLen / 2, seg: 6 })
      .blob(.08, .06, .07, C.skinDark, { y: -.06, z: -.03 });
    ft.blob(.1, .05, .12, C.skin, { y: -.035, z: .06 });
    for (const t of [-1, 0, 1]) {
      ft.box(.035, .03, .15, C.skin, { x: t * .06, y: -.05, z: .19, ry: t * .25 })
        .sphere(.028, C.belly, { x: t * .085, y: -.05, z: .27, seg: 6, rings: 4 });
    }
    ft.box(.2, .008, .11, C.skinDark, { y: -.058, z: .19 });                        // webbing
  }

  const mat = actorMaterial({ rim: C.rim, rimStrength: 0.42 });
  rig.finalize(mat);

  // glowing dew in the flask — its own unlit bit so it survives the dark
  const dew = new THREE.Mesh(new THREE.CylinderGeometry(.03, .035, .08, 6), glowMaterial(C.flask));
  dew.position.set(-.29, .04, .08);
  rig.joints.pelvis.add(dew);

  // scarf tails: anchors the view animates as a spring chain
  const scarf = [];
  for (const sx of [-1, 1]) {
    const segs = [];
    let parent = rig.joints.chest;
    const anchor = new THREE.Group();
    anchor.position.set(sx * .09, S.chestH - .02, -.22);
    rig.joints.chest.add(anchor);
    parent = anchor;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group();
      seg.position.y = i === 0 ? 0 : -.13;
      const m = new THREE.Mesh(new THREE.BoxGeometry(.12 - i * .012, .14, .025), mat);
      m.position.y = -.065;
      m.castShadow = true;
      seg.add(m);
      parent.add(seg);
      segs.push(seg);
      parent = seg;
    }
    scarf.push({ anchor, segs, side: sx, state: segs.map(() => ({ ax: 0, az: 0, vx: 0, vz: 0 })) });
  }

  return { rig, material: mat, scarf, palette: C, kind: 'frog', variant };
}
