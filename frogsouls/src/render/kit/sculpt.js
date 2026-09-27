import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Sculpt: turns a character's primitives into ONE continuous, organic surface,
// the way a sculpted model is: each primitive becomes a signed distance field,
// the fields melt together with smooth unions (a fillet wherever a belly meets
// a chest or an arm meets a shoulder), and a surface-nets pass polygonises the
// result. On top of that:
//   • normals come from the field's gradient, so the surface is truly smooth;
//   • ambient occlusion is baked by probing the field — creases, armpits and
//     the gap under a helmet brim darken like a real bake;
//   • each vertex is weighted between its two nearest joints, so elbows and
//     shoulders bend as skin instead of as stacked pieces.
// Thin details (straps, pupils, trims) stay as crisp polygon parts on top.
// ─────────────────────────────────────────────────────────────────────────────

const _v = new THREE.Vector3(), _c = new THREE.Color();

// ── distance functions, in a primitive's local unit space ────────────────────
function sdEllipsoid(x, y, z, rx, ry, rz) {          // x,y,z already divided by the radii
  const k0 = Math.hypot(x, y, z), k1 = Math.hypot(x / rx, y / ry, z / rz);
  return k0 * (k0 - 1) / Math.max(k1, 1e-6);
}
function sdCappedCone(x, y, z, h, r1, r2) {          // r1 at -h, r2 at +h (three's radiusBottom, radiusTop)
  const qx = Math.hypot(x, z), qy = y;
  const k1x = r2, k1y = h, k2x = r2 - r1, k2y = 2 * h;
  const cax = qx - Math.min(qx, qy < 0 ? r1 : r2), cay = Math.abs(qy) - h;
  const t = Math.min(1, Math.max(0, ((k1x - qx) * k2x + (k1y - qy) * k2y) / (k2x * k2x + k2y * k2y)));
  const cbx = qx - k1x + k2x * t, cby = qy - k1y + k2y * t;
  const s = (cbx < 0 && cay < 0) ? -1 : 1;
  return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
}
function sdRoundBox(x, y, z, bx, by, bz, r) {
  const qx = Math.abs(x) - bx + r, qy = Math.abs(y) - by + r, qz = Math.abs(z) - bz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
function sdTorus(x, y, z, R, r) { return Math.hypot(Math.hypot(x, y) - R, z) - r; }

/** Distance from world point to a primitive (prim.inv maps world → local). */
function primDist(p, x, y, z) {
  const e = p.inv.elements;
  const lx = e[0] * x + e[4] * y + e[8] * z + e[12];
  const ly = e[1] * x + e[5] * y + e[9] * z + e[13];
  const lz = e[2] * x + e[6] * y + e[10] * z + e[14];
  let d;
  switch (p.type) {
    case 'ell': d = sdEllipsoid(lx, ly, lz, p.a[0], p.a[1], p.a[2]); break;
    case 'cone': d = sdCappedCone(lx, ly, lz, p.a[0], p.a[1], p.a[2]); break;
    case 'box': d = sdRoundBox(lx, ly, lz, p.a[0], p.a[1], p.a[2], p.a[3]); break;
    case 'torus': d = sdTorus(lx, ly, lz, p.a[0], p.a[1]); break;
  }
  p._ly = ly;
  return d * p.dscale;
}

function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * .25;
}

/**
 * Describe a primitive for sculpting, or return null when it's too thin for
 * the grid (it then stays a polygon part).
 * @param m local→bone matrix (position, rotation, scale), as PartBuilder composes it
 */
