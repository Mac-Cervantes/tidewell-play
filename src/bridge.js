// RANCH (try/ranch): the bridge over the big lake (Mac, Nov 25-27, Ranch Mockups board 14).
// The lake is two lots big (the thicket and the old woods) and joined to the river, so it cuts the path. "put a bridge
// down the middle to keep the path straight. Could be a task for the player with a outline like the fence".
// - Nell sells the bridge blueprint once you own both lake lots ("make the blueprint available when the bridge lot is
//   unlocked"): the bridge runs across both, and the back fence stops you half way until the far one is yours.
// - With the blueprint, a see-through green bridge shows on the path. Walk up, tap Build (40 wood) and it's built.
// - Until then you walk round the right end of the lake. Once built you can walk over it, and fish off it.
// The save is S.ranch.bridge = { bp, built } (pen.js owns S.ranch). main.js hooks are marked RANCH.
import { STORE } from './data.js';
import * as pen from './pen.js';

export const BRIDGE = { z0: 15.4, z1: 26.6, half: 1.5,   /* 3 m wide: room for your pet beside you (Mac, Nov 27: "a little wider so the dog can follow you"; it was 2 m) */ wood: 40, price: 1000, level: 5, lots: ['back2'],   /* the lake lot is one purchase now (Mac, Nov 28), so the blueprint shows as soon as you own it */ top: 0.14, arch: 0.1 };
let A = null, THREE = null, ready = false, model = null, ghost = null, shown = '', tag = null, secT = 0;
const st = () => { const s = pen.st(); if (!s.bridge) s.bridge = { bp: false, built: false }; return s.bridge; };
const lotsOwned = () => BRIDGE.lots.every(id => A.lotOwned(id));
export const built = () => !!A && !!A.S.ranch && !!A.S.ranch.bridge && A.S.ranch.bridge.built;

// ---------- walking on it (main.js: walkable and floorY) ----------
export const onDeck = (x, z, pad = 0) => built() && Math.abs(x) < BRIDGE.half + pad && z > BRIDGE.z0 - 0.2 && z < BRIDGE.z1 + 0.2;   // pad: a little extra each side (for where a bobber may land)
const archAt = (z) => BRIDGE.top + BRIDGE.arch * Math.sin(Math.PI * Math.min(1, Math.max(0, (z - BRIDGE.z0) / (BRIDGE.z1 - BRIDGE.z0))));
export const deckY = (x, z) => (onDeck(x, z) ? Math.max(A.groundY(x, z), archAt(z)) : null);

export function init(api) { A = api; THREE = api.THREE; }
export function start() {
  if (!A || ready) return;
  STORE.extra.items.bridgebp = { pic: () => `<img src="${picture()}" alt="">`, hidden: () => !lotsOwned() && !st().bp && !st().built,
    info: () => ({ name: 'Bridge blueprint', price: BRIDGE.price, level: BRIDGE.level, own: st().bp || st().built, once: true, blurb: `A bridge over your lake. Build it with ${BRIDGE.wood} wood` }),
    can: () => (lotsOwned() ? '' : 'Buy the lake lot first'),
    give: () => { st().bp = true; A.toast(`Bridge blueprint: bring ${BRIDGE.wood} wood to the lake. Look for driftwood on the beach!`); } };
  const css = document.createElement('style');
  css.textContent = `.brTag { position: fixed; z-index: 6; transform: translate(-50%, -100%); pointer-events: none; display: flex; align-items: center; gap: 5px; background: #fffdf5; border: 2px solid #2b2140; border-radius: 12px; padding: 4px 9px 4px 6px; box-shadow: 0 3px 0 rgba(43,33,64,.3); font: 700 16px/1 Fredoka, system-ui, sans-serif; color: #2b2140; white-space: nowrap; }
.brTag[hidden] { display: none; } body.in-store .brTag { display: none !important; }`;
  document.head.appendChild(css);
  tag = document.createElement('div'); tag.className = 'brTag'; tag.hidden = true; tag.setAttribute('aria-hidden', 'true'); document.body.appendChild(tag);
  ready = true; sync();
}

