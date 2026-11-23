// ANIMALS (try/chickens): homesteading starts here. A coop you place on your land like decor, hens and
// chicks that wander, peck, follow you a little, doze at night and lay eggs on the real clock (also while
// you're away, decision 40). Nothing can get sick, run away or die: a hungry hen just naps until fed.
// Everything about animals lives in this file. Other files only carry small hooks marked "ANIMALS":
// main.js (init, start, frame, block, pickUse; decor that builds its own model and can't be turned), interior.js (Nell's extra tab).
// Hens live at the coop; ducks live at the duck pond. Each home has its own birds, nest, feed and little tag.
//
// Mac's picks (Nov 15): the little hutch; on any land you own; one coop that grows 4 -> 8 -> 12; chicks grow up
// in a day; they follow a little by themselves; an egg every 20 minutes; eggs wait in the nest box; eggs are for
// selling (Higgins, the ship, orders); crops or Nell's feed fill the trough; three hearts; town level 4; middle prices.
//
// Models: hen, chick and eggs are made in code here (Mac: "code-made for now"; an artist pack can replace the
// build*Geo() functions). The coop is Kenney Fantasy Town Kit pieces (already in the town pack) at about half size.
// Speed: every bird is drawn by the same six instanced meshes, so 3 birds or 16 cost the same six draw calls.
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';
import { DECOR, ITEMS, STORE, LEVELS, ORDERS, ANIMALS } from './data.js';
export { ANIMALS };   // the numbers live in data.js since v0.1.57

const TRY = false;                           // TRY: the try-out panel (free starter set, fast clock, fps). Off since the merge (v0.1.57).

let A = null, THREE = null, ready = false;
let C = null, pond = null;                   // where the placed coop and the placed duck pond are (shortcuts to HOMES.*.at)
let meshes = null, rig = null, eggMesh = null, grain = null;
let hens = [], fx = [], panel = null;
let secT = 0, lastP = null, pSpeed = 0, feedT = 0, fpsAvg = 60, sig = '';
const ZERO = { m: null };

const fresh = () => ({ v: 2, lv: 1, birds: [], nest: 0, feed: 0, at: Date.now(), fast: false });
const st = () => { const S = A.S; if (!S.animals || S.animals.v !== 2) S.animals = fresh(); return S.animals; };
const rnd = (a, b) => a + Math.random() * (b - a);
const H = 3600e3;
const clock = () => (TRY && st().fast ? { lay: 40e3, dlay: 60e3, hour: 120e3, grow: 120e3, heart: 30e3, fade: 600e3 }
  : { lay: ANIMALS.layMinutes * 60e3, dlay: ANIMALS.duck.layMinutes * 60e3, hour: H, grow: ANIMALS.growHours * H, heart: ANIMALS.heartHours * H, fade: ANIMALS.fadeHours * H });
const holds = () => ANIMALS.coop.holds[st().lv - 1];
const pondRec = () => A.S.decor.find(r => r.id === 'pond') || null;
const coopRec = () => A.S.decor.find(r => r.id === 'coop') || null;
const hasCoop = () => !!coopRec() || A.invCount('decor_coop') > 0;
const voice = (h) => (h.chick ? 'peep' : h.duck ? 'quack' : 'cluck');
// The two homes (Mac, after playing: "ducks should be separated"): hens live at the coop, ducks at the pond.
// Each home has its own birds, nest, feed and tag. `at` is filled in while the home is placed on the land.
const HOMES = {
  coop: { key: 'coop', name: 'Chicken coop', lvKey: 'lv', sizes: ANIMALS.coop.holds, bigger: ANIMALS.coop.bigger, pic: (lv) => coopPicture(lv), duck: false, nestKey: 'nest', feedKey: 'feed', egg: 'egg', icon: 'hen', yard: ANIMALS.yard, reach: 1.5, holds, rec: coopRec, at: null, feedAt: null, tag: null, fill: null },
  pond: { key: 'pond', name: 'Duck pond', lvKey: 'lvD', sizes: ANIMALS.duck.holds, bigger: ANIMALS.duck.bigger, pic: (lv) => pondPicture(lv), duck: true, nestKey: 'nestD', feedKey: 'feedD', egg: 'duckegg', icon: 'duck', yard: 2.6, reach: 1.25, holds: () => ANIMALS.duck.holds[(st().lvD || 1) - 1], rec: pondRec, at: null, feedAt: null, tag: null, fill: null },
};
const lvOf = (Hm) => st()[Hm.lvKey] || 1;
const homeOf = (b) => (b.k === 'duck' ? HOMES.pond : HOMES.coop);
const birdsOf = (Hm) => st().birds.filter(b => (b.k === 'duck') === Hm.duck);
const eggsOf = (Hm) => st()[Hm.nestKey] || 0;
const feedOf = (Hm) => st()[Hm.feedKey] || 0;
const nestCapOf = (Hm) => ANIMALS.nestPerHen * birdsOf(Hm).filter(b => !b.chick).length;
const troughCapOf = (Hm) => ANIMALS.feed.hoursPerBird * Hm.holds();
const hasHome = (Hm) => !!Hm.rec() || A.invCount('decor_' + Hm.key) > 0;
const roomOf = (Hm) => Hm.holds() - birdsOf(Hm).length;

// ---------- registered as soon as this file loads, so a save that already has eggs or a placed coop opens cleanly ----------
ITEMS.egg = { name: ANIMALS.egg.name, kind: 'crop', rarity: 'common', price: ANIMALS.egg.price };   // 'crop' so the bag, Higgins, orders and the ship's crates take it as-is
ITEMS.feed = { name: 'Chicken feed', kind: 'feed', rarity: 'common', price: 2, buy: ANIMALS.feed.buy };
// the coop is decor that builds its own model and can't be turned (decision 49)
DECOR.coop = { name: 'Chicken coop', model: ['town', 'wall-wood', 1], size: [3, 3], buy: ANIMALS.coop.buy, level: ANIMALS.level, turns: [0, 1, 3], build: (r) => turned(buildCoop(A.S.animals && A.S.animals.v === 2 ? A.S.animals.lv : 1), r, COOP_BACK) };   // a square, so it can turn: door to the front, right or left, never the back (Mac, v0.1.95)
ITEMS.decor_coop = { name: DECOR.coop.name, kind: 'decor', rarity: 'common', price: Math.round(ANIMALS.coop.buy / 2), buy: ANIMALS.coop.buy, decor: 'coop' };
LEVELS[ANIMALS.level].push({ decor: 'coop' });   // shows on the town level roadmap
ITEMS.duckegg = { name: ANIMALS.duck.egg.name, kind: 'crop', rarity: 'common', price: ANIMALS.duck.egg.price };
DECOR.pond = { name: 'Duck pond', model: ['town', 'fountain-round', 1], size: [2, 2], buy: ANIMALS.duck.pond, level: ANIMALS.duck.level, turns: [0, 1, 3], build: (r) => turned(buildPond(A.S.animals && A.S.animals.v === 2 ? A.S.animals.lvD || 1 : 1), r, 0) };
ITEMS.decor_pond = { name: DECOR.pond.name, kind: 'decor', rarity: 'common', price: Math.round(ANIMALS.duck.pond / 2), buy: ANIMALS.duck.pond, decor: 'pond' };
LEVELS[ANIMALS.duck.level].push({ decor: 'pond' });
STORE.extra = { label: 'Animals', items: nellItems() };

// ---------- init: at boot, before saved decor is put back (cheap). start: in the background once the first screen is up. ----------
export function init(api) {
  A = api; THREE = api.THREE;
  A.cropIcon.egg = draw(64, k => { k.fillStyle = '#fff3dc'; k.lineWidth = 4; k.beginPath(); k.ellipse(32, 34, 18, 24, 0, 0, 6.3); k.fill(); k.stroke(); k.fillStyle = 'rgba(255,255,255,.9)'; k.beginPath(); k.ellipse(25, 24, 4, 7, 0.5, 0, 6.3); k.fill(); });
  A.cropIcon.duckegg = draw(64, k => { k.fillStyle = '#d3ecdf'; k.lineWidth = 4; k.beginPath(); k.ellipse(32, 34, 19, 25, 0, 0, 6.3); k.fill(); k.stroke(); k.fillStyle = 'rgba(255,255,255,.9)'; k.beginPath(); k.ellipse(25, 24, 4, 7, 0.5, 0, 6.3); k.fill(); });
  Object.assign(A.ICON, {
    pond: '<ellipse cx="12" cy="14" rx="9" ry="5.5"/><path d="M8 14q2-2 4 0t4 0"/>',
    duck: '<path d="M4 14a6 6 0 0 0 12 0v-4a3 3 0 0 0-6 0v1H7"/><path d="M16 9h4.5v2H16"/><path d="M3 20q2-2 4 0t4 0 4 0 4 0"/>',
    egg: '<path d="M12 3c3.6 0 6.5 5.4 6.5 10a6.5 6.5 0 0 1-13 0C5.5 8.4 8.4 3 12 3z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    feed: '<path d="M6 8h12l-1.5 12h-9z"/><path d="M8 8l1.5-4h5L16 8"/><path d="M10 13h4"/>',
    hen: '<path d="M5 13a6 6 0 0 0 12 0V9a3 3 0 0 0-6 0v1H8"/><path d="M17 10l3 1-3 1"/><path d="M9 19v2M13 19v2"/><path d="M13 6l1-2 1 2"/>',
    coop: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-4a2 2 0 0 1 4 0v4"/>',
  });
}
export function start() {
  if (!A || ready) return;
  ZERO.m = new THREE.Matrix4().makeScale(0, 0, 0);
  buildMeshes();
  buildUI();
  ready = true;
  sync();
}

