// RANCH (try/ranch): the cow pen, wood and milk (Mac, Nov 25-26, Ranch Mockups boards 5-14).
// - Nell sells three things for the ranch (her Animals tab): the pen blueprint (town level 6), the milk can (after the
//   blueprint) and calves. "Nell only sells blueprints", "Nell only sells baby animals", "Buying from Nell after buying the blueprint".
// - The blueprint builds a pen just big enough for one cow: 2 x 2 squares with a gate at the front and a short roof over
//   the back ("Just the blueprint is available and enough for one cow"). 4 squares hold a cow.
// - Everything else is gathered: make the pen bigger a square at a time for 2 wood each ("everything else is gathered",
//   "Wood from trees driftwood", picks 5 A fence by fence, 10c B 2 wood). Wood comes from sawing trees, logs and stumps on
//   your lots, and from driftwood that washes up on the beach (3 pieces a day).
// - Milk: each grown cow has milk every 2 hours (90 coins), on the real clock, also while you're away. You milk each cow
//   yourself by tapping the milk bubble over her (pick 9 C) until you buy the milk can; then the can at the gate collects
//   it all for you ("Milk is gathered by selecting individual cows then the can become available to auto collect").
// - Calves grow into cows after a day ("calves grow after a day for now").
// Cows themselves (wild ones you lead home, how they move, the milk bubbles) live in ranch.js. This file keeps the save
// (S.ranch), draws the pen, the can and the driftwood, and has the pen card and the "make it bigger" mode.
// Other files carry small hooks marked "RANCH": main.js (init, start, frame, block, tap, pickUse, cell checks, wood from
// clearing, the bag) and ranch.js.
import { ITEMS, STORE, ORDERS } from './data.js';

export const RANCH = {
  level: 6,              // town level where Nell starts selling the ranch
  blueprint: 1500,       // the pen blueprint (middle prices, pick 4b B)
  can: 1000,             // the milk can (pick 11 B)
  calf: 300,             // a calf from Nell
  perCow: 4,             // squares a cow needs ("4 tiles a cow")
  maxCows: 12,           // the biggest herd a pen holds (ranch.js keeps this many cow models ready)
  woodPerSquare: 2,      // wood for each square you add (pick 10c B: 2 wood a fence piece)
  milkHours: 2,          // a cow has milk every 2 hours (pick 3b B)
  growHours: 24,         // a calf grows up in a day
  canPerCow: 3,          // the can holds up to 3 milk a cow, then waits for you
  driftPerDay: 3,        // driftwood pieces on the beach each day
  wood: { tree: 2, log: 1, stump_round: 1 },   // wood from sawing / digging these on your lots ('tree' = any kind of tree)
  milk: { name: 'Milk', price: 90 },
};
const NAMES = ['Daisy', 'Clover', 'Buttercup', 'Rosie', 'Maple', 'Hazel', 'Poppy', 'Biscuit', 'Honey', 'Pearl', 'Willow', 'Mocha', 'Pumpkin', 'Sunny', 'Marigold', 'Peaches'];

let A = null, THREE = null, ready = false;
let penG = null, ghostG = null, canG = null, driftG = null, tilesG = null, sig = '', driftSig = '';
let build = null, card = null, ray = null, ui = null, secT = 0;
const H = 3600e3;
const fresh = () => ({ v: 1, bp: false, pen: null, can: false, canMilk: 0, cows: [], wild: {}, gone: [], drift: null, next: 1 });
export const st = () => { const S = A.S; if (!S.ranch || S.ranch.v !== 1) S.ranch = fresh(); return S.ranch; };
const key = (x, z) => x + ',' + z;
const unkey = (k) => k.split(',').map(Number);
// the pen's squares as a Set, rebuilt only when they change (solid() runs many times a frame)
let setFor = null, setLen = -1, setC = new Set();
const cellsSet = () => { const p = st().pen, c = p ? p.cells : null; if (c !== setFor || (c ? c.length : 0) !== setLen) { setFor = c; setLen = c ? c.length : 0; setC = new Set(c || []); } return setC; };
// debug + "Crops in 15 s": milk every 30 s and calves grow in 2 minutes, for testing
export const clock = () => (A.settings.debug && A.settings.fastCrops ? { milk: 30e3, grow: 120e3 } : { milk: RANCH.milkHours * H, grow: RANCH.growHours * H });

// ---------- registered when this file loads, so a save with milk or wood opens cleanly ----------
ITEMS.milk = { name: RANCH.milk.name, kind: 'crop', rarity: 'common', price: RANCH.milk.price };   // 'crop' like eggs: Higgins, orders and the ship take it
ITEMS.wood = { name: 'Wood', kind: 'wood', rarity: 'common', price: 0 };                              // for the pen (and the bridge, later); not for selling

