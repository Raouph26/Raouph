import * as THREE from 'three';
import { PartBuilder } from './builder.js';

// Player weapons, authored blade-along-+y from the grip at the origin. Each
// carries `base` and `tip` nodes: the trail ribbon is drawn between them.

const STEEL = 0xb8c0c6, STEEL_D = 0x8a9298, WRAP = 0x3d2f22, DARK = 0x221c17, BRASS = 0xb89146;

const BUILDERS = {
  cleaver(b) {
    grip(b, .26);
    b.box(.32, .05, .1, STEEL_D, { y: .02 })                                  // guard
      .box(.05, .1, .08, STEEL_D, { x: .14, y: -.03 })
      .box(.05, .1, .08, STEEL_D, { x: -.14, y: -.03 })
      .box(.19, .78, .035, STEEL, { y: .45 })                                 // blade
      .box(.05, .7, .045, STEEL_D, { y: .44 })                                // fuller
      .box(.045, .76, .05, DARK, { x: -.085, y: .45 })                        // spine
      .box(.1, .28, .033, STEEL, { x: .05, y: .82 })                          // forward weight
      .cone(.1, .18, STEEL, { y: .96, ry: Math.PI / 4, seg: 4 });
    return { base: .08, tip: 1.02 };
  },
  needle(b) {
    grip(b, .24);
    b.torus(.085, .014, STEEL_D, { y: .03, rx: Math.PI / 2, seg: 10 })
      .box(.28, .025, .025, STEEL_D, { y: .03 })
      .box(.022, .025, .12, STEEL_D, { x: .13, y: .06 })
      .box(.04, 1.12, .04, STEEL, { y: .62 })
      .box(.014, 1.08, .058, STEEL_D, { y: .62 })
      .cone(.028, .16, STEEL, { y: 1.26, seg: 4 });
    return { base: .1, tip: 1.32 };
  },
  banhammer(b) {
    b.box(.075, 1.2, .075, WRAP, { y: .38 })                                  // long haft
      .box(.09, .05, .09, DARK, { y: -.2 })
      .box(.09, .05, .09, DARK, { y: .2 })
      .box(.09, .05, .09, DARK, { y: .5 })
      .box(.36, .34, .3, 0x5f5a54, { y: 1.08 })                              // head
      .box(.06, .3, .27, STEEL, { x: .2, y: 1.08 })
      .box(.06, .3, .27, STEEL, { x: -.2, y: 1.08 })
      .box(.38, .07, .32, 0xc0392b, { y: 1.08 })                             // the red stripe of authority
      .box(.05, .05, .05, BRASS, { x: .1, y: 1.22, z: .15 })
      .box(.05, .05, .05, BRASS, { x: -.1, y: 1.22, z: .15 })
      .box(.05, .05, .05, BRASS, { x: .1, y: .94, z: .15 })
      .box(.05, .05, .05, BRASS, { x: -.1, y: .94, z: .15 });
    return { base: .9, tip: 1.26 };
  },
  lance(b) {
    b.cyl(.035, .04, 2.0, 0x6b4a2a, { y: .55, seg: 6 })
      .cyl(.05, .05, .1, BRASS, { y: 1.5, seg: 6 })
      .shape([[0, 0], [.09, .12], [.05, .42], [0, .52], [-.05, .42], [-.09, .12]], .03, STEEL, { y: 1.52 })
      .box(.015, .4, .04, STEEL_D, { y: 1.78 })
      .box(.05, .14, .01, 0x3f8cff, { x: .06, y: 1.42, z: .03 })            // an ID lanyard
      .box(.09, .06, .012, 0xf2f2f2, { x: .06, y: 1.33, z: .03 });
    return { base: 1.55, tip: 2.02 };
  },
  doomscroll(b) {
    b.cyl(.035, .04, 1.9, 0x2a2233, { y: .5, seg: 6 })
      .cyl(.05, .05, .08, 0xc28bff, { y: 1.42, seg: 6 })
      .box(.1, .12, .1, DARK, { y: 1.5 });
    // a curved blade from boxes along an arc
    for (let i = 0; i < 9; i++) {
      const t = i / 8, a = t * 1.35;
      const r = .62;
      b.box(.14 - t * .09, .12, .03, i % 2 ? 0x9aa0b8 : 0xb4bad0, { x: -Math.sin(a) * r, y: 1.52 + (Math.cos(a) - 1) * -r * .35 + t * .18, rz: a + .3 });
    }
    b.box(.02, .02, .02, 0xc28bff, { x: -.2, y: 1.6 });
    return { base: 1.4, tip: 1.75, tipX: -.62 };
  },
};

function grip(b, len) {
  for (let i = 0; i < 3; i++) b.box(.07, len / 3, .07, i % 2 ? WRAP : DARK, { y: -len / 2 + (i + .5) * (len / 3) - .04 });
  b.box(.09, .06, .09, BRASS, { y: -len / 2 - .07 });
}

export function buildWeapon(id, material) {
  const b = new PartBuilder();
  const spec = (BUILDERS[id] ?? BUILDERS.cleaver)(b);
  const g = new THREE.Group();
  const mesh = b.build(material);
  g.add(mesh);
  const base = new THREE.Object3D(); base.position.set(0, spec.base, 0);
  const tip = new THREE.Object3D(); tip.position.set(spec.tipX ?? 0, spec.tip, 0);
  g.add(base, tip);
  g.userData = { base, tip, id };
  return g;
}
