// Fishing places and where bait comes from (try/fishing).
// - The river down the left edge of the land and the lake in the left half of lot 2 (mockup "Lake B2"):
//   pure math for the ground (carve, isWet, onBank), the fresh water sheet, which place a cast lands in.
// - The bait rule (mockups "Bait A" + "Bait C"): no bare hook; Fishel's free pack once a day and a worm
//   bucket by the dock that refills by itself, even while you're away.
// main.js only calls the small hooks exported here; look for "FISHING" there.
import { BAIT_HELP } from './data.js';

let A = null, THREE = null;

// ---------- the river and the lake (math only: also used by the ground before init) ----------
export const RIVER = { x: -13.9, amp: 0.3, half: 0.8, bank: 0.8, depth: 0.8, zEnd: 35.5 };   // runs from the woods behind the lots down to the sea
export const LAKE = { x: -8.2, z: 17.7, rx: 5.7, rz: 2.5, lot: 'back2' };                    // the left half of lot 2 (the thicket)
const smooth = (a, b, t) => { t = Math.min(1, Math.max(0, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
export const riverX = (z) => RIVER.x + Math.sin(z * 0.5) * RIVER.amp;
function riverWet(x, z) {
  const d = Math.abs(x - riverX(z));
  if (d > RIVER.half + RIVER.bank) return 0;
  return (1 - smooth(RIVER.half, RIVER.half + RIVER.bank, d)) * (1 - smooth(RIVER.zEnd - 2.5, RIVER.zEnd, z)) * smooth(-8.5, -6.5, z);
}
function lakeWet(x, z) {
  const dx = (x - LAKE.x) / LAKE.rx, dz = (z - LAKE.z) / LAKE.rz;
  if (dx * dx + dz * dz > 1.6) return 0;
  const e = Math.hypot(dx, dz) * (1 + 0.07 * Math.sin(Math.atan2(dz, dx) * 3 + 1));   // a slightly wobbly oval
  return 1 - smooth(0.78, 1.08, e);
}
// 0 on dry land, rising over the sandy bank, 1 in open fresh water
export function wetness(x, z) { return x > -1.5 ? 0 : Math.max(riverWet(x, z), lakeWet(x, z)); }
export const carve = (x, z) => wetness(x, z) * RIVER.depth;   // how far the ground drops (m)
export const isWet = (x, z) => wetness(x, z) > 0.42;          // water: you can't walk here
export const onBank = (x, z) => wetness(x, z) > 0.02;         // bank or water: no tilling, decor, weeds or dig spots
export const bankSand = (x, z) => smooth(0.02, 0.3, wetness(x, z));   // 0..1 how sandy the ground color is
export const bankWet = (x, z) => smooth(0.3, 0.6, wetness(x, z));     // 0..1 wet sand under the water's edge

// Which place a cast counts as, from where the bobber lands (and where you stand, for the sea).
export function placeAt(lx, lz, px, pz, onDock) {
  if (lz > 8 && lakeWet(lx, lz) > 0.42) return 'lake';
  if (lz > -3.6 && riverWet(lx, lz) > 0.42) return 'river';
  return onDock && pz < -6.5 ? 'dock' : 'beach';   // the far half of the dock reaches the deep water
}
// Is there fresh water within a cast of (px, pz)? Returns where the bobber should land, or null.
function probe(px, pz, dx, dz) {
  for (let t = 0.5; t <= 4; t += 0.25) if (wetness(px + dx * t, pz + dz * t) > 0.9) return { x: px + dx * (t + 0.6), z: pz + dz * (t + 0.6), t };
  return null;
}
export function freshTarget(px, pz) {
  if (px > -0.5) return null;
  let best = null;
  if (pz > -3.0 && pz < RIVER.zEnd - 3) { const s = Math.sign(riverX(pz) - px) || -1, r = probe(px, pz, s, 0); if (r) best = r; }
  const lx = LAKE.x - px, lz = LAKE.z - pz, ld = Math.hypot(lx, lz);
  if (ld < 12 && ld > 0.01) { const r = probe(px, pz, lx / ld, lz / ld); if (r && (!best || r.t < best.t)) best = r; }
  return best;
}

// ---------- the bait rule ----------
const BUCKET = { x: 0.75, z: -3.05 };   // on the sand at the foot of the dock, left side (nothing stands in front of it)
let bucket = null, bucketEl = null, giftEl = null;

function bucketState() {
  const S = A.S, max = BAIT_HELP.bucketMax, step = BAIT_HELP.bucketMinutes * 60000, now = Date.now();
  if (!S.bucket) S.bucket = { n: max, at: now };   // new and old saves start with a full bucket
  const b = S.bucket, k = Math.floor((now - b.at) / step);
  if (b.n >= max) b.at = now;
  else if (k > 0) { b.n = Math.min(max, b.n + k); b.at = b.n >= max ? now : b.at + k * step; }
  return b;
}
export const bucketCount = () => bucketState().n;
export const bucketGroup = () => bucket;   // tackle.js swaps the stand-in worms for the worm model
export function takeBucket() {
  const b = bucketState(); if (b.n <= 0) return;
  const n = b.n; b.n = 0; b.at = Date.now();
  A.addItem('worm', n); A.audio.play('buy'); A.renderHotbar(); A.commit();
  A.toast(`+${n} worms from the bucket`);
}
export const giftReady = () => A.S.gift !== A.todayKey();
// Fishel's free pack, once a day: handed over when you talk to him. Returns true if he gave one.
export function claimGift() {
  if (!giftReady()) return false;
  A.S.gift = A.todayKey(); A.addItem('worm', BAIT_HELP.giftWorms); A.renderHotbar(); A.commit();
  return true;
}
// the pop-up button: Take at the bucket (called from pickUse)
export function action() {
  const P = A.player.pos;
  if (bucket && Math.hypot(P.x - BUCKET.x, P.z - BUCKET.z) < 1.2 && bucketCount() > 0) return { kind: 'take', key: 'bucket', go: takeBucket };
  return null;
}
export const noBaitWhy = () => giftReady()
  ? 'No bait! Fishel has a free pack for you today.'
  : bucketCount() > 0 ? 'No bait! Take worms from the bucket by the dock.' : 'No bait! The worm bucket fills up again soon. Fishel sells more.';

function buildBucket() {
  const g = new THREE.Group(), mat = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r, flatShading: true });
  const pail = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 10, 1, true), mat(0x8fb7d6)); pail.material.side = THREE.DoubleSide; pail.position.y = 0.15; g.add(pail);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 10), mat(0x7ba3c2)); base.position.y = 0.01; g.add(base);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.02, 10), mat(0x6b4a2c, 1)); soil.position.y = 0.26; g.add(soil);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 5, 14, Math.PI), mat(0x4a4458)); handle.position.y = 0.3; g.add(handle);
  for (const [x, z, r] of [[-0.05, 0.03, 0.4], [0.07, -0.04, 2.2]]) {   // two worms poking out
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.016, 5, 10, Math.PI), mat(0xf08aa0)); w.position.set(x, 0.265, z); w.rotation.y = r; w.userData.worm = true; g.add(w);
  }
  g.scale.setScalar(1.35); g.position.set(BUCKET.x, A.groundY(BUCKET.x, BUCKET.z), BUCKET.z);
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  A.scene.add(g); return g;
}
// the fresh water: one flat sheet under the land where the river and lake are dug out, same look as the sea
function buildFreshWater() {
  const geo = new THREE.PlaneGeometry(17, 31, 17, 31);
  geo.rotateX(-Math.PI / 2); geo.translate(-9.5, A.WATER_Y, 22);   // x -18..-1, z 6.5..37.5 (the sea's own sheet reaches z 7)
  const m = new THREE.Mesh(geo, A.waterMat); m.receiveShadow = true; A.scene.add(m);
}