export function init(api) {
  A = api; THREE = api.THREE;
  A.cropIcon.milk = drawPic(64, k => milkBottle(k, 32, 34, 1));
  Object.assign(A.ICON, {
    wood: '<path d="M4 15l11-9a2.5 2.5 0 0 1 3.5 3.5L9.5 20.5A2.5 2.5 0 0 1 6 17z"/><circle cx="17" cy="7.5" r="1"/><path d="M3 9l5-4"/>',
    pen: '<path d="M3 9h18M3 15h18"/><path d="M5 6v13M10 6v13M14 6v13M19 6v13"/>',
    milk: '<path d="M9 3h6M10 3v3l-3 4v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V10l-3-4V3"/><path d="M7 13h10"/>',
    cow: '<path d="M6 8c-2-1-3-3-2-4 2 0 3 1 4 2M18 8c2-1 3-3 2-4-2 0-3 1-4 2"/><rect x="6" y="6" width="12" height="13" rx="4"/><path d="M8 15h8"/><circle cx="10" cy="11" r=".6"/><circle cx="14" cy="11" r=".6"/>',
  });
  STORE.extra = STORE.extra || { label: 'Animals', items: {} };
}
// Nell's ranch items go into her Animals tab (animals.js makes the tab; this runs after it loads)
function addShopItems() {
  const items = STORE.extra.items, lvl = RANCH.level, S = () => st();
  const pic = (fn) => () => `<img src="${fn()}" alt="">`;
  items.penbp = { pic: pic(blueprintPicture),
    info: () => ({ name: 'Cow pen blueprint', price: RANCH.blueprint, level: lvl, own: S().bp || !!S().pen, once: true, blurb: 'A pen for 1 cow. Make it bigger with wood' }),
    can: () => '', give: () => { S().bp = true; sig = ''; A.toast('Cow pen blueprint: find a grassy spot and tap Place pen. Look for driftwood on the beach!'); } };
  items.milkcan = { pic: pic(canPicture),
    info: () => ({ name: 'Milk can', price: RANCH.can, level: lvl, own: S().can, once: true, blurb: S().bp || S().pen ? 'Collects milk from every cow for you' : 'After the cow pen blueprint' }),
    can: () => (!S().bp && !S().pen ? 'Buy the cow pen blueprint first' : ''),
    give: () => { S().can = true; for (const c of S().cows) if (!c.baby) c.milkAt = Math.min(c.milkAt, Date.now()); sig = ''; A.toast(S().pen ? 'The milk can is at your pen’s gate' : 'The milk can goes at your pen’s gate'); } };
  items.calf = { pic: pic(calfPicture),
    info: () => ({ name: 'Calf', price: RANCH.calf, level: lvl, own: false, once: false, have: 0, blurb: S().pen ? `${S().cows.length} of ${holds()} in your pen` : 'Needs a cow pen' }),
    can: (q) => (!S().pen ? (S().bp ? 'Place your cow pen first' : 'Buy the cow pen blueprint first') : q > room() ? (room() > 0 ? `Your pen has room for ${room()} more` : 'Your pen is full: make it bigger with wood') : ''),
    give: (q) => { for (let i = 0; i < q; i++) addCow(true); A.toast(q > 1 ? `+${q} calves: they’re in your pen` : 'Your calf is in the pen. She grows up in a day'); } };
}

export function start() {
  if (!A || ready) return;
  addShopItems();
  buildUI();
  ready = true;
  sync(true);
}

// ---------- the pen's shape ----------
export const holds = () => (st().pen ? Math.min(RANCH.maxCows, Math.floor(st().pen.cells.length / RANCH.perCow)) : 0);
export const room = () => holds() - st().cows.length;
export const hasPen = () => !!st().pen;
// a point inside the pen (with a margin m in from the fences), for the cows
export function inside(x, z, m = 0) {
  const p = st().pen; if (!p) return false; const s = cellsSet();
  for (const [dx, dz] of [[-m, -m], [m, -m], [-m, m], [m, m], [0, 0]]) if (!s.has(key(Math.floor(x + dx), Math.floor(z + dz)))) return false;
  return true;
}
// a point on the pen or its fence (for the player, pets and wild animals)
export function solid(x, z) {
  if (!A) return false;
  const p = st().pen; if (!p) return canHit(x, z); const s = cellsSet(), m = 0.18;
  for (const [dx, dz] of [[-m, -m], [m, -m], [-m, m], [m, m]]) if (s.has(key(Math.floor(x + dx), Math.floor(z + dz)))) return true;
  return canHit(x, z);
}
const canHit = (x, z) => { const c = canAt(); return !!c && Math.hypot(x - c.x, z - c.z) < 0.34; };
// a grid square taken by the pen (no crops, decor or weeds there)
export function taken(cx, cz) { if (!A) return false; return !!st().pen && cellsSet().has(key(cx, cz)); }
// the gate: on the front (camera) side of a square; you lead cows in here
export function gate() {
  const p = st().pen; if (!p) return null; const [gx, gz] = unkey(p.gate);
  return { x: gx + 0.5, z: gz + 1, out: { x: gx + 0.5, z: gz + 1.75 }, in: { x: gx + 0.5, z: gz + 0.5 } };
}
// the milk can stands outside, beside the gate: on its right, or its left if the pen has a square there,
// or right in front of the gate when both sides are taken
function canAt() {
  const g = gate(); if (!g || !st().can) return null;
  const s = cellsSet(), cz = Math.floor(g.z + 0.38);
  for (const dx of [0.85, -0.85]) if (!s.has(key(Math.floor(g.x + dx), cz))) return { x: g.x + dx, z: g.z + 0.38 };
  return { x: g.x + 0.3, z: g.z + 0.34 };
}
export const penVersion = () => sig;

// ---------- cows in the save (ranch.js shows and moves them) ----------
export function addCow(baby, name) {
  const s = st(), now = Date.now();
  const c = { id: s.next++, name: name || nextName(), baby: !!baby, born: now, milkAt: now - clock().milk };   // a new cow has milk ready (a nice hello)
  s.cows.push(c); A.commit(); return c;
}
function nextName() { const used = new Set(st().cows.map(c => c.name)); return NAMES.find(n => !used.has(n)) || 'Cow ' + st().next; }
// calves grow up; with the can, milk goes in it on its own
export function advance(now = Date.now()) {
  const s = st(), k = clock(); let changed = false;
  for (const c of s.cows) {
    if (c.baby && now - c.born >= k.grow) { c.baby = false; c.milkAt = now - k.milk; changed = true; A.toast(`${c.name} is all grown up!`); }
    if (!c.baby && s.can && s.pen) { const cap = RANCH.canPerCow * s.cows.filter(o => !o.baby).length;
      while (now - c.milkAt >= k.milk && s.canMilk < cap) { s.canMilk++; c.milkAt += k.milk; changed = true; }
      if (s.canMilk >= cap && now - c.milkAt > k.milk) c.milkAt = now - k.milk; }
  }
  if (changed) A.commit();
  return changed;
}
export const milkReady = (c) => !c.baby && !st().can && Date.now() - c.milkAt >= clock().milk;
export function milkCow(c) {
  if (!milkReady(c)) return false;
  c.milkAt = Date.now(); A.addItem('milk', 1); A.addXP(3); A.audio.play('harvest'); A.renderHotbar(); A.commit(); return true;
}
function collectCan() {
  const s = st(), n = s.canMilk; if (!n) return;
  s.canMilk = 0; A.addItem('milk', n); A.addXP(3 * n); A.audio.play('harvest'); A.renderHotbar(); A.commit();
  A.toast(`+${n} milk`); drawTags(); if (card) paintCard();
}

