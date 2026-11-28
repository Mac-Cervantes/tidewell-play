// RANCH (try/ranch): wild cows that roam the grass, just for fun (Mac, Nov 24: "Add the cows in the game as just
// wild roaming for fun"). No pen, no buying, no milk and nothing saved yet: two cows and a calf wander, graze, look
// at you, moo now and then and lie down at night. Walk up and Pet one (or tap it) for a moo (baa, maa, oink) and hearts.
// Everything lives in this file. Other files only carry small hooks marked "RANCH": main.js (init, start, frame,
// block, tap, pickUse) and audio.js (the moo).
//
// Look: the cute blocky style Mac picked (Nov 24, "I like the cute blocky look"), built from boxes in code as on the
// "Blocky Animals" canvas (tools/mockups/ranch-blocky.py). Speed: each kind (cow, calf, bull, sheep, lamb, goat, kid, pig, piglet) is
// drawn by four instanced meshes (body, head, legs, tail): 36 draw calls for the whole herd, however many of each.
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';
import * as pen from './pen.js';   // RANCH: the cow pen, milk and wood (the save lives there)

let A = null, THREE = null, ready = false;
let kinds = null, herd = [], rig = null, fx = [], heartTex = null, ray = null;
let mooT = 12, secT = 0, ownSig = '', follower = null, bubbles = [];
const rnd = (a, b) => a + Math.random() * (b - a);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// the herd (Mac, Nov 24: "I like them, show me the other animals in the game"): cows and a calf, the bull,
// sheep and a lamb, a goat and a kid, a pig and a piglet. A baby sticks with the grown-up at index `mom`.
// Grown-ups get smaller heads; the babies keep their big ones (Mac, Nov 25: "Cow at 75% is good. Leave all the babies
// animals with a big head").
const SHEEP = { wool: 'bumps', woolSize: 0.85, headSize: 0.85 }, LAMB = { wool: 'bumps', woolSize: 0.85 }, COW = { headSize: 0.75 };
const SMALL = { headSize: 0.8 };   // the bull, goat and pig (Mac, Nov 25: "Shrink bull pig and goat heads to 80 percent")
const HERD = [{ sp: 'cow', ...COW, lot: 'back1' }, { sp: 'cow', ...COW, lot: 'back1' }, { sp: 'cow', baby: true, mom: 0, lot: 'back1' }, { sp: 'bull', ...SMALL, lot: 'back1' },
  // the sheep (Mac, Nov 25): H1 "bumps all over" wool at 85% ("I like h1 @ 85%") and the head at 85% ("Sheep head at 85% is good")
  { sp: 'sheep', ...SHEEP, lot: 'back2' }, { sp: 'sheep', ...SHEEP, lot: 'back2' }, { sp: 'sheep', baby: true, mom: 4, ...LAMB, lot: 'back2' }, { sp: 'goat', ...SMALL, lot: 'back3' }, { sp: 'goat', baby: true, mom: 7, lot: 'back3' }, { sp: 'pig', ...SMALL, lot: 'back4' }, { sp: 'pig', baby: true, mom: 9, lot: 'back4' }];
// Each kind keeps to its own lot, as if it likes it there (Mac, Nov 28: "keep them on their lots so it seems they prefer that biome"):
// cows in the meadow, sheep by the lake, goats in the old woods, pigs in the deep woods. They live there whether or not you own the lot,
// and none of them show up until you own the lake lot (Mac: "no wild animals until the lake lot").
const WILD_AFTER = 'back2';
// what makes each animal itself (the same table as the Blocky Animals canvas, tools/mockups/ranch-blocky.py)
const SP = {
  cow:   { coat: 0xfffaf0, patch: 0x3f3a55, babyPatch: 0xc98a52, face: 1, muz: 0xf9b9c6, hoof: 0x5a4a4a, horn: { len: 0.36, col: 0xf2e3c0, back: 0 }, udder: 1, bell: 1, tail: 'tuft', size: 1, voice: 'moo' },
  bull:  { coat: 0xb07a4c, patch: 0x8a5a36, muz: 0xf6dcc0, hoof: 0x4a3b2e, horn: { len: 0.62, col: 0xf7ecd2, back: 0 }, ring: 1, tail: 'tuft', size: 1.1, headK: 1.04, voice: 'mooBig' },
  sheep: { coat: 0xfffaf0, head: 0x5d5672, muz: 0x7d7694, leg: 0x5d5672, hoof: 0x2f2a3a, wool: 1, eyeWhite: 1, tail: 'puff', size: 0.82, headK: 0.82, long: 0.9, voice: 'baa' },
  goat:  { coat: 0xe6caa0, muz: 0xfbf0d8, hoof: 0x5a4a3a, horn: { len: 0.95, col: 0xb9a88c, back: 0.75 }, beard: 1, tail: 'up', size: 0.8, wide: 0.82, legK: 1.2, headK: 0.9, earOut: 1, voice: 'maa' },
  pig:   { coat: 0xf8adbc, muz: 0xee8fa3, hoof: 0xc97a8a, snout: 1, earUp: 1, tail: 'curl', size: 0.78, legK: 0.75, long: 1.05, wide: 1.08, voice: 'oink' },
};
const SPEED = 0.45;          // m/s, an easy amble
const LOOK = 4.5;            // they turn their heads to watch you inside this
const REACH = 1.7;           // Pet shows inside this
const RANGE = { x: 12.5, z0: -0.6 };   // the open grass in front of your land, up to a metre short of the fence

// opts (for the wool test field, wooltest.html): { herd: [...] } replaces HERD. A herd entry may also carry
//   pen: { x0, x1, z0, z1 }   it stays inside this box instead of the open grass
//   wool: 'coat' | 'bumps'    a sheep's soft wool (F1 "one soft coat" / H1 "bumps all over" on the Blocky Animals canvas)
//   woolSize: 0.7 .. 1         how big that wool body is (Mac, Nov 25: "Can you make h1 but the body smaller?")
//   headSize: 0.7 .. 1         how big the head is (Mac, Nov 25: "I like h1 @ 85% but can you now make the head smaller")
let HL = HERD;
let opts = {};
export function init(api, o) { A = api; THREE = api.THREE; opts = { ...(o || {}), test: !!(o && o.herd) }; if (opts.herd) HL = opts.herd; }
// animals that look the same share one kind (one set of instanced meshes); each wool sheep is its own (the bumps differ)
const kindKey = (h, i) => h.sp + (h.baby ? '+' : '') + (h.wool ? '|' + h.wool + '|' + i : h.headSize ? '|' + h.headSize : '');
// your own cows (RANCH, the pen): grown ones look like the wild cows, calves keep their big heads
const OWN = (baby) => (baby ? { sp: 'cow', baby: true } : { sp: 'cow', ...COW });
const SPARE = { cow: pen.RANCH.maxCows, 'cow+': pen.RANCH.maxCows };   // room for cows you lead home or buy as calves (calves that grow up move to the cow kind)