export function init(api) {
  A = api; THREE = api.THREE;
  Object.assign(A.ICON, {
    dock: '<path d="M3 9h18"/><path d="M6 9v9M12 9v9M18 9v9"/><path d="M2 20c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0"/>',
    wave: '<path d="M2 10c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/><path d="M2 17c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/>',
    river: '<path d="M8 2c-4 5 6 7 2 11s4 6 1 9"/><path d="M15 2c-4 5 6 7 2 11s4 6 1 9"/>',
    pond: '<ellipse cx="12" cy="16" rx="9" ry="4.5"/><path d="M17 12V4M14 12V7"/>',
    gift: '<rect x="3" y="10" width="18" height="11" rx="1"/><path d="M3 14h18M12 10v11"/><path d="M12 10c-5 0-5-6-2-6s2 6 2 6z"/><path d="M12 10c5 0 5-6 2-6s-2 6-2 6z"/>',
  });
  buildFreshWater();
  bucket = buildBucket();
  // a few trees and bushes on the far bank by your home land, so it reads as a river and not the edge of the world
  for (const [n, x, z, sc] of [['tree_oak', -17.3, -1.2, 1.25], ['plant_bushLarge', -16.3, 0.9, 1.2], ['tree_default', -18.1, 2.4, 1.3], ['plant_bush', -16.4, 4.1, 1.2], ['tree_oak', -17.2, 5.6, 1.2]])
    A.place('nature', n, x, z, { s: sc, r: x * 7 + z });
  // the fence doesn't cross the river
  for (const f of A.townFence) if (onBank(f.position.x, 3)) f.visible = false;
  const st = document.createElement('style');
  st.textContent = `
.fxbub { position: fixed; z-index: 5; transform: translate(-50%, -100%); pointer-events: none; }
.fxbub .b { display: flex; align-items: center; gap: 3px; background: #fffdf5; border: 2.5px solid #2b2140; border-radius: 14px; padding: 2px 9px 2px 5px; white-space: nowrap; font-size: 20px; font-weight: 700; color: #2b2140; box-shadow: 0 3px 0 rgba(43,33,64,.2); }
.fxbub .b small { font-size: 13px; font-weight: 600; }
.fxbub .t { width: 0; height: 0; margin: 0 auto; border-left: 7px solid transparent; border-right: 7px solid transparent; border-top: 8px solid #2b2140; }
.fxbub.gift .b { background: #fff6d6; border-color: #e0a020; animation: sbbob 1.6s ease-in-out infinite; } .fxbub.gift .t { border-top-color: #e0a020; }
.fxbub.empty .b { background: #f1ede2; }`;
  document.head.appendChild(st);
  const mk = (cls) => { const d = document.createElement('div'); d.className = 'fxbub ' + cls; d.hidden = true; d.setAttribute('aria-hidden', 'true'); d.innerHTML = '<div class="b"></div><div class="t"></div>'; document.body.appendChild(d); return d; };
  bucketEl = mk('bucket'); giftEl = mk('gift');
  giftEl.firstChild.innerHTML = `${A.svg('gift', '#2b2140', 22)}${A.svg('worm', '#2b2140', 22)}&times;${BAIT_HELP.giftWorms}`;
}