// ---------- keep the models in step with the save ----------
function sync(force) {
  const s = st(), p = s.pen;
  // the order board asks for milk once you keep a grown cow, like eggs (Mac, Nov 27)
  { const at = ORDERS.wants.findIndex(w => w.item === 'milk'), keeps = (s.cows || []).some(c => !c.baby);
    if (keeps && at < 0) ORDERS.wants.push({ item: 'milk', n: [1, 3] }); else if (!keeps && at >= 0) ORDERS.wants.splice(at, 1); }
  const now = [p ? p.cells.join(';') + '|' + p.gate + '|' + p.shed : '-', s.can ? 1 : 0].join('#');
  if (now !== sig || force) { sig = now; drawPen(); if (build) drawTiles(); }
}
const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true });
let M = null;
function mats() { if (!M) M = { post: mat(0x8a6a4a), rail: mat(0xb98a5a), gate: mat(0xd9a066), roof: mat(0xd9a873), hay: mat(0xe9c85a), hay2: mat(0xd9b245), can: mat(0xc9d3da), lid: mat(0x9aa7b0), drift: mat(0xb8a58c), driftEnd: mat(0x8f7d66),
  ghost: new THREE.MeshBasicMaterial({ color: 0x7ee08a, transparent: true, opacity: 0.5, depthWrite: false }), tile: new THREE.MeshBasicMaterial({ color: 0x5fe06e, transparent: true, opacity: 0.7, depthWrite: false }), edge: new THREE.LineBasicMaterial({ color: 0x1f7a2c }), bad: new THREE.MeshBasicMaterial({ color: 0xff7a6b, transparent: true, opacity: 0.5, depthWrite: false }) }; return M; }
function boxAt(g, w, h, d, m, x, y, z) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = !m.transparent; o.receiveShadow = !m.transparent; g.add(o); return o; }
// fences on every square side with no pen square next to it; the gate on its side; the shelter over the back two squares
function fenceModel(cells, gateKey, shedKey, ghostMat) {
  const g = new THREE.Group(), m = mats(), s = new Set(cells), posts = new Set(), y = (x, z) => A.groundY(x, z);
  const post = (x, z) => { const k = x + ',' + z; if (posts.has(k)) return; posts.add(k); boxAt(g, 0.14, 0.82, 0.14, ghostMat || m.post, x, y(x, z) + 0.39, z); };
  for (const c of cells) {
    const [cx, cz] = unkey(c);
    for (const [dx, dz, ax, az, bx, bz] of [[0, -1, 0, 0, 1, 0], [0, 1, 0, 1, 1, 1], [-1, 0, 0, 0, 0, 1], [1, 0, 1, 0, 1, 1]]) {
      if (s.has(key(cx + dx, cz + dz))) continue;
      const x0 = cx + ax, z0 = cz + az, x1 = cx + bx, z1 = cz + bz, horiz = z0 === z1, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, gy = y(mx, mz);
      post(x0, z0); post(x1, z1);
      const isGate = !ghostMat && c === gateKey && dz === 1;
      for (const h of (isGate ? [0.22, 0.46, 0.68] : [0.32, 0.62])) boxAt(g, horiz ? 1 : 0.07, 0.08, horiz ? 0.07 : 1, ghostMat || (isGate ? m.gate : m.rail), mx, gy + h, mz);
      if (isGate) { const d = boxAt(g, 1.04, 0.07, 0.06, m.gate, mx, gy + 0.45, mz); d.rotation.z = 0.42; }
    }
  }
  if (shedKey) {   // the short roof over the back (pick 6 B), with its back boards and two hay bales
    const [sx, sz] = unkey(shedKey), x = sx + 1, z = sz, gy = y(x, z + 0.5), w = 2, roofD = 0.85;
    for (const px of [sx + 0.07, sx + 1.93]) boxAt(g, 0.14, 1.45, 0.14, ghostMat || m.post, px, gy + 0.72, z + 0.07);
    boxAt(g, w, 0.8, 0.08, ghostMat || m.rail, x, gy + 0.9, z + 0.05);
    const r = boxAt(g, w + 0.3, 0.09, roofD, ghostMat || m.roof, x, gy + 1.5, z + roofD / 2 - 0.1); r.rotation.x = 0.1;
    if (!ghostMat) { boxAt(g, 0.62, 0.42, 0.46, m.hay, sx + 0.45, gy + 0.21, z + 0.32); const b = boxAt(g, 0.55, 0.38, 0.42, m.hay2, sx + 1.15, gy + 0.19, z + 0.3); b.rotation.y = 0.25; }
  }
  return g;
}
function canModel() {
  const g = new THREE.Group(), m = mats(), c = (r1, r2, h, mm, yy) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 12), mm); o.position.y = yy; o.castShadow = true; g.add(o); return o; };
  c(0.2, 0.22, 0.5, m.can, 0.25); c(0.13, 0.19, 0.14, m.can, 0.57); c(0.14, 0.14, 0.06, m.lid, 0.67); c(0.06, 0.06, 0.05, m.lid, 0.72);
  for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 5, 10, Math.PI), m.lid); h.position.set(s * 0.21, 0.42, 0); h.rotation.y = Math.PI / 2; g.add(h); }
  return g;
}
function drawPen() {
  const s = st(), p = s.pen;
  if (penG) { A.scene.remove(penG); penG = null; }
  if (canG) { A.scene.remove(canG); canG = null; }
  if (p) { penG = fenceModel(p.cells, p.gate, p.shed); A.scene.add(penG);
    const c = canAt(); if (c) { canG = canModel(); canG.position.set(c.x, A.groundY(c.x, c.z), c.z); canG.rotation.y = 0.4; A.scene.add(canG); } }
  drawTags();
}

