import * as THREE from 'three';
import { createRig } from './rig.js';
import { actorMaterial, glowMaterial, PartBuilder } from './builder.js';

// ─────────────────────────────────────────────────────────────────────────────
// The frog. A knight of the pond: faceted head, gold slit-pupil eyes, throat
// sac, fingertip pads, webbed feet, a leather harness, one pauldron on the
// sword arm and a crimson scarf that trails behind (secondary motion lives in
// the view). THE OTHER FROG is the same body in the wrong colours.
// ─────────────────────────────────────────────────────────────────────────────

export const FROG_PALETTES = {
  hero: {
    // green frog, blue tunic, red scarf: three colours no arena shares, so the frog always reads
    skin: 0x5e9a3c, skinDark: 0x42702c, belly: 0xe2dcae, eye: 0xf1ead2, iris: 0xe0a93a, pupil: 0x0e0d0b,
    cloth: 0x33507c, leather: 0x74502d, metal: 0x9aa1a8, scarf: 0xc0282c, trim: 0xc99f4c, flask: 0x8dff72,
    pad: 0x2e8a4c, padRim: 0x7cc466, padVein: 0x1f6636, lotus: 0xf4a0c4, lotusHeart: 0xffd35a,
    rim: 0xffe3b8,
  },
  other: {
    skin: 0x2f2839, skinDark: 0x1d1826, belly: 0x6c5f7c, eye: 0xf1e6e6, iris: 0xd1452e, pupil: 0x080608,
    cloth: 0x141118, leather: 0x3a2c3c, metal: 0x6d6c7c, scarf: 0x3a1f55, trim: 0xc9a34e, flask: 0xff5a8a,
    pad: 0x3b2a4d, padRim: 0x7a5a9a, padVein: 0x24182f, lotus: 0xc03a5a, lotusHeart: 0xffb84a,
    rim: 0xd08bff,
  },
};

