// 3D hairstyles for the Kenney character (decision 64). Grown from the head's own surface so they hug it,
// flat-shaded to match the body. Built once per style on a spare dummy in its idle pose (facing +Z), then
// copied onto each body's Head bone and tinted with the look's hair color.
import * as THREE from 'three';

export const HAIR3D = { swoop: 'Side swoop', lob: 'Lob', lobA1: 'Lob, swept back', lobA2: 'Lob, bangs', lobB: 'Wavy lob', lobC: 'Lob, side part', long3: 'Long hair', ponytail: 'Ponytail', pigtails: 'Pigtails', bun: 'Bun',
  curly: 'Curly top', quiff: 'Quiff', mop: 'Messy mop', topknot: 'Top knot' };
// styles that hang down past the neck (a 3D hood would sit inside them, so those looks get the painted hood)
export const LONG_HAIR = ['lob', 'lobA1', 'lobA2', 'lobB', 'lobC', 'long3', 'ponytail', 'pigtails'];

// box around the head (or another body part), from the skinned vertices that follow that bone
export function headBox(root, boneName = 'Head') {
  const box = new THREE.Box3(), v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const hi = o.skeleton.bones.findIndex(b => b.name === boneName);
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hi) w += sw.getComponent(i, k);
      if (w < 0.5) continue;
      o.getVertexPosition(i, v); o.localToWorld(v); box.expandByPoint(v);
    }
  });
  return box;
}


// a shell grown out of the head's own surface (radially from the head centre), keeping the triangles the
// `keep(u, f, x)` test accepts: u = height up the head 0..1, f = front-ness 0 (back) .. 1 (face), x = -1 (left) .. 1 (right)
export function shell(root, hb, keep, k, skirt = 0, warp = null) {
  const c = hb.getCenter(new THREE.Vector3()), s = hb.getSize(new THREE.Vector3());
  const pts = [], v = new THREE.Vector3(), tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const geo = o.geometry, hi = o.skeleton.bones.findIndex(b => b.name === 'Head');
    const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, idx = geo.index, n = idx ? idx.count : geo.attributes.position.count;
    const head = (i) => { let w = 0; for (let q = 0; q < 4; q++) if (si.getComponent(i, q) === hi) w += sw.getComponent(i, q); return w > 0.5; };
    for (let t0 = 0; t0 < n; t0 += 3) {
      const ids = [0, 1, 2].map(q => idx ? idx.getX(t0 + q) : t0 + q);
      if (!ids.every(head)) continue;
      ids.forEach((id, q) => { o.getVertexPosition(id, tri[q]); o.localToWorld(tri[q]); });
      const m = v.copy(tri[0]).add(tri[1]).add(tri[2]).divideScalar(3);
      const u = (m.y - hb.min.y) / s.y, f = (m.z - hb.min.z) / s.z, x = (m.x - c.x) / (s.x / 2);
      if (!keep(u, f, x)) continue;
      for (const p of tri) { const d = p.clone().sub(c); const q = new THREE.Vector3(c.x + d.x * k, c.y + d.y * k + s.y * (k - 1) * 0.25, c.z + d.z * k); if (warp) warp(q); pts.push(q.x, q.y, q.z); }
    }
  });
  if (skirt) {
    const key = (i) => pts.slice(i * 3, i * 3 + 3).map(n => n.toFixed(4)).join(','), cnt = new Map(), n0 = pts.length / 3;
    for (let i = 0; i < n0; i += 3) for (let e = 0; e < 3; e++) {
      const a = i + e, b = i + (e + 1) % 3, ka = key(a), kb = key(b), id = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      const r = cnt.get(id); if (r) r.n++; else cnt.set(id, { n: 1, a, b });
    }
    const inner = (i) => { const q = new THREE.Vector3(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]); const y0 = s.y * (k - 1) * 0.25; q.y -= y0; q.sub(c).multiplyScalar(skirt / k).add(c); return [q.x, q.y, q.z]; };
    for (const { n, a, b } of cnt.values()) if (n === 1) {
      const A = pts.slice(a * 3, a * 3 + 3), B = pts.slice(b * 3, b * 3 + 3), Ai = inner(a), Bi = inner(b);
      pts.push(...A, ...Ai, ...B, ...B, ...Ai, ...Bi);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.computeVertexNormals();
  return g;
}