// ---------- placing the blueprint: a see-through pen in front of you; tap Place pen ----------
let place = null;
function placeSpot() {
  const P = A.player.pos, f = { x: Math.sin(A.player.yaw), z: Math.cos(A.player.yaw) };
  const cx = Math.round(P.x + f.x * 2.2 - 1), cz = Math.round(P.z + f.z * 2.2 - 1);
  const cells = [key(cx, cz), key(cx + 1, cz), key(cx, cz + 1), key(cx + 1, cz + 1)];
  const near = Math.min(...cells.map(k => { const [x, z] = unkey(k); return Math.hypot(x + 0.5 - P.x, z + 0.5 - P.z); }));
  const okAll = cells.every(k => { const [x, z] = unkey(k); return A.cellOK(x, z); }) && near > 0.7;
  return { cx, cz, cells, ok: okAll };
}
function tickPlace() {
  const s = st(), want = s.bp && !s.pen && !A.busy() && !build && A.player.pos.z > -1 && A.player.pos.z < A.fenceZ() - 1;
  if (!want) { if (ghostG) { A.scene.remove(ghostG); ghostG = null; } place = null; return; }
  const sp = placeSpot(), k = sp.cells.join(';') + sp.ok;
  if (!place || place.k !== k) {
    if (ghostG) A.scene.remove(ghostG);
    ghostG = fenceModel(sp.cells, null, key(sp.cx, sp.cz), sp.ok ? mats().ghost : mats().bad); A.scene.add(ghostG);
    place = { ...sp, k };
  }
}
function placePen() {
  const sp = place; if (!sp) return;
  if (!sp.ok) { A.toast('Find a clear grassy spot, off the path and crops'); return; }
  const s = st(); s.pen = { cells: sp.cells, gate: key(sp.cx, sp.cz + 1), shed: key(sp.cx, sp.cz) }; s.bp = false;
  if (ghostG) { A.scene.remove(ghostG); ghostG = null; } place = null;
  A.audio.play('buy'); A.commit(); sync();
  A.toast('Your cow pen! Pet a wild cow 5 times and she’ll follow you home');
}

// ---------- make the pen bigger: green squares round it, 2 wood each ----------
function growable() {
  const s = st(), p = s.pen; if (!p) return [];
  const set = new Set(p.cells), [sx, sz] = unkey(p.shed), out = new Set();
  for (const c of p.cells) { const [x, z] = unkey(c);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz, k = key(nx, nz);
      if (set.has(k) || out.has(k)) continue;
      if (nz === sz - 1 && (nx === sx || nx === sx + 1)) continue;   // not behind the shelter's back boards
      if (A.cellOK(nx, nz)) out.add(k); } }
  return [...out];
}
export function startBuild() {
  if (!st().pen) return;
  closeCard(); build = { tiles: [] }; ui.bar.hidden = false; drawTiles(); paintBar();
}
function endBuild() { build = null; ui.bar.hidden = true; if (tilesG) { A.scene.remove(tilesG); tilesG = null; } }
function drawTiles() {
  if (tilesG) A.scene.remove(tilesG);
  tilesG = new THREE.Group(); build.tiles = [];
  const m = mats(), geo = new THREE.PlaneGeometry(0.86, 0.86);
  const edge = new THREE.EdgesGeometry(geo);
  for (const k of growable()) { const [x, z] = unkey(k), o = new THREE.Mesh(geo, m.tile); o.rotation.x = -Math.PI / 2; o.position.set(x + 0.5, A.groundY(x + 0.5, z + 0.5) + 0.05, z + 0.5); o.userData.cell = k; o.renderOrder = 3;
    o.add(new THREE.LineSegments(edge, m.edge)); tilesG.add(o); build.tiles.push(o); }
  A.scene.add(tilesG);
}
function paintBar() {
  const w = A.invCount('wood');
  ui.bar.querySelector('.t').innerHTML = `<b>Tap a green square</b><small>${A.svg('wood', '#2b2140', 15, 2.4)} ${RANCH.woodPerSquare} wood each · you have ${w}</small>`;
}
function addSquare(k) {
  const s = st(), p = s.pen, [kx, kz] = unkey(k), P = A.player.pos;
  if (p.cells.includes(k)) return;
  if (P.x > kx - 0.25 && P.x < kx + 1.25 && P.z > kz - 0.25 && P.z < kz + 1.25) { A.toast('Step off that square first'); return; }   // or you'd be fenced in
  if (A.invCount('wood') < RANCH.woodPerSquare) { A.toast('You need 2 wood. Saw trees in your lots, or find driftwood on the beach'); return; }
  A.addItem('wood', -RANCH.woodPerSquare); p.cells.push(k);
  // the gate stays on the front: if a square went in front of it, it moves out to the new front
  let [gx, gz] = unkey(p.gate); while (p.cells.includes(key(gx, gz + 1))) gz++; p.gate = key(gx, gz);
  A.audio.play('chop'); A.renderHotbar(); A.commit(); sync(); paintBar();
  const n = p.cells.length, h = holds();
  if (n >= RANCH.maxCows * RANCH.perCow) { if (n === RANCH.maxCows * RANCH.perCow) A.toast(`Your pen holds ${h} cows: that\u2019s as many as it can`); }
  else if (n % RANCH.perCow === 0) A.toast(`Your pen holds ${h} cow${h > 1 ? 's' : ''} now`);
  else A.toast(`${RANCH.perCow - (n % RANCH.perCow)} more square${RANCH.perCow - (n % RANCH.perCow) > 1 ? 's' : ''} for room for another cow`);
}