export function start() {
  if (ready) return;
  const gone = opts.test ? [] : pen.st().gone;   // wild cows you've led home don't come back (Mac: "No, herd shrinks")
  const list = HL.map((h, i) => ({ h, i })).filter(({ i }) => !gone.includes(i));
  // how many of each kind: the wild herd plus room for your own cows
  const need = {};
  list.forEach(({ h, i }) => { const k = kindKey(h, i); need[k] = (need[k] || 0) + 1; });
  if (!opts.test) for (const b of [false, true]) { const k = kindKey(OWN(b), -1); need[k] = (need[k] || 0) + SPARE[b ? 'cow+' : 'cow']; }
  kinds = {};
  const make = (h, i) => { const k = kindKey(h, i); if (!kinds[k]) { kinds[k] = buildKind(h.sp, !!h.baby, h.wool, i * 7919 + 13, need[k] || 1, h.woolSize || 1, h.headSize || 1); kinds[k].free = []; } return kinds[k]; };
  list.forEach(({ h, i }) => make(h, i));
  if (!opts.test) for (const b of [false, true]) make(OWN(b), -1);
  rig = { root: new THREE.Object3D(), body: new THREE.Object3D(), head: new THREE.Object3D(), tail: new THREE.Object3D(), legs: [0, 1, 2, 3].map(() => new THREE.Object3D()) };
  rig.root.add(rig.body); rig.body.add(rig.head, rig.tail, ...rig.legs);
  wildList = list;
  if (opts.test || A.lotOwned(WILD_AFTER)) spawnWild();
  ready = true;
  if (!opts.test) syncOwn();
}
let wildList = null, wildOn = false;
function spawnWild() {
  if (wildOn || !wildList) return; wildOn = true;
  const list = wildList;
  const P = A.player.pos, byI = {};
  for (const { h, i } of list) {
    const K = kinds[kindKey(h, i)], penBox = h.pen || (!opts.test && h.lot && A.lotBox(h.lot)) || null, mom = h.mom != null ? byI[h.mom] || null : null;
    let at = null;
    for (let t = 0; t < 60 && !at; t++) {
      const near = Math.min(3, 1.2 + t * 0.05), x = mom ? mom.x + rnd(-near, near) : penBox ? rnd(penBox.x0, penBox.x1) : rnd(-RANGE.x, RANGE.x), z = mom ? mom.z + rnd(-near, near) : penBox ? rnd(penBox.z0, penBox.z1) : rnd(RANGE.z0 + 0.5, A.fenceZ() - 1.5);
      if (ok(x, z, K.s, penBox) && Math.hypot(x - P.x, z - P.z) > 2.5 && herd.every(o => Math.hypot(o.x - x, o.z - z) > 1.6)) at = { x, z };
    }
    if (!at) at = mom ? { x: mom.x, z: mom.z + 1.4 } : penBox ? { x: (penBox.x0 + penBox.x1) / 2, z: (penBox.z0 + penBox.z1) / 2 } : { x: -6 + i * 2.2, z: 2.5 };
    const c = spawn(K, at.x, at.z, { i, mom, pen: penBox, wild: !opts.test && h.sp === 'cow' });   // wild cows (and the calf) can be led home
    if (c) byI[i] = c;
  }
}
// a free instance in a kind, or null when it's full
function spawn(K, x, z, extra) {
  const n = K.free.length ? K.free.pop() : K.used < K.body.instanceMatrix.count ? K.used++ : -1;
  if (n < 0) return null;
  for (const m of [K.body, K.head, K.tail, K.wool, K.woolHead]) if (m) m.count = K.used;
  K.legs.count = K.used * 4;
  const c = { i: extra.i != null ? extra.i : -1, K, n, mom: null, pen: null, x, z, yaw: rnd(0, 6.28), st: 'idle', t: 0, dur: rnd(1, 4), tx: 0, tz: 0, ph: rnd(0, 6),
    moving: 0, lie: 0, graze: 0, hp: 0, hy: 0, hyGoal: 0, tail: rnd(0, 6), petCd: 0, chew: 0, stuck: 0, ...extra };
  herd.push(c); return c;
}
function unspawn(c) {
  const K = c.K, z = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const m of [K.body, K.head, K.tail, K.wool, K.woolHead]) if (m) m.setMatrixAt(c.n, z);
  for (let i = 0; i < 4; i++) K.legs.setMatrixAt(c.n * 4 + i, z);
  K.free.push(c.n); herd.splice(herd.indexOf(c), 1);
  for (const o of herd) if (o.mom === c) o.mom = null;
  if (follower === c) setFollower(null);
}

// ---------- where a cow may stand: the grass in front of your land, off the crops, the decor, the water and the stalls ----------
function ok(x, z, s = 1, box = null) {
  const r = 0.6 * s;
  if (box === 'own') return pen.inside(x, z, r * 0.8);   // your own cows stay in the pen (RANCH)
  if (box) { if (x < box.x0 + r || x > box.x1 - r || z < box.z0 + r || z > box.z1 - r) return false; }
  else if (Math.abs(x) > RANGE.x || z < RANGE.z0 || z > A.fenceZ() - 1.0) return false;   // the middle and four points round it: a cow is about a metre long whichever way it faces
  for (const [dx, dz] of [[0, 0], [0, r], [0, -r], [r, 0], [-r, 0]]) {
    const px = x + dx, pz = z + dz;
    if ((box && box.lot ? !A.wildFree(px, pz) : !A.walkable(px, pz)) || A.solid(px, pz) || A.wet(px, pz) || A.decorAt(px, pz) || A.plots.has(Math.floor(px) + ',' + Math.floor(pz))) return false;
  }
  return true;
}

