// Tidewell — main game (BETA). Game data lives in data.js, saving in save.js.
import * as THREE from 'three';
import { GLTFLoader } from '../lib/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../lib/addons/utils/SkeletonUtils.js';
import * as store from './store.js';   // STORE: the walk-in general store (the inside loads later from interior.js)
import { mergeVertices } from '../lib/addons/utils/BufferGeometryUtils.js';
import { createCargo } from './cargo.js';
import { SPECIAL, SPECIAL_RULES, FERT, VERSION, VERSION_LABEL, RARITY, FISH, CROPS, CROP_ORDER, ITEMS, SHOP, DEBUG, BAIT, BAIT_ORDER, DECOR, DECOR_ORDER, STARTER_KIT, ORDER_FOLK, ORDERS, makeOrder, orderFolk, CARGO, TOOLS as GEAR, TOOL_ORDER as GEAR_ORDER, CLEAR_NEEDS, HIT_SECONDS, DIG, XP, LEVELS, xpToNext, xpInto, levelFor, rankFor, unlockLevel, rollFish, seasonInfo, timeOfDay, SIGHTS, rollSize, RODS } from './data.js';
import { paintSkin, SKIN, HAIR_COLORS, CLOTH } from './look.js';
import { HAIR3D, hairFor } from './hair3d.js';
import { wearList, wearFor, hairUnderHat, HATS, PACKS as BACKPACKS, packModel } from './wear3d.js';
import CHIPS from './wardrobe-chips.js';
import { loadSave, storeSave, resetSave, peekSave, loadSettings, storeSettings, storageWorks } from './save.js';
import { audio } from './audio.js';   // all sound lives in audio.js; the calls below are one-line hooks
import { weather } from './weather.js';   // rain lives in weather.js; hooks: initWeather(), weather.frame(), renderWx()
import * as animals from './animals.js';   // ANIMALS (try/chickens): coop, hens and eggs live in animals.js; hooks marked ANIMALS below
import * as pets from './pets.js';   // PETS (try/pets): the companion that follows you lives in pets.js; hooks marked PETS below
import * as anim from './anim.js';   // ANIM (try/run): walk/run/idle live in anim.js; hooks marked ANIM below
import * as spots from './fishing-spots.js';   // FISHING (try/fishing): the river, the lake and the bait rule; hooks marked FISHING below
import * as goals from './goals.js';         // GOALS: the first ten goals (card, path, glow, hand); hooks marked GOALS
import * as dex from './fishdex.js';            // FISHING: the fish book, hints and sightings
import { createAimHint } from './aimhint.js';      // AIM: the cast's landing spot and the water-tap hand
import { sitPose, SIT } from './sit.js';             // SIT: sitting on a bench
import * as tackle from './tackle.js';          // TACKLE (try/fishing): rods, cast feels, jetty, dock steps; hooks marked TACKLE below
import * as reel from './reel.js';              // REEL (try/reel): fake nibbles and the reeling mini-game; hooks marked REEL
import { scenery } from './scenery.js';        // SCENERY (try/scenery): sea rocks, the lighthouse and other things to look at; hooks marked SCENERY

// Features switched on in this build. Combat (monsters, the Warrior) arrives in v0.2.0.
const FEATURES = { combat: false };
// the version label lives in data.js only; fill every place it's shown
for (const id of ['ver', 'loadVer']) document.getElementById(id).textContent = VERSION_LABEL;
try { if (sessionStorage.getItem('tidewell.updating') === '1') { sessionStorage.removeItem('tidewell.updating'); document.getElementById('loadTxt').textContent = 'Updating the harbor…'; } } catch (e) { /* no storage: the usual text */ }

// ---------- save state ----------
let settings = loadSettings();
const PLAYER = typeof document !== 'undefined' && document.body.classList.contains('player');   // the players' copy: always the real save
if (PLAYER && settings.debug) { settings.debug = false; storeSettings(settings); }
audio.bindSettings(settings, storeSettings);
let S = loadSave(settings.debug);
seedLevel(S);
clearShopGround(S);
moveDockSave(S);
// v0.1.55: Nell's store and Rosa's moved cart stand on ground that older saves may have built on. Decor there goes back
// into the bag and plots there are dropped (Mac). Same circles as the no-till zones (store.js; ROSA_CART below).
// v0.1.133: the dock, Fishel's stall, the worm bucket and Higgins moved (see DOCK_X). Once per save: decor and plots on their
// new ground go back to the bag, and a player who was standing on the old dock is carried over to the new one.
function moveDockSave(st) {
  if (st.dockMid) return; st.dockMid = 1;
  const zones = [[-1.7, 0.2, 1.3], [4.2, -1.4, 2.0], [2.8, -0.9, 1.0], [5.95, -0.85, 0.8]];
  const hit = (x, z) => zones.some(([zx, zz, r]) => Math.hypot(x + 0.5 - zx, z + 0.5 - zz) < r);
  let n = 0;
  st.decor = (st.decor || []).filter(d => {
    if (!DECOR[d.id] || !cellsOf(d.id, d.x, d.z, d.r).some(k => hit(...k.split(',').map(Number)))) return true;
    st.inv['decor_' + d.id] = (st.inv['decor_' + d.id] || 0) + 1; n++; return false;
  });
  const before = (st.plots || []).length;
  st.plots = (st.plots || []).filter(p => !hit(p.x, p.z));
  n += before - st.plots.length;
  if (Array.isArray(st.pos) && st.pos[1] < -3.3) st.pos[0] -= 2.4;   // you were on the dock: it moved 2.4 m left
  if (n) setTimeout(() => toast('The dock moved! Some things went back to your bag to make room.'), 4000);
}
function clearShopGround(st) {
  const zones = [[-6.6, -0.5, 3.5], [-11.4, -0.9, 2.4]];
  const hit = (x, z) => zones.some(([zx, zz, r]) => Math.hypot(x + 0.5 - zx, z + 0.5 - zz) < r);
  let n = 0;
  st.decor = (st.decor || []).filter(d => {
    if (!DECOR[d.id] || !cellsOf(d.id, d.x, d.z, d.r).some(k => hit(...k.split(',').map(Number)))) return true;
    st.inv['decor_' + d.id] = (st.inv['decor_' + d.id] || 0) + 1; n++; return false;
  });
  const before = (st.plots || []).length;
  st.plots = (st.plots || []).filter(p => !hit(p.x, p.z));
  n += before - st.plots.length;
  if (n) setTimeout(() => toast('Some decor went back to your bag to make room for the new shop.'), 4000);
}
// v0.1.95: the coop's footprint grew from 3 x 2 to 3 x 3 so it can turn (Mac picked this). Decor on its new front row
// goes back into the bag and plots there are dropped, the same rule as the shop above.
function clearCoopGround(st) {
  const coop = (st.decor || []).find(d => d.id === 'coop'); if (!coop || !DECOR.coop) return;
  const mine = new Set(cellsOf('coop', coop.x, coop.z, coop.r || 0)); let n = 0;
  st.decor = st.decor.filter(d => {
    if (d === coop || !DECOR[d.id] || !cellsOf(d.id, d.x, d.z, d.r).some(k => mine.has(k))) return true;
    st.inv['decor_' + d.id] = (st.inv['decor_' + d.id] || 0) + 1; n++; return false;
  });
  const before = (st.plots || []).length;
  st.plots = (st.plots || []).filter(p => !mine.has(p.x + ',' + p.z));
  n += before - st.plots.length;
  if (n) setTimeout(() => toast('Some things went back to your bag to make room for the coop.'), 4000);
}
clearCoopGround(S);
// town level arrived in 0.1.22: older saves start with XP for what they've already done (no level-up card),
// and any pinned order for a crop that isn't unlocked yet is swapped for a fresh one
function seedLevel(st) {
  if (!st.xpSeeded) {
    const catches = Object.values(st.caught || {}).reduce((t, n) => t + n, 0), species = Object.keys(st.caught || {}).length;
    st.xp = Math.max(st.xp || 0, XP.catch * catches + XP.newFish * species + XP.order * Math.max(0, (st.orders?.next || 1) - 7));
    st.xpSeeded = true;
    st.level = levelFor(st.xp);
    if (st.orders) st.orders.slots = st.orders.slots.map(o => !o.empty && o.items.some(([it]) => ITEMS[it].kind === 'crop' && unlockLevel(CROPS[it].seed) > st.level) ? makeOrder(Math.random, st.orders.next++, st.level) : o);
  }
  st.level = Math.max(st.level || 1, levelFor(st.xp || 0));
  // nobody posts orders before you've met them: swap out early orders from Rosa (her cart opens at level 2)
  if (st.orders) st.orders.slots = st.orders.slots.map(o => !o.empty && (ORDER_FOLK[o.who]?.opens || 1) > st.level ? makeOrder(Math.random, st.orders.next++, st.level) : o);
}
const canSave = storageWorks();
let saveTimer = 0;
function commit() { storeSave(S, settings.debug); updateHUD(); }
function invCount(id) { return S.inv[id] || 0; }
function addItem(id, n = 1) { S.inv[id] = (S.inv[id] || 0) + n; if (S.inv[id] <= 0) delete S.inv[id]; if (n > 0) { const c = cropOf(id); if (c) ensureCrop(c); } }

// ---------- renderer / scene ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
// iPhone can drop the GPU context while the game is in the background; three.js rebuilds it on return. Re-send every
// texture then, so nothing comes back white (Mac: "the color from the 3d models goes away after I return to the game").
canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
canvas.addEventListener('webglcontextrestored', () => {
  scene.traverse(o => { for (const mt of [].concat(o.material || [])) for (const k in mt) { const v = mt[k]; if (v && v.isTexture) v.needsUpdate = true; } });
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcdeeff, 32, 75);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

const hemi = new THREE.HemisphereLight(0xffffff, 0x7fb07a, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 3);
// a soft light from the camera's side, no shadows, so faces and fronts are never left dark (Mac, v0.1.62, night mockup B);
// strongest at night, when the moon is behind everyone. Per time of day in TOD[].fill.
const fillLight = new THREE.DirectionalLight(0xffffff, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera; sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 80;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target, fillLight, fillLight.target);

// ---------- loading ----------
const manager = new THREE.LoadingManager();
const loader = new GLTFLoader(manager);
const MODELS = {
  town: ['stall-red', 'stall-green', 'stall-bench', 'fountain-round', 'lantern', 'fence', 'fence-gate', 'tree', 'tree-high-round',
    'wall-wood-door', 'wall-wood-window-shutters', 'wall-wood', 'wall-wood-corner', 'roof-gable', 'roof-gable-end', 'cart', 'banner-red', 'chimney',
    'watermill'],   // SCENERY (mockups)
  pirate: ['structure-platform-dock', 'structure-platform-dock-small', 'boat-row-small', 'boat-row-large', 'ship-small', 'ship-medium', 'palm-detailed-bend',
    'palm-detailed-straight', 'barrel', 'crate', 'crate-bottles', 'structure', 'structure-roof', 'rocks-sand-a', 'flag-high-pennant', 'chest',
    'rocks-a', 'rocks-b', 'rocks-c', 'ship-wreck', 'tower-base-door', 'tower-middle', 'tower-middle-windows', 'tower-watch', 'tower-roof', 'tower-top'],   // SCENERY (mockups)
  nature: ['tree_default', 'tree_oak', 'tree_detailed', 'tree_default_dark', 'tree_oak_dark', 'tree_pineRoundA', 'plant_bush', 'plant_bushLarge',
    'flower_redA', 'flower_yellowA', 'flower_purpleA', 'grass_large', 'rock_largeA', 'rock_smallA', 'mushroom_redGroup', 'crops_cornStageD',
    'crops_dirtRow', 'stump_round', 'log', 'crops_leafsStageA', 'crops_leafsStageB', 'crop_turnip',
    'rock_tallA', 'rock_tallD'],   // SCENERY (mockups)
};
// loaded later, when first needed (see "lazy loading" below)
const LATER = { fish: ['Fish1', 'Fish2', 'Fish3', 'Shark', 'Manta_ray', 'Dolphin', 'Whale'] };   // FISHING: + the two sightings
const M = { crops: {}, fish: {} };
function b64ToBuf(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
function parseGLB(b64, path) { return new Promise((res, rej) => loader.parse(b64ToBuf(b64), path, res, rej)); }
// Only what the first screen needs loads before the game opens. Fish load in the background
// right after; each crop loads when you first need it (seeds, a planted field, an order).
const PACKS = ['town', 'pirate', 'nature', 'chars', ...(FEATURES.combat ? ['monsters'] : [])];
let packsDone = 0;
async function loadPack(kit) {
  const mod = await import(`../assets/pack-${kit}.js`);
  packsDone++; document.getElementById('loadBar').style.width = Math.round(packsDone / PACKS.length * 80) + '%';
  return mod.default;
}
function fixMaterials(g, kit, name = '') {
  g.scene.traverse(o => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach(m => { if ('metalness' in m) { m.metalness = 0; m.roughness = Math.max(m.roughness, kit === 'misc' ? 0.6 : 0.75); }
      if (kit === 'crops') { m.flatShading = true; m.needsUpdate = true;
        if (m.color) { const hsl = {}; m.color.getHSL(hsl);   // Quaternius colors are a little muted next to the Kenney world
          if (hsl.h > 0.17 && hsl.h < 0.45) m.color.setHSL(hsl.h, Math.min(0.72, hsl.s * 1.25), Math.min(0.5, Math.max(0.3, hsl.l * 1.9)));
          else m.color.setHSL(hsl.h, Math.min(0.85, hsl.s * 1.2), Math.min(0.6, hsl.l * (hsl.h < 0.05 && hsl.s > 0.5 ? 1.7 : 1.25))); } }   // ripe reds (tomato) brighter
      if (kit === 'nature' && m.color) { const hsl = {}; m.color.getHSL(hsl);
        if (hsl.h > 0.4 && hsl.h < 0.58 && hsl.s > 0.25) m.color.setHSL(0.29, Math.min(0.62, hsl.s), Math.min(0.5, hsl.l) * (name.includes('dark') ? 0.6 : 1)); } }); } });
}
async function loadAll() {
  const packs = {};
  await Promise.all(PACKS.map(async k => { packs[k] = await loadPack(k); }));
  const jobs = [];
  for (const [kit, names] of Object.entries(MODELS)) {
    M[kit] = {};
    for (const n of names) jobs.push(parseGLB(packs[kit][n], `./assets/${kit}/`).then(g => { fixMaterials(g, kit, n); M[kit][n] = g; }));
  }
  jobs.push(parseGLB(packs.chars.Rogue, './assets/chars/').then(g => { fixMaterials(g, 'misc'); M.rig = g; }));
  jobs.push(parseGLB(packs.chars.Dummy, './assets/chars/').then(g => { M.dummy = g; }));
  jobs.push(parseGLB(packs.chars.Wizard, './assets/chars/').then(g => { M.animM = g.animations; }));
  jobs.push(parseGLB(packs.chars.Ranger, './assets/chars/').then(g => { M.animF = g.animations; }));
  if (packs.chars.UAL) jobs.push(parseGLB(packs.chars.UAL, './assets/chars/').then(g => { M.ual = g; }));   // ANIM: Universal Animation Library clips (Quaternius, CC0)
  if (FEATURES.combat) jobs.push(parseGLB(packs.monsters.blobs, './assets/monsters/').then(g => { fixMaterials(g, 'misc'); M.blobs = g; }));
  await Promise.all(jobs);
  document.getElementById('loadBar').style.width = '100%';
}

// ---------- lazy loading ----------
const lazy = {};
function loadLater(key, job) { return lazy[key] || (lazy[key] = job().catch(err => { delete lazy[key]; console.error(err); })); }
function ensureFish() {
  return loadLater('fish', async () => {
    const pack = (await import('../assets/pack-fish.js')).default;
    await Promise.all(LATER.fish.map(n => parseGLB(pack[n], './assets/fish/').then(g => { fixMaterials(g, 'misc'); M.fish[n] = g; })));
    renderFishIcons();
  });
}
// a crop's models: its own small pack (pack-crops-<id>.js); turnip is in the nature kit already
function ensureCrop(id) {
  const c = CROPS[id];
  if (!c || c.kit !== 'crops') return Promise.resolve();
  return loadLater('crop:' + id, async () => {
    const pack = (await import(`../assets/pack-crops-${id}.js`)).default;
    await Promise.all([...c.stages, c.icon[1]].map(n => parseGLB(pack[n], './assets/crops/').then(g => { fixMaterials(g, 'crops', n); M.crops[n] = g; })));
    renderCropIcons([id]);
    // everything that was showing a placeholder for this crop catches up
    for (const p of plots.values()) if (p.save.crop === id) { p.stage = -9; syncCrop(p, true); }
    renderHotbar(); renderTrack();
    if (!document.getElementById('bag').hidden) renderBag();
    if (!document.getElementById('orders').hidden) renderOrders();
  });
}
const cropOf = (itemId) => { const it = ITEMS[itemId]; return it && (it.kind === 'crop' ? (it.base || itemId) : it.kind === 'seed' ? it.crop : null); };
// crops this save already uses: planted, in the bag, or asked for on the order board
function ensureCropsInUse() {
  const ids = new Set(S.plots.map(p => p.crop).filter(Boolean));
  for (const k of Object.keys(S.inv)) { const c = cropOf(k); if (c) ids.add(c); }
  for (const o of S.orders.slots) if (!o.empty) for (const [it] of o.items) { const c = cropOf(it); if (c) ids.add(c); }
  for (const id of ids) ensureCrop(id);
}

// ---------- terrain ----------
const WATER_Y = -0.28;
function noise(x, z) { return Math.sin(x * 1.7 + z * 0.9) * 0.5 + Math.sin(x * 0.6 - z * 1.3) * 0.5; }
function smooth(a, b, t) { t = Math.min(1, Math.max(0, (t - a) / (b - a))); return t * t * (3 - 2 * t); }
function groundY(x, z) {
  const shore = smooth(-3.0, -7.5, z);            // 0 on land, 1 out at sea
  return -shore * 1.6 + noise(x, z) * 0.04 * (1 - shore) - spots.carve(x, z);   // FISHING: the river and the lake are dug into the ground
}
const C = (h) => new THREE.Color(h);
const GC = { grass: C('#7cc957'), grass2: C('#6dbb4c'), sand: C('#f2dc9b'), wet: C('#d9bf7c'), path: C('#e2c48c'),
  wild: C('#4f9a45'), wild2: C('#448a3c'), plaza: C('#e8d2a0') };
// The dirt path runs straight down the middle of your land (x = 0), the same line as the dock (v0.1.133, Mac: mockup C).
const pathCx = () => 0;
function groundColor(x, z) {
  const c = new THREE.Color();
  const n = noise(x * 2.1, z * 2.3);
  c.copy(n > 0.1 ? GC.grass : GC.grass2);
  const wildT = smooth(FENCE_Z + 0.05, FENCE_Z + 1.05, z);
  if (wildT > 0) c.lerp(n > 0 ? GC.wild : GC.wild2, wildT);
  const onPath = Math.abs(x - pathCx(z)) < 1.05 && z > -3.2 && z < LOTS_BACK + 1.5;   // straight, no wobble, so both edges sit evenly inside the dock's width (Mac)
  if (onPath) c.lerp(GC.path, 0.95);
  const s = smooth(-1.8, -3.2, z);
  if (s > 0) c.lerp(GC.sand, s);
  const w = smooth(-4.6, -5.6, z);
  if (w > 0) c.lerp(GC.wet, w);
  const bs = spots.bankSand(x, z); if (bs > 0) { c.lerp(GC.sand, bs); const bw = spots.bankWet(x, z); if (bw > 0) c.lerp(GC.wet, bw); }   // FISHING: sandy banks
  return c;
}
let groundMesh;
function buildGround() {
  const geo = new THREE.PlaneGeometry(90, 88, 150, 146);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, 17);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, groundY(x, z));
    const c = groundColor(x, z);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const nonIdx = geo.toNonIndexed(); nonIdx.computeVertexNormals();
  const mesh = new THREE.Mesh(nonIdx, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  groundMesh = mesh;
}
function recolorGround() {
  if (!groundMesh) return;
  const g = groundMesh.geometry, pos = g.attributes.position, col = g.attributes.color;
  for (let i = 0; i < pos.count; i++) { const c = groundColor(pos.getX(i), pos.getZ(i)); col.setXYZ(i, c.r, c.g, c.b); }
  col.needsUpdate = true;
}
let waterMat, waterUniforms = { uTime: { value: 0 }, uRings: { value: [] }, uCrest: { value: 0 }, uDash: { value: 0 }, uRing: { value: 0 } };
function waveY(x, z, t) { return Math.sin(x * 0.55 + t * 1.3) * 0.07 + Math.cos(z * 0.7 + t * 1.1) * 0.07; }
function buildWater() {
  const geo = new THREE.PlaneGeometry(160, 90, 100, 56);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, WATER_Y, -38);
  waterMat = new THREE.MeshStandardMaterial({ color: 0x2f9be0, roughness: 0.25, metalness: 0.05, flatShading: true,
    transparent: false });
  // the look Mac picked: B's sparkle dashes + ripple rings around the ship (crests stay available, off)
  waterUniforms.uCrest.value = 0; waterUniforms.uDash.value = 1; waterUniforms.uRing.value = 1;
  waterUniforms.uRings.value = [...Array(8)].map(() => new THREE.Vector3(0, 0, -1));
  waterMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, waterUniforms);
    sh.vertexShader = 'uniform float uTime;\nvarying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       vec4 wp = modelMatrix * vec4(position, 1.0);
       transformed.y += sin(wp.x * 0.55 + uTime * 1.3) * 0.07 + cos(wp.z * 0.7 + uTime * 1.1) * 0.07;
       vWP = wp.xyz;`);
    sh.fragmentShader = 'uniform float uTime;\nuniform float uCrest;\nuniform float uDash;\nuniform float uRing;\nuniform vec3 uRings[8];\nvarying vec3 vWP;\n' +
      'float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
      sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
       {
         vec2 p = vWP.xz; float t = uTime; vec3 lite = vec3(0.80, 0.94, 1.0);
         // A: soft crest bands rolling in toward the beach
         if (uCrest > 0.0) {
           float ph = p.y * 0.85 + sin(p.x * 0.23 + t * 0.4) * 1.3 - t * 1.4;
           float crest = smoothstep(0.86, 0.99, sin(ph)) * (0.55 + 0.45 * sin(p.x * 0.5 + t * 0.7));
           diffuseColor.rgb = mix(diffuseColor.rgb, lite, crest * uCrest);
         }
         // B: little white ripple dashes that blink in and out, drifting slowly
         if (uDash > 0.5) {
           vec2 q = (p + vec2(t * 0.25, 0.0)) / vec2(1.8, 1.1); vec2 c = floor(q), f = fract(q) - 0.5;
           float r = h21(c); vec2 o = vec2(h21(c + 7.0), h21(c + 13.0)) - 0.5;
           vec2 d = (f - o * 0.4) * vec2(1.0, 3.2);
           float life = sin(t * (0.8 + r) + r * 6.28) * 0.5 + 0.5;
           float dash = (1.0 - smoothstep(0.17, 0.26, length(d))) * smoothstep(0.35, 0.9, life) * step(0.3, r);
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), dash * 0.8);
         }
         // C: rings spreading out around the dock posts, the ship and the rocks
         if (uRing > 0.5) {
           for (int i = 0; i < 8; i++) {
             vec3 R = uRings[i]; if (R.z < 0.0) continue;
             // an oval starting right at the hull, stretched along the ship, wobbly and broken up (Mac: "don't have them perfect")
             vec2 v = (p - R.xy) * vec2(0.42, 1.0); float ang = atan(v.y, v.x);
             float wob = 0.16 * sin(ang * 3.0 + t * 0.6) + 0.09 * sin(ang * 7.0 - t * 1.1) + 0.05 * sin(ang * 13.0 + t * 0.4);
             float d = length(v) - R.z + wob;
             if (d < 0.0 || d > 1.7) continue;
             float patchy = smoothstep(-0.2, 0.6, sin(ang * 5.0 + d * 1.7 + t * 0.35) + 0.4 * sin(ang * 11.0 - t * 0.5));
             float ring = smoothstep(0.8, 0.97, sin(d * 6.5 - t * 2.2 + 0.4 * sin(ang * 4.0))) * (1.0 - d / 1.7) * patchy;
             diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), ring * 0.55);
           }
         }
       }`);
  };
  const water = new THREE.Mesh(geo, waterMat);
  water.receiveShadow = true;
  scene.add(water);
  // shoreline foam: a soft white band following where water meets sand
  const foamGeo = new THREE.PlaneGeometry(90, 0.5, 90, 1);
  foamGeo.rotateX(-Math.PI / 2);
  const foam = new THREE.Mesh(foamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
  // find z where ground meets water
  let zShore = -4; for (let z = -2; z > -9; z -= 0.02) { if (groundY(0, z) < WATER_Y) { zShore = z; break; } }
  foam.position.set(0, WATER_Y + 0.03, zShore);
  scene.add(foam);
  return foam;
}

// ---------- placement helpers ----------
const SCALE = { town: 2.2, pirate: 0.85, nature: 1.7 };
function shadowize(o) { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }
function place(kit, name, x, z, opt = {}) {
  const src = M[kit][name].scene;
  const o = src.clone(true);
  const s = (opt.s ?? 1) * SCALE[kit];
  o.scale.setScalar(s);
  o.rotation.y = opt.r ?? 0;
  o.position.set(x, opt.y ?? groundY(x, z), z);
  shadowize(o);
  scene.add(o);
  return o;
}


// ---------- world ----------
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const rnd = mulberry32(20261105);
const lanternLights = [];
const lampProbe = { intensity: 0 }; lanternLights.push(lampProbe);   // SCENERY: gets the same brightness as every lantern (time of day and rain), read by the lighthouse lamp
const lanternLamps = () => lampProbe.intensity;
const FISHEL_STALL = { x: 4.2, z: -1.8 };   // 4.2 m right of the dock's middle (Mac, v0.1.63: not too close to the dock); it slid over with the dock in v0.1.133
const BOARD = { x: -3.6, z: -1.7 };   // moved away from Higgins in v0.1.43 (Mac: too close)
const ROSA_CART = { x: -11.4, z: -0.9, r: -0.35 };   // Rosa's Flowers, on the beach row left of the board (decision 61)   // the order board, left of Higgins (decision 50)
// --- the dock is walkable: a corridor down its middle, height found by raycasting onto the planks
const dockParts = [];
// v0.1.9: one dock, four planks wide instead of three (Mac). See widenDock().
let merchant = null;
// roll the ship's sails up (k = 1) or let them down (k = 0): each sail squashes up toward its yard
function furlSails(ship, k) {
  ship.traverse(o => {
    if (!/^sail/.test(o.name)) return;
    if (!o.userData.furl) { o.updateWorldMatrix(true, true); const bb = new THREE.Box3().setFromObject(o);   // parents first: the ship was just moved and scaled (v0.1.60 fix: the back sail floated above the mast)
      const c = bb.getCenter(new THREE.Vector3()); const top = o.worldToLocal(new THREE.Vector3(c.x, bb.max.y, c.z)).y; o.userData.furl = { y: o.position.y, top, sy: o.scale.y }; }
    const f = o.userData.furl, s = 1 - 0.86 * k;
    o.scale.y = f.sy * s; o.position.y = f.y + f.top * f.sy * (1 - s);
  });
}
// the cargo ship ties up across the end of the dock, bow to the right (Mac, v0.1.60, mockup A); it sails in from the left and out to the right
// extra dock sections (2.12 m each) beyond the first four; everything at the dock's end moves out with them
// (two more since v0.1.81, mockup B: a longer, wider dock so the crates and their bubbles have room. Mac)
const DOCK_MORE = ((typeof window !== 'undefined' && window.__cargoLab) || {}).extra ?? 2, DOCK_ADD = DOCK_MORE * 2.12;
// v0.1.133 (Mac: "it bugs me that the dock doesn't line up with the path", mockup C): the dock moved from x = 2.4 to the middle,
// on the path's line. The ship, crates, flag, steps and pets' spots are all placed from DOCK, so they moved with it. Fishel's
// stall and the worm bucket slid over by the same 2.4 m, and Higgins stepped aside to the left edge of the path.
const DOCK_X = 0;
const HIGGINS_AT = { x: -1.7, z: 0.2 };
const SHIP_AT = { x: DOCK_X, z: -13.2 - DOCK_ADD }, SHIP_IN = { x: -34, z: -13.2 - DOCK_ADD }, SHIP_OUT = { x: 36, z: -13.2 - DOCK_ADD }, SHIP_ROT = Math.PI / 2;
// the ship's hull at the dock, for casts (you cast off the sides of the dock, not into the ship)
function shipBlocks(px, pz, x, z) {   // does a cast from (px, pz) to (x, z) land on or fly over the ship?
  if (!merchant || !merchant.visible || cargo.sailing() || z > -11.0 - DOCK_ADD) return false;
  if (z > -15.6 - DOCK_ADD && Math.abs(x - SHIP_AT.x) < 4.4) return true;
  const t = (SHIP_AT.z - pz) / (z - pz); return t > 0 && t < 1 && Math.abs(px + (x - px) * t - SHIP_AT.x) < 4.4;
}
const DOCK_WIDE = ((typeof window !== 'undefined' && window.__cargoLab) || {}).wide ?? 2;   // extra planks beyond four (0.485 m each): six planks wide since v0.1.81
const DOCK = { x: DOCK_X, half: 0.97 + DOCK_WIDE * 0.2425, zNear: -3.2, zFar: -11.1 - DOCK_ADD };
function onDock(x, z) { return Math.abs(x - DOCK.x) < DOCK.half && z <= DOCK.zNear && z >= DOCK.zFar; }
// the fence between your land and the wilds; it moves back each time you buy a lot (decision 69, layout D)
const FENCE_Z0 = 7.55;
let FENCE_Z = FENCE_Z0;
const townFence = [];   // fence pieces and gate banners, moved together
// PETS: is this spot inside something a pet shouldn't pass through (people, stalls, the board, the store, the coop)?
const _ps = { a: null, b: null };
function petSolid(x, z) {
  for (const n of [higgins, fishel, pike, rosa]) if (n && n.pos && Math.hypot(x - n.pos.x, z - n.pos.z) < 0.6) return true;
  if (Math.abs(x - FISHEL_STALL.x) < 1.3 && Math.abs(z - FISHEL_STALL.z) < 1.05) return true;
  if (rosa) { const c = Math.cos(ROSA_CART.r), sn = Math.sin(ROSA_CART.r), dx = x - ROSA_CART.x, dz = z - ROSA_CART.z; if (Math.abs(dx * c - dz * sn) < 1.0 && Math.abs(dx * sn + dz * c) < 1.5) return true; }
  if (Math.abs(x - BOARD.x) < 0.85 && Math.abs(z - BOARD.z) < 0.35) return true;
  _ps.a = _ps.a || new THREE.Vector3(); _ps.b = _ps.b || new THREE.Vector3();
  for (const blk of [store.block, animals.block]) { _ps.a.set(x, 0, z); _ps.b.set(x + 9, 0, z - 9);   /* a 'from' point that can never lean on the store's door */ blk(_ps.a, _ps.b); if (_ps.a.x !== x || _ps.a.z !== z) return true; }
  return false;
}
function walkable(x, z) { return (z >= -3.4 || onDock(x, z)) && (!spots.isWet(x, z) || tackle.onDeck(x, z)) &&   /* FISHING: no walking into the river or lake; TACKLE: except on the jetty */ !(inRock(x, z) && !inRock(player.pos.x, player.pos.z)); }
function inRock(x, z) { for (const o of solids) if (o.visible && Math.hypot(o.position.x - x, o.position.z - z) < o.userData.solidR) return true; return false; }
// The Kenney dock section has 3 planks between its side rails. Rebuild its mesh 4 planks wide:
// the left side (rail, posts, braces, plank) moves out half a plank, the right side likewise,
// and the middle plank is laid twice in the gap.
const PLANK = 0.625;   // plank spacing in the model
function widenDock(obj) {
  obj.traverse((m) => {
    if (!m.isMesh) return;
    const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    const names = Object.keys(src.attributes), pos = src.attributes.position, n = pos.count / 3;
    const out = Object.fromEntries(names.map(k => [k, []]));
    const emit = (t, dx) => {
      for (let v = t * 3; v < t * 3 + 3; v++) for (const k of names) {
        const a = src.attributes[k];
        for (let c = 0; c < a.itemSize; c++) out[k].push(a.array[v * a.itemSize + c] + (k === 'position' && c === 0 ? dx : 0));
      }
    };
    for (let t = 0; t < n; t++) {
      const cx = (pos.getX(t * 3) + pos.getX(t * 3 + 1) + pos.getX(t * 3 + 2)) / 3;
      const T = 4 + DOCK_WIDE;   // planks across
      if (Math.abs(cx) < 0.3) { for (let j = 0; j < T - 2; j++) emit(t, (j - (T - 3) / 2) * PLANK); }   // the middle plank, repeated to fill the gap
      else emit(t, Math.sign(cx) * (T - 3) * PLANK / 2);
    }
    const g = new THREE.BufferGeometry();
    for (const k of names) g.setAttribute(k, new THREE.Float32BufferAttribute(out[k], src.attributes[k].itemSize));
    g.computeBoundingBox(); g.computeBoundingSphere();
    m.geometry = g;
  });
  return obj;
}
const ray = new THREE.Raycaster(); const DOWN = new THREE.Vector3(0, -1, 0);
function floorY(x, z) {
  { const dk = tackle.deckY(x, z); if (dk !== null) return dk; }   // TACKLE: standing on the lake jetty
  const g = groundY(x, z);
  if (z > -2.6 || Math.abs(x - DOCK.x) > DOCK.half + 0.6) return g;
  // check across the player's width: the dock end has a gap between its planks down the middle
  const down = (dx, maxY) => { ray.set(new THREE.Vector3(x + dx, 5, z), DOWN); ray.far = 8; const h = ray.intersectObjects(dockParts, true).find(h => h.point.y < maxY); return h ? h.point.y : -Infinity; };
  let top = down(0, 1.6);
  if (top === -Infinity) top = Math.max(down(-0.2, 0.62), down(0.2, 0.62));   // planks either side, not the post tops
  if (onDock(x, z)) top = Math.max(top, DOCK_FLOOR);   // never fall through anywhere on the dock
  return Math.max(g, top);
}
const DOCK_FLOOR = 0.4;
// trees between the camera and the player fade out so you never lose your character
const occluders = [];
function occluder(o) {
  const mats = [];
  o.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.transparent = true; mats.push(m.material); } });
  occluders.push({ o, mats, a: 1 });
  return o;
}
function updateOccluders(dt) {
  for (const t of occluders) {
    const dx = Math.abs(t.o.position.x - player.pos.x), dz = t.o.position.z - player.pos.z;
    const hide = dx < 2.2 && dz > -0.6 && dz < 6.5;
    const target = hide ? 0.28 : 1;
    t.a += (target - t.a) * Math.min(1, dt * 8);
    for (const m of t.mats) { m.opacity = t.a; m.depthWrite = t.a > 0.95; }
  }
}
const bobbers = [];
function buildWorld() {
  buildGround();
  const foam = buildWater();
  bobbers.push({ o: foam, base: foam.position.y, amp: 0.03, sp: 1.3, ph: 0 });


  // --- harbor ---
  const deckY = WATER_Y - 0.02;
  for (let i = 0; i < 4 + DOCK_MORE; i++) dockParts.push(widenDock(place('pirate', 'structure-platform-dock', DOCK.x, -4.4 - i * 2.12, { y: deckY, r: 0 })));
  const fx = DOCK.x + DOCK.half - 0.02;
  const flag = place('pirate', 'flag-high-pennant', fx, -10.9 - DOCK_ADD, { y: 0, s: 0.8 });
  scene.updateMatrixWorld(true); flag.position.y = floorY(fx, -10.9);
  // rowboats pulled up on the shore, side by side (Mac)
  for (const [n, x, z, r] of [['boat-row-large', -9.6, -3.75, 0.1], ['boat-row-small', -7.9, -3.7, -0.12]]) {
    const b = place('pirate', n, x, z, { r }); b.position.y = groundY(x, z) + 0.02; b.rotation.x = -0.05;
  }
  // the merchant ship, tied up along the dock (cargo boat, decision 51)
  merchant = place('pirate', 'ship-medium', SHIP_AT.x, SHIP_AT.z, { y: WATER_Y - 0.25, r: SHIP_ROT, s: 0.85 });
  bobbers.push({ o: merchant, base: WATER_Y - 0.22, ride: true, sp: 0.7, ph: 0.6, rock: 0.015 });
  // ripple rings: dock posts, the ship's hull, the rocks (x, z, radius)
  // ripples around the ship while it's tied up
  waterUniforms.uRings.value[0].set(SHIP_AT.x, SHIP_AT.z, 1.45);   // one oval from the middle of the ship (Mac)
  furlSails(merchant, 1);   // tied up: sails rolled up (Mac)
  const ship = place('pirate', 'ship-small', -15, -27, { y: WATER_Y - 0.2, r: 0.9, s: 0.9 });
  bobbers.push({ o: ship, base: WATER_Y - 0.15, ride: true, sp: 0.8, ph: 2, rock: 0.03 });
  place('pirate', 'palm-detailed-bend', -5.2, -3.9, { r: 2.4, s: 1.0 });
  place('pirate', 'palm-detailed-straight', 7.8, -3.6, { r: 0.3, s: 1.0 });
  // the bent palm at 10.5, -4.6 stood in the sea; removed (Mac, v0.1.78)
  place('pirate', 'rocks-sand-a', -8.0, -6.6, { s: 0.6, r: 1 });
  // the sand rock in the sea right of the dock (8.5, -6.8) is gone (Mac, v0.1.139); the one on the left stays

  // --- the lot starts bare: everything man-made in town is decor you place yourself ---
  // Fishel's bait stall by the dock
  occluder(place('town', 'stall-green', FISHEL_STALL.x, FISHEL_STALL.z, { r: 0 }));
  makeBoard();
  place('pirate', 'barrel', FISHEL_STALL.x + 1.3, FISHEL_STALL.z + 0.2, { s: 0.55 });
  place('pirate', 'crate-bottles', FISHEL_STALL.x + 0.9, FISHEL_STALL.z + 1.0, { s: 0.6, r: 0.3 });
  // fence with a gate on the path
  const FZ = 7.55;
  for (let x = -15.4; x <= 15.4; x += 2.2) {
    if (Math.abs(x) < 1.2) continue;
    townFence.push(place('town', 'fence', x, FZ - 1.1, { r: -Math.PI / 2 }));
  }
  townFence.push(place('town', 'banner-red', -1.6, FZ - 0.2, { s: 0.6 }), place('town', 'banner-red', 1.6, FZ - 0.2, { s: 0.6 }));

  // nature dressing around town
  const nearWater = (x, z, m = 0.35) => [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]].some(([a, b]) => spots.isWet(x + a, z + b));   // is a trunk here standing in water?
  const T = (n, x, z, s = 1, r = rnd() * 6.28) => place('nature', n, x, z, { s, r });
  [['tree_oak', -12, 0.5], ['tree_default', 10.6, 3.4], ['tree_detailed', 11.8, -0.4], ['tree_oak', -12.5, 5.6],
   ['tree_default', 13.4, 5.8], ['tree_detailed', -10.8, -1.8], ['tree_pineRoundA', 14.5, 1.2], ['tree_oak', 9.4, 6.2]]
    .forEach(([n, x, z]) => T(n, spots.onBank(x, z) ? spots.innerBank(z) + 0.5 : x, z, 1.15 + rnd() * 0.2));   // FISHING: never in the river (the two oaks on its bank came back in v0.1.79: their trunks are dry)
  const flowers = ['flower_redA', 'flower_yellowA', 'flower_purpleA'];
  for (const [cx, cz] of [[3.6, 5.6], [5.8, 1.6], [7.2, 1.4], [-5.5, 4.4], [1.8, 1.2], [-1.6, 6.6], [6.0, 5.8]]) {
    for (let k = 0; k < 5; k++) wildPlant(T(flowers[(((k + Math.round(cx)) % 3) + 3) % 3], cx + (rnd() - 0.5) * 1.2, cz + (rnd() - 0.5) * 0.8, 1.1));
  }
  for (const [bx, bz] of [[-3.2, 6.8], [3.4, 6.9], [-6, 6.9], [6.5, 6.9], [-10, 6.8], [10, 6.8], [8.4, 2.4], [-11, 3]])
    wildPlant(T(rnd() > 0.5 ? 'plant_bushLarge' : 'plant_bush', bx, bz, 1.2));

  scenery.init({ THREE, scene, M, SCALE, WATER_Y, groundY, bankX: spots.innerBank });   // SCENERY
  buildLots(T);
  cargo.build();
  refreshDig();

  // --- the wilds past the gate ---
  // no tree trunks in the river or the lake (Mac, v0.1.79: "if the trunk isn't in the water you can put them back"); a skipped tree still uses up its random numbers so the rest of the woods stay where they were
  const dryTree = (n, x, z, sc) => { if (nearWater(x, z)) { rnd(); return; } occluder(T(n, x, z, sc)); };
  const wildTrees = [];
  for (let i = 0; i < 40; i++) {
    const x = (rnd() - 0.5) * 34, z = LOTS_BACK + 1.2 + rnd() * 16;
    if (Math.abs(x) < 2.6) continue;
    wildTrees.push([x, z]);
  }
  wildTrees.forEach(([x, z], i) => dryTree(i % 3 === 0 ? 'tree_oak_dark' : 'tree_default_dark', x, z, 1.1 + rnd() * 0.5));
  for (let i = 0; i < 26; i++) {   // woods down both sides of the lots
    const sd = rnd() > 0.5 ? 1 : -1;
    dryTree(rnd() > 0.4 ? 'tree_default_dark' : 'tree_oak_dark', sd * (15.8 + (sd < 0 ? 1.3 : 0) + rnd() * 6)   /* FISHING: the left woods start behind the river */, FENCE_Z0 + 0.6 + rnd() * (LOTS_BACK - FENCE_Z0), 1.1 + rnd() * 0.5);
  }
  for (let i = 0; i < 34; i++) {
    const x = (rnd() - 0.5) * 20, z = LOTS_BACK + 0.8 + rnd() * 9;
    if (Math.abs(x) < 1.4) continue;
    const pick = ['grass_large', 'mushroom_redGroup', 'grass_large', 'stump_round', 'plant_bush', 'grass_large', 'log', 'mushroom_redGroup'][i % 8];
    if (spots.onBank(x, z)) { rnd(); continue; }
    T(pick, x, z, pick === 'grass_large' ? 1.6 : 1.2);
  }
  for (const [x, z] of [[-5.6, 10.4], [5.9, 12.6], [-6.4, 14.2], [6.8, 9.6], [-4.8, 16.4], [5.2, 16.8]].map(([a, b]) => [a, b + LOTS_BACK - 7.6]))
    dryTree(rnd() > 0.5 ? 'tree_oak_dark' : 'tree_default_dark', x, z, 1.25 + rnd() * 0.3);
}

// ---------- mannequin bodies on the shared skeleton ----------
const sanitize = (n) => THREE.PropertyBinding.sanitizeNodeName(n);
function makeBody(kind) {
  const root = SkeletonUtils.clone(M.rig.scene);
  scene.add(root);
  root.updateMatrixWorld(true);
  const target = kind === 'm' ? 1.7 : 1.62;
  const hb = root.getObjectByName(sanitize('Head')).getWorldPosition(new THREE.Vector3()).y - root.getObjectByName(sanitize('Foot.L')).getWorldPosition(new THREE.Vector3()).y;
  const h = hb * 1.2;
  root.scale.multiplyScalar(target / h);
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o.isMesh || o.isSkinnedMesh) o.visible = false; });
  const bone = (n) => root.getObjectByName(sanitize(n));
  const P = (n) => bone(n).getWorldPosition(new THREE.Vector3());
  const H = target;
  const parts = [];   // NPC outfit meshes (dress/hat) come back with the wardrobe
  // ANIM: idle/walk/run (stride-matched, blended) and the upper-body one-shots are built in anim.js
  const mixer = new THREE.AnimationMixer(root);
  const ab = { root, mixer };
  anim.buildActions(ab, M.rig.animations, kind === 'm' ? M.animM : M.animF, bone, ANIM_LOOK, M.ual);
  // tools held in the right hand (built in rest pose, pointing forward, then attached to the fist)
  const tools = {};
  const fist = P('Fist.R');
  const mk = (geo, color, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6 })); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; return m; };
  const hold = (id, build) => {
    const g = new THREE.Group(); build(g);
    g.position.copy(fist); g.scale.setScalar(H / 1.7);
    scene.add(g); g.updateMatrixWorld(true); bone('Fist.R').attach(g); g.visible = false; tools[id] = g;
  };
  hold('sword', g => { g.add(mk(new THREE.BoxGeometry(0.05, 0.014, 0.62), 0xe3e9f0, 0, 0, 0.42)); g.add(mk(new THREE.BoxGeometry(0.18, 0.035, 0.035), 0xd4a72c, 0, 0, 0.1));
    g.add(mk(new THREE.CylinderGeometry(0.018, 0.018, 0.15, 8), 0x6b4425, 0, 0, 0.0, Math.PI / 2)); });
  hold('rod', g => { const r = mk(new THREE.CylinderGeometry(0.008, 0.016, 1.3, 8), 0x8a5a34, 0, 0.3, 0.55, Math.PI / 2 - 0.45); g.add(r);
    const tip = new THREE.Object3D(); tip.position.set(0, 0.3 + 0.65 * Math.cos(Math.PI / 2 - 0.45), 0.55 + 0.65 * Math.sin(Math.PI / 2 - 0.45)); g.add(tip); g.userData.tip = tip; });
  hold('hoe', g => { g.add(mk(new THREE.CylinderGeometry(0.016, 0.016, 0.95, 8), 0x8a5a34, 0, 0, 0.35, Math.PI / 2)); g.add(mk(new THREE.BoxGeometry(0.14, 0.16, 0.03), 0x9aa3ad, 0, -0.06, 0.82)); });
  hold('seeds', g => { g.add(mk(new THREE.SphereGeometry(0.07, 10, 8), 0xd9c08a, 0, -0.02, 0.05)); g.add(mk(new THREE.CylinderGeometry(0.02, 0.035, 0.05, 8), 0xb59a62, 0, 0.06, 0.05)); });
  hold('fruit', g => { g.add(mk(new THREE.SphereGeometry(0.065, 10, 8), 0xf3eef6, 0, 0, 0.06)); g.add(mk(new THREE.SphereGeometry(0.05, 10, 8), 0xa05bc4, 0, 0.03, 0.06));
    g.add(mk(new THREE.ConeGeometry(0.03, 0.09, 6), 0x4caf50, 0, 0.1, 0.06)); });
  const bones = {}, len = {};
  for (const n of ['Hips', 'Torso', 'Neck', 'Head', 'UpperArm.L', 'LowerArm.L', 'Fist.L', 'UpperArm.R', 'LowerArm.R', 'Fist.R',
    'UpperLeg.L', 'LowerLeg.L', 'Foot.L', 'UpperLeg.R', 'LowerLeg.R', 'Foot.R']) bones[n] = bone(n);
  for (const s2 of ['L', 'R']) { len['UpperArm.' + s2] = P('UpperArm.' + s2).distanceTo(P('LowerArm.' + s2)); len['LowerArm.' + s2] = P('LowerArm.' + s2).distanceTo(P('Fist.' + s2)); }
  // for hanging from a farm tool: hands straight up above the shoulders, hips, legs
  const feetY = Math.min(P('Foot.L').y, P('Foot.R').y);
  const hang = {
    hands: P('UpperArm.R').y - feetY + (len['UpperArm.R'] + len['LowerArm.R']) * 0.97,
    hip: P('UpperLeg.L').y - feetY,
    leg: P('UpperLeg.L').distanceTo(P('Foot.L')),
    shoulder: Math.abs(P('UpperArm.R').x - P('UpperArm.L').x) / 2,
  };
  const b = { ...ab, parts, tools, bones, len, H, hang };
  makePuppet(b, bone);
  anim.initPosture(b, M.dummy);   // ANIM: upright standing pose
  anim.calibrate(b, syncPuppet, ['Left', 'Right'].map(sd => b.puppet.k.getObjectByName(sd + 'Toes') || b.puppet.k.getObjectByName(sd + 'Foot')));   // ANIM: measure the dummy's stride
  return b;
}

// ---------- the white Kenney dummy (v0.1.24) ----------
// The invisible pack rig above still runs every animation and pose (walk, run, cast, pick up, the
// farm-tool dangle). The Kenney body copies its pose each frame: every mapped bone gets the rig
// bone's world rotation times a fixed offset measured with both in their idle pose.
const PUPPET_MAP = [['Hips', 'Hips'], ['Abdomen', 'Spine'], ['Torso', 'Chest'], ['Neck', 'Neck'], ['Head', 'Head'],
  ['Shoulder.L', 'LeftShoulder'], ['UpperArm.L', 'LeftArm'], ['LowerArm.L', 'LeftForeArm'], ['Fist.L', 'LeftHand'],
  ['Shoulder.R', 'RightShoulder'], ['UpperArm.R', 'RightArm'], ['LowerArm.R', 'RightForeArm'], ['Fist.R', 'RightHand'],
  ['UpperLeg.L', 'LeftUpLeg'], ['LowerLeg.L', 'LeftLeg'], ['Foot.L', 'LeftFoot'],
  ['UpperLeg.R', 'RightUpLeg'], ['LowerLeg.R', 'RightLeg'], ['Foot.R', 'RightFoot']];
const HEAD_TIP = -0.5;   // radians per bone (neck and head) while hanging from a farm tool
const DUMMY_MAT = new THREE.MeshStandardMaterial({ color: 0xf6f4ef, roughness: 0.75 });
const _pq = new THREE.Quaternion(), _pq2 = new THREE.Quaternion(), _pv = new THREE.Vector3();
function makePuppet(b, bone) {
  const root = b.root;
  b.mixer.update(0); root.updateMatrixWorld(true);              // rig in its idle pose
  const k = SkeletonUtils.clone(M.dummy.scene);
  k.traverse(o => { if (o.isMesh) { o.material = DUMMY_MAT; o.castShadow = true; o.frustumCulled = false; } });
  const km = new THREE.AnimationMixer(k); km.clipAction(M.dummy.animations[0]).play(); km.update(0);   // idle pose; never updated again, so unmapped bones (fingers, toes) keep it
  k.updateMatrixWorld(true);
  const kb = (n) => k.getObjectByName(n);
  const top = kb('Head_end').getWorldPosition(new THREE.Vector3()).y;
  root.add(k); k.scale.setScalar((b.H / top) / root.scale.x); k.rotation.set(0, 0, 0); k.position.set(0, 0, 0);
  root.updateMatrixWorld(true);
  const pairs = [];
  for (const [src, dst] of PUPPET_MAP) {
    const s = bone(src), t = kb(dst); if (!s || !t) continue;
    const off = s.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(t.getWorldQuaternion(new THREE.Quaternion()));
    pairs.push({ s, t, off });
  }
  const hipS = bone('Hips'), hipT = kb('Hips');
  const hipRestS = root.worldToLocal(hipS.getWorldPosition(new THREE.Vector3()));
  const hipRestT = root.worldToLocal(hipT.getWorldPosition(new THREE.Vector3()));
  // tools move from the rig's fist to the dummy's hand, keeping how they sit in the hand
  const fistS = bone('Fist.R').getWorldPosition(new THREE.Vector3()), handT = kb('RightHand');
  const shift = handT.getWorldPosition(new THREE.Vector3()).sub(fistS);
  for (const g of Object.values(b.tools)) { scene.attach(g); g.position.add(shift); g.updateMatrixWorld(true); handT.attach(g); }
  b.puppet = { k, pairs, hipS, hipT, hipRestS, hipRestT, ratio: hipRestT.y / Math.max(0.01, hipRestS.y) };
}
// looks: paint the dummy's skin atlas (no look = plain white)
function setLook(b, look) {
  const P = b && b.puppet; if (!P) return;
  paintBody(P, look && HAIR3D[look.hair] ? { ...look, hair: 'buzz' } : look);   // painted buzz under the 3D hair, same color
  setHair3D(b, look);
  setWear3D(b, look);
}
function paintBody(P, look) {
  const skinMesh = (fn) => P.k.traverse(o => { if (o.isMesh && !o.userData.hair) fn(o); });   // 3D hair keeps its own material
  if (!look || look.blank) { if (P.mat !== DUMMY_MAT) { if (P.mat) { P.mat.map.dispose(); P.mat.dispose(); } P.mat = DUMMY_MAT; skinMesh(o => { o.material = DUMMY_MAT; }); } return; }
  if (P.mat && P.mat !== DUMMY_MAT) { paintSkin(P.mat.map.image, look); P.mat.map.needsUpdate = true; return; }
  const t = new THREE.CanvasTexture(paintSkin(document.createElement('canvas'), look)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  P.mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  skinMesh(o => { o.material = P.mat; });
}
// 3D hair (decision 64) on the dummy's Head bone; rebuilt only when the style changes
function setHair3D(b, look) {
  const under = hairUnderHat(look);   // a hat cuts away the hair above the hat line (wear3d.js)
  const P = b.puppet, style = look && !look.blank && HAIR3D[look.hair] ? look.hair : null, key = style && style + ':' + under;
  if (P.hairStyle !== key) {
    if (P.hair) { P.hair.parent.remove(P.hair); P.hair.userData.mat.dispose(); P.hair = null; }
    if (style) { P.hair = hairFor(style, M.dummy.scene, M.dummy.animations[0], SkeletonUtils.clone, under); P.k.getObjectByName('Head').add(P.hair); }
    P.hairStyle = key;
  }
  if (P.hair) P.hair.userData.mat.color.set(look.hairColor);
}
// hats, skirts and hoods (src/wear3d.js) on the dummy's bones; rebuilt only when the look's pieces or colors change
function setWear3D(b, look) {
  const P = b.puppet, list = wearList(look), key = JSON.stringify(list);
  if (P.wearKey === key) return;
  for (const g of P.wear || []) { g.parent.remove(g); g.children.forEach(m => m.material.dispose()); }
  P.wear = list.map(it => { const w = wearFor(it, M.dummy.scene, M.dummy.animations[0], SkeletonUtils.clone); P.k.getObjectByName(w.boneName).add(w.group); return w.group; });
  P.wearKey = key;
}
// a simple hat (stacked cylinders) on the dummy's head; parts = [radiusTop, radiusBottom, height, y] as fractions of body height
function kHat(b, color, parts) {
  const k = b.puppet.k; k.updateMatrixWorld(true);
  const head = k.getObjectByName('Head_end').getWorldPosition(new THREE.Vector3()), hb = k.getObjectByName('Head'), H = b.H;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  for (const [rt, rb, h, y] of parts) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt * H, rb * H, h * H, 20), mat);
    m.position.copy(head).add(new THREE.Vector3(0, y * H - 0.06, -0.045 * H)); m.castShadow = true;   // sits back over the middle of the skull (it sat over the forehead, so the back of the head poked up through the brim; Mac, v0.1.93)
    scene.add(m); m.updateMatrixWorld(true); hb.attach(m);
  }
}
const NPC_LOOKS = {
  higgins: { skin: '#ffd9c2', hair: 'buzz', hairColor: '#9aa3ad', eyes: 'dot', mouth: 'smile', beard: 'mustache', top: 'long', topColor: '#6a5a8c', bottom: 'pants', bottomColor: '#2a3354', shoes: '#2b2b2b' },
  fishel: { skin: '#d9825b', hair: 'buzz', hairColor: '#2a1712', eyes: 'happy', mouth: 'grin', beard: 'beard', top: 'long', topColor: '#f2c230', bottom: 'pants', bottomColor: '#2a3354', shoes: '#3a3a3a', hat: 'bucket', hatColor: '#f2c230', hatColor2: '#d9a81e' },
  pike: { skin: '#e8b48f', hair: 'buzz', hairColor: '#d9d6cf', eyes: 'dot', mouth: 'smile', beard: 'beard', top: 'sweater', topColor: '#efe6d2', bottom: 'rolled', bottomColor: '#3d5a80', shoes: '#f2c230', shoeStyle: 'boots', hat: 'beanie', hatColor: '#c8453a', hatColor2: '#c8453a' },   // Old Pike, look A (Mac, v0.1.65)
  rosa: { skin: '#b4643f', hair: 'long', hairColor: '#2a1712', eyes: 'big', mouth: 'smile', blush: true, top: 'tee', topColor: '#e8846a', bottom: 'pants', bottomColor: '#f4e6c8', shoes: '#7a4a2a', hat: 'sunhat', hatColor: '#f2d38a', hatColor2: '#e8846a' },
};
const NPC_HATS = {
  higgins: [0x2b2140, [[0.185, 0.185, 0.015, 0.005], [0.132, 0.128, 0.22, 0.11]]],   // top hat (Fishel's bucket hat and Rosa's sun hat are real 3D hats now, in their looks)
};
function dressNPC(b, who) { setLook(b, NPC_LOOKS[who]); if (NPC_HATS[who]) { const [c, parts] = NPC_HATS[who]; kHat(b, c, parts); } }
function syncPuppet(b) {
  const P = b.puppet; if (!P) return;
  P.k.position.set(0, 0, 0);
  b.root.updateMatrixWorld(true);
  // hips follow the rig's bob and lean, scaled to the dummy's shorter legs
  const now = b.root.worldToLocal(P.hipS.getWorldPosition(_pv));
  now.sub(P.hipRestS).multiplyScalar(P.ratio).add(P.hipRestT);
  P.hipT.parent.worldToLocal(b.root.localToWorld(now)); P.hipT.position.copy(now);
  for (const { s, t, off } of P.pairs) {
    s.getWorldQuaternion(_pq).multiply(off);
    t.parent.getWorldQuaternion(_pq2).invert();
    t.quaternion.copy(_pq2.multiply(_pq));
    t.updateMatrixWorld(true);
  }
}
function syncPuppets() {
  // ANIM: after the copy, stand upright while idle (anim.posture); fishing and farm tools keep their own poses
  const busy = farm.mode !== 'off' ? 2 : fishing.state !== 'idle' || rodState.w > 0.01 ? 1 : 0;
  for (const b of [body, higgins && higgins.b, fishel && fishel.b, rosa && rosa.b, pike && pike.b]) if (b && b.root.visible) { syncPuppet(b); anim.posture(b, b === body ? busy : pike && b === pike.b ? 1 : 0); }
  placePikeRod(); placeHandRod();
  // hanging from a farm tool: the dummy's arms are shorter than the rig's, so lift it until its hands meet the handle
  const P = body && body.puppet; if (!P) return;
  const tm = farmToolMesh[farmSel()];
  if (tm && tm.visible && farm.mode !== 'off') {
    const k = P.k, l = k.getObjectByName('LeftHand').getWorldPosition(new THREE.Vector3()), r = k.getObjectByName('RightHand').getWorldPosition(_pv);
    const slump = oneHand() ? SLUMP[window.__slump || SLUMP_PICK] : null;
    const mid = slump ? r.clone() : l.add(r).multiplyScalar(0.5);   // one hand: the right hand meets the handle
    const a = body.root.worldToLocal(tm.position.clone()), c = body.root.worldToLocal(mid);
    if (slump) {
      // head flops over away from the held arm, chin dropping; the left knee bends a little
      for (const n of ['Neck', 'Head']) {
        const bn = k.getObjectByName(n);
        bn.rotateOnWorldAxis(_pv.set(0, 0, 1).applyQuaternion(body.root.quaternion), slump.head / 2);
        bn.rotateOnWorldAxis(_pv.set(1, 0, 0).applyQuaternion(body.root.quaternion), slump.drop / 2);
      }
      if (slump.knee) k.getObjectByName('LeftLeg').rotateOnWorldAxis(_pv.set(1, 0, 0).applyQuaternion(body.root.quaternion), -slump.knee);
    } else {
      // the chibi head reaches above the raised hands: tip it back to look up at the tool
      for (const n of ['Neck', 'Head']) { const bn = k.getObjectByName(n); bn.rotateOnWorldAxis(_pv.set(1, 0, 0).applyQuaternion(body.root.quaternion), HEAD_TIP); }
    }
    k.updateMatrixWorld(true);
    k.position.add(a.sub(c)); k.updateMatrixWorld(true);
    if (slump) {
      // put the tool's handle in the fist (between thumb and index), not at the wrist bone
      const fist = k.getObjectByName('RightHandIndex1').getWorldPosition(new THREE.Vector3()).add(k.getObjectByName('RightHandThumb2').getWorldPosition(_pv)).multiplyScalar(0.5);
      const g = TOOL_GRIP[farmSel()];
      tm.position.copy(fist).sub(_pv.set(g[0], g[1], g[2]).multiplyScalar(tm.scale.x).applyQuaternion(tm.quaternion));
    }
  } else if (P.k.position.lengthSq()) { P.k.position.set(0, 0, 0); P.k.updateMatrixWorld(true); }
  if (body.puppet) { const lab = window.__sitLab; if (lab) sitPose(body, SIT[lab.pose || 'A'], 1, clock.elapsedTime, lab.seat ?? null); else if (sit.w > 0) sitPose(body, SIT[sit.pose], sit.e, clock.elapsedTime, sit.seatY); }   // SIT (and its mockup switch)
}

// ---------- wardrobe (decision 63: mockup A + swipe to turn) ----------
const DEFAULT_LOOK = { pack: 'day', packColor: '#f2a531', skin: '#f5b48f', hair: 'short', hairColor: '#4d2414', eyes: 'dot', mouth: 'smile', blush: true, top: 'stripe', topColor: '#ffffff', topColor2: '#3e8fe0', bottom: 'shorts', bottomColor: '#e8a24a', shoes: '#f2654c' };
const WARD_TABS = ['Skin', 'Hair', 'Hat', 'Face', 'Top', 'Bottom', 'Shoes', 'Pack'];
const HAIRS = [['swoop', 'Side swoop'], ['lob', 'Lob'], ['short', 'Side part'], ['bangs', 'Bangs'], ['bob', 'Bob'], ['long', 'Long'], ['spiky', 'Spiky'], ['buzz', 'Buzz'],
  ...['quiff', 'curly', 'mop', 'topknot', 'ponytail', 'pigtails', 'bun', 'lobA1', 'lobA2', 'lobB', 'lobC', 'long3'].map(h => [h, HAIR3D[h]])];
const HAT_LIST = [['', 'No hat'], ...Object.entries(HATS)];
const PATTERNS = [['', 'Plain'], ['dots', 'Dots'], ['check', 'Checks'], ['stars', 'Stars'], ['flowers', 'Flowers']];
const PATTERN_TOPS = ['tee', 'long', 'dress', 'sundress'], TWO_TONE = { stripe: 'Stripe color', overalls: 'Overalls color', dungarees: 'Dungarees color' };
const FACES = [['dot', 'smile'], ['big', 'grin'], ['happy', 'smile'], ['sleepy', 'flat'], ['dot', 'o'], ['big', 'smile']];
const TOPS = [['tee', 'Tee'], ['long', 'Long sleeve'], ['stripe', 'Stripes'], ['overalls', 'Overalls'], ['dungarees', 'Dungarees'], ['hoodie', 'Hoodie'], ['raincoat', 'Rain jacket'], ['sweater', "Fisherman's sweater"], ['dress', 'Dress'], ['sundress', 'Sundress']];
const ward = { on: false, first: false, blend: 0, tab: 'Hair', look: null, vel: 0, drag: null };
const _wardPos = new THREE.Vector3(), _wardLook = new THREE.Vector3(), _camLook = new THREE.Vector3();
function wardCam(pos, look) {
  // close and low, with you in the open space above the sheet
  const sheetH = document.getElementById('wardrobe').offsetHeight || innerHeight * 0.5;
  const ndcY = Math.min(0.75, sheetH / innerHeight);   // where your middle should sit, above screen centre
  const d = 6.3, a = 0.16, py = (player.y || 0) + 0.85;
  pos.set(player.pos.x, py + Math.sin(a) * d, player.pos.z + Math.cos(a) * d);
  const off = Math.atan(ndcY * Math.tan(camera.fov * Math.PI / 360));
  look.set(player.pos.x, py - Math.tan(off) * d * 1.02, player.pos.z);
}
function paintPlayer() { for (const b of Object.values(bodies)) setLook(b, ward.on ? ward.look : S.look); }
function openWardrobe(first = false) {
  if (ward.on) return;
  document.querySelectorAll('.sheet').forEach(x => x.hidden = true);
  if (farm.mode !== 'off') { farmOff(); selectTool('none'); }
  ward.on = true; ward.first = first; ward.vel = 0; ward.tab = ward.tab || 'Hair';
  ward.look = { ...(S.look && !S.look.blank ? S.look : DEFAULT_LOOK) };
  player.walkTo = null; player.faceYaw = 0; joy.dx = joy.dy = 0;
  document.body.classList.add('inward');
  document.getElementById('wardrobe').hidden = false; document.getElementById('wardSwipe').hidden = false;
  document.getElementById('wardHint').hidden = !!S.wardSwiped;
  document.getElementById('wardTitle').textContent = first ? 'Make your look' : 'Wardrobe';
  // empty hands while you dress (tools come back on Done)
  ward.tools = []; for (const b of Object.values(bodies)) for (const g of Object.values(b.tools)) if (g.visible) { ward.tools.push(g); g.visible = false; }
  renderWardrobe(); paintPlayer();
}
function closeWardrobe() {
  for (const g of ward.tools || []) g.visible = true; ward.tools = [];
  S.look = { ...ward.look }; ward.on = false; ward.drag = null; syncPackBtn();
  document.body.classList.remove('inward');
  for (const id of ['wardrobe', 'wardSwipe', 'wardHint']) document.getElementById(id).hidden = true;
  paintPlayer(); commit();
  // GOALS (v0.1.67): Higgins's welcome no longer starts by itself; the first goal walks you over to him and Talk starts it
}
function tickWardrobe(dt) {
  ward.blend = Math.max(0, Math.min(1, ward.blend + (ward.on ? dt : -dt) / 0.5));
  if (!ward.on || ward.drag) return;
  if (Math.abs(ward.vel) > 0.01) { player.yaw += ward.vel * dt; ward.vel *= Math.exp(-2.6 * dt); player.faceYaw = null; }
}
const sw = (c, on, attr) => `<button class="wsw${on ? ' on' : ''}" style="background:${c}" ${attr} aria-label="${c}"></button>`;
function renderWardrobe() {
  const L = ward.look;
  document.getElementById('wardTabs').innerHTML = WARD_TABS.map(t => `<button class="wtab${t === ward.tab ? ' on' : ''}" data-wtab="${t}">${t}</button>`).join('');
  const label = (t) => `<div class="wlab">${t}</div>`;
  const sws = (key, list) => `<div class="wsws">${list.map(c => sw(c, L[key] === c, `data-wset="${key}" data-v="${c}"`)).join('')}</div>`;
  const pills = (key, list) => `<div class="wpills">${list.map(([v, n]) => `<button class="wpill${(L[key] || '') === v ? ' on' : ''}" data-wset="${key}" data-v="${v}">${n}</button>`).join('')}</div>`;
  let h = '';
  if (ward.tab === 'Skin') h = label('Skin tone') + sws('skin', SKIN);
  if (ward.tab === 'Hair') h = `<div class="wchips">${HAIRS.map(([v, n]) => `<button class="wchip${L.hair === v ? ' on' : ''}" data-wset="hair" data-v="${v}" aria-label="${n}"><img src="${CHIPS['hair-' + v]}" alt=""></button>`).join('')}</div>` + label('Hair color') + sws('hairColor', HAIR_COLORS);
  if (ward.tab === 'Face') {
    h = `<div class="wchips">${FACES.map(([e, m], i) => `<button class="wchip${L.eyes === e && L.mouth === m ? ' on' : ''}" data-wface="${i}" aria-label="Face ${i + 1}"><img src="${CHIPS[`face-${e}-${m}`]}" alt=""></button>`).join('')}</div>`;
    h += `<div class="wpills">${[['blush', 'Blush'], ['freckles', 'Freckles'], ['beard', 'Beard'], ['mustache', 'Mustache']].map(([k, n]) =>
      `<button class="wpill${(k === 'beard' || k === 'mustache' ? L.beard === k : L[k]) ? ' on' : ''}" data-wtog="${k}">${n}</button>`).join('')}</div>`;
  }
  if (ward.tab === 'Pack') {   // v0.1.150: an optional backpack with its own colour (more models later)
    h = `<div class="wchips">${[['', 'None'], ...Object.entries(BACKPACKS)].map(([v, n]) => `<button class="wchip${(L.pack || '') === v ? ' on' : ''}" data-wset="pack" data-v="${v}" aria-label="${n}">${v ? `<img src="${packIcon(L.packColor || '#f2a531')}" alt="">` : `<img src="${CHIPS['hair-buzz']}" alt="">`}</button>`).join('')}</div>`;
    if (L.pack) h += label('Color') + sws('packColor', CLOTH);
  }
  if (ward.tab === 'Hat') {
    h = `<div class="wchips">${HAT_LIST.map(([v, n]) => `<button class="wchip${(L.hat || '') === v ? ' on' : ''}" data-wset="hat" data-v="${v}" aria-label="${n}"><img src="${CHIPS[v ? 'hat-' + v : 'hair-buzz']}" alt=""></button>`).join('')}</div>`;
    if (L.hat) h += label('Color') + sws('hatColor', CLOTH) + label('Trim color') + sws('hatColor2', CLOTH);
  }
  if (ward.tab === 'Top') {
    h = pills('top', TOPS) + label('Color') + sws('topColor', CLOTH);
    if (TWO_TONE[L.top]) h += label(TWO_TONE[L.top]) + sws('topColor2', CLOTH);
    if (PATTERN_TOPS.includes(L.top)) { h += label('Pattern') + pills('pattern', PATTERNS); if (L.pattern) h += label('Pattern color') + sws('topColor2', CLOTH); }
  }
  const covers = { overalls: 'overalls cover', dungarees: 'dungarees cover', dress: 'dress covers', sundress: 'sundress covers' }[L.top];
  if (ward.tab === 'Bottom') h = covers ? `<p class="wnote">Your ${covers} your legs. Change the color under Top.</p>`
    : pills('bottom', [['pants', 'Pants'], ['shorts', 'Shorts'], ['rolled', 'Rolled jeans'], ['skirt', 'Skirt']]) + label('Color') + sws('bottomColor', CLOTH);
  if (ward.tab === 'Shoes') h = pills('shoeStyle', [['', 'Sneakers'], ['boots', 'Rain boots']]) + label('Color') + sws('shoes', CLOTH);
  document.getElementById('wardBody').innerHTML = h;
}
function wardSet(key, v) {
  const L = ward.look;
  if (v === '') delete L[key]; else L[key] = v;   // "No hat", "Plain" and "Sneakers" leave the key out, like looks saved before v0.1.54
  if ((TWO_TONE[L.top] || L.pattern) && !L.topColor2) L.topColor2 = '#3e8fe0';
  if (key === 'top' && !PATTERN_TOPS.includes(v)) delete L.pattern;
  if (key === 'hat' && v) { L.hatColor = L.hatColor || '#f2d38a'; L.hatColor2 = L.hatColor2 || '#f2654c'; }
  if (key === 'pack' && v) L.packColor = L.packColor || '#f2a531';
  renderWardrobe(); paintPlayer();
}
document.getElementById('wardrobe').addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.id === 'wardDone') { closeWardrobe(); return; }
  if (t.dataset.wtab) { ward.tab = t.dataset.wtab; renderWardrobe(); return; }
  if (t.dataset.wset) { wardSet(t.dataset.wset, t.dataset.v || ''); return; }
  if (t.dataset.wface) { const [e2, m] = FACES[+t.dataset.wface]; ward.look.eyes = e2; ward.look.mouth = m; renderWardrobe(); paintPlayer(); return; }
  if (t.dataset.wtog) {
    const k = t.dataset.wtog;
    if (k === 'beard' || k === 'mustache') ward.look.beard = ward.look.beard === k ? null : k; else ward.look[k] = !ward.look[k];
    renderWardrobe(); paintPlayer();
  }
});
{
  const sl = document.getElementById('wardSwipe');
  sl.addEventListener('pointerdown', (e) => { ward.drag = { x: e.clientX, t: e.timeStamp }; ward.vel = 0; player.faceYaw = null; sl.setPointerCapture(e.pointerId); e.preventDefault(); });
  sl.addEventListener('pointermove', (e) => {
    if (!ward.drag) return;
    const dx = e.clientX - ward.drag.x, dt = Math.max(1, e.timeStamp - ward.drag.t) / 1000;
    player.yaw += dx * 0.013; ward.vel = ward.vel * 0.5 + (dx * 0.013 / dt) * 0.5;
    ward.drag = { x: e.clientX, t: e.timeStamp };
    if (Math.abs(dx) > 2 && !S.wardSwiped) { S.wardSwiped = true; document.getElementById('wardHint').hidden = true; }
  });
  const up = () => { if (ward.drag && performance.now() - ward.drag.t > 120) ward.vel = 0; ward.drag = null; };
  sl.addEventListener('pointerup', up); sl.addEventListener('pointercancel', up);
}
document.getElementById('menuWard').addEventListener('click', () => openWardrobe(false));

// ---------- monsters ----------
const monsters = [];
function makeMonster(kind, x, z, height) {
  const root = SkeletonUtils.clone(M.blobs.scene);
  root.traverse(o => { if (o.name && o.name.startsWith('MON_') && o.name !== 'MON_' + kind) o.visible = false; });
  root.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.castShadow = true; } });
  const holder = new THREE.Group(); holder.add(root); scene.add(holder);
  // measure only the visible monster
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o.isMesh && isShown(o)) box.expandByObject(o); });
  const s = height / Math.max(0.001, box.max.y - box.min.y);
  root.scale.multiplyScalar(s);
  root.updateMatrixWorld(true);
  const b2 = new THREE.Box3(); root.traverse(o => { if (o.isMesh && isShown(o)) b2.expandByObject(o); });
  const c = b2.getCenter(new THREE.Vector3());
  root.position.x -= c.x; root.position.z -= c.z; root.position.y -= b2.min.y;
  const mixer = new THREE.AnimationMixer(root);
  if (!M.blobClip && M.blobs.animations[0]) {
    const names = new Set(); M.blobs.scene.traverse(o => names.add(o.name));
    const c0 = M.blobs.animations[0];
    M.blobClip = new THREE.AnimationClip(c0.name, c0.duration, c0.tracks.filter(t => names.has(t.name.split('.')[0])));
  }
  if (M.blobClip) mixer.clipAction(M.blobClip).play();
  const m = { kind, holder, root, mixer, home: new THREE.Vector3(x, 0, z), pos: new THREE.Vector3(x, 0, z), hp: 18, max: 18,
    hop: Math.random() * 3, target: new THREE.Vector3(x, 0, z), flash: 0, dead: 0, h: height };
  holder.position.set(x, groundY(x, z), z);
  monsters.push(m);
  return m;
}
function isShown(o) { let p = o; while (p) { if (!p.visible) return false; p = p.parent; } return true; }

// ---------- fish jumps ----------
let fishJump = null; let nextFish = 3;
const splashes = [];
function startFishJump(x, z, fish) {
  fish = fish || FISH[Math.floor(Math.random() * 4)];   // ambient jumps: common/uncommon fish
  const g = M.fish[fish.model];
  if (!g) { ensureFish(); return; }   // still loading: skip this jump
  const f = SkeletonUtils.clone(g.scene);
  if (fish.tint) f.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); const hsl = {}; o.material.color.getHSL(hsl); if (hsl.l > 0.25) o.material.color.lerp(new THREE.Color(fish.tint), 0.75); } });
  const box = new THREE.Box3().setFromObject(f); const len = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  f.scale.multiplyScalar(fish.len / len);
  const holder = new THREE.Group(); holder.add(f); scene.add(holder);
  const mixer = new THREE.AnimationMixer(f); if (g.animations[0]) mixer.clipAction(g.animations[0]).play();
  const dir = Math.random() * Math.PI * 2;
  fishJump = { holder, mixer, t: 0, dur: 1.15, x, z, dx: Math.cos(dir) * 1.4, dz: Math.sin(dir) * 1.4, dir };
  addSplash(x, z);
}
let splashGeo = null;
function addSplash(x, z, onLand) {
  splashGeo = splashGeo || new THREE.RingGeometry(0.15, 0.24, 24);
  const ring = new THREE.Mesh(splashGeo, new THREE.MeshBasicMaterial({ color: onLand ? 0xbfe9f5 : 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, onLand ? groundY(x, z) + 0.14 : WATER_Y + 0.08, z); scene.add(ring);
  splashes.push({ ring, t: 0 });
}

// ---------- player ----------
let bodies = {}, body;
const player = { wasWild: false, pos: new THREE.Vector3(0.9, 0, -2.4), yaw: Math.PI, vel: new THREE.Vector3(), atkCd: 0, atkT: 0 };
function setBody(k) {
  for (const [kk, b] of Object.entries(bodies)) b.root.visible = kk === k;
  body = bodies[k];
}
// ANIM: the look Mac picked (Nov 14: B's walk and idle + the Universal Animation Library long jog;
// Nov 15: relaxed upright standing posture, arms in, fists); 'now' brings back v0.1.51
const ANIM_LOOK = 'rw1';   // Nov 16: + finish the last step, stand up in stages (A), runner arms, real fists; Nov 18: elbows out more
// move every player body at ground speed v (m/s); the legs keep pace with the ground
function locomote(v, dt) { for (const b of Object.values(bodies)) anim.locomote(b, v, dt); }
// play a one-shot on the upper body while the legs keep walking
function upperOneShot(key, dur) { for (const b of Object.values(bodies)) anim.upperOneShot(b, key, dur); }
function tickUpper(dt) { for (const b of Object.values(bodies)) anim.tickUpper(b, dt); }
// where the legs are in their cycle, for footstep sounds: 0 = left foot lands, 0.5 = right foot lands (null on a look with no cycle)
function stepPhase() { const g = body && body.gait; return g && g.front ? g.phase - g.front.Walk : null; }
// chatting: the NPC you talk to plays the talk loop; the player joins in, toned down (Mac)
const baitSheet = document.getElementById('baitShop'), rosaSheet = document.getElementById('rosaShop');
function tickTalk() {
  const f = !baitSheet.hidden, r = !rosaSheet.hidden, h = dlg.open;
  if (higgins) anim.setTalk(higgins.b, h);
  if (fishel) anim.setTalk(fishel.b, f);
  if (rosa) anim.setTalk(rosa.b, r);
  for (const b of Object.values(bodies)) anim.setTalk(b, h || f || r, 0.35);
}

// ---------- input: floating joystick ----------
const joyBase = document.getElementById('joyBase'), joyKnob = document.getElementById('joyKnob'), hint = document.getElementById('hint');
const joy = { id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
// placement tools (hoe, seeds): press and hold to aim with a magnifier, release to place
const aim = { on: false, timer: null, x: 0, y: 0, cell: null };
const placing = () => tool === 'seeds' && player.pos.z < FENCE_Z;
function showJoy() { joyBase.style.left = joy.ox + 'px'; joyBase.style.top = joy.oy + 'px'; joyBase.hidden = false; joyKnob.style.transform = 'translate(0px,0px)'; }
canvas.addEventListener('pointerdown', (e) => {
  if (joy.id !== null) return;
  joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.dx = joy.dy = 0; joy.t0 = e.timeStamp; joy.far = false;
  player.walkTo = null; hint.hidden = true;
  if (decor.on && decor.ghost) { ghostGrab(e.clientX, e.clientY); joy.ghost = true; canvas.setPointerCapture(e.pointerId); e.preventDefault(); return; }
  joy.ghost = false; joy.farm = false;
  if (farm.mode === 'tray') { joy.id = null; farmOff(); selectTool('none'); e.preventDefault(); return; }   // tap away: put the tray away and land
  if (farm.mode === 'ready') { joy.farm = true; farmGrab(e.clientX, e.clientY); canvas.setPointerCapture(e.pointerId); e.preventDefault(); return; }
  if (farm.mode !== 'off') { joy.id = null; e.preventDefault(); return; }
  if (placing()) {
    clearTimeout(aim.timer);
    aim.timer = setTimeout(() => { if (joy.id === e.pointerId && !joy.far) startAim(joy.ox, joy.oy); }, 280);
  } else showJoy();
  canvas.setPointerCapture(e.pointerId); e.preventDefault();
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== joy.id) return;
  if (joy.ghost) { ghostDrag(e.clientX, e.clientY); return; }
  if (joy.farm) { farmDrag(e.clientX, e.clientY); return; }
  if (aim.on) { moveAim(e.clientX, e.clientY); return; }
  let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const L = Math.hypot(dx, dy), R = 50;
  if (L > 12 && !joy.far) { joy.far = true; clearTimeout(aim.timer); if (joyBase.hidden) showJoy(); }
  if (!joy.far) return;
  if (L > R) { dx *= R / L; dy *= R / L; }
  joy.dx = dx / R; joy.dy = dy / R;
  joyKnob.style.transform = `translate(${dx}px,${dy}px)`;
});
const endJoy = (e) => {
  if (e.pointerId !== joy.id) return;
  if (joy.ghost) { joy.id = null; joy.ghost = false; return; }
  if (joy.farm) { joy.id = null; joy.farm = false; farmLetGo(); return; }
  clearTimeout(aim.timer);
  const wasAim = aim.on;
  const quick = !joy.far && !wasAim && e.timeStamp - joy.t0 < 300;
  joy.id = null; joy.dx = joy.dy = 0; joyBase.hidden = true;
  if (wasAim) endAim(e.type === 'pointerup');
  else if (quick && e.type === 'pointerup') { if (decor.on) decorTap(e.clientX, e.clientY); else if (!pets.tap(e.clientX, e.clientY) && !animals.tap(e.clientX, e.clientY)) handleTap(e.clientX, e.clientY); }   /* PETS: a tap on your pet opens its buttons */   // ANIMALS: a tap on the coop or pond opens its card
};
canvas.addEventListener('pointerup', endJoy); canvas.addEventListener('pointercancel', endJoy);
document.addEventListener('gesturestart', e => e.preventDefault());
// iOS: stop the text-selection magnifier and double-tap zoom on the game view
canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', e => e.preventDefault());
document.addEventListener('selectstart', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault());

// ---------- icons ----------
const ICON = {
  sword: '<path d="M14.5 3.5h6v6L10 20l-3-3z"/><path d="M5 15l4 4M3.5 20.5l2.5-2.5"/>',
  rod: '<path d="M4 20L18 4"/><path d="M18 4c1.5 3 1.5 8 0 12"/><circle cx="18" cy="17.5" r="1.5"/><path d="M4 20l2-1"/>',
  hoe: '<path d="M5 20L17 8"/><path d="M14 5l5 5-2 2-5-5z"/>',
  shovel: '<path d="M12 2v10"/><path d="M9 2h6"/><path d="M8 12h8l-1 6-3 3-3-3z"/>',
  saw: '<path d="M3 15l13-8 3 5-13 8z"/><path d="M5.5 17.5l1 1.6M8.5 15.7l1 1.6M11.5 13.9l1 1.6"/><path d="M16 7l3-2 1.6 2.6-2.6 2"/>',
  pick: '<path d="M12 8L5 21"/><path d="M3.5 8c4-4.5 12.5-4.5 17 1.5"/>',
  hand: '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7s-5-2-6.5-5L3 11.5a1.5 1.5 0 0 1 2.5-1.5L8 13"/>',
  seeds: '<path d="M7 9c0-3 2-5 5-5s5 2 5 5v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/><path d="M9 8h6"/><circle cx="11" cy="13" r="1"/><circle cx="13.5" cy="16" r="1"/>',
  fruit: '<path d="M12 7c-4-2-8 1-7 6 1 4 4 7 7 6 3 1 6-2 7-6 1-5-3-8-7-6z"/><path d="M12 7c0-2 1-3 3-4"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  sunrise: '<path d="M4 18h16"/><path d="M7 18a5 5 0 0 1 10 0"/><path d="M12 6V9M5 11l1.5 1.5M19 11l-1.5 1.5"/>',
  sunset: '<path d="M4 18h16"/><path d="M7 18a5 5 0 0 1 10 0"/><path d="M12 9V6M10 8l2-2 2 2"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  fish: '<path d="M3 12c3-4 8-5 12-3l4-3v12l-4-3c-4 2-9 1-12-3z"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6zM12 14c0-3-2-5-6-5 0 3 2 5 6 5z"/>',
  basket: '<path d="M4 10h16l-2 9H6z"/><path d="M8 10l4-6 4 6"/>',
  chat: '<path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  worm: '<path d="M4 15c2-4 4 2 6-2s4 2 6-2 3 0 4 1"/><circle cx="20" cy="12" r="0.6"/>',
  shrimp: '<path d="M18 6c-6-1-11 3-11 8 0 3 2 5 5 5"/><path d="M18 6c1 3-1 7-5 8"/><path d="M12 19l-2 2M12 19l1 2"/><path d="M18 6l3-2M18 6l3 1"/>',
  lure: '<path d="M7 8c3-3 9-3 11 1s-1 8-5 8-8-5-6-9z"/><circle cx="14" cy="10" r="1"/><path d="M7 8L4 5M12 17l-1 4M11 21c1 0 2-1 2-2"/>',
  hook: '<path d="M12 3v10a4 4 0 1 1-8 0"/><path d="M4 13l2-2"/>',
  decor: '<path d="M4 20h16"/><path d="M6 20V10l6-5 6 5v10"/><path d="M10 20v-5h4v5"/>',
  bench: '<path d="M3 11h18"/><path d="M4 11V8h16v3"/><path d="M5 11v6M19 11v6M5 14h14"/>',
  lantern: '<path d="M12 21V9"/><path d="M8 21h8"/><path d="M9 4h6l1 5H8z"/><path d="M12 2v2"/>',
  fence: '<path d="M5 20V7l2-2 2 2v13M15 20V7l2-2 2 2v13"/><path d="M3 10h18M3 16h18"/>',
  flowers: '<circle cx="12" cy="8" r="2.5"/><path d="M12 10.5V21M12 16c-3 0-4-2-4-3 2 0 4 1 4 3zM12 18c3 0 4-2 4-3-2 0-4 1-4 3"/>',
  barrel: '<path d="M7 4h10c1.5 3 1.5 13 0 16H7C5.5 17 5.5 7 7 4z"/><path d="M6 9h12M6 15h12"/>',
  crate: '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M4 5l16 14M20 5L4 19"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  pin: '<path d="M12 17v4M8 3h8l-1 6 3 3H6l3-3z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  sit: '<path d="M3 11h18"/><path d="M5 11v8"/><path d="M19 11v8"/><path d="M5 15h14"/>', stand: '<path d="M12 19V6"/><path d="M6 12l6-6 6 6"/>',   // SIT
  board: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M7 20l1-4M17 20l-1-4M7 8h4M7 11h6M14 8h3"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8"/>',
  bobber: '<path d="M12 2v4"/><circle cx="12" cy="13" r="6"/><path d="M6 13h12"/>',
  reel: '<circle cx="11" cy="12" r="6.5"/><circle cx="11" cy="12" r="2"/><path d="M17.5 12H21"/><path d="M21 9.5v5"/>',
  shears: '<path d="M12 12.5L8 3M12 12.5L16 3"/><circle cx="8.5" cy="17.5" r="3.2"/><circle cx="15.5" cy="17.5" r="3.2"/><path d="M12 12.5L9.6 14.6M12 12.5l2.4 2.1"/>',
  fert: '<path d="M8 8c-2.5 3-4 6.5-3.5 10 .3 2 1.800 3 3.500 3h8c1.700 0 3.200-1 3.500-3 .5-3.500-1-7-3.500-10z"/><path d="M8.500 8c.6-1.500.2-3-.5-4.500 1.300.6 2.600.8 4 .8s2.700-.2 4-.8c-.7 1.500-1.100 3-.5 4.500"/><path d="M12 18c0-2.500.8-4 2.600-5 0 2.500-.8 4-2.600 5z"/>',
  can: '<path d="M5 10h10v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M15 13l5-4.5"/><path d="M7 10V8a3 3 0 0 1 6 0v2"/><path d="M19.5 6.5l1 -1M21 9l1.3-.3"/>',
};
const svg = (k, c = '#2b2140', sz = 28, w = 2.2) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

// ---------- hotbar ----------
const TOOLS = [
  ...(FEATURES.combat ? [{ id: 'sword', name: 'Sword' }] : []),
  { id: 'rod', name: 'Fishing rod' }, { id: 'farm', get name() { return FARM_TOOLS[farmSel()].name; } },
  { id: 'seeds', get name() { return ITEMS[seedSel()].name; }, get item() { return seedSel(); } },
  { id: 'fruit', name: 'Harvest basket' },
  { id: 'decor', name: 'Decorate' },
];
let tool = 'none', toolBeforeWilds = null;   // empty hands at the start (Mac)
const hotbar = document.getElementById('hotbar');
function renderHotbar() {
  const bb = bestBait();
  const badge = (t) => t.id !== 'rod' ? '' : bb ? `<span class="bait" title="${BAIT[bb].name}">${svg(bb, '#2b2140', 14, 2.2)}${invCount(bb)}</span>` : `<span class="bait" style="background:#ffd6cc" title="No bait">${svg('worm', '#2b2140', 14, 2.2)}0</span>`;   // FISHING
  const harvestN = CROP_ORDER.reduce((n, id) => n + invCount(id), 0);
  const icon = (t) => t.id === 'seeds' ? `<span class="seedpk big">${cropImg(ITEMS[seedSel()].crop, 22)}</span>` : t.id === 'farm' ? svg(FARM_TOOLS[farmSel()].icon) : svg(t.id);
  const count = (t) => t.id === 'fruit' ? `<span class="n">${harvestN}</span>` : t.item ? `<span class="n">${invCount(t.item)}</span>` : '';
  hotbar.innerHTML = goals.bar(TOOLS).map(t => `<button class="slot${t.id === tool ? ' on' : ''}" data-tool="${t.id}" aria-label="${t.name}${t.id === 'rod' ? ', bait: ' + (bb ? BAIT[bb].name : 'none') : ''}" aria-pressed="${t.id === tool}">${icon(t)}${count(t)}${badge(t)}${t.id === tool ? `<span class="sx">${svg('x', '#2b2140', 14)}</span>` : ''}</button>`).join('');   // the tool you hold gets a small ✕: tap to put it away (mockup B, v0.1.85)
  renderSeedTray(); renderFarmTray();
  document.querySelector('#toolName span').textContent = tool === 'none' ? 'Empty hands' : TOOLS.find(t => t.id === tool).name;
}
let toolNameT = 0;
function selectTool(id, quiet) {
  tool = id; renderHotbar(); showHeldTool();
  document.getElementById('toolName').hidden = false; toolNameT = quiet ? 0.9 : 1.6;
}
hotbar.addEventListener('click', (e) => {
  const b = e.target.closest('.slot'); if (!b) return;
  if (farm.mode === 'drag' || farm.mode === 'land') return;   // busy: let the swipe finish
  if (b.dataset.tool === 'decor') { farmOff(); enterDecor(); return; }
  toolBeforeWilds = null;
  if (b.dataset.tool === 'farm') { if (tool === 'farm') { farmOff(); selectTool('none'); } else { selectTool('farm'); farmOpen(); } return; }
  farmOff(); selectTool(b.dataset.tool === tool ? 'none' : b.dataset.tool);
});


// ---------- seed bag tray (mockup A): pick which seed the bag plants ----------
const seedTray = document.getElementById('seedTray');
function seedSel() {
  const want = S.seedSel && ITEMS[S.seedSel] ? S.seedSel : 'seed_turnip';
  if (invCount(want) > 0) return want;
  const have = CROP_ORDER.map(id => CROPS[id].seed).find(sd => invCount(sd) > 0);   // ran out: switch to a seed you have
  return have || want;
}
function renderSeedTray() {
  const show = tool === 'seeds' && !decor.on;
  seedTray.hidden = !show; if (!show) return;
  const owned = CROP_ORDER.filter(id => invCount(CROPS[id].seed) > 0), sel = seedSel();
  seedTray.querySelector('.stitle').textContent = owned.length ? 'Seeds \u00b7 tap one to plant it' : `No seeds \u2014 ${seedSeller()} sells them`;
  seedTray.querySelector('.srow').innerHTML = owned.map(id => {
    const c = CROPS[id], sd = c.seed;
    return `<button class="schip${sd === sel ? ' on' : ''}" data-seed="${sd}" aria-pressed="${sd === sel}" aria-label="${c.name} seeds, ${invCount(sd)}, grows in ${c.growMinutes} minutes">${cropImg(id, 26)}<span class="sn">${c.name}</span><span class="st">${c.growMinutes}m</span><b>${invCount(sd)}</b></button>`;
  }).join('');
}
seedTray.addEventListener('click', (e) => {
  const b = e.target.closest('[data-seed]'); if (!b) return;
  S.seedSel = b.dataset.seed; commit(); renderHotbar();
  document.querySelector('#toolName span').textContent = ITEMS[S.seedSel].name; document.getElementById('toolName').hidden = false; toolNameT = 1.2;
});

// ---------- two-handed rod: arms solved with simple IK, rod angle animated for the cast ----------
const rodState = { w: 0, a: 0.75, lw: 0 };
let worldRod, worldRodTip;
function makeWorldRod() {
  worldRod = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.017, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.6 }));
  shaft.position.y = 0.58; shaft.castShadow = true; worldRod.add(shaft);           // rod runs along +Y from the butt
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.26, 8), new THREE.MeshStandardMaterial({ color: 0x3b3355, roughness: 0.8 }));
  grip.position.y = 0.0; worldRod.add(grip);
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.4 }));
  reel.rotation.z = Math.PI / 2; reel.position.set(0.03, 0.12, 0); worldRod.add(reel);
  worldRodTip = new THREE.Object3D(); worldRodTip.position.y = 1.28; worldRod.add(worldRodTip);
  worldRod.visible = false; scene.add(worldRod);
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
function aimBone(bone, childLocal, target, w) {
  const P = bone.getWorldPosition(_v1);
  bone.getWorldQuaternion(_q1);
  const cur = childLocal.clone().normalize().applyQuaternion(_q1);
  const want = _v2.copy(target).sub(P).normalize();
  _q2.setFromUnitVectors(cur, want).multiply(_q1);                 // desired world rotation
  bone.parent.getWorldQuaternion(_q3).invert();
  const local = _q3.multiply(_q2);
  bone.quaternion.slerp(local, w);
  bone.updateMatrixWorld(true);
}
// shears (Mac): one hand, slumped like a teddy bear carried by one arm. roll: body tilt off the held arm; head: sideways flop;
// drop: chin down; knee: bend in the left knee
const SLUMP = { a: { roll: 0.3, head: 0.35, drop: 0.1, knee: 0 }, b: { roll: 0.45, head: 0.3, drop: 0.25, knee: 0.5 }, c: { roll: 0.62, head: 0.85, drop: 0.4, knee: 0.9 } };
// every farm tool is held this way (Mac: the hoe and can match the shears, v0.1.30)
const oneHand = () => !!farmSel();
let SLUMP_PICK = 'b';   // Mac picked B (teddy bear), head flopping away from the held arm
const DOWNV = new THREE.Vector3(0, -1, 0), _fr = new THREE.Quaternion(), _fz = new THREE.Vector3();
function solveArm(b, side, target, poleDir, w) {
  const up = b.bones['UpperArm.' + side], lo = b.bones['LowerArm.' + side], fist = b.bones['Fist.' + side];
  const S = up.getWorldPosition(new THREE.Vector3());
  const l1 = b.len['UpperArm.' + side], l2 = b.len['LowerArm.' + side];
  const T = target.clone(); const toT = T.clone().sub(S); let d = toT.length();
  const maxD = (l1 + l2) * 0.98; if (d > maxD) { toT.setLength(maxD); T.copy(S).add(toT); d = maxD; }
  const cosA = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const along = toT.clone().normalize();
  const perp = poleDir.clone().sub(along.clone().multiplyScalar(poleDir.dot(along))).normalize();
  const elbow = S.clone().addScaledVector(along, l1 * cosA).addScaledVector(perp, l1 * Math.sqrt(1 - cosA * cosA));
  aimBone(up, lo.position, elbow, w);
  aimBone(lo, fist.position, T, w);
}
// fishing: idle -> flick (tap Cast) -> flight -> wait -> bite -> catch -> reel -> idle
const CAST_DIST = 7.5;   // how far a tap-cast lands, in metres. Back to the long cast in v0.1.128 (Mac: "we can cast out further like before since we bring the fish in"); it was 3.4 from v0.1.110 so the fish stayed in view.
const fishing = { state: 'idle', t: 0, land: new THREE.Vector3(), from: new THREE.Vector3(), wait: 3, dist: 0, a: 0.75 };
function bestBait() { return BAIT_ORDER.find(b => invCount(b) > 0) || null; }   // FISHING: no bare hook any more
function setFish(st) { fishing.state = st; fishing.t = 0; }
let aimHint = null;   // AIM: set up below
// AIM (v0.1.129): the Cast button never lands the bobber off the screen. If the long cast would, it's pulled in toward you
// (down to about 2.6 m) until the landing spot shows.
function castTarget() {
  const p = castTargetFar(); if (!aimHint || aimHint.inView(p, WATER_Y)) return p;
  const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z); if (d < 2.7) return p;
  for (let k = 0.9; k * d >= 2.6; k -= 0.05) { const q = new THREE.Vector3(player.pos.x + (p.x - player.pos.x) * k, 0, player.pos.z + (p.z - player.pos.z) * k); if (aimHint.inView(q, WATER_Y) && aimWater(q.x, q.z)) return q; }
  return p;
}
function castTargetFar() {
  const ft = player.pos.z > -2.6 ? spots.freshTarget(player.pos.x, player.pos.z) : null; if (ft) return new THREE.Vector3(ft.x, 0, ft.z);   // FISHING: by the river or lake, cast there
  // aim the way you face; if you face inland, aim out to sea
  const f = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  if (onDock(player.pos.x, player.pos.z)) { if (Math.abs(f.x) < 0.35 && f.z > -0.5) f.set(Math.sign(f.x || 1), 0, -0.4); }
  else if (f.z > -0.3) f.set(f.x * 0.5, 0, -1);
  f.normalize();
  const p = player.pos.clone().addScaledVector(f, CAST_DIST + tackle.seaReach());   // TACKLE: the sea cast zips further out
  p.z = Math.min(p.z, -5.4);
  if (Math.abs(p.x - DOCK.x) < DOCK.half + 0.7 && p.z > DOCK.zFar - 1) p.x = DOCK.x + Math.sign(p.x - DOCK.x || 1) * (DOCK.half + 1.0);
  if (shipBlocks(player.pos.x, player.pos.z, p.x, p.z)) { p.x = DOCK.x + Math.sign(f.x || 1) * (DOCK.half + 2.6); p.z = Math.min(-5.4, Math.max(player.pos.z - 1.2, -10.6 - DOCK_ADD)); }   // the ship's at the end of the dock: cast off the side
  return p;
}
function beginCast(target) {
  if (!bestBait()) { toast(spots.noBaitWhy()); return; }   // FISHING: no bait, no cast
  if (shipBlocks(player.pos.x, player.pos.z, target.x, target.z)) { toast('The ship is in the way. Cast off the side of the dock.'); return; }
  fishing.place = spots.placeAt(target.x, target.z, player.pos.x, player.pos.z, onDock(player.pos.x, player.pos.z));   // FISHING
  ensureFish();
  fishing.land.copy(target); fishing.land.y = WATER_Y + 0.03;
  fishing.dist = Math.hypot(target.x - player.pos.x, target.z - player.pos.z);
  // one bait per cast, best bait first
  fishing.bait = bestBait();
  addItem(fishing.bait, -1); renderHotbar(); commit();
  player.faceYaw = Math.atan2(target.x - player.pos.x, target.z - player.pos.z);
  setFish('flick'); audio.play(tackle.castSound(fishing.place));   // TACKLE: Zip at sea, Plop on the river and lake
}
function rollCast() { return rollFish(fishing.bait || 'worm', todKey, Math.random, { place: fishing.place, rain: weather.level > 0, rocks: fishing.place === 'river' && spots.nearRocks(fishing.land.x, fishing.land.z) }); }   // river rocks are hot spots (v0.1.61)   // FISHING: by place, season and rain
function landFish() {
  if (fishing.state !== 'bite' && fishing.state !== 'fight') return;
  const fish = fishing.fish || rollCast();   // REEL: the fish was picked when the bobber landed
  fishing.rec = dex.record(fish, rollSize(fish));   // FISHING: its size, and your biggest
  setFish('catch'); audio.play('catch');
  if (!fishIcon[fish.id]) startFishJump(fishing.land.x, fishing.land.z, fish);   // picture not ready (very slow connection): the old 3D jump
  else addSplash(fishing.land.x, fishing.land.z);
  addItem(fish.id, 1); S.caught[fish.id] = (S.caught[fish.id] || 0) + 1; addXP(XP.catch + (S.caught[fish.id] === 1 ? XP.newFish : 0)); commit();
  showCatch(fish);
}
function reelIn() { if (fishing.state !== 'idle' && fishing.state !== 'reel') { setFish('reel'); audio.play('reel'); } }
// AIM (v0.1.129, mockup C): the landing spot for Cast, and a hand teaching the water tap until you've tap-cast twice
aimHint = createAimHint({ THREE, camera, handSrc: './assets/ui/hand.svg' }); const aim2 = { t: 0, at: null, tap: null };
const AIM_TAPS = 2;
function aimWater(x, z) { return (spots.isWet(x, z) || z < -5.4) && !onDock(x, z) && !tackle.onDeck(x, z) && !shipBlocks(player.pos.x, player.pos.z, x, z); }
function updateAimHint(dt) {
  const on = tool === 'rod' && fishing.state === 'idle' && useAction && useAction.kind === 'cast' && !useBtn.hidden && !decor.on && !busyForLevelCard();
  if (!on) { if (aim2.at) { aim2.at = null; aimHint.update(null); } aim2.t = 0; return; }
  aim2.t -= dt;
  if (aim2.t <= 0) {                                              // a few times a second is plenty
    aim2.t = 0.2; aim2.at = castTarget(); aim2.tap = null;
    if ((S.tapCasts || 0) < AIM_TAPS) {
      const dx = aim2.at.x - player.pos.x, dz = aim2.at.z - player.pos.z;
      for (const [ang, k] of [[-0.55, 0.72], [0.55, 0.72], [-0.3, 0.6], [0.3, 0.6], [-0.8, 0.8], [0.8, 0.8]]) {   // a spot off to one side of the landing spot
        const c = Math.cos(ang), n = Math.sin(ang), x = player.pos.x + (dx * c - dz * n) * k, z = player.pos.z + (dx * n + dz * c) * k;
        if (aimWater(x, z) && aimHint.onScreen({ x, z }, WATER_Y)) { aim2.tap = { x, z }; break; }
      }
    }
  }
  aimHint.update(aim2.at, aim2.tap, WATER_Y);
}
function updateFishing(dt) {
  updateAimHint(dt);
  const F = fishing; F.t += dt;
  if (tool !== 'rod' && F.state !== 'idle') setFish('idle');
  reel.update(dt);   // REEL: nibbles and the fight
  if (player.moving && ['flick', 'flight', 'wait', 'bite'].includes(F.state)) reelIn();
  const e = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  switch (F.state) {
    case 'idle': F.a = 0.75 + Math.sin(elapsed * 1.6) * 0.03; break;
    case 'flick': F.a = 1.9 + (0.15 - 1.9) * e(F.t / 0.13); if (F.t > 0.13) { worldRodTip.getWorldPosition(F.from); setFish('flight'); } break;
    case 'flight': F.a = 0.15; if (F.t > tackle.castShape(F.place, F.dist).dur) { addSplash(F.land.x, F.land.z); if (tackle.castKind(F.place) === 'zip') setTimeout(() => addSplash(F.land.x, F.land.z), 110); audio.play(tackle.landSound(F.place));   /* TACKLE: flight time, splash and sound by cast feel */ const bw = BAIT[F.bait || 'worm'].bite; F.wait = settings.debug && settings.instantBite ? DEBUG.biteSeconds : (bw[0] + Math.random() * (bw[1] - bw[0])) * tackle.perks(F.place).bite /* TACKLE: faster rods */ * pets.biteMul() /* PETS: the fish's hearts */; F.fish = rollCast(); reel.onLand(F, settings.debug && settings.instantBite);   /* REEL: which fish is coming, and its fake nibbles */ setFish('wait'); } break;
    case 'wait': F.a = 0.2 + Math.sin(elapsed * 2) * 0.02; if (F.t > F.wait) { setFish('bite'); addSplash(F.land.x, F.land.z); audio.play('bite'); } break;
    case 'bite': F.a = 0.2 - Math.abs(Math.sin(F.t * 18)) * 0.08;
      if (F.t > 2.5 + tackle.perks(F.place).reel) { toast('It got away!'); setFish('reel'); } break;   // TACKLE: better rods give a longer Reel! window
    case 'fight': F.a = reel.rodAngle(); break;   // REEL
    case 'catch': F.a = 0.2 + (1.25 - 0.2) * e(F.t / 0.3); if (F.t > 0.9) setFish('reel'); break;
    case 'reel': F.a = F.a + (0.75 - F.a) * Math.min(1, dt * 6); if (F.t > 0.45) setFish('idle'); break;
  }
}
function bobberTarget(tip, out) {
  const F = fishing;
  if (F.state === 'flight') {
    const cs = tackle.castShape(F.place, F.dist), dur = cs.dur, u = Math.min(1, F.t / dur);   // TACKLE: Plop arcs high and slow, Zip flies flat and fast
    out.lerpVectors(F.from, F.land, u); out.y += Math.sin(Math.PI * u) * cs.arc;
    return true;
  }
  if (F.state === 'wait' || F.state === 'bite') {
    out.copy(F.land); out.y = WATER_Y + 0.03 + Math.sin(elapsed * 4) * 0.02 - (F.state === 'bite' ? 0.07 : 0) - reel.nibbleDip(F);   // REEL: a nibble is a small dip
    return true;
  }
  if (F.state === 'fight') return reel.bobber(out);   // REEL
  if (F.state === 'catch' || F.state === 'reel') {
    const u = F.state === 'catch' ? Math.min(1, F.t / 0.9) * 0.5 : 0.5 + Math.min(1, F.t / 0.45) * 0.5;
    const hang = tip.clone(); hang.y -= 0.42;
    out.lerpVectors(F.land, hang, u); out.y += Math.sin(Math.PI * u) * 0.6;
    return true;
  }
  return false;
}
function applyRodPose(dt) {
  updateFishing(dt);
  // relaxed carry (arm at your side, rod in the hand) unless you're actually fishing
  const r = rodState, want = tool === 'rod' && fishing.state !== 'idle' ? 1 : 0;
  r.w += (want - r.w) * Math.min(1, dt * (want ? 12 : 5));
  worldRod.visible = tool === 'rod' && r.w > 0.5 && body.root.visible;
  for (const bb of Object.values(bodies)) if (bb.tools.rod) bb.tools.rod.visible = tool === 'rod' && !worldRod.visible && !ward.on;   // empty hands in the wardrobe
  if (r.w < 0.01) { r.lw = 0; if (r.lean || r.roll) { r.lean = r.roll = 0; body.root.rotation.x = body.root.rotation.z = 0; } return; }
  const b = body, S = b.H / 1.7;
  // REEL, v0.1.109 (Mac: "the character doesn't animate a struggle while fighting the fish"): in the fight you lean back
  // against the line and pump the rod as you wind, get dragged sideways when the fish darts, and are yanked forward and
  // shaken when it thrashes. window.__fightLab = { pose: 1 | 2 } picks how strong (mockups); 2 is the default.
  const sg = fishing.state === 'fight' ? reel.struggle() : null, amt = sg ? ((window.__fightLab || {}).pose === 1 ? 0.55 : 1) : 0;
  const tE = performance.now() / 1000;
  const wantLean = sg ? amt * (-(0.2 + 0.1 * sg.prog) - (sg.wind ? 0.05 + Math.sin(tE * 7) * 0.05 : 0) + sg.thrash * 0.42) : 0;
  const wantRoll = sg ? amt * (-sg.drag * 0.26 + sg.thrash * Math.sin(tE * 34) * 0.07) : 0;
  r.lean = (r.lean || 0) + (wantLean - (r.lean || 0)) * Math.min(1, dt * 9);
  r.roll = (r.roll || 0) + (wantRoll - (r.roll || 0)) * Math.min(1, dt * 11);
  b.root.rotation.order = 'YXZ'; b.root.rotation.x = r.lean; b.root.rotation.z = r.roll;
  if (sg) b.root.updateMatrixWorld(true);
  const f = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  const right = new THREE.Vector3(-Math.cos(player.yaw), 0, Math.sin(player.yaw));
  const torso = b.bones.Torso.getWorldPosition(new THREE.Vector3());
  r.a = fishing.a + (sg ? amt * (0.28 + (sg.wind ? Math.sin(tE * 7) * 0.12 : 0) - sg.thrash * 0.5) : 0);   // rod held high against the pull, pumped as you wind, dragged down on a thrash
  const lift = fishing.state === 'flick' ? 0.05 * S : 0;
  const grip = torso.clone().addScaledVector(f, 0.3 * S).addScaledVector(right, 0.04 * S).add(new THREE.Vector3(0, -0.1 * S + lift, 0));
  const dir = f.clone().multiplyScalar(Math.cos(r.a)).add(new THREE.Vector3(0, Math.sin(r.a), 0)).addScaledVector(right, sg ? amt * sg.drag * 0.45 : 0).normalize();   // the rod tip follows a darting fish
  // right hand on the grip, left hand a little further up the rod
  const down = new THREE.Vector3(0, -1, 0);
  solveArm(b, 'R', grip, down.clone().addScaledVector(right, 0.6), r.w);
  // one hand while idle or walking and for the flick; the left hand joins just above the right once the line is out
  const both = ['wait', 'bite', 'catch', 'fight'].includes(fishing.state);
  r.lw += ((both ? 1 : 0) - r.lw) * Math.min(1, dt * (both ? 6 : 12));
  if (!r.fixL) r.fixL = new THREE.Vector3();
  if (r.lw > 0.02) solveArm(b, 'L', grip.clone().addScaledVector(dir, 0.085 * S).add(r.fixL), down.clone().addScaledVector(right, -0.6), r.w * r.lw);
  r.dir = dir; r.S = S;
  worldRod.position.copy(grip).addScaledVector(dir, -0.08 * S);
  worldRod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  worldRod.scale.setScalar(S);
}

// fishing line + bobber hang from the rod tip in world space (always straight down), or reach the water while casting
let fishLine, bobber;
function makeLine() {
  const lg = new THREE.CylinderGeometry(0.004, 0.004, 1, 4); lg.translate(0, 0.5, 0);
  fishLine = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: 0xf5f5f5 }));
  bobber = new THREE.Group();
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe0453a, roughness: 0.5 }));
  const bot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
  bobber.add(top, bot); scene.add(fishLine, bobber);
}
const UPV = new THREE.Vector3(0, 1, 0), tipW = new THREE.Vector3(), bobW = new THREE.Vector3();
function updateLine(dt) {
  const handRod = body && body.tools && body.tools.rod;
  const show = !!(worldRod && (worldRod.visible || (handRod && handRod.visible && body.root.visible)));
  fishLine.visible = bobber.visible = show;
  if (!show) return;
  (worldRod.visible ? worldRodTip : handRod.userData.tip).getWorldPosition(tipW);
  if (bobberTarget(tipW, bobW)) { /* bobber placed by the fishing state */ }
  else bobW.set(tipW.x + Math.sin(elapsed * 1.7) * 0.02, tipW.y - 0.42, tipW.z + Math.cos(elapsed * 1.3) * 0.02);
  bobber.position.copy(bobW);
  const dir = bobW.clone().sub(tipW); const len = dir.length();
  fishLine.position.copy(tipW); fishLine.scale.set(1, len, 1); fishLine.quaternion.setFromUnitVectors(UPV, dir.normalize());
}
function showHeldTool() { for (const b of Object.values(bodies)) for (const [id, g] of Object.entries(b.tools || {})) if (id !== 'rod') g.visible = id === tool; }

// ---------- UI ----------
const toastEl = document.getElementById('toast'); let toastT = 0;
// The message hides on its own clock, not the game loop's: inside Nell's store the outdoor loop is paused, so a message
// shown there ("Fountain: town level 5") never went away (Mac, v0.1.115).
let toastTimer = 0;
function toast(msg) { toastEl.querySelector('span').textContent = msg; toastEl.hidden = false; toastT = 0; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200); }
const openSheet = (id) => { document.querySelectorAll('.sheet').forEach(x => x.hidden = x.id !== id); if (id === 'bag') renderBag(); if (id === 'settings') renderSettings(); };
document.getElementById('menuBtn').addEventListener('click', () => openSheet('menu'));
document.getElementById('menuFish').addEventListener('click', () => dex.open());   // FISHING: the fish book
// ----- the backpack (v0.1.148, Mac): one menu for the Bag, the Fish Book and, later, the Crop Book -----
const bookOpen = () => !S.goals || S.goals.done || S.goals.i >= 5;   // the Fish Book arrives with its goal
function packTabs(el, on) {
  el.innerHTML = `<button data-pack="bag" class="${on === 'bag' ? 'on' : ''}">Bag</button>${bookOpen() ? `<button data-pack="fish" class="${on === 'fish' ? 'on' : ''}">Fish Book</button>` : ''}<button data-pack="crop" disabled>Crop Book<small>soon</small></button>`;
}
function openPack(tab) {
  if (tab === 'fish' && bookOpen()) { document.querySelectorAll('.sheet').forEach(x => { x.hidden = true; }); dex.open(); const fb = document.querySelector('#fishBook .fb'), hd = fb && fb.querySelector('.fbh');
    if (hd) { let t = fb.querySelector('.packTabs'); if (!t) { t = document.createElement('div'); t.className = 'packTabs'; hd.insertAdjacentElement('afterend', t); } packTabs(t, 'fish'); } }
  else { openSheet('bag'); packTabs(document.querySelector('#bag .packTabs'), 'bag'); }
}
document.getElementById('packBtn').addEventListener('click', () => openPack('bag'));
document.addEventListener('click', (e) => { const b = e.target.closest('.packTabs [data-pack]'); if (b && !b.disabled) openPack(b.dataset.pack); });
document.getElementById('farmX').addEventListener('click', () => { const sl = hotbar.querySelector('[data-tool="farm"]'); if (sl) sl.click(); });   // the toolbar is tucked away while you farm, so this is the way out
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('.sheet').hidden = true));
document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openSheet(b.dataset.open)));
document.querySelectorAll('[data-soon]').forEach(b => b.addEventListener('click', () => toast(b.dataset.soon + ' arrives in a later update')));
const useBtn = document.getElementById('useBtn');
let useAction = null;
const ACTIONS = {
  talk: { label: 'Talk', icon: 'chat', color: '#ff9f6b' },
  sit: { label: 'Sit', icon: 'sit', color: '#c98a5a' }, stand: { label: 'Stand', icon: 'stand', color: '#c98a5a' },   // SIT
  board: { label: 'Orders', icon: 'board', color: '#c98a5a' },
  cast: { label: 'Cast', icon: 'fish', color: '#3ea6e8' },
  reel: { label: 'Reel', icon: 'rod', color: '#3b6fb0' },
  wait: { label: 'Waiting', icon: 'bobber', color: '#f7dc7a', soft: true },
  bite: { label: 'Reel!', icon: 'reel', color: '#9fdc95', soft: true, pulse: true },
  till: { label: 'Till', icon: 'hoe', color: '#b5793f' },
  plant: { label: 'Plant', icon: 'sprout', color: '#4caf50' },
  sow: { label: 'Seed bag', icon: 'seeds', color: '#3fae5a' },   // near several empty plots with seeds in hand: one tap floats you up with the seed bag (v0.1.147)
  harvest: { label: 'Harvest', icon: 'basket', color: '#f2a531' },
  shears: { label: 'Shears', icon: 'shears', color: '#3fae5a' },   // near several ripe crops: one tap floats you up with the shears (v0.1.143)
  lot: { label: 'Buy', icon: 'coin', color: '#e8a93a' },
  clear: { label: 'Clear', icon: 'hoe', color: '#3e8ee8' },
  load: { label: 'Load', icon: 'crate', color: '#c98d4b' },
  buybox: { label: 'Buy', icon: 'crate', color: '#e0a020' },
  dig: { label: 'Dig', icon: 'shovel', color: '#a8743f' },
  needtool: { label: 'Need', icon: 'lock', color: '#9a8fae' },
  collect: { label: 'Collect', icon: 'coin', color: '#e0a020' },
  fight: { label: 'Reel', icon: 'reel', color: '#9fdc95', soft: true }, fightstop: { label: 'Stop!', icon: 'hand', color: '#e5484d' },   // REEL
  take: { label: 'Take', icon: 'worm', color: '#3ea6e8' }, nobait: { label: 'No bait', icon: 'worm', color: '#b9b4c4', soft: true },   // FISHING
};
function setUse(a) {
  if (useAction && a && useAction.kind === a.kind && useAction.key === a.key && useAction.icon === a.icon) { useAction = a; return; }
  useAction = a; useBtn.hidden = !a;
  if (!a) return;
  useBtn.classList.remove('popin'); void useBtn.offsetWidth; useBtn.classList.add('popin');   // every new action pops up (Mac)
  const d = { ...ACTIONS[a.kind], ...(a.icon ? { icon: a.icon } : {}), ...(a.label ? { label: a.label } : {}) };
  useBtn.style.background = d.color;
  useBtn.style.color = d.soft ? '#2b2140' : '#fff';
  useBtn.classList.toggle('pulse', !!d.pulse);
  document.getElementById('useIcon').innerHTML = svg(d.icon, d.soft ? '#2b2140' : '#fff', 26);
  document.getElementById('useLabel').textContent = d.label;
  useBtn.setAttribute('aria-label', d.label);
}
useBtn.addEventListener('click', () => doAction(useAction));

// ---------- farming: real-time growth that keeps going while you're away ----------
const plots = new Map();
const NO_TILL = [[HIGGINS_AT.x, HIGGINS_AT.z, 1.3], [FISHEL_STALL.x, FISHEL_STALL.z + 0.4, 2.0], [FISHEL_STALL.x - 1.4, FISHEL_STALL.z + 0.9, 1.0], [BOARD.x, BOARD.z, 1.2], [ROSA_CART.x, ROSA_CART.z, 2.4]];   // Higgins, Fishel's stall, Fishel, order board, Rosa's cart
const cellKey = (c) => c.x + ',' + c.z;
function tillable(c) {
  if (spots.onBank(c.x + 0.5, c.z + 0.5)) return false;   // FISHING
  if (c.z < -1 || c.z > FENCE_Z - 1.55) return false;
  if (Math.abs(c.x + 0.5) < 1.6) return false; // the path
  if (Math.abs(c.x) > 11 && !(c.z > 6 && inBoughtLot(c.x + 0.5, c.z + 0.5) && Math.abs(c.x + 0.5) < 13.4)) return false;
  if (weedBlocks(c.x + ',' + c.z)) return false;
  if (decorOcc.has(c.x + ',' + c.z)) return false;
  return !NO_TILL.some(([x, z, r]) => Math.hypot(c.x + 0.5 - x, c.z + 0.5 - z) < r);
}
let plotMat, rowMat;
function growMs(crop) { return settings.debug && settings.fastCrops ? DEBUG.cropSeconds * 1000 : CROPS[crop].growMinutes * 60000; }
function stageOf(p) {
  if (!p.save.crop) return -1;
  const k = (Date.now() - p.save.plantedAt) / growMs(p.save.crop), n = CROPS[p.save.crop].stages.length;
  return k >= 1 ? n - 1 : Math.min(n - 2, Math.floor(k * (n - 1)));
}
// wild flowers and bushes in town, by grid cell: tilling a cell clears them, and they grow back when it goes back to grass (Mac)
const wild = new Map();
function wildPlant(o) {
  if (!o) return o;
  const k = cellKey({ x: Math.floor(o.position.x), z: Math.floor(o.position.z) });
  if (!wild.has(k)) wild.set(k, []);
  wild.get(k).push(o);
  return o;
}
function showWild(c, on) { for (const o of wild.get(cellKey(c)) || []) o.visible = on; }
let plotGeo = null;
// Plant and soil size (v0.1.154; Mac, Nov 22, mockups B + C): `size` multiplies every plant on its plot, `soil` is the tilled square's width in its 1 m cell,
// `lift` puts the timer and ripe bubble just above the plant's top instead of at a fixed height. window.__plantLab overrides for mockups.
const PLANT = { size: 1.6, soil: 1, lift: true, liftMax: 1.3, fruit: 3, giant: 0, thick: 12, stalk: 2 };   // liftMax: the bubble never sits higher than this (head height); fruit: how much each cob and tomato grows (TALL_FRUIT); giant: overrides SPECIAL_RULES.giant.scale when set; thick: stalks in a clump (wheat); stalk: how fat each one is
// Tall plants keep their size and grow their fruit instead (Mac: "keep the tall plants the same size but the crop (corn) way bigger"): crop -> the mesh that is its fruit.
const TALL_FRUIT = { corn: 'Yellow', tomato: 'Red' };
const _fruitGeo = new Map();
// a copy of a fruit mesh's shape with every separate piece (each cob, each tomato) grown k times about its own middle
function bigFruit(geo, k) {
  const key = geo.uuid + '|' + k; if (_fruitGeo.has(key)) return _fruitGeo.get(key);
  const g = geo.clone(), pos = g.attributes.position, n = pos.count, par = new Int32Array(n), at = new Map();
  const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let i = 0; i < n; i++) {   // corners at the same spot are one corner
    const h = Math.round(pos.getX(i) * 1e4) + ',' + Math.round(pos.getY(i) * 1e4) + ',' + Math.round(pos.getZ(i) * 1e4);
    if (at.has(h)) par[i] = at.get(h); else { at.set(h, i); par[i] = i; }
  }
  const idx = g.index, tri = idx ? idx.count : n;
  for (let t = 0; t < tri; t += 3) { const a = find(idx ? idx.getX(t) : t), b = find(idx ? idx.getX(t + 1) : t + 1), c = find(idx ? idx.getX(t + 2) : t + 2); par[b] = a; par[find(c)] = a; }
  const mid = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); let m = mid.get(r); if (!m) mid.set(r, m = [0, 0, 0, 0]); m[0] += pos.getX(i); m[1] += pos.getY(i); m[2] += pos.getZ(i); m[3]++; }
  for (let i = 0; i < n; i++) { const m = mid.get(find(i)), cx = m[0] / m[3], cy = m[1] / m[3], cz = m[2] / m[3]; pos.setXYZ(i, cx + (pos.getX(i) - cx) * k, cy + (pos.getY(i) - cy) * k, cz + (pos.getZ(i) - cz) * k); }
  pos.needsUpdate = true; g.computeBoundingBox(); g.computeBoundingSphere(); _fruitGeo.set(key, g); return g;
}
const plantLab = () => ({ ...PLANT, ...(window.__plantLab || {}) });
function addPlot(c, saved, quiet) {
  if (plots.has(cellKey(c))) return plots.get(cellKey(c));
  if (!saved) audio.play('till');
  plotMat = plotMat || new THREE.MeshStandardMaterial({ color: 0x7a5233, roughness: 1, flatShading: true });
  rowMat = rowMat || new THREE.MeshStandardMaterial({ color: 0x5e3d24, roughness: 1 });
  const g = new THREE.Group();
  if (!plotGeo) { const w = plantLab().soil; plotGeo = { base: new THREE.BoxGeometry(w, 0.08, w), row: new THREE.BoxGeometry(w - 0.12, 0.06, 0.12) }; }
  const base = new THREE.Mesh(plotGeo.base, plotMat); base.receiveShadow = true; g.add(base);
  for (let i = -1; i <= 1; i++) { const r = new THREE.Mesh(plotGeo.row, rowMat); r.position.set(0, 0.05, i * 0.26); g.add(r); }
  const cx = c.x + 0.5, cz = c.z + 0.5; g.position.set(cx, groundY(cx, cz) + 0.02, cz);
  g.scale.setScalar(quiet ? 1 : 0.2); scene.add(g);
  const save = saved || { x: c.x, z: c.z, crop: null, plantedAt: 0, emptySince: Date.now() };
  if (!saved) S.plots.push(save);
  const p = { cell: c, g, save, cropMesh: null, stage: -1, grown: false };
  plots.set(cellKey(c), p); showWild(c, false);
  syncCrop(p, true); setWet(p);
  return p;
}
function removePlot(p) {
  scene.remove(p.g); plots.delete(cellKey(p.cell)); showWild(p.cell, true);
  S.plots = S.plots.filter(q => q !== p.save);
}
// size of a Quaternius crop on its plot: fit the ripe plant's footprint inside the plot
const cropScale = {}, _plantBox = new THREE.Box3();
function plotScale(id) {
  if (cropScale[id] == null) {
    const c = CROPS[id], last = M.crops[c.stages[c.stages.length - 1]].scene, sz = new THREE.Box3().setFromObject(last).getSize(new THREE.Vector3());
    cropScale[id] = Math.min(0.95, 0.95 / Math.max(sz.x, sz.z, 0.01));
  }
  return cropScale[id];
}
// ----- special crops (v0.1.144): rolled once when a crop turns ripe; p.save.roll = { v: colour or '', sz: 0 normal, 1 big, 2 giant } -----
function rollCrop(p) {
  if (window.__rollLab) { p.save.roll = { v: '', sz: 0, ...window.__rollLab(p) }; return; }   // tests and mockups
  const R = SPECIAL_RULES, winter = seasonInfo().season === 'Winter', raining = weather.level > 0.2; let v = '';
  for (const k of R.order) {
    const sp = SPECIAL[k]; if (sp.winter && !winter) continue;
    let ch = 1 / sp.oneIn; if (p.save.fert) ch *= R.fertilized; if (p.save.wet1 && (k === 'gold' || k === 'rainbow')) ch *= R.watered; if (raining && k === 'rainbow') ch *= R.rain;
    if (Math.random() < ch) { v = k; break; }
  }
  const r = Math.random(), sz = r < 1 / R.giant.oneIn ? 2 : r < 1 / R.giant.oneIn + 1 / R.big.oneIn ? 1 : 0;
  p.save.roll = { v, sz };
}
function specialLook(m, roll) {
  if (roll.sz) m.scale.multiplyScalar(roll.sz === 2 ? (plantLab().giant || SPECIAL_RULES.giant.scale) : SPECIAL_RULES.big.scale);
  if (!roll.v) return; let i = 0;
  m.traverse(o => { if (!o.isMesh) return;
    const mat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.25, metalness: 0.7 });
    if (roll.v === 'gold') { mat.color.set(0xffc928); mat.emissive.set(0x7a4a00); }
    else if (roll.v === 'silver') { mat.color.set(0xe6ecf5); mat.emissive.set(0x4a5260); }
    else if (roll.v === 'frozen') { mat.color.set(0x9fe3ff); mat.emissive.set(0x1c5f8a); mat.metalness = 0.3; mat.transparent = true; mat.opacity = 0.9; }
    else { mat.color.setHSL((i * 0.23 + 0.02) % 1, 0.95, 0.58); mat.emissive.setHSL((i * 0.23 + 0.02) % 1, 0.9, 0.2); mat.metalness = 0.35; }
    o.material = mat; i++; });
}
// what a ripe plot gives: the item (plain or a colour), how many, and its size
function reap(p) {
  const crop = CROPS[p.save.crop], r = p.save.roll || { v: '', sz: 0 };
  let n = crop.yield[0];   // v0.1.146 (Mac): a plain plant always gives its low number (it used to give the high one 45% of the time); extras only come from big and giant plants
  if (r.sz === 1) n += SPECIAL_RULES.big.extra; if (r.sz === 2) n *= SPECIAL_RULES.giant.times;
  return { item: r.v ? `${crop.item}_${r.v}` : crop.item, n, sz: r.sz, roll: p.save.roll || null };
}
function clearCropSave(p) { p.save.crop = null; p.save.plantedAt = 0; p.save.watered = null; p.save.roll = null; p.save.wet1 = null; p.save.fert = null; p.save.emptySince = Date.now(); }
// a big or giant plant pops: a chop, then each food floats to the basket and lands on the next note of an arpeggio (Mac)
function popFood(p, item, n) {
  audio.play('chop');
  tagV.set(p.cell.x + 0.5, 0.6, p.cell.z + 0.5).project(camera);
  const x0 = (tagV.x + 1) / 2 * innerWidth, y0 = (1 - tagV.y) / 2 * innerHeight;
  const slot = hotbar.querySelector('[data-tool="fruit"]') || hotbar, r = slot.getBoundingClientRect(), x1 = r.left + r.width / 2, y1 = r.top + r.height / 2;
  const it = ITEMS[item], src = cropIcon[it.base || item]; if (!src) return;
  for (let i = 0; i < Math.min(n, 12); i++) {
    const el = document.createElement('img'); el.src = src; el.className = 'foodfly' + (it.special ? ' sp-' + it.special : ''); el.style.left = x0 + 'px'; el.style.top = y0 + 'px'; document.body.appendChild(el);
    const dx = (Math.random() - 0.5) * 90, dy = -40 - Math.random() * 50;
    const a = el.animate([{ transform: 'translate(-50%,-50%) scale(.4)', offset: 0 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.15)`, offset: 0.3 },
      { transform: `translate(calc(-50% + ${x1 - x0}px), calc(-50% + ${y1 - y0}px)) scale(.5)`, offset: 1 }], { duration: 620, delay: 120 + i * 95, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' });
    a.onfinish = () => { el.remove(); audio.play('foodNote', i); slot.classList.remove('bump'); void slot.offsetWidth; slot.classList.add('bump'); };
  }
}
function syncCrop(p, quiet) {
  const st = stageOf(p), c = p.save.crop && CROPS[p.save.crop];
  p.grown = !!c && st === c.stages.length - 1;
  if (p.grown && !p.save.roll) rollCrop(p);
  if (st === p.stage) return;
  if (p.save.watered != null && p.save.watered !== st) p.save.watered = null;
  setWet(p);
  if (p.cropMesh) { p.g.remove(p.cropMesh); p.cropMesh = null; }
  p.stage = st;
  if (st < 0) return;
  const model = c.stages[st], rot = (p.cell.x * 7 + p.cell.z * 3) % 6;
  let m;
  if (c.kit === 'crops' && !M.crops[model]) {   // models still loading: generic sprout for now
    ensureCrop(p.save.crop);
    m = M.nature.crops_leafsStageA.scene.clone(true); m.scale.setScalar(SCALE.nature * 0.5); m.position.y = 0.05; m.rotation.y = rot;
  } else if (c.kit === 'crops') {
    m = new THREE.Group(); const L = plantLab(), fruit = L.fruit !== 1 && TALL_FRUIT[p.save.crop], sc = plotScale(p.save.crop) * (fruit ? 1 : L.size), n = c.clump ? (L.thick || c.clump) : 1;
    for (let i = 0; i < n; i++) {   // thin crops (wheat) grow as a small clump
      const o = M.crops[model].scene.clone(true); o.scale.setScalar(sc);
      if (n > 1 && L.thick) o.scale.set(sc / L.size * L.stalk, sc, sc / L.size * L.stalk);   // a thick clump grows taller, not wider, so it stays on its plot
      if (fruit && p.grown) o.traverse(q => { if (q.isMesh && q.name === fruit) q.geometry = bigFruit(q.geometry, L.fruit); });
      if (n > 1 && L.thick) o.position.set((i % 3 - 1) * 0.27 + ((i * 53) % 7 - 3) * 0.018, 0, (Math.floor(i / 3) - (Math.ceil(n / 3) - 1) / 2) * 0.27 + ((i * 31) % 5 - 2) * 0.02);   // thick: rows of three with a little wobble
      else if (n > 1) o.position.set(((i * 37) % 3 - 1) * 0.12, 0, (i - (n - 1) / 2) * 0.26);
      o.rotation.y = rot + i * 2.1; m.add(o);
    }
    m.position.y = 0.04;
  } else {
    m = M.nature[model].scene.clone(true);
    m.scale.setScalar(SCALE.nature * (p.grown ? 0.7 : 0.6) * plantLab().size); m.position.y = 0.05; m.rotation.y = rot;
  }
  if (p.grown && p.save.roll) specialLook(m, p.save.roll);
  if (c.clump && plantLab().thick && m.scale.x !== 1) { const k = m.scale.x; m.scale.setScalar(1); for (const o of m.children) o.scale.multiplyScalar(k); }   // big and giant clumps: each stalk grows where it stands, rooted in its plot
  p.top = _plantBox.setFromObject(m).max.y;   // how tall it stands on its plot, for the tag
  shadowize(m); p.g.add(m); p.cropMesh = m;
  if (p.grown && !quiet && (c.kit !== 'crops' || M.crops[model])) damageText(p.g.position.clone().setY(p.g.position.y + 1.0), 'Ready!');
}
function plantIn(p, crop) { audio.play('plant'); p.save.crop = crop; p.save.plantedAt = Date.now(); p.save.emptySince = null; p.stage = -2; syncCrop(p, true); }
function harvest(p) {
  audio.play('harvest');
  const { item, n, sz, roll } = reap(p);
  addItem(item, n); addXP(XP.crop * n); goals.event('harvest');   // GOALS
  if (sz) popFood(p, item, n);
  clearCropSave(p); syncCrop(p);
  damageText(p.g.position.clone().setY(p.g.position.y + 1.0), '+' + n);
  toast(`Harvested ${n} ${ITEMS[item].name.toLowerCase()}${n > 1 ? 's' : ''}`);
  renderHotbar(); commit();
  return { n, item, roll };
}
// an empty plot (harvested, or tilled and never planted) goes back to grass after 2 real hours (Mac), counting time away
const GRASS_MS = 2 * 3600e3;
let grassCheck = 0;
function updatePlots(dt) {
  const now = Date.now(), check = (grassCheck -= dt) <= 0;
  if (check) grassCheck = 2;
  let gone = false;
  for (const p of [...plots.values()]) {
    if (p.fading && p.save.crop) { p.fading = false; p.g.scale.setScalar(1); }   // planted just in time
    if (p.fading) {   // shrinks back into the grass
      p.g.scale.setScalar(Math.max(0, p.g.scale.x - dt * 2));
      if (p.g.scale.x <= 0) { removePlot(p); gone = true; }
      continue;
    }
    if (p.g.scale.x < 1) p.g.scale.setScalar(Math.min(1, p.g.scale.x + dt * 5));
    syncCrop(p);
    if (check) setWet(p);
    if (check && !p.save.crop && p.save.emptySince && now - p.save.emptySince > GRASS_MS && !(farm.mode === 'drag' && farmSel() === 'hoe')) p.fading = true;
  }
  if (gone) commit();
}
function restorePlots() {
  const now = Date.now();
  for (const q of S.plots) {
    if (!q.crop && !q.emptySince) q.emptySince = now;   // saves from before v0.1.32: two hours from now
    if (!q.crop && now - q.emptySince > GRASS_MS) continue;   // went back to grass while you were away
    addPlot({ x: q.x, z: q.z }, q, true);
  }
  S.plots = S.plots.filter(q => q.crop || now - q.emptySince <= GRASS_MS);
}
function facingCell() {
  const f = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  const p = player.pos.clone().addScaledVector(f, 0.9);
  return { x: Math.floor(p.x), z: Math.floor(p.z) };
}
function actionFor(c) {
  if (!c) return null;
  const here = plots.get(cellKey(c));
  if (here && here.grown) return { kind: 'harvest', key: cellKey(c), plot: here, cell: c };
  if (tool === 'seeds' && here && !here.save.crop) return { kind: 'plant', key: cellKey(c), plot: here, cell: c };
  return null;
}
function doAction(a) {
  if (!a) return;
  if (a.go) { a.go(); return; }   // STORE: an action that brings its own handler
  const cx = a.cell ? a.cell.x + 0.5 : null, cz = a.cell ? a.cell.z + 0.5 : null;
  if (a.cell) player.faceYaw = Math.atan2(cx - player.pos.x, cz - player.pos.z);
  if (a.kind === 'talk') { if (a.key === 'fishel') openBaitShop(); else if (a.key === 'rosa') openRosaShop(); else if (a.key === 'pike') talkPike(); else startTalk(); return; }
  if (a.kind === 'board') { openOrders(true); return; }
  if (a.kind === 'sit') { sitDown(a.bench); return; }   // SIT
  if (a.kind === 'stand') { standUp(); return; }
  if (a.kind === 'lot') { openLotSheet(a.lot); return; }
  if (a.kind === 'clear') { startClear(a.item); return; }
  if (a.kind === 'load') { cargo.open(a.box); return; }
  if (a.kind === 'buybox') { cargo.renderHold(); openSheet('holdSheet'); return; }
  if (a.kind === 'dig') { digSpot(a.spot); return; }
  if (a.kind === 'needtool') { toast(a.why); return; }
  if (a.kind === 'collect') { cargo.collect(); return; }
  if (a.kind === 'nobait') { toast(spots.noBaitWhy()); return; }   // FISHING
  if (a.kind === 'cast') {
    if (fishing.state !== 'idle') return;
    if (a.at && (S.tapCasts || 0) < AIM_TAPS) S.tapCasts = (S.tapCasts || 0) + 1;   // AIM: they found the water tap
    beginCast(a.at ? a.at.clone().setY(0) : castTarget());
  } else if (a.kind === 'shears' || a.kind === 'sow') {
    S.farmTool = a.kind === 'sow' ? 'seeds' : 'shears'; selectTool('farm'); farmOpen(); renderHotbar();
  } else if (a.kind === 'reel' || a.kind === 'wait') {
    if (!reel.early()) reelIn();   // REEL: a tap on a nibble is too early
  } else if (a.kind === 'bite') {
    reel.strike();   // REEL: the fight starts (the button's own press starts it sooner)
  } else if (a.kind === 'fight' || a.kind === 'fightstop') {
    /* REEL: held, not tapped */
  } else if (a.kind === 'till') {
    upperOneShot('Attack', 0.45); setTimeout(() => { if (!plots.has(cellKey(a.cell))) { addPlot(a.cell); history.push({ kind: 'till', key: cellKey(a.cell) }); commit(); } }, 220);
  } else if (a.kind === 'plant') {
    const sd = seedSel();
    if (invCount(sd) <= 0) { toast(`Out of seeds. ${seedSeller()} sells more.`); return; }
    upperOneShot('PickUp', 0.6); addItem(sd, -1); plantIn(a.plot, ITEMS[sd].crop); renderHotbar(); history.push({ kind: 'plant', key: cellKey(a.plot.cell), seed: sd }); commit();
  } else if (a.kind === 'harvest') {
    upperOneShot('PickUp', 0.6); const plantedAt = a.plot.save.plantedAt, crop = a.plot.save.crop; const got = harvest(a.plot);
    history.push({ kind: 'harvest', key: cellKey(a.plot.cell), n: got.n, item: got.item, roll: got.roll, plantedAt, crop });
  }
}
// tap the ground: act on that square, walking over first if it's out of reach
const tapRay = new THREE.Raycaster(), tapNdc = new THREE.Vector2();
function handleTap(x, y) {
  if (!groundMesh || fishing.state === 'fight') return;   // REEL
  tapNdc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  tapRay.setFromCamera(tapNdc, camera);
  const hit = tapRay.intersectObject(groundMesh, false)[0];
  if (!hit) return;
  if (tool === 'rod' && hit.point.y < WATER_Y) {
    if (nearWater() && Math.hypot(hit.point.x - player.pos.x, hit.point.z - player.pos.z) < 11) doAction({ kind: 'cast', key: 'tap', at: hit.point.clone() });   // FISHING: only water within reach
    else toast('Walk to the water to cast');
    return;
  }
  const c = { x: Math.floor(hit.point.x), z: Math.floor(hit.point.z) };
  const a = actionFor(c);
  tapCell = c; tapFlash = 0.6;
  if (!a) { tapBad = true; return; }
  tapBad = false;
  const d = Math.hypot(c.x + 0.5 - player.pos.x, c.z + 0.5 - player.pos.z);
  if (d <= 1.5) doAction(a); else player.walkTo = { x: c.x + 0.5, z: c.z + 0.5, cell: c };
}
const loupe = document.getElementById('loupe'), lctx = loupe.getContext('2d');
function cellAtScreen(x, y) {
  tapNdc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  tapRay.setFromCamera(tapNdc, camera);
  const hit = groundMesh && tapRay.intersectObject(groundMesh, false)[0];
  return hit ? { x: Math.floor(hit.point.x), z: Math.floor(hit.point.z) } : null;
}
function startAim(x, y) { aim.on = true; loupe.hidden = false; moveAim(x, y); if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {} }
function moveAim(x, y) {
  aim.x = x; aim.y = y; aim.cell = cellAtScreen(x, y);
  const ly = y - 150 < 10 ? y + 40 : y - 150;
  loupe.style.left = Math.max(6, Math.min(innerWidth - 136, x - 65)) + 'px'; loupe.style.top = ly + 'px';
}
function endAim(accept) {
  aim.on = false; loupe.hidden = true;
  const c = aim.cell; aim.cell = null;
  if (!accept || !c) return;
  const a = actionFor(c);
  tapCell = c; tapFlash = 0.6;
  if (!a) { tapBad = true; return; }
  tapBad = false;
  const d = Math.hypot(c.x + 0.5 - player.pos.x, c.z + 0.5 - player.pos.z);
  if (d <= 1.5) doAction(a); else player.walkTo = { x: c.x + 0.5, z: c.z + 0.5, cell: c };
}
function drawLoupe() {
  if (!aim.on) return;
  const dpr = renderer.getPixelRatio(), S = loupe.width, zoom = 2.2;
  const src = (130 / zoom) * dpr;
  lctx.save(); lctx.clearRect(0, 0, S, S);
  lctx.beginPath(); lctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); lctx.clip();
  lctx.drawImage(canvas, aim.x * dpr - src / 2, aim.y * dpr - src / 2, src, src, 0, 0, S, S);
  lctx.strokeStyle = 'rgba(255,255,255,0.9)'; lctx.lineWidth = 3;
  lctx.beginPath(); lctx.moveTo(S / 2 - 14, S / 2); lctx.lineTo(S / 2 + 14, S / 2); lctx.moveTo(S / 2, S / 2 - 14); lctx.lineTo(S / 2, S / 2 + 14); lctx.stroke();
  lctx.restore();
}
// undo the last farming action
const history = [];
const undoBtn = document.getElementById('undoBtn');
undoBtn.addEventListener('click', () => {
  const h = history.pop(); if (!h) return;
  const p = plots.get(h.key);
  if (h.kind === 'till' && p && !p.save.crop) removePlot(p);
  else if (h.kind === 'plant' && p && p.save.crop) { p.save.crop = null; p.save.emptySince = Date.now(); syncCrop(p); addItem(h.seed || 'seed_turnip', 1); }
  else if (h.kind === 'harvest' && p && invCount(h.item || CROPS[h.crop].item) >= h.n) { addItem(h.item || CROPS[h.crop].item, -h.n); addXP(-XP.crop * h.n); p.save.crop = h.crop; p.save.plantedAt = h.plantedAt; p.save.roll = h.roll || { v: '', sz: 0 }; p.stage = -2; syncCrop(p, true); }
  else { toast("Can't undo that now"); return; }
  renderHotbar(); commit();
  toast('Undone');
});
// Undo sits right above the action button (or above the menu when there's no action), so the two never overlap.
// It was to the left until v0.1.119; Mac: "the undo button should be above the plant button".
function placeUndo() {
  if (undoBtn.hidden) return;
  // above the action button; with no action showing, it takes the action button's own spot (the menu left the corner in v0.1.148)
  const ar = document.getElementById('actions').getBoundingClientRect();
  if (!useBtn.hidden) { const ref = useBtn.getBoundingClientRect(); undoBtn.style.left = Math.min(innerWidth - 70, ref.left + ref.width / 2 - 32) + 'px'; undoBtn.style.top = (ref.top - 64 - 10) + 'px'; }
  else { undoBtn.style.left = Math.min(innerWidth - 70, ar.right - 67) + 'px'; undoBtn.style.top = (ar.bottom - 64) + 'px'; }
}
// Undo is for the slip you just made: it goes away 12 s after the action, and it stays hidden during the first ten goals.
// (A playtester tapped it long after planting, which pulled up their tutorial turnip and sent them back to the start. Mac, v0.1.79)
const UNDO_MS = 12000;
const SHEARS_AT = 3, SHEARS_NEAR = 2.6;   // this many ripe crops within this many meters turn Harvest into the shears button
function updateUndo() {
  const now = Date.now(); history.forEach(h => { h.t = h.t || now; });
  if (history.length && now - history[history.length - 1].t > UNDO_MS) history.length = 0;
  if (S.goals && !S.goals.done) history.length = 0;
  undoBtn.hidden = decor.on || farm.mode !== 'off' || !(history.length && (tool === 'farm' || tool === 'seeds' || tool === 'fruit') && player.pos.z < FENCE_Z);
}

// the target square on the ground
let tapCell = null, tapFlash = 0, tapBad = false, marker;
function makeMarker() {
  const shape = new THREE.Shape(); const o = 0.5, i = 0.42;
  shape.moveTo(-o, -o); shape.lineTo(o, -o); shape.lineTo(o, o); shape.lineTo(-o, o); shape.lineTo(-o, -o);
  const hole = new THREE.Path(); hole.moveTo(-i, -i); hole.lineTo(-i, i); hole.lineTo(i, i); hole.lineTo(i, -i); hole.lineTo(-i, -i);
  shape.holes.push(hole);
  const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2);
  marker = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.84).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }));
  marker.add(fill); marker.userData.fill = fill;
  marker.renderOrder = 5; marker.visible = false; scene.add(marker);
}
function updateMarker(dt) {
  if (!marker) return;
  let c = null, ok = false;
  if (aim.on) { c = aim.cell; ok = !!actionFor(c); }
  else if (player.walkTo) { c = player.walkTo.cell; ok = true; }
  else if (tapFlash > 0 && tapCell) { tapFlash -= dt; c = tapCell; ok = !tapBad; }
  else if (farm.mode !== 'off') { marker.visible = false; return; }
  else if (tool === 'seeds') { c = facingCell(); ok = !!actionFor(c); }
  else if (useAction && useAction.kind === 'harvest') { c = useAction.cell; ok = true; }
  if (!c || player.pos.z > FENCE_Z) { marker.visible = false; return; }
  const cx = c.x + 0.5, cz = c.z + 0.5;
  marker.visible = true;
  marker.position.set(cx, groundY(cx, cz) + (plots.has(cellKey(c)) ? 0.11 : 0.04), cz);
  const col = ok ? 0xffffff : 0xff6b6b;
  marker.material.color.setHex(col); marker.userData.fill.material.color.setHex(ok ? 0xfff1a8 : 0xff6b6b);
  const pulse = 1 + Math.sin(elapsed * 6) * 0.04; marker.scale.set(pulse, 1, pulse);
}

// ---------- farm tools (decision 58, mockup A): float up, pick a tool, drag it across the field while you dangle ----------
const FARM_TOOLS = {
  hoe: { name: 'Hoe', icon: 'hoe', sub: 'till' },
  seeds: { name: 'Seeds', icon: 'seeds', sub: 'plant', seeds: true },   // v0.1.147 (Mac): float with a seed bag and plant every empty plot you swipe over; shows while you have seeds
  shears: { name: 'Shears', icon: 'shears', sub: 'harvest' },
  can: { name: 'Watering can', short: 'Can', icon: 'can', sub: 'water' },
  fert: { name: 'Fertilizer', icon: 'fert', sub: `${FERT.minutes} min faster`, bag: 'fertilizer' },   // shows while you have bags (bought from Rosa)
  shovel: { name: 'Shovel', icon: 'shovel', sub: 'dig spots', gear: true },
  saw: { name: 'Saw', icon: 'saw', sub: 'trees · logs', gear: true, tap: 'Walk up to a tree or log and tap Clear to use the saw.' },
  pick: { name: 'Pickaxe', icon: 'pick', sub: 'big rocks', gear: true, tap: 'Walk up to a big rock and tap Clear to use the pickaxe.' },
};
const FARM_ORDER = ['hoe', 'seeds', 'shears', 'can', 'fert', 'shovel', 'saw', 'pick'];
const WATER_MS = 60000;            // watering takes this much off the grow time, once per growth stage
const FLOAT = 0.35;                // how high you float while the farm tools are out (m)
// mode: off -> tray (floating, picking) -> ready (tool overhead) -> drag (dangling under your finger) -> return (floating home) -> land -> off
const farm = { mode: 'off', lift: 0, t: 0, P: new THREE.Vector3(), from: new THREE.Vector3(), hip: new THREE.Vector3(), hipO: new THREE.Vector3(),
  foot: new THREE.Vector3(), footO: new THREE.Vector3(), lastG: null, done: new Set(), got: 0, n: 0, upright: 1, retDur: 0.8 };
const farmTray = document.getElementById('farmTray');
// the tool you used last (null until you've picked one); the hotbar shows shears until then
const noSeeds = (t) => t.seeds && invCount(seedSel()) <= 0;
function farmPicked() { const t = FARM_TOOLS[S.farmTool]; return t && !(t.bag && !invCount(t.bag)) && !noSeeds(t) ? S.farmTool : null; }
function farmSel() { return farmPicked() || 'shears'; }
// Changing seeds while you float with the seed bag. '' = off · 'row' = a second row of your seeds under the tools · 'swap' = the tools make way for your seeds, with a back tile.
const SEED_PICK = 'row';   // Mac picked the row, above the tools (Nov 22)
const seedPick = () => (window.__seedPickLab != null ? window.__seedPickLab : SEED_PICK);
const seedChips = () => { const sel = seedSel(); return CROP_ORDER.filter(id => invCount(CROPS[id].seed) > 0).map(id => { const c = CROPS[id], sd = c.seed;
  return `<button class="schip${sd === sel ? ' on' : ''}" data-seed="${sd}" aria-pressed="${sd === sel}" aria-label="${c.name} seeds, ${invCount(sd)}">${cropImg(id, 26)}<span class="sn">${c.name}</span><span class="st">${c.growMinutes}m</span><b>${invCount(sd)}</b></button>`; }).join(''); };
function renderFarmTray() {
  const show = (farm.mode === 'tray' || farm.mode === 'ready') && !decor.on;
  farmTray.hidden = !show; if (!show) return;
  const sel = farm.mode === 'ready' ? farmPicked() : null;   // highlighted = the tool in your hands
  // tools you don't own yet stay out of the tray; it fills up as you buy them (Mac, v0.1.70)
  farmTray.querySelector('.srow:not(.srow2)').innerHTML = FARM_ORDER.filter(id => !(FARM_TOOLS[id].gear && !hasTool(id)) && !(FARM_TOOLS[id].bag && !invCount(FARM_TOOLS[id].bag)) && !noSeeds(FARM_TOOLS[id])).map(id => { const t = FARM_TOOLS[id];
    const locked = t.gear && !hasTool(id), tag = t.seeds ? `<b>${invCount(seedSel())}</b>` : t.bag ? `<b>${invCount(t.bag)}</b>` : locked ? `<span class="slock">${svg('lock', '#fff', 10)}${GEAR[id].price}</span>` : '';
    return `<button class="schip${id === sel ? ' on' : ''}${locked ? ' locked' : ''}" data-farm="${id}" aria-pressed="${id === sel}" aria-label="${t.name}: ${t.sub}">${tag}${svg(t.icon, '#2b2140', 26)}<span class="sn">${t.short || t.name}</span><span class="st">${t.sub}</span></button>`; }).join('');
  let row2 = farmTray.querySelector('.srow2'); if (!row2) { row2 = document.createElement('div'); row2.className = 'srow srow2'; const tools = farmTray.querySelector('.srow'); tools.parentNode.insertBefore(row2, tools); }   // seeds sit above the tools (Mac)
  const mode = sel === 'seeds' ? seedPick() : '';
  row2.hidden = mode !== 'row'; if (mode === 'row') row2.innerHTML = seedChips();
  if (mode === 'swap') farmTray.querySelector('.srow:not(.srow2)').innerHTML = `<button class="schip" data-farm="hoe" data-back="1" aria-label="Back to the tools">${svg('hoe', '#2b2140', 22)}<span class="sn">Tools</span><span class="st">back</span></button>` + seedChips();
}
farmTray.addEventListener('click', (e) => {
  const sb = e.target.closest('[data-seed]'); if (sb) { S.seedSel = sb.dataset.seed; farm.seed = null; commit(); renderHotbar(); renderFarmTray(); return; }
  const b = e.target.closest('[data-farm]'); if (!b) return;
  const t = FARM_TOOLS[b.dataset.farm];
  if (t.gear && !hasTool(b.dataset.farm)) { toast(`${toolSeller()} sells the ${t.name.toLowerCase()} (${GEAR[b.dataset.farm].price} coins, town level ${GEAR[b.dataset.farm].level}).`); return; }
  if (t.tap) { toast(t.tap); return; }
  S.farmTool = b.dataset.farm; farm.seed = null; commit();
  if (farm.mode !== 'ready') { farm.mode = 'ready'; farm.t = 0; resetDangle(); }   // switching tools keeps you where you are
  renderHotbar(); showFarmTool();
  document.querySelector('#toolName span').textContent = FARM_TOOLS[S.farmTool].name + ' \u00b7 drag across your field'; document.getElementById('toolName').hidden = false; toolNameT = 2.2;
});
function farmOpen() {
  // float up facing the camera; your last tool comes straight into your hands so you can drag right away (or switch)
  // turn to the camera at once: turning while you hang off the tool swung the body round in a circle before it settled (Mac)
  farm.t = 0; farm.seed = null; player.walkTo = null; player.faceYaw = Math.PI; player.yaw = Math.PI;
  farm.mode = farmPicked() ? 'ready' : 'tray';
  if (farm.mode === 'ready') { resetDangle(); showFarmTool(); document.querySelector('#toolName span').textContent = FARM_TOOLS[farmPicked()].name + ' \u00b7 drag across your field'; document.getElementById('toolName').hidden = false; toolNameT = 2.2; }
  renderFarmTray();
}
function farmOff() {
  if (farm.mode === 'off') return;
  farm.mode = farm.lift > 0.01 ? 'land' : 'off'; farm.t = 0;
  farm.landTo = farm.mode === 'land' ? landSpot(player.pos.x, player.pos.z) : null;   // come down on the nearest clear ground
  renderFarmTray(); showFarmTool();
}
// where the hands hang from while floating at home
function homeHands(out) { const b = body; return out.set(player.pos.x, (player.y || 0) + farm.lift + b.hang.hands, player.pos.z); }
function resetDangle() {
  const b = body; homeHands(farm.P);
  farm.hip.copy(farm.P).y -= b.hang.hands - b.hang.hip; farm.hipO.copy(farm.hip);
  farm.foot.copy(farm.hip).y -= b.hang.leg; farm.footO.copy(farm.foot);
}
// a screen point -> the point at hand height under the finger, and the ground cell under the finger
const farmPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), farmHit = new THREE.Vector3();
function fingerToWorld(x, y) {
  tapNdc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  tapRay.setFromCamera(tapNdc, camera);
  const hands = homeHands(farmHit.clone()).y;
  farmPlane.constant = -hands;
  const P = tapRay.ray.intersectPlane(farmPlane, new THREE.Vector3());
  const g = groundMesh && tapRay.intersectObject(groundMesh, false)[0];
  if (!P) return null;
  // stay within reach of home so you can't sail off the lot
  const dx = P.x - player.pos.x, dz = P.z - player.pos.z, d = Math.hypot(dx, dz), R = 8;
  if (d > R) { P.x = player.pos.x + dx / d * R; P.z = player.pos.z + dz / d * R; }
  return { P, G: g ? g.point : null };
}
// FARM SCROLL (v0.1.134; Mac: "we need to make the camera move when harvesting", picked scrolling at the screen's edge). While you
// drag a farm tool, holding your finger near an edge of the screen slides the view that way, so one float can cover the whole
// lot. It works by moving the spot you float from (player.pos, which the camera follows), kept inside your land.
const FARM_Z0 = -1.5, FARM_SCROLL = { side: 0.16, top: 0.25, bottom: 0.25, speed: 6, fence: 0.66 };   // bands as shares of the screen; metres per second at the very edge
// How far toward the back fence the float spot may go: only until the fence sits low on the screen (FARM_SCROLL.fence, a share
// of the screen's height), so scrolling never shows much of the wilds or lots you haven't bought (Mac, v0.1.135: "to avoid spoilers").
const _fzm = new THREE.Vector3();
function farmZMax() {
  tapNdc.set(0, -(FARM_SCROLL.fence * 2 - 1)); tapRay.setFromCamera(tapNdc, camera);
  farmPlane.constant = 0; if (!tapRay.ray.intersectPlane(farmPlane, _fzm)) return FENCE_Z - 0.7;
  const line = _fzm.z + (player.pos.z - camFocus.z);   // the ground at that line of the screen, once the view catches up with you
  return Math.min(FENCE_Z - 0.7, player.pos.z + Math.max(0, FENCE_Z - line));
}
function farmEdgeScroll(dt) {
  if (farm.mode !== 'drag' || farm.fx == null) return;
  const W = innerWidth, H = innerHeight, C = FARM_SCROLL, band = (d, size) => { const t = Math.max(0, Math.min(1, 1 - d / size)); return t * t; };
  const sx = band(W - farm.fx, W * C.side) - band(farm.fx, W * C.side), sz = band(H - farm.fy, H * C.bottom) - band(farm.fy, H * C.top);   // screen down = toward the lots (+z)
  if (sx || sz) {
    player.pos.x = Math.max(landMinX() + 0.6, Math.min(landMaxX() - 0.6, player.pos.x + sx * C.speed * dt));
    player.pos.z = Math.max(FARM_Z0, Math.min(Math.max(player.pos.z, farmZMax()), player.pos.z + sz * C.speed * dt));
  }
  // the view may still be sliding under a finger that's holding still: keep working what's under it
  const w = fingerToWorld(farm.fx, farm.fy); if (w) { farm.target = w.P; farmWork(w.G); }
}
// can you stand here? (not in water, a shop, the coop, a stall, the board or a person)
function landable(x, z) {
  if (!walkable(x, z) || z > FENCE_Z - 0.45 || z < -3.3) return false;
  if (Math.abs(x - FISHEL_STALL.x) < 1.35 && Math.abs(z - FISHEL_STALL.z) < 1.1) return false;
  if (Math.abs(x - BOARD.x) < 0.9 && Math.abs(z - BOARD.z) < 0.45) return false;
  if (rosa) { const c = Math.cos(ROSA_CART.r), sn = Math.sin(ROSA_CART.r), dx = x - ROSA_CART.x, dz = z - ROSA_CART.z; if (Math.abs(dx * c - dz * sn) < 1.05 && Math.abs(dx * sn + dz * c) < 1.55) return false; }
  for (const n of [higgins, fishel, pike, rosa]) if (n && Math.hypot(x - n.pos.x, z - n.pos.z) < 0.7) return false;
  const np = new THREE.Vector3(x, 0, z), far = new THREE.Vector3(x, 0, z + 99); store.block(np, far); animals.block(np, far);
  return np.x === x && np.z === z;
}
function landSpot(x, z) {
  for (let r = 0; r <= 5; r += 0.4) for (let i = 0, n = r ? 12 : 1; i < n; i++) { const a = i / n * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (landable(px, pz)) return new THREE.Vector3(px, 0, pz); }
  return null;
}
function farmGrab(x, y) {
  farm.fx = x; farm.fy = y;
  const w = fingerToWorld(x, y); if (!w) return;
  farm.mode = 'drag'; farm.t = 0; farm.done.clear(); farm.got = 0; farm.n = 0; farm.lastG = null;
  renderFarmTray();   // the tray tucks away while you drag
  farm.target = w.P; farmWork(w.G);
}
function farmDrag(x, y) {
  if (farm.mode !== 'drag') return;
  farm.fx = x; farm.fy = y;
  const w = fingerToWorld(x, y); if (!w) return;
  farm.target = w.P; farmWork(w.G);
}
function farmLetGo() {
  if (farm.mode !== 'drag') return;
  farm.mode = 'return'; farm.t = 0; farm.from.copy(farm.P);
  // v0.1.134 (Mac): you stay floating where you stopped, not back where you started; the view settles on you there
  player.pos.x = Math.max(landMinX() + 0.6, Math.min(landMaxX() - 0.6, farm.P.x)); player.pos.z = Math.max(FARM_Z0, Math.min(Math.max(player.pos.z, farmZMax()), farm.P.z));
  farm.retDur = Math.min(1.4, Math.max(0.5, farm.from.distanceTo(homeHands(new THREE.Vector3())) / 3.5));
  showFarmTool();
  const k = farmSel();
  if (k === 'shears' && farm.got) toast(`Harvested ${farm.got} crop${farm.got > 1 ? 's' : ''}`);
  else if (k === 'can' && farm.n) toast(`Watered ${farm.n} plant${farm.n > 1 ? 's' : ''}: 1 minute sooner each`);
  else if (farm.fert) { toast(invCount('fertilizer') ? `Fertilized ${farm.fert} crop${farm.fert > 1 ? 's' : ''}: ${FERT.minutes} minutes sooner each` : 'That was your last bag. Rosa sells more fertilizer.'); farm.fert = 0; renderFarmTray(); }
  else if (k === 'hoe' && farm.n) toast(`Tilled ${farm.n} plot${farm.n > 1 ? 's' : ''}`);
  if (farm.n || farm.got) { renderHotbar(); commit(); }
}
// act on every cell the finger passes over (sampled, so fast swipes don't skip squares)
function farmWork(G) {
  if (!G) return;
  const from = farm.lastG || G, steps = Math.max(1, Math.ceil(from.distanceTo(G) / 0.2));
  for (let i = 1; i <= steps; i++) {
    const x = from.x + (G.x - from.x) * i / steps, z = from.z + (G.z - from.z) * i / steps;
    const c = { x: Math.floor(x), z: Math.floor(z) }, k = cellKey(c);
    if (farm.done.has(k)) continue;
    if (farmApply(c, k)) farm.done.add(k);
  }
  farm.lastG = G.clone();
}
function farmApply(c, k) {
  const p = plots.get(k), kind = farmSel();
  if (kind === 'seeds') {   // one seed into every empty tilled plot; it keeps to the seed you started with and stops when that runs out
    if (!p || p.save.crop) return false;
    const sd = farm.seed || (farm.seed = seedSel()); if (invCount(sd) <= 0) return false;
    addItem(sd, -1); plantIn(p, ITEMS[sd].crop); history.push({ kind: 'plant', key: k, seed: sd });
    farm.n++; buzz(); renderHotbar(); renderFarmTray(); return true;
  }
  if (kind === 'shears') {
    if (!p || !p.grown) return false;
    const plantedAt = p.save.plantedAt, cropId = p.save.crop;
    const { item, n, sz, roll } = reap(p);
    addItem(item, n); addXP(XP.crop * n); goals.event('harvest'); if (sz) popFood(p, item, n); clearCropSave(p); syncCrop(p);
    damageText(p.g.position.clone().setY(p.g.position.y + 0.9), '+' + n);
    history.push({ kind: 'harvest', key: k, n, item, roll, plantedAt, crop: cropId });
    farm.got += n; farm.n++; buzz(); audio.play('harvest'); renderHotbar(); return true;
  }
  if (kind === 'can') {
    if (!p || !p.save.crop || p.grown) return false;
    const st = stageOf(p);
    if (p.save.watered === st) return true;   // already wet
    // the minute comes off once per crop (Mac, v0.1.144; it was once per growth stage). Watering again only wets the soil.
    const first = !p.save.wet1; p.save.wet1 = 1;
    if (first) p.save.plantedAt -= WATER_MS;
    p.save.watered = stageOf(p) === st ? st : null; syncCrop(p); setWet(p);
    if (first) damageText(p.g.position.clone().setY(p.g.position.y + 0.8), '-1m'); addSplash(c.x + 0.5, c.z + 0.5, true);
    farm.n++; buzz(); audio.play('water'); return true;
  }
  if (kind === 'fert') {   // one bag per crop: it grows FERT.minutes sooner
    if (!p || !p.save.crop || p.grown || !invCount('fertilizer')) return false;
    addItem('fertilizer', -1); p.save.fert = 1; p.save.plantedAt -= FERT.minutes * 60000; p.save.watered = null; syncCrop(p);
    damageText(p.g.position.clone().setY(p.g.position.y + 0.8), `-${FERT.minutes}m`);
    farm.n++; farm.fert = (farm.fert || 0) + 1; buzz(); audio.play('plant'); goals.event('fert'); return true;   // GOALS
  }
  if (kind === 'shovel') {
    const i = S.dig ? S.dig.spots.findIndex(sp => !sp.done && sp.x === c.x && sp.z === c.z) : -1;
    if (i < 0) return false;
    const g = digModels.find(q => q.userData.i === i); if (g) { digSpot({ i, g }); farm.n++; buzz(); return true; }
    return false;
  }
  if (kind === 'hoe') {
    if (p || !tillable(c)) return false;
    addPlot(c); history.push({ kind: 'till', key: k }); farm.n++; buzz(); return true;
  }
  return false;
}
function buzz() { if (navigator.vibrate) try { navigator.vibrate(6); } catch (e) { /* not supported */ } }
// wet soil: darker plot until the plant moves to its next stage
let wetMat;
function setWet(p) {
  wetMat = wetMat || new THREE.MeshStandardMaterial({ color: 0x4f321e, roughness: 0.55, flatShading: true });
  const base = p.g.children[0]; if (!base) return;
  if (p.save.crop && p.save.watered === stageOf(p) && !p.grown) { base.material = wetMat; setRows(p, rowMat); return; }
  const d = dryStep(p);
  if (!d) { base.material = plotMat; setRows(p, rowMat); return; }
  const M2 = dryMat(); base.material = M2.base; setRows(p, M2.row);
}
// an empty plot dries out after 1 hour, one step to light dusty tan, until it goes back to grass at 2 hours (Mac: mockup A)
let dryMats = null;
function dryStep(p) { return !p.save.crop && p.save.emptySince && Date.now() - p.save.emptySince > GRASS_MS / 2 ? 1 : 0; }
function dryMat() {
  return dryMats = dryMats || { base: new THREE.MeshStandardMaterial({ color: 0xbf9a6a, roughness: 1, flatShading: true }),
    row: new THREE.MeshStandardMaterial({ color: 0xa88458, roughness: 1 }) };
}
function setRows(p, mat) { for (let i = 1; i <= 3; i++) if (p.g.children[i]) p.g.children[i].material = mat; }
// tool held overhead (world space, follows the hands)
const farmToolMesh = {};
// where each tool is held, in the tool's own space: the shears' rings, the can's handle, low on the hoe's shaft
const TOOL_GRIP = { shears: [0, 0.02, 0], can: [0, 0, 0], fert: [0, 0, 0], seeds: [0, 0, 0], hoe: [0.074, 0.01, 0], shovel: [0.074, 0.01, 0] };
let CAN_PICK = 'level';
function makeFarmTools() {
  const m = (geo, color, x, y, z) => { const o = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.5 })); o.position.set(x, y, z); o.castShadow = true; return o; };
  const sh = new THREE.Group();
  for (const s of [-1, 1]) {
    const blade = m(new THREE.ConeGeometry(0.035, 0.34, 4), 0xdfe5ec, s * 0.05, 0.27, 0); blade.rotation.z = -s * 0.32; blade.scale.set(1, 1, 0.3); sh.add(blade);
    const ring = m(new THREE.TorusGeometry(0.055, 0.018, 6, 14), s < 0 ? 0xf08a2c : 0xe0573e, s * 0.07, 0.02, 0); sh.add(ring);
  }
  sh.add(m(new THREE.SphereGeometry(0.025, 8, 6), 0x2b2140, 0, 0.11, 0.01));
  // watering can (Mac's photo): held by a big C handle on its back, spout pointing away from you; the grip is at the origin
  const can = new THREE.Group(), cb = new THREE.Group(); can.add(cb);
  const blue = 0x4f9fc4, dark = 0x2b2f38;
  cb.add(m(new THREE.CylinderGeometry(0.115, 0.13, 0.22, 16), blue, -0.21, -0.06, 0));
  cb.add(m(new THREE.CylinderGeometry(0.135, 0.135, 0.03, 16), dark, -0.21, -0.17, 0));   // dark base rim
  const top = m(new THREE.SphereGeometry(0.115, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), blue, -0.21, 0.05, 0); top.scale.y = 0.45; cb.add(top);
  const hole = m(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 12), 0x2f6f8c, -0.19, 0.095, 0); cb.add(hole);
  const C = m(new THREE.TorusGeometry(0.095, 0.022, 8, 18, Math.PI * 1.15), blue, -0.095, 0, 0); C.rotation.z = -Math.PI / 2 - 0.08; cb.add(C);
  const spout = m(new THREE.CylinderGeometry(0.02, 0.03, 0.34, 8), blue, -0.43, -0.03, 0); spout.rotation.z = 1.15; cb.add(spout);
  const rose = m(new THREE.CylinderGeometry(0.055, 0.022, 0.09, 12), dark, -0.61, 0.05, 0); rose.rotation.z = 1.15; cb.add(rose);
  // the body hangs at a slant, so the can is turned to sit level ('level') or tipped further so the spout points down ('pour')
  cb.rotation.z = (window.__canStyle || CAN_PICK) === 'pour' ? 1.3 : 0.45;
  const hoe = new THREE.Group();
  const shaft = m(new THREE.CylinderGeometry(0.016, 0.016, 0.8, 8), 0x8a5a34, 0, 0.3, 0); shaft.rotation.z = 0.25; hoe.add(shaft);
  hoe.add(m(new THREE.BoxGeometry(0.16, 0.13, 0.03), 0x9aa3ad, -0.11, 0.7, 0));
  const shv = new THREE.Group();
  const sshaft = m(new THREE.CylinderGeometry(0.016, 0.016, 0.8, 8), 0x8a5a34, 0, 0.3, 0); sshaft.rotation.z = 0.25; shv.add(sshaft);
  const blade = m(new THREE.BoxGeometry(0.15, 0.2, 0.025), 0x9aa3ad, -0.11, 0.76, 0); blade.rotation.z = 0.25; shv.add(blade);
  const tip = m(new THREE.ConeGeometry(0.075, 0.08, 4), 0x9aa3ad, -0.135, 0.88, 0); tip.rotation.z = 0.25; tip.scale.z = 0.2; shv.add(tip);
  // fertilizer sack: held by its tied neck, tipped over so it pours
  const fert = new THREE.Group(), fb = new THREE.Group(); fert.add(fb);
  const sack = m(new THREE.SphereGeometry(0.15, 10, 8), 0xc98f4e, 0, 0.2, 0); sack.scale.set(1, 1.2, 0.85); sack.material.flatShading = true; fb.add(sack);
  fb.add(m(new THREE.CylinderGeometry(0.035, 0.07, 0.09, 8), 0xe0b074, 0, 0.03, 0));
  const tie = m(new THREE.TorusGeometry(0.045, 0.012, 6, 10), 0x8a5a34, 0, 0.035, 0); tie.rotation.x = Math.PI / 2; fb.add(tie);
  const leaf = m(new THREE.CircleGeometry(0.06, 10), 0x5aa54a, 0, 0.21, 0.13); leaf.scale.set(0.6, 1, 1); fb.add(leaf);
  fb.rotation.z = 0.45;
  // seed bag: a small tan sack held by its neck, tipped a little so seeds trickle out
  const sbag = new THREE.Group(), sbb = new THREE.Group(); sbag.add(sbb);
  const ssack = m(new THREE.SphereGeometry(0.13, 10, 8), 0xd9c08a, 0, 0.18, 0); ssack.scale.set(1, 1.15, 0.8); ssack.material.flatShading = true; sbb.add(ssack);
  sbb.add(m(new THREE.CylinderGeometry(0.03, 0.06, 0.08, 8), 0xe8d5a6, 0, 0.03, 0));
  const stie = m(new THREE.TorusGeometry(0.04, 0.011, 6, 10), 0x8a5a34, 0, 0.035, 0); stie.rotation.x = Math.PI / 2; sbb.add(stie);
  sbb.add(m(new THREE.CircleGeometry(0.05, 10), 0x4caf50, 0, 0.19, 0.105));
  sbb.rotation.z = 0.35;
  for (const [k, g] of [['shears', sh], ['can', can], ['hoe', hoe], ['shovel', shv], ['fert', fert], ['seeds', sbag]]) { g.visible = false; scene.add(g); farmToolMesh[k] = g; }
}
function showFarmTool() { const k = farmSel(), on = farm.mode === 'ready' || farm.mode === 'drag' || farm.mode === 'return'; for (const [id, g] of Object.entries(farmToolMesh)) g.visible = on && id === k; }
const ease3 = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
// the pendulum: hands follow the finger; hips and feet swing on rods (verlet). Faster swipes swing you higher.
function stepDangle(dt) {
  const b = body, L1 = b.hang.hands - b.hang.hip, L2 = b.hang.leg, sub = 6, h = Math.min(dt, 0.05) / sub, g = 13;
  const dHip = Math.exp(-1.1 * h), dFoot = Math.exp(-2.4 * h);   // time-based, so the swing feels the same at any frame rate
  for (let s = 0; s < sub; s++) {
    for (const [pt, po, damp] of [[farm.hip, farm.hipO, dHip], [farm.foot, farm.footO, dFoot]]) {
      const vx = (pt.x - po.x) * damp, vy = (pt.y - po.y) * damp, vz = (pt.z - po.z) * damp;
      po.copy(pt); pt.x += vx; pt.y += vy - g * h * h; pt.z += vz;
    }
    for (let it = 0; it < 3; it++) {
      _v1.copy(farm.hip).sub(farm.P).setLength(L1); farm.hip.copy(farm.P).add(_v1);
      _v1.copy(farm.foot).sub(farm.hip); const d = _v1.length() || 1e-6, k = (d - L2) / d;
      farm.hip.addScaledVector(_v1, k * 0.3); farm.foot.addScaledVector(_v1, -k * 0.7);
    }
  }
}
const _fq = new THREE.Quaternion(), _fu = new THREE.Vector3(), _fy = new THREE.Quaternion();
const FARM_ARM_BONES = ['UpperArm.L', 'LowerArm.L', 'UpperArm.R', 'LowerArm.R'];
// runs after the animation mixer each frame: float, then (holding a tool) hang from the hands
function applyFarmPose(dt) {
  const b = body; if (!b) return;
  farm.t += dt;
  const floating = farm.mode !== 'off' && farm.mode !== 'land';
  farmEdgeScroll(dt);
  if (farm.mode === 'land' && farm.landTo) { const k = Math.min(1, dt * 8); player.pos.x += (farm.landTo.x - player.pos.x) * k; player.pos.z += (farm.landTo.z - player.pos.z) * k; }
  farm.lift += ((floating ? FLOAT : 0) - farm.lift) * Math.min(1, dt * (floating ? 5 : 7));
  if (farm.mode === 'land' && farm.lift < 0.01) { farm.lift = 0; farm.mode = 'off'; if (farm.landTo) { player.pos.x = farm.landTo.x; player.pos.z = farm.landTo.z; farm.landTo = null; } if (tool === 'farm') selectTool('none', true); }
  document.body.classList.toggle('farming', farm.mode !== 'off');   // v0.1.148: the toolbar slides away for as long as you float
  // v0.1.136 (Mac: "the player's right arm stays up after releasing a tool"): nothing else poses the forearms while you stand, so
  // the hanging pose left the right one bent up. The arms are remembered before you float and eased back as you land.
  if (floating && !farm.armRest) farm.armRest = FARM_ARM_BONES.map(n => [b.bones[n], b.bones[n].quaternion.clone()]);
  if (!floating && farm.armRest) { const k = farm.mode === 'off' ? 1 : Math.min(1, dt * 9); for (const [bone, q] of farm.armRest) bone.quaternion.slerp(q, k); if (farm.mode === 'off') { farm.armRest = null; farm.upright = 0; } }
  if (farm.mode === 'off' && farm.lift <= 0) return;
  const bob = farm.mode === 'drag' ? 0 : Math.sin(elapsed * 4.2) * 0.04 * Math.min(1, farm.lift / FLOAT);
  const hanging = farm.mode === 'ready' || farm.mode === 'drag' || farm.mode === 'return';
  for (const bb of Object.values(bodies)) bb.root.position.y += farm.lift + bob;
  // hands target
  const home = homeHands(new THREE.Vector3()); home.y += bob;
  if (farm.mode === 'ready') farm.P.copy(home);
  else if (farm.mode === 'drag' && farm.target) farm.P.lerp(farm.target, 1 - Math.exp(-dt * 30));
  else if (farm.mode === 'return') {
    const u = ease3(farm.t / farm.retDur); farm.P.copy(farm.from).lerp(home, u);
    _v1.copy(farm.hip).sub(farm.P);
    const tilt = Math.acos(Math.min(1, Math.max(-1, -_v1.y / (_v1.length() || 1))));
    if (farm.t > farm.retDur && (tilt < 0.12 || farm.t > farm.retDur + 0.9)) { farm.mode = 'ready'; farm.t = 0; renderFarmTray(); }   // home again, still floating with the tool: swipe again or switch
  }
  if (hanging) stepDangle(dt);
  // blend: 1 = hanging pose, 0 = normal animated pose (used to settle when landing)
  const want = hanging ? 1 : 0;
  farm.upright += (want - farm.upright) * Math.min(1, dt * 8);
  const w = farm.upright; if (w < 0.01) { b.root.updateMatrixWorld(true); return; }
  // body: hang from the hands along hands->hips, facing the camera
  _fu.copy(farm.P).sub(farm.hip).normalize();
  _fq.setFromUnitVectors(UPV, _fu);
  _fy.setFromAxisAngle(UPV, player.yaw);
  _fq.multiply(_fy);
  const slump = oneHand() ? SLUMP[window.__slump || SLUMP_PICK] : null;
  if (slump) _fq.multiply(_fr.setFromAxisAngle(_fz.set(0, 0, 1), -slump.roll));   // hanging off the right arm like a carried teddy bear
  b.root.quaternion.slerp(_fq, w);
  _v2.copy(farm.P).addScaledVector(_fu, -b.hang.hands);
  b.root.position.lerp(_v2, w);
  b.root.updateMatrixWorld(true);
  // arms straight up to the hands, a shoulder-width apart
  const side = new THREE.Vector3(1, 0, 0).applyQuaternion(b.root.quaternion);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(b.root.quaternion);
  if (oneHand()) {
    // right hand only (Mac); the left arm is free
    solveArm(b, 'R', farm.P, fwd.clone().multiplyScalar(-1), w);
    const sh = b.bones['UpperArm.L'].getWorldPosition(new THREE.Vector3()), reach = (b.len['UpperArm.L'] + b.len['LowerArm.L']) * 0.95;
    // the free left arm hangs limp, straight down (a little out and forward so it clears the body)
    const t = sh.clone().addScaledVector(DOWNV, reach).addScaledVector(side, reach * 0.12).addScaledVector(fwd, reach * 0.08);
    solveArm(b, 'L', t, fwd.clone(), w);
  } else for (const [s, sg] of [['R', -1], ['L', 1]]) solveArm(b, s, farm.P.clone().addScaledVector(side, sg * b.hang.shoulder * 0.45), fwd.clone().multiplyScalar(-1), w);
  // legs trail on their own rod
  if (hanging) for (const s of ['L', 'R']) {
    const hipB = b.bones['UpperLeg.' + s], at = hipB.getWorldPosition(new THREE.Vector3());
    const dir = farm.foot.clone().sub(farm.hip).normalize();
    aimBone(hipB, b.bones['LowerLeg.' + s].position, at.addScaledVector(dir, 1), w);   // whole leg swings from the hip; knees and feet keep their pose
  }
  // tool overhead in both hands
  const tm = farmToolMesh[farmSel()];
  if (tm && tm.visible) { tm.position.copy(farm.P); tm.quaternion.copy(b.root.quaternion); tm.scale.setScalar(b.H / 1.7); }
}

// SIT (v0.1.132; a tester asked to sit down, Mac: benches only, all three poses at random). Walk up to a bench and tap Sit:
// you hop onto the nearest spot on it, facing away from the bench on your side. Move the stick or tap Stand to get up.
const sit = { on: false, w: 0, e: 0, pose: 'A', seatY: 0.39, rec: null, from: new THREE.Vector3(), at: new THREE.Vector3(), out: new THREE.Vector3(), yaw: 0 };
const SIT_SECS = 0.4;   // seconds to sit down or stand up
function benchShape(rec, m) {
  if (!m.seat) { const bb = new THREE.Box3().setFromObject(m.g), ex = bb.max.x - bb.min.x, ez = bb.max.z - bb.min.z, alongX = ex > ez;
    m.seat = { cx: (bb.min.x + bb.max.x) / 2, cz: (bb.min.z + bb.max.z) / 2, alongX, half: Math.max(0.05, Math.max(ex, ez) / 2 - 0.32), deep: Math.min(ex, ez) / 2, top: bb.max.y }; }
  return m.seat;
}
function nearBench() {
  let best = null;
  for (const [rec, m] of decorMeshes) {
    if (rec.id !== 'bench') continue;
    const sh = benchShape(rec, m), P = player.pos, t = Math.max(-sh.half, Math.min(sh.half, sh.alongX ? P.x - sh.cx : P.z - sh.cz));
    const x = sh.alongX ? sh.cx + t : sh.cx, z = sh.alongX ? sh.cz : sh.cz + t, d = Math.hypot(P.x - x, P.z - z);
    if (d < 1.15 && (!best || d < best.d)) best = { rec, sh, x, z, d };
  }
  return best;
}
function sitDown(nb) {
  if (sit.w > 0 || !nb) return;
  const sh = nb.sh, P = player.pos, side = (sh.alongX ? P.z - sh.cz : P.x - sh.cx) >= 0 ? 1 : -1, dx = sh.alongX ? 0 : side, dz = sh.alongX ? side : 0;
  if (tool !== 'none') selectTool('none');
  const last = sit.pose, picks = Object.keys(SIT).filter(k => k !== last); sit.pose = picks[Math.floor(Math.random() * picks.length)];   // never the same pose twice in a row
  sit.rec = nb.rec; sit.from.copy(P); sit.at.set(nb.x + dx * 0.03, 0, nb.z + dz * 0.03); sit.out.set(nb.x + dx * (sh.deep + 0.34), 0, nb.z + dz * (sh.deep + 0.34));
  sit.yaw = Math.atan2(dx, dz); sit.seatY = sh.top - groundY(nb.x, nb.z); sit.on = true; player.walkTo = null; audio.play('tap');
}
function standUp() { if (!sit.on) return; sit.on = false; sit.from.copy(sit.out); }
function updateSit(dt) {
  if (!sit.on && sit.w <= 0) return;
  if (sit.on && (Math.hypot(joy.dx, joy.dy) > 0.35 || decor.on || dlg.open || !decorMeshes.has(sit.rec))) standUp();   // move the stick to get up; also if the bench is picked up
  sit.w = Math.max(0, Math.min(1, sit.w + (sit.on ? dt : -dt) / (SIT_SECS * (window.__sitSlow || 1)))); sit.e = sit.w * sit.w * (3 - 2 * sit.w);   // __sitSlow: slow motion, for pictures
  // down: from where you stood onto the seat · up: off the seat to the spot in front of it, with a little hop either way
  player.pos.lerpVectors(sit.from, sit.at, sit.e); player.pos.y = 0; player.faceYaw = sit.w > 0 ? sit.yaw : null;
  if (!sit.on && sit.w <= 0) { player.pos.copy(sit.from); player.pos.y = 0; sit.rec = null; }
}
function nearWater() { return onDock(player.pos.x, player.pos.z) || player.pos.z < -2.0 || !!spots.freshTarget(player.pos.x, player.pos.z); }   // FISHING: + river and lake
function pickUse() {
  if (dlg.open || decor.on || farm.mode !== 'off') return null;
  if (sit.on) return { kind: 'stand', key: 'stand' };   // SIT
  if (sit.w > 0) return null;
  // people and the board: the closest one wins, and the one you're already facing sticks unless another is
  // clearly closer, so the button doesn't flip back and forth between two of them (Mac)
  if (fishing.state === 'idle') {
    { const fa = spots.action(); if (fa) return fa; }   // FISHING: Take at the worm bucket (right next to it, it wins over Fishel)
    const P = player.pos, d = (x, z) => Math.hypot(P.x - x, P.z - z), cand = [];
    if (nearHiggins()) cand.push({ a: { kind: 'talk', key: 'higgins' }, d: d(higgins.pos.x, higgins.pos.z) });
    if (nearFishel()) cand.push({ a: { kind: 'talk', key: 'fishel' }, d: d(fishel.pos.x, fishel.pos.z) });
    if (nearPike()) cand.push({ a: { kind: 'talk', key: 'pike' }, d: d(pike.pos.x, pike.pos.z) });
    if (nearRosa()) cand.push({ a: { kind: 'talk', key: 'rosa' }, d: d(rosa.pos.x, rosa.pos.z) });
    if (nearBoard()) cand.push({ a: { kind: 'board', key: 'board' }, d: d(BOARD.x, BOARD.z + 0.5) });
    { const nb = tool === 'rod' && nearWater() ? null : nearBench(); if (nb) cand.push({ a: { kind: 'sit', key: 'sit', bench: nb }, d: nb.d + 0.4 }); }   // SIT: a bench you're standing at (people and the board win when both are close)
    if (cand.length) {
      cand.sort((x, y) => x.d - y.d);
      const cur = useAction && cand.find(c => c.a.key === useAction.key);
      return cur && cur.d < cand[0].d + 0.6 ? cur.a : cand[0].a;
    }
  }
  if (clr) return null;
  const sl = nearLotSign(); if (sl && fishing.state === 'idle') return { kind: 'lot', key: sl.id, lot: sl };
  if (fishing.state === 'idle') { const cb = tool === 'rod' ? null : cargo.nearBox(); if (cb !== null) return { kind: 'load', key: 'cargo' + cb, box: cb }; if (tool !== 'rod' && cargo.nearNextBox()) return { kind: 'buybox', key: 'buybox' }; if (cargo.nearChest()) return { kind: 'collect', key: 'collect' }; }
  const wi0 = nearWeed(), ds = fishing.state === 'idle' && nearDig();
  if (ds && !(wi0 && Math.hypot(wi0.position.x - player.pos.x, wi0.position.z - player.pos.z) < Math.hypot(ds.g.position.x - player.pos.x, ds.g.position.z - player.pos.z))) return hasTool('shovel') ? { kind: 'dig', key: 'dig' + ds.i, spot: ds } : { kind: 'needtool', key: 'digneed', icon: 'shovel', label: 'Dig', why: `Dig spots need a shovel. ${toolSeller()} sells them.` };
  const wi = wi0; if (wi && fishing.state === 'idle' && !(tool === 'rod' && nearWater())) {   // FISHING: with the rod out by the water, Cast wins over Clear
    const nd = CLEAR_NEEDS[wi.userData.kind] || { tool: null };
    if (nd.tool && !hasTool(nd.tool)) return { kind: 'needtool', key: 'need' + wi.userData.key, icon: nd.tool, label: 'Clear', why: `${clearName(wi)} needs a ${GEAR[nd.tool].name.toLowerCase()}. ${toolSeller()} sells them.` };
    return { kind: 'clear', key: wi.userData.key, item: wi, icon: nd.tool || 'hand' };
  }
  const onWater = nearWater();
  if (tool === 'rod' && ['flick', 'flight', 'wait'].includes(fishing.state)) return { kind: 'wait', key: 'wait' };
  if (tool === 'rod' && fishing.state === 'bite') return { kind: 'bite', key: 'bite' };
  if (tool === 'rod' && fishing.state === 'fight') return reel.use();   // REEL
  if (tool === 'rod' && (fishing.state === 'catch' || fishing.state === 'reel')) return null;
  if (tool === 'rod' && onWater) return bestBait() ? { kind: 'cast', key: 'dock' } : { kind: 'nobait', key: 'nobait' };   // FISHING: no bait, no cast
  // nearest ripe crop always wins
  let best = null, bd = 1.4;
  for (const pl of plots.values()) {
    const d = Math.hypot(pl.cell.x + 0.5 - player.pos.x, pl.cell.z + 0.5 - player.pos.z);
    if (pl.grown && d < bd) { bd = d; best = pl; }
  }
  if (best) {
    // Mac (Nov 22): close to several ripe plants, the button is the shears: tap, float up, then harvest with your finger. Nothing is cut for you.
    // Not during the first goals, which teach the Harvest button.
    if (!S.goals || S.goals.done) {
      let ripe = 0; for (const pl of plots.values()) if (pl.grown && Math.hypot(pl.cell.x + 0.5 - player.pos.x, pl.cell.z + 0.5 - player.pos.z) < SHEARS_NEAR) ripe++;
      if (ripe >= SHEARS_AT) return { kind: 'shears', key: 'shears' };
    }
    return { kind: 'harvest', key: cellKey(best.cell), plot: best, cell: best.cell };
  }
  const c = facingCell(); const here = plots.get(cellKey(c));
  if (tool === 'seeds' && (!S.goals || S.goals.done) && invCount(seedSel()) > 0) {   // Mac: near 3 or more empty tilled plots, the button is the seed bag
    let empty = 0; for (const pl of plots.values()) if (!pl.save.crop && Math.hypot(pl.cell.x + 0.5 - player.pos.x, pl.cell.z + 0.5 - player.pos.z) < SHEARS_NEAR) empty++;
    if (empty >= SHEARS_AT) return { kind: 'sow', key: 'sow' };
  }
  if (tool === 'seeds' && here && !here.save.crop) return { kind: 'plant', key: cellKey(c), plot: here, cell: c };
  if (tool === 'seeds') {
    for (const pl of plots.values()) {
      if (!pl.save.crop && Math.hypot(pl.cell.x + 0.5 - player.pos.x, pl.cell.z + 0.5 - player.pos.z) < 1.3) return { kind: 'plant', key: cellKey(pl.cell), plot: pl, cell: pl.cell };
    }
  }
  return null;
}

const dmgEls = [];
function damageText(worldPos, amount) {
  const el = document.createElement('div'); el.className = 'dmg'; el.textContent = amount; document.body.appendChild(el);
  dmgEls.push({ el, p: worldPos.clone(), t: 0 });
}


// ---------- crop icons: each harvested crop rendered from its 3D model, once at boot ----------
const cropIcon = {};
// side-on pictures of every fish species (from the real models, tinted), head facing left; used by the catch card
const fishIcon = {};
// the pack's picture, for the Backpack button and the Wardrobe; one per colour, made once
const packIcons = {};
function packIcon(color, kind = 'day') {
  const key = kind + color; if (packIcons[key]) return packIcons[key];
  const cv = document.createElement('canvas'), R = 192;
  const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setSize(R, R, false); r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0x000000, 0);
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0xb9a98a, 2.0)); const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(2.5, 4, 3); sc.add(sun);
  const o = packModel(kind, color); o.rotation.y = -0.45; sc.add(o);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.01, 100); cam.position.set(0.4, 1.35, 4.6); cam.lookAt(0, 0.5, 0);
  r.render(sc, cam); const flat = document.createElement('canvas'); flat.width = flat.height = R; flat.getContext('2d').drawImage(cv, 0, 0);
  const url = trimTight(flat, 180); r.dispose(); r.forceContextLoss();
  return (packIcons[key] = url);
}
// the Backpack button shows the pack you wear, in its colour (the plain icon if you wear none)
function syncPackBtn() {
  const btn = document.getElementById('packBtn'), L = S.look, col = L && BACKPACKS[L.pack] ? (L.packColor || '#f2a531') : '#f2a531', key = 'p' + col;
  if (btn.dataset.pk === key) return; btn.dataset.pk = key;
  btn.innerHTML = `<img src="${packIcon(col)}" alt="" draggable="false">`;
}
function renderFishIcons() {
  const cv = document.createElement('canvas'), R = 256;
  const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setSize(R, R, false); r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0x000000, 0);
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xffffff, 0x8a7f9a, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(2, 4, 3); sc.add(sun);
  const cam = new THREE.PerspectiveCamera(24, 1, 0.01, 100);
  const turn = document.createElement('canvas'); turn.width = turn.height = R;
  for (const fish of [...FISH, ...SIGHTS]) {   // FISHING: + the sightings' pictures
    const g = M.fish[fish.model]; if (!g) continue;
    const o = SkeletonUtils.clone(g.scene);   // a plain clone would keep following the original skeleton
    if (fish.tint) o.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); const h = {}; m.material.color.getHSL(h); if (fish.tintAll) m.material.color.lerp(new THREE.Color(fish.tint), fish.tintAll); else if (h.l > 0.25) m.material.color.lerp(new THREE.Color(fish.tint), 0.75); } });
    if (fish.model === 'Manta_ray') o.rotation.set(1.0, 0, 0.5); else o.rotation.set(Math.PI / 2, 0, Math.PI / 2);   // side-on (manta from above)
    sc.add(o);
    // skinned fish: pose the skeleton before measuring, or the bounds (and the camera) land in empty space
    o.updateMatrixWorld(true);
    o.traverse(m => { if (m.isSkinnedMesh) { m.skeleton.update(); m.computeBoundingBox(); m.computeBoundingSphere(); } });
    const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
    cam.position.copy(c).add(new THREE.Vector3(0, size * 0.35, size * 2.3)); cam.lookAt(c);
    r.render(sc, cam); sc.remove(o);
    // the render comes out head-down: turn it a quarter clockwise so the fish swims head-first to the left
    const t2 = turn.getContext('2d'); t2.setTransform(1, 0, 0, 1, 0, 0); t2.clearRect(0, 0, R, R);
    t2.translate(R, 0); t2.rotate(Math.PI / 2); t2.drawImage(cv, 0, 0);
    fishIcon[fish.id] = trimTight(turn, 240);
  }
  r.dispose(); r.forceContextLoss();
}
function renderCropIcons(ids) {
  const cv = document.createElement('canvas'), R = 96;
  const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setSize(R, R, false); r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0x000000, 0);
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xffffff, 0x8a7f9a, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(2, 4, 3); sc.add(sun);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
  for (const id of ids) {
    const c = CROPS[id], [kit, name] = c.icon, o = M[kit][name].scene.clone(true);
    const raw = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
    // flat items (a bundle of rice or wheat) are tipped up toward the camera so they read from above
    o.rotation.set(raw.y < 0.35 * Math.max(raw.x, raw.z) ? 1.05 : -0.15, 0.6, 0); sc.add(o);
    const box = new THREE.Box3().setFromObject(o), ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
    cam.position.copy(ctr).add(new THREE.Vector3(0, size * 0.55, size * 1.9)); cam.lookAt(ctr);
    r.render(sc, cam); cropIcon[id] = trimIcon(cv); sc.remove(o);
  }
  r.dispose(); r.forceContextLoss();
}
// crop the render to the vegetable itself (models have empty space around them) and centre it
function trimIcon(src, OUT = 64) {
  const W = src.width, c2 = document.createElement('canvas'); c2.width = c2.height = W;
  const g = c2.getContext('2d'); g.drawImage(src, 0, 0);
  const px = g.getImageData(0, 0, W, W).data;
  let x0 = W, y0 = W, x1 = -1, y1 = -1;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (px[(y * W + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return src.toDataURL('image/png');
  const side = Math.max(x1 - x0, y1 - y0) + 1, pad = Math.round(side * 0.06), out = document.createElement('canvas');
  out.width = out.height = OUT;
  const k = OUT / (side + pad * 2), w = (x1 - x0 + 1) * k, h = (y1 - y0 + 1) * k;
  out.getContext('2d').drawImage(src, x0, y0, x1 - x0 + 1, y1 - y0 + 1, (OUT - w) / 2, (OUT - h) / 2, w, h);
  return out.toDataURL('image/png');
}
// like trimIcon but keeps the picture's own shape (a long fish stays long), longest side = MAX
function trimTight(src, MAX) {
  const W = src.width, H = src.height, g = src.getContext('2d', { willReadFrequently: true });
  const px = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[(y * W + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return src.toDataURL('image/png');
  const w = x1 - x0 + 1, h = y1 - y0 + 1, k = MAX / Math.max(w, h), out = document.createElement('canvas');
  out.width = Math.round(w * k); out.height = Math.round(h * k);
  out.getContext('2d').drawImage(src, x0, y0, w, h, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
// a crop's icon, or a small spinner while its models load
function cropImg(id, sz) {
  if (cropIcon[id]) return `<img class="cimg" src="${cropIcon[id]}" width="${sz}" height="${sz}" alt="">`;
  ensureCrop(id);
  return `<span class="cspin" style="width:${Math.round(sz * 0.7)}px;height:${Math.round(sz * 0.7)}px" role="img" aria-label="Loading"></span>`;
}

// ---------- crop timers (v0.1.12, mockup A4) ----------
// Small tags over plants within TAG_NEAR: time left; the plants right next to you also get
// their name on top; a ready plant shows a white bubble with its vegetable bouncing.
const TAG_NEAR = 2.5, TAG_NAME = 1.7;
const CLOCK_SVG = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#2b2140" stroke-width="3" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const tagLayer = document.getElementById('cropTags'), tagEls = new Map(), tagV = new THREE.Vector3();
function fmtLeft(ms) { const sec = Math.ceil(ms / 1000); return sec < 60 ? sec + 's' : Math.ceil(sec / 60) + 'm'; }
function updateCropTags() {
  const seen = new Set(), cls = document.body.classList;
  if (!cls.contains('inmenu') && !cls.contains('decorating')) for (const [k, p] of plots) {
    if (!p.save.crop) continue;
    const d = Math.hypot(p.g.position.x - player.pos.x, p.g.position.z - player.pos.z);
    const crop = CROPS[p.save.crop], left = p.save.plantedAt + growMs(p.save.crop) - Date.now();
    if (d > TAG_NEAR && left > 0) continue;   // timers only up close; a ripe crop's bubble shows at any distance
    tagV.copy(p.g.position); tagV.y += plantLab().lift ? Math.max(0.75, Math.min(plantLab().liftMax, (p.top || 0) + 0.12)) : 0.75; tagV.project(camera);
    if (tagV.z > 1 || Math.abs(tagV.x) > 1.1 || Math.abs(tagV.y) > 1.1) continue;
    const mode = left <= 0 ? 'ready' : d <= TAG_NAME ? 'named' : 'time';
    let el = tagEls.get(k);
    if (!el) { el = document.createElement('div'); tagLayer.appendChild(el); tagEls.set(k, el); }
    const key = mode + '|' + (mode === 'ready' ? p.save.crop + (cropIcon[p.save.crop] ? '+' : '') : fmtLeft(left));
    if (el.dataset.k !== key) {
      el.dataset.k = key; el.className = 'ctag ' + mode;
      el.innerHTML = mode === 'ready' ? `<div class="cbub">${cropImg(p.save.crop, 18)}</div>`
        : mode === 'named' ? `<b>${crop.name}</b><span>${CLOCK_SVG}${fmtLeft(left)}</span>`
        : `${CLOCK_SVG}${fmtLeft(left)}`;
    }
    el.style.transform = `translate(${((tagV.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - tagV.y) / 2 * innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
    seen.add(k);
  }
  for (const [k, el] of tagEls) if (!seen.has(k)) { el.remove(); tagEls.delete(k); }
}

// ---------- time of day ----------
const TOD = {
  morning: { grade: 'rgba(255,170,205,0.55)', sky: ['#ffd6e4', '#fff3dc'], fog: 0xfbe8e0, sun: [0xffe1c9, 2.3], fill: [0xfff0e6, 0.55], sunPos: [16, 10, -4], hemi: [0xffe6f0, 0xc9e4d0, 1.35], water: 0x9ad6f2, lamps: 0, clock: '7:40 AM', exp: 1.14 },
  day:     { grade: 'rgba(0,0,0,0)', sky: ['#5ec0ff', '#d6f2ff'], fog: 0xcdeeff, sun: [0xfffbe8, 3.0], fill: [0xffffff, 0.45], sunPos: [10, 20, -6], hemi: [0xffffff, 0x7fb07a, 1.0], water: 0x2f9be0, lamps: 0, clock: '2:15 PM', exp: 1.05 },
  evening: { grade: 'rgba(255,140,60,0.35)', sky: ['#ff9a72', '#ffdcaa'], fog: 0xffd2b0, sun: [0xffb47a, 1.9], fill: [0xffe2c8, 0.75], sunPos: [-18, 8, -4], hemi: [0xffd9bd, 0x7a6a80, 0.95], water: 0x3f6fa8, lamps: 2.5, clock: '6:50 PM', exp: 1.0 },
  night:   { grade: 'rgba(35,65,195,0.24)', sky: ['#1b3062', '#3c5ea4'], fog: 0x263e6c, sun: [0xa4bcff, 3.3], fill: [0xb8c8ff, 1.6], sunPos: [-8, 16, -10], hemi: [0x4a6cc2, 0x18244a, 1.1], water: 0x285a8c, lamps: 6, clock: '11:20 PM', exp: 1.22, moon: 1, glint: 0.3 },
};
let todKey = 'day';
// a soft streak of moonlight on the water, kept out ahead of the player
let moonPath = null;
function makeMoonPath() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const lin = g.createLinearGradient(0, 0, 0, 256); lin.addColorStop(0, 'rgba(255,255,255,0)'); lin.addColorStop(0.35, 'rgba(255,255,255,0.9)'); lin.addColorStop(1, 'rgba(255,255,255,0.15)');
  g.fillStyle = lin; g.fillRect(0, 0, 64, 256);
  const side = g.createLinearGradient(0, 0, 64, 0); side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(0.5, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = side; g.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(c);
  moonPath = new THREE.Mesh(new THREE.PlaneGeometry(6, 26).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, color: 0xdfe8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  scene.add(moonPath);
}
function updateMoonPath() {
  if (!moonPath) return;
  // small glint out on the water, lined up with the moon so it agrees with the shadows
  const sp = TOD.night.sunPos, az = Math.atan2(sp[0], sp[2]);
  const c = player.pos.clone().add(new THREE.Vector3(Math.sin(az) * 10, 0, Math.cos(az) * 10)); c.z = Math.min(c.z, -7);
  moonPath.position.set(c.x, WATER_Y + 0.12, c.z); moonPath.rotation.y = az;
  moonPath.scale.set(0.6, 1, 0.7);
  moonPath.material.map.offset.y = (elapsed * 0.03) % 1;
}
function setTOD(k) {
  todKey = k; const t = TOD[k];
  document.getElementById('sky').style.background = `linear-gradient(${t.sky[0]}, ${t.sky[1]} 60%)`;
  scene.fog.color.set(t.fog);
  document.getElementById('grade').style.background = t.grade;
  sun.color.set(t.sun[0]); sun.intensity = t.sun[1]; fillLight.color.set(t.fill[0]); fillLight.intensity = t.fill[1];
  hemi.color.set(t.hemi[0]); hemi.groundColor.set(t.hemi[1]); hemi.intensity = t.hemi[2];
  if (waterMat) waterMat.color.set(t.water);
  lanternLights.forEach(l => l.intensity = t.lamps);
  renderer.toneMappingExposure = t.exp;
  if (moonPath) moonPath.material.opacity = (t.moon || 0) * (t.glint ?? 0.55);
  document.querySelectorAll('#todSeg button').forEach(b => b.classList.toggle('on', b.dataset.t === k));
  document.getElementById('todIcon').innerHTML = svg({ morning: 'sunrise', day: 'sun', evening: 'sunset', night: 'moon' }[k], k === 'night' ? '#5a6aaa' : '#f2a531', 18, 2.4);
}
function currentTOD() { return (settings.debug && settings.todOverride) || timeOfDay(); }
let clockMin = -1;
function tickClock() {
  const d = new Date();
  if (d.getMinutes() !== clockMin) {
    clockMin = d.getMinutes();
    document.getElementById('clock').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    updateHUD();
  }
  const k = currentTOD(); if (k !== todKey) setTOD(k);
}
document.querySelectorAll('#bodySeg button').forEach(b => b.addEventListener('click', () => {
  setBody(b.dataset.b); S.body = b.dataset.b; commit();
  document.querySelectorAll('#bodySeg button').forEach(x => x.classList.toggle('on', x === b));
}));

// ---------- decorating (layout B: tray at the bottom, big thumb controls on the left) ----------
const decor = { on: false, ghost: null, prevTool: 'none' };
const decorOcc = new Map();          // cell key -> placed decor record
const decorMeshes = new Map();       // record -> { g, light }
const decorEls = { tray: document.getElementById('decorTray'), ctl: document.getElementById('decorCtl'), banner: document.getElementById('decorBanner') };
function footprint(id, r) { const [w, d] = DECOR[id].size; return r % 2 ? [d, w] : [w, d]; }
function cellsOf(id, ax, az, r) { const [w, d] = footprint(id, r), out = []; for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) out.push((ax + i) + ',' + (az + j)); return out; }
function buildDecorMesh(id, r) {
  const d = DECOR[id]; if (d.build) return shadowize(d.build(r));   // ANIMALS: decor that builds its own model (the coop)
  const [kit, name, sc] = d.model;
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  if (name === 'flowers') {
    const pick = ['flower_redA', 'flower_yellowA', 'flower_purpleA'];
    [[-0.22, -0.18], [0.2, -0.1], [0, 0.22], [-0.25, 0.2]].forEach(([x, z], i) => { const f = M.nature[pick[i % 3]].scene.clone(true); f.scale.setScalar(SCALE.nature * sc); f.position.set(x, 0, z); f.rotation.y = i * 1.7; inner.add(f); });
  } else {
    const m = M[kit][name].scene.clone(true); m.scale.setScalar(SCALE[kit] * sc); inner.add(m);
  }
  inner.rotation.y = r * Math.PI / 2;
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner), c = box.getCenter(new THREE.Vector3());
  inner.position.x -= c.x; inner.position.z -= c.z;
  shadowize(g);
  return g;
}
function decorCenter(id, ax, az, r) { const [w, d] = footprint(id, r); return new THREE.Vector3(ax + w / 2, 0, az + d / 2); }
function spawnDecor(rec) {
  const g = buildDecorMesh(rec.id, rec.r), c = decorCenter(rec.id, rec.x, rec.z, rec.r);
  g.position.set(c.x, groundY(c.x, c.z), c.z); scene.add(g);
  let light = null;
  if (DECOR[rec.id].light) { light = new THREE.PointLight(0xffc56b, TOD[todKey] ? TOD[todKey].lamps : 0, 7, 1.6); light.position.set(c.x, groundY(c.x, c.z) + 2.1, c.z); scene.add(light); lanternLights.push(light); }
  decorMeshes.set(rec, { g, light });
  for (const k of cellsOf(rec.id, rec.x, rec.z, rec.r)) decorOcc.set(k, rec);
}
function despawnDecor(rec) {
  const m = decorMeshes.get(rec); if (!m) return;
  scene.remove(m.g); if (m.light) { scene.remove(m.light); lanternLights.splice(lanternLights.indexOf(m.light), 1); }
  decorMeshes.delete(rec);
  for (const k of cellsOf(rec.id, rec.x, rec.z, rec.r)) decorOcc.delete(k);
}
function restoreDecor() { for (const rec of S.decor) spawnDecor(rec); }
function decorCellOK(k) {
  const [x, z] = k.split(',').map(Number);
  if (spots.onBank(x + 0.5, z + 0.5)) return false;   // FISHING
  if (z < -3 || z > FENCE_Z - 1.55 || Math.abs(x + 0.5) > 14) return false;
  if (weedBlocks(k)) return false;
  if (x >= -1 && x <= 0 && z >= -3) return false;                     // the path
  if (x >= 1 && x <= 4 && z <= -3) return false;                      // the dock entrance
  if (decorOcc.has(k) || plots.has(k)) return false;
  return !NO_TILL.some(([nx, nz, r]) => Math.hypot(x + 0.5 - nx, z + 0.5 - nz) < r);
}
function ghostValid(gh) { return cellsOf(gh.id, gh.x, gh.z, gh.r).every(decorCellOK); }
function makeGhost(id, ax, az, r, fromRec) {
  clearGhost();
  const g = buildDecorMesh(id, r);
  g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.62; o.material.depthWrite = false; o.castShadow = false; o.userData.ghost = true; } });
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }));
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.001, 1)), new THREE.LineBasicMaterial({ color: 0xffffff }));
  scene.add(g, pad, edge);
  decor.ghost = { id, x: ax, z: az, r, g, pad, edge, fromRec: fromRec || null };
  updateGhost();
  showDecorUI();
}
function updateGhost() {
  const gh = decor.ghost; if (!gh) return;
  const c = decorCenter(gh.id, gh.x, gh.z, gh.r), [w, d] = footprint(gh.id, gh.r), ok = ghostValid(gh);
  const y = groundY(c.x, c.z);
  gh.g.position.set(c.x, y + 0.02, c.z);
  gh.pad.position.set(c.x, y + 0.04, c.z); gh.pad.scale.set(w * 0.96, 1, d * 0.96); gh.pad.material.color.set(ok ? 0xfff1a8 : 0xff6b6b);
  gh.edge.position.set(c.x, y + 0.05, c.z); gh.edge.scale.set(w, 1, d); gh.edge.material.color.set(ok ? 0xffffff : 0xff6b6b);
  gh.g.traverse(o => { if (o.userData.ghost) { o.material.emissive = o.material.emissive || new THREE.Color(); o.material.emissive.set(ok ? 0x333333 : 0x992222); } });
  document.getElementById('dPlace').disabled = !ok;
}
function clearGhost() {
  const gh = decor.ghost; if (!gh) return;
  scene.remove(gh.g, gh.pad, gh.edge); decor.ghost = null;
  // the model's shapes are shared with placed decor, so only the ghost's own copies are freed
  gh.g.traverse(o => { if (o.isMesh && o.userData.ghost) o.material.dispose(); });
  for (const o of [gh.pad, gh.edge]) { o.geometry.dispose(); o.material.dispose(); }
}
let grab = { dx: 0, dz: 0 };
function groundHit(x, y) {
  tapNdc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); tapRay.setFromCamera(tapNdc, camera);
  const h = groundMesh && tapRay.intersectObject(groundMesh, false)[0]; return h ? h.point : null;
}
function ghostGrab(x, y) {
  const p = groundHit(x, y), gh = decor.ghost; if (!p || !gh) return;
  const c = decorCenter(gh.id, gh.x, gh.z, gh.r);
  grab.dx = c.x - p.x; grab.dz = c.z - p.z;
  // grabbing far from the ghost moves it straight under the finger
  if (Math.hypot(grab.dx, grab.dz) > 2.2) { grab.dx = 0; grab.dz = 0; ghostDrag(x, y); }
}
function ghostDrag(x, y) {
  const p = groundHit(x, y), gh = decor.ghost; if (!p || !gh) return;
  const [w, d] = footprint(gh.id, gh.r);
  const nx = Math.round(p.x + grab.dx - w / 2), nz = Math.round(p.z + grab.dz - d / 2);
  if (nx !== gh.x || nz !== gh.z) { gh.x = nx; gh.z = nz; updateGhost(); }
}
function decorTap(x, y) {
  if (decor.ghost) return;
  const p = groundHit(x, y); if (!p) return;
  const rec = decorOcc.get(Math.floor(p.x) + ',' + Math.floor(p.z)); if (!rec) return;
  // pick a placed item back up
  despawnDecor(rec); S.decor = S.decor.filter(r => r !== rec); addItem('decor_' + rec.id, 1); commit();
  makeGhost(rec.id, rec.x, rec.z, rec.r, rec);
  renderTray();
}
function frontAnchor(id, r) {
  const f = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)), [w, d] = footprint(id, r);
  const p = player.pos.clone().addScaledVector(f, 1.6);
  const ax = Math.round(p.x - w / 2), az = Math.round(p.z - d / 2);
  // start on the nearest free spot so the ghost doesn't appear red on the path
  for (let rad = 0; rad <= 5; rad++) for (let i = -rad; i <= rad; i++) for (let j = -rad; j <= rad; j++) {
    if (Math.max(Math.abs(i), Math.abs(j)) !== rad) continue;
    if (cellsOf(id, ax + i, az + j, r).every(decorCellOK)) return [ax + i, az + j];
  }
  return [ax, az];
}
function renderTray() {
  const ids = Object.keys(DECOR).filter(id => invCount('decor_' + id) > 0);   // STORE: includes the store's extra decor
  const cards = ids.map(id => `<button class="dtile${decor.ghost && decor.ghost.id === id ? ' on' : ''}" data-decor="${id}" aria-label="${DECOR[id].name}, ${invCount('decor_' + id)} left">${svg(id, '#2b2140', 26)}<span>${DECOR[id].name}</span><b>×${invCount('decor_' + id)}</b></button>`).join('');
  decorEls.tray.querySelector('.dscroll').innerHTML = (cards || `<div class="dempty">No decor left. ${toolSeller()} sells more.</div>`) + '<button class="ddone" data-done>Done</button>';
}
decorEls.tray.addEventListener('click', (e) => {
  if (e.target.closest('[data-done]')) { exitDecor(); return; }
  const b = e.target.closest('[data-decor]'); if (!b) return;
  const id = b.dataset.decor;
  if (decor.ghost && decor.ghost.id === id) return;
  if (decor.ghost && decor.ghost.fromRec) { /* switching away from a picked-up item: it stays in the bag */ }
  const [ax, az] = decor.ghost ? [decor.ghost.x, decor.ghost.z] : frontAnchor(id, 0);
  makeGhost(id, ax, az, decor.ghost ? decor.ghost.r : 0); renderTray();
});
document.getElementById('dRotate').addEventListener('click', () => {
  const gh = decor.ghost; if (!gh || DECOR[gh.id].fixed) return;   // ANIMALS: buildings always face the camera (decision 49)
  const c = decorCenter(gh.id, gh.x, gh.z, gh.r), turns = DECOR[gh.id].turns;   // some things only turn to a few sides (the doghouse never shows its back)
  gh.r = turns ? turns[(turns.indexOf(gh.r) + 1) % turns.length] : (gh.r + 1) % 4;
  const [w, d] = footprint(gh.id, gh.r); gh.x = Math.round(c.x - w / 2); gh.z = Math.round(c.z - d / 2);
  scene.remove(gh.g); gh.g = buildDecorMesh(gh.id, gh.r);
  gh.g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.62; o.material.depthWrite = false; o.castShadow = false; o.userData.ghost = true; } });
  scene.add(gh.g); updateGhost();
});
document.getElementById('dPlace').addEventListener('click', () => {
  const gh = decor.ghost; if (!gh || !ghostValid(gh)) return;
  const rec = { id: gh.id, x: gh.x, z: gh.z, r: gh.r };
  addItem('decor_' + gh.id, -1); S.decor.push(rec); spawnDecor(rec); commit();
  const id = gh.id, r = gh.r, [w] = footprint(id, r);
  if (invCount('decor_' + id) > 0) makeGhost(id, gh.x + w, gh.z, r); else { clearGhost(); showDecorUI(); }
  renderTray();
});
document.getElementById('dCancel').addEventListener('click', () => { clearGhost(); showDecorUI(); renderTray(); });
function showDecorUI() {
  decorEls.ctl.hidden = !(decor.on && decor.ghost);
  decorEls.banner.querySelector('span').textContent = decor.ghost ? `Drag the ${DECOR[decor.ghost.id].name.toLowerCase()} to move it` : 'Pick an item below, or tap something you placed to move it';
}
function enterDecor() {
  if (player.pos.z > FENCE_Z) return;
  if (fishing.state !== 'idle') reelIn();
  decor.on = true; decor.prevTool = tool === 'decor' ? 'none' : tool; selectTool('none', true);
  document.body.classList.add('decorating');
  decorEls.tray.hidden = false; decorEls.banner.hidden = false;
  renderTray(); showDecorUI();
}
function exitDecor() {
  clearGhost(); decor.on = false;
  document.body.classList.remove('decorating');
  decorEls.tray.hidden = true; decorEls.ctl.hidden = true; decorEls.banner.hidden = true;
  selectTool(decor.prevTool || 'none', true);
}
function giveStarterKit() {
  for (const [id, n] of Object.entries(STARTER_KIT)) addItem('decor_' + id, n);
  S.kitGiven = true; renderHotbar(); commit();
}

// ---------- town level (decision 60: badge A on the coin panel) ----------
const unlocked = (item) => unlockLevel(item) <= S.level;
let levelQueue = [];
function addXP(n) {
  if (!n) return;
  S.xp = Math.max(0, (S.xp || 0) + n);
  const lv = levelFor(S.xp);
  while (lv > S.level) { S.level++; levelQueue.push(S.level); }
  ensureRosa();
  renderLevel();
}
function renderLevel() {
  try { if (Object.keys(lotView).length) refreshLots(); } catch (e) { /* lots not built yet */ }
  try { if (cargo.ready()) cargo.refresh(); } catch (e) { /* harbor not built yet */ }
  try { if (cargo.ready()) refreshDig(); } catch (e) { /* not built yet */ }
  const { lv, have, need } = xpInto(S.xp || 0);
  const frac = lv > S.level ? 1 : have / need, r = 20, c = 2 * Math.PI * r;
  document.getElementById('lvArc').setAttribute('stroke-dasharray', `${(c * frac).toFixed(1)} ${c.toFixed(1)}`);
  document.getElementById('lvNum').textContent = S.level;
  document.getElementById('lvBadge').setAttribute('aria-label', `Town level ${S.level}, ${have} of ${need} XP. Show what levels unlock`);
}
function unlockName(u) { if (u.rod) return RODS[u.rod].name; if (u.tool) return GEAR[u.tool].name; if (u.decor) return DECOR[u.decor].name; return u.later || u.place ? u.later || u.place : ITEMS[u.item].kind === 'seed' ? ITEMS[u.item].name : u.item === 'worm' ? 'Worms' : u.item === 'shrimp' ? 'Shrimp bait' : ITEMS[u.item].name; }
function unlockWhere(u) { if (u.rod) return 'Fishel\u2019s Rods tab'; if (u.tool) return store.isOpen() ? 'Nell\u2019s store' : 'Higgins'; if (u.decor) return 'Nell\u2019s store'; if (u.store) return 'Left of the order board'; return u.later ? 'Coming later' : u.ship ? 'At the dock' : u.land ? 'FOR SALE sign by the gate' : u.place ? 'By the order board' : ITEMS[u.item].kind === 'seed' ? (unlockLevel(u.item) >= 2 ? 'Rosa\u2019s Flowers' : 'Higgins') : 'Fishel'; }
function unlockPic(u) {
  if (u.later) return `<span class="lvlater">${svg('sun', '#854f0b', 34)}</span>`;
  if (u.rod) return `<span class="lvlater" style="background:#dff1fb;border-color:#3e8fe0">${svg('rod', '#2b2140', 34)}</span>`;
  if (u.tool) return `<span class="lvlater" style="background:#efe6d8;border-color:#8a5a34">${svg(u.tool, '#6e4220', 34)}</span>`;
  if (u.store) return `<span class="lvlater" style="background:#fde4dc;border-color:#c0392b">${svg('decor', '#a8322a', 34)}</span>`;
  if (u.decor) return `<span class="lvlater" style="background:#dcecfb;border-color:#3e8ee8">${ICON[u.decor] ? svg(u.decor, '#2f6fb8', 34) : svg('decor', '#2f6fb8', 34)}</span>`;
  if (u.land) return `<span class="lvlater" style="background:#dff3d0;border-color:#5aa54a">${svg('coin', '#3f7a35', 34)}</span>`;
  if (u.ship) return `<span class="lvlater" style="background:#dcecfb;border-color:#3e8ee8">${svg('crate', '#2f6fb8', 34)}</span>`;
  if (u.place) return `<span class="lvlater" style="background:#fde4dc;border-color:#e8846a">${svg('flowers', '#c0563c', 34)}</span>`;
  const it = ITEMS[u.item];
  return it.kind === 'seed' ? cropImg(it.crop, 56) : `<span class="lvbait" style="background:${BAIT_COLORS[u.item]}33;border-color:${BAIT_COLORS[u.item]}">${svg(u.item, '#2b2140', 34)}</span>`;
}
const RANK_UP = { 5: 'You\u2019re a village now!', 10: 'You\u2019re a harbor town now!', 20: 'You\u2019re a city now!' };
function busyForLevelCard() {
  return catchT > 0 || dlg.open || ward.on || farm.mode !== 'off' || [...document.querySelectorAll('.sheet')].some(x => !x.hidden);
}
function showLevelUp(lv) {
  audio.play('levelUp');
  const list = LEVELS[lv] || [];
  document.getElementById('luLevel').textContent = `Town level ${lv}`;
  document.getElementById('luHead').textContent = RANK_UP[lv] || 'Level up!';
  document.getElementById('luSub').textContent = list.length ? (list.every(u => u.later) ? 'On the way:' : 'New in town:') : 'Keep it up. More opens soon.';
  document.getElementById('luItems').innerHTML = list.map((u, i) => `<div class="luit"><div class="lupic" style="animation-delay:${i * 0.3}s">${unlockPic(u)}</div><div class="lun">${unlockName(u)}</div><div class="luw">${unlockWhere(u)}</div></div>`).join('');
  const ring = document.getElementById('luRing'); ring.innerHTML = ringSVG(lv, 0.04, 64);
  const conf = document.getElementById('luConf'); conf.innerHTML = '';
  const cols = ['#e8846a', '#ffe08a', '#7cc86a', '#3e8fe0', '#c36bd6'];
  for (let i = 0; i < 22; i++) { const d = document.createElement('i'); d.style.left = (8 + Math.random() * 84) + '%'; d.style.background = cols[i % cols.length]; d.style.animationDelay = (Math.random() * 0.4).toFixed(2) + 's'; conf.appendChild(d); }
  document.getElementById('levelUp').hidden = false;
  const card = document.querySelector('#levelUp .lucard'); card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
  buzz();
}
document.getElementById('luOk').addEventListener('click', () => { document.getElementById('levelUp').hidden = true; });
function ringSVG(level, frac, sz) {
  const r = sz / 2 - 4, c = 2 * Math.PI * r, h = sz / 2;
  return `<svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}" aria-hidden="true"><circle cx="${h}" cy="${h}" r="${h - 1.5}" fill="#fffcf4" stroke="#2b2140" stroke-width="3"/><circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke="#e6dfd2" stroke-width="5"/><circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke="#7cc86a" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(c * frac).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${h} ${h})"/><text x="${h}" y="${h + sz * 0.13}" text-anchor="middle" font-family="Fredoka, sans-serif" font-size="${Math.round(sz * 0.4)}" font-weight="700" fill="#2b2140">${level}</text></svg>`;
}
function tickLevelUp() {
  if (!levelQueue.length || !document.getElementById('levelUp').hidden || busyForLevelCard()) return;
  showLevelUp(levelQueue.shift());
}
function renderRoadmap() {
  const { have, need } = xpInto(S.xp || 0);
  document.getElementById('rmNow').innerHTML = `${ringSVG(S.level, have / need, 48)}<div><b>Town level ${S.level} \u00b7 ${rankFor(S.level)}</b><br><span>${have} / ${need} XP to level ${S.level + 1}</span></div>`;
  const kind = (u) => u.later || u.place || u.tool || u.decor || u.rod ? 'place' : ITEMS[u.item].kind === 'seed' ? 'seed' : 'fish';   // tools broke this list from v0.1.48 until v0.1.55
  const groups = [['Dock', 'levels 1\u20134', 1, 4], ['Village', 'levels 5\u20139', 5, 9], ['Harbor town', 'levels 10\u201319', 10, 19], ['City', 'level 20+', 20, 99]];
  document.getElementById('rmList').innerHTML = groups.map(([rank, sub, a, b]) => {
    const lvs = Object.keys(LEVELS).map(Number).filter(l => l >= a && l <= b);
    const rows = lvs.length ? lvs.map(l => `<div class="rmrow${l <= S.level ? ' got' : ''}"><span class="rmlv">Lv ${l}</span><span>${LEVELS[l].map(u => `<span class="chip ${kind(u)}">${unlockName(u)}${u.later ? ' (later)' : ''}</span>`).join('')}</span></div>`).join('')
      : `<div class="rmrow"><span class="rmlv">Lv ${a}</span><span><span class="chip place">Later</span></span></div>`;
    return `<div class="rmgroup${S.level >= a && S.level <= b ? ' here' : ''}"><div class="rmhead"><b>${rank}</b><span>${sub}</span></div>${rows}</div>`;
  }).join('');
}
document.getElementById('lvBadge').addEventListener('click', () => { renderRoadmap(); openSheet('roadmap'); });

// ---------- HUD ----------
function updateHUD() {
  document.getElementById('coinsTxt').textContent = S.coins.toLocaleString();
  renderLevel();
  const si = seasonInfo(); document.getElementById('seasonTxt').textContent = `${si.season} · Day ${si.day} of 14`;
  if (S.orders) { renderTrack(); updateBoardNotes(); }
}

// ---------- catch card ----------
let catchT = 0;
const CARD_FISH_Y = 118 + 3 + 12 - 4 + 48;
function hideCatch() { catchT = 0; document.getElementById('catchCard').hidden = true; document.getElementById('catchLeap').hidden = true; }
// tap anywhere to skip the catch card (nothing on screen for it). A tap on the world is used up by the skip;
// a tap on a button (Cast, the hotbar…) skips and still does what the button does.
addEventListener('pointerdown', (e) => {
  if (catchT <= 0) return;
  hideCatch();
  if (e.target === canvas) { e.stopPropagation(); e.preventDefault(); }
}, true);   // centre of the fish slot in the catch card (card top + border + padding + slot half)
function showCatch(fish) {
  const r = RARITY[fish.rarity];
  const el = document.getElementById('ccRarity'); el.textContent = r.label; el.style.color = r.color;
  document.getElementById('ccName').textContent = fish.name;
  const first = S.caught[fish.id] === 1;
  document.getElementById('ccInfo').textContent = `on ${BAIT[fishing.bait || 'worm'].name.toLowerCase()}${fishing.rec ? ' · ' + fishing.rec.inches + ' in' : ''}${first ? ' · New!' : fishing.rec && fishing.rec.record ? ' · Biggest yet!' : ''}`   /* FISHING: size */;
  const card = document.querySelector('#catchCard .ccard'); card.style.borderColor = r.color;
  const pic = fishIcon[fish.id], slot = document.getElementById('ccFish');
  slot.hidden = !pic; card.classList.toggle('withFish', !!pic);
  document.getElementById('catchCard').hidden = false; catchT = 3.6;
  // restart the card's pop (it waits for the fish when there is one)
  card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
  if (pic) leapIntoCard(pic);
}
// mockup C: the fish jumps out where the bobber was and lands in the card, facing the way it jumps
function leapIntoCard(pic) {
  const el = document.getElementById('catchLeap'), img = el.querySelector('img');
  img.src = pic;
  const b = new THREE.Vector3(fishing.land.x, WATER_Y, fishing.land.z).project(camera);
  const bx = (b.x + 1) / 2 * innerWidth, by = (1 - b.y) / 2 * innerHeight;
  const cx = innerWidth / 2, cy = CARD_FISH_Y;
  el.querySelector('.flip').style.transform = bx > cx ? 'scaleX(1)' : 'scaleX(-1)';   // pictures face left
  el.hidden = false;
  el.getAnimations().forEach(a => a.cancel());
  const dx = bx - cx, dy = by - cy;
  el.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(0.45)`, opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${Math.min(dy, 0) - 120}px) scale(0.75)`, offset: 0.45 },
    { transform: 'translate(0, 0) scale(1.08)', offset: 0.85 },
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
  ], { duration: 640, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'forwards' });
}

// recolor the mannequin parts attached to matching bones (simple clothes)
function dress(b, rules) {
  if (b.puppet) return;   // white dummies for now (decision 62); outfits return with the wardrobe
  for (const m of b.parts) {
    const bn = (m.parent && m.parent.name) || '';
    for (const [re, color] of rules) if (re.test(bn)) { m.material = new THREE.MeshStandardMaterial({ color, roughness: 0.7 }); break; }
  }
}
function hat(b, color, parts) {
  if (b.puppet) return;
  const H = b.H, head = b.bones.Head.getWorldPosition(new THREE.Vector3());
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  for (const [rTop, rBot, h, y] of parts) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop * H, rBot * H, h * H, 20), mat);
    m.position.copy(head).add(new THREE.Vector3(0, y * H, 0)); scene.add(m); m.updateMatrixWorld(true); b.bones.Head.attach(m); m.castShadow = true;
  }
}
// ---------- Higgins: the concierge on the beach (tutorial + first merchant) ----------
let higgins = null;
function makeHiggins() {
  const b = makeBody('m');
  b.root.visible = true;
  const navy = new THREE.MeshStandardMaterial({ color: 0x2f3c66, roughness: 0.6 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1f1a2b, roughness: 0.5 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc8443a, roughness: 0.5 });
  const H = b.H, head = b.bones.Head.getWorldPosition(new THREE.Vector3()), neck = b.bones.Neck.getWorldPosition(new THREE.Vector3());
  const torso = b.bones.Torso.getWorldPosition(new THREE.Vector3());
  const stick = (bone, mesh) => { if (b.puppet) return; scene.add(mesh); mesh.updateMatrixWorld(true); bone.attach(mesh); mesh.castShadow = true; };
  // top hat
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * H, 0.11 * H, 0.012 * H, 20), black); brim.position.copy(head).add(new THREE.Vector3(0, 0.16 * H, 0)); stick(b.bones.Head, brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.068 * H, 0.072 * H, 0.11 * H, 20), black); crown.position.copy(head).add(new THREE.Vector3(0, 0.22 * H, 0)); stick(b.bones.Head, crown);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.073 * H, 0.073 * H, 0.02 * H, 20), red); band.position.copy(head).add(new THREE.Vector3(0, 0.18 * H, 0)); stick(b.bones.Head, band);
  // vest and bow tie
  const vest = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), navy); vest.scale.set(0.14 * H, 0.115 * H, 0.092 * H);
  vest.position.copy(torso.clone().lerp(neck, 0.45)); stick(b.bones.Torso, vest);
  for (const sg of [-1, 1]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.022 * H, 0.04 * H, 6), red); t.rotation.z = sg * Math.PI / 2; t.position.copy(neck).add(new THREE.Vector3(sg * 0.02 * H, -0.01 * H, 0.05 * H)); stick(b.bones.Neck, t); }
  dress(b, [[/^(UpperLeg|LowerLeg|Hips)/, 0x2a3354], [/^Foot/, 0x1f1a2b]]);   // pants and shoes
  dressNPC(b, 'higgins');
  const pos = new THREE.Vector3(HIGGINS_AT.x, 0, HIGGINS_AT.z);
  higgins = { b, pos, yaw: Math.PI / 2 };
  b.root.position.set(pos.x, groundY(pos.x, pos.z), pos.z);
}
function updateHiggins(dt) {
  if (!higgins) return;
  const d = Math.hypot(player.pos.x - higgins.pos.x, player.pos.z - higgins.pos.z);
  const want = d < 6 ? Math.atan2(player.pos.x - higgins.pos.x, player.pos.z - higgins.pos.z) : Math.PI / 2;
  let a = want - higgins.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); higgins.yaw += a * Math.min(1, dt * 4);
  higgins.b.root.rotation.y = higgins.yaw;
  anim.idleTick(higgins.b, dt);
}
// ---------- Fishel: bait & tackle by the dock ----------
let fishel = null;
function makeFishel() {
  const b = makeBody('m'); b.root.visible = true;
  dress(b, [[/^(Torso|Abdomen|UpperArm|LowerArm|Shoulder)/, 0xf2c230], [/^(Hips|UpperLeg|LowerLeg)/, 0x2a3354], [/^Foot/, 0x2a2a2a]]);
  hat(b, 0xf2c230, [[0.13, 0.15, 0.03, 0.15], [0.07, 0.09, 0.07, 0.19]]);
  dressNPC(b, 'fishel');
  const pos = new THREE.Vector3(FISHEL_STALL.x - 1.4, 0, FISHEL_STALL.z + 0.9);
  fishel = { b, pos, yaw: -0.5 };
  b.root.position.set(pos.x, groundY(pos.x, pos.z), pos.z); b.root.rotation.y = fishel.yaw;
}
function updateFishel(dt) {
  if (!fishel) return;
  const d = Math.hypot(player.pos.x - fishel.pos.x, player.pos.z - fishel.pos.z);
  const want = d < 6 ? Math.atan2(player.pos.x - fishel.pos.x, player.pos.z - fishel.pos.z) : -0.5;
  let a = want - fishel.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); fishel.yaw += a * Math.min(1, dt * 4);
  fishel.b.root.rotation.y = fishel.yaw; anim.idleTick(fishel.b, dt);
}
// ---------- Old Pike: the old fisherman where the river meets the sea (Mac, v0.1.65: look A, spot 2) ----------
// He posts fish orders on the board; later he's the fisherman you can hire (decision 35).
const PIKE_AT = { x: -11.6, z: -4.6, yaw: -1.6 };   // the spot from the mockup: the sand corner where the river runs out
let pike = null;
function makePike() {
  const b = makeBody('m'); b.root.visible = true;
  dressNPC(b, 'pike');
  if (b.tools.rod) b.tools.rod.visible = false;                   // that one hangs off the hidden rig's fist, not the hand you see
  const pos = new THREE.Vector3(PIKE_AT.x, 0, PIKE_AT.z);
  pike = { b, pos, yaw: PIKE_AT.yaw, rod: null, dir: new THREE.Vector3(), fixL: new THREE.Vector3() };
  b.root.position.set(pos.x, groundY(pos.x, pos.z), pos.z); b.root.rotation.y = pike.yaw;
}
function updatePike(dt) {
  if (!pike) return;
  // he never turns to you, not even when you talk: eyes on the water, concentrating (Mac, v0.1.102)
  pike.b.root.rotation.y = pike.yaw; anim.idleTick(pike.b, dt);
  // He holds his rod in both hands, like you do while you wait for a bite (Mac, v0.1.100: "Old Pike isn't even holding the rod").
  // The arms are solved on the rig here; the rod itself is put in the hand you see after the puppet copy (placePikeRod).
  if (!pike.rod && worldRod) { pike.rod = worldRod.clone(true); pike.rod.visible = true; scene.add(pike.rod); }
  const b = pike.b, K = b.H / 1.7, f = _pkF.set(Math.sin(pike.yaw), 0, Math.cos(pike.yaw)), right = _pkR.set(-Math.cos(pike.yaw), 0, Math.sin(pike.yaw));
  b.root.updateMatrixWorld(true);
  const grip = b.bones.Torso.getWorldPosition(new THREE.Vector3()).addScaledVector(f, 0.3 * K).addScaledVector(right, 0.04 * K); grip.y -= 0.1 * K;
  const dir = pike.dir.copy(f).multiplyScalar(Math.cos(0.6)).add(_pv.set(0, Math.sin(0.6), 0)).normalize();
  solveArm(b, 'R', grip, new THREE.Vector3(0, -1, 0).addScaledVector(right, 0.6), 1);
  solveArm(b, 'L', grip.clone().addScaledVector(dir, 0.085 * K).add(pike.fixL), new THREE.Vector3(0, -1, 0).addScaledVector(right, -0.6), 1);
}
const _pkF = new THREE.Vector3(), _pkR = new THREE.Vector3();
// v0.1.123 (Mac: "does the player character have the same issue?" — it did, worse): the rod was put where the arm
// solver aimed the wrist, so both palms sat 11 to 15 cm off it. After the visible body copies the pose, the rod goes
// into the right fist, and the left hand's aim is nudged each frame until its palm closes on the rod too.
function placeHandRod() {
  const r = rodState; if (!worldRod || !worldRod.visible || !r.dir || !body.puppet) return;
  const k = body.puppet.k, ri = k.getObjectByName('RightHandIndex1'), rt = k.getObjectByName('RightHandThumb2'); if (!ri || !rt) return;
  const fist = ri.getWorldPosition(new THREE.Vector3()).add(rt.getWorldPosition(_pv)).multiplyScalar(0.5);
  worldRod.position.copy(fist).addScaledVector(r.dir, -0.08 * r.S);
  const li = k.getObjectByName('LeftHandIndex1'), lt = k.getObjectByName('LeftHandThumb2');
  if (li && lt && r.lw > 0.5) {
    const palm = li.getWorldPosition(new THREE.Vector3()).add(lt.getWorldPosition(_pv)).multiplyScalar(0.5);
    const on = worldRod.position.clone().addScaledVector(r.dir, palm.clone().sub(worldRod.position).dot(r.dir));
    r.fixL.addScaledVector(palm.sub(on), -0.5); if (r.fixL.length() > 0.2 * r.S) r.fixL.setLength(0.2 * r.S);
  } else if (r.fixL) r.fixL.multiplyScalar(0.8);
}
function placePikeRod() {
  if (!pike || !pike.rod || !pike.b.puppet) return;
  const k = pike.b.puppet.k, a = k.getObjectByName('RightHandIndex1'), c = k.getObjectByName('RightHandThumb2'); if (!a || !c) return;
  const fist = a.getWorldPosition(new THREE.Vector3()).add(c.getWorldPosition(_pv)).multiplyScalar(0.5), K = pike.b.H / 1.7;
  pike.rod.position.copy(fist).addScaledVector(pike.dir, -0.08 * K);
  pike.rod.quaternion.setFromUnitVectors(UPV, pike.dir); pike.rod.scale.setScalar(K);
  // v0.1.122 (Mac: "Old Pike is holding the rod with his wrists and not his palms"): the arm solver aims the wrist, so the
  // left palm sat about 8 cm off the rod. Each frame, nudge the left hand's aim by how far its palm misses the rod.
  const li = k.getObjectByName('LeftHandIndex1'), lt = k.getObjectByName('LeftHandThumb2');
  if (li && lt) {
    const palm = li.getWorldPosition(new THREE.Vector3()).add(lt.getWorldPosition(_pv)).multiplyScalar(0.5);
    const r = palm.clone().sub(pike.rod.position), on = pike.rod.position.clone().addScaledVector(pike.dir, r.dot(pike.dir));
    pike.fixL.addScaledVector(palm.sub(on), -0.5); if (pike.fixL.length() > 0.2 * K) pike.fixL.setLength(0.2 * K);
  }
  // a line from the rod tip to a bobber sitting in the river mouth (Mac, v0.1.101). The bobber stays put when he turns to you.
  if (!pike.line && fishLine && bobber) {
    pike.line = fishLine.clone(); pike.bob = bobber.clone(true); pike.line.visible = pike.bob.visible = true; scene.add(pike.line, pike.bob);
    pike.bobAt = new THREE.Vector3(PIKE_AT.x + Math.sin(PIKE_AT.yaw) * 2.3, WATER_Y, PIKE_AT.z + Math.cos(PIKE_AT.yaw) * 2.3);
  }
  if (!pike.line) return;
  pike.rod.updateMatrixWorld(true);
  const tip = pike.rod.localToWorld(_pkF.set(0, 1.28, 0));
  pike.bob.position.copy(pike.bobAt); pike.bob.position.y += Math.sin(performance.now() / 700) * 0.012;
  const d = _pkR.copy(pike.bob.position).sub(tip), len = d.length();
  pike.line.position.copy(tip); pike.line.scale.set(1, len, 1); pike.line.quaternion.setFromUnitVectors(UPV, d.normalize());
}
const nearPike = () => pike && Math.hypot(player.pos.x - pike.pos.x, player.pos.z - pike.pos.z) < 1.9;
function talkPike() {   // just a short hello for now (Mac, v0.1.90); his orders menu, tips and hiring him are on the todo list
  showDialog(['Shh. You\u2019ll scare the fish.', 'Mornin\u2019. Fish are biting.', 'Nice day for it.'][Math.floor(Math.random() * 3)],
    [{ label: 'Bye', primary: true, go: () => closeDialog() }], { name: 'Old Pike', role: 'fisherman', pos: pike.pos });
}
// ---------- Rosa's Flowers: the seed cart (decision 61, opens at town level 2) ----------
let rosa = null;
const rosaOpen = () => S.level >= 2;
function ensureRosa() {
  if (rosa || !rosaOpen()) return;
  place('town', 'cart', ROSA_CART.x, ROSA_CART.z, { r: ROSA_CART.r });
  const k = ['flower_redA', 'flower_yellowA', 'flower_purpleA'], R = mulberry32(61), bed = groundY(ROSA_CART.x, ROSA_CART.z) + 0.62;
  const c = Math.cos(ROSA_CART.r), sn = Math.sin(ROSA_CART.r);
  for (let i = 0; i < 16; i++) {   // flowers piled in the cart
    const dx = (R() - 0.5) * 1.1, dz = (R() - 0.5) * 1.7;
    place('nature', k[i % 3], ROSA_CART.x + dx * c + dz * sn, ROSA_CART.z - dx * sn + dz * c, { s: 1.3 + R() * 0.4, r: R() * 6.28, y: bed });
  }
  const beds = [[ROSA_CART.x - 2.0, ROSA_CART.z + 0.4, 0.9, 6], [ROSA_CART.x + 1.6, ROSA_CART.z + 0.9, 0.7, 4]];
  for (const [x0, z0, w, n] of beds) for (let i = 0; i < n; i++) place('nature', k[i % 3], x0 + R() * w, z0 + R() * w, { s: 1.3 + R() * 0.5, r: R() * 6.28 });
  const b = makeBody('f'); b.root.visible = true;
  dress(b, [[/^(Torso|Abdomen|UpperArm|LowerArm|Shoulder)/, 0xe8846a], [/^(Hips|UpperLeg|LowerLeg)/, 0xf4e6c8], [/^Foot/, 0x7a4a2a]]);
  hat(b, 0xf2d38a, [[0.2, 0.2, 0.012, 0.13], [0.08, 0.1, 0.07, 0.17]]);   // straw sun hat
  dressNPC(b, 'rosa');
  const pos = new THREE.Vector3(ROSA_CART.x + 1.15, 0, ROSA_CART.z + 1.0);
  rosa = { b, pos, yaw: -0.3 };
  b.root.position.set(pos.x, groundY(pos.x, pos.z), pos.z); b.root.rotation.y = rosa.yaw;
}
function updateRosa(dt) {
  if (!rosa) return;
  const d = Math.hypot(player.pos.x - rosa.pos.x, player.pos.z - rosa.pos.z);
  const want = d < 6 ? Math.atan2(player.pos.x - rosa.pos.x, player.pos.z - rosa.pos.z) : -0.3;
  let a = want - rosa.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); rosa.yaw += a * Math.min(1, dt * 4);
  rosa.b.root.rotation.y = rosa.yaw; anim.idleTick(rosa.b, dt);
}
const nearRosa = () => rosa && Math.hypot(player.pos.x - rosa.pos.x, player.pos.z - rosa.pos.z) < 1.9;
const seedSeller = () => rosaOpen() ? 'Rosa' : 'Higgins';
const nearFishel = () => fishel && Math.hypot(player.pos.x - fishel.pos.x, player.pos.z - fishel.pos.z) < 1.9;
const nearHiggins = () => higgins && Math.hypot(player.pos.x - higgins.pos.x, player.pos.z - higgins.pos.z) < 1.9;

// ---------- dialog ----------
const dlg = { open: false };
const dEl = document.getElementById('dialog'), dText = document.getElementById('dText'), dChoices = document.getElementById('dChoices');
function showDialog(text, choices, who = null) {   // who: { name, role, pos } for someone other than Higgins
  dlg.open = true; dEl.hidden = false; dText.textContent = text;
  dEl.querySelector('.dname').innerHTML = who ? `${who.name} <span>${who.role}</span>` : 'Higgins <span>concierge</span>';
  dChoices.innerHTML = '';
  for (const c of choices) {
    const btn = document.createElement('button'); btn.textContent = c.label; if (c.primary) btn.className = 'primary'; if (c.locked) btn.className = 'locked';
    btn.addEventListener('click', () => c.go()); dChoices.appendChild(btn);
  }
  const f = who ? who.pos : higgins && higgins.pos; if (f) player.faceYaw = Math.atan2(f.x - player.pos.x, f.z - player.pos.z);
}
function closeDialog() { dlg.open = false; dEl.hidden = true; }
function sayLines(lines, done) {
  let i = 0;
  const next = () => {
    if (i >= lines.length) { closeDialog(); done && done(); return; }
    const last = i === lines.length - 1;
    showDialog(lines[i++], [{ label: last ? 'Got it!' : 'Next', primary: true, go: next }]);
  };
  next();
}
// Higgins keeps it short: kids won't read a long speech, and the goals do the teaching (Mac, v0.1.84). It was seven screens.
const INTRO = [
  'Welcome to Tidewell! I\u2019m Higgins.',
  'This harbor is yours now. Follow the star goals and I\u2019ll show you around!',
];
function sellValue() {
  let total = 0, n = 0;
  for (const [id, c] of Object.entries(S.inv)) { const it = ITEMS[id]; if (it && (it.kind === 'fish' || it.kind === 'crop')) { total += it.price * c; n += c; } }
  return { total, n };
}
function talkMenu(msg) {
  const v = sellValue();
  showDialog(msg || (rosaOpen() && !S.rosaMet ? 'Rosa sells the seeds now. Her cart is at the far end of the beach.' : 'How can I help?'), [
    ...(v.n ? [{ label: 'Sell', primary: true, go: () => { closeDialog(); openSell(); } }] : []),
    ...(rosaOpen() ? [] : [{ label: 'Buy seeds', go: () => seedMenu() }]),
    ...(store.isOpen() ? [] : [{ label: 'Browse decor', go: () => decorMenu() }]),   // STORE: the general store takes these over once it's open
    ...(S.level >= GEAR.shovel.level && !store.isOpen() ? [{ label: 'Buy tools', go: () => toolMenu() }] : []),
    { label: 'Goodbye', go: closeDialog },
  ]);
}
// Selling (mockup A, v0.1.91): pick how many of each. It opens at Max: everything except what your pending orders need.
// (A tester wanted coins but also to keep things for the order board. Mac)
const sellPick = {};
const sellIds = () => Object.keys(S.inv).filter(id => ITEMS[id] && S.inv[id] > 0 && (ITEMS[id].kind === 'fish' || ITEMS[id].kind === 'crop'))
  .sort((a, b) => (KIND_ORDER[ITEMS[a].kind] - KIND_ORDER[ITEMS[b].kind]) || (ITEMS[b].price - ITEMS[a].price));
function orderNeeds(id) {   // how many of this your pending orders ask for
  let n = 0; for (const o of S.orders.slots) if (!o.empty && takenOrders().includes(o.id)) for (const [it, c] of o.items) if (it === id) n += c;
  return n;
}
const sellMaxOf = (id) => Math.max(0, invCount(id) - orderNeeds(id));
function openSell() { for (const k of Object.keys(sellPick)) delete sellPick[k]; for (const id of sellIds()) sellPick[id] = sellMaxOf(id); renderSell(); openSheet('sellSheet'); }
function renderSell() {
  let total = 0;
  document.getElementById('sellList').innerHTML = sellIds().map(id => {
    const it = ITEMS[id], h = invCount(id), k = Math.min(h, orderNeeds(id)), q = Math.min(h, sellPick[id] || 0); total += q * it.price;
    return `<div class="sellrow">${itemIcon(id)}<div class="nm"><b>${it.name}</b><small>${h} \u00b7 ${it.price} each${k ? ` <span class="keep">${svg('pin', '#2b2140', 12)}${k}</span>` : ''}</small></div>
      <button data-sell="${id}" data-d="-1" aria-label="One less ${it.name}" ${q <= 0 ? 'disabled' : ''}>\u2212</button><span class="q">${q}</span><button data-sell="${id}" data-d="1" aria-label="One more ${it.name}" ${q >= h ? 'disabled' : ''}>+</button></div>`;
  }).join('') || '<div class="empty">Nothing to sell</div>';
  const go = document.getElementById('sellGo'); go.disabled = total <= 0; go.innerHTML = `Sell <span class="scoin"></span> ${total.toLocaleString()}`;
}
document.getElementById('sellList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sell]'); if (!b || b.disabled) return;
  const id = b.dataset.sell; sellPick[id] = Math.max(0, Math.min(invCount(id), (sellPick[id] || 0) + +b.dataset.d)); audio.play('tap'); renderSell();
});
document.getElementById('sellMax').addEventListener('click', () => { for (const id of sellIds()) sellPick[id] = sellMaxOf(id); audio.play('tap'); renderSell(); });
document.getElementById('sellGo').addEventListener('click', () => {
  let total = 0;
  for (const id of sellIds()) { const q = Math.min(invCount(id), sellPick[id] || 0); if (q > 0) { total += q * ITEMS[id].price; addItem(id, -q); } }
  if (!total) return;
  S.coins += total; audio.play('coins'); renderHotbar(); commit();
  document.getElementById('sellSheet').hidden = true;
  toast(`+${total} coins`); goals.event('sell');   // GOALS
});
function seedMenu(msg) {
  const n = SHOP.seedPack;
  showDialog(msg || 'Seeds come in packs of five. Smaller crops grow quicker.', [
    ...CROP_ORDER.map(id => { const c = CROPS[id], it = ITEMS[c.seed];
      if (!unlocked(c.seed)) return { label: `${c.name} \u00b7 opens at town level ${unlockLevel(c.seed)}`, locked: true, go: () => seedMenu(`Those come in at town level ${unlockLevel(c.seed)}. Fill a few orders and I\u2019ll have them for you.`) };
      return { label: `${c.name} \u00b7 ${c.growMinutes} min (${it.buy * n} coins)${invCount(c.seed) ? ' \u00b7 you have ' + invCount(c.seed) : ''}`, go: () => buySeeds(c.seed) }; }),
    { label: 'Back', go: () => talkMenu() },
  ]);
}
function buySeeds(sd) {
  if (!unlocked(sd) || rosaOpen()) return;
  const n = SHOP.seedPack, cost = ITEMS[sd].buy * n;
  if (S.coins < cost) { seedMenu('Ah, I\u2019m afraid that\u2019s a little more than you have just now.'); return; }
  audio.play('buy'); S.coins -= cost; addItem(sd, n); S.seedSel = sd; renderHotbar(); commit();
  seedMenu(`Splendid. Five ${ITEMS[ITEMS[sd].crop].name.toLowerCase()} seeds, and they\u2019re in your seed bag.`);
}
function startTalk() {
  goals.event('talk');   // GOALS
  if (!S.introDone) runIntro();
  else if (!S.kitGiven) sayLines(['A gift for your new home! Tap the house button to place it.'], () => { giveStarterKit(); toast('Starter decor added to your bag'); talkMenu(); });
  else talkMenu();
}
function decorMenu(msg) {
  showDialog(msg || 'A little something for the property?', [
    ...DECOR_ORDER.map(id => ({ label: `${DECOR[id].name} (${DECOR[id].buy} coins)${invCount('decor_' + id) ? ' \u00b7 you have ' + invCount('decor_' + id) : ''}`, go: () => buyDecor(id) })),
    { label: 'Back', go: () => talkMenu() },
  ]);
}
function buyDecor(id) {
  const cost = DECOR[id].buy;
  if (S.coins < cost) { decorMenu('Ah, I\u2019m afraid that\u2019s a little more than you have just now.'); return; }
  audio.play('buy'); S.coins -= cost; addItem('decor_' + id, 1); renderHotbar(); commit();
  decorMenu(`One ${DECOR[id].name.toLowerCase()}, delivered to your bag.`);
}
function runIntro() { sayLines(INTRO, () => { S.introDone = true; if (!S.kitGiven) { giveStarterKit(); toast('Starter decor added to your bag'); } commit(); }); }

// ---------- Rosa's seed list (decision 61) ----------
function openRosaShop() {
  document.getElementById('rosaGreet').textContent = S.rosaMet
    ? 'Back for more? Everything here is fresh off the cart.'
    : 'Hi, I\u2019m Rosa! Seeds, straight off the cart. New varieties come in as your town grows.';
  goals.event('rosa');   // GOALS (before rosaMet is set: meeting her is the first level 2 goal)
  if (!S.rosaMet) { S.rosaMet = true; commit(); }
  renderRosaShop(); openSheet('rosaShop');
}
function renderRosaShop() {
  document.getElementById('rosaCoins').textContent = `you have ${S.coins.toLocaleString()} coins`;
  const n = SHOP.seedPack;
  const fertRow = `<div class="rrow" data-rfertrow><div class="ric">${svg('fert', '#8a5a34', 34)}</div>
      <div class="rtx"><b>Fertilizer</b><span>${FERT.pack} bags \u00b7 each makes a crop ${FERT.minutes} min faster${invCount('fertilizer') ? ` \u00b7 you have ${invCount('fertilizer')}` : ''}</span></div>
      <button data-rfert ${S.coins < FERT.buy ? 'disabled' : ''}>${FERT.buy}</button></div>`;   // fertilizer first, so it isn't buried under the locked seeds
  document.getElementById('rosaList').innerHTML = fertRow + [...CROP_ORDER].sort((a, b) => unlockLevel(CROPS[a].seed) - unlockLevel(CROPS[b].seed) || CROPS[a].growMinutes - CROPS[b].growMinutes).map(id => {
    const c = CROPS[id], it = ITEMS[c.seed], cost = it.buy * n, lv = unlockLevel(c.seed), open = lv <= S.level, have = invCount(c.seed);
    return `<div class="rrow${open ? '' : ' locked'}" data-rseed="${c.seed}"><div class="ric">${cropImg(id, 40)}</div>
      <div class="rtx"><b>${c.name}</b><span>${n} seeds \u00b7 grows ${c.growMinutes} min${have ? ` \u00b7 you have ${have}` : ''}</span></div>
      ${open ? `<button data-rbuy="${c.seed}" ${S.coins < cost ? 'disabled' : ''}>${cost}</button>` : `<span class="rlock">${svg('lock', '#6a5f7c', 13)} Town level ${lv}</span>`}</div>`;
  }).join('');
}
document.getElementById('rosaList').addEventListener('click', (e) => {
  const f = e.target.closest('[data-rfert]');
  if (f) {
    if (f.disabled || S.coins < FERT.buy) return;
    audio.play('buy'); S.coins -= FERT.buy; addItem('fertilizer', FERT.pack); renderHotbar(); commit(); renderRosaShop();
    toast(`+${FERT.pack} fertilizer. It\u2019s in your Farm tools.`);
    return;
  }
  const b = e.target.closest('[data-rbuy]');
  if (b) {
    if (b.disabled) return;
    const sd = b.dataset.rbuy, n = SHOP.seedPack, cost = ITEMS[sd].buy * n;
    if (S.coins < cost || !unlocked(sd)) return;
    audio.play('buy'); S.coins -= cost; addItem(sd, n); S.seedSel = sd; renderHotbar(); commit(); renderRosaShop(); goals.event('rosaBuy');   // GOALS
    toast(`+${n} ${ITEMS[sd].name.toLowerCase()}`);
    return;
  }
  const r = e.target.closest('.rrow.locked');
  if (r) toast(`Those come in at town level ${unlockLevel(r.dataset.rseed)}!`);
});

// ---------- Fishel's bait shop (layout B: counter cards) ----------
const BAIT_COLORS = { worm: '#c98a5a', shrimp: '#f08a6a', lure: '#e8a21c' };
function openBaitShop() {
  const gift = spots.claimGift();   // FISHING: his free pack, once a day
  document.getElementById('baitGreet').textContent = gift ? 'Five worms, on the house. Come back tomorrow for more.' : S.fishelMet
    ? 'Back again? Good. The fish are biting.'
    : 'Name\u2019s Fishel. Fish are picky, friend. Better bait, better fish.';
  if (!S.fishelMet) { S.fishelMet = true; commit(); }
  renderBaitShop(); openSheet('baitShop'); tackle.shopOpened();   // TACKLE: the Rods tab
  if (gift) { audio.play('buy'); toast('+5 worms from Fishel'); }
}
function renderBaitShop() {
  document.getElementById('baitCoins').textContent = `you have ${S.coins.toLocaleString()} coins`;
  document.getElementById('baitCards').innerHTML = ['worm', 'shrimp', 'lure'].map(id => {
    const it = ITEMS[id], c = BAIT_COLORS[id], cost = it.buy * it.pack;
    const stars = [0, 1, 2].map(i => `<span style="color:${i < it.stars ? '#e8a21c' : '#d8cfc0'}">\u2605</span>`).join('');
    return `<div class="bcard"><div class="bic" style="background:${c}33;border:2px solid ${c}">${tackle.pic(id) ? `<img src="${tackle.pic(id)}" alt="" style="max-width:90%;max-height:90%">` : svg(id, '#2b2140', 30)}</div>
      <div class="bn">${it.name}</div><div class="st" aria-label="${it.stars} of 3 stars">${stars}</div><div class="bd">${it.blurb}</div>
      <div class="own">You have ${invCount(id)}</div>
      ${unlocked(id) ? `<button data-buybait="${id}" ${S.coins < cost ? 'disabled' : ''}>${it.pack} for ${cost} coins</button>` : `<button class="lockbtn" disabled>Town level ${unlockLevel(id)}</button>`}</div>`;
  }).join('');
}
document.getElementById('baitCards').addEventListener('click', (e) => {
  const b = e.target.closest('[data-buybait]'); if (!b || b.disabled) return;
  const id = b.dataset.buybait, it = ITEMS[id], cost = it.buy * it.pack;
  if (S.coins < cost || !unlocked(id)) return;
  audio.play('buy'); S.coins -= cost; addItem(id, it.pack); renderHotbar(); commit(); renderBaitShop();
  toast(`+${it.pack} ${it.name.toLowerCase()}`);
});


// ---------- the order board (decision 50: list layout B + pinned tracker from C) ----------
let boardNotes = null, boardSig = '', noteKit = null;
// ---------- lots you can buy (decision 8; Mac: coins only, each one costs more than the last) ----------
// Side lots along the coast, the same depth as your starting lot. A lot next to land you own is for sale.
// Lots (decision 69, layout D): four full-width strips straight back into the wilds, a dirt path down the middle.
// Buying one moves the fence and gate to its far edge. You clear each weed, rock, stump and tree yourself.
const LOT_DEPTH = 6.75, LOT_X = 14;
const LOTS = [0, 1, 2, 3].map(i => ({ id: 'back' + (i + 1), i, z0: FENCE_Z0 + i * LOT_DEPTH, z1: FENCE_Z0 + (i + 1) * LOT_DEPTH }));
const LOTS_BACK = LOTS[LOTS.length - 1].z1;
const LOT_PRICES = [1000, 2500, 6000, 15000], LOT_LEVELS = [3, 5, 8, 12];   // the 1st, 2nd… lot you buy
const LOT_NAMES = { back1: 'The meadow', back2: 'The thicket', back3: 'The old woods', back4: 'The deep woods' };
const PATH_HALF = 1.3;
const lotView = {};   // id -> { weeds: Group }
let saleSign = null;
const lotOwned = (id) => (S.lots || []).includes(id);
function lotForSale(l) { return !lotOwned(l.id) && (l.i === 0 || lotOwned(LOTS[l.i - 1].id)); }
const lotN = () => Math.min((S.lots || []).length, LOT_PRICES.length - 1);
const lotPrice = () => LOT_PRICES[lotN()], lotLevel = () => LOT_LEVELS[lotN()];
function ownedBack() { let z = FENCE_Z0; for (const l of LOTS) if (lotOwned(l.id)) z = l.z1; else break; return z; }
// the sign is a picture: one big coin, no words (mockup B, for kids who can't read yet);
// the price pops up in a bubble when you walk up (tickSaleBubble)
function signTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 200; const x = c.getContext('2d');
  x.fillStyle = '#ffe9a8'; x.fillRect(0, 0, 256, 200);
  x.fillStyle = '#f4c542'; x.beginPath(); x.arc(128, 100, 70, 0, 7); x.fill(); x.strokeStyle = '#b8860b'; x.lineWidth = 12; x.stroke();
  x.fillStyle = '#b8860b'; x.beginPath(); x.roundRect(120, 62, 16, 76, 6); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const saleEl = document.getElementById('saleBubble'), _sp = new THREE.Vector3();
let saleFor = null;
function tickSaleBubble() {
  let l = null;
  if (fishing.state === 'idle' && farm.mode === 'off' && !dlg.open && document.getElementById('lotSheet').hidden) {
    const q = LOTS.find(lotForSale);
    if (q) { const s = lotSignPos(); if (Math.hypot(s.x - player.pos.x, s.z - player.pos.z) < 4) l = q; }
  }
  if (l !== saleFor) {
    saleFor = l;
    if (l) {
      const lv = lotLevel(), ok = S.level >= lv;
      document.getElementById('saleNum').textContent = lotPrice().toLocaleString();
      document.getElementById('saleLv').textContent = lv;
      saleEl.querySelector('.lock').hidden = ok; saleEl.querySelector('.ok').hidden = !ok;
      saleEl.classList.remove('pop'); void saleEl.offsetWidth; saleEl.classList.add('pop');
    }
    saleEl.hidden = !l;
  }
  if (!l) return;
  _sp.set(saleSign.position.x, saleSign.position.y + 2.5, saleSign.position.z).project(camera);
  const hw = saleEl.offsetWidth / 2 + 8; saleEl.style.left = Math.max(hw, Math.min(innerWidth - hw, (_sp.x + 1) / 2 * innerWidth)) + 'px'; saleEl.style.top = ((1 - _sp.y) / 2 * innerHeight) + 'px';
}
function buildLots(T) {
  // side lots from v0.1.35–37 are gone; no carry-over (Mac: "you can clear the saves")
  S.lots = (S.lots || []).filter(id => LOTS.some(l => l.id === id));
  S.cleared = (S.cleared || []).filter(k => LOTS.some(l => k.startsWith(l.id + ':')));
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.85 });
  for (const l of LOTS) {
    const v = lotView[l.id] = { weeds: new THREE.Group() }, R = mulberry32(977 * (l.i + 3));
    // overgrown: tall grass, rocks, stumps, bushes, logs and young trees, never on the path
    const kinds = ['grass_large', 'grass_large', 'grass_large', 'rock_smallA', 'plant_bush', 'stump_round', 'grass_large', 'log', 'rock_largeA', 'mushroom_redGroup', 'plant_bushLarge', 'tree_default'];
    for (let i = 0; i < 64; i++) {
      const k = kinds[i % kinds.length];
      let x = (R() * 2 - 1) * (LOT_X - 0.9); if (Math.abs(x) < PATH_HALF + 0.7) x = Math.sign(x || 1) * (PATH_HALF + 0.7 + R() * 2);
      const z = l.z0 + 0.7 + R() * (LOT_DEPTH - 1.4);
      const o = T(k, x, z, k === 'grass_large' ? 1.5 + R() * 0.6 : k === 'tree_default' ? 1.0 + R() * 0.3 : 1.1 + R() * 0.3);
      scene.remove(o); v.weeds.add(o);
      const bb = new THREE.Box3().setFromObject(o), sz = bb.getSize(new THREE.Vector3());
      o.userData = { kind: k, key: l.id + ':' + (v.weeds.children.length - 1), h: sz.y, r: Math.min(0.6, Math.max(sz.x, sz.z) / 2 - 0.2) };
      if (spots.onBank(x, z)) o.userData.wet = true;   // FISHING: nothing grows in the river or the lake
      if (k.startsWith('tree')) occluder(o);   // trees fade when they're between you and the camera
      if (k === 'rock_largeA') { o.userData.solidR = Math.max(0.5, Math.min(sz.x, sz.z) / 2 * 0.85); if (!isCleared(o)) solids.push(o); }   // big rocks are solid until broken (Mac)
      const ck = cellKey({ x: Math.floor(x), z: Math.floor(z) }); if (!weedCells.has(ck)) weedCells.set(ck, []); weedCells.get(ck).push(o);
    }
    scene.add(v.weeds);
  }
  // one FOR SALE sign, on your side of the gate
  const sign = new THREE.Group();
  for (const dz of [-0.42, 0.42]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.08), wood); p.position.set(0, 0.65, dz); sign.add(p); }
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 1.04), wood); board.position.set(0, 1.1, 0); sign.add(board);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.75), new THREE.MeshStandardMaterial({ map: signTexture(), emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.9 }));
  face.material.emissiveMap = face.material.map;   // lit a little from inside so the coin stays bright in shade
  face.rotation.y = Math.PI / 2; face.position.set(0.035, 1.1, 0); sign.add(face); sign.scale.setScalar(1.6);
  sign.rotation.y = -Math.PI / 2;   // faces the camera
  shadowize(sign); scene.add(sign);
  saleSign = sign;
  refreshLots();
}
const weedCells = new Map();   // cell key -> weed items on it
const solids = [];             // big rocks you can't walk through
function isCleared(o) { return !!o.userData.wet || (S.cleared || []).includes(o.userData.key); }   // FISHING: wet = never there
function weedBlocks(k) { return (weedCells.get(k) || []).some(o => !isCleared(o)); }
function inBoughtLot(x, z) { return Math.abs(x) < LOT_X && z > FENCE_Z0 && z < ownedBack() - 0.3; }
function landMaxX() { return LOT_X; }
function landMinX() { return -LOT_X; }
let fenceAt = FENCE_Z0;
function refreshLots() {
  for (const l of LOTS) {
    const v = lotView[l.id]; if (!v) continue;
    // weeds stay after you buy: you clear each one yourself (Mac)
    v.weeds.children.forEach(o => { o.visible = !isCleared(o); if (hitsOn(o)) sizeByHits(o); });
  }
  // the fence and gate sit at the back of the land you own
  const back = ownedBack();
  if (back !== fenceAt) {
    const dz = back - fenceAt; fenceAt = back; FENCE_Z = back;
    townFence.forEach(o => { o.position.z += dz; o.position.y = groundY(o.position.x, o.position.z); });
    recolorGround();
  }
  if (saleSign) {
    const s = lotSignPos(); saleSign.visible = !!LOTS.find(lotForSale);
    saleSign.position.set(s.x, groundY(s.x, s.z), s.z);
  }
  if (signCount !== (S.lots || []).length || signLevel !== S.level) { signCount = (S.lots || []).length; signLevel = S.level; saleFor = undefined; }
}
let signLevel = -1, signCount = -1;
function lotSignPos() { return { x: -2.7, z: FENCE_Z - 1.0 }; }
function nearLotSign() {
  const l = LOTS.find(lotForSale); if (!l) return null;
  const s = lotSignPos(); return Math.hypot(s.x - player.pos.x, s.z - player.pos.z) < 1.9 ? l : null;
}
function nearWeed() {
  if (!inBoughtLot(player.pos.x, player.pos.z + 0.6)) return null;
  let best = null, bd = 1.6;
  for (const l of LOTS) {
    if (!lotOwned(l.id)) continue;
    for (const o of lotView[l.id].weeds.children) {
      if (isCleared(o)) continue;
      const d = Math.hypot(o.position.x - player.pos.x, o.position.z - player.pos.z) - (o.userData.r || 0);
      if (d < bd) { bd = d; best = o; }
    }
  }
  return best;
}
// ---------- the cargo ship: src/cargo.js (moved out in v0.1.86) ----------
const cargo = createCargo({ S, settings, player, camera, scene, DOCK, DOCK_FLOOR, SHIP_AT, SHIP_IN, SHIP_OUT, waterUniforms, farm, decor, audio,
  commit, toast, svg, itemIcon, place, addItem, invCount, addXP, onDock, openSheet, furlSails,
  get merchant() { return merchant; }, tool: () => tool });

// ---------- dig spots (decision 73): a few sparkly mounds each day, dug up with the shovel ----------
let digModels = [];
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function ensureDig() {
  if (S.dig && S.dig.day === todayKey()) return;
  // new spots each day, on open grass on your home land (not on plots, decor or the path; lots are for clearing)
  const spots = [], R = Math.random;
  for (let tries = 0; tries < 400 && spots.length < DIG.perDay; tries++) {
    const c = { x: Math.floor(-13 + R() * 26), z: Math.floor(2 + R() * (FENCE_Z0 - 3.5)) };   // behind the town row, so Higgins, Rosa and the board keep their buttons
    if (!tillable(c) || plots.has(cellKey(c)) || spots.some(q => Math.hypot(q[0] - c.x, q[1] - c.z) < 4)) continue;
    spots.push([c.x, c.z]);
  }
  S.dig = { day: todayKey(), spots: spots.map(([x, z]) => ({ x, z, done: false })) };
}
function refreshDig() {
  digModels.forEach(o => scene.remove(o)); digModels = [];
  if (S.level < GEAR.shovel.level) return;
  ensureDig();
  const dirt = new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.9, flatShading: true }), xm = new THREE.MeshStandardMaterial({ color: 0x6e4220 });
  S.dig.spots.forEach((sp, i) => {
    if (sp.done) return;
    const g = new THREE.Group(), x = sp.x + 0.5, z = sp.z + 0.5;
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), dirt); mound.scale.y = 0.35; g.add(mound);
    for (const r of [0.785, -0.785]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.09), xm); b.position.y = 0.15; b.rotation.y = r; g.add(b); }
    const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), new THREE.MeshBasicMaterial({ color: 0xffffff })); spark.position.set(0.25, 0.45, 0); spark.userData.spark = true; g.add(spark);
    g.position.set(x, groundY(x, z), z); g.userData.i = i; shadowize(g); scene.add(g); digModels.push(g);
  });
}
function nearDig() {
  for (const g of digModels) if (Math.hypot(g.position.x - player.pos.x, g.position.z - player.pos.z) < 1.1) return { i: g.userData.i, g };
  return null;
}
function tickDig(dt) {
  for (const g of digModels) { const sp = g.children.find(c => c.userData.spark); if (sp) { sp.rotation.y += dt * 3; sp.position.y = 0.45 + Math.sin(performance.now() / 300 + g.userData.i) * 0.06; } }
}
function digSpot(ds) {
  const sp = S.dig.spots[ds.i]; if (!sp || sp.done || !hasTool('shovel')) return;
  upperOneShot('PickUp', 0.6); audio.play('dig');
  sp.done = true;
  const seeds = CROP_ORDER.map(c => CROPS[c].seed).filter(s => unlockLevel(s) <= S.level);
  const roll = Math.random(); let msg;
  if (roll < 0.4) { const c = 30 + Math.floor(Math.random() * 51); S.coins += c; msg = `+${c} coins`; }
  else if (roll < 0.7) { const s = seeds[Math.floor(Math.random() * seeds.length)]; addItem(s, 5); msg = `5 × ${ITEMS[s].name}`; }
  else if (roll < 0.9) { addItem('worm', 5); msg = '5 × Worms'; }
  else { const d = DECOR_ORDER[Math.floor(Math.random() * DECOR_ORDER.length)]; addItem('decor_' + d, 1); msg = `A ${DECOR[d].name.toLowerCase()}!`; }
  damageText(ds.g.position.clone().setY(ds.g.position.y + 0.9), msg);
  addXP(XP.crop * 2); refreshDig(); renderHotbar(); commit(); toast(`You dug up: ${msg}`);
}
// ---------- Higgins sells the tools (decision 73) until Nell's store opens ----------
function toolSeller() { return store.isOpen() ? 'Nell\u2019s store' : 'Higgins'; }
function toolMenu(msg) {
  showDialog(msg || 'Proper tools for a proper property. Bought once, yours to keep.', [
    ...GEAR_ORDER.map(id => {
      const t = GEAR[id], own = hasTool(id), lv = S.level >= t.level;
      return { label: own ? `${t.name} · yours` : lv ? `${t.name} (${t.price} coins) · ${t.does}` : `${t.name} · opens at town level ${t.level}`, go: () => buyTool(id) };
    }),
    { label: 'Back', go: () => talkMenu() },
  ]);
}
function buyTool(id) {
  const t = GEAR[id];
  if (hasTool(id)) { toolMenu(`You already have a fine ${t.name.toLowerCase()}.`); return; }
  if (S.level < t.level) { toolMenu(`The ${t.name.toLowerCase()} comes in when your town reaches level ${t.level}.`); return; }
  if (S.coins < t.price) { toolMenu('Ah, I’m afraid that’s a little more than you have just now.'); return; }
  audio.play('buy'); S.coins -= t.price; S.tools = [...(S.tools || []), id]; renderHotbar(); commit();
  if (farm.mode === 'tray' || farm.mode === 'ready') renderFarmTray();
  toolMenu(`One ${t.name.toLowerCase()}. It’s in your Farm tools now. Good for ${t.does}.`);
}

// --- buying (sign in the world, mockup A) ---
let lotOpen = null;
function openLotSheet(l) {
  lotOpen = l;
  const price = lotPrice(), lv = lotLevel(), lvOK = S.level >= lv, coinOK = S.coins >= price;
  document.getElementById('lotName').textContent = LOT_NAMES[l.id];
  document.getElementById('lotPrice').textContent = price.toLocaleString();
  const lvEl = document.getElementById('lotLevel'); lvEl.textContent = lvOK ? `Town level ${lv} \u2713` : `Needs town level ${lv}`; lvEl.className = lvOK ? 'ok' : 'no';
  const b = document.getElementById('lotBuy');
  b.disabled = !lvOK || !coinOK;
  b.textContent = !lvOK ? `Reach level ${lv}` : !coinOK ? `Need ${(price - S.coins).toLocaleString()} more` : 'Buy the lot';
  openSheet('lotSheet');
}
document.getElementById('lotBuy').addEventListener('click', () => {
  const l = lotOpen; if (!l || !lotForSale(l)) return;
  const price = lotPrice(); if (S.level < lotLevel() || S.coins < price) return;
  audio.play('buy'); S.coins -= price; S.lots = [...(S.lots || []), l.id];
  document.getElementById('lotSheet').hidden = true;
  refreshLots(); commit();
  toast(`${LOT_NAMES[l.id]} is yours! Clear it to make room.`);
});
// --- clearing (mockup C: tap once, you do the work; blue ring raised above the thing, outlined) ---
let clr = null, outlined = null;
const ringEl = document.getElementById('clearRing'), ringArc = ringEl.querySelector('.arc'), RING_C = 2 * Math.PI * 22;
const OUTLINE = 0x1b1626;   // black outline (Mac)
const outlineMat = new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide, depthTest: false, depthWrite: false });   // drawn over the ground so the bottom edge shows too; the thing itself draws on top of it
outlineMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normal * 0.075;'); };
// the outline is a slightly fattened copy drawn inside-out; low-poly models have split (flat) normals,
// so weld the corners first or the shell cracks apart at every edge
const hullCache = new WeakMap();
function hullGeo(g) {
  if (hullCache.has(g)) return hullCache.get(g);
  const w = new THREE.BufferGeometry(); w.setAttribute('position', g.attributes.position); if (g.index) w.setIndex(g.index);
  const h = mergeVertices(w, 1e-3); h.computeVertexNormals(); hullCache.set(g, h); return h;
}
function setOutline(o) {
  if (outlined === o) return;
  if (outlined && outlined.userData.hull) outlined.userData.hull.forEach(h => { h.visible = false; });
  outlined = o;
  if (!o) return;
  if (!o.userData.hull) {
    o.userData.hull = [];
    if (/grass|mushroom|bush|tree/.test(o.userData.kind)) {   // leafy things: outline on the ground (a traced outline turned into a black blob)
      // a clump of thin blades has no clean edge to trace, so it gets the outline on the ground around it
      const bb = new THREE.Box3().setFromObject(o), sz = bb.getSize(new THREE.Vector3()), r = Math.max(sz.x, sz.z) / 2 + 0.12;
      const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.09, 40), new THREE.MeshBasicMaterial({ color: OUTLINE, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(o.position.x, 0.04, o.position.z); ring.userData.isHull = true; scene.add(ring); o.userData.hull.push(ring);
    } else o.traverse(m2 => { if (m2.isMesh && !m2.userData.isHull) { const h = new THREE.Mesh(hullGeo(m2.geometry), outlineMat); h.userData.isHull = true; h.renderOrder = 5; m2.renderOrder = 6; m2.add(h); o.userData.hull.push(h); } });
  }
  o.userData.hull.forEach(h => { h.visible = true; });
}
const hasTool = (t) => !t || (S.tools || []).includes(t);
const hitsNeeded = (o) => (CLEAR_NEEDS[o.userData.kind] || { hits: 1 }).hits;
const hitsOn = (o) => (S.hits || {})[o.userData.key] || 0;
function clearName(o) { const k = o.userData.kind; return k === 'rock_largeA' ? 'A big rock' : k === 'log' ? 'A log' : k.startsWith('tree') ? 'A tree' : k === 'stump_round' ? 'A stump' : k === 'rock_smallA' ? 'A rock' : 'A bush'; }
function sizeByHits(o) { if (o.userData.s0 == null) o.userData.s0 = o.scale.x; o.scale.setScalar(o.userData.s0 * (1 - 0.16 * hitsOn(o) / hitsNeeded(o))); }
const ringHits = ringEl.querySelector('.hn');
function ringSegments(n, done, f) {
  const seg = RING_C / n, gap = n > 1 ? 7 : 0, parts = [];
  for (let i = 0; i < n; i++) { const len = seg - gap, fill = i < done ? len : i === done ? len * f : 0; parts.push(fill.toFixed(1), (seg - fill).toFixed(1)); }
  ringArc.setAttribute('stroke-dasharray', parts.join(' '));
  ringArc.setAttribute('stroke-linecap', n > 1 ? 'butt' : 'round');
  ringHits.textContent = n > 1 ? `${done + (f >= 1 ? 1 : 0)}/${n}` : '';
}
// chips fly off on each hit
const chipGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08), chipList = [];
function chips(o) {
  const col = /rock/.test(o.userData.kind) ? 0x9a948c : /grass|bush|mushroom/.test(o.userData.kind) ? 0x6fbf4a : 0xc98d4b;
  const mat = new THREE.MeshStandardMaterial({ color: col, flatShading: true });
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Mesh(chipGeo, mat); c.position.set(o.position.x, o.position.y + (o.userData.h || 1) * 0.5, o.position.z);
    const a = Math.random() * Math.PI * 2; c.userData.v = new THREE.Vector3(Math.cos(a) * 2, 3 + Math.random() * 2, Math.sin(a) * 2); c.userData.t = 0;
    scene.add(c); chipList.push(c);
  }
}
function tickChips(dt) {
  for (let i = chipList.length - 1; i >= 0; i--) {
    const c = chipList[i]; c.userData.t += dt; c.userData.v.y -= 14 * dt; c.position.addScaledVector(c.userData.v, dt); c.rotation.x += dt * 8;
    if (c.userData.t > 0.7) { scene.remove(c); chipList.splice(i, 1); }
  }
}
function startClear(o) {
  if (!o || isCleared(o) || (clr && clr.o === o)) return;
  clr = { o, t: 0, dur: HIT_SECONDS, tug: 0, need: hitsNeeded(o), done: hitsOn(o) };
  player.walkTo = null;
}
const _rp = new THREE.Vector3();
function tickClear(dt) {
  const near = clr ? clr.o : (useAction && useAction.kind === 'clear' ? useAction.item : null);
  setOutline(near);
  if (!clr) { ringEl.hidden = true; return; }
  const o = clr.o;
  if (Math.hypot(o.position.x - player.pos.x, o.position.z - player.pos.z) - (o.userData.r || 0) > 2.2 || farm.mode !== 'off' || dlg.open) { clr = null; ringEl.hidden = true; return; }
  player.faceYaw = Math.atan2(o.position.x - player.pos.x, o.position.z - player.pos.z);
  if ((clr.tug -= dt) <= 0) { upperOneShot('PickUp', 0.6); clr.tug = 0.65; audio.hit((CLEAR_NEEDS[o.userData.kind] || {}).tool); }
  clr.t += dt;
  o.rotation.z = Math.sin(clr.t * 26) * 0.04;   // it shakes while you work on it
  // the ring sits well above the thing (Mac: raised, blue)
  _rp.set(o.position.x, o.position.y + (o.userData.h || 1), o.position.z).project(camera);
  ringEl.hidden = false;
  ringEl.style.left = ((_rp.x + 1) / 2 * innerWidth) + 'px'; ringEl.style.top = ((1 - _rp.y) / 2 * innerHeight - 64) + 'px';
  ringSegments(clr.need, clr.done, Math.min(1, clr.t / clr.dur));
  if (clr.t >= clr.dur) {
    o.rotation.z = 0;
    const done = clr.done + 1;
    if (done < clr.need) {
      // one hit: it gets a little smaller and chips fly; tap Clear again for the next one (Mac: not too easy)
      S.hits = { ...(S.hits || {}), [o.userData.key]: done }; sizeByHits(o);
      chips(o); clr = null; ringEl.hidden = true; commit(); return;
    }
    setOutline(null); (o.userData.hull || []).forEach(h => { h.visible = false; });
    S.cleared = [...(S.cleared || []), o.userData.key];
    if (S.hits) delete S.hits[o.userData.key];
    if (o.userData.solidR) solids.splice(solids.indexOf(o), 1);
    poofs.push({ o, t: 0, s: o.scale.x });
    clr = null; ringEl.hidden = true; commit();
  }
}
const poofs = [];
function tickPoofs(dt) {
  for (let i = poofs.length - 1; i >= 0; i--) {
    const p = poofs[i]; p.t += dt;
    p.o.scale.setScalar(p.s * Math.max(0, 1 - p.t * 4));
    if (p.t >= 0.25) { p.o.visible = false; p.o.scale.setScalar(p.s); poofs.splice(i, 1); }
  }
}

function makeBoard() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.85 });
  const cork = new THREE.MeshStandardMaterial({ color: 0xc89466, roughness: 0.95 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x6a4a8c, roughness: 0.7 });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  box(0.09, 1.55, 0.09, wood, -0.62, 0.775, 0); box(0.09, 1.55, 0.09, wood, 0.62, 0.775, 0);
  box(1.36, 0.82, 0.08, wood, 0, 1.08, 0.02); box(1.22, 0.68, 0.04, cork, 0, 1.08, 0.07);
  const r = box(1.55, 0.06, 0.4, roof, 0, 1.6, 0.04); r.rotation.x = -0.25;
  boardNotes = new THREE.Group(); g.add(boardNotes);
  g.position.set(BOARD.x, groundY(BOARD.x, BOARD.z), BOARD.z);
  shadowize(g); scene.add(g);
}
function updateBoardNotes() {
  if (!boardNotes) return;
  const live = S.orders.slots.filter(o => !o.empty);
  const sig = live.map(o => o.id + (orderReady(o) ? 'r' : '')).join(',');
  if (sig === boardSig) return;   // called on every save; only rebuild when the notes change
  boardSig = sig; boardNotes.clear();
  noteKit = noteKit || {
    note: new THREE.PlaneGeometry(0.3, 0.26), pin: new THREE.SphereGeometry(0.025, 8, 6),
    paper: new THREE.MeshStandardMaterial({ color: 0xfff8e6, roughness: 0.9 }), paperReady: new THREE.MeshStandardMaterial({ color: 0xe6f7c8, roughness: 0.9 }),
    red: new THREE.MeshStandardMaterial({ color: 0xe0573e }), green: new THREE.MeshStandardMaterial({ color: 0x3fae5a }),
  };
  live.forEach((o, i) => {
    const col = i % 3, row = Math.floor(i / 3), ready = orderReady(o);
    const note = new THREE.Mesh(noteKit.note, ready ? noteKit.paperReady : noteKit.paper);
    note.position.set(-0.38 + col * 0.38, 1.24 - row * 0.33, 0.095); note.rotation.z = ((o.id * 37) % 7 - 3) * 0.03;
    const pin = new THREE.Mesh(noteKit.pin, ready ? noteKit.green : noteKit.red);
    pin.position.set(0, 0.1, 0.02); note.add(pin);
    note.castShadow = false; note.receiveShadow = true; boardNotes.add(note);
  });
}
const nearBoard = () => Math.hypot(player.pos.x - BOARD.x, player.pos.z - (BOARD.z + 0.5)) < 1.6;
function orderReady(o) { return !o.empty && o.items.every(([id, n]) => invCount(id) >= n); }
function refillMs() { return settings.debug ? DEBUG.orderRefillSeconds * 1000 : ORDERS.refillMinutes * 60000; }
// one order per townsperson who's open (Mac, v0.1.61); a filled or tossed one comes back from the same person once its timer runs out
function tickOrders() {
  const st = S.orders, now = Date.now(), folk = orderFolk(S.level); let changed = false;
  // older saves: keep each person's first order (a ready one first), drop the rest; waiting slots without a person go
  const keep = [], seen = new Set();
  for (const o of [...st.slots].sort((a, b) => orderReady(b) - orderReady(a))) {
    if (!o.who || !folk.includes(o.who) || seen.has(o.who)) { if (!o.empty || o.who) changed = true; continue; }
    seen.add(o.who); keep.push(o);
  }
  if (keep.length !== st.slots.length) changed = true;
  st.slots = folk.map(w => keep.find(o => o.who === w)).filter(Boolean);
  for (const w of folk) if (!seen.has(w)) { st.slots.push(makeOrder(Math.random, st.next++, S.level, w)); changed = true; }
  st.slots = st.slots.map(o => { if (o.empty && now >= o.at) { changed = true; return makeOrder(Math.random, st.next++, S.level, o.who); } return o; });
  // rewards you haven't unlocked yet (shrimp before level 3, the Glow Lure before 6) become a friendship heart
  for (const o of st.slots) if (!o.empty && o.extra.kind === 'item' && unlockLevel(o.extra.item) > S.level) { o.extra = { kind: 'heart' }; changed = true; }
  if (changed) { storeSave(S, settings.debug); updateBoardNotes(); if (!document.getElementById('orders').hidden) renderOrders(); }
  renderTrack();
}
let ordAtBoard = false, tossArmed = null;
function openOrders(atBoard) { ordAtBoard = atBoard; tossArmed = null; tickOrders(); renderOrders(); openSheet('orders'); }
const folkAv = (who, cls = 'oav') => `<span class="${cls}" style="background:${ORDER_FOLK[who].color}">${ORDER_FOLK[who].name[0]}</span>`;
function extraLabel(e) { return e.kind === 'heart' ? `${svg('heart', '#e0573e', 13)}+1` : `+ ${e.n > 1 ? e.n + ' ' : ''}${ITEMS[e.item].name}`; }
function renderOrders() {
  const slots = S.orders.slots, live = slots.filter(o => !o.empty);
  const ready = live.filter(orderReady).length;
  document.getElementById('ordSub').textContent = `${ready} ready \u00b7 ${takenOrders().length} pending`;
  document.getElementById('ordNote').textContent = ordAtBoard
    ? 'Take an order to keep it on screen. Selling keeps what it needs.'
    : 'Fill orders at the board next to Higgins.';
  const sorted = [...slots].sort((a, b) => (!!a.empty - !!b.empty) || (orderReady(b) - orderReady(a)));
  document.getElementById('ordList').innerHTML = sorted.map(o => {
    if (o.empty) { const m = Math.max(1, Math.ceil((o.at - Date.now()) / 60000)); return `<div class="orow empty">New order in about ${m} min</div>`; }
    const r = orderReady(o), pinned = takenOrders().includes(o.id), f = ORDER_FOLK[o.who];
    const items = o.items.map(([id, n]) => { const h = Math.min(invCount(id), n); return `<div class="oit">${itemIcon(id)}<div>${ITEMS[id].name}<br><span class="${h >= n ? 'ok' : 'need'}">${h}/${n}${h >= n ? ' \u2713' : ''}</span></div></div>`; }).join('');
    const fill = ordAtBoard ? `<button class="fill" data-ofill="${o.id}" ${r ? '' : 'disabled'}>${r ? 'Fill' : 'Need more'}</button>` : `<button class="fill" disabled>At the board</button>`;
    return `<div class="orow${r ? ' ready' : ''}${pinned ? ' taken' : ''}">${folkAv(o.who)}<div class="omid"><div class="otop"><b>${f.name}</b>${pinned ? '<span class="opend">Pending</span>' : ''}<span class="orew">${svg('coin', '#c98a1a', 15)}${o.coins} <em>${extraLabel(o.extra)}</em></span></div><div class="oitems">${items}</div></div>
      <div class="obtns">${fill}<div class="row2"><button data-opin="${o.id}" class="${pinned ? 'on' : ''}" aria-pressed="${pinned}">${svg('pin', '#2b2140', 14)}${pinned ? 'Drop' : 'Take'}</button>${ordAtBoard ? `<button data-otoss="${o.id}" class="${tossArmed === o.id ? 'armed' : ''}" aria-label="Toss this order">${tossArmed === o.id ? 'Sure?' : svg('x', '#8a7fa0', 14)}</button>` : ''}</div></div></div>`;
  }).join('');
}
function clearSlot(id) {
  const i = S.orders.slots.findIndex(o => o.id === id);
  if (i >= 0) S.orders.slots[i] = { empty: true, who: S.orders.slots[i].who, at: Date.now() + refillMs() };
  S.orders.taken = takenOrders().filter(t => t !== id);
}
document.getElementById('ordList').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.opin) { const id = +b.dataset.opin, t = takenOrders(); S.orders.taken = t.includes(id) ? t.filter(x => x !== id) : [...t, id]; audio.play('tap'); commit(); renderOrders(); renderTrack(); return; }
  if (b.dataset.otoss) { const id = +b.dataset.otoss; if (tossArmed !== id) { tossArmed = id; renderOrders(); return; } tossArmed = null; clearSlot(id); commit(); updateBoardNotes(); renderOrders(); toast('Order tossed'); return; }
  if (b.dataset.ofill) {
    const o = S.orders.slots.find(x => x.id === +b.dataset.ofill); if (!o || !orderReady(o) || !ordAtBoard) return;
    for (const [id, n] of o.items) addItem(id, -n);
    S.coins += o.coins; audio.play('coins'); addXP(XP.order); goals.event('order');   // GOALS
    let msg = `+${o.coins} coins \u00b7 +${XP.order} XP`;
    if (o.extra.kind === 'heart') { S.friends[o.who] = (S.friends[o.who] || 0) + 1; msg += ` \u00b7 ${ORDER_FOLK[o.who].name} \u2665+1`; }
    else { addItem(o.extra.item, o.extra.n); msg += ` \u00b7 +${o.extra.n} ${ITEMS[o.extra.item].name}`; }
    clearSlot(o.id); renderHotbar(); commit(); updateBoardNotes(); renderOrders(); toast(msg);
  }
});
document.getElementById('menuOrders').addEventListener('click', () => openOrders(false));
const trackEl = document.getElementById('orderTrack');
// Orders you took at the board are "pending" (Mac, v0.1.91): they stay on screen, two at a time, and selling keeps what they need.
// S.orders.taken is a list of order ids (it was one pinned id before).
function takenOrders() {
  const st = S.orders; if (!st.taken) st.taken = [];
  if (st.pinned != null) { if (!st.taken.includes(st.pinned)) st.taken.push(st.pinned); }   // a save from before v0.1.91 had one pinned order
  delete st.pinned;
  const live = st.slots.filter(o => !o.empty).map(o => o.id); st.taken = st.taken.filter(id => live.includes(id));
  return st.taken;
}
let trackAll = false;
trackEl.addEventListener('click', (e) => {
  if (!e.target.closest('.otrk')) return;
  if (takenOrders().length > 2) { trackAll = !trackAll; audio.play('tap'); renderTrack(); } else openOrders(nearBoard());   // tap for the rest; with one or two, tap opens the list
});
function renderTrack() {
  const list = takenOrders().map(id => S.orders.slots.find(x => !x.empty && x.id === id)).filter(Boolean).sort((a, b) => orderReady(b) - orderReady(a));
  trackEl.hidden = !list.length; if (!list.length) return;
  const show = trackAll ? list : list.slice(0, 2), rest = list.length - show.length;
  trackEl.innerHTML = show.map(o => {
    const r = orderReady(o), miss = o.items.find(([id, n]) => invCount(id) < n) || o.items[0];
    return `<button class="panel small otrk${r ? ' ready' : ''}" aria-label="Pending order">${svg('pin', '#e0573e', 15)}${folkAv(o.who)}<span class="tt"><b>${ORDER_FOLK[o.who].name}</b><br>${r ? 'Ready!' : `${ITEMS[miss[0]].name} ${Math.min(invCount(miss[0]), miss[1])}/${miss[1]}`}</span></button>`;
  }).join('') + (rest > 0 ? `<button class="panel small otrk more">+${rest} more</button>` : trackAll && list.length > 2 ? '<button class="panel small otrk more">Show less</button>' : '');
}


// ---------- main menu (layout B: your harbor + debug harbor) ----------
const mm = document.getElementById('mainMenu');
function whenText(t) {
  if (!t) return '';
  const d = new Date(t), now = new Date(), time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = d.toDateString() === now.toDateString() ? 'today' : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `Last played ${day}, ${time}`;
}
function renderMainMenu() {
  const si = seasonInfo(), real = settings.debug ? peekSave(false) : S;   // the loaded save is the freshest copy
  const started = real && real.introDone;
  document.getElementById('mmRealInfo').innerHTML = started
    ? `${si.season} \u00b7 Day ${si.day} \u00b7 ${(real.coins ?? 0).toLocaleString()} coins<br>${real.savedAt ? whenText(real.savedAt) : 'Saved on this device'}`
    : 'A new harbor<br>Higgins will meet you on the beach';
  document.getElementById('mmContinue').textContent = started ? 'Continue' : 'Start';
  document.getElementById('mmNew').hidden = !started;
  document.getElementById('mmDbgInfo').innerHTML = 'Separate test save \u00b7 starts at level 5, goals done<br>Fast crops \u00b7 debug buttons in Settings';
  document.getElementById('mmVer').textContent = VERSION_LABEL;
}
function showMainMenu() { renderMainMenu(); document.body.classList.add('inmenu'); mm.hidden = false; }
function startGame() {
  mm.hidden = true; document.body.classList.remove('inmenu');
  if (settings.debug) {
    // a fresh debug harbor starts as if you'd played to level 5 and done the goals (Mac, v0.1.151: "It's a chore to skip that every time")
    if (!S.introDone) {
      S.introDone = true; if (!S.kitGiven) giveStarterKit(); S.fishelMet = true; S.rosaMet = true;
      let xp = 0; for (let lv = 1; lv < DEBUG.startLevel; lv++) xp += xpToNext(lv);
      S.xp = Math.max(S.xp || 0, xp); S.level = Math.max(S.level || 1, DEBUG.startLevel); S.xpSeeded = true;
      if (!S.look) { S.look = { ...DEFAULT_LOOK }; paintPlayer(); syncPackBtn(); }   // and in the generic look, so the Wardrobe doesn't greet you (Mac: "default to generic look")
      goals.debug('all'); ensureRosa(); renderLevel(); renderHotbar(); commit();
    }
    toast('Debug harbor: test save');
  } else if (!S.introDone && S.look) setTimeout(runIntro, 600);
  if (!S.look) setTimeout(() => openWardrobe(true), 300);   // greet new players with the wardrobe first (Mac)
}
function openSave(debug) {
  if (!!settings.debug === debug) { startGame(); return; }
  persistNow();
  settings.debug = debug; storeSettings(settings);
  try { sessionStorage.setItem('tidewell.skipMenu', '1'); } catch (e) {}
  reloadNow();
}
document.getElementById('mmContinue').addEventListener('click', () => openSave(false));
document.getElementById('mmDebug').addEventListener('click', () => openSave(true));
function armTwice(btn, label, armedLabel, act) {
  let t = 0;
  btn.addEventListener('click', () => {
    if (Date.now() - t > 3000) { t = Date.now(); btn.textContent = armedLabel; btn.classList.add('armed'); setTimeout(() => { if (Date.now() - t >= 2900) { btn.textContent = label; btn.classList.remove('armed'); } }, 3000); return; }
    act();
  });
}
armTwice(document.getElementById('mmDbgReset'), 'Reset', 'Sure?', () => {
  resetSave(true);
  if (settings.debug) { reloadNow(); return; }
  const b = document.getElementById('mmDbgReset'); b.textContent = 'Reset'; b.classList.remove('armed'); toastNow('Debug save reset');
});
armTwice(document.getElementById('mmNew'), 'Start a new harbor', 'Erase your harbor? Tap again', () => {
  resetSave(false); settings.debug = false; storeSettings(settings);
  try { sessionStorage.setItem('tidewell.skipMenu', '1'); } catch (e) {}
  reloadNow();
});
document.getElementById('toMenu').addEventListener('click', () => { persistNow(); reloadNow(); });
function toastNow(t) { const el = document.getElementById('mmVer'); const v = el.textContent; el.textContent = t; setTimeout(() => { el.textContent = v; }, 1800); }

// ---------- bag ----------
const KIND_ORDER = { fish: 0, crop: 1, seed: 2, bait: 3, feed: 4, fert: 4, decor: 5 };
function itemIcon(id) {
  const it = ITEMS[id], col = RARITY[it.rarity].color;
  if (it.kind === 'crop') { const sc = it.special ? SPECIAL[it.special].color : col; return `<span class="ic${it.special ? ' sp-' + it.special : ''}" style="background:${sc}22;border:2px solid ${sc}">${cropImg(it.base || id, 26)}</span>`; }
  if (it.kind === 'seed') return `<span class="ic seedpk">${cropImg(it.crop, 20)}</span>`;
  const k = it.kind === 'fish' ? 'fish' : it.kind === 'crop' ? 'fruit' : it.kind === 'bait' ? id : it.kind === 'feed' ? 'feed' : it.kind === 'fert' ? 'fert' : it.kind === 'decor' ? it.decor : 'seeds';
  return `<span class="ic" style="background:${col}22;border:2px solid ${col}">${svg(k, col, 22)}</span>`;
}
function renderBag() {
  document.getElementById('bagCoins').textContent = `${S.coins.toLocaleString()} coins`;
  const ids = Object.keys(S.inv).filter(id => ITEMS[id] && S.inv[id] > 0)
    .sort((a, b) => (KIND_ORDER[ITEMS[a].kind] - KIND_ORDER[ITEMS[b].kind]) || (RARITY_IDX[ITEMS[b].rarity] - RARITY_IDX[ITEMS[a].rarity]));
  // crops: one row per crop with a dot for each colour you own; tap it and its kinds show underneath (bag A, Mac)
  const kinds = {}; for (const id of ids) { const it = ITEMS[id]; if (it.kind === 'crop') (kinds[it.base || id] = kinds[it.base || id] || []).push(id); }
  const seen = new Set();
  document.getElementById('bagList').innerHTML = ids.length ? ids.map(id => {
    const it = ITEMS[id], r = RARITY[it.rarity];
    if (it.kind === 'crop') {
      const base = it.base || id, grp = kinds[base]; if (seen.has(base)) return ''; seen.add(base);
      if (grp.length > 1 || grp[0] !== base) {
        const order = [base, ...Object.keys(SPECIAL).map(k => `${base}_${k}`)].filter(x => grp.includes(x)), total = order.reduce((t, x) => t + S.inv[x], 0), open = bagOpen === base;
        const dots = order.filter(x => ITEMS[x].special).map(x => `<i class="spdot" style="background:${SPECIAL[ITEMS[x].special].color}"></i>`).join('');
        return `<button class="row bgrp${open ? ' open' : ''}" data-grp="${base}">${itemIcon(base)}<div class="nm">${ITEMS[base].name}<small>${dots}</small></div><div class="ct">×${total}</div></button>`
          + (open ? `<div class="bkinds">${order.map(x => `<div class="bkind${ITEMS[x].special ? ' sp-' + ITEMS[x].special : ''}">${itemIcon(x)}<b>${ITEMS[x].special ? SPECIAL[ITEMS[x].special].name : 'Plain'}</b><span>×${S.inv[x]}</span><small><span class="scoin sm"></span>${ITEMS[x].price}</small></div>`).join('')}</div>` : '');
      }
    }
    return `<div class="row">${itemIcon(id)}<div class="nm">${it.name}<small style="color:${r.color}">${it.kind === 'fish' || it.kind === 'crop' ? r.label + ' · ' + it.price + ' coins each' : it.kind === 'bait' ? 'Bait' : it.kind === 'feed' ? 'Animal feed' : it.kind === 'fert' ? `Makes a crop ${FERT.minutes} min faster` : it.kind === 'decor' ? 'Decor' : r.label}</small></div><div class="ct">×${S.inv[id]}</div></div>`;
  }).join('') : '<div class="empty">Your bag is empty. Go fishing or farming!</div>';
  document.getElementById('bagCollection').textContent = `Fish book: ${dex.foundCount()} of ${dex.totalCount()} found.`   /* FISHING */;
}
const RARITY_IDX = { common: 0, uncommon: 1, rare: 2, super: 3, legendary: 4 };
let bagOpen = null;
document.getElementById('bagList').addEventListener('click', (e) => { const b = e.target.closest('[data-grp]'); if (!b) return; bagOpen = bagOpen === b.dataset.grp ? null : b.dataset.grp; renderBag(); });

// ---------- settings + debug mode ----------
function renderSettings() {
  document.getElementById('setVersion').textContent = VERSION_LABEL + (settings.debug ? ' · debug save' : '') + (canSave ? '' : ' · saving unavailable here');
  document.querySelectorAll('#bodySeg button').forEach(x => x.classList.toggle('on', x.dataset.b === S.body));
  document.querySelectorAll('#debugSeg button').forEach(x => x.classList.toggle('on', (x.dataset.d === 'on') === !!settings.debug));
  document.getElementById('debugPanel').hidden = !settings.debug;
  document.querySelectorAll('#fastSeg button').forEach(x => x.classList.toggle('on', x.dataset.f === 'crops' ? settings.fastCrops : settings.instantBite));
  document.querySelectorAll('#dbgTod button').forEach(x => x.classList.toggle('on', (settings.todOverride || 'auto') === x.dataset.t));
  renderWx();
}
document.querySelectorAll('#debugSeg button').forEach(b => b.addEventListener('click', () => {
  const on = b.dataset.d === 'on'; if (on === !!settings.debug) return;
  persistNow();
  settings.debug = on; storeSettings(settings);
  reloadNow();   // switch to the other save cleanly
}));
document.querySelectorAll('#fastSeg button').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.f === 'crops') settings.fastCrops = !settings.fastCrops; else settings.instantBite = !settings.instantBite;
  storeSettings(settings); renderSettings();
}));
document.querySelectorAll('#dbgTod button').forEach(b => b.addEventListener('click', () => {
  settings.todOverride = b.dataset.t === 'auto' ? null : b.dataset.t; storeSettings(settings); renderSettings(); tickClock();
}));
document.querySelectorAll('[data-dbg]').forEach(b => b.addEventListener('click', () => {
  if (!settings.debug) return;
  const k = b.dataset.dbg;
  if (k === 'coins') { S.coins += 1000; toast('+1,000 coins'); }
  if (k === 'seeds') { for (const id of CROP_ORDER) addItem(CROPS[id].seed, 5); toast('+5 of every seed'); }
  if (k === 'bait') { addItem('worm', 10); addItem('shrimp', 10); addItem('lure', 3); toast('+10 worms, +10 shrimp, +3 glow lures'); }
  if (k === 'kit') { giveStarterKit(); toast('Starter decor kit added'); }
  if (k === 'fish') { for (const f of FISH) addItem(f.id, 1); toast('One of every fish added'); }
  if (k === 'ripe') {
    for (let x = -10; x <= -8; x++) for (let z = 0; z <= 1; z++) {
      const p = addPlot({ x, z }); p.save.crop = CROP_ORDER[((x + 10) * 2 + z) % CROP_ORDER.length]; p.save.plantedAt = Date.now() - 1e9; p.stage = -2; syncCrop(p, true);
    }
    player.pos.set(-8.5, 0, 2.6); player.yaw = Math.PI; toast('6 ripe crops, ready to harvest');
  }
  if (k === 'grass') { let n = 0; for (const p of plots.values()) if (!p.save.crop) { p.save.emptySince = 1; n++; } grassCheck = 0; toast(n ? `${n} empty plot${n > 1 ? 's' : ''} going back to grass` : 'No empty plots'); }
  if (k === 'xp') { addXP(100); toast('+100 XP'); }
  if (k === 'goals0') goals.debug('restart');   // GOALS
  if (k === 'goalsSkip') goals.debug('skip');
  if (k === 'lot') {
    const l = LOTS.find(lotForSale);
    if (!l) toast('Every lot is bought');
    else { const s = lotSignPos(); player.pos.set(s.x + 1.1, 0, s.z - 1.2); toast(`Next lot: ${LOT_NAMES[l.id]}, ${lotPrice().toLocaleString()} coins, level ${lotLevel()}`); }
  }
  if (k === 'cargofill') { cargo.ensure(); if (S.level < CARGO.openLevel) { S.level = CARGO.openLevel; S.xp = Math.max(S.xp, 0); renderLevel(); } cargo.boxes().forEach((b, i) => { if (b.kind === 'star' || b.kind === 'starb') { const st = b.kind === 'starb' ? S.cargo.starB : S.cargo.star; S.cargo.boxes[i] = { [st.item]: st.n }; } else S.cargo.boxes[i] = { [b.kind === 'crate' ? 'turnip' : 'sunfish']: cargo.capOf(b.kind, i) }; }); cargo.refresh(); commit(); toast('Hold filled'); }
  if (k === 'cargodemo') { const no = cargo.demoTrip(); if (no) toast(no); else { document.getElementById('settings').hidden = true; toast('Ship leaves in 5'); } }
  if (k === 'cargoback') { cargo.ensure(); if (S.cargo.back) { S.cargo.back = Date.now() - 1; cargo.stopSailing(); merchant.visible = false; commit(); toast('The ship is on its way back'); } else toast('The ship is at the dock'); }
  if (k === 'tools') { S.tools = [...GEAR_ORDER]; if (S.level < 3) { S.level = 3; renderLevel(); } commit(); renderFarmTray(); refreshDig(); toast('All tools added'); }
  if (k === 'digreset') { S.dig = null; refreshDig(); commit(); toast('New dig spots'); }
  if (k === 'clearall') { for (const l of LOTS) if (lotOwned(l.id)) lotView[l.id].weeds.children.forEach(o => { if (!isCleared(o)) S.cleared.push(o.userData.key); }); refreshLots(); toast('Cleared every bought lot'); }
  if (k === 'rosa') { if (rosa) { player.pos.set(rosa.pos.x - 0.2, 0, rosa.pos.z + 1.3); player.yaw = Math.PI; } else toast('Rosa opens at town level 2'); }
  if (k === 'lvl') { const { have, need } = xpInto(S.xp || 0); addXP(need - have); }
  if (k === 'dock') { player.pos.set(DOCK.x, 0, DOCK.zFar + 0.5); player.yaw = Math.PI; }
  if (k === 'intro') { document.getElementById('settings').hidden = true; S.introDone = false; runIntro(); }
  if (k === 'reset') { resetSave(true); reloadNow(); return; }
  renderHotbar(); commit(); renderSettings();
}));
// ---------- weather hooks (everything else about rain is in weather.js) ----------
// rain waters every planted plot once per growth step: the same boost as the watering can
function rainWater() {
  let n = 0;
  for (const p of plots.values()) {
    if (!p.save.crop || p.grown) continue;
    const stg = stageOf(p); if (p.save.watered === stg) continue;
    if (!p.save.wet1) { p.save.wet1 = 1; p.save.plantedAt -= WATER_MS; }   // once per crop, like the can
    p.save.watered = stageOf(p) === stg ? stg : null; syncCrop(p); setWet(p); n++;
  }
  if (n) storeSave(S, settings.debug);
}
function initWeather() {
  // rain that fell while you were away watered the crops too
  if (S.savedAt) for (const p of plots.values()) if (p.save.crop) {
    p.save.plantedAt = weather.awayWatering(p.save.plantedAt, growMs(p.save.crop), CROPS[p.save.crop].stages.length, p.save.watered, S.savedAt, Date.now(), WATER_MS);
    p.stage = -2; syncCrop(p, true);
  }
  weather.init({ scene, renderer, sun, hemi, lanternLights, waterUniforms, player, audio, settings, waterY: WATER_Y,
    waterMat: () => waterMat, ground: () => groundMesh, resetTOD: () => setTOD(todKey), waterCrops: rainWater,
    surfaceY: (x, z) => onDock(x, z) ? DOCK_FLOOR + 0.02 : Math.max(groundY(x, z), WATER_Y),
    puddleOk: (x, z) => { const k = cellKey({ x: Math.floor(x), z: Math.floor(z) }); return !plots.has(k) && !decorOcc.has(k) && groundY(x, z) > WATER_Y + 0.2; },
    splash: () => audio.play('puddle'),   // the little ring itself is drawn by weather.js
    // where everyone's feet are: a soft blob goes under each character while the rain hides the real shadows
    feet: () => [{ x: player.pos.x, y: player.y || 0, z: player.pos.z }, ...[higgins, fishel, rosa, pike].filter(Boolean).map(n => ({ x: n.pos.x, y: floorY(n.pos.x, n.pos.z), z: n.pos.z }))] });
}
function renderWx() {
  document.querySelectorAll('.wx-seg button').forEach(x => x.classList.toggle('on', (settings.wxOverride || 'auto') === x.dataset.w));
  document.getElementById('wxInfo').textContent = weather.describe();
}
document.querySelectorAll('.wx-seg button').forEach(b => b.addEventListener('click', () => {
  if (!settings.debug) return;
  settings.wxOverride = b.dataset.w === 'auto' ? null : b.dataset.w; storeSettings(settings); renderWx();
}));
let eraseArmed = 0;
document.getElementById('resetReal').addEventListener('click', (e) => {
  const now = Date.now();
  if (now - eraseArmed > 3000) { eraseArmed = now; e.target.textContent = 'Tap again to erase everything'; setTimeout(() => e.target.textContent = 'Start over (erase my save)', 3000); return; }
  resetSave(false); if (!settings.debug) { reloadNow(); } else toast('Real save erased');
});
// Reloads that switch or erase a save must not auto-save on the way out: by then settings.debug may
// point at the other slot, or the save was just erased on purpose. (Bug since v0.1.0; fixed v0.1.10.)
let leaving = false;
function reloadNow() { leaving = true; location.reload(); }
// Mac's way into debug on the players' copy (v0.1.96): tap the version in Settings 7 times, type the code. The code is kept
// as a SHA-256 hash, so the word isn't in the public files. It stays unlocked on this phone until "Lock debug".
const DEV_HASH = '9ed1515819dec61fd361d5fdabb57f41ecce1a5fe1fe263b98c0d6943b9b232e';
{
  const ver = document.getElementById('setVersion'), box = document.getElementById('codeBox'), inp = document.getElementById('codeIn'), lock = document.getElementById('devLock');
  let taps = 0, tapAt = 0, unlocked = false;
  try { unlocked = localStorage.getItem('tidewell.dev') === '1'; } catch (e) { /* no storage here */ }
  box.hidden = true; box.style.display = 'none'; lock.hidden = !unlocked;
  ver.addEventListener('click', () => {
    const now = Date.now(); taps = now - tapAt < 1500 ? taps + 1 : 1; tapAt = now;
    if (taps >= 7 && PLAYER) { taps = 0; box.hidden = false; box.style.display = 'flex'; inp.value = ''; inp.focus(); }
  });
  const tryCode = async () => {
    let hex = '';
    try { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(inp.value.trim().toLowerCase())); hex = [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); } catch (e) { /* no crypto here */ }
    if (hex !== DEV_HASH) { inp.value = ''; toast('Nope'); return; }
    try { localStorage.setItem('tidewell.dev', '1'); } catch (e) { toast('Can\'t save that here'); return; }
    reloadNow();
  };
  document.getElementById('codeGo').addEventListener('click', tryCode);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') tryCode(); });
  lock.addEventListener('click', () => {
    try { localStorage.removeItem('tidewell.dev'); } catch (e) { /* nothing to remove */ }
    if (settings.debug) { settings.debug = false; storeSettings(settings); }
    reloadNow();
  });
}
function persistNow() { if (leaving) return; S.pos = [+player.pos.x.toFixed(2), +player.pos.z.toFixed(2)]; storeSave(S, settings.debug); }
addEventListener('pagehide', persistNow);

// ---------- an open game updates itself (v0.1.105) ----------
// Mac: "Is there any way that we can force a reset so everybody playing has the latest without having to close their game?"
// Only on the players' copy (github.io) and localhost, where sw.js runs. The claude.ai copy is moved on by its host.
// The game reads the tiny version.json (written by tools/deploy-play.sh from VERSION) with caching off: 20 s after it starts
// (which also catches a start that sw.js served from its saved copy), every 5 minutes, and whenever you come back to it.
// A newer version is taken quietly at a safe moment: you just came back, or 20 s without a touch, and nothing is open.
// It saves, reloads straight back into the game (no title screen), and never tries the same version twice in 10 minutes.
const upd = { on: /github\.io$|^localhost$/.test(location.hostname), want: null, since: 0, touch: performance.now(), back: 0, busy: false };
const updLab = () => Object.assign({ wait: 120, idle: 20, every: 300, show: 900, fresh: 20 }, window.__updLab || {});   // seconds (show: ms); tests shorten them. fresh: how long after coming back still counts as "just came back"
const verNum = (v) => String(v).split('.').map(n => parseInt(n, 10) || 0);
const verNewer = (a, b) => { const x = verNum(a), y = verNum(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
async function updCheck() {
  if (!upd.on || upd.busy) return; upd.busy = true;
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) { const v = (await r.json()).version; if (v && verNewer(v, VERSION) && upd.want !== v) { upd.want = v; upd.since = performance.now(); }
      // v0.1.138: found on coming back to the game, before any touch: take it right away. (Before, the two-minute settling wait
      // started at that moment, so "just came back" was always over by the time it ended, and a game that was never left still
      // for 20 s never updated at all: Mac's phone sat ten versions behind until he force-closed it.)
      if (upd.want && upd.back && upd.touch < upd.back && performance.now() - upd.back < updLab().fresh * 1000) upd.since = -1e12; }
  } catch (e) { /* offline: try again later */ }
  upd.busy = false;
}
function updSafe() {
  return !busyForLevelCard() && !decor.on && fishing.state === 'idle' && !store.inside() && !document.body.classList.contains('inmenu') && document.getElementById('levelUp').hidden && !document.hidden;
}
function updTick() {
  if (!upd.want) return;
  const L = updLab(), now = performance.now();
  if (now - upd.since < L.wait * 1000) return;                     // give the new files a moment to reach every server
  const fresh = upd.back && now - upd.back < L.fresh * 1000 && upd.touch < upd.back, idle = now - upd.touch > L.idle * 1000;
  if (!(fresh || idle) || !updSafe()) return;
  let tried = null; try { tried = JSON.parse(sessionStorage.getItem('tidewell.updTried') || 'null'); } catch (e) { /* none */ }
  if (tried && tried.v === upd.want && Date.now() - tried.at < 600000) return;   // that reload didn't bring it: don't loop
  try { sessionStorage.setItem('tidewell.updTried', JSON.stringify({ v: upd.want, at: Date.now() })); sessionStorage.setItem('tidewell.skipMenu', '1'); } catch (e) { return; }
  persistNow();
  // go to the opening loading screen first, so it reads as "the game is updating" and not as a glitch (Mac, v0.1.106)
  try { sessionStorage.setItem('tidewell.updating', '1'); } catch (e) { /* the plain text shows then */ }
  upd.want = null;
  const L0 = document.getElementById('loading');
  document.getElementById('loadTxt').textContent = 'Updating the harbor…'; document.getElementById('loadBar').style.width = '0%';
  L0.style.opacity = '0'; L0.hidden = false; L0.style.transition = 'opacity .45s'; requestAnimationFrame(() => { L0.style.opacity = '1'; });
  setTimeout(reloadNow, updLab().show);
}
if (upd.on) {
  addEventListener('pointerdown', () => { upd.touch = performance.now(); }, true);
  const cameBack = () => { if (document.hidden || performance.now() - upd.back < 1500) return; upd.back = performance.now(); updCheck(); };
  document.addEventListener('visibilitychange', cameBack); addEventListener('pageshow', cameBack); addEventListener('focus', cameBack);   // a home-screen app doesn't always send all three
  setTimeout(updCheck, 20000);
  setInterval(updCheck, updLab().every * 1000);
  setInterval(updTick, 1000);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) persistNow(); });

// ---------- resize ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w / h < 0.75 ? 44 : 36; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
// home-screen app: iPhone can report the wrong height at launch, so size again once things settle
if (window.visualViewport) visualViewport.addEventListener('resize', resize);
addEventListener('pageshow', resize); addEventListener('orientationchange', () => setTimeout(resize, 300)); setTimeout(resize, 500); setTimeout(resize, 1500);

// ---------- loop ----------
const clock = new THREE.Clock();
const camOffset = new THREE.Vector3(0, 14, 15.5);
// Camera tilt (v0.1.4): 57° on the grass, easing down to 42° at the water's edge
// and on the dock; 64° and pulled back while holding the hoe or seeds, or decorating.
const CAM = { walk: 57, water: 42, build: 64, buildZoom: 1.15, dist: Math.hypot(14, 15.5), ease: 2.2, easeBuild: 5 };
let camAng = CAM.walk, camZoom = 1;
function camTarget() {
  const building = document.body.classList.contains('decorating') || tool === 'farm' || tool === 'seeds';
  if (building) return [CAM.build, CAM.buildZoom, CAM.easeBuild];
  const w = onDock(player.pos.x, player.pos.z) ? 1 : smooth(0.5, -4.0, player.pos.z);
  return [CAM.walk + (CAM.water - CAM.walk) * w, 1, camZoom > 1.01 ? CAM.easeBuild : CAM.ease];
}
// the camera stops at the left and right edges of the land instead of following you past them (Mac, v0.1.44 try-out):
// it keeps the edge of the view about a tree's width past the boundary, and you walk the last few meters off-center
const CAM_EDGE = 2.2;
function camClampX(x) {
  const dist = camOffset.length(), hw = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect;
  const lo = landMinX() - CAM_EDGE - 2.2 + spots.farShift() /* FISHING: far enough left to see the river's other bank */ + hw, hi = landMaxX() + CAM_EDGE - hw;
  return lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, x));
}
function updateCamOffset(dt, snap) {
  const [ang, zoom, ease] = camTarget(), k = snap ? 1 : 1 - Math.exp(-dt * ease);
  camAng += (ang - camAng) * k; camZoom += (zoom - camZoom) * k;
  const r = CAM.dist * camZoom, a = camAng * Math.PI / 180;
  camOffset.set(0, r * Math.sin(a), r * Math.cos(a));
}
const camPos = new THREE.Vector3(), camFocus = new THREE.Vector3();
let gateToastT = 0;
let elapsed = 0;
function update(dt) {
  elapsed += dt;
  waterUniforms.uTime.value = elapsed;
  // movement
  updateSit(dt);   // SIT
  let mv = dlg.open || farm.mode !== 'off' || ward.on || fishing.state === 'fight' /* REEL: the thumb steers the fish */ || sit.w > 0 /* SIT */ ? new THREE.Vector3() : new THREE.Vector3(joy.dx, 0, joy.dy);
  tickWardrobe(dt);
  placeUndo(); tickClear(dt); tickPoofs(dt); tickChips(dt); tickDig(dt); tickSaleBubble(); cargo.tick(dt); spots.frame(); dex.frame(dt); tackle.frame();   // FISHING, TACKLE
  let mag = Math.min(1, mv.length());
  if (player.walkTo && mag < 0.12) {
    const w = player.walkTo, d = Math.hypot(w.x - player.pos.x, w.z - player.pos.z);
    if (d <= 1.0) { const a = actionFor(w.cell); player.walkTo = null; doAction(a); }
    else { mv = new THREE.Vector3(w.x - player.pos.x, 0, w.z - player.pos.z); mag = 0.8; }
  }
  const prevZ = player.pos.z;
  if (mag > 0.12) {
    mv.normalize();
    const v = mag < 0.55 ? 1.6 + mag * 1.4 : 3.2 + (mag - 0.55) / 0.45 * 2.0;   // walk up to ~2.4 m/s, run up to 5.2 m/s
    const np = player.pos.clone().addScaledVector(mv, v * dt);
    np.x = Math.max(landMinX(), Math.min(landMaxX(), np.x)); np.z = Math.min(FENCE_Z + 14.5, np.z);
    if (!walkable(np.x, np.z)) {
      // slide along whichever axis still works (edge of the dock or the shoreline)
      if (walkable(np.x, player.pos.z)) np.z = player.pos.z;
      else if (walkable(player.pos.x, np.z)) np.x = player.pos.x;
      else { np.x = player.pos.x; np.z = player.pos.z; }
    }
    // fence: only the gate lets you through
    const crossing = (prevZ - FENCE_Z) * (np.z - FENCE_Z) <= 0 || Math.abs(np.z - FENCE_Z) < 0.35;
    if (crossing && (Math.abs(np.x) > 1.0 || !FEATURES.combat)) {
      np.z = prevZ < FENCE_Z ? Math.min(np.z, FENCE_Z - 0.4) : Math.max(np.z, FENCE_Z + 0.4);
      if (!FEATURES.combat && Math.abs(np.x) <= 1.0 && gateToastT <= 0) { toast('The wilds open in a later update'); gateToastT = 4; }
    }
    // step around Higgins
    for (const n of [higgins, fishel, pike]) if (n) { const hx = np.x - n.pos.x, hz = np.z - n.pos.z, hd = Math.hypot(hx, hz); if (hd < 0.65) { np.x = n.pos.x + hx / hd * 0.65; np.z = n.pos.z + hz / hd * 0.65; } }
    // the bait stall is solid
    { const sx = np.x - FISHEL_STALL.x, sz = np.z - FISHEL_STALL.z; if (Math.abs(sx) < 1.25 && Math.abs(sz) < 1.0) { np.x = player.pos.x; np.z = player.pos.z; } }
    if (rosa) { const c = Math.cos(ROSA_CART.r), sn = Math.sin(ROSA_CART.r), dx = np.x - ROSA_CART.x, dz = np.z - ROSA_CART.z;
      if (Math.abs(dx * c - dz * sn) < 0.95 && Math.abs(dx * sn + dz * c) < 1.45) { np.x = player.pos.x; np.z = player.pos.z; } }
    { const bx = np.x - BOARD.x, bz = np.z - BOARD.z; if (Math.abs(bx) < 0.8 && Math.abs(bz) < 0.3) { np.x = player.pos.x; np.z = player.pos.z; } }
    store.block(np, player.pos);   // STORE: the shop is solid; leaning on its door walks you in
    animals.block(np, player.pos);   // ANIMALS: the coop is solid
    const moved = Math.hypot(np.x - player.pos.x, np.z - player.pos.z) / Math.max(dt, 1e-4);   // ANIM: legs follow the real speed (a wall stops them)
    player.pos.copy(np);
    const yaw = Math.atan2(mv.x, mv.z);
    let d = yaw - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); player.yaw += d * Math.min(1, dt * 12);
    locomote(Math.min(v, moved), dt);
  } else locomote(0, dt);
  player.moving = mag > 0.12;
  audio.frame(player.pos.x, player.pos.z, player.moving, onDock(player.pos.x, player.pos.z), currentTOD(), stepPhase());
  weather.frame(dt, elapsed, TOD[todKey], todKey);
  animals.frame(dt, elapsed);   // ANIMALS: hens wander, peck, follow and lay
  pets.frame(dt, elapsed);   // PETS: your pet follows, drifts, sleeps and swims
  if (player.moving) player.faceYaw = null;
  else if (player.faceYaw != null) {
    let d = player.faceYaw - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    player.yaw += d * Math.min(1, dt * 9);
    if (Math.abs(d) < 0.01) player.faceYaw = null;
  }
  // auto-attack: only in the wilds
  player.atkCd -= dt;
  tickUpper(dt); tickTalk();   // ANIM
  let nearest = null, nd = 1e9;
  for (const m of monsters) { if (m.dead > 0) continue; const d = m.pos.distanceTo(player.pos); if (d < nd) { nd = d; nearest = m; } }
  const inWilds = player.pos.z > FENCE_Z + 0.3;
  // stepping into the wilds brings the sword out; coming home puts back what you were holding
  if (FEATURES.combat && inWilds && !player.wasWild) { if (tool !== 'sword') { toolBeforeWilds = tool; selectTool('sword', true); } }
  if (FEATURES.combat && !inWilds && player.wasWild && player.pos.z < FENCE_Z - 0.3) { if (toolBeforeWilds !== null && tool === 'sword') selectTool(toolBeforeWilds, true); toolBeforeWilds = null; }
  if (inWilds) player.wasWild = true; else if (player.pos.z < FENCE_Z - 0.3) player.wasWild = false;
  if (nearest && nd < 2.4 && inWilds && tool === 'sword' && player.atkCd <= 0) {
    player.atkCd = 0.85;
    const to = nearest.pos.clone().sub(player.pos);
    if (!player.moving) player.faceYaw = Math.atan2(to.x, to.z);
    upperOneShot('Attack', 0.5);
    swing(Math.atan2(to.x, to.z));
    setTimeout(() => hitMonster(nearest, 6), 160);
  }
  const fy = floorY(player.pos.x, player.pos.z);
  player.y = player.y === undefined ? fy : player.y + (fy - player.y) * Math.min(1, dt * 14);
  for (const b of Object.values(bodies)) {
    b.root.position.set(player.pos.x, player.y, player.pos.z);
    b.root.rotation.set(0, player.yaw, 0);   // full reset: the farm-tool dangle tilts the whole body
    b.mixer.update(dt);
    anim.pose(b);   // ANIM: run lean, idle breathing
  }
  if (body) { body.root.updateMatrixWorld(true); applyRodPose(dt); applyFarmPose(dt); }
  setUse(pickUse() || animals.pickUse() || pets.pickUse());   // ANIMALS: Collect / Pet / Feed, only when nothing else wants the button. PETS: Adopt / Wake / Come, last in line
  updateMarker(dt);
  updateLine(dt);
  updateMoonPath();
  updateUndo();
  updatePlots(dt);
  if (toolNameT > 0) { toolNameT -= dt; if (toolNameT <= 0) document.getElementById('toolName').hidden = true; }
  scenery.frame(dt, elapsed, lanternLamps());   // SCENERY: wheels turn, the lighthouse lamp comes on with the lanterns
  // camera follow (player stays centered)
  updateCamOffset(dt);
  // the focus point follows the player; the camera orbits it at the current tilt,
  // so a tilt change is one smooth swing instead of a turn followed by a drop
  camFocus.lerp(camPos.set(camClampX(player.pos.x + spots.camLean(player.pos.x, player.pos.z)), player.y, player.pos.z), 1 - Math.exp(-dt * 6));   // FISHING: by the river the view leans left so its far bank shows
  camera.position.copy(camFocus).add(camOffset);
  _camLook.set(camFocus.x, camFocus.y + 1.0, camFocus.z);
  if (ward.blend > 0) { wardCam(_wardPos, _wardLook); const e = ward.blend * ward.blend * (3 - 2 * ward.blend); camera.position.lerp(_wardPos, e); _camLook.lerp(_wardLook, e); }
  if (settings.debug && window.__camAbs) { const c = window.__camAbs; camera.position.set(c[0], c[1], c[2]); _camLook.set(c[3], c[4], c[5]); if (c[6] && camera.fov !== c[6]) { camera.fov = c[6]; camera.updateProjectionMatrix(); } }   // SCENERY: a free camera for the low title-screen views (debug only)
  if (settings.debug && window.__camPeek) { const c = window.__camPeek, h = body.root.position; camera.position.set(h.x + c[0], h.y + c[1], h.z + c[2]); _camLook.set(h.x + (c[5] || 0), h.y + c[3], h.z + (c[4] || 0)); }   // debug: close-up for mockups and tests
  camera.lookAt(_camLook);
  sun.target.position.set(player.pos.x, 0, player.pos.z - 4);
  const sp = TOD[todKey].sunPos; sun.position.set(player.pos.x + sp[0], sp[1], player.pos.z - 4 + sp[2]);
  fillLight.position.set(camera.position.x, camera.position.y + 2, camera.position.z); fillLight.target.position.set(player.pos.x, 0.8, player.pos.z);
  // monsters
  for (const m of monsters) updateMonster(m, dt);
  updateOccluders(dt);
  // bobbing boats / foam
  for (const b of bobbers) {
    b.o.position.y = b.ride ? b.base + waveY(b.o.position.x, b.o.position.z, elapsed) : b.base + Math.sin(elapsed * b.sp + b.ph) * b.amp;
    if (b.ride) b.o.rotation.x = (waveY(b.o.position.x, b.o.position.z + 0.8, elapsed) - waveY(b.o.position.x, b.o.position.z - 0.8, elapsed)) * 0.4;
    if (b.rock) b.o.rotation.z = Math.sin(elapsed * b.sp * 0.8 + b.ph) * b.rock;
  }
  // fish
  nextFish -= dt;
  if (!fishJump && nextFish <= 0) { nextFish = 5 + Math.random() * 5; startFishJump(-6 + Math.random() * 14, -8 - Math.random() * 6); }
  if (fishJump) {
    const f = fishJump; f.t += dt; const u = f.t / f.dur;
    f.mixer.update(dt);
    f.holder.position.set(f.x + f.dx * u, WATER_Y + Math.sin(Math.PI * u) * 1.3 - 0.1, f.z + f.dz * u);
    f.holder.rotation.set(0, -f.dir + Math.PI / 2, 0);
    f.holder.rotateX(-(Math.cos(Math.PI * u)) * 0.9);
    if (u >= 1) { addSplash(f.holder.position.x, f.holder.position.z); scene.remove(f.holder); fishJump = null; }
  }
  for (let i = splashes.length - 1; i >= 0; i--) {
    const s = splashes[i]; s.t += dt; const k = 1 + s.t * 5; s.ring.scale.set(k, k, k); s.ring.material.opacity = Math.max(0, 0.9 - s.t * 1.1);
    if (s.t > 0.85) { scene.remove(s.ring); s.ring.material.dispose(); splashes.splice(i, 1); }
  }
  // swing arc
  if (arc.visible) { arc.userData.t += dt; const t = arc.userData.t; arc.material.opacity = Math.max(0, 0.85 - t * 3); arc.rotation.y += dt * 9; if (t > 0.3) arc.visible = false; }
  // damage numbers
  for (let i = dmgEls.length - 1; i >= 0; i--) {
    const d = dmgEls[i]; d.t += dt; const p = d.p.clone(); p.y += d.t * 1.1; p.project(camera);
    d.el.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; d.el.style.top = ((1 - p.y) / 2 * innerHeight) + 'px';
    d.el.style.opacity = String(Math.max(0, 1 - d.t * 1.2));
    if (d.t > 0.9) { d.el.remove(); dmgEls.splice(i, 1); }
  }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.hidden = true; }
  if (catchT > 0) { catchT -= dt; if (catchT <= 0) hideCatch(); }
  tickLevelUp();
  goals.frame(dt);   // GOALS
  gateToastT -= dt;
  updateHiggins(dt);
  updateFishel(dt); updatePike(dt);
  updateRosa(dt);
  tickClock();
  saveTimer += dt; if (saveTimer > 5) { saveTimer = 0; persistNow(); }
}
let arc;
function makeArc() {
  arc = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 6, 24, Math.PI * 0.9),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
  arc.rotation.x = -Math.PI / 2; arc.visible = false; scene.add(arc);
}
function swing(dirYaw = player.yaw) {
  arc.position.set(player.pos.x, (player.y ?? 0) + 0.9, player.pos.z);
  arc.rotation.set(-Math.PI / 2, 0, -dirYaw + Math.PI * 0.05);
  arc.userData.t = 0; arc.visible = true;
}
function hitMonster(m, dmg) {
  if (m.dead > 0) return;
  m.hp -= dmg; m.flash = 0.18;
  damageText(m.pos.clone().setY(groundY(m.pos.x, m.pos.z) + m.h + 0.2), dmg);
  const away = m.pos.clone().sub(player.pos).setY(0).normalize();
  m.pos.addScaledVector(away, 0.35);
  if (m.hp <= 0) { m.dead = 4.0; toast('+3 Goo · +12 coins'); }
}
function updateMonster(m, dt) {
  m.mixer.update(dt);
  if (m.dead > 0) {
    m.dead -= dt;
    const k = Math.max(0, 1 - (4.0 - m.dead) * 3);
    m.holder.scale.setScalar(k + 0.0001);
    if (m.dead <= 0) { m.hp = m.max; m.pos.set(m.home.x + (Math.random() - 0.5) * 4, 0, m.home.z + (Math.random() - 0.5) * 3); }
    m.holder.position.set(m.pos.x, groundY(m.pos.x, m.pos.z), m.pos.z);
    return;
  }
  m.hop += dt;
  const period = 1.1;
  const ph = (m.hop % period) / period;
  if (ph < dt / period + 0.001) {
    const toP = player.pos.clone().sub(m.pos); const d = toP.length();
    if (d < 6 && player.pos.z > FENCE_Z + 0.5) m.target.copy(m.pos).addScaledVector(toP.normalize(), Math.min(0.9, d - 1.2));
    else m.target.set(m.home.x + (Math.random() - 0.5) * 4, 0, m.home.z + (Math.random() - 0.5) * 3);
  }
  const moving = ph < 0.55;
  if (moving) m.pos.lerp(new THREE.Vector3(m.target.x, 0, m.target.z), Math.min(1, dt * 2.2));
  m.pos.z = Math.max(FENCE_Z + 0.8, m.pos.z);
  const hopY = moving ? Math.sin(ph / 0.55 * Math.PI) * 0.35 : 0;
  const squash = moving ? 1 + Math.sin(ph / 0.55 * Math.PI) * 0.12 : 1 - Math.sin((ph - 0.55) / 0.45 * Math.PI) * 0.1;
  m.holder.position.set(m.pos.x, groundY(m.pos.x, m.pos.z) + hopY, m.pos.z);
  m.holder.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
  const toP = player.pos.clone().sub(m.pos); m.holder.rotation.y = Math.atan2(toP.x, toP.z);
  if (m.flash > 0) m.flash -= dt;
  const f = Math.max(0, m.flash) / 0.18;
  m.root.traverse(o => { if (o.isMesh && o.material.emissive) o.material.emissive.setRGB(f, f, f); });
}

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  if (store.frame(dt)) { requestAnimationFrame(frame); return; }   // STORE: inside the shop, it draws the frame
  update(dt);
  syncPuppets();
  renderer.render(scene, camera);
  updateCropTags();
  drawLoupe();
  requestAnimationFrame(frame);
}

// ---------- boot ----------
(async function boot() {
  resize();
  try {
    await loadAll();
  } catch (err) {
    document.getElementById('loadTxt').textContent = 'Could not load the models. Please reload.';
    console.error(err); return;
  }
  renderCropIcons(CROP_ORDER.filter(id => CROPS[id].kit !== 'crops'));   // turnip is already loaded
  buildWorld();
  makeArc();
  makeMarker();
  makeLine();
  makeWorldRod(); makeFarmTools();
  makeMoonPath();
  bodies = { m: makeBody('m'), f: makeBody('f') };
  for (const b of Object.values(bodies)) setLook(b, S.look);
  setBody(S.body || 'm');
  makeHiggins();
  makeFishel();
  makePike();
  ensureRosa();
  // STORE: everything the store borrows from this file, in one place
  store.init({ THREE, scene, camera, renderer, M, SCALE, groundY, player, joy, dlg, get S() { return S; }, get body() { return body; }, NO_TILL, ICON, lanternLights, farmToolMesh,
    commit, addItem, invCount, toast, audio, svg, showDialog, closeDialog, setUse, makeBody, setLook, kHat, anim, syncPuppet, locomote, buildDecorMesh, hasTool, renderHotbar, currentTOD,
    refreshFarmTray: () => { if (farm.mode === 'tray' || farm.mode === 'ready') renderFarmTray(); },
    busy: () => decor.on || farm.mode !== 'off' || fishing.state !== 'idle' || ward.on || dlg.open,
    exposure: () => TOD[todKey].exp,
    snapCamera: () => { camFocus.set(camClampX(player.pos.x), player.y || 0, player.pos.z); } });
  // ANIMALS: everything animals.js borrows from this file (before saved decor is put back: the coop is decor)
  goals.init({ THREE, scene, camera, player, get S() { return S; }, commit, addItem, toast, audio, svg, renderHotbar, floorY, fishing, DOCK, BOARD,   // GOALS
    // the order goal: if nothing on the board can be filled, Higgins's order becomes the turnips you're carrying (one if you have none)
    easyOrder: () => {
      const st = S.orders; if (!st || !st.slots || st.slots.some(o => orderReady(o))) return;
      const i = st.slots.findIndex(o => o.who === 'higgins'); if (i < 0) return;
      const n = Math.max(1, Math.min(2, invCount('turnip'))), o = st.slots[i];
      if (!o.empty && o.items.length === 1 && o.items[0][0] === 'turnip' && o.items[0][1] === n) return;
      st.slots[i] = { id: st.next++, who: 'higgins', items: [['turnip', n]], coins: Math.max(10, Math.round(ITEMS.turnip.price * n * ORDERS.payMult / 5) * 5), extra: { kind: 'heart' } };
      commit(); updateBoardNotes(); if (!document.getElementById('orders').hidden) renderOrders(); renderTrack();
    },
    growing: () => { let f = null; plots.forEach(p => { if (!f && p.save.crop && !p.grown) f = p.save; }); return f; },   // a crop that's still growing (for the fertilizer goal)
    invCount, hasPet: (k) => !!(S.pets && S.pets.list && S.pets.list.some(q => q.k === k)),
    ripeIn: () => { let best = null; plots.forEach(p => { if (p.save.crop) { const left = p.grown ? 0 : Math.max(0, p.save.plantedAt + growMs(p.save.crop) - Date.now()); if (best === null || left < best) best = left; } }); return best; },   // ms until the first crop is ready (0 = one is ready, null = nothing planted)
    ripen: (wait = 2500) => { let n = 0; plots.forEach(p => { if (p.save.crop && !p.grown) { const due = Date.now() - growMs(p.save.crop) + wait; if (p.save.plantedAt > due) { p.save.plantedAt = due; n++; } } }); if (n) commit(); return n; },   // the harvest goal: whatever is growing is ready in a moment
    npc: (k) => ({ higgins, fishel, rosa, pike })[k], bucketPos: spots.bucketPos, bucketCount: spots.bucketCount,
    dlgOpen: () => dlg.open, sheetOpen: () => [...document.querySelectorAll('.sheet')].some(x => !x.hidden), wardOn: () => ward.on,
    titleOn: () => document.body.classList.contains('inmenu'), playing: () => catchT <= 0, farm, farmPicked: () => farmPicked(),
    busy: () => busyForLevelCard() || decor.on || !document.getElementById('levelUp').hidden || document.body.classList.contains('inmenu') });
  animals.init({ THREE, scene, camera, M, SCALE, groundY, player, get S() { return S; }, settings, ICON, cropIcon, plots, commit, addItem, invCount, addXP, toast, audio, svg, renderHotbar, currentTOD,
    respawnDecor: (rec) => { despawnDecor(rec); spawnDecor(rec); }, fenceZ: () => FENCE_Z, wet: (x, z) => spots.onBank(x, z), busy: () => decor.on || farm.mode !== 'off' || fishing.state !== 'idle' || ward.on || dlg.open });
  // PETS: everything pets.js borrows from this file (before saved decor is put back: the fish bowl is decor)
  pets.init({ THREE, scene, camera, groundY, floorY, parseGLB, player, get S() { return S; }, ICON, svg, commit, addItem, invCount, addXP, toast, audio, renderHotbar, currentTOD, walkable, solid: petSolid, fishing, addSplash, WATER_Y, DOCK,
    npcs: () => [higgins, fishel, pike, rosa].filter(Boolean).map(n => n.pos), busy: () => decor.on || farm.mode !== 'off' || ward.on || dlg.open || store.inside(),
    removeDecor: (rec) => { despawnDecor(rec); const i = S.decor.indexOf(rec); if (i >= 0) S.decor.splice(i, 1); },
    toggleNight: () => { if (!settings.debug) { toast('Night / day works in the Debug harbor'); return; } settings.todOverride = currentTOD() === 'night' ? 'day' : 'night'; storeSettings(settings); setTOD(currentTOD()); } });
  // FISHING: everything the fishing files borrow from this file, in one place
  { const _fp = new THREE.Vector3(); let sheets = null;
    const anySheet = () => { sheets = sheets || [...document.querySelectorAll('.sheet')]; return sheets.some(x => !x.hidden); };
    const fishApi = { goalEvent: (n) => goals.event(n), THREE, scene, camera, M, place, groundY, WATER_Y, waterMat, player, townFence, ICON, svg, toast, commit, addItem, addXP, audio, renderHotbar, openSheet, ensureFish, addSplash, fishIcon, todayKey,
      get S() { return S; }, debug: () => settings.debug, cloneFish: (n) => SkeletonUtils.clone(M.fish[n].scene),
      project: (x, y, z) => { _fp.set(x, y, z).project(camera); return { x: (_fp.x + 1) / 2 * innerWidth, y: (1 - _fp.y) / 2 * innerHeight, z: _fp.z }; },
      waterAt: (nx, ny) => { _fp.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize(); if (_fp.y > -0.05) return null; const t = (WATER_Y - camera.position.y) / _fp.y; return { x: camera.position.x + _fp.x * t, z: camera.position.z + _fp.z * t }; },
      hasBait: () => !!bestBait(), holdingRod: () => tool === 'rod', fishelPos: () => fishel && fishel.pos,
      busy: () => decor.on || ward.on || dlg.open || store.inside() || anySheet(), quiet: () => decor.on || ward.on || dlg.open || store.inside() };
    // TACKLE: what the rods file borrows on top of that
    Object.assign(fishApi, { parseGLB, DOCK, bodies: () => Object.values(bodies), worldRod: () => worldRod && { rod: worldRod, tip: worldRodTip },
      fishingBusy: () => fishing.state !== 'idle', fishingPlace: () => fishing.place, freshNear: (x, z) => !!spots.freshTarget(x, z) });
    spots.init(fishApi); dex.init(fishApi); tackle.init(fishApi); spots.sweepSave();
    reel.init({ ...fishApi, fishing, joy, useBtn, setFish, reelIn, landFish, elapsed: () => elapsed, debug: () => !!settings.debug, perk: () => tackle.perks(fishing.place).reel }); }   // REEL
  restorePlots();
  restoreDecor();
  ensureCropsInUse();
  initWeather();
  if (S.pos) player.pos.set(S.pos[0], 0, S.pos[1]);
  else player.yaw = Math.atan2(higgins.pos.x - player.pos.x, higgins.pos.z - player.pos.z);
  renderHotbar(); showHeldTool();
  if (FEATURES.combat) {
    makeMonster('Green_Blob', 2.3, 10.4, 0.75);
    makeMonster('Pink_Blob', -2.4, 11.6, 0.7);
    makeMonster('Mushnub_Evolved', 1.6, 14.0, 1.1);
  }
  setTOD(currentTOD()); tickClock(); tickOrders(); setInterval(tickOrders, 5000); updateHUD();
  updateCamOffset(0, true); camFocus.set(camClampX(player.pos.x), player.y || 0, player.pos.z); camera.position.copy(camFocus).add(camOffset);
  document.getElementById('loading').hidden = true;
  // main menu (v0.1.10, layout B) — skipped once right after picking a save from it
  let skip = false; try { skip = sessionStorage.getItem('tidewell.skipMenu') === '1'; sessionStorage.removeItem('tidewell.skipMenu'); } catch (e) {}
  if (skip) startGame(); else showMainMenu();
  if (S.look && !S.look.blank && S.look.pack === undefined) { S.look.pack = 'day'; S.look.packColor = '#f2a531'; setLook(body, S.look); }   // v0.1.150: looks made before the backpack get one (take it off in the Wardrobe)
  syncPackBtn();
  window.__ready = true;
  window.__tidewell = { sit, get pike() { return pike; }, get worldRod() { return worldRod; }, get rodState() { return rodState; }, scenery, pets, get merchant() { return merchant; }, THREE, scene, sun, hemi, TOD, camera, player, get S() { return S; }, fishing, settings, decor, cropIcon, farm, get body() { return body; }, fishIcon, spots, dex, tackle, reel, farmToolMesh, plots, lotView, get clr() { return clr; }, inRock, get dig() { return digModels; }, setLook: (l) => { for (const b of Object.values(bodies)) setLook(b, l); }, joy };   // used by tools/ (screenshots, tests)
  clock.getDelta();
  requestAnimationFrame(frame);
  // Everything else loads quietly in the background, one pack at a time so the game stays smooth:
  // fish first, then every crop (cheapest seeds first). It's all in long before a player can buy
  // seeds or land a catch, so nothing new ever shows a spinner or a stand-in. (The spinner and
  // sprout stay only as a safety net for a very slow connection.)
  setTimeout(async () => {
    await ensureFish();
    animals.start();   // ANIMALS: hens, eggs and the bubble are built here, in the background (before the shop's inside, which lists them)
    pets.start();   // PETS: the pet and its buttons, built in code (no pack to load)
    await tackle.preload();   // TACKLE: rods, worm, lure, jetty and steps load quietly right after the fish
    await store.preload();   // STORE: the inside of the shop
    for (const id of CROP_ORDER) await ensureCrop(id);
  }, 1500);
})();