// ---------- driftwood: 3 pieces wash up on the beach each day ----------
// It starts when you buy the blueprint that needs wood, and its sparkle (the hint) stops once you've picked a piece up
// (Mac, Nov 27: "Start it when they buy a blueprint and it's their necessary resource then turn it off when they first pick it up").
const driftOn = () => { const s = st(); return s.bp || !!s.pen || !!(s.bridge && (s.bridge.bp || s.bridge.built)); };   // the pen's blueprint or the bridge's
const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
function tideDrift() {
  const s = st(), d = today();
  if (!driftOn() || (s.drift && s.drift.day === d)) return;
  const at = [];
  for (let t = 0; t < 200 && at.length < RANCH.driftPerDay; t++) {
    // the open sand by the water: right of Higgins's stall, or the strip left of the path (not behind the buildings and trees)
    const x = Math.random() < 0.8 ? 5.8 + Math.random() * 7.2 : -4.2 + Math.random() * 1.5, z = -3.2 + Math.random() * 0.65;
    if (!A.walkable(x, z) || A.solid(x, z) || at.some(([ax, az]) => Math.hypot(ax - x, az - z) < 2.2)) continue;
    at.push([+x.toFixed(2), +z.toFixed(2), +(Math.random() * 3.1).toFixed(2)]);
  }
  s.drift = { day: d, at }; A.commit();
}
let sparkTex = null;
function drawDrift() {
  const s = st(), on = driftOn() && s.drift, k = on ? s.drift.at.map(a => a.join(',')).join(';') + (s.driftSeen ? '' : '*') : '';
  if (k === driftSig) return; driftSig = k;
  if (driftG) A.scene.remove(driftG);
  driftG = new THREE.Group(); const m = mats();
  if (!sparkTex) sparkTex = new THREE.CanvasTexture(drawCanvas(96, k2 => { k2.fillStyle = '#fff6b0'; k2.lineWidth = 4; const star = (cx, cy, r) => { k2.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.35 : r; k2.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } k2.closePath(); k2.fill(); k2.stroke(); }; star(40, 50, 30); star(76, 22, 14); }));
  for (const [x, z, r] of (on ? s.drift.at : [])) {
    const g = new THREE.Group(), y = A.groundY(x, z);
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 1.0, 7), m.drift); log.rotation.z = Math.PI / 2 + 0.08; log.position.y = 0.1; log.castShadow = true; g.add(log);
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.45, 6), m.drift); br.rotation.z = Math.PI / 2; br.rotation.y = -0.7; br.position.set(0.32, 0.12, 0.14); g.add(br);
    if (s.driftSeen) { g.position.set(x, y, z); g.rotation.y = r; driftG.add(g); continue; }   // you know what driftwood is now: no sparkle
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthTest: false })); sp.scale.setScalar(0.36); sp.position.y = 0.55; sp.renderOrder = 8; sp.userData.spark = true; g.add(sp);
    g.position.set(x, y, z); g.rotation.y = r; driftG.add(g);
  }
  A.scene.add(driftG);
}
function pickDrift(i) {
  const s = st(); if (!s.drift || !s.drift.at[i]) return;
  s.drift.at.splice(i, 1); s.driftSeen = true; A.addItem('wood', 1); A.audio.play('plant'); A.renderHotbar(); A.commit(); drawDrift();
  A.toast(`+1 wood (${A.invCount('wood')})`);
}
// wood from sawing and digging on your lots (main.js calls this when something is cleared)
export function cleared(kind) {
  const n = RANCH.wood[kind] || (/^tree/.test(kind || '') ? RANCH.wood.tree : 0); if (!n) return;
  A.addItem('wood', n); A.renderHotbar(); A.commit(); A.toast(`+${n} wood (${A.invCount('wood')})`);
}

// ---------- every frame ----------
export function frame(dt, el) {
  if (!ready) return;
  secT -= dt;
  if (secT <= 0) { secT = 1; tideDrift(); drawDrift(); advance(); sync(); drawTags(); if (card) paintCard(); if (build) paintBar(); }
  tickPlace();
  if (build) { const g = gate(); if (!g || Math.hypot(A.player.pos.x - g.x, A.player.pos.z - g.z) > 12 || A.busy()) endBuild(); }   // walked off, or opened something else
  if (driftG) driftG.children.forEach((g, i) => { const sp = g.children.find(o => o.userData.spark); if (sp) { sp.position.y = 0.5 + Math.sin(el * 2.2 + i) * 0.06; sp.material.opacity = 0.65 + Math.sin(el * 3.1 + i * 2) * 0.35; } });
  if (build && tilesG) mats().tile.opacity = 0.6 + Math.sin(el * 4) * 0.15;
  placeTags();
}

// ---------- the player can't walk through the pen or the can ----------
export function block(np, pos) {
  if (!ready || !st().pen) return;
  if (!solid(np.x, np.z) || solid(pos.x, pos.z)) return;
  if (!solid(np.x, pos.z)) { np.z = pos.z; return; }
  if (!solid(pos.x, np.z)) { np.x = pos.x; return; }
  np.x = pos.x; np.z = pos.z;
}

// ---------- the action button ----------
// driftwood at your feet comes before anything else nearby (a piece can wash up beside the order board or a stall)
export function driftUse() {
  if (!ready || A.busy() || build) return null;
  const P = A.player.pos, s = st();
  if (s.drift && driftOn()) for (let i = 0; i < s.drift.at.length; i++) { const [x, z] = s.drift.at[i]; if (Math.hypot(P.x - x, P.z - z) < 1.15) return { kind: 'collect', key: 'drift' + i, icon: 'wood', label: 'Pick up', go: () => pickDrift(i) }; }
  return null;
}
export function pickUse() {
  if (!ready || A.busy() || build) return null;
  const P = A.player.pos, s = st();
  if (place) return { kind: 'collect', key: 'placepen', icon: 'pen', label: 'Place pen', go: placePen };
  const c = canAt(); if (c && s.canMilk > 0 && Math.hypot(P.x - c.x, P.z - c.z) < 1.4) return { kind: 'collect', key: 'can', icon: 'milk', label: `Collect ${s.canMilk}`, go: collectCan };
  if (s.pen && nearPen(1.1) && !s.cows.some(milkReady)) return { kind: 'collect', key: 'pencard', icon: 'pen', label: 'Pen', go: openCard };
  return null;
}
function nearPen(d) { const P = A.player.pos; for (const k of st().pen.cells) { const [x, z] = unkey(k); if (P.x > x - d && P.x < x + 1 + d && P.z > z - d && P.z < z + 1 + d) return true; } return false; }