// ---------- the cow, made in code: the blocky look from the mockups ----------
const INK = 0x2b2140, PINK = 0xff9fb0, WHITE = 0xffffff;
// one box, in the mockup's axes (x forward, y up, z sideways), moved so (px, py, pz) is the bone it hangs from.
// The game's animals face +z, so the mockup's x becomes the game's z.
function box(list, w, h, d, color, x, y, z, rz, pv) {
  let g = new THREE.BoxGeometry(d, h, w).toNonIndexed();
  if (rz) g.rotateX(-rz);
  g.translate(z - pv[2], y - pv[1], x - pv[0]);
  g.deleteAttribute('uv');
  paint(g, color); list.push(g);
}
function paint(g, color) {
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
}
// ---------- soft wool (sheep): smooth round puffs, laid out from a seed so every sheep is a bit different ----------
// Mac, Nov 25: "I want it to look full of wool and not splotchy", "I like f1 a lot but it's still seems symmetrical",
// "How about just added more bumps all over". 'coat' = F1 (one soft coat with bumps along the top), 'bumps' = H1
// (about 25 bumps all over, so the body shape doesn't show). Smooth-shaded, so it has its own material.
function ball(list, r, x, y, z, pv, color, det, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.IcosahedronGeometry(r, det); g.deleteAttribute('uv');
  g.scale(sz, sy, sx); g.translate(z - pv[2], y - pv[1], x - pv[0]);   // mockup axes (x forward) to the game's (z forward)
  paint(g, color); list.push(g);
}
function softWool(kind, seed, WB, WH, coat, d) {
  let sd = seed >>> 0;
  const rng = () => { sd = (sd + 0x6D2B79F5) >>> 0; let t = sd; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const J = (v) => (rng() - 0.5) * 2 * v, rr = (a, b) => a + rng() * (b - a), O = [0, 0, 0], { by, hx, ty, neck } = d, k = d.k || 1;
  const P = (r, x, y, z) => ball(WB, r, x, y, z, O, coat, 2), Ph = (r, x, y, z) => ball(WH, r, x, y, z, neck, coat, 2);
  if (kind === 'coat') {
    ball(WB, 1, 0, by + 0.02, 0, O, coat, 3, 0.6, 0.44, 0.5);
    for (const [x, zz, r] of [[-0.3, 0.1, 0.22], [-0.08, -0.1, 0.24], [0.14, 0.1, 0.23], [0.32, -0.06, 0.2]]) P(r + rng() * 0.02, x + J(0.02), by + 0.26, zz + J(0.03));
    for (const s2 of [1, -1]) for (const x of [-0.22, 0.18]) P(0.24 + rng() * 0.02, x + J(0.03), by - 0.02, s2 * 0.3);
    P(0.26, -0.42, by + 0.04, 0); P(0.22, 0.4, by + 0.02, 0);
    Ph(0.13, hx - 0.16, ty + 0.05, 0.07); Ph(0.14, hx - 0.06, ty + 0.07, -0.06);
  } else {
    // a smaller wool body shrinks the oval and the bumps together, and sits a touch lower so it still hugs the legs
    const cy = by + 0.02 - (1 - k) * 0.12;
    ball(WB, 1, 0, cy, 0, O, coat, 3, 0.5 * k, 0.37 * k, 0.42 * k);
    const n = 26, ga = Math.PI * (3 - Math.sqrt(5)), off = rng() * 6.28;
    for (let i = 0; i < n; i++) {   // spread over the oval like seeds on a sunflower, each nudged a little
      const yy = 1 - (i + 0.5) / n * 2, rad = Math.sqrt(1 - yy * yy), th = i * ga + off + J(0.35), uy = yy + J(0.12);
      if (uy < -0.75) continue;   // not right underneath, between the legs
      P(rr(0.17, 0.26) * k, Math.cos(th) * rad * 0.56 * k, cy + uy * 0.42 * k, Math.sin(th) * rad * 0.48 * k);
    }
    P(rr(0.2, 0.25) * k, -0.5 * k, cy + 0.04 * k + J(0.05), J(0.08));
    const nh = 2 + Math.floor(rng() * 2); for (let i = 0; i < nh; i++) Ph(rr(0.09, 0.14), hx - 0.18 + i * 0.07 + J(0.03), ty + 0.05 + J(0.03), J(0.1));
  }
}
function imSoft(list, n) {
  const g = mergeGeometries(list);   // keeps each ball's own round normals, so it shades smooth
  const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), n);
  m.count = 0; m.frustumCulled = false; m.castShadow = true; A.scene.add(m); return m;
}
function buildKind(sp, baby, soft, seed, N, wsize = 1, hsize = 1) {
  const c = SP[sp], coat = c.coat, head = c.head || coat, legC = c.leg || coat, patch = baby && c.babyPatch ? c.babyPatch : c.patch, ln = c.long || 1, wd = c.wide || 1;
  const L = 0.95 * ln, W = 0.76 * wd, hk = (c.headK || 1) * (baby ? 1.08 : 1), hx = 0.74 * ln, hy = 1.08, lh = 0.38 * (c.legK || 1), by = 0.34 + lh, hw = 0.8 * hk, hh = 0.66 * hk, hl = 0.7 * hk, fx = hx + hl / 2;
  const O = [0, 0, 0], neck = [hx - hl / 2, hy - 0.1, 0], tailAt = [-L / 2 - 0.02, by + 0.18, 0];
  const B = [], H = [], leg = [], T = [];
  const wl = c.wool && soft, WB = [], WH = [];   // a soft wool coat: its own smooth meshes, on the body and on the head
  if (!wl) box(B, L, 0.7, W, coat, 0, by, 0, 0, O);
  // patches wrap over the top of the back, so no pale sliver shows above them
  if (patch) { box(B, 0.34, 0.34, W + 0.03, patch, -0.22, by + 0.195, 0, 0, O); box(B, 0.26, 0.26, W + 0.03, patch, 0.2, by - 0.12, 0, 0, O); }
  if (wl) softWool(soft, seed, WB, WH, coat, { L, W, by, hx, ty: hy + hh / 2, neck, k: wsize });
  else if (c.wool) {   // stepped wool: a fat coat plus bumps of different heights
    box(B, L + 0.12, 0.62, W + 0.12, coat, 0, by + 0.02, 0, 0, O);
    for (const [wx, wy, ww, wh, wdp] of [[-0.3, 0.4, 0.3, 0.16, W * 0.78], [0.02, 0.46, 0.3, 0.2, W * 0.62], [0.3, 0.38, 0.24, 0.14, W * 0.74], [-0.2, 0.1, 0.3, 0.34, W + 0.3], [0.2, -0.06, 0.28, 0.3, W + 0.28], [-0.02, -0.2, 0.26, 0.2, W + 0.22], [-L / 2 - 0.06, 0.12, 0.16, 0.36, W * 0.7]]) box(B, ww, wh, wdp, coat, wx, by + wy, 0, 0, O);
    box(H, hl * 0.8, 0.18, hw * 0.9, coat, hx - 0.08, hy + hh / 2 + 0.06, 0, 0, neck); box(H, hl * 0.46, 0.12, hw * 0.52, coat, hx - 0.1, hy + hh / 2 + 0.2, 0, 0, neck);
  }
  box(H, hl, hh, hw, head, hx, hy, 0, 0, neck);
  if (c.face) box(H, 0.31, 0.28, hw + 0.03, patch, hx - 0.21, hy + 0.205, 0, 0, neck);   // pokes a hair past the back of the head, so two faces don't flicker
  if (c.snout) box(H, 0.16, 0.26, 0.36, c.muz, fx + 0.07, hy - 0.1, 0, 0, neck); else box(H, 0.2, 0.28 * hk, 0.5 * hk, c.muz, fx + 0.08, hy - 0.17 * hk, 0, 0, neck);
  const ey = hy + 0.07 * hk, ez = hw * 0.3;
  for (const s of [1, -1]) {
    box(H, 0.03, 0.06, 0.06, INK, fx + (c.snout ? 0.16 : 0.185), hy - (c.snout ? 0.1 : 0.14 * hk), s * (c.snout ? 0.08 : 0.12), 0, neck);   // nostril
    if (c.eyeWhite) box(H, 0.05, 0.32 * hk, 0.25 * hk, WHITE, fx + 0.002, ey, s * ez, 0, neck);
    box(H, 0.06, 0.25 * hk, 0.17 * hk, INK, fx + 0.014, ey, s * ez, 0, neck);                                // big eye
    box(H, 0.03, 0.1 * hk, 0.08 * hk, WHITE, fx + 0.05, ey + 0.06 * hk, s * (ez + 0.035 * hk), 0, neck);      // sparkle
    if (!c.eyeWhite) box(H, 0.03, 0.045 * hk, 0.045 * hk, WHITE, fx + 0.05, ey - 0.07 * hk, s * (ez - 0.04 * hk), 0, neck);   // small sparkle
    box(H, 0.04, 0.09, 0.13, PINK, fx + 0.012, hy - 0.16 * hk, s * hw * 0.42, 0, neck);                       // rosy cheek
    if (c.earUp) box(H, 0.1, 0.22, 0.18, coat, hx - 0.06, hy + hh / 2 + 0.08, s * hw * 0.36, -0.4, neck);
    else { const ey2 = hy + 0.3 * hk - (c.earOut ? 0.14 : 0); box(H, 0.12, 0.14, 0.22, head, hx - 0.1, ey2, s * (hw / 2 + 0.1), 0, neck); box(H, 0.06, 0.08, 0.14, PINK, hx - 0.04, ey2, s * (hw / 2 + 0.1), 0, neck); }
    if (c.horn && !baby) box(H, 0.09, 0.42 * c.horn.len, 0.09, c.horn.col, hx - 0.02 - c.horn.back * 0.14, hy + hh / 2 + 0.2 * c.horn.len, s * hw * 0.28, c.horn.back, neck);
  }
  if (c.beard) box(H, 0.1, 0.24, 0.14, c.muz, fx + 0.02, hy - hh / 2 - 0.1, 0, 0, neck);
  if (c.ring && !baby) { const r = new THREE.TorusGeometry(0.08, 0.024, 5, 10).toNonIndexed(); r.translate(0, hy - 0.33 - neck[1], fx + 0.19 - neck[0]); r.deleteAttribute('uv'); paint(r, 0xf4c542); H.push(r); }
  if (c.udder && !baby) box(B, 0.26, 0.12, 0.3, c.muz, -0.16, by - 0.38, 0, 0, O);
  if (c.bell && !baby) { box(B, 0.1, 0.08, hw + 0.04, 0xe2574c, hx - 0.32, hy - 0.3, 0, 0, O); box(B, 0.12, 0.12, 0.12, 0xf4c542, hx - 0.26, hy - 0.42, 0, 0, O); }
  box(leg, 0.22, lh, 0.22, legC, 0, lh / 2, 0, 0, [0, lh, 0]); box(leg, 0.23, 0.11, 0.23, c.hoof, 0, 0.055, 0, 0, [0, lh, 0]);
  if (c.tail === 'tuft') { box(T, 0.07, 0.4, 0.07, coat, -L / 2 - 0.03, by, 0, -0.35, tailAt); box(T, 0.12, 0.14, 0.12, patch, -L / 2 - 0.13, by - 0.22, 0, 0, tailAt); }
  if (c.tail === 'puff' && wl) ball(T, 0.13 * wsize, -0.5 * wsize - 0.1, by + 0.1 - (1 - wsize) * 0.12, 0, tailAt, coat, 2);   // a round tail puff that sits against the soft wool
  else if (c.tail === 'puff') box(T, 0.2, 0.2, 0.24, coat, -L / 2 - 0.2, by + 0.1, 0, 0, tailAt);
  if (c.tail === 'up') box(T, 0.08, 0.2, 0.1, coat, -L / 2 - 0.02, by + 0.36, 0, 0.5, tailAt);
  if (c.tail === 'curl') { box(T, 0.08, 0.08, 0.08, c.muz, -L / 2 - 0.05, by + 0.14, 0, 0, tailAt); box(T, 0.08, 0.14, 0.08, c.muz, -L / 2 - 0.12, by + 0.2, 0.05, 0, tailAt); }
  if (hsize !== 1) {   // a smaller head: shrink every head part about the head's middle, and slide it back so it still meets the body
    const cz = hx - neck[0], cy = hy - neck[1], back = (1 - hsize) * hl * 0.5;
    for (const g of [...H, ...WH]) { g.translate(0, -cy, -cz); g.scale(hsize, hsize, hsize); g.translate(0, cy, cz - back); }
  }
  const body = B, head_ = H, tail = T;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
  const im = (list, n) => { const g = list.length ? mergeGeometries(list) : new THREE.BufferGeometry();   // a sheep in soft wool has no body box
  g.computeVertexNormals(); const m = new THREE.InstancedMesh(g, mat, n); m.count = 0; m.frustumCulled = false; m.castShadow = true; A.scene.add(m); return m; };
  return { sp, s: c.size * (baby ? 0.62 : 1), baby, voice: c.voice, used: 0, lh, neck, tailAt, hips: [[0.24 * wd, 0.3 * ln], [-0.24 * wd, 0.3 * ln], [0.24 * wd, -0.3 * ln], [-0.24 * wd, -0.3 * ln]],
    body: im(body, N), head: im(head_, N), legs: im(leg, N * 4), tail: im(tail, N),
    wool: wl ? imSoft(WB, N) : null, woolHead: wl ? imSoft(WH, N) : null };
}