export function sculptPrim(kind, args, m, color, o, minThick) {
  const s = new THREE.Vector3(); m.decompose(_v, new THREE.Quaternion(), s);
  let type, a, local, ext;                             // ext: half-extents in local units (for bounds and thickness)
  switch (kind) {
    case 'blob': type = 'ell'; a = []; ext = [1, 1, 1]; break;
    case 'sphere': type = 'ell'; a = []; ext = [args[0], args[0], args[0]];
      local = new THREE.Matrix4().makeScale(args[0], args[0], args[0]); break;
    case 'cyl': { const [rt, rb, h] = args; type = 'cone'; a = [h / 2, rb, rt]; const r = Math.max(rt, rb); ext = [r, h / 2, r]; break; }
    case 'cone': { const [r, h] = args; type = 'cone'; a = [h / 2, r, 0]; ext = [r, h / 2, r]; break; }
    case 'box': { const [w, h, d] = args; const mn = Math.min(w, h, d);
      type = 'box'; a = [w / 2, h / 2, d / 2, Math.min(.03, mn * .22)]; ext = [w / 2, h / 2, d / 2]; break; }
    case 'torus': { const [R, r] = args; type = 'torus'; a = [R, r]; ext = [R + r, R + r, r]; break; }
    default: return null;
  }
  // thickness in bone space: the thinnest local extent, scaled
  const thick = kind === 'torus' ? args[1] * 2 * Math.min(s.x, s.y, s.z)
    : Math.min(ext[0] * s.x, ext[1] * s.y, ext[2] * s.z) * 2;
  if (thick < minThick) return null;
  if (kind === 'cyl' && Math.min(args[0], args[1]) * Math.min(s.x, s.z) * 2 < minThick * .6) return null;
  const full = local ? m.clone().multiply(local) : m.clone();
  // blobs are unit spheres scaled to their radii: distance is taken in that
  // squashed space, so scale it back by the smallest axis (a safe underestimate)
  const fs = new THREE.Vector3(); full.decompose(_v, new THREE.Quaternion(), fs);
  const round = kind !== 'box';
  if (type === 'ell') a = [fs.x, fs.y, fs.z];
  return {
    type, a, m: full, ext: type === 'ell' ? [1, 1, 1] : ext,
    dscale: type === 'ell' ? 1 : Math.min(fs.x, fs.y, fs.z),
    color, shade: o.shade ?? 0, hY: type === 'ell' ? 1 : ext[1],
    rough: o.rough, metal: o.metal,
    k: o.blend ?? (round ? .05 : .025),
  };
}

// ── the sculptor ─────────────────────────────────────────────────────────────
/**
 * @param items [{ bone: index, prims: [...] }] with prim.m already in root space
 * @param adj   (a, b) => true when two bones may melt into each other
 * @returns BufferGeometry (indexed) with position, normal, color, aMat,
 *          skinIndex, skinWeight
 */