// ---------- taps: the green squares while building, the can, the pen (opens its card) ----------
export function tap(x, y) {
  if (!ready) return false;
  if (!ray) ray = { r: new THREE.Raycaster(), n: new THREE.Vector2(), b: new THREE.Box3() };
  ray.n.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.r.setFromCamera(ray.n, A.camera);
  if (build) {
    const hit = ray.r.intersectObjects(build.tiles, false)[0];
    if (hit) addSquare(hit.object.userData.cell);
    return true;   // while building, taps are for the squares only
  }
  if (A.busy() || card || !st().pen) return false;
  const c = canAt();
  if (c) { ray.b.min.set(c.x - 0.3, A.groundY(c.x, c.z), c.z - 0.3); ray.b.max.set(c.x + 0.3, A.groundY(c.x, c.z) + 0.8, c.z + 0.3); if (ray.r.ray.intersectsBox(ray.b)) { if (st().canMilk) collectCan(); else openCard(); return true; } }
  if (penG) { const hit = ray.r.intersectObject(penG, true)[0]; if (hit) { openCard(); return true; } }
  return false;
}
export const building = () => !!build;

// ---------- the pen card (board 8: cows with names, the milk can, make it bigger) ----------
function openCard() {
  if (card) closeCard();
  const el = document.createElement('div'); el.id = 'penCard'; document.body.appendChild(el); card = { el, html: '' };
  for (const ev of ['pointerdown', 'pointerup', 'pointermove', 'touchstart']) el.addEventListener(ev, e => e.stopPropagation());
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-x]')) { closeCard(); return; }
    if (e.target.closest('[data-grow]')) { startBuild(); return; }
    if (e.target.closest('[data-can]')) collectCan();
  });
  A.audio.play('popOpen'); paintCard();
}
function closeCard() { if (card) { card.el.remove(); card = null; A.audio.play('popClose'); } }
const span = (ms) => (ms < 90e3 ? Math.max(1, Math.round(ms / 1000)) + 's' : ms < 5400e3 ? Math.round(ms / 60e3) + ' min' : Math.round(ms / 3600e3) + ' h');
function paintCard() {
  const s = st(), p = s.pen; if (!p) { closeCard(); return; }
  const k = clock(), now = Date.now(), h = holds(), n = s.cows.length, sq = p.cells.length, toNext = RANCH.perCow - (sq % RANCH.perCow);
  const chips = s.cows.map(c => `<span class="cw"><img src="${c.baby ? calfPicture() : cowPicture()}" width="34" height="34" alt=""><b>${c.name}</b><small>${c.baby ? 'grows in ' + span(Math.max(0, k.grow - (now - c.born))) : !s.can && milkReady(c) ? 'milk ready' : s.can ? '' : 'milk in ' + span(Math.max(0, k.milk - (now - c.milkAt)))}</small></span>`).join('')
    + Array.from({ length: Math.max(0, h - n) }, () => '<span class="cw free" aria-label="free place"></span>').join('');
  const grown = s.cows.filter(c => !c.baby).length, cap = RANCH.canPerCow * grown;
  const milkRow = s.can
    ? `<div class="rw"><span class="ic"><img src="${A.cropIcon.milk}" width="26" height="26" alt="milk"></span><span class="bar"><i style="width:${cap ? Math.round(Math.min(1, s.canMilk / cap) * 100) : 0}%"></i></span><span class="tx">${!grown ? 'No grown cows yet' : s.canMilk >= cap ? 'The can is full' : `${RANCH.milk.price} coins every ${RANCH.milkHours} h`}</span></div>
       <button class="go" data-can ${s.canMilk ? '' : 'disabled'}>${A.svg('milk', '#2b2140', 22, 2.4)}<span>${s.canMilk ? `Collect ${s.canMilk} milk` : 'No milk in the can yet'}</span></button>`
    : `<div class="rw"><span class="ic"><img src="${A.cropIcon.milk}" width="26" height="26" alt="milk"></span><span class="tx">Tap the milk bubble over a cow to milk her. Nell sells a milk can that collects it for you.</span></div>`;
  const html = `<div class="cd"><button class="x" data-x aria-label="Close">✕</button>
<div class="hd"><img src="${blueprintPicture()}" width="56" height="56" alt=""><div><h2>Cow pen</h2><div class="lv">${sq} squares · holds ${h}</div></div></div>
<div class="rw"><span class="ic">${A.svg('cow', '#2b2140', 24, 2.2)}</span><b class="big">${n}/${h}</b><div class="cws">${chips}</div></div>
${milkRow}
<button class="go grow" data-grow>${A.svg('wood', '#2b2140', 22, 2.4)}<span class="ut"><b>Make the pen bigger</b><small>${RANCH.woodPerSquare} wood a square · ${h >= RANCH.maxCows ? 'holds as many cows as it can' : toNext + ' more for another cow'} · you have ${A.invCount('wood')}</small></span></button></div>`;
  if (html !== card.html) { card.html = html; card.el.innerHTML = html; }
}