// a low-poly tube through `pts` with a radius per point, closed to a tip at both ends (tails, braids)
function tubeGeo(pts, radii, sides = 6, flat = 1) {
  const out = [], rings = [], up = new THREE.Vector3(1, 0, 0), t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    t.copy(pts[Math.min(i + 1, pts.length - 1)]).sub(pts[Math.max(i - 1, 0)]).normalize();
    n.crossVectors(t, up).normalize(); b.crossVectors(n, t).normalize();
    const ring = [];
    for (let k = 0; k < sides; k++) { const a = k / sides * Math.PI * 2; ring.push(pts[i].clone().addScaledVector(n, Math.cos(a) * radii[i] * flat).addScaledVector(b, Math.sin(a) * radii[i])); }
    rings.push(ring);
  }
  const tri = (p, q, r) => out.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < sides; k++) {
    const k2 = (k + 1) % sides; tri(rings[i][k], rings[i + 1][k], rings[i][k2]); tri(rings[i][k2], rings[i + 1][k], rings[i + 1][k2]);
  }
  for (let k = 0; k < sides; k++) { const k2 = (k + 1) % sides; tri(pts[0], rings[0][k], rings[0][k2]); tri(pts[pts.length - 1], rings[rings.length - 1][k2], rings[rings.length - 1][k]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3)); g.computeVertexNormals();
  return g;
}
// every piece baked into one geometry, so a hairstyle is one draw call on a phone
function merge(group) {
  const pts = [], v = new THREE.Vector3();
  group.updateMatrixWorld(true);
  for (const m of group.children) {
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry, p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); pts.push(v.x, v.y, v.z); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.computeVertexNormals();
  const out = new THREE.Group(); const mesh = new THREE.Mesh(g, group.children[0].material); out.add(mesh);
  return out;
}