export function sculpt(items, adj, { voxel = .024, hints = null, maxCells = 420000 } = {}) {
  const prims = [];
  const box = new THREE.Box3(), pb = new THREE.Box3();
  for (const it of items) for (const p of it.prims) {
    p.bone = it.bone;
    p.inv = p.m.clone().invert();
    const [ex, ey, ez] = p.ext;
    pb.makeEmpty();
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pb.expandByPoint(_v.set(sx * ex, sy * ey, sz * ez).applyMatrix4(p.m));
    p.box = pb.clone();
    box.union(pb);
    prims.push(p);
  }
  if (!prims.length) return null;
  const size = box.getSize(new THREE.Vector3());
  let h = voxel;
  const cells = () => (size.x / h + 6) * (size.y / h + 6) * (size.z / h + 6);
  while (cells() > maxCells) h *= 1.08;
  const pad = 3;
  const ox = box.min.x - pad * h, oy = box.min.y - pad * h, oz = box.min.z - pad * h;
  const nx = Math.ceil(size.x / h) + pad * 2 + 1, ny = Math.ceil(size.y / h) + pad * 2 + 1, nz = Math.ceil(size.z / h) + pad * 2 + 1;
  const N = nx * ny * nz, sxy = nx * ny;
  const BIG = 1e3;

  // per-bone fields (each bone's own primitives melt with their k)
  const bones = [...new Set(prims.map((p) => p.bone))];
  const fields = new Map();
  for (const b of bones) fields.set(b, new Float32Array(N).fill(BIG));
  const margin = .09;
  for (const p of prims) {
    const F = fields.get(p.bone);
    const i0 = Math.max(0, Math.floor((p.box.min.x - margin - ox) / h)), i1 = Math.min(nx - 1, Math.ceil((p.box.max.x + margin - ox) / h));
    const j0 = Math.max(0, Math.floor((p.box.min.y - margin - oy) / h)), j1 = Math.min(ny - 1, Math.ceil((p.box.max.y + margin - oy) / h));
    const k0 = Math.max(0, Math.floor((p.box.min.z - margin - oz) / h)), k1 = Math.min(nz - 1, Math.ceil((p.box.max.z + margin - oz) / h));
    for (let k = k0; k <= k1; k++) {
      const z = oz + k * h;
      for (let j = j0; j <= j1; j++) {
        const y = oy + j * h, row = k * sxy + j * nx;
        for (let i = i0; i <= i1; i++) {
          const d = primDist(p, ox + i * h, y, z);
          const idx = row + i;
          const cur = F[idx];
          F[idx] = cur >= BIG ? d : smin(cur, d, p.k);
        }
      }
    }
  }
  // combine: a hard union everywhere, plus a fillet between neighbouring joints
  const field = new Float32Array(N).fill(BIG);
  for (const b of bones) { const F = fields.get(b); for (let i = 0; i < N; i++) if (F[i] < field[i]) field[i] = F[i]; }
  const kj = .035;
  for (let a = 0; a < bones.length; a++) for (let b = a + 1; b < bones.length; b++) {
    if (!adj(bones[a], bones[b])) continue;
    const A = fields.get(bones[a]), B = fields.get(bones[b]);
    for (let i = 0; i < N; i++) {
      const x = A[i], y = B[i];
      if (x > kj * 2 || y > kj * 2) continue;
      const s = smin(x, y, kj);
      if (s < field[i]) field[i] = s;
    }
  }
  fields.clear();

  const sample = (x, y, z) => {                      // trilinear
    let fx = (x - ox) / h, fy = (y - oy) / h, fz = (z - oz) / h;
    fx = Math.min(Math.max(fx, 0), nx - 1.001); fy = Math.min(Math.max(fy, 0), ny - 1.001); fz = Math.min(Math.max(fz, 0), nz - 1.001);
    const i = fx | 0, j = fy | 0, k = fz | 0, u = fx - i, v = fy - j, w = fz - k;
    const b0 = k * sxy + j * nx + i;
    const c00 = field[b0] * (1 - u) + field[b0 + 1] * u;
    const c10 = field[b0 + nx] * (1 - u) + field[b0 + nx + 1] * u;
    const c01 = field[b0 + sxy] * (1 - u) + field[b0 + sxy + 1] * u;
    const c11 = field[b0 + sxy + nx] * (1 - u) + field[b0 + sxy + nx + 1] * u;
    return (c00 * (1 - v) + c10 * v) * (1 - w) + (c01 * (1 - v) + c11 * v) * w;
  };

  // ── surface nets ───────────────────────────────────────────────────────────
  const vidx = new Int32Array(N).fill(-1);
  const pos = [];
  const cx = [0, 1, 0, 1, 0, 1, 0, 1], cy = [0, 0, 1, 1, 0, 0, 1, 1], cz = [0, 0, 0, 0, 1, 1, 1, 1];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const b0 = k * sxy + j * nx + i;
    let mask = 0;
    for (let c = 0; c < 8; c++) { cv[c] = field[b0 + cx[c] + cy[c] * nx + cz[c] * sxy]; if (cv[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += cx[a] + (cx[b] - cx[a]) * t; sy += cy[a] + (cy[b] - cy[a]) * t; sz += cz[a] + (cz[b] - cz[a]) * t; n++;
    }
    vidx[b0] = pos.length / 3;
    pos.push(ox + (i + sx / n) * h, oy + (j + sy / n) * h, oz + (k + sz / n) * h);
  }
  const index = [];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const b0 = k * sxy + j * nx + i;
    const inside = field[b0] < 0;
    // an edge from this point along +x, +y, +z crossing the surface → one quad
    const quads = [
      [b0 + 1, [0, -nx, -nx - sxy, -sxy]],
      [b0 + nx, [0, -sxy, -sxy - 1, -1]],
      [b0 + sxy, [0, -1, -1 - nx, -nx]],
    ];
    for (const [other, off] of quads) {
      if ((field[other] < 0) === inside) continue;
      const q = off.map((o) => vidx[b0 + o]);
      if (q.some((x) => x < 0)) continue;
      if (inside) index.push(q[0], q[1], q[2], q[0], q[2], q[3]);
      else index.push(q[0], q[2], q[1], q[0], q[3], q[2]);
    }
  }

  // ── per-vertex: normal, AO, colour, surface, skin weights ─────────────────
  const nv = pos.length / 3;
  const nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3), mat = new Float32Array(nv * 2);
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const e = h * .75;
  const best = new Map();
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let gx = sample(x + e, y, z) - sample(x - e, y, z), gy = sample(x, y + e, z) - sample(x, y - e, z), gz = sample(x, y, z + e) - sample(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
    nrm[v * 3] = gx; nrm[v * 3 + 1] = gy; nrm[v * 3 + 2] = gz;

    // ambient occlusion: how much the field closes in along the normal
    let occ = 0, wsum = 0;
    for (let s = 1; s <= 5; s++) {
      const d = s * .028, w = 1 / s;
      occ += w * Math.max(0, d - sample(x + gx * d, y + gy * d, z + gz * d)) / d; wsum += w;
    }
    let ao = 1 - Math.min(1, occ / wsum * 1.35);
    ao = .38 + .62 * ao;
    ao *= .86 + .14 * (gy * .5 + .5);                // a touch of sky occlusion

    // nearest primitives: colour from the closest, joints from the two closest bones
    best.clear();
    let pd = Infinity, pp = null, pd2 = Infinity, pp2 = null;
    for (const p of prims) {
      if (x < p.box.min.x - .12 || x > p.box.max.x + .12 || y < p.box.min.y - .12 || y > p.box.max.y + .12 || z < p.box.min.z - .12 || z > p.box.max.z + .12) continue;
      const d = primDist(p, x, y, z);
      if (d < pd) { pd2 = pd; pp2 = pp; pd = d; pp = p; pp._hit = p._ly; } else if (d < pd2) { pd2 = d; pp2 = p; }
      const bd = best.get(p.bone);
      if (bd === undefined || d < bd) best.set(p.bone, d);
    }
    if (!pp) pp = prims[0];
    // colour: nearest, softly blended with the runner-up where they meet
    const colorOf = (p, ly) => {
      _c.set(p.color);
      if (p.shade) { const kk = Math.min(1, Math.max(0, (ly / p.hY) * .5 + .5)); _c.multiplyScalar(1 - p.shade * (1 - kk)); }
      return _c;
    };
    const c1 = colorOf(pp, pp._hit); let r = c1.r, g = c1.g, b = c1.b;
    if (pp2 && pp2.color !== pp.color) {
      const t = .5 * (1 - Math.min(1, (pd2 - pd) / .012));
      if (t > 0) { primDist(pp2, x, y, z); const c2 = colorOf(pp2, pp2._ly); r += (c2.r - r) * t; g += (c2.g - g) * t; b += (c2.b - b) * t; }
    }
    col[v * 3] = r * ao; col[v * 3 + 1] = g * ao; col[v * 3 + 2] = b * ao;
    const hint = (pp.rough != null || pp.metal != null) ? pp : hints?.get(pp.color);
    if (hint) { mat[v * 2] = hint.rough ?? 0; mat[v * 2 + 1] = hint.metal ?? 0; }

    // skin: the nearest bone, blended with a neighbouring one near the seam
    let b1 = pp.bone, d1 = Infinity, b2 = -1, d2 = Infinity;
    for (const [bn, d] of best) { if (d < d1) { b2 = b1; d2 = d1; b1 = bn; d1 = d; } else if (d < d2) { b2 = bn; d2 = d; } }
    let w2 = 0;
    if (b2 >= 0 && b2 !== b1 && adj(b1, b2)) w2 = .5 * (1 - Math.min(1, Math.max(0, (d2 - d1) / .07)));
    si[v * 4] = b1; sw[v * 4] = 1 - w2;
    si[v * 4 + 1] = Math.max(b2, 0); sw[v * 4 + 1] = w2;
  }

  // make every triangle face along the field's gradient
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const dot = fx * (nrm[a] + nrm[b] + nrm[c]) + fy * (nrm[a + 1] + nrm[b + 1] + nrm[c + 1]) + fz * (nrm[a + 2] + nrm[b + 2] + nrm[c + 2]);
    if (dot < 0) { const tmp = index[t + 1]; index[t + 1] = index[t + 2]; index[t + 2] = tmp; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aMat', new THREE.BufferAttribute(mat, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setIndex(index);
  return geo;
}