// ---------- little tags: milk in the can (any distance), the pen's count when you're close ----------
const _v = { p: null };
function drawTags() {
  if (!ui) return; const s = st(), t = ui.tag, c = canAt();
  if (!s.pen) { t.dataset.on = ''; return; }
  const P = A.player.pos, g = gate(), close = Math.hypot(P.x - g.x, P.z - g.z) < 4.5;
  t.querySelector('.mk').hidden = !(c && s.canMilk); t.querySelector('.mk b').textContent = s.canMilk;
  t.querySelector('.cnt').hidden = !close; t.querySelector('.cnt b').textContent = s.cows.length + '/' + holds();
  t.dataset.on = (c && s.canMilk) || close ? '1' : '';
}
function placeTags() {
  if (!ui) return; const t = ui.tag, s = st(); if (t.dataset.on !== '1' || !s.pen) return;
  if (!_v.p) _v.p = new THREE.Vector3();
  const c = canAt() || gate(); _v.p.set(c.x, A.groundY(c.x, c.z) + (canAt() ? 1.05 : 1.2), c.z).project(A.camera);
  t.style.left = ((_v.p.x * 0.5 + 0.5) * innerWidth) + 'px'; t.style.top = ((-_v.p.y * 0.5 + 0.5) * innerHeight) + 'px';
  t.style.visibility = _v.p.z < 1 ? 'visible' : 'hidden';
}
function buildUI() {
  const css = document.createElement('style');
  css.textContent = `
.penTag { position: fixed; z-index: 6; transform: translate(-50%, -100%); pointer-events: none; display: none; }
.penTag[data-on="1"] { display: block; }
.penTag .sb { display: flex; align-items: center; gap: 5px; background: #fffdf5; border: 2px solid #2b2140; border-radius: 12px; padding: 3px 7px 3px 5px; box-shadow: 0 3px 0 rgba(43,33,64,.3); font: 700 15px/1 Fredoka, system-ui, sans-serif; color: #2b2140; white-space: nowrap; }
.penTag svg, .penTag img { display: block; } .penTag .sb > span { display: flex; align-items: center; gap: 3px; height: 18px; } .penTag .sb > span[hidden] { display: none; } .penTag .cnt { font-size: 13px; }
#penCard { position: fixed; inset: 0; z-index: 20; display: flex; align-items: flex-end; justify-content: center; padding: 0 10px calc(12px + env(safe-area-inset-bottom)); box-sizing: border-box; font-family: Fredoka, system-ui, sans-serif; color: #2b2140; }
#penCard .cd { position: relative; width: 100%; max-width: 420px; background: #fffdf5; border: 3px solid #2b2140; border-radius: 22px; box-shadow: 0 6px 0 rgba(43,33,64,.25); padding: 12px 14px 14px; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; }
#penCard .x { position: absolute; right: 10px; top: 10px; width: 44px; height: 44px; border-radius: 50%; border: 2px solid #2b2140; background: #fff; font-size: 18px; font-weight: 700; color: #2b2140; padding: 0; }
#penCard .hd { display: flex; align-items: center; gap: 10px; padding-right: 50px; } #penCard h2 { margin: 0; font-size: 20px; font-weight: 700; line-height: 1.1; }
#penCard .lv { font-size: 15px; font-weight: 600; margin-top: 3px; }
#penCard .rw { display: flex; align-items: center; gap: 8px; min-height: 40px; }
#penCard .ic { width: 30px; flex: none; display: flex; justify-content: center; } #penCard .big { font-size: 24px; font-weight: 700; min-width: 34px; }
#penCard .tx { font-size: 15px; font-weight: 600; color: #54496b; flex: 1; }
#penCard .cws { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; min-width: 0; }
#penCard .cw { width: 66px; min-height: 64px; border-radius: 10px; background: #fff3dc; border: 2px solid #2b2140; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; padding: 2px; text-align: center; }
#penCard .cw b { font-size: 12px; line-height: 1.1; } #penCard .cw small { font-size: 10px; font-weight: 700; line-height: 1.05; color: #54496b; }
#penCard .cw.free { background: none; border-style: dashed; border-color: #b9afc6; }
#penCard .bar { flex: 1; height: 16px; border-radius: 999px; border: 2px solid #2b2140; background: #fff; overflow: hidden; } #penCard .bar i { display: block; height: 100%; background: #9fd3f2; }
#penCard .go { display: flex; align-items: center; gap: 10px; min-height: 56px; width: 100%; border-radius: 16px; border: 3px solid #2b2140; background: #7cc957; color: #2b2140; font: 700 17px Fredoka, system-ui, sans-serif; padding: 6px 12px; box-sizing: border-box; box-shadow: 0 4px 0 rgba(43,33,64,.25); text-align: left; }
#penCard .go:disabled { background: #e6dfd2; box-shadow: none; } #penCard .go.grow { background: #ffd84d; }
#penCard .ut { flex: 1; min-width: 0; display: flex; flex-direction: column; } #penCard .ut small { font-size: 13px; font-weight: 600; }
#penBar { position: fixed; left: 50%; top: calc(104px + env(safe-area-inset-top)); width: max-content; transform: translateX(-50%); z-index: 15; display: flex; align-items: center; gap: 10px; background: #fffdf5; border: 3px solid #2b2140; border-radius: 18px; padding: 8px 8px 8px 14px; box-shadow: 0 5px 0 rgba(43,33,64,.25); font-family: Fredoka, system-ui, sans-serif; color: #2b2140; max-width: calc(100vw - 20px); box-sizing: border-box; }
#penBar[hidden] { display: none; } #penBar .t { display: flex; flex-direction: column; white-space: nowrap; } #penBar .t b { font-size: 17px; } #penBar .t small { display: flex; align-items: center; gap: 4px; font-size: 14px; font-weight: 600; }
#penBar button { min-height: 48px; min-width: 76px; border-radius: 14px; border: 3px solid #2b2140; background: #7cc957; font: 700 17px Fredoka, system-ui, sans-serif; color: #2b2140; }
body.in-store .penTag, body.in-store #penCard, body.in-store #penBar { display: none !important; }`;
  document.head.appendChild(css);
  const tag = document.createElement('div'); tag.className = 'penTag'; tag.setAttribute('aria-hidden', 'true');
  tag.innerHTML = `<div class="sb"><span class="mk"><img src="${A.cropIcon.milk}" width="18" height="18" alt=""><b>0</b></span><span class="cnt">${A.svg('cow', '#2b2140', 15, 2.2)}<b></b></span></div>`;
  const bar = document.createElement('div'); bar.id = 'penBar'; bar.hidden = true;
  bar.innerHTML = '<div class="t"></div><button data-done>Done</button>';
  for (const ev of ['pointerdown', 'pointerup', 'pointermove', 'touchstart']) bar.addEventListener(ev, e => e.stopPropagation());
  bar.addEventListener('click', (e) => { if (e.target.closest('[data-done]')) { endBuild(); A.audio.play('popClose'); } });
  document.body.append(tag, bar); ui = { tag, bar };
}