// ---------- what Nell sells (her "Animals" tab; interior.js draws it) ----------
function nellItems() {
  const pic = (fn) => () => `<img src="${fn()}" alt="">`, lvl = ANIMALS.level;
  const bird = (chick, duck) => { const Hm = duck ? HOMES.pond : HOMES.coop, where = duck ? 'pond' : 'coop'; return {
    pic: pic(() => birdPicture(chick, duck)),
    info: () => ({ name: duck ? (chick ? 'Duckling' : 'Duck') : chick ? 'Chick' : 'Hen', price: duck ? (chick ? ANIMALS.duck.baby : ANIMALS.duck.buy) : chick ? ANIMALS.chick : ANIMALS.hen, level: duck ? ANIMALS.duck.level : lvl,
      own: false, once: false, have: 0, blurb: hasHome(Hm) ? `${birdsOf(Hm).length} of ${Hm.holds()} at your ${where}` : `Needs a ${duck ? 'duck pond' : 'coop'}` }),
    can: (q) => !hasHome(Hm) ? `Buy a ${duck ? 'duck pond' : 'chicken coop'} first` : q > roomOf(Hm) ? (roomOf(Hm) > 0 ? `Your ${where} has room for ${roomOf(Hm)} more` : `Your ${where} is full`) : '',
    give: (q) => { for (let i = 0; i < q; i++) addBird(chick, duck); A.toast(Hm.rec() ? `+${q}: waiting at your ${where}` : `They\u2019ll be at your ${where} once you place it`); },
  }; };
  return {
    coop: { pic: pic(() => coopPicture(1)),
      info: () => ({ name: DECOR.coop.name, price: ANIMALS.coop.buy, level: lvl, own: hasCoop(), once: true, blurb: `Holds ${ANIMALS.coop.holds[0]} chickens` }),
      can: () => '', give: () => { A.addItem('decor_coop', 1); A.toast('Chicken coop: place it like decor'); } },
    hen: bird(false), chick: bird(true),
    feed: { pic: pic(feedPicture),
      info: () => ({ name: `Chicken feed ×${ANIMALS.feed.pack}`, price: ANIMALS.feed.buy, level: lvl, own: false, once: false, have: A.invCount('feed'), blurb: '' }),
      can: () => '', give: (q) => { A.addItem('feed', q * ANIMALS.feed.pack); A.toast(`+${q * ANIMALS.feed.pack} chicken feed`); } },
    duck: bird(false, true), duckling: bird(true, true),
    pond: { pic: pic(() => pondPicture(1)),
      info: () => ({ name: DECOR.pond.name, price: ANIMALS.duck.pond, level: ANIMALS.duck.level, own: !!pondRec() || A.invCount('decor_pond') > 0, once: true, blurb: `Home for ${ANIMALS.duck.holds[0]} ducks` }),
      can: () => '', give: () => { A.addItem('decor_pond', 1); A.toast('Duck pond: place it like decor'); } },
  };
}
function addBird(chick, duck) {
  const a = st();
  a.birds.push({ ...(duck ? { k: 'duck' } : {}), c: Math.random() * (duck ? ANIMALS.duck.colors : ANIMALS.colors).length | 0, chick: !!chick, born: Date.now(), hearts: 1, petAt: 0, prog: 0 });
  sig = '';
}

// ---------- the coop (Kenney Fantasy Town Kit at about half size, on short legs, with a ramp, nest box and trough) ----------
// level 1 the little hutch, level 2 the long hutch, level 3 the barn (bigger pieces, red roof)
const SHAPE = (lv) => { const T = A.SCALE.town * (lv === 3 ? 0.62 : 0.5), n = lv === 1 ? 1 : 2, x0 = lv === 1 ? -0.3 : -T / 2;
  return { T, n, x0, up: 0.22, doorX: x0, hw: lv === 1 ? 0.95 : n * T / 2 + 0.25, hz: T / 2 + 0.08, nestX: (lv === 1 ? x0 + T / 2 : T) + 0.2, troughX: x0 - (lv === 1 ? 0.78 : 0.2), troughZ: T / 2 + (lv === 1 ? 0.3 : 0.75) }; };
// Homes turn like the doghouse (Mac, v0.1.95). r counts quarter turns: 0 = front to the camera, 1 = to the right, 3 = to the left.
// The coop's hut sits half a square back from the middle of its 3 x 3 footprint, so the ramp and trough are inside it.
const COOP_BACK = -0.5;
const turn = (dx, dz, r) => { const a = (r || 0) * Math.PI / 2, c = Math.cos(a), n = Math.sin(a); return [dx * c + dz * n, -dx * n + dz * c]; };
function turned(model, r, back) { const g = new THREE.Group(); model.position.z = back; g.add(model); g.rotation.y = (r || 0) * Math.PI / 2; const top = new THREE.Group(); top.add(g); return top; }
function buildCoop(lv) {
  const g = new THREE.Group(), s = SHAPE(lv), { T, up } = s, hut = new THREE.Group();
  const piece = (name, x, y, r) => { const o = A.M.town[name].scene.clone(true); o.scale.setScalar(T); o.position.set(x, y, 0); o.rotation.y = r; hut.add(o); return o; };
  for (let i = 0; i < s.n; i++) { const x = s.x0 + i * T;
    piece(i === 0 ? 'wall-wood-door' : 'wall-wood-window-shutters', x, 0, -Math.PI / 2); piece('wall-wood', x, 0, Math.PI / 2); piece('roof-gable', x, T, Math.PI / 2);
    if (i === 0) piece('wall-wood', x, 0, Math.PI); if (i === s.n - 1) piece('wall-wood', x, 0, 0); }
  if (lv === 3) redRoof(hut);
  hut.position.y = up; g.add(hut);
  const box = (w, h, d, color, x, y, z, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.85 })); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; };
  const h = T / 2, L = s.x0 - h, R = s.x0 + (s.n - 1) * T + h;
  box(R - L + 0.04, 0.05, T + 0.04, 0x8a6a4a, (L + R) / 2, up - 0.02, 0);                               // floor
  for (const x of [L + 0.06, R - 0.06]) for (const z of [-h + 0.06, h - 0.06]) box(0.09, up, 0.09, 0x6b4a32, x, up / 2, z);   // legs
  box(0.34, 0.03, 0.62, 0xb98a5a, s.doorX, up / 2, h + 0.27, 0.36);                                     // ramp
  for (let i = 0; i < 3; i++) box(0.34, 0.02, 0.03, 0x6b4a32, s.doorX, up - 0.035 - i * 0.065, h + 0.1 + i * 0.17, 0.36);
  // nest box on the right: open top, straw inside; eggs waiting for you show here
  const nx = s.nestX;
  box(0.4, 0.04, 0.5, 0x8a6a4a, nx, up + 0.1, 0.1); box(0.36, 0.05, 0.46, 0xf0d070, nx, up + 0.14, 0.1);
  box(0.4, 0.16, 0.04, 0x9a7450, nx, up + 0.18, 0.35); box(0.4, 0.16, 0.04, 0x9a7450, nx, up + 0.18, -0.15); box(0.04, 0.16, 0.5, 0x9a7450, nx + 0.2, up + 0.18, 0.1);
  for (const x of [nx - 0.15, nx + 0.17]) box(0.05, up + 0.1, 0.05, 0x6b4a32, x, (up + 0.1) / 2, 0.32);
  box(0.56, 0.08, 0.2, 0x9a7450, s.troughX, 0.04, s.troughZ);                                           // the feed trough (its yellow fill is drawn separately)
  return g;
}
// the roof's teal comes from Kenney's color texture; a red copy of it gives the barn its roof (same trick as the shop)
let redMat = null;
function redRoof(g) {
  g.traverse(m => {
    if (!m.isMesh || !/^roof/.test(m.name) || !m.material.map) return;
    if (!redMat) {
      const src = m.material.map, im = src.image, c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height), a = d.data, col = new THREE.Color(), hs = {};
      for (let i = 0; i < a.length; i += 4) { col.setRGB(a[i] / 255, a[i + 1] / 255, a[i + 2] / 255); col.getHSL(hs);
        if (hs.h > 0.38 && hs.h < 0.58 && hs.s > 0.15) { col.setHSL(0.01, Math.min(1, hs.s * 1.1), Math.min(1, hs.l * 1.05)); a[i] = col.r * 255; a[i + 1] = col.g * 255; a[i + 2] = col.b * 255; } }
      x.putImageData(d, 0, 0);
      const tex = new THREE.CanvasTexture(c); tex.flipY = src.flipY; tex.colorSpace = src.colorSpace; tex.magFilter = src.magFilter; tex.minFilter = src.minFilter; tex.generateMipmaps = src.generateMipmaps;
      redMat = m.material.clone(); redMat.map = tex;
    }
    m.material = redMat;
  });
}

// keep up with the save: which homes are placed, where, how big, and who lives in them
function sync() {
  const a = st(), cr = coopRec(), pr = pondRec();
  const now = [cr ? cr.x + ',' + cr.z + ',' + (cr.r || 0) : '-', pr ? pr.x + ',' + pr.z + ',' + (pr.r || 0) : '-', a.lv, a.lvD || 1, a.birds.map(b => (b.chick ? 'c' : 'h') + (b.k || '') + b.c).join('')].join('|');
  if (now === sig) return;
  sig = now;
  // x, z is the middle of the hut (or the pond); every spot is measured from there and turned with the building
  if (cr) { const s = SHAPE(a.lv), r = cr.r || 0, [bx, bz] = turn(0, COOP_BACK, r), x = cr.x + 1.5 + bx, z = cr.z + 1.5 + bz, y = A.groundY(x, z);
    const at = (dx, dz) => { const [tx, tz] = turn(dx, dz, r); return { x: x + tx, z: z + tz }; };
    HOMES.coop.at = { x, z, y, s, r, hw: r % 2 ? s.hz : s.hw, hz: r % 2 ? s.hw : s.hz, nest: { ...at(s.nestX, 0.1), y: y + s.up + 0.2 }, door: at(s.doorX, s.T / 2 + 0.7), top: s.up + s.T * 1.55, trough: at(s.troughX, s.troughZ), yard: at(0, 2.7) };
  } else HOMES.coop.at = null;
  if (pr) { const r = pr.r || 0, x = pr.x + 1, z = pr.z + 1, y = A.groundY(x, z);                 // the reed nest is at the pond's front left, the feed bowl at its front right
    const at = (dx, dz) => { const [tx, tz] = turn(dx, dz, r); return { x: x + tx, z: z + tz }; };
    HOMES.pond.at = { x, z, y, r, hw: r % 2 ? 0.8 : 0.95, hz: r % 2 ? 0.95 : 0.8, nest: { ...at(-0.76, 0.78), y: y + 0.1 }, door: at(-0.76, 1.3), top: 0.8, trough: at(0.76, 0.8), yard: at(0, 1.6) };
  } else HOMES.pond.at = null;
  C = HOMES.coop.at; pond = HOMES.pond.at;
  advance(Date.now());
  makeFlock(); drawEggs(); drawFill(); drawTags();
}