function pin(el, x, y, z) {
  const v = A.project(x, y, z);
  if (v.z > 1) { el.hidden = true; return; }
  el.style.left = v.x + 'px'; el.style.top = v.y + 'px';
}
let shownN = -1;
// every frame: the two bubbles (the bucket's count; Fishel's gift)
export function frame() {
  if (!A || !bucket) return;
  const P = A.player.pos, quiet = A.busy();
  const dB = Math.hypot(P.x - BUCKET.x, P.z - BUCKET.z), n = bucketCount();
  const showB = !quiet && (dB < 7 || (!A.hasBait() && A.holdingRod() && dB < 16));
  bucketEl.hidden = !showB;
  if (showB) {
    if (n !== shownN) { shownN = n; bucketEl.firstChild.innerHTML = `${A.svg('worm', '#2b2140', 22)}${n}<small>/ ${BAIT_HELP.bucketMax}</small>`; bucketEl.classList.toggle('empty', n === 0); }
    pin(bucketEl, BUCKET.x, bucket.position.y + 0.85, BUCKET.z);
  }
  const f = A.fishelPos(), showG = !quiet && f && giftReady() && Math.hypot(P.x - f.x, P.z - f.z) < 14;
  giftEl.hidden = !showG;
  if (showG) pin(giftEl, f.x, 2.25, f.z);
}
// older saves: anything standing where the river or the lake now is goes back to the bag; plots there are dropped
export function sweepSave() {
  const S = A.S;
  S.plots = (S.plots || []).filter(p => !onBank(p.x + 0.5, p.z + 0.5));
  S.decor = (S.decor || []).filter(d => { if (!onBank(d.x + 0.5, d.z + 0.5)) return true; A.addItem('decor_' + d.id, 1); return false; });
  if (S.pos && isWet(S.pos[0], S.pos[1])) S.pos = null;
}