// ---------- every frame: think, keep apart, pose ----------
export function frame(dt, elapsed) {
  if (!ready) return;
  if (!wildOn && !opts.test && A.lotOwned(WILD_AFTER)) spawnWild();   // the herd arrives when you buy the lake lot
  const P = A.player.pos, night = A.currentTOD() === 'night';
  for (const c of herd) think(c, dt, P, night);
  // cows don't walk through each other
  for (let i = 0; i < herd.length; i++) for (let j = i + 1; j < herd.length; j++) {
    const a = herd[i], b = herd[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = 0.75 * (a.K.s + b.K.s);
    if (d < min && d > 1e-4 && !!a.own === !!b.own) { const push = (min - d) * 0.5 * Math.min(1, dt * 6) / d;   // RANCH: your cows (in the pen) and wild ones never push each other
      const ax = a.x - dx * push, az = a.z - dz * push, bx = b.x + dx * push, bz = b.z + dz * push;
      // a nudge never pushes an animal into a fence, the pen, crops or water (unless it's somehow there already)
      const free = (c, x, z) => (c.own ? pen.inside(x, z, 0.25 * c.K.s) : ok(x, z, c.K.s, c.pen) || !ok(c.x, c.z, c.K.s, c.pen));
      if (free(a, ax, az)) { a.x = ax; a.z = az; } if (free(b, bx, bz)) { b.x = bx; b.z = bz; } }
  }
  for (const c of herd) pose(c, dt, elapsed);
  if (!opts.test) { secT -= dt; if (secT <= 0) { secT = 0.5; syncOwn(); } placeBubbles(elapsed); tickFollowHeart(elapsed); }
  for (const K of Object.values(kinds)) for (const m of [K.body, K.head, K.legs, K.tail, K.wool, K.woolHead]) if (m) m.instanceMatrix.needsUpdate = true;
  // a moo now and then while you're about, softer when far away
  mooT -= dt;
  if (mooT <= 0) { mooT = rnd(18, 40); let best = null, bd = 12; for (const c of herd) { const d = Math.hypot(c.x - P.x, c.z - P.z); if (d < bd && c.st !== 'lie') { bd = d; best = c; } } if (best) moo(best, Math.max(0.25, 1 - bd / 12)); }
  tickFx(dt);
}

function think(c, dt, P, night) {
  c.t += dt; c.moving = 0; c.petCd = Math.max(0, c.petCd - dt);
  const dP = Math.hypot(P.x - c.x, P.z - c.z);
  // the calf keeps close to its mum
  if (c.mom && c !== follower && c.st !== 'lie' && Math.hypot(c.mom.x - c.x, c.mom.z - c.z) > 2.2 && c.st !== 'walk') { c.st = 'walk'; c.t = 0; c.tx = c.mom.x + rnd(-0.9, 0.9); c.tz = c.mom.z + rnd(-0.9, 0.9); c.fast = 1.6; }
  if (c === follower) { follow(c, dt, P, dP); return; }
  if (night && c.st !== 'lie' && c.st !== 'pet') { c.st = 'lie'; c.t = 0; }
  switch (c.st) {
    case 'idle':
      if (c.t > c.dur) { c.t = 0; const r = Math.random();
        if (r < 0.45) { c.st = 'graze'; c.dur = rnd(4, 10); }
        else if (r < 0.93) { if (pickTarget(c)) { c.st = 'walk'; c.fast = 0; } else c.dur = rnd(1, 3); }
        else { c.st = 'lie'; c.dur = rnd(20, 45); } }
      break;
    case 'graze':
      if (c.t > c.dur) rest(c);
      break;
    case 'walk':
      if (step(c, dt, SPEED * (c.fast || 1) * (c.K.baby ? 1.15 : 1)) || c.t > 14 || c.stuck > 0.8) { c.fast = 0; c.stuck = 0; if (Math.random() < 0.55) { c.st = 'graze'; c.t = 0; c.dur = rnd(3, 8); } else rest(c); }
      break;
    case 'lie':
      if (!night && c.t > (c.dur || 30)) rest(c);
      break;
    case 'pet':                              // stands still and looks at you for a moment
      face(c, P.x, P.z, dt * 0.6);
      if (c.t > 2.6) { if (night) { c.st = 'lie'; c.t = 0; } else rest(c); }
      break;
  }
  // watch you when you're close (the head turns, up to a point)
  c.hyGoal = 0;
  if (dP < LOOK && c.st !== 'graze') { const rel = wrap(Math.atan2(P.x - c.x, P.z - c.z) - c.yaw); c.hyGoal = Math.max(-0.8, Math.min(0.8, rel)); }
}
function rest(c) { c.st = 'idle'; c.t = 0; c.dur = rnd(1.5, 5); }
function face(c, x, z, k) { const d = wrap(Math.atan2(x - c.x, z - c.z) - c.yaw); c.yaw += d * Math.min(1, k * 3); }
function pickTarget(c) {
  if (c.pen === 'own') { const p = spot(c.K.s); if (p && Math.hypot(p.x - c.x, p.z - c.z) > 0.4) { c.tx = p.x; c.tz = p.z; return true; } return false; }   // RANCH: anywhere in the pen (a small pen has no spot 1.5 m away)
  const b = c.pen && c.pen.lot ? c.pen : null;
  if (b && (c.x < b.x0 || c.x > b.x1 || c.z < b.z0 || c.z > b.z1)) {   // strayed out of its lot (a cow that stopped following you): head back
    for (let i = 0; i < 20; i++) { const x = rnd(b.x0, b.x1), z = rnd(b.z0, b.z0 + Math.min(4, b.z1 - b.z0)); if (ok(x, z, c.K.s, b)) { c.tx = x; c.tz = z; return true; } }
    return false;
  }
  for (let i = 0; i < 10; i++) {
    const a = rnd(0, 6.283), r = rnd(1.5, 5), x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
    if (ok(x, z, c.K.s, c.pen)) { c.tx = x; c.tz = z; return true; }
  }
  return false;
}
function step(c, dt, speed) {
  const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
  if (d < 0.1) return true;
  const want = Math.atan2(dx, dz), dy = wrap(want - c.yaw); c.yaw += dy * Math.min(1, dt * 2.5);
  const mv = Math.min(d, speed * dt * (Math.abs(dy) > 0.9 ? 0.25 : 1));
  const nx = c.x + Math.sin(c.yaw) * mv, nz = c.z + Math.cos(c.yaw) * mv, P = A.player.pos;
  // stops rather than walking into you, a wall or the water
  // a cow following you home may leave her lot; one that strayed may cross your land to get back to it
  const box = c === follower ? null : c.pen, lotBox = box && box.lot;
  const can = ok(nx, nz, c.K.s, box) || (lotBox && !ok(c.x, c.z, c.K.s, box) && ok(nx, nz, c.K.s, null));
  if (!can || Math.hypot(nx - P.x, nz - P.z) < 0.95 * c.K.s + 0.3) { c.stuck += dt; return false; }
  c.x = nx; c.z = nz; c.ph += mv * 7.5 / c.K.s; c.moving = speed;
  return false;
}

// ---------- how a cow holds itself: walk, graze, chew, lie down, swish ----------
function pose(c, dt, el) {
  const K = c.K, R = rig, lieGoal = c.st === 'lie' ? 1 : 0, grazeGoal = c.st === 'graze' ? 1 : 0;
  c.lie += (lieGoal - c.lie) * Math.min(1, dt * 1.6);
  c.graze += (grazeGoal - c.graze) * Math.min(1, dt * 2.2);
  c.hy += (c.hyGoal * (1 - c.graze) - c.hy) * Math.min(1, dt * 3);
  const w = c.moving ? Math.sin(c.ph) : 0, sw = w * 0.42 * (1 - c.lie);
  const bob = c.moving ? Math.abs(Math.cos(c.ph)) * 0.025 : 0, breathe = Math.sin(el * 1.7 + c.i) * 0.006;
  R.root.position.set(c.x, A.groundY(c.x, c.z), c.z); R.root.rotation.set(0, c.yaw, 0); R.root.scale.setScalar(K.s);
  R.body.position.y = bob + breathe - c.lie * (K.lh - 0.06); R.body.rotation.set(0, 0, w * 0.03);
  // head: dips to the grass while grazing (and chews), droops a little when lying, nods while walking
  const chew = c.graze > 0.6 ? Math.sin(el * 9 + c.i) * 0.05 : 0;
  R.head.position.set(K.neck[2], K.neck[1] - c.graze * 0.3, K.neck[0]);
  R.head.rotation.set(c.graze * 1.0 + c.lie * 0.15 + (c.moving ? Math.sin(c.ph * 2) * 0.05 : 0) + chew, c.hy, 0);
  K.hips.forEach(([hz, hx], i) => {
    const front = hx > 0, diag = (i === 0 || i === 3) ? 1 : -1;
    R.legs[i].position.set(hz, K.lh, hx);
    R.legs[i].rotation.set(sw * diag + c.lie * (front ? 1.45 : -1.45), 0, 0);
  });
  c.tail += dt * (c.moving ? 3 : 1.3);
  R.tail.position.set(K.tailAt[2], K.tailAt[1], K.tailAt[0]); R.tail.rotation.set(0, 0, Math.sin(c.tail) * 0.35);
  R.root.updateMatrixWorld(true);
  K.body.setMatrixAt(c.n, R.body.matrixWorld); K.head.setMatrixAt(c.n, R.head.matrixWorld); K.tail.setMatrixAt(c.n, R.tail.matrixWorld);
  if (K.wool) { K.wool.setMatrixAt(c.n, R.body.matrixWorld); K.woolHead.setMatrixAt(c.n, R.head.matrixWorld); }
  for (let i = 0; i < 4; i++) K.legs.setMatrixAt(c.n * 4 + i, R.legs[i].matrixWorld);
}

// ---------- you can't walk through a cow ----------
export function block(np, pos) {
  if (!ready) return;
  for (const c of herd) {
    const s = c.K.s, cx = c.x + Math.sin(c.yaw) * 0.2 * s, cz = c.z + Math.cos(c.yaw) * 0.2 * s, r = 0.62 * s + 0.2;
    const dx = np.x - cx, dz = np.z - cz, d = Math.hypot(dx, dz);
    if (d < r) { if (Math.hypot(pos.x - cx, pos.z - cz) < r) continue;   // already inside (it walked into you): let you out
      np.x = cx + dx / (d || 1) * r; np.z = cz + dz / (d || 1) * r; }
  }
}

// ---------- Pet: walk up and press the button, or tap the cow ----------
function pet(c) {
  c.petCd = 3; if (c !== follower) { c.st = 'pet'; c.t = 0; } c.hyGoal = 0;
  moo(c, 1);
  if (c.wild && c !== follower) { petWild(c); return; }
  pop(c, 3);
}
function moo(c, lv) { const v = c.K.voice; A.audio.play(c.K.baby ? (v === 'moo' ? 'mooLittle' : v + 'Little') : v, lv); }
export function pickUse() {
  if (!ready || A.busy()) return null;
  const P = A.player.pos; let best = null, bd = REACH;
  // RANCH: a cow of yours with milk ready, from just outside the pen's fence
  for (const c of herd) if (c.own && pen.milkReady(c.own) && Math.hypot(c.x - P.x, c.z - P.z) < 2.3) return { kind: 'collect', key: 'milk' + c.own.id, icon: 'milk', label: 'Milk', go: () => milk(c) };
  for (const c of herd) { const d = Math.hypot(c.x - P.x, c.z - P.z) - 0.3 * c.K.s - (c.own ? 0.6 : 0); if (d < bd && c.petCd <= 0) { bd = d; best = c; } }
  return best ? { kind: 'collect', key: 'cow' + (best.own ? 'o' + best.own.id : best.i), icon: 'heart', label: 'Pet', go: () => pet(best) } : null;
}
export function tap(x, y) {
  if (!ready || A.busy()) return false;
  if (!ray) ray = { r: new THREE.Raycaster(), n: new THREE.Vector2(), s: new THREE.Sphere() };
  ray.n.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.r.setFromCamera(ray.n, A.camera);
  for (const c of herd) {
    const s = c.K.s; ray.s.center.set(c.x + Math.sin(c.yaw) * 0.25 * s, A.groundY(c.x, c.z) + (0.75 - c.lie * 0.3) * s, c.z + Math.cos(c.yaw) * 0.25 * s); ray.s.radius = 0.75 * s;
    if (!ray.r.ray.intersectsSphere(ray.s)) continue;
    if (c.own && pen.milkReady(c.own)) { milk(c); return true; }   // RANCH: tap a cow with milk ready to milk her
    if (c.petCd <= 0) { pet(c); return true; }
  }
  return false;
}

// ---------- RANCH: leading a wild cow home (Mac: "Lead one home"; picks 7b A just follows, 7c C 5 pets, any time) ----------
const PETS_TO_FOLLOW = 5;
function petWild(c) {
  const w = pen.st().wild, n = Math.min(PETS_TO_FOLLOW, (w[c.i] || 0) + 1); w[c.i] = n; A.commit();
  pop(c, n);
  if (n < PETS_TO_FOLLOW) { if (n === 1) A.toast(`This cow likes you! Pet her ${PETS_TO_FOLLOW - 1} more times`); return; }
  if (!pen.hasPen()) { A.toast(pen.st().bp ? 'She\u2019d follow you! Place your cow pen first' : 'She\u2019d follow you home! Nell sells a cow pen blueprint'); return; }
  if (pen.room() <= 0) { A.toast('She\u2019d follow you, but your pen is full. Make it bigger with wood'); return; }
  if (follower && follower !== c) { A.toast('One cow at a time: take the first one home'); return; }
  setFollower(c); A.toast('She\u2019s following you! Walk her to your pen\u2019s gate');
}
function setFollower(c) { if (follower) { follower.fast = 0; if (follower.st === 'walk') rest(follower); } follower = c; if (c) { c.st = 'walk'; c.t = 0; } }
function follow(c, dt, P, dP) {
  const g = pen.gate();
  if (!g || pen.room() <= 0) { setFollower(null); A.toast('Your pen is full now. Make it bigger, then pet her again'); return; }
  if (Math.hypot(c.x - g.out.x, c.z - g.out.z) < 1.6 || (Math.hypot(P.x - g.out.x, P.z - g.out.z) < 1.3 && dP < 3.2)) { adopt(c); return; }   // she's at the gate (or you are, with her right behind you)
  if (dP > 14) { setFollower(null); A.toast('The cow wandered off. Pet her again to lead her home'); return; }
  if (dP > 1.7) { c.tx = P.x - Math.sin(Math.atan2(P.x - c.x, P.z - c.z)) * 1.2; c.tz = P.z - Math.cos(Math.atan2(P.x - c.x, P.z - c.z)) * 1.2; c.st = 'walk'; step(c, dt, SPEED * (dP > 4 ? 2.4 : 1.6)); c.stuck = 0; }
  else { c.st = 'idle'; face(c, P.x, P.z, dt); }
  c.hyGoal = 0;
}
function adopt(c) {
  const baby = c.K.baby, rec = pen.addCow(baby), s = pen.st();
  s.gone.push(c.i); delete s.wild[c.i]; A.commit();
  const g = pen.gate(); unspawn(c);
  syncOwn({ x: g.in.x, z: g.in.z });
  A.audio.play('levelUp'); A.toast(`${rec.name} is yours!`);
  const nc = herd.find(o => o.own === rec); if (nc) { moo(nc, 1); pop(nc, 3); }
}
// your own cows: one per cow in the save, in the pen; calves that grow up become cows
function syncOwn(at) {
  if (!ready) return;
  const cows = pen.st().cows, now = cows.map(r => r.id + (r.baby ? 'b' : '')).join(',') + '|' + pen.penVersion();
  for (const c of herd) if (c.own) { const r = cows.find(x => x.id === c.own.id); if (r && r !== c.own) c.own = r; }   // the save was loaded again: same cows, new records
  if (now === ownSig) return; ownSig = now;
  const was = {};   // a calf that grew up stays where she stood
  for (const c of herd.filter(o => o.own)) { const r = cows.find(x => x === c.own); if (!r || r.baby !== c.K.baby || !pen.hasPen()) { if (r) was[r.id] = { x: c.x, z: c.z, yaw: c.yaw }; unspawn(c); } else if (!pen.inside(c.x, c.z, 0.3)) { const p = spot(c.K.s); if (p) { c.x = p.x; c.z = p.z; } } }
  evict();
  if (!pen.hasPen()) return;
  for (const r of cows) {
    if (herd.some(o => o.own === r)) continue;
    const K = kinds[kindKey(OWN(r.baby), -1)], w = was[r.id], p = w && pen.inside(w.x, w.z, 0.3) ? w : at && pen.inside(at.x, at.z, 0.2) ? at : spot(K.s) || pen.gate().in;
    const c = spawn(K, p.x, p.z, { own: r, pen: 'own' }); if (c && w) c.yaw = w.yaw;
  }
}
// the pen was placed or grew: a wild animal standing where it now is steps out to the nearest free grass
function evict() {
  for (const c of herd) {
    if (c.own || c.pen || ok(c.x, c.z, c.K.s) || !A.solid(c.x, c.z)) continue;
    let best = null;
    for (let r = 0.5; r <= 8 && !best; r += 0.5) for (let a = 0; a < 6.28; a += 0.4) { const x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r; if (ok(x, z, c.K.s) && Math.hypot(x - A.player.pos.x, z - A.player.pos.z) > 1.3) { best = { x, z }; break; } }
    if (best) { c.x = best.x; c.z = best.z; if (c.st === 'walk') rest(c); }
  }
}
function spot(s) { const cells = pen.st().pen.cells; for (let t = 0; t < 40; t++) { const [x, z] = cells[Math.floor(Math.random() * cells.length)].split(',').map(Number), px = x + 0.5 + rnd(-0.3, 0.3), pz = z + 0.5 + rnd(-0.3, 0.3); if (ok(px, pz, s, 'own')) return { x: px, z: pz }; } return null; }
// milk: tap the bubble over her, tap her, or the Milk button (pick 9 C)
function milk(c) {
  if (!pen.milkCow(c.own)) return;
  c.petCd = 2; c.st = 'pet'; c.t = 0; moo(c, 1); popMilk(c);
  A.toast(`+1 milk from ${c.own.name}`);
}
// the milk bubbles: a little round button over each cow with milk ready
function placeBubbles() {
  const ready_ = herd.filter(c => c.own && pen.milkReady(c.own) && !A.busy());
  while (bubbles.length < ready_.length) {
    const b = document.createElement('button'); b.className = 'milkBub'; b.setAttribute('aria-label', 'Milk');
    b.innerHTML = `<img src="${A.cropIcon.milk}" width="26" height="26" alt="">`;
    for (const ev of ['pointerdown', 'pointerup', 'pointermove', 'touchstart']) b.addEventListener(ev, e => e.stopPropagation());
    b.addEventListener('click', () => { const c = b._cow; if (c) milk(c); });
    document.body.appendChild(b); bubbles.push(b);
    if (!document.getElementById('milkBubCss')) { const css = document.createElement('style'); css.id = 'milkBubCss';
      css.textContent = '.milkBub { position: fixed; z-index: 6; transform: translate(-50%, -100%); width: 46px; height: 46px; border-radius: 50%; border: 3px solid #2b2140; background: #fffdf5; box-shadow: 0 3px 0 rgba(43,33,64,.3); padding: 0; display: flex; align-items: center; justify-content: center; } .milkBub[hidden] { display: none; } body.in-store .milkBub { display: none !important; }'; document.head.appendChild(css); }
  }
  const v = new THREE.Vector3();
  bubbles.forEach((b, i) => {
    const c = ready_[i]; b._cow = c || null; b.hidden = !c; if (!c) return;
    v.set(c.x, A.groundY(c.x, c.z) + (1.75 - c.lie * 0.45) * c.K.s, c.z).project(A.camera);
    b.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px'; b.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px'; b.style.visibility = v.z < 1 ? 'visible' : 'hidden';
  });
}
let followSp = null;
function tickFollowHeart(el) {
  if (!follower) { if (followSp) followSp.visible = false; return; }
  if (!followSp) { pop(follower, 0); followSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthTest: false })); followSp.renderOrder = 20; A.scene.add(followSp); }
  const c = follower; followSp.visible = true; followSp.scale.setScalar(0.38 + Math.sin(el * 4) * 0.03);
  followSp.position.set(c.x, A.groundY(c.x, c.z) + 1.75 * c.K.s + Math.sin(el * 2.5) * 0.05, c.z);
}
let milkTex = null;
function popMilk(c) {
  if (!milkTex) { const im = new Image(); im.src = A.cropIcon.milk; milkTex = new THREE.Texture(im); im.onload = () => { milkTex.needsUpdate = true; }; milkTex.colorSpace = THREE.SRGBColorSpace; }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: milkTex, transparent: true, depthTest: false })); sp.renderOrder = 20; sp.scale.setScalar(0.4); A.scene.add(sp);
  fx.push({ sp, x: c.x, y: A.groundY(c.x, c.z) + 1.5 * c.K.s, z: c.z, t: 0 });
}