// the coop is solid, like the shop
export function block(np, pos) {
  if (!C) return;
  const hit = (x, z) => Math.abs(x - C.x) < C.hw + 0.2 && Math.abs(z - C.z) < C.hz + 0.22;
  if (!hit(np.x, np.z)) return;
  if (!hit(np.x, pos.z)) np.z = pos.z; else if (!hit(pos.x, np.z)) np.x = pos.x; else { np.x = pos.x; np.z = pos.z; }
}

// ---------- the hen, made in code: six small shapes shared by every bird ----------
function part(geo, color, mx) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (mx) g.applyMatrix4(mx);
  g.deleteAttribute('uv');
  if (color) { const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
  return g;
}
const TRS = (x, y, z, sx = 1, sy = sx, sz = sx, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(sx, sy, sz));
const ball = (r) => new THREE.SphereGeometry(r, 7, 5);
function finish(list) { const g = mergeGeometries(list); g.computeVertexNormals(); return g; }
function buildBodyGeo() {
  return finish([
    part(ball(0.16), 0, TRS(0, 0, 0, 1, 0.92, 1.2)),
    part(ball(0.115), 0, TRS(0, 0.02, 0.11)),
    part(new THREE.ConeGeometry(0.1, 0.24, 5), 0, TRS(0, 0.13, -0.2, 0.7, 1, 1, -0.75)),            // tail
    part(ball(0.1), 0, TRS(0.145, -0.01, -0.02, 0.38, 0.8, 1.15)), part(ball(0.1), 0, TRS(-0.145, -0.01, -0.02, 0.38, 0.8, 1.15)),   // wings
  ]);
}
const buildHeadGeo = () => finish([part(ball(0.1), 0, TRS(0, 0.1, 0.03)), part(new THREE.CylinderGeometry(0.06, 0.085, 0.1, 6), 0, TRS(0, 0.01, 0.01))]);
const buildCombGeo = () => finish([part(ball(0.032), 0, TRS(0, 0.205, 0)), part(ball(0.036), 0, TRS(0, 0.212, 0.045)), part(ball(0.03), 0, TRS(0, 0.195, 0.085)), part(ball(0.026), 0, TRS(0, 0.035, 0.125, 0.8, 1.3, 0.8))]);
const buildFaceGeo = () => finish([
  part(new THREE.ConeGeometry(0.034, 0.08, 5), '#f29b2c', TRS(0, 0.09, 0.145, 1, 1, 1, Math.PI / 2)),
  part(ball(0.021), '#2b2140', TRS(0.078, 0.12, 0.07)), part(ball(0.021), '#2b2140', TRS(-0.078, 0.12, 0.07)),
]);
// a duck's face: a flat bill instead of the beak
const buildBillGeo = () => finish([
  part(new THREE.BoxGeometry(0.09, 0.026, 0.11), '#f2a531', TRS(0, 0.085, 0.15)),
  part(ball(0.021), '#2b2140', TRS(0.078, 0.12, 0.07)), part(ball(0.021), '#2b2140', TRS(-0.078, 0.12, 0.07)),
]);
const buildLegGeo = () => finish([part(new THREE.CylinderGeometry(0.013, 0.013, 0.13, 5), 0, TRS(0, -0.065, 0)), part(new THREE.BoxGeometry(0.06, 0.014, 0.08), 0, TRS(0, -0.128, 0.018))]);

function buildMeshes() {
  const N = ANIMALS.max, flat = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true, ...o });
  const im = (geo, mat, shadow) => { const m = new THREE.InstancedMesh(geo, mat, N); m.count = 0; m.frustumCulled = false; m.castShadow = !!shadow; m.receiveShadow = false; A.scene.add(m); return m; };
  meshes = {
    body: im(buildBodyGeo(), flat({ color: 0xffffff }), true),
    head: im(buildHeadGeo(), flat({ color: 0xffffff }), true),
    comb: im(buildCombGeo(), flat({ color: 0xe2463c })),
    face: im(buildFaceGeo(), flat({ vertexColors: true })),
    bill: im(buildBillGeo(), flat({ vertexColors: true })),
    legL: im(buildLegGeo(), flat({ color: 0xf29b2c })),
    legR: im(buildLegGeo(), flat({ color: 0xf29b2c })),
  };
  // one little skeleton, posed for each hen in turn and copied into the instances
  rig = { root: new THREE.Object3D(), body: new THREE.Object3D(), head: new THREE.Object3D(), legL: new THREE.Object3D(), legR: new THREE.Object3D() };
  rig.root.add(rig.body, rig.legL, rig.legR); rig.body.add(rig.head);
  rig.body.position.set(0, 0.27, 0); rig.head.position.set(0, 0.1, 0.12); rig.legL.position.set(0.06, 0.14, 0); rig.legR.position.set(-0.06, 0.14, 0);
  // eggs lying on the grass or in the nest box
  const eg = new THREE.SphereGeometry(0.055, 8, 6); eg.scale(1, 1.28, 1);
  eggMesh = new THREE.InstancedMesh(eg, new THREE.MeshStandardMaterial({ color: 0xfff3dc, roughness: 0.6 }), 64);
  eggMesh.count = 0; eggMesh.frustumCulled = false; eggMesh.castShadow = true; A.scene.add(eggMesh);
  // scattered feed
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
  grain = new THREE.Points(gg, new THREE.PointsMaterial({ color: 0xf2c94c, size: 0.06, transparent: true, opacity: 0 })); grain.frustumCulled = false; A.scene.add(grain);
  const fm = new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.9 });
  HOMES.coop.fill = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.14).translate(0, 0.03, 0), fm); HOMES.pond.fill = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.06, 10).translate(0, 0.03, 0), fm);
  for (const Hm of Object.values(HOMES)) { Hm.fill.visible = false; A.scene.add(Hm.fill); }
}

// ---------- the flock: every bird whose home is placed ----------
function makeFlock() {
  const a = st(), old = hens;
  hens = a.birds.filter(b => homeOf(b).at).slice(0, ANIMALS.max).map((b, i) => {
    const Hm = homeOf(b), Y = Hm.at.yard, ang = i * 2.4, r = 0.5 + (i % 5) * 0.4, was = old.find(o => o.b === b);
    return { i, b, H: Hm, chick: b.chick, duck: b.k === 'duck', x: was ? was.x : Y.x + Math.cos(ang) * r, z: was ? was.z : Y.z + Math.sin(ang) * r * 0.7, yaw: was ? was.yaw : rnd(0, 6.28), st: 'idle', t: rnd(0.2, 2), tx: 0, tz: 0,
      ph: rnd(0, 6), dur0: rnd(0.4, 2.4), pitch: 0, hp: 0, hy: 0, hyGoal: 0, hop: 0, sit: 0, lookT: 0, pecks: 0, petCd: 0, mom: null, size: b.chick ? 0.62 : 1.1 + (b.c % 3) * 0.05,
      color: new THREE.Color(b.chick ? ANIMALS.chickColor : b.k === 'duck' ? ANIMALS.duck.colors[b.c % ANIMALS.duck.colors.length] : ANIMALS.colors[b.c % ANIMALS.colors.length]) };
  });
  hens.forEach((h, k) => { if (!h.chick) return; const moms = hens.filter(m => !m.chick && m.H === h.H); if (moms.length) h.mom = moms[k % moms.length]; });   // babies follow a grown bird from their own home
  for (const k of Object.keys(meshes)) meshes[k].count = hens.length;
  if (hens.length) {
    hens.forEach((h, k) => { meshes.body.setColorAt(k, h.color); meshes.head.setColorAt(k, h.color); });
    meshes.body.instanceColor.needsUpdate = true; meshes.head.instanceColor.needsUpdate = true;
  }
}

// ---------- the clock: feed runs down, eggs come, chicks grow, hearts fade — the same sums live and for time away ----------
function advance(now) {
  const a = st(), dt = now - a.at, k = clock();
  a.at = now;
  if (dt <= 0) return;
  const live = dt < 5000;
  for (const b of a.birds) {
    if (b.chick && now - b.born >= k.grow) { b.chick = false; b.prog = 0; sig = ''; if (live) { const h = hens.find(o => o.b === b); if (h) { pop('heart', h.x, 0.7, h.z); A.audio.play(voice(h), near(h.x, h.z)); } } }
    if (b.hearts > 1 && now - b.petAt > k.fade) { b.hearts--; b.petAt = now; }
  }
  for (const Hm of Object.values(HOMES)) {
    if (!Hm.rec()) continue;                                  // packed away in your bag: time stands still for them
    const birds = birdsOf(Hm), n = birds.length; if (!n) continue;
    const have = feedOf(Hm), fed = Math.min(dt, have / n * k.hour);
    if (fed <= 0) continue;
    a[Hm.feedKey] = Math.max(0, have - fed / k.hour * n); if (a[Hm.feedKey] < 0.01) a[Hm.feedKey] = 0;
    const cap = nestCapOf(Hm), need = (b) => (Hm.duck ? k.dlay : k.lay) / ANIMALS.heartSpeed[b.hearts], adults = birds.filter(b => !b.chick);
    for (const b of adults) b.prog += fed;
    if (live) { for (const b of adults) if (b.prog >= need(b)) { b.prog = need(b); if (eggsOf(Hm) + laying(Hm) < cap) startLay(b); } continue; }
    // time away: everyone lays in turn, one egg a round, until the nest is full
    for (let more = true; more && eggsOf(Hm) < cap;) { more = false;
      for (const b of adults) if (b.prog >= need(b) && eggsOf(Hm) < cap) { b.prog -= need(b); a[Hm.nestKey] = eggsOf(Hm) + 1; more = true; } }
    for (const b of adults) if (b.prog > need(b)) b.prog = need(b);   // the nest was full: she waits with the next egg ready
  }
}
const laying = (Hm) => hens.filter(h => h.H === Hm && (h.st === 'lay' || h.st === 'tolay')).length;
function startLay(b) {
  const h = hens.find(o => o.b === b); if (!h || h.st === 'lay' || h.st === 'tolay') return;
  const d = h.H.at.door;
  h.st = 'tolay'; h.t = 0; h.tx = d.x + rnd(-0.2, 0.2); h.tz = d.z + rnd(0, 0.3);
}