/** @param over palette overrides (armour colours: cloth, metal, trim) */
export function buildFrog(variant = 'hero', over = null) {
  const C = { ...(FROG_PALETTES[variant] ?? FROG_PALETTES.hero), ...(over ?? {}) };
  // wet skin, glassy eyes, brass and steel that shine, cloth that doesn't
  const hints = new Map([
    [C.skin, { rough: .36 }], [C.skinDark, { rough: .4 }], [C.belly, { rough: .5 }],
    [C.eye, { rough: .1 }], [C.iris, { rough: .15 }], [C.pupil, { rough: .15 }],
    [C.metal, { rough: .3, metal: .85 }], [C.trim, { rough: .28, metal: .9 }],
    [C.leather, { rough: .62 }], [C.cloth, { rough: .9 }], [C.scarf, { rough: .78 }],
    [C.pad, { rough: .42 }], [C.padRim, { rough: .5 }], [C.padVein, { rough: .5 }], [C.lotus, { rough: .6 }],
  ]);
  const rig = createRig('frog', hints);
  const P = rig.parts, S = rig.spec;

  // ── pelvis: hip wrap, belt, pouches, the dew flask ─────────────────────────
  P.pelvis.cyl(.27, .25, .24, C.cloth, { y: .02, seg: 7 })
    .box(.60, .08, .48, C.leather, { y: .12 })
    .box(.11, .09, .05, C.trim, { y: .12, z: .245 })
    .box(.12, .13, .09, C.leather, { x: -.27, y: .06, z: .12, ry: -.3 })          // pouch (right)
    .box(.20, .30, .04, C.cloth, { y: -.14, z: .20, rx: .08, shade: .35 })         // front tabard
    .box(.26, .34, .04, C.cloth, { y: -.14, z: -.22, rx: -.1, shade: .35 })        // back tabard
    .cyl(.045, .05, .14, C.flask, { x: .29, y: .04, z: .08 })                      // flask (left hip, the drinking hand)
    .cyl(.03, .03, .04, C.trim, { x: .29, y: .13, z: .08 });

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

  // ── the lily-pad buckler, strapped to the back of the left forearm ─────────
  // (a notched pad, a lighter rim, dark veins, a lotus for a boss)
  const fl = S.foreLen, bz = -.085, pad = [];
  const notch = .24, R = .235;
  pad.push([0, 0]);
  for (let i = 0; i <= 22; i++) {
    const a = Math.PI / 2 + notch + (i / 22) * (Math.PI * 2 - notch * 2);
    pad.push([Math.cos(a) * R, Math.sin(a) * R]);
  }
  const padRim = pad.map(([x, y]) => [x * 1.09, y * 1.09]);
  P.foreL.shape(padRim, .02, C.padRim, { y: -fl * .55, z: bz + .006 })
    .shape(pad, .026, C.pad, { y: -fl * .55, z: bz - .004 });
  for (let v = 0; v < 7; v++) {
    const a = Math.PI / 2 + notch + .35 + (v / 6) * (Math.PI * 2 - notch * 2 - .7);
    P.foreL.box(.012, R * .82, .008, C.padVein, { x: Math.cos(a) * R * .44, y: -fl * .55 + Math.sin(a) * R * .44, z: bz - .02, rz: a - Math.PI / 2 });
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    P.foreL.blob(.034, .05, .02, C.lotus, { x: Math.cos(a) * .036, y: -fl * .55 + Math.sin(a) * .036, z: bz - .034, rz: a - Math.PI / 2 });
  }
  P.foreL.sphere(.026, C.lotusHeart, { y: -fl * .55, z: bz - .046, seg: 8, rings: 5 })
    .box(.03, .12, .06, C.leather, { y: -fl * .55, z: bz + .04 });                // the strap

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

  // scarf tails: a chain of joints the view animates as a spring; their cloth
  // is part of the one skinned body mesh
  const scarf = [];
  for (const sx of [-1, 1]) {
    const segs = [];
    const anchor = new THREE.Group();
    anchor.position.set(sx * .09, S.chestH - .02, -.22);
    rig.joints.chest.add(anchor);
    let parent = anchor;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group();
      seg.position.y = i === 0 ? 0 : -.13;
      parent.add(seg);
      const cloth = new PartBuilder(hints);
      cloth.box(.12 - i * .012, .14, .025, new THREE.Color(C.scarf).multiplyScalar(1 - i * .06).getHex(), { y: -.065, rough: .78 });
      rig.extraSkin.push({ bone: seg, geo: cloth.geometry() });
      segs.push(seg);
      parent = seg;
    }
    scarf.push({ anchor, segs, side: sx, state: segs.map(() => ({ ax: 0, az: 0, vx: 0, vz: 0 })) });
  }

  const mat = actorMaterial({ rim: C.rim, rimStrength: 0.5 });
  rig.finalize(mat);

  // glowing dew in the flask — its own unlit bit so it survives the dark
  const dewMat = glowMaterial(C.flask);
  const dew = new THREE.Mesh(new THREE.CylinderGeometry(.03, .035, .08, 6), dewMat);
  dew.position.set(.29, .04, .08);
  rig.joints.pelvis.add(dew);

  // the bottle in hand while drinking (the hip one hides meanwhile)
  const bottle = new THREE.Group();
  const bb = new PartBuilder(new Map([[0xcfe8d0, { rough: .08 }]]));
  bb.cyl(.05, .055, .13, 0xcfe8d0, { y: -.1, seg: 7 })
    .cyl(.022, .03, .05, 0xcfe8d0, { y: -.19, seg: 6 })
    .cyl(.026, .026, .03, C.leather, { y: -.225, seg: 6 });
  const bm = bb.build(mat); bm.castShadow = false; bottle.add(bm);
  const dew2 = new THREE.Mesh(new THREE.CylinderGeometry(.04, .046, .1, 7), dewMat);
  dew2.position.y = -.095; bottle.add(dew2);
  bottle.position.set(0, -.04, .05);
  bottle.rotation.x = -.35;
  bottle.visible = false;
  rig.joints.handL.add(bottle);

  return { rig, material: mat, scarf, palette: C, kind: 'frog', variant, bottle, hipDew: dew };
}
