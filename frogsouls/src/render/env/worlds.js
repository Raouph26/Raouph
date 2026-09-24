import * as THREE from 'three';
import { PartBuilder, glowMaterial, actorMaterial } from '../kit/builder.js';
import { feedTexture, labelTexture } from '../textures.js';
import { envMat, instanced, ring, mesh, reedsProto, lilyProto, deadTree, rock, seed, rnd, range } from './props.js';

// ─────────────────────────────────────────────────────────────────────────────
// The places. Each builder dresses a group around the playable ring (r ≤ 19)
// and says what its floor, water and air are like. Anything that moves gets an
// update(dt, t) so the world feels alive while you wait for a boss to swing.
// ─────────────────────────────────────────────────────────────────────────────

export const ENVS = {
  // ══ THE LILY — the hub ═════════════════════════════════════════════════════
  hub(g) {
    seed(11);
    const m = envMat();
    // the pad's raised rim
    mesh(g, (b) => b.torus(20.2, .45, 0x2a5c33, { rx: Math.PI / 2, y: .05, seg: 48, tseg: 6 }), m);
    instanced(g, lilyProto, 70, () => { const p = ring(0, 23, 60); return { x: p.x, y: -.2, z: p.z, ry: rnd() * 6.28, s: range(1.2, 3.2) }; }, m);
    instanced(g, reedsProto, 160, () => { const p = ring(0, 26, 44, 3); return { x: p.x, y: -.3, z: p.z, ry: rnd() * 6.28, s: range(1.2, 2.2) }; }, m);
    // lotus flowers that glow faintly
    const lotus = new THREE.InstancedMesh(new THREE.ConeGeometry(.35, .5, 6), glowMaterial(0xff9ac2), 26);
    const mm = new THREE.Matrix4();
    for (let i = 0; i < 26; i++) { const p = ring(0, 22.5, 50); mm.makeTranslation(p.x, .05, p.z); lotus.setMatrixAt(i, mm); }
    g.add(lotus);
    for (const [x, z, h] of [[-40, -30, 14], [45, -20, 11], [30, 42, 12], [-38, 36, 10]]) deadTree(g, x, z, h, 1.4);
    const toad = buildToad(); toad.position.set(0, 0, -8.5); g.add(toad);
    return {
      ground: 'lily', water: { deep: 0x040a10, shallow: 0x10222e, sky: 0x1a2a38, light: 0xbcd2ff },
      ambient: { color: 0xd8ff8a, count: 260, size: 7, drift: [0, .05, 0], wobble: 1.2, blink: 1, height: 7, opacity: .9 },
      toad,
      update(dt, t) { toad.userData.update?.(dt, t); },
    };
  },

  // ══ THE POND ═══════════════════════════════════════════════════════════════
  pond(g) {
    seed(21);
    const m = envMat();
    instanced(g, reedsProto, 320, () => { const p = ring(0, 20.2, 27, 2); return { x: p.x, y: -.2, z: p.z, ry: rnd() * 6.28, s: range(1, 2.1) }; }, m);
    instanced(g, lilyProto, 90, () => { const p = ring(0, 22, 55); return { x: p.x, y: -.2, z: p.z, ry: rnd() * 6.28, s: range(1, 2.6) }; }, m);
    instanced(g, (b) => rock(b, 1, 0x3c4636), 26, () => { const p = ring(0, 19.8, 22); return { x: p.x, y: -.1, z: p.z, ry: rnd() * 6, s: range(.8, 1.8) }; }, m);
    for (let i = 0; i < 9; i++) { const p = ring(0, 28, 48); deadTree(g, p.x, p.z, range(8, 15), range(1, 1.6)); }
    // a fallen log half in the water
    mesh(g, (b) => b.cyl(.7, .8, 9, 0x2e241b, { rz: Math.PI / 2, ry: .6, y: .2, seg: 7 }).cyl(.4, .5, 2, 0x2e241b, { x: 3, y: .9, rz: 1, seg: 6 }), m).position.set(-24, 0, 6);
    return {
      ground: 'mud', water: { deep: 0x06120f, shallow: 0x1b3a32, sky: 0x2a4034, light: 0xc8e08a },
      ambient: { color: 0xe0ff7a, count: 320, size: 7, drift: [0, .03, 0], wobble: 1.4, blink: 1, height: 6, opacity: .95 },
    };
  },

  // ══ THE COMMENT SECTION ════════════════════════════════════════════════════
  comments(g) {
    seed(31);
    const m = envMat();
    // every tombstone is somebody's comment
    instanced(g, (b) => {
      b.box(1.1, 1.6, .3, 0x6a6c72, { y: .8, shade: .35 }).box(.8, .5, .02, 0x9a9ca2, { y: 1.05, z: .16 })
        .box(.5, .05, .02, 0x3a3c42, { y: 1.18, z: .175 }).box(.35, .05, .02, 0x3a3c42, { y: 1.02, z: .175 })
        .box(.12, .12, .02, 0xc0392b, { x: .25, y: .82, z: .175 });
    }, 260, () => { const p = ring(0, 21, 52, 2); return { x: p.x, z: p.z, ry: -p.a + range(-.4, .4) + Math.PI, rz: range(-.15, .15), s: range(.8, 1.8) }; }, m);
    // a broken low wall marks the edge
    instanced(g, (b) => b.box(3, .9, .7, 0x4a4b50, { y: .45, shade: .4 }), 26, (i) => {
      const a = (i / 26) * Math.PI * 2; return { x: Math.sin(a) * 20.6, z: Math.cos(a) * 20.6, ry: a, sy: range(.4, 1.3) };
    }, m);
    // speech-bubble monoliths looming in the fog
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + .4, r = range(34, 46);
      const mono = mesh(g, (b) => {
        b.box(7, 5, 1.2, 0xb8bac0, { y: 9 }).box(6, 6, 1.1, 0xb8bac0, { y: 9 }).shape([[0, 0], [1.6, 0], [0, -2]], 1, 0xb8bac0, { x: -1, y: 6 })
          .box(.8, 6, .8, 0x4a4b50, { y: 3 });
        for (let d = -1; d <= 1; d++) b.sphere(.5, 0x2a2c32, { x: d * 1.6, y: 9, z: .7 });
      }, m);
      mono.position.set(Math.sin(a) * r, 0, Math.cos(a) * r); mono.rotation.y = a + Math.PI;
    }
    return {
      ground: 'flagstone',
      ambient: { color: 0x9a9ca4, count: 700, size: 5, drift: [.2, -.6, .1], wobble: .6, blink: 0, height: 16, opacity: .55, additive: false },
    };
  },

  // ══ THE BACK OFFICE ════════════════════════════════════════════════════════
  office(g) {
    seed(41);
    const m = envMat();
    // cubicle walls in a grid, cleared out of the fight ring
    const cells = [];
    for (let x = -48; x <= 48; x += 6) for (let z = -48; z <= 48; z += 6) if (Math.hypot(x, z) > 23) cells.push([x, z]);
    instanced(g, (b) => b.box(5.6, 1.8, .15, 0x8e8a84, { y: .9, shade: .2 }).box(5.6, .08, .2, 0x5a5854, { y: 1.8 }), cells.length * 2, (i) => {
      const [x, z] = cells[i >> 1]; return i % 2 ? { x, z: z - 3 } : { x: x - 3, z, ry: Math.PI / 2 };
    }, m);
    // desks, monitors, chairs
    instanced(g, (b) => {
      b.box(2.2, .08, 1, 0xd8d2c4, { y: .75 }).box(.08, .75, .9, 0x7a766e, { x: -1, y: .37 }).box(.08, .75, .9, 0x7a766e, { x: 1, y: .37 })
        .box(.7, .45, .06, 0x1c1c20, { y: 1.12, z: -.25 }).box(.1, .3, .1, 0x3a3a3e, { y: .9, z: -.25 })
        .box(.5, .05, .2, 0xe8e4dc, { y: .8, z: .1 })
        .cyl(.25, .25, .08, 0x2a2a2e, { x: .2, y: .5, z: .7, seg: 8 }).box(.5, .6, .08, 0x2a2a2e, { x: .2, y: .85, z: .95 });
    }, cells.length, (i) => { const [x, z] = cells[i]; return { x: x - 1.5, z: z - 1.2, ry: rnd() < .5 ? 0 : Math.PI / 2 }; }, m);
    // monitor glow
    const glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(.62, .38), glowMaterial(0x9fc4ff), cells.length);
    const mm = new THREE.Matrix4();
    cells.forEach(([x, z], i) => { mm.makeTranslation(x - 1.5, 1.12, z - 1.2 - .215); glow.setMatrixAt(i, mm); });
    g.add(glow);
    // fluorescent panels overhead, one of them flickering
    const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(3, .1, .8), glowMaterial(0xf8f6ee), 60);
    for (let i = 0; i < 60; i++) { const p = ring(0, 0, 45); mm.makeTranslation(p.x, 9.5, p.z); panels.setMatrixAt(i, mm); }
    g.add(panels);
    const flicker = new THREE.Mesh(new THREE.BoxGeometry(3, .1, .8), glowMaterial(0xf8f6ee)); flicker.position.set(4, 9.5, -6); g.add(flicker);
    // the water cooler and a plant that gave up
    mesh(g, (b) => b.box(.6, 1.1, .6, 0xe8e4dc, { y: .55 }).cyl(.3, .3, .6, 0x6fb3ff, { y: 1.4, seg: 10 }), m).position.set(21.5, 0, 3);
    mesh(g, (b) => b.cyl(.35, .28, .5, 0x8a5a3a, { y: .25, seg: 8 }).cone(.5, 1.2, 0x7a6a3a, { y: 1.1, seg: 5 }), m).position.set(-21, 0, -6);
    return {
      ground: 'carpet',
      ambient: { color: 0xffffff, count: 380, size: 4, drift: [.05, .03, 0], wobble: .8, blink: 0, height: 9, opacity: .45 },
      update(dt, t) { flicker.visible = Math.sin(t * 37) + Math.sin(t * 11.3) > -1.2; },
    };
  },

  // ══ THE 3 A.M. FEED ════════════════════════════════════════════════════════
  feed(g) {
    seed(51);
    const m = envMat();
    mesh(g, (b) => b.cyl(19.5, 19.5, .04, 0x2c2c36, { y: .02, seg: 48 }).cyl(18.2, 18.2, .045, 0x363644, { y: .025, seg: 48 }), m);
    // phones, towering and scrolling
    const phones = [];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + range(-.2, .2), r = range(27, 42), h = range(6, 10);
      const ph = new THREE.Group();
      const body = mesh(ph, (b) => b.box(h * .52, h, .5, 0x0d0e12, { y: 0 }).box(h * .12, .08, .06, 0x2a2a2e, { y: h * .45, z: .27 }), m);
      body.castShadow = false;
      const tex = feedTexture(i + 3).clone(); tex.needsUpdate = true; tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, .6);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(h * .46, h * .88), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      scr.position.z = .26; ph.add(scr);
      ph.position.set(Math.sin(a) * r, h * .5 + range(.5, 3), Math.cos(a) * r);
      ph.rotation.y = a + Math.PI + range(-.3, .3); ph.rotation.z = range(-.08, .08);
      g.add(ph);
      phones.push({ ph, tex, speed: range(.03, .09), bob: rnd() * 6 });
    }
    // the one warm lamp everything is lit by
    const lamp = mesh(g, (b) => b.cyl(.15, .2, 14, 0x2a2420, { y: 7, seg: 8 }).cyl(2.4, 3.2, 2.2, 0xe8c79a, { y: 14.2, seg: 10 }).cyl(1.2, 1.2, .4, 0x2a2420, { y: .2, seg: 10 }), m);
    const a0 = (118 * Math.PI) / 180;
    lamp.position.set(Math.sin(a0 + .35) * 34, 0, Math.cos(a0 + .35) * 34);
    lamp.castShadow = false;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8), glowMaterial(0xffc27a)); bulb.position.set(lamp.position.x, 13.4, lamp.position.z); g.add(bulb);
    // charging cables snaking across the floor
    for (let i = 0; i < 6; i++) {
      const pts = []; let x = range(-40, 40), z = range(-40, 40);
      for (let k = 0; k < 8; k++) { pts.push(new THREE.Vector3(x, .06, z)); x += range(-6, 6); z += range(-6, 6); }
      const curve = new THREE.CatmullRomCurve3(pts.filter((p) => Math.hypot(p.x, p.z) > 20));
      if (curve.points.length < 2) continue;
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, .06, 4), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: .6 })));
    }
    // unread notifications floating in the dark
    const notes = [];
    for (let i = 0; i < 16; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(String(Math.floor(range(1, 99))), { w: 128, h: 128, bg: '#ff3b30', fg: '#fff', px: 64, radius: 64 }), fog: true }));
      const p = ring(0, 22, 40); sp.position.set(p.x, range(3, 9), p.z); sp.scale.setScalar(range(.8, 1.6));
      g.add(sp); notes.push({ sp, y: sp.position.y, o: rnd() * 6 });
    }
    return {
      ground: 'planks',
      ambient: { color: 0xffb257, count: 160, size: 26, drift: [0, .08, 0], wobble: 1.5, blink: .6, height: 12, opacity: .35 },
      update(dt, t) {
        for (const p of phones) { p.tex.offset.y -= p.speed * dt; p.ph.position.y += Math.sin(t * .8 + p.bob) * .004; }
        for (const n of notes) n.sp.position.y = n.y + Math.sin(t * 1.3 + n.o) * .4;
      },
    };
  },

  // ══ THE SERVER FARM ════════════════════════════════════════════════════════
  server(g) {
    seed(61);
    const m = envMat();
    const racks = [];
    for (let row = -9; row <= 9; row++) for (let k = -26; k <= 26; k++) {
      const x = k * 1.3, z = row * 5;
      if (Math.hypot(x, z) < 23) continue;
      racks.push([x, z]);
    }
    for (let k = 0; k < racks.length; k++) if (rnd() < .12) racks[k] = null;
    const live = racks.filter(Boolean);
    instanced(g, (b) => {
      b.box(1.2, 4, 1.4, 0x121316, { y: 2, shade: .2 }).box(1.1, 3.8, .04, 0x1c1d22, { y: 2, z: .7 });
      for (let i = 0; i < 9; i++) b.box(1, .06, .02, 0x2a2b30, { y: .4 + i * .4, z: .72 });
    }, live.length, (i) => ({ x: live[i][0], z: live[i][1] }), m);
    // blinking LEDs: one Points cloud, animated in the shader
    const n = live.length * 14;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), ph = new Float32Array(n);
    const pal = [[.34, 1, .55], [.3, .7, 1], [1, .7, .2]];
    live.forEach(([x, z], i) => { for (let k = 0; k < 14; k++) {
      const j = i * 14 + k; pos.set([x - .45 + (k % 4) * .08, .5 + Math.floor(k / 4) * .9 + rnd() * .3, z + .73], j * 3);
      col.set(pal[Math.floor(rnd() * 3)], j * 3); ph[j] = rnd() * 50;
    } });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); lg.setAttribute('aColor', new THREE.BufferAttribute(col, 3)); lg.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    const ledU = { uTime: { value: 0 } };
    const leds = new THREE.Points(lg, new THREE.ShaderMaterial({
      uniforms: ledU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 aColor; attribute float aPhase; uniform float uTime; varying vec3 vC; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = 60.0 / -mv.z; gl_Position = projectionMatrix * mv; vC = aColor;
        vA = step(0.35, fract(sin(floor(uTime * (2.0 + mod(aPhase, 5.0))) + aPhase) * 43758.5)); }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ float r = length(gl_PointCoord-.5)*2.0; float a = smoothstep(1.0,0.2,r)*vA; if(a<.02) discard; gl_FragColor = vec4(vC*1.6, a); }`,
    }));
    leds.frustumCulled = false;
    g.add(leds);
    // cable trays overhead
    instanced(g, (b) => b.box(40, .2, .8, 0x2a2b30, { y: 5.4 }).box(40, .15, .7, 0x3a2c1c, { y: 5.55 }), 8, (i) => ({ x: 0, z: (i < 4 ? -1 : 1) * (27 + (i % 4) * 5) }), m);
    // a few racks are properly on fire
    const fires = [];
    for (let i = 0; i < 7; i++) {
      const r = live[Math.floor(rnd() * live.length)];
      const light = new THREE.PointLight(0xff6a2a, 12, 12, 2);
      light.position.set(r[0], 3.5, r[1] + 1); g.add(light);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(.6, 1.8, 6), glowMaterial(0xff7a2a, { transparent: true, opacity: .8 }));
      flame.position.set(r[0], 4.9, r[1]); g.add(flame);
      fires.push({ light, flame, o: rnd() * 10 });
    }
    return {
      ground: 'grating',
      ambient: { color: 0xff8a3a, count: 520, size: 6, drift: [.1, 1.2, 0], wobble: .7, blink: .3, height: 14, opacity: .9 },
      update(dt, t) {
        ledU.uTime.value = t;
        for (const f of fires) {
          const k = .8 + Math.sin(t * 13 + f.o) * .15 + Math.sin(t * 7.3 + f.o) * .1;
          f.light.intensity = 12 * k; f.flame.scale.set(1, k * 1.2, 1); f.flame.rotation.y = t * 2 + f.o;
        }
      },
    };
  },
};

// ── the Old Toad: shopkeeper of the Lily ────────────────────────────────────
export function buildToad() {
  const g = new THREE.Group();
  const mat = actorMaterial({ rim: 0x7fd0c0, rimStrength: .4 });
  const b = new PartBuilder();
  const skin = 0x6a6a3a, dark = 0x4a4a28, belly = 0xc8b98a;
  b.blob(1.5, 1.1, 1.3, skin, { y: 1.1 }).blob(1.1, .8, .5, belly, { y: .9, z: .9 })               // body
    .blob(1.2, .75, 1.0, skin, { y: 2.25, z: .3 }).blob(1.05, .35, .8, skin, { y: 1.85, z: .6 })   // head + jaw
    .box(1.7, .03, .05, 0x1a1510, { y: 1.95, z: 1.25, rx: -.1 })                                   // mouth
    .blob(.5, .35, .7, skin, { x: 1.2, y: .35, z: .6 }).blob(.5, .35, .7, skin, { x: -1.2, y: .35, z: .6 }) // folded legs
    .blob(.3, .6, .3, skin, { x: .9, y: 1.1, z: 1.0, rx: .5 }).blob(.3, .6, .3, skin, { x: -.9, y: 1.1, z: 1.0, rx: .5 });
  for (let i = 0; i < 14; i++) b.blob(.12, .08, .12, dark, { x: range(-1.1, 1.1), y: range(1.4, 2.6), z: range(-.6, .8) });   // warts
  for (const sx of [-1, 1]) {
    b.sphere(.3, 0xe9e2c9, { x: sx * .6, y: 2.75, z: .7, seg: 12, rings: 8 })
      .blob(.16, .16, .05, 0xd9a441, { x: sx * .62, y: 2.76, z: .98 }).box(.18, .04, .03, 0x0e0d0b, { x: sx * .62, y: 2.76, z: 1.0 })
      .blob(.34, .16, .3, skin, { x: sx * .6, y: 2.98, z: .66, rz: sx * -.2 });       // heavy, tired lids
  }
  b.cyl(.06, .06, 3.2, 0x3e2b1a, { x: 1.7, y: 1.6, z: .6, rz: -.12 });                // lantern pole
  b.cyl(.9, .9, .12, 0x3a2a4a, { y: .06, seg: 12 });                                    // a little rug
  g.add(b.build(mat));
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(.28, 10, 8), glowMaterial(0xffcf7a));
  lantern.position.set(1.9, 3.1, .6); g.add(lantern);
  const light = new THREE.PointLight(0xffb45a, 10, 10, 2); light.position.copy(lantern.position); g.add(light);
  g.userData.update = (dt, t) => { light.intensity = 9 + Math.sin(t * 3.1) * .8 + Math.sin(t * 7.7) * .4; g.children[0].scale.y = 1 + Math.sin(t * 1.4) * .012; };
  g.userData.anchor = new THREE.Vector3(0, 0, 0);
  return g;
}