// ---------- every frame ----------
const _v = { p: null };
export function frame(dt, elapsed) {
  if (!ready) return;
  if (!_v.p) _v.p = new THREE.Vector3();
  fpsAvg += (1 / Math.max(dt, 1e-3) - fpsAvg) * 0.03;
  secT += dt; if (secT > 1) { secT = 0; everySecond(); }
  if (!C && !pond) return;
  const P = A.player.pos;
  if (lastP) pSpeed = pSpeed * 0.8 + 0.2 * Math.hypot(P.x - lastP.x, P.z - lastP.z) / Math.max(dt, 1e-3); else lastP = { x: P.x, z: P.z };
  lastP.x = P.x; lastP.z = P.z;
  const night = A.currentTOD() === 'night';
  let followers = 0; for (const h of hens) if (h.st === 'follow') followers++;
  for (let k = 0; k < hens.length; k++) think(hens[k], k, dt, P, night ? 'night' : feedOf(hens[k].H) <= 0 ? 'hungry' : '', followers);
  // birds don't walk through each other (or stand inside you)
  for (let i = 0; i < hens.length; i++) { const h = hens[i];
    for (let j = i + 1; j < hens.length; j++) { const o = hens[j], dx = o.x - h.x, dz = o.z - h.z, d = Math.hypot(dx, dz), min = 0.17 * (h.size + o.size);
      if (d < min && d > 1e-4) { const push = (min - d) * 0.5 * Math.min(1, dt * 10) / d; h.x -= dx * push; h.z -= dz * push; o.x += dx * push; o.z += dz * push; } }
    const px = h.x - P.x, pz = h.z - P.z, pd = Math.hypot(px, pz); if (pd < 0.34 && pd > 1e-4) { h.x = P.x + px / pd * 0.34; h.z = P.z + pz / pd * 0.34; } }
  for (let k = 0; k < hens.length; k++) pose(hens[k], k, dt, elapsed);
  for (const key of Object.keys(meshes)) meshes[key].instanceMatrix.needsUpdate = true;
  if (feedT > 0) { feedT -= dt; grain.material.opacity = Math.min(1, feedT / 1.5); }
  tickFx(dt); placeTags();
}

function everySecond() {
  const a = st();
  // eggs are asked for on the order board only once you keep the birds that lay them
  for (const Hm of Object.values(HOMES)) {
    const want = ORDERS.wants.findIndex(w => w.item === Hm.egg), keeps = !!Hm.rec() && birdsOf(Hm).some(b => !b.chick);
    if (keeps && want < 0) ORDERS.wants.push({ item: Hm.egg, n: Hm.duck ? ANIMALS.duck.egg.order : ANIMALS.egg.order }); else if (!keeps && want >= 0) ORDERS.wants.splice(want, 1);
  }
  advance(Date.now());
  sync();
  drawFill(); drawTags();
  if (card) paintCard();
  if (panel && !panel.hidden) panel.querySelector('.fps').textContent = Math.round(Math.min(60, fpsAvg));
  void a;
}

function pickTarget(h) {
  const Y = h.H.at.yard, R = h.H.yard;
  for (let i = 0; i < 6; i++) {
    const g = rnd(0, 6.28), r = Math.sqrt(Math.random()) * R, x = Y.x + Math.cos(g) * r, z = Y.z + Math.sin(g) * r * 0.8;
    if (z < -2 || z > A.fenceZ() - 1.2 || Math.abs(x) > 13.4 || inCoop(x, z, 0.35) || (pond && Math.hypot(x - pond.x, (z - pond.z) * 1.2) < 1.1) || (A.wet && A.wet(x, z)) || A.plots.has(Math.floor(x) + ',' + Math.floor(z))) continue;
    h.tx = x; h.tz = z; return;
  }
  h.tx = Y.x; h.tz = Y.z;
}
const inCoop = (x, z, pad) => !!C && Math.abs(x - C.x) < C.hw + pad && Math.abs(z - C.z) < C.hz + pad;

function walk(h, dt, speed) {
  const dx = h.tx - h.x, dz = h.tz - h.z, d = Math.hypot(dx, dz);
  if (d < 0.06) return true;
  const want = Math.atan2(dx, dz); let dy = want - h.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); h.yaw += dy * Math.min(1, dt * 9);
  const step = Math.min(d, speed * dt * (Math.abs(dy) > 1.2 ? 0.3 : 1));
  let nx = h.x + Math.sin(h.yaw) * step, nz = h.z + Math.cos(h.yaw) * step;
  if (inCoop(nx, nz, 0.12)) { nx = h.x + (h.x < C.x ? -1 : 1) * step; nz = h.z; }   // slide round the coop
  nz = Math.min(nz, A.fenceZ() - 0.9);                                              // never through the fence into the wilds
  h.x = nx; h.z = nz; h.ph += step * 26; h.moving = speed;
  return false;
}

function think(h, k, dt, P, nap, followers) {
  const D = h.H.at.door, Y = h.H.at.yard, feedAt = h.H.feedAt;
  h.t += dt; h.moving = 0; h.petCd = Math.max(0, h.petCd - dt);
  const dP = Math.hypot(P.x - h.x, P.z - h.z);
  const sp = h.chick ? 1.25 : 1;
  // someone running straight through: hop out of the way with a cluck
  if (dP < 0.5 && pSpeed > 2.2 && h.hop <= 0 && h.st !== 'lay') { h.hop = 0.001; h.st = 'walk'; h.t = 0; h.tx = h.x + (h.x - P.x) / (dP + 0.01) * 1.1; h.tz = h.z + (h.z - P.z) / (dP + 0.01) * 1.1; h.fast = 1.2; A.audio.play(voice(h), 0.7); }
  switch (h.st) {
    case 'idle':
      if (feedAt) { h.st = 'eat'; h.t = 0; h.tx = feedAt.x + rnd(-0.5, 0.5); h.tz = feedAt.z + rnd(0.1, 0.6); break; }
      if (nap && dP > 2.2) { h.st = 'tosleep'; h.t = 0; h.tx = D.x + ((k % 4) - 1.5) * 0.52 + ((k / 4 | 0) % 2) * 0.26; h.tz = D.z + 0.1 + (k / 4 | 0) * 0.46; break; }
      if (h.chick && h.mom && Math.hypot(h.mom.x - h.x, h.mom.z - h.z) > 0.9) { h.st = 'walk'; h.t = 0; h.tx = h.mom.x + rnd(-0.35, 0.35); h.tz = h.mom.z + rnd(-0.35, 0.35); h.fast = 1; break; }
      if (dP < 3 && dP > 1 && followers < 3 && pSpeed < 2.4 && Math.random() < dt * 0.45) { h.st = 'follow'; h.t = 0; h.dur = rnd(3.5, 7); break; }
      if (h.duck && !h.chick && pond && !nap && Math.random() < dt * 0.12) { h.st = 'toswim'; h.t = 0; h.tx = pond.x + rnd(-0.3, 0.3); h.tz = pond.z + rnd(-0.2, 0.2); break; }
      if (h.t > h.dur0) { h.t = 0; if (Math.random() < 0.3) { h.st = 'peck'; h.pecks = 2 + (Math.random() * 3 | 0); } else { h.st = 'walk'; h.fast = 0; pickTarget(h); } }
      break;
    case 'walk':
      if (walk(h, dt, (h.fast ? 1.5 * h.fast : 0.55) * sp) || h.t > 6) { h.fast = 0; h.t = 0; if (Math.random() < 0.6) { h.st = 'peck'; h.pecks = 2 + (Math.random() * 3 | 0); } else rest(h); }
      break;
    case 'toswim':
      if (!pond) { rest(h); break; }
      if (walk(h, dt, 0.7 * sp) || h.t > 9) { h.st = 'swim'; h.t = 0; h.dur = rnd(9, 18); h.sa = Math.atan2(h.z - pond.z, h.x - pond.x); }
      break;
    case 'swim': {                           // paddle slowly round the pond
      if (!pond || h.t > h.dur || feedAt || nap) { h.st = 'walk'; h.t = 0; h.fast = 0; pickTarget(h); break; }
      h.sa += dt * 0.5;
      const gx = pond.x + Math.cos(h.sa) * 0.42, gz = pond.z + Math.sin(h.sa) * 0.3, f = Math.min(1, dt * 2.5);
      h.x += (gx - h.x) * f; h.z += (gz - h.z) * f;
      let dy = Math.atan2(-Math.sin(h.sa) * 0.42, Math.cos(h.sa) * 0.3) - h.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); h.yaw += dy * Math.min(1, dt * 4);
      break; }
    case 'peck':
      if (h.t > h.pecks * 0.42) rest(h);
      break;
    case 'follow': {
      const far = Math.hypot(h.x - Y.x, h.z - Y.z);
      if (h.t > h.dur || dP > 5.5 || far > h.H.yard + 3.5 || (nap && dP > 3)) { rest(h); break; }
      if (dP > 0.85) { h.tx = P.x; h.tz = P.z; walk(h, dt, Math.min(1.7, 0.6 + dP * 0.45) * sp); }
      else { let dy = Math.atan2(P.x - h.x, P.z - h.z) - h.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); h.yaw += dy * Math.min(1, dt * 5); h.hpGoal = -0.35; }   // look up at you
      break; }
    case 'eat':
      if (!feedAt) { rest(h); break; }
      if (walk(h, dt, 1.7 * sp) || h.t > 5) { h.st = 'peck'; h.t = 0; h.pecks = 5 + (Math.random() * 3 | 0); }
      break;
    case 'tolay':
      if (walk(h, dt, 0.8) || h.t > 7) { h.st = 'lay'; h.t = 0; }
      break;
    case 'lay':
      if (h.t > 2.2) { layEgg(h); h.hop = 0.001; rest(h); }
      break;
    case 'tosleep':
      if (!nap) { rest(h); break; }
      if (walk(h, dt, 0.7 * sp) || h.t > 9) { h.st = 'sleep'; h.t = 0; h.yaw = rnd(-0.5, 0.5); }
      break;
    case 'sleep':
      if (!nap || dP < 1.6 || feedAt) { rest(h); h.hop = 0.001; if (Math.random() < 0.5) A.audio.play(voice(h), 0.4); break; }
      if (Math.random() < dt * 0.12) pop(nap === 'hungry' ? 'bowl' : 'zzz', h.x, 0.45 * h.size, h.z);
      break;
  }
}
function rest(h) { h.st = 'idle'; h.t = 0; h.dur0 = rnd(0.6, 2.6); h.hpGoal = 0; }

