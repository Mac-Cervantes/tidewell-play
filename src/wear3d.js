// 3D things you wear on the Kenney character: hats on the Head bone, a skirt on the Hips, a hood on the Neck.
// Built once per piece on a spare dummy in its idle pose (like the 3D hair), flat-shaded, tinted with the look's colors.
import * as THREE from 'three';
import { headBox, LONG_HAIR } from './hair3d.js';

export const HATS = { sunhat: 'Sun hat', beanie: 'Beanie', cap: 'Cap', bucket: 'Bucket hat' };
export const HAT_LINE = 0.7;   // how far up the head a hat sits (0..1); 3D hair above this is cut away under a hat

const lathe = (pts, seg = 12) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
// pieces are [geometry, 'main' | 'trim'] in head units: x,z in half-widths... see `place`
function hatParts(kind) {
  const P = [];
  if (kind === 'beanie') {
    P.push([lathe([[0.6, 0.2], [0.6, 0.36], [0.5, 0.52], [0.3, 0.62], [0.001, 0.65]]), 'main']);
    P.push([lathe([[0.6, 0.14], [0.64, 0.15], [0.64, 0.27], [0.6, 0.28]]), 'trim']);
    const pom = new THREE.IcosahedronGeometry(0.13, 0); pom.translate(0, 0.72, 0); P.push([pom, 'trim']);
  }
  if (kind === 'cap') {
    P.push([lathe([[0.6, 0.18], [0.6, 0.34], [0.52, 0.5], [0.3, 0.6], [0.001, 0.62]]), 'main']);
    const bill = new THREE.CylinderGeometry(0.56, 0.56, 0.04, 10, 1, false, -Math.PI / 2, Math.PI); bill.scale(1, 1, 1.1); bill.rotateX(0.14); bill.translate(0, 0.2, 0.42); P.push([bill, 'trim']);
    const btn = new THREE.IcosahedronGeometry(0.06, 0); btn.translate(0, 0.63, 0); P.push([btn, 'trim']);
  }
  if (kind === 'bucket') {
    P.push([lathe([[0.6, 0.22], [0.56, 0.5], [0.5, 0.57], [0.001, 0.58]]), 'main']);
    P.push([lathe([[0.9, 0.04], [0.6, 0.22], [0.6, 0.25], [0.93, 0.07]]), 'main']);
    P.push([lathe([[0.605, 0.23], [0.6, 0.3]]), 'trim']);
  }
  if (kind === 'sunhat') {
    P.push([lathe([[0.6, 0.24], [0.58, 0.44], [0.5, 0.53], [0.001, 0.55]]), 'main']);
    P.push([lathe([[1.12, 0.17], [0.6, 0.24], [0.6, 0.27], [1.14, 0.2]], 14), 'main']);
    P.push([lathe([[0.61, 0.25], [0.6, 0.34]]), 'trim']);
  }
  return P;
}

const cache = {};
function posed(dummyScene, idleClip, cloneFn) {
  if (!cache.dummy) { const k = cloneFn(dummyScene), mx = new THREE.AnimationMixer(k); mx.clipAction(idleClip).play(); mx.update(0); k.updateMatrixWorld(true); cache.dummy = k; }
  return cache.dummy;
}
// builds [{ geo, tone }] in the bone's own space for `piece`, once
function template(piece, k) {
  if (cache[piece]) return cache[piece];
  const [type, kind] = piece.split(':'), out = [], g = new THREE.Group();
  const add = (geo, tone) => { const m = new THREE.Mesh(geo); m.userData.tone = tone; g.add(m); return m; };
  let boneName = 'Head';
  if (type === 'hat') {
    const hb = headBox(k), c = hb.getCenter(new THREE.Vector3()), s = hb.getSize(new THREE.Vector3());
    // the round shapes pulled in 10% so the rim sits just outside the head (Mac: hug the head, don't enlarge the hat)
    for (const [geo, tone] of hatParts(kind)) { geo.scale(s.x * 0.9, s.y, s.z * 0.9); add(geo, tone).position.set(c.x, c.y, c.z); }
  }
  if (type === 'skirt') {
    boneName = 'Hips';
    const b = headBox(k, 'Hips'), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    const long = kind === 'long' ? 1.0 : 0.62;
    // an oval that hugs the tummy and back, snug at the waist with a soft flare at the hem (Mac)
    const geo = lathe([[0.5, 0.42], [0.55, 0.15], [0.66, -0.4 * long - 0.2], [0.77, -long - 0.42]], 12); geo.scale(s.x, s.y, s.z * 1.1);
    add(geo, 'main').position.set(c.x, c.y, c.z);
  }
  if (type === 'hood') {
    boneName = 'Neck';
    const hb = headBox(k), c = hb.getCenter(new THREE.Vector3()), s = hb.getSize(new THREE.Vector3());
    const geo = new THREE.IcosahedronGeometry(1, 1); geo.scale(s.x * 0.44, s.y * 0.17, s.z * 0.34); geo.rotateX(-0.45);
    add(geo, 'main').position.set(c.x, hb.min.y - s.y * 0.04, hb.min.z + s.z * 0.12);
  }
  g.updateMatrixWorld(true);
  const bone = k.getObjectByName(boneName), inv = new THREE.Matrix4().copy(bone.matrixWorld).invert();
  for (const tone of ['main', 'trim']) {   // one geometry per color, in bone space
    const pts = [], v = new THREE.Vector3();
    for (const m of g.children) if (m.userData.tone === tone) {
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry, p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv); pts.push(v.x, v.y, v.z); }
    }
    if (!pts.length) continue;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); geo.computeVertexNormals();
    out.push({ geo, tone });
  }
  return (cache[piece] = { boneName, parts: out });
}

// which pieces a look wears: [{ piece, main, trim }]
export function wearList(look) {
  if (!look || look.blank) return [];
  const L = [], top = look.top, bib = top === 'overalls' || top === 'dungarees';
  if (HATS[look.hat]) L.push({ piece: 'hat:' + look.hat, main: look.hatColor || '#f2d38a', trim: look.hatColor2 || '#f2654c' });
  if (top === 'dress' || top === 'sundress') L.push({ piece: 'skirt:long', main: look.topColor });
  else if (look.bottom === 'skirt' && !bib) L.push({ piece: 'skirt:short', main: look.bottomColor || '#2a4e8a' });
  // the hood is a 3D piece with short hair and only painted with long hair, which would pass through it (Mac)
  if ((top === 'hoodie' || top === 'raincoat') && !LONG_HAIR.includes(look.hair)) L.push({ piece: 'hood:down', main: look.topColor });
  return L;
}
// how much of a 3D hairstyle a hat cuts away (0 = no hat): hair above the hat line goes, so tails, fringes and long hair still show (Mac: "Tuck")
export function hairUnderHat(look) {
  if (!look || !HATS[look.hat]) return 0;
  return HAT_LINE + (look.hat === 'beanie' ? -0.06 : 0);
}
// fresh meshes for a wearList entry: { boneName, group }
export function wearFor(item, dummyScene, idleClip, cloneFn) {
  const t = template(item.piece, posed(dummyScene, idleClip, cloneFn)), group = new THREE.Group();
  for (const { geo, tone } of t.parts) {
    const mat = new THREE.MeshStandardMaterial({ color: tone === 'trim' ? item.trim || item.main : item.main, roughness: 0.85, flatShading: true, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.frustumCulled = false; m.userData.hair = true; group.add(m);
  }
  return { boneName: t.boneName, group };
}