// ---------- pictures for Nell's list and the card, drawn once ----------
const pics = {};
function drawCanvas(size, fn) { const c = document.createElement('canvas'); c.width = c.height = size; const k = c.getContext('2d'); k.strokeStyle = '#2b2140'; k.lineJoin = 'round'; k.lineCap = 'round'; fn(k); return c; }
function drawPic(size, fn) { return drawCanvas(size, fn).toDataURL(); }
function milkBottle(k, x, y, s) {
  k.save(); k.translate(x, y); k.scale(s, s); k.lineWidth = 4; k.fillStyle = '#ffffff';
  k.beginPath(); k.moveTo(-7, -24); k.lineTo(7, -24); k.lineTo(7, -16); k.lineTo(14, -6); k.lineTo(14, 22); k.quadraticCurveTo(14, 26, 10, 26); k.lineTo(-10, 26); k.quadraticCurveTo(-14, 26, -14, 22); k.lineTo(-14, -6); k.lineTo(-7, -16); k.closePath(); k.fill(); k.stroke();
  k.fillStyle = '#9fd3f2'; k.fillRect(-12, 2, 24, 10); k.strokeRect(-12, 2, 24, 10); k.fillStyle = '#e2574c'; k.fillRect(-8, -28, 16, 6); k.strokeRect(-8, -28, 16, 6); k.restore();
}
function blueprintPicture() { return pics.bp || (pics.bp = drawPic(128, k => {
  k.lineWidth = 6; k.fillStyle = '#4a8fd6'; k.beginPath(); k.roundRect(14, 20, 100, 88, 10); k.fill(); k.stroke();
  k.strokeStyle = '#ffffff'; k.lineWidth = 4; k.strokeRect(34, 40, 60, 48); for (const x of [34, 54, 74, 94]) { k.beginPath(); k.moveTo(x, 36); k.lineTo(x, 92); k.stroke(); }
  k.beginPath(); k.moveTo(54, 88); k.lineTo(74, 76); k.stroke(); k.strokeStyle = '#2b2140'; k.lineWidth = 6; k.beginPath(); k.moveTo(100, 20); k.lineTo(114, 34); k.stroke(); })); }
function canPicture() { return pics.can || (pics.can = drawPic(128, k => {
  k.lineWidth = 6; k.fillStyle = '#c9d3da'; k.beginPath(); k.moveTo(40, 52); k.lineTo(50, 36); k.lineTo(78, 36); k.lineTo(88, 52); k.lineTo(90, 108); k.quadraticCurveTo(64, 116, 38, 108); k.closePath(); k.fill(); k.stroke();
  k.fillStyle = '#9aa7b0'; k.beginPath(); k.roundRect(48, 22, 32, 16, 6); k.fill(); k.stroke(); k.beginPath(); k.arc(40, 70, 9, Math.PI / 2, Math.PI * 1.5); k.stroke(); k.beginPath(); k.arc(88, 70, 9, -Math.PI / 2, Math.PI / 2); k.stroke();
  k.fillStyle = '#fff'; k.beginPath(); k.ellipse(64, 80, 14, 10, 0, 0, 6.3); k.fill(); k.stroke(); })); }
function face(k, coat, patch, big) {
  k.lineWidth = 5; k.fillStyle = coat;
  for (const s of [-1, 1]) { k.beginPath(); k.ellipse(64 + s * 42, 46, 16, 9, s * -0.4, 0, 6.3); k.fill(); k.stroke(); }
  if (!big) { k.fillStyle = '#f2e3c0'; for (const s of [-1, 1]) { k.beginPath(); k.moveTo(64 + s * 22, 30); k.lineTo(64 + s * 30, 12); k.lineTo(64 + s * 34, 30); k.closePath(); k.fill(); k.stroke(); } }
  k.fillStyle = coat; k.beginPath(); k.roundRect(30, 26, 68, 80, 22); k.fill(); k.stroke();
  k.fillStyle = patch; k.beginPath(); k.ellipse(48, 44, 14, 11, 0.4, 0, 6.3); k.fill();
  k.fillStyle = '#f9b9c6'; k.beginPath(); k.roundRect(36, 74, 56, 30, 14); k.fill(); k.stroke();
  k.fillStyle = '#2b2140'; for (const s of [-1, 1]) { k.beginPath(); k.arc(64 + s * 13, 89, 3.5, 0, 6.3); k.fill(); k.beginPath(); k.arc(64 + s * 18, 58, big ? 7 : 6, 0, 6.3); k.fill(); }
  k.fillStyle = '#fff'; for (const s of [-1, 1]) { k.beginPath(); k.arc(64 + s * 18 - 2, 56, 2.2, 0, 6.3); k.fill(); }
}
function cowPicture() { return pics.cow || (pics.cow = drawPic(128, k => face(k, '#fffaf0', '#3f3a55', false))); }
function calfPicture() { return pics.calf || (pics.calf = drawPic(128, k => face(k, '#fffaf0', '#c98a52', true))); }

// for tests
export const debug = () => { const s = st(); return { ready, bp: s.bp, pen: s.pen, can: s.can, canMilk: s.canMilk, cows: s.cows, drift: s.drift, holds: holds(), building: !!build, placing: !!place, wood: A.invCount('wood') }; };
export const growSquares = growable;
export const addSquareAt = addSquare;
export { endBuild, placePen, collectCan, openCard as openPenCard };