// ---------- how a hen holds itself (walk bob, peck, sit, hop) ----------
function pose(h, k, dt, el) {
  const s = h.size, sitGoal = h.st === 'sleep' || h.st === 'lay' || h.st === 'swim' ? 1 : 0;
  h.sit += (sitGoal - h.sit) * Math.min(1, dt * 6);
  let pitch = 0, hp = h.hpGoal || 0, legA = 0, bob = 0, headZ = 0, roll = 0;
  if (h.moving) { const w = Math.sin(h.ph); legA = w * 0.75; bob = Math.abs(w) * 0.012; headZ = Math.sin(h.ph * 2) * 0.022; roll = w * (h.duck ? 0.16 : 0.07) * (h.moving > 1 ? 1.6 : 1); pitch = h.moving > 1 ? 0.18 : 0.04; }
  if (h.st === 'peck') { const u = (h.t % 0.42) / 0.42, d = u < 0.35 ? u / 0.35 : u < 0.5 ? 1 : Math.max(0, 1 - (u - 0.5) / 0.3); pitch = 0.5 * d; hp = 0.85 * d; }
  if (h.st === 'lay') { roll = Math.sin(el * 14) * 0.09; pitch = -0.08; }
  if (h.st === 'sleep') { hp = 0.55; pitch = 0.05 + Math.sin(el * 1.6 + h.i) * 0.015; }
  // chickens look around in quick little snaps
  if (h.st === 'idle' || h.st === 'follow') { h.lookT -= dt; if (h.lookT <= 0) { h.lookT = rnd(0.4, 1.4); h.hyGoal = h.st === 'follow' ? rnd(-0.25, 0.25) : rnd(-0.9, 0.9); } } else h.hyGoal = 0;
  h.hy += (h.hyGoal - h.hy) * Math.min(1, dt * 18);
  h.pitch += (pitch - h.pitch) * Math.min(1, dt * 16); h.hp += (hp - h.hp) * Math.min(1, dt * 16);
  let y = 0; if (h.hop > 0) { h.hop += dt; const u = h.hop / 0.38; if (u >= 1) h.hop = 0; else { y = Math.sin(u * Math.PI) * 0.2; roll += Math.sin(u * 30) * 0.2; } }
  const R = rig;
  R.root.position.set(h.x, A.groundY(h.x, h.z) + (y - h.sit * 0.11) * s, h.z); R.root.rotation.set(0, h.yaw, 0); R.root.scale.setScalar(s);
  R.body.position.y = 0.27 + bob; R.body.rotation.set(h.pitch, 0, roll);
  R.head.rotation.set(h.hp - h.pitch * 0.6, h.hy, -roll * 0.7); R.head.position.z = 0.12 + headZ;
  R.legL.rotation.x = legA; R.legR.rotation.x = -legA;
  R.root.updateMatrixWorld(true);
  meshes.body.setMatrixAt(k, R.body.matrixWorld); meshes.head.setMatrixAt(k, R.head.matrixWorld); meshes.face.setMatrixAt(k, h.duck ? ZERO.m : R.head.matrixWorld); meshes.bill.setMatrixAt(k, h.duck ? R.head.matrixWorld : ZERO.m);
  meshes.comb.setMatrixAt(k, h.chick || h.duck ? ZERO.m : R.head.matrixWorld);
  meshes.legL.setMatrixAt(k, R.legL.matrixWorld); meshes.legR.setMatrixAt(k, R.legR.matrixWorld);
}

// ---------- eggs ----------
function layEgg(h) {
  const a = st();
  h.b.prog = 0; a[h.H.nestKey] = eggsOf(h.H) + 1;
  const lv = near(h.x, h.z);
  A.audio.play('eggPop', lv); A.audio.play(voice(h), lv * 0.8);
  pop('egg', h.x, 0.55, h.z); drawEggs(); A.commit();
}
const near = (x, z) => Math.max(0, Math.min(1, 1.25 - Math.hypot(A.player.pos.x - x, A.player.pos.z - z) / 9));
// eggs waiting: in the coop's nest box, and in the reed nest by the pond
function drawEggs() {
  if (!eggMesh) return;
  const m = new THREE.Matrix4(), col = new THREE.Color(); let n = 0;
  if (C) { const N = C.nest, t = Math.min(eggsOf(HOMES.coop), 9);
    for (let i = 0; i < t; i++) { m.makeTranslation(N.x - 0.1 + (i % 3) * 0.1, N.y + (i > 5 ? 0.07 : 0), N.z - 0.13 + ((i / 3 | 0) % 2) * 0.16 + (i > 5 ? 0.08 : 0)); eggMesh.setMatrixAt(n, m); eggMesh.setColorAt(n++, col.set('#ffffff')); } }
  if (pond) { const N = pond.nest, t = Math.min(eggsOf(HOMES.pond), 9);
    for (let i = 0; i < t; i++) { const g = i * 2.1, r = i ? 0.07 + (i % 3) * 0.03 : 0; m.makeTranslation(N.x + Math.cos(g) * r, N.y - 0.02 + (i > 5 ? 0.06 : 0), N.z + Math.sin(g) * r); eggMesh.setMatrixAt(n, m); eggMesh.setColorAt(n++, col.set('#c4e6d6')); } }
  eggMesh.count = n; eggMesh.instanceMatrix.needsUpdate = true;
  if (eggMesh.instanceColor) eggMesh.instanceColor.needsUpdate = true;
  drawTags();
}
function drawFill() {
  for (const Hm of Object.values(HOMES)) {
    const f = Hm.fill; if (!f) continue;
    f.visible = !!Hm.at && feedOf(Hm) > 0; if (!f.visible) continue;
    f.position.set(Hm.at.trough.x, Hm.at.y + (Hm.duck ? 0.06 : 0.085), Hm.at.trough.z); f.rotation.y = (Hm.at.r || 0) * Math.PI / 2; f.scale.y = Math.max(0.08, feedOf(Hm) / troughCapOf(Hm));
  }
}
function takeNest(Hm) {
  const a = st(), n = eggsOf(Hm); if (!n) return;
  a[Hm.nestKey] = 0; A.addItem(Hm.egg, n); A.addXP(n); A.audio.play('harvest'); pop('plus', A.player.pos.x, 1.5, A.player.pos.z, n);
  A.renderHotbar(); drawEggs(); A.commit();
}

// ---------- the pop-up action button (only when nothing else wants it): Collect, Pet, Feed ----------
export function pickUse() {
  if (!ready || (!C && !pond) || A.busy()) return null;
  const P = A.player.pos, homes = Object.values(HOMES).filter(Hm => Hm.at);
  for (const Hm of homes) if (eggsOf(Hm) > 0 && Math.hypot(P.x - Hm.at.nest.x, P.z - Hm.at.nest.z) < Hm.reach) return { kind: 'collect', key: 'eggs' + Hm.key, icon: 'egg', label: 'Collect', go: () => takeNest(Hm) };
  // an empty trough comes before petting, so hungry birds crowding you never hide the Feed button
  const canFeed = ANIMALS.feed.eats.some(id => A.invCount(id) > 0);
  if (canFeed) for (const Hm of homes) if (birdsOf(Hm).length && feedOf(Hm) <= 0 && Math.hypot(P.x - Hm.at.trough.x, P.z - Hm.at.trough.z) < Hm.reach + 0.4) return { kind: 'collect', key: 'feed' + Hm.key, icon: 'feed', label: 'Feed', go: () => feed(Hm) };
  let best = null, bd = 0.95;
  for (const h of hens) { const d = Math.hypot(h.x - P.x, h.z - P.z); if (d < bd && h.petCd <= 0) { bd = d; best = h; } }
  if (best) return { kind: 'collect', key: 'pet' + best.i, icon: 'heart', label: 'Pet', go: () => pet(best) };
  for (const Hm of homes) if (birdsOf(Hm).length && troughCapOf(Hm) - feedOf(Hm) >= 1 && Math.hypot(P.x - Hm.at.trough.x, P.z - Hm.at.trough.z) < Hm.reach + 0.4) {
    if (canFeed) return { kind: 'collect', key: 'feed' + Hm.key, icon: 'feed', label: 'Feed', go: () => feed(Hm) };
    if (feedOf(Hm) <= 0) return { kind: 'needtool', key: 'nofeed' + Hm.key, icon: 'feed', label: 'Feed', go: () => A.toast(`${Hm.duck ? 'Ducks' : 'Chickens'} eat wheat, corn or Nell\u2019s chicken feed`) };
  }
  for (const Hm of homes) if (Math.hypot(P.x - Hm.at.x, P.z - Hm.at.z) < (Hm.duck ? 1.9 : 2.3)) return { kind: 'collect', key: 'card' + Hm.key, icon: Hm.duck ? 'pond' : 'coop', label: Hm.duck ? 'Pond' : 'Coop', go: () => openCard(Hm) };
  return null;
}
function pet(h) {
  const b = h.b, now = Date.now(), k = clock(), fed = feedOf(h.H) > 0;
  h.petCd = 8; h.hop = 0.001; if (h.st === 'sleep' || h.st === 'tosleep' || h.st === 'swim' || h.st === 'toswim') rest(h);
  A.audio.play(voice(h));
  if (fed && b.hearts < 3 && now - b.petAt >= k.heart) { b.hearts++; b.petAt = now; A.commit(); }   // a fed bird gains a heart, once a day
  else if (fed && now - b.petAt >= k.heart) { b.petAt = now; }                                       // keeps full hearts from fading
  pop('hearts', h.x, 0.75 * h.size, h.z, b.hearts);
  if (h.st !== 'lay' && h.st !== 'tolay') { h.st = 'follow'; h.t = 0; h.dur = 5; }
}
// pour feed into a home's trough or bowl: Nell's feed first, then wheat, then corn; up to 6 a tap
function feed(Hm) {
  advance(Date.now());
  const a = st(); let room = Math.min(ANIMALS.feed.pour, Math.floor(troughCapOf(Hm) - feedOf(Hm))), used = 0;
  for (const id of ANIMALS.feed.eats) { const n = Math.min(room, A.invCount(id)); if (n > 0) { A.addItem(id, -n); room -= n; used += n; } }
  if (!used) return;
  a[Hm.feedKey] = feedOf(Hm) + used;
  const T = Hm.at.trough, at = { x: T.x, z: T.z }; Hm.feedAt = at; feedT = 7;
  const pa = grain.geometry.attributes.position;
  for (let i = 0; i < 16; i++) { const px = T.x + rnd(-0.5, 0.5), pz = T.z + rnd(0.15, 0.7); pa.setXYZ(i, px, A.groundY(px, pz) + 0.03, pz); }
  pa.needsUpdate = true; A.audio.play('plant'); pop('plus', A.player.pos.x, 1.5, A.player.pos.z, used);
  drawFill(); drawTags(); A.renderHotbar(); A.commit();
  setTimeout(() => { if (Hm.feedAt === at) Hm.feedAt = null; }, 6500);
}