// returns a Group in world space for the posed, +Z-facing dummy `root`. `under` = a hat's line (0..1 up the head):
// everything above it is cut away so the hair that's left sits under the hat.
function buildHair(style, root, under = 0) {
  const hb = headBox(root), g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true, side: THREE.DoubleSide });
  const c = hb.getCenter(new THREE.Vector3()), s = hb.getSize(new THREE.Vector3());
  const W = s.x, H = s.y, D = s.z, top = hb.max.y, front = hb.max.z, back = hb.min.z;
  const put = (geo) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m; };
  const P = (x, y, z) => new THREE.Vector3(c.x + x * W, c.y + y * H, c.z + z * D);   // head-sized units from the head's centre
  const ico = (rx, ry, rz, x, y, z, rot, detail = 1) => { const m = put(new THREE.IcosahedronGeometry(1, detail)); m.geometry.scale(rx * W, ry * H, rz * D); m.position.copy(P(x, y, z)); if (rot) m.rotation.set(rot[0], rot[1], rot[2]); return m; };
  const tube = (pts, radii, sides, flat) => put(tubeGeo(pts.map(p => P(p[0], p[1], p[2])), radii.map(r => r * W), sides, flat));
  // hairline heights (0..1 up the head) at the face, the sides and the back
  const cap = (hf, hs, hb2, k) => put(shell(root, hb, (u, f) => u > (f > 0.72 ? hf : f > 0.4 ? hs : hb2), k));
  // a fringe whose hairline runs diagonally: high at the part (lo -> hi from right to left)
  const lock = (lo, hi, k) => put(shell(root, hb, (u, f, x) => f > 0.55 && u > hi + (lo - hi) * (x + 1) / 2, k, 1.0));
  // the cap stretched down below the jaw (lob, long): len = how far, flare = how much it widens, backLen = extra at the back, wave = wavy
  const drape = (len, flare, backLen = 0, wave = 0, k = 1.12) => {
    const y0 = c.y + H * 0.08;
    const warp = (q) => {
      if (q.y >= y0) return;
      const t = (y0 - q.y) / H, fz = Math.max(0, (q.z - c.z) / (D / 2)), bz = Math.max(0, (c.z - q.z) / (D / 2));
      q.y -= t * H * (len + 0.15 * fz + backLen * bz);
      let fl = 1 + t * flare;
      if (wave) fl += wave * Math.sin((y0 - q.y) / H * 13 + Math.atan2(q.x - c.x, q.z - c.z) * 2) * Math.min(1, t * 3);
      q.x = c.x + (q.x - c.x) * fl; q.z = c.z + (q.z - c.z) * (1 + (fl - 1) * 0.6);
    };
    const keep = (u, f, x) => !(f > 0.35 && u < 0.32 && Math.abs(x) < 0.7) && (f < 0.68 || Math.abs(x) > 0.66 || u > 0.76);
    put(shell(root, hb, keep, k, 0, warp));
  };
  if (style === 'swoop') {   // decision 64: mockup B, a smooth sweep with a soft lift off the part
    cap(0.74, 0.5, 0.3, 1.08); lock(0.56, 0.8, 1.13);
    const e = put(new THREE.SphereGeometry(1, 10, 6)); e.geometry.scale(W * 0.36, H * 0.1, D * 0.26);
    e.position.set(c.x + W * 0.02, top - H * 0.03, front - D * 0.24); e.rotation.set(0.35, 0.25, -0.22);
  }
  if (style === 'lob') { drape(0.5, 0.42); lock(0.54, 0.82, 1.15); }   // decision 65: lob A3, side-swept fringe, no middle part
  if (style === 'lobA1') drape(0.5, 0.42);                               // swept back off the forehead
  if (style === 'lobA2') { drape(0.5, 0.42); lock(0.6, 0.6, 1.15); }     // straight bangs
  if (style === 'lobB') { drape(0.5, 0.42, 0, 0.16); lock(0.54, 0.82, 1.15); }   // wavy
  if (style === 'lobC') { drape(0.5, 0.42); put(shell(root, hb, (u, f, x) => f > 0.55 && u > 0.8 - 0.3 * Math.abs(x - 0.4), 1.15, 1.0)); }   // side part
  if (style === 'long3') { drape(0.75, 0.2, 0.75); lock(0.54, 0.82, 1.15); }
  if (style === 'ponytail') {
    cap(0.74, 0.42, 0.16, 1.08); lock(0.58, 0.76, 1.13);
    tube([[0, 0.3, -0.38], [0, 0.3, -0.56], [0, 0.06, -0.64], [0, -0.24, -0.6], [0, -0.5, -0.52]], [0.1, 0.2, 0.22, 0.17, 0.05], 7);
    ico(0.13, 0.09, 0.1, 0, 0.32, -0.5, [0.6, 0, 0], 0);
  }
  if (style === 'pigtails') {
    cap(0.74, 0.42, 0.16, 1.08); lock(0.6, 0.66, 1.13);
    for (const sx of [-1, 1]) tube([[sx * 0.44, -0.02, -0.14], [sx * 0.6, -0.08, -0.16], [sx * 0.64, -0.36, -0.14], [sx * 0.58, -0.66, -0.1]], [0.08, 0.16, 0.17, 0.05], 6);
  }
  if (style === 'bun') {
    cap(0.74, 0.42, 0.14, 1.08); lock(0.56, 0.8, 1.13);
    ico(0.23, 0.2, 0.26, 0, 0.44, -0.3, null, 1);
  }
  if (style === 'curly') {
    cap(0.76, 0.5, 0.3, 1.07);
    const curls = [[-0.3, 0.44, 0.34], [0, 0.5, 0.4], [0.3, 0.44, 0.34], [-0.42, 0.42, 0.04], [-0.14, 0.56, 0.08], [0.16, 0.56, 0.06], [0.42, 0.42, 0.02],
      [-0.3, 0.46, -0.26], [0, 0.52, -0.24], [0.3, 0.46, -0.28], [-0.14, 0.36, -0.5], [0.16, 0.36, -0.5]];
    curls.forEach(([x, y, z], i) => ico(0.19, 0.14, 0.2, x * 0.92, y - 0.09, z * 0.92, [i, i * 2, i * 3], 0));
  }
  if (style === 'quiff') {
    cap(0.76, 0.5, 0.3, 1.08);
    ico(0.46, 0.13, 0.3, 0.03, 0.47, 0.32, [-0.5, 0, 0.1], 1);
    ico(0.42, 0.1, 0.44, 0.02, 0.45, -0.04, [-0.12, 0, 0.05], 1);
  }
  if (style === 'mop') {
    const jag = (q) => { const a = Math.atan2(q.x - c.x, q.z - c.z), low = Math.max(0, 1 - (q.y - (c.y - H * 0.05)) / (H * 0.25)); q.y += Math.sin(a * 9) * H * 0.035 * low; const o = 1 + 0.04 * Math.sin(a * 5 + 1) * low; q.x = c.x + (q.x - c.x) * o; q.z = c.z + (q.z - c.z) * o; };
    put(shell(root, hb, (u, f) => u > (f > 0.72 ? 0.6 : f > 0.4 ? 0.36 : 0.24), 1.16, 1.0, jag));
    ico(0.2, 0.1, 0.2, -0.2, 0.49, 0.2, [0.2, 0.4, 0.5], 0); ico(0.2, 0.1, 0.2, 0.24, 0.48, -0.1, [0.3, 1.4, -0.4], 0); ico(0.18, 0.09, 0.18, 0.02, 0.5, -0.3, [0.5, 2.2, 0.2], 0);
  }
  if (style === 'topknot') {
    cap(0.78, 0.56, 0.36, 1.06);
    ico(0.13, 0.05, 0.14, 0, 0.47, -0.1, null, 0); ico(0.17, 0.15, 0.19, 0, 0.57, -0.1, [0.3, 0.5, 0], 1);
  }
  if (under) {   // under a hat: drop every triangle above the hat line
    for (const m of g.children) {
      m.updateMatrix(); const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry).applyMatrix4(m.matrix), p = geo.attributes.position, kept = [];
      m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
      const yCut = hb.min.y + H * under;
      for (let i = 0; i < p.count; i += 3) {   // triangles wholly above the line go; ones that cross it are flattened onto it, for a clean edge
        if (Math.min(p.getY(i), p.getY(i + 1), p.getY(i + 2)) >= yCut) continue;
        for (let q = 0; q < 3; q++) kept.push(p.getX(i + q), Math.min(yCut, p.getY(i + q)), p.getZ(i + q));
      }
      const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3)); ng.computeVertexNormals(); m.geometry = ng;
    }
  }
  return merge(g);
}

const cache = {};
// a fresh mesh group for `style`, positioned in Head-bone space (put it straight under a Head bone)
export function hairFor(style, dummyScene, idleClip, cloneFn, under = 0) {
  const key = style + ':' + under;
  if (!cache[key]) {
    const k = cloneFn(dummyScene), mx = new THREE.AnimationMixer(k); mx.clipAction(idleClip).play(); mx.update(0);
    k.updateMatrixWorld(true);
    const g = buildHair(style, k, under), head = k.getObjectByName('Head');
    g.updateMatrixWorld(true); head.attach(g);
    cache[key] = g;
  }
  const t = cache[key], out = new THREE.Group();
  out.position.copy(t.position); out.quaternion.copy(t.quaternion); out.scale.copy(t.scale);
  const mat = t.children[0].material.clone();
  for (const m of t.children) { const n = new THREE.Mesh(m.geometry, mat); n.position.copy(m.position); n.quaternion.copy(m.quaternion); n.scale.copy(m.scale); n.castShadow = true; n.frustumCulled = false; n.userData.hair = true; out.add(n); }
  out.userData.mat = mat;
  return out;
}