// ---------- little hearts that float up ----------
function pop(c, n) {
  if (!heartTex) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const k = cv.getContext('2d');
    k.translate(32, 34); k.fillStyle = '#ff6f8e'; k.strokeStyle = '#2b2140'; k.lineWidth = 4;
    k.beginPath(); k.moveTo(0, 20); k.bezierCurveTo(-30, 2, -22, -24, 0, -10); k.bezierCurveTo(22, -24, 30, 2, 0, 20); k.closePath(); k.fill(); k.stroke();
    heartTex = new THREE.CanvasTexture(cv); heartTex.colorSpace = THREE.SRGBColorSpace;
  }
  const s = c.K.s, y0 = A.groundY(c.x, c.z) + (1.55 - c.lie * 0.45) * s;
  for (let i = 0; i < n; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthTest: false }));
    sp.renderOrder = 20; sp.scale.setScalar(0.32); A.scene.add(sp);
    fx.push({ sp, x: c.x + (i - (n - 1) / 2) * 0.28, y: y0, z: c.z, t: -i * 0.12 });
  }
}
function tickFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt;
    const u = Math.max(0, f.t) / 1.3; f.sp.visible = f.t >= 0;
    f.sp.position.set(f.x, f.y + u * 0.7, f.z); f.sp.material.opacity = 1 - Math.max(0, u - 0.55) / 0.45; f.sp.scale.setScalar(0.32 * Math.min(1, 0.4 + u * 4));
    if (u >= 1) { A.scene.remove(f.sp); f.sp.material.dispose(); fx.splice(i, 1); }
  }
}

// for tests and screenshots (herd() hands back the live cows)
export const herdOf = () => herd;
export const debug = () => ({ ready, follower: follower ? herd.indexOf(follower) : -1, herd: herd.map(c => ({ kind: c.K.sp + (c.K.baby ? ' baby' : ''), x: +c.x.toFixed(2), z: +c.z.toFixed(2), st: c.st, wild: !!c.wild, own: c.own ? c.own.name : null, i: c.i })) });
export const petCow = (c) => pet(c);