// ---------- the home card: tap the coop or the pond (or use the Coop / Pond button beside it) ----------
// Mac: "I should be able to click on the coop and pond to see more info like levels, chickens and eggs, and to level it up."
let card = null, ray = null;
export function tap(x, y) {
  if (!ready || (!C && !pond) || A.busy() || card) return false;
  if (!ray) ray = { r: new THREE.Raycaster(), n: new THREE.Vector2(), b: new THREE.Box3() };
  ray.n.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.r.setFromCamera(ray.n, A.camera);
  for (const Hm of Object.values(HOMES)) { const at = Hm.at; if (!at) continue;
    const hw = at.hw, hz = at.hz, hh = Hm.duck ? 0.25 : at.s.up + at.s.T * 1.5;
    ray.b.min.set(at.x - hw, at.y, at.z - hz); ray.b.max.set(at.x + hw, at.y + hh, at.z + hz);
    if (ray.r.ray.intersectsBox(ray.b)) { openCard(Hm); return true; } }
  return false;
}
const span = (ms) => (ms < 90e3 ? Math.max(1, Math.round(ms / 1000)) + 's' : ms < 5400e3 ? Math.round(ms / 60e3) + ' min' : Math.round(ms / 3600e3) + ' h');
const hearts = (n) => [0, 1, 2].map(i => `<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="${i < n ? '#ff6f7d' : '#fff'}" stroke="#2b2140" stroke-width="2.4" stroke-linejoin="round"/></svg>`).join('');
const coinPic = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#f4c542" stroke="#2b2140" stroke-width="2.4"/><circle cx="12" cy="12" r="4" fill="none" stroke="#2b2140" stroke-width="2"/></svg>';
function openCard(Hm) {
  if (card) closeCard();
  const el = document.createElement('div'); el.id = 'henCard';
  document.body.appendChild(el); card = { el, Hm, html: '' };
  for (const ev of ['pointerdown', 'pointerup', 'pointermove', 'touchstart']) el.addEventListener(ev, e => e.stopPropagation());
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-x]')) { closeCard(); return; }
    if (e.target.closest('[data-up]')) upgrade(card.Hm);
  });
  A.audio.play('popOpen'); paintCard();
}
function closeCard() { if (card) { card.el.remove(); card = null; A.audio.play('popClose'); } }
function paintCard() {
  const Hm = card.Hm, a = st(), k = clock(), now = Date.now(), lv = lvOf(Hm), max = Hm.sizes.length, birds = birdsOf(Hm), adults = birds.filter(b => !b.chick), n = birds.length;
  if (!Hm.rec()) { closeCard(); return; }
  const eggs = eggsOf(Hm), cap = nestCapOf(Hm), food = feedOf(Hm), who = Hm.duck ? 'duck' : 'hen';
  const pips = Hm.sizes.map((_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
  const chips = birds.map(b => `<span class="bd"><img src="${birdPicture(b.chick, Hm.duck)}" width="34" height="34" alt="${b.chick ? 'baby' : who}">${b.chick ? `<small>${span(Math.max(0, k.grow - (now - b.born)))}</small>` : `<span class="hh" aria-label="${b.hearts} of 3 hearts">${hearts(b.hearts)}</span>`}</span>`).join('')
    + Array.from({ length: Math.max(0, Hm.holds() - n) }, () => '<span class="bd free" aria-label="free place"></span>').join('');
  let next = '';
  if (!n) next = `Nell sells ${who}s`;
  else if (!adults.length) next = 'Babies lay when they grow up';
  else if (food <= 0) next = 'Hungry: feed them to get eggs';
  else if (eggs >= cap) next = 'Nest is full: collect the eggs';
  else next = 'Next egg in ' + span(Math.max(0, Math.min(...adults.map(b => (Hm.duck ? k.dlay : k.lay) / ANIMALS.heartSpeed[b.hearts] - b.prog))));
  const lasts = n && food > 0 ? 'lasts ' + span(food / n * k.hour) : n ? 'empty' : '';
  let up = `<div class="up done">${A.svg('check', '#2f7d32', 20, 3)} Biggest size</div>`;
  if (lv < max) { const u = Hm.bigger[lv - 1], lock = A.S.level < u.level, poor = A.S.coins < u.cost;
    up = `<button class="up" data-up ${lock || poor ? 'disabled' : ''} aria-label="Make it bigger: holds ${Hm.sizes[lv]}, ${u.cost} coins${lock ? ', needs town level ' + u.level : ''}"><img src="${Hm.pic(lv + 1)}" width="44" height="44" alt=""><span class="ut"><b>Bigger: holds ${Hm.sizes[lv]}</b><small>${lock ? 'Town level ' + u.level : poor ? 'Not enough coins yet' : 'Tap to build'}</small></span><span class="pr">${coinPic}${u.cost.toLocaleString()}</span></button>`; }
  const html = `<div class="cd"><button class="x" data-x aria-label="Close">✕</button>
<div class="hd"><img src="${Hm.pic(lv)}" width="56" height="56" alt=""><div><h2>${Hm.name}</h2><div class="lv">Level ${lv} <span class="pips">${pips}</span></div></div></div>
<div class="rw"><span class="ic">${A.svg(Hm.icon, '#2b2140', 24, 2.4)}</span><b class="big">${n}/${Hm.holds()}</b><div class="bds">${chips}</div></div>
<div class="rw"><span class="ic"><img src="${A.cropIcon[Hm.egg]}" width="26" height="26" alt="eggs"></span><b class="big">${eggs}</b><span class="tx">${next}</span></div>
<div class="rw"><span class="ic">${A.svg('feed', '#2b2140', 24, 2.4)}</span><span class="bar"><i style="width:${Math.round(Math.min(1, food / troughCapOf(Hm)) * 100)}%"></i></span><span class="tx">${lasts}</span></div>
${up}</div>`;
  if (html !== card.html) { card.html = html; card.el.innerHTML = html; }
  void a;
}
function upgrade(Hm) {
  const a = st(), lv = lvOf(Hm), u = Hm.bigger[lv - 1], S = A.S;
  if (!u || S.level < u.level || S.coins < u.cost) return;
  S.coins -= u.cost; a[Hm.lvKey] = lv + 1; A.audio.play('buy');
  const rec = Hm.rec(); if (rec) A.respawnDecor(rec);
  sig = ''; sync(); A.renderHotbar(); A.commit(); A.audio.play('levelUp');
  A.toast(`Your ${Hm.duck ? 'pond' : 'coop'} now holds ${Hm.holds()}`); paintCard();
}

// ---------- little pictures that float up: hearts, eggs, Zzz, +3 ----------
const tex = {};
function picture(kind, n) {
  const key = kind + (n || ''); if (tex[key]) return tex[key];
  const c = document.createElement('canvas'); c.width = c.height = 128; const k = c.getContext('2d');
  k.lineJoin = 'round'; k.lineCap = 'round'; k.lineWidth = 9; k.strokeStyle = '#2b2140';
  if (kind === 'heart') { k.fillStyle = '#ff6f7d'; k.beginPath(); k.moveTo(64, 108); k.bezierCurveTo(8, 70, 16, 22, 44, 22); k.bezierCurveTo(56, 22, 64, 32, 64, 40); k.bezierCurveTo(64, 32, 72, 22, 84, 22); k.bezierCurveTo(112, 22, 120, 70, 64, 108); k.fill(); k.stroke(); }
  else if (kind === 'hearts') { for (let i = 0; i < 3; i++) { k.save(); k.translate(8 + i * 40, 40); k.scale(0.36, 0.36); k.fillStyle = i < n ? '#ff6f7d' : '#ffffff'; k.lineWidth = 18; k.beginPath(); k.moveTo(64, 108); k.bezierCurveTo(8, 70, 16, 22, 44, 22); k.bezierCurveTo(56, 22, 64, 32, 64, 40); k.bezierCurveTo(64, 32, 72, 22, 84, 22); k.bezierCurveTo(112, 22, 120, 70, 64, 108); k.fill(); k.stroke(); k.restore(); } }
  else if (kind === 'bowl') { k.fillStyle = '#fffdf5'; k.beginPath(); k.moveTo(22, 58); k.lineTo(106, 58); k.lineTo(92, 100); k.lineTo(36, 100); k.closePath(); k.fill(); k.stroke(); k.strokeStyle = '#e2574c'; k.beginPath(); k.moveTo(64, 14); k.lineTo(64, 36); k.stroke(); k.beginPath(); k.arc(64, 48, 2, 0, 6.3); k.stroke(); }
  else if (kind === 'zzz') { k.font = '700 78px system-ui, sans-serif'; k.textAlign = 'center'; k.textBaseline = 'middle'; k.strokeText('z', 44, 80); k.fillStyle = '#fff'; k.fillText('z', 44, 80); k.font = '700 54px system-ui, sans-serif'; k.strokeText('z', 92, 40); k.fillText('z', 92, 40); }
  else { const ex = kind === 'plus' ? 40 : 64; k.fillStyle = '#fff3dc'; k.beginPath(); k.ellipse(ex, 68, kind === 'plus' ? 26 : 34, kind === 'plus' ? 34 : 44, 0, 0, 6.3); k.fill(); k.stroke();
    if (kind === 'plus') { k.font = '700 64px system-ui, sans-serif'; k.textAlign = 'left'; k.textBaseline = 'middle'; k.strokeText('' + n, 74, 70); k.fillStyle = '#fff'; k.fillText('' + n, 74, 70); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (tex[key] = t);
}
function pop(kind, x, y, z, n) {
  let f = fx.find(o => o.t <= 0);
  if (!f) { if (fx.length >= 10) return; f = { s: new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })), t: 0 }; f.s.renderOrder = 5; A.scene.add(f.s); fx.push(f); }
  f.s.material.map = picture(kind, n); f.s.material.needsUpdate = true; f.t = kind === 'plus' ? 1.3 : 1.1; f.d = f.t;
  f.s.position.set(x, A.groundY(x, z) + y, z); f.big = kind === 'plus' || kind === 'hearts' ? 0.6 : kind === 'zzz' || kind === 'bowl' ? 0.3 : 0.34; f.s.visible = true;
}
function tickFx(dt) {
  for (const f of fx) { if (f.t <= 0) continue; f.t -= dt; const u = 1 - f.t / f.d; f.s.position.y += dt * 0.45; const sc = f.big * Math.min(1, u * 6); f.s.scale.set(sc, sc, 1); f.s.material.opacity = Math.min(1, f.t * 3); if (f.t <= 0) f.s.visible = false; }
}
// pictures for Nell's list and the bag, drawn once
const pics = {};
function draw(size, fn) { const c = document.createElement('canvas'); c.width = c.height = size; const k = c.getContext('2d'); k.strokeStyle = '#2b2140'; k.lineJoin = 'round'; k.lineCap = 'round'; fn(k); return c.toDataURL(); }
function birdPicture(chick, duck) {
  const key = 'b' + chick + !!duck;
  return pics[key] || (pics[key] = draw(128, k => {
    k.lineWidth = 3; k.lineJoin = 'round'; k.lineCap = 'round';
    const legs = (x1, x2) => { k.strokeStyle = '#f29b2c'; k.beginPath(); k.moveTo(x1, 0); k.lineTo(x1, 9); k.moveTo(x2, 0); k.lineTo(x2, 9); k.moveTo(x1 - 4, 9); k.lineTo(x1 + 3, 9); k.moveTo(x2 - 4, 9); k.lineTo(x2 + 3, 9); k.stroke(); k.strokeStyle = '#2b2140'; };
    const wingTail = (wx) => { k.beginPath(); k.moveTo(wx - 12, -14); k.quadraticCurveTo(wx, -2, wx + 12, -14); k.stroke(); k.beginPath(); k.moveTo(-24, -30); k.lineTo(-27, -38); k.moveTo(-21, -32); k.lineTo(-21, -41); k.stroke(); };
    const ROUND = 'M-26 -22 q-6 -16 6 -12 q10 -8 30 -2 q2 -8 12 -8 q12 0 12 12 q0 8 -6 12 q-2 20 -24 20 q-26 0 -30 -22z';
    if (chick) {   // chicks and ducklings: the round baby shape, unchanged
      k.translate(58, 92); k.scale(1.25, 1.25); legs(-6, 6);
      k.fillStyle = ANIMALS.chickColor; const body = new Path2D(ROUND); k.fill(body); k.stroke(body);
      k.fillStyle = '#f29b2c'; const beak = new Path2D(duck ? 'M33 -27 h13 q5 3 0 7 h-13z' : 'M34 -24 l10 3 -10 4z'); k.fill(beak); k.stroke(beak);
      k.fillStyle = '#2b2140'; k.beginPath(); k.arc(26, -24, 2.6, 0, 6.3); k.fill();
    } else if (duck) {   // v0.1.163 (Mac: "I would like the duck's neck longer", "duck 1 but make it fill the tile more")
      k.translate(51, 109); k.scale(1.8, 1.8); legs(-8, 4);
      k.fillStyle = '#fffaf0'; const body = new Path2D('M-26 -20 q-6 -14 6 -11 q12 -6 22 0 q6 -2 6 -12 q-2 -12 10 -12 q11 0 11 11 q0 8 -7 10 q-3 3 -2 12 q-2 22 -24 22 q-20 0 -22 -20z'); k.fill(body); k.stroke(body);
      wingTail(-3);
      k.fillStyle = '#f29b2c'; const beak = new Path2D('M28 -49 h8 q5 3 0 7 h-8z'); k.fill(beak); k.stroke(beak);
      k.fillStyle = '#2b2140'; k.beginPath(); k.arc(21, -47, 2.6, 0, 6.3); k.fill();
    } else {   // v0.1.163 (Mac, hen B bigger): the comb sits on top of the head, the wattle under the beak, and the whole hen fits the picture
      k.translate(49, 102); k.scale(1.72, 1.72); legs(-6, 6);
      k.fillStyle = '#e2463c'; const comb = new Path2D('M15 -40 q2 -10 6 -2 q3 -10 7 -1 q4 -8 6 3 q-9 4 -19 0z'); k.fill(comb); k.stroke(comb);
      k.fillStyle = '#fffaf0'; const body = new Path2D(ROUND); k.fill(body); k.stroke(body);
      wingTail(0);
      k.fillStyle = '#f29b2c'; const beak = new Path2D('M33 -28 l10 3.5 -10 3.5z'); k.fill(beak); k.stroke(beak);
      k.fillStyle = '#e2463c'; k.beginPath(); k.ellipse(31, -17, 2.6, 4.2, 0, 0, 6.3); k.fill(); k.stroke();
      k.fillStyle = '#2b2140'; k.beginPath(); k.arc(25, -28, 2.6, 0, 6.3); k.fill();
    }
  }));
}
function coopPicture(lv) {
  return pics['c' + lv] || (pics['c' + lv] = draw(128, k => {
    const w = lv === 1 ? 30 : 46; k.lineWidth = 5; k.translate(64, 6);
    k.beginPath(); k.moveTo(-w + 6, 110); k.lineTo(-w + 6, 96); k.moveTo(w - 6, 110); k.lineTo(w - 6, 96); k.stroke();
    k.fillStyle = '#b98a5a'; k.beginPath(); k.rect(-w, 52, w * 2, 46); k.fill(); k.stroke();
    k.fillStyle = lv === 3 ? '#e2574c' : '#3fb7a5'; k.beginPath(); k.moveTo(-w - 10, 56); k.lineTo(0, lv === 3 ? 6 : 16); k.lineTo(w + 10, 56); k.closePath(); k.fill(); k.stroke();
    k.fillStyle = '#7a4a2a'; k.beginPath(); k.moveTo(-w / 2 - 10, 98); k.lineTo(-w / 2 - 10, 78); k.arc(-w / 2, 78, 10, Math.PI, 0); k.lineTo(-w / 2 + 10, 98); k.closePath(); k.fill(); k.stroke();
    if (lv > 1) { k.fillStyle = '#dff3ff'; k.beginPath(); k.rect(w / 2 - 8, 66, 16, 14); k.fill(); k.stroke(); }
  }));
}
function pondPicture(lv) {
  return pics['p' + lv] || (pics['p' + lv] = draw(128, k => { k.lineWidth = 5; k.fillStyle = '#9aa3a8'; k.beginPath(); k.ellipse(64, 74, 54, 34, 0, 0, 6.3); k.fill(); k.stroke();
    k.fillStyle = '#6ec6ea'; k.beginPath(); k.ellipse(64, 72, 42, 24, 0, 0, 6.3); k.fill(); k.stroke(); k.strokeStyle = '#ffffff'; k.lineWidth = 4; k.beginPath(); k.moveTo(46, 70); k.quadraticCurveTo(54, 62, 62, 70); k.quadraticCurveTo(70, 78, 78, 70); k.stroke();
    if (lv > 1) { k.strokeStyle = '#2b2140'; k.lineWidth = 3; k.fillStyle = '#5aa54a'; for (const [x, y] of [[40, 80], [88, 64], [74, 86]]) { k.beginPath(); k.ellipse(x, y, 9, 6, 0, 0.5, 6.1); k.lineTo(x, y); k.closePath(); k.fill(); k.stroke(); } } }));
}
// the duck pond: a little round pool with a stone rim and reeds (made in code)
function buildPond(lv = 1) {
  const g = new THREE.Group(), mat = (color, o) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o });
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.05, 16), mat(0x58bfe8, { roughness: 0.25 })); water.position.y = 0.035; water.scale.z = 0.8; g.add(water);
  const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.04, 16), mat(0xcdb98a)); bed.position.y = 0.02; bed.scale.z = 0.8; g.add(bed);
  const stone = new THREE.DodecahedronGeometry(0.11, 0), sm = mat(0x9aa3a8);
  for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283 + 0.2, m = new THREE.Mesh(stone, sm); m.position.set(Math.cos(a) * 0.9, 0.05, Math.sin(a) * 0.72); m.rotation.set(i, i * 2, 0); m.scale.setScalar(0.8 + (i % 3) * 0.2); g.add(m); }
  const rm = mat(0x5aa54a); for (const [x, z, h] of [[-0.8, -0.55, 0.5], [-0.7, -0.62, 0.36], [0.82, -0.5, 0.42]]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.035, h, 0.035), rm); r.position.set(x, h / 2, z); r.rotation.z = x * 0.12; g.add(r); }
  if (lv > 1) {                                                // the bigger pond: lily pads, a flower and more reeds
    const pad = new THREE.CylinderGeometry(0.13, 0.13, 0.015, 9), pm = mat(0x4f9a44);
    for (const [x, z, sc] of [[-0.35, -0.2, 1], [0.3, 0.18, 1.2], [0.42, -0.28, 0.8], [-0.1, 0.3, 0.9]]) { const l = new THREE.Mesh(pad, pm); l.position.set(x, 0.068, z); l.scale.setScalar(sc); g.add(l); }
    const fl = new THREE.Mesh(new THREE.DodecahedronGeometry(0.05, 0), mat(0xff9fc0)); fl.position.set(0.3, 0.1, 0.18); g.add(fl);
    for (const [x, z, h] of [[0.9, -0.62, 0.5], [0.72, -0.66, 0.34], [0.05, -0.74, 0.44]]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.035, h, 0.035), rm); r.position.set(x, h / 2, z); g.add(r); }
  }
  // the ducks' reed nest (front left) and their feed bowl (front right)
  const nest = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.07, 9), mat(0xd9b860)); nest.position.set(-0.76, 0.035, 0.78); g.add(nest);
  for (const [x, z, h] of [[-0.95, 0.66, 0.34], [-0.6, 0.62, 0.28], [-0.97, 0.86, 0.4]]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.035, h, 0.035), rm); r.position.set(x, h / 2, z); g.add(r); }
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.07, 10), mat(0x9a7450)); bowl.position.set(0.76, 0.035, 0.8); g.add(bowl);
  return g;
}
function feedPicture() {
  return pics.f || (pics.f = draw(128, k => { k.lineWidth = 5; k.fillStyle = '#e9d3a6'; k.beginPath(); k.moveTo(36, 36); k.lineTo(92, 36); k.lineTo(102, 110); k.lineTo(26, 110); k.closePath(); k.fill(); k.stroke();
    k.beginPath(); k.moveTo(44, 36); k.quadraticCurveTo(64, 10, 84, 36); k.fill(); k.stroke(); k.fillStyle = '#f2c94c'; k.beginPath(); k.arc(64, 74, 15, 0, 6.3); k.fill(); k.stroke(); }));
}