// ---------- the model: planks along the path with a low arch, posts and rails; the outline is the same shape in green ----------
function build(ghostly) {
  const g = new THREE.Group(), L = BRIDGE.z1 - BRIDGE.z0, W = BRIDGE.half * 2;
  const gm = ghostly ? new THREE.MeshBasicMaterial({ color: 0x7ee08a, transparent: true, opacity: 0.5, depthWrite: false }) : null;
  const wood = (c) => gm || new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true });
  const mats = [wood(0xb07a46), wood(0xa06a3a), wood(0x7a4e2a), wood(0x8a5a34)];
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); if (!ghostly) { o.castShadow = true; o.receiveShadow = true; } g.add(o); return o; };
  const n = Math.round(L / 0.34);
  for (let i = 0; i < n; i++) { const z = BRIDGE.z0 + (i + 0.5) * L / n; box(W, 0.08, 0.3, mats[i % 2], 0, archAt(z) - 0.04, z); }
  const posts = 6;
  for (const s of [-1, 1]) {
    for (let i = 0; i <= posts; i++) { const z = BRIDGE.z0 + i * L / posts; box(0.12, 1.5, 0.12, mats[2], s * (W / 2 - 0.06), archAt(z) - 0.2, z); }   // long posts: they stand in the water
    for (let i = 0; i < posts; i++) { const za = BRIDGE.z0 + i * L / posts, zb = za + L / posts, ya = archAt(za) + 0.5, yb = archAt(zb) + 0.5;
      const r = box(0.08, 0.08, Math.hypot(L / posts, yb - ya), mats[3], s * (W / 2 - 0.06), (ya + yb) / 2, (za + zb) / 2); r.rotation.x = -Math.atan2(yb - ya, L / posts); }
  }
  return g;
}
function sync() {
  const s = st(), want = s.built ? 'built' : s.bp && lotsOwned() ? 'ghost' : '';
  if (want === shown) return; shown = want;
  if (model) { A.scene.remove(model); model = null; } if (ghost) { A.scene.remove(ghost); ghost = null; }
  if (want === 'built') { model = build(false); A.scene.add(model); }
  if (want === 'ghost') { ghost = build(true); A.scene.add(ghost); }
}
const nearEnd = () => { const P = A.player.pos; return Math.min(Math.hypot(P.x, P.z - (BRIDGE.z0 - 0.6)), Math.hypot(P.x, P.z - (BRIDGE.z1 + 0.6))); };
function doBuild() {
  const have = A.invCount('wood');
  if (have < BRIDGE.wood) { A.toast(`The bridge needs ${BRIDGE.wood} wood. You have ${have}`); return; }
  A.addItem('wood', -BRIDGE.wood); const s = st(); s.built = true; s.bp = false;
  A.audio.play('levelUp'); A.addXP(40); A.renderHotbar(); A.commit(); sync();
  A.toast('The bridge is built! The path goes straight over the lake');
}
export function pickUse() {
  if (!ready || shown !== 'ghost' || A.busy() || nearEnd() > 2.2) return null;
  return { kind: 'collect', key: 'bridge', icon: 'wood', label: 'Build', go: doBuild };
}
const _v = { p: null };
export function frame(dt, el) {
  if (!ready) return;
  secT -= dt; if (secT <= 0) { secT = 0.5; sync(); }
  if (ghost) ghost.children[0].material.opacity = 0.42 + Math.sin(el * 3) * 0.12;
  const P = A.player.pos, show = shown === 'ghost' && !A.busy() && Math.abs(P.x) < 9 && P.z > BRIDGE.z0 - 9 && P.z < BRIDGE.z1 + 9;
  tag.hidden = !show; if (!show) return;
  const html = `${A.svg('wood', '#2b2140', 18, 2.4)} ${Math.min(A.invCount('wood'), BRIDGE.wood)}/${BRIDGE.wood}`;
  if (tag._h !== html) { tag._h = html; tag.innerHTML = html; }
  if (!_v.p) _v.p = new THREE.Vector3();
  const z = P.z > (BRIDGE.z0 + BRIDGE.z1) / 2 ? BRIDGE.z1 - 1.5 : BRIDGE.z0 + 1.5;
  _v.p.set(0, 1.6, z).project(A.camera);
  tag.style.left = ((_v.p.x * 0.5 + 0.5) * innerWidth) + 'px'; tag.style.top = ((-_v.p.y * 0.5 + 0.5) * innerHeight) + 'px'; tag.style.visibility = _v.p.z < 1 ? 'visible' : 'hidden';
}
let pic = null;
function picture() {
  if (pic) return pic;
  const c = document.createElement('canvas'); c.width = c.height = 128; const k = c.getContext('2d'); k.lineJoin = k.lineCap = 'round';
  k.strokeStyle = '#2b2140'; k.lineWidth = 6; k.fillStyle = '#4a8fd6'; k.beginPath(); k.roundRect(14, 20, 100, 88, 10); k.fill(); k.stroke();
  k.strokeStyle = '#ffffff'; k.lineWidth = 4; k.beginPath(); k.moveTo(28, 78); k.quadraticCurveTo(64, 44, 100, 78); k.stroke(); k.beginPath(); k.moveTo(28, 62); k.quadraticCurveTo(64, 28, 100, 62); k.stroke();
  for (const x of [34, 49, 64, 79, 94]) { k.beginPath(); k.moveTo(x, 40 + Math.abs(x - 64) * 0.5); k.lineTo(x, 90); k.stroke(); }
  return (pic = c.toDataURL());
}
export const debug = () => ({ ready, shown, ...st(), lots: lotsOwned() });
export { doBuild };