// ---------- on-screen bits: a small tag over each home (eggs waiting, empty trough, how many birds), and the TRY panel ----------
function buildUI() {
  const css = document.createElement('style');
  css.textContent = `
.henTag { position: fixed; z-index: 6; transform: translate(-50%, -100%); pointer-events: none; display: none; }
.henTag[data-on="1"] { display: block; }
.henTag .sb { display: flex; align-items: center; gap: 5px; background: #fffdf5; border: 2px solid #2b2140; border-radius: 12px; padding: 3px 7px 3px 5px; box-shadow: 0 3px 0 rgba(43,33,64,.3); font: 700 15px/1 Fredoka, system-ui, sans-serif; color: #2b2140; white-space: nowrap; }
.henTag svg, .henTag img { display: block; }   /* small and still, like the crop tags (Mac: the big bouncing bubble was very distracting) */
.henTag .sb > span { display: flex; align-items: center; gap: 3px; height: 18px; } .henTag .sb > span[hidden] { display: none; }
.henTag .cnt { font-size: 13px; } .henTag .nofeed { position: relative; }
.henTag .nofeed i { position: absolute; right: -3px; top: -1px; width: 7px; height: 7px; border-radius: 50%; background: #e2574c; border: 1.5px solid #2b2140; }
#henCard { position: fixed; inset: 0; z-index: 20; display: flex; align-items: flex-end; justify-content: center; padding: 0 10px calc(12px + env(safe-area-inset-bottom)); box-sizing: border-box; font-family: Fredoka, system-ui, sans-serif; color: #2b2140; }
#henCard .cd { position: relative; width: 100%; max-width: 420px; background: #fffdf5; border: 3px solid #2b2140; border-radius: 22px; box-shadow: 0 6px 0 rgba(43,33,64,.25); padding: 12px 14px 14px; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; }
#henCard .x { position: absolute; right: 10px; top: 10px; width: 44px; height: 44px; border-radius: 50%; border: 2px solid #2b2140; background: #fff; font-size: 18px; font-weight: 700; color: #2b2140; padding: 0; }
#henCard .hd { display: flex; align-items: center; gap: 10px; padding-right: 50px; } #henCard h2 { margin: 0; font-size: 20px; font-weight: 700; line-height: 1.1; }
#henCard .lv { font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; margin-top: 3px; }
#henCard .pips { display: inline-flex; gap: 4px; } #henCard .pips i { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #2b2140; background: #fff; box-sizing: border-box; } #henCard .pips i.on { background: #ffd84d; }
#henCard .rw { display: flex; align-items: center; gap: 8px; min-height: 40px; }
#henCard .ic { width: 30px; flex: none; display: flex; justify-content: center; } #henCard .big { font-size: 24px; font-weight: 700; min-width: 34px; }
#henCard .tx { font-size: 15px; font-weight: 600; color: #54496b; }
#henCard .bds { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; min-width: 0; }
#henCard .bd { width: 40px; height: 52px; border-radius: 10px; background: #fff3dc; border: 2px solid #2b2140; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
#henCard .bd.free { background: none; border-style: dashed; border-color: #b9afc6; } #henCard .bd small { font-size: 10px; font-weight: 700; line-height: 1; } #henCard .hh { display: flex; line-height: 0; margin-top: -2px; } #henCard .hh svg { width: 11px; height: 11px; }
#henCard .bar { flex: 1; height: 16px; border-radius: 999px; border: 2px solid #2b2140; background: #fff; overflow: hidden; } #henCard .bar i { display: block; height: 100%; background: #f2c94c; }
#henCard .up { display: flex; align-items: center; gap: 10px; min-height: 60px; width: 100%; border-radius: 16px; border: 3px solid #2b2140; background: #7cc957; color: #2b2140; font-family: inherit; padding: 6px 12px; box-sizing: border-box; box-shadow: 0 4px 0 rgba(43,33,64,.25); text-align: left; }
#henCard .up:disabled { background: #e6dfd2; box-shadow: none; } #henCard .up.done { background: #e9f5df; box-shadow: none; justify-content: center; font-size: 16px; font-weight: 700; min-height: 44px; }
#henCard .ut { flex: 1; min-width: 0; display: flex; flex-direction: column; } #henCard .ut b { font-size: 17px; } #henCard .ut small { font-size: 13px; font-weight: 600; }
#henCard .pr { display: flex; align-items: center; gap: 4px; font-size: 20px; font-weight: 700; }
body.in-store #henCard { display: none !important; }
#henTry { position: fixed; left: 10px; top: 38%; z-index: 7; width: 48px; height: 48px; border-radius: 50%; border: 3px solid #2b2140; background: #ffd84d; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 0 rgba(43,33,64,.25); padding: 0; }
#henPanel { position: fixed; left: 10px; top: calc(38% + 56px); z-index: 7; background: #fffdf5; border: 3px solid #2b2140; border-radius: 18px; padding: 10px; box-shadow: 0 5px 0 rgba(43,33,64,.25); font: 700 13px Fredoka, system-ui, sans-serif; color: #2b2140; width: 200px; }
#henPanel .r { display: flex; gap: 6px; margin: 4px 0 10px; }
#henPanel button { flex: 1; min-height: 46px; border-radius: 12px; border: 3px solid #2b2140; background: #fff; font: 700 15px Fredoka, system-ui, sans-serif; color: #2b2140; display: flex; align-items: center; justify-content: center; padding: 0 4px; }
#henPanel button[aria-pressed="true"] { background: #ffd84d; }
#henPanel .fps { float: right; font-size: 13px; }
body.in-store .henTag, body.in-store #henTry, body.in-store #henPanel { display: none !important; }`;
  document.head.appendChild(css);
  for (const Hm of Object.values(HOMES)) {
    const t = document.createElement('div'); t.className = 'henTag'; t.setAttribute('aria-hidden', 'true');
    t.innerHTML = `<div class="sb"><span class="eggs"><img src="${A.cropIcon[Hm.egg]}" width="18" height="18" alt=""><b>0</b></span><span class="nofeed">${A.svg('feed', '#2b2140', 17, 2.4)}<i></i></span><span class="cnt">${A.svg(Hm.icon, '#2b2140', 15, 2.4)}<b></b></span></div>`;
    document.body.appendChild(t); Hm.tag = t;
  }
  if (!TRY) return;
  const btn = document.createElement('button'); btn.id = 'henTry'; btn.setAttribute('aria-label', 'Chicken try-out settings'); btn.innerHTML = A.svg('hen', '#2b2140', 28, 2.4);
  panel = document.createElement('div'); panel.id = 'henPanel'; panel.hidden = true;
  document.body.append(btn, panel);
  btn.addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden) drawPanel(); });
  for (const el of [btn, panel]) for (const ev of ['pointerdown', 'pointerup', 'pointermove', 'touchstart']) el.addEventListener(ev, e => e.stopPropagation());
}
// eggs waiting show at any distance (like ripe crops); an empty trough by day; how many birds live there once you're nearby
function drawTags() {
  const P = A.player.pos, night = A.currentTOD() === 'night';
  for (const Hm of Object.values(HOMES)) {
    const t = Hm.tag; if (!t) continue;
    if (!Hm.at) { t.dataset.on = ''; continue; }
    const n = birdsOf(Hm).length, eggs = eggsOf(Hm), close = Math.hypot(P.x - Hm.at.x, P.z - Hm.at.z) < 4, hungry = n > 0 && feedOf(Hm) <= 0 && !night;
    t.querySelector('.eggs').hidden = !eggs; t.querySelector('.eggs b').textContent = eggs;
    t.querySelector('.nofeed').hidden = !hungry;
    t.querySelector('.cnt').hidden = !close; t.querySelector('.cnt b').textContent = n + '/' + Hm.holds();
    t.dataset.on = eggs || hungry || close ? '1' : '';
  }
}
function placeTags() {
  for (const Hm of Object.values(HOMES)) {
    const t = Hm.tag; if (!t || t.dataset.on !== '1' || !Hm.at) continue;
    _v.p.set(Hm.at.x, Hm.at.y + Hm.at.top, Hm.at.z).project(A.camera);
    t.style.left = ((_v.p.x * 0.5 + 0.5) * innerWidth) + 'px'; t.style.top = ((-_v.p.y * 0.5 + 0.5) * innerHeight) + 'px';
    t.style.visibility = _v.p.z < 1 ? 'visible' : 'hidden';
  }
}
// TRY: shortcuts for the try-out build only
function drawPanel() {
  const a = st(), b = (on, html, act, label) => `<button aria-pressed="${on}" data-a="${act}" aria-label="${label}">${html}</button>`;
  panel.innerHTML = `TRY · chickens <span class="fps"></span>
<div class="r">${b(false, 'Free starter set', 'kit', 'A free coop, two hens, a chick and feed')}</div>
<div class="r">${b(false, 'Free ducks + pond', 'ducks', 'A free pond, a duck, a duckling and feed')}</div>
<div class="r">${b(false, '+1,000 coins', 'coins', 'Add 1,000 coins')}${b(false, 'Level 4', 'lv', 'Jump to town level 4')}</div>
Clock
<div class="r" style="margin-bottom:0">${b(!a.fast, 'Real', 'f0', 'Real time: an egg every 20 minutes')}${b(a.fast, 'Fast', 'f1', 'Fast: an egg every 40 seconds, chicks grow in 2 minutes')}</div>`;
  panel.querySelectorAll('button').forEach(el => el.addEventListener('click', () => {
    const k = el.dataset.a, S = A.S;
    if (k === 'kit') { if (!hasCoop()) A.addItem('decor_coop', 1); while (birdsOf(HOMES.coop).length < Math.min(3, holds())) addBird(birdsOf(HOMES.coop).length === 2); A.addItem('feed', 10); A.toast(coopRec() ? 'Starter set added' : 'Coop is in your decor: place it like a bench'); }
    if (k === 'ducks') { if (!hasHome(HOMES.pond)) A.addItem('decor_pond', 1); for (const baby of [false, true]) if (roomOf(HOMES.pond) > 0) addBird(baby, true); A.addItem('feed', 5); A.toast(pondRec() ? 'Ducks added' : 'Ducks added; the pond is in your decor'); }
    if (k === 'coins') S.coins += 1000;
    if (k === 'lv') { let n = 0; while (S.level < 4 && n++ < 400) A.addXP(20); }
    if (k[0] === 'f') { advance(Date.now()); a.fast = k === 'f1'; a.at = Date.now(); }
    A.renderHotbar(); A.commit(); drawPanel();
  }));
}

// for tests
export const _debug = () => ({ birdPicture, get hens() { return hens; }, st: st(), get C() { return C; }, get pond() { return pond; }, HOMES, fps: fpsAvg, advance, sync, pet, feed, takeNest, addBird, items: STORE.extra.items, clock });
