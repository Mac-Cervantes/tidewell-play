// Tidewell — main game (BETA). Game data lives in data.js, saving in save.js.
import * as THREE from 'three';
import { GLTFLoader } from '../lib/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../lib/addons/utils/SkeletonUtils.js';
import * as store from './store.js';   // STORE: the walk-in general store (the inside loads later from interior.js)
import { mergeVertices } from '../lib/addons/utils/BufferGeometryUtils.js';
import { VERSION_LABEL, RARITY, FISH, CROPS, CROP_ORDER, ITEMS, SHOP, DEBUG, BAIT, BAIT_ORDER, DECOR, DECOR_ORDER, STARTER_KIT, ORDER_FOLK, ORDERS, makeOrder, CARGO, TOOLS as GEAR, TOOL_ORDER as GEAR_ORDER, CLEAR_NEEDS, HIT_SECONDS, DIG, XP, LEVELS, xpInto, levelFor, rankFor, unlockLevel, rollFish, seasonInfo, timeOfDay, SIGHTS, rollSize } from './data.js';
import { paintSkin, SKIN, HAIR_COLORS, CLOTH } from './look.js';
import { HAIR3D, hairFor } from './hair3d.js';
import { wearList, wearFor, hairUnderHat, HATS } from './wear3d.js';
import CHIPS from './wardrobe-chips.js';
import { loadSave, storeSave, resetSave, peekSave, loadSettings, storeSettings, storageWorks } from './save.js';
import { audio } from './audio.js';   // all sound lives in audio.js; the calls below are one-line hooks
import { weather } from './weather.js';   // rain lives in weather.js; hooks: initWeather(), weather.frame(), renderWx()
import * as animals from './animals.js';   // ANIMALS (try/chickens): coop, hens and eggs live in animals.js; hooks marked ANIMALS below
import * as anim from './anim.js';   // ANIM (try/run): walk/run/idle live in anim.js; hooks marked ANIM below
import * as spots from './fishing-spots.js';   // FISHING (try/fishing): the river, the lake and the bait rule; hooks marked FISHING below
import * as dex from './fishdex.js';            // FISHING: the fish book, hints and sightings
import * as tackle from './tackle.js';          // TACKLE (try/fishing): rods, cast feels, jetty, dock steps; hooks marked TACKLE below

// Features switched on in this build. Combat (monsters, the Warrior) arrives in v0.2.0.
const FEATURES = { combat: false };
// the version label lives in data.js only; fill every place it's shown
for (const id of ['ver', 'loadVer']) document.getElementById(id).textContent = VERSION_LABEL;

// ---------- save state ----------
let settings = loadSettings();
audio.bindSettings(settings, storeSettings);
let S = loadSave(settings.debug);
seedLevel(S);
clearShopGround(S);
// v0.1.55: Nell's store and Rosa's moved cart stand on ground that older saves may have built on. Decor there goes back
// into the bag and plots there are dropped (Mac). Same circles as the no-till zones (store.js; ROSA_CART below).
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
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera; sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 80;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// ---------- loading ----------
const manager = new THREE.LoadingManager();
const loader = new GLTFLoader(manager);
const MODELS = {
  town: ['stall-red', 'stall-green', 'stall-bench', 'fountain-round', 'lantern', 'fence', 'fence-gate', 'tree', 'tree-high-round',
    'wall-wood-door', 'wall-wood-window-shutters', 'wall-wood', 'wall-wood-corner', 'roof-gable', 'roof-gable-end', 'cart', 'banner-red', 'chimney'],
  pirate: ['structure-platform-dock', 'structure-platform-dock-small', 'boat-row-small', 'boat-row-large', 'ship-small', 'ship-medium', 'palm-detailed-bend',
    'palm-detailed-straight', 'barrel', 'crate', 'crate-bottles', 'structure', 'structure-roof', 'rocks-sand-a', 'flag-high-pennant', 'chest'],
  nature: ['tree_default', 'tree_oak', 'tree_detailed', 'tree_default_dark', 'tree_oak_dark', 'tree_pineRoundA', 'plant_bush', 'plant_bushLarge',
    'flower_redA', 'flower_yellowA', 'flower_purpleA', 'grass_large', 'rock_largeA', 'rock_smallA', 'mushroom_redGroup', 'crops_cornStageD',
    'crops_dirtRow', 'stump_round', 'log', 'crops_leafsStageA', 'crops_leafsStageB', 'crop_turnip'],
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
const cropOf = (itemId) => { const it = ITEMS[itemId]; return it && (it.kind === 'crop' ? itemId : it.kind === 'seed' ? it.crop : null); };
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
function groundColor(x, z) {
  const c = new THREE.Color();
  const n = noise(x * 2.1, z * 2.3);
  c.copy(n > 0.1 ? GC.grass : GC.grass2);
  const wildT = smooth(FENCE_Z + 0.05, FENCE_Z + 1.05, z);
  if (wildT > 0) c.lerp(n > 0 ? GC.wild : GC.wild2, wildT);
  const onPath = Math.abs(x - 0.0 + Math.sin(z * 0.35) * 0.3) < 1.05 && z > -3.2 && z < LOTS_BACK + 1.5;
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
             vec2 v = (p - R.xy) * vec2(1.0, 0.42); float ang = atan(v.y, v.x);
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
const FISHEL_STALL = { x: 4.6, z: -1.8 };
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
    if (!o.userData.furl) { const bb = new THREE.Box3().setFromObject(o); o.updateWorldMatrix(true, false); const top = o.worldToLocal(new THREE.Vector3(0, bb.max.y, 0)).y; o.userData.furl = { y: o.position.y, top, sy: o.scale.y }; }
    const f = o.userData.furl, s = 1 - 0.86 * k;
    o.scale.y = f.sy * s; o.position.y = f.y + f.top * f.sy * (1 - s);
  });
}
const SHIP_AT = { x: 5.7, z: -11.2 }, SHIP_OUT = { x: 12, z: -34 };
const DOCK = { x: 2.4, half: 0.97, zNear: -3.2, zFar: -11.1 };
function onDock(x, z) { return Math.abs(x - DOCK.x) < DOCK.half && z <= DOCK.zNear && z >= DOCK.zFar; }
// the fence between your land and the wilds; it moves back each time you buy a lot (decision 69, layout D)
const FENCE_Z0 = 7.55;
let FENCE_Z = FENCE_Z0;
const townFence = [];   // fence pieces and gate banners, moved together
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
      if (Math.abs(cx) < 0.3) { emit(t, -PLANK / 2); emit(t, PLANK / 2); }   // the middle plank, twice
      else emit(t, Math.sign(cx) * PLANK / 2);
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
  for (let i = 0; i < 4; i++) dockParts.push(widenDock(place('pirate', 'structure-platform-dock', DOCK.x, -4.4 - i * 2.12, { y: deckY, r: 0 })));
  const fx = DOCK.x + 0.95;
  const flag = place('pirate', 'flag-high-pennant', fx, -10.9, { y: 0, s: 0.8 });
  scene.updateMatrixWorld(true); flag.position.y = floorY(fx, -10.9);
  // rowboats pulled up on the shore, side by side (Mac)
  for (const [n, x, z, r] of [['boat-row-large', -9.6, -3.75, 0.1], ['boat-row-small', -7.9, -3.7, -0.12]]) {
    const b = place('pirate', n, x, z, { r }); b.position.y = groundY(x, z) + 0.02; b.rotation.x = -0.05;
  }
  // the merchant ship, tied up along the dock (cargo boat, decision 51)
  merchant = place('pirate', 'ship-medium', SHIP_AT.x, SHIP_AT.z, { y: WATER_Y - 0.25, r: 0, s: 0.85 });
  bobbers.push({ o: merchant, base: WATER_Y - 0.22, ride: true, sp: 0.7, ph: 0.6, rock: 0.015 });
  // ripple rings: dock posts, the ship's hull, the rocks (x, z, radius)
  // ripples around the ship while it's tied up
  waterUniforms.uRings.value[0].set(SHIP_AT.x, SHIP_AT.z, 1.45);   // one oval from the middle of the ship (Mac)
  furlSails(merchant, 1);   // tied up: sails rolled up (Mac)
  const ship = place('pirate', 'ship-small', -15, -27, { y: WATER_Y - 0.2, r: 0.9, s: 0.9 });
  bobbers.push({ o: ship, base: WATER_Y - 0.15, ride: true, sp: 0.8, ph: 2, rock: 0.03 });
  place('pirate', 'palm-detailed-bend', -5.2, -3.9, { r: 2.4, s: 1.0 });
  place('pirate', 'palm-detailed-straight', 7.8, -3.6, { r: 0.3, s: 1.0 });
  place('pirate', 'palm-detailed-bend', 10.5, -4.6, { r: -0.6, s: 0.85 });
  place('pirate', 'rocks-sand-a', -8.0, -6.6, { s: 0.6, r: 1 });
  place('pirate', 'rocks-sand-a', 8.5, -6.8, { s: 0.5, r: 2.5 });

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
  const T = (n, x, z, s = 1, r = rnd() * 6.28) => place('nature', n, x, z, { s, r });
  [['tree_oak', -12, 0.5], ['tree_default', 10.6, 3.4], ['tree_detailed', 11.8, -0.4], ['tree_oak', -12.5, 5.6],
   ['tree_default', 13.4, 5.8], ['tree_detailed', -10.8, -1.8], ['tree_pineRoundA', 14.5, 1.2], ['tree_oak', 9.4, 6.2]]
    .forEach(([n, x, z]) => T(n, x, z, 1.15 + rnd() * 0.2));
  const flowers = ['flower_redA', 'flower_yellowA', 'flower_purpleA'];
  for (const [cx, cz] of [[3.6, 5.6], [5.8, 1.6], [7.2, 1.4], [-5.5, 4.4], [1.8, 1.2], [-1.6, 6.6], [6.0, 5.8]]) {
    for (let k = 0; k < 5; k++) wildPlant(T(flowers[(((k + Math.round(cx)) % 3) + 3) % 3], cx + (rnd() - 0.5) * 1.2, cz + (rnd() - 0.5) * 0.8, 1.1));
  }
  for (const [bx, bz] of [[-3.2, 6.8], [3.4, 6.9], [-6, 6.9], [6.5, 6.9], [-10, 6.8], [10, 6.8], [8.4, 2.4], [-11, 3]])
    wildPlant(T(rnd() > 0.5 ? 'plant_bushLarge' : 'plant_bush', bx, bz, 1.2));

  buildLots(T);
  buildCargo();
  refreshDig();

  // --- the wilds past the gate ---
  const wildTrees = [];
  for (let i = 0; i < 40; i++) {
    const x = (rnd() - 0.5) * 34, z = LOTS_BACK + 1.2 + rnd() * 16;
    if (Math.abs(x) < 2.6) continue;
    wildTrees.push([x, z]);
  }
  wildTrees.forEach(([x, z], i) => occluder(T(i % 3 === 0 ? 'tree_oak_dark' : 'tree_default_dark', x, z, 1.1 + rnd() * 0.5)));
  for (let i = 0; i < 26; i++) {   // woods down both sides of the lots
    const sd = rnd() > 0.5 ? 1 : -1;
    occluder(T(rnd() > 0.4 ? 'tree_default_dark' : 'tree_oak_dark', sd * (15.8 + (sd < 0 ? 1.3 : 0) + rnd() * 6)   /* FISHING: the left woods start behind the river */, FENCE_Z0 + 0.6 + rnd() * (LOTS_BACK - FENCE_Z0), 1.1 + rnd() * 0.5));
  }
  for (let i = 0; i < 34; i++) {
    const x = (rnd() - 0.5) * 20, z = LOTS_BACK + 0.8 + rnd() * 9;
    if (Math.abs(x) < 1.4) continue;
    const pick = ['grass_large', 'mushroom_redGroup', 'grass_large', 'stump_round', 'plant_bush', 'grass_large', 'log', 'mushroom_redGroup'][i % 8];
    T(pick, x, z, pick === 'grass_large' ? 1.6 : 1.2);
  }
  for (const [x, z] of [[-5.6, 10.4], [5.9, 12.6], [-6.4, 14.2], [6.8, 9.6], [-4.8, 16.4], [5.2, 16.8]].map(([a, b]) => [a, b + LOTS_BACK - 7.6]))
    occluder(T(rnd() > 0.5 ? 'tree_oak_dark' : 'tree_default_dark', x, z, 1.25 + rnd() * 0.3));
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
    m.position.copy(head).add(new THREE.Vector3(0, y * H - 0.06, 0)); m.castShadow = true;
    scene.add(m); m.updateMatrixWorld(true); hb.attach(m);
  }
}
const NPC_LOOKS = {
  higgins: { skin: '#ffd9c2', hair: 'buzz', hairColor: '#9aa3ad', eyes: 'dot', mouth: 'smile', beard: 'mustache', top: 'long', topColor: '#6a5a8c', bottom: 'pants', bottomColor: '#2a3354', shoes: '#2b2b2b' },
  fishel: { skin: '#d9825b', hair: 'buzz', hairColor: '#2a1712', eyes: 'happy', mouth: 'grin', beard: 'beard', top: 'long', topColor: '#f2c230', bottom: 'pants', bottomColor: '#2a3354', shoes: '#3a3a3a', hat: 'bucket', hatColor: '#f2c230', hatColor2: '#d9a81e' },
  rosa: { skin: '#b4643f', hair: 'long', hairColor: '#2a1712', eyes: 'big', mouth: 'smile', blush: true, top: 'tee', topColor: '#e8846a', bottom: 'pants', bottomColor: '#f4e6c8', shoes: '#7a4a2a', hat: 'sunhat', hatColor: '#f2d38a', hatColor2: '#e8846a' },
};
const NPC_HATS = {
  higgins: [0x2b2140, [[0.17, 0.17, 0.015, 0], [0.105, 0.105, 0.22, 0.11]]],   // top hat (Fishel's bucket hat and Rosa's sun hat are real 3D hats now, in their looks)
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
  for (const b of [body, higgins && higgins.b, fishel && fishel.b, rosa && rosa.b]) if (b && b.root.visible) { syncPuppet(b); anim.posture(b, b === body ? busy : 0); }
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
}

// ---------- wardrobe (decision 63: mockup A + swipe to turn) ----------
const DEFAULT_LOOK = { skin: '#f5b48f', hair: 'short', hairColor: '#4d2414', eyes: 'dot', mouth: 'smile', blush: true, top: 'stripe', topColor: '#ffffff', topColor2: '#3e8fe0', bottom: 'shorts', bottomColor: '#e8a24a', shoes: '#f2654c' };
const WARD_TABS = ['Skin', 'Hair', 'Hat', 'Face', 'Top', 'Bottom', 'Shoes'];
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
  S.look = { ...ward.look }; ward.on = false; ward.drag = null;
  document.body.classList.remove('inward');
  for (const id of ['wardrobe', 'wardSwipe', 'wardHint']) document.getElementById(id).hidden = true;
  paintPlayer(); commit();
  if (ward.first && !S.introDone && !settings.debug) setTimeout(runIntro, 500);
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
const ANIM_LOOK = 'r';
// move every player body at ground speed v (m/s); the legs keep pace with the ground
function locomote(v, dt) { for (const b of Object.values(bodies)) anim.locomote(b, v, dt); }
// play a one-shot on the upper body while the legs keep walking
function upperOneShot(key, dur) { for (const b of Object.values(bodies)) anim.upperOneShot(b, key, dur); }
function tickUpper(dt) { for (const b of Object.values(bodies)) anim.tickUpper(b, dt); }
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
  else if (quick && e.type === 'pointerup') { if (decor.on) decorTap(e.clientX, e.clientY); else if (!animals.tap(e.clientX, e.clientY)) handleTap(e.clientX, e.clientY); }   // ANIMALS: a tap on the coop or pond opens its card
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
  board: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M7 20l1-4M17 20l-1-4M7 8h4M7 11h6M14 8h3"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8"/>',
  bobber: '<path d="M12 2v4"/><circle cx="12" cy="13" r="6"/><path d="M6 13h12"/>',
  reel: '<circle cx="11" cy="12" r="6.5"/><circle cx="11" cy="12" r="2"/><path d="M17.5 12H21"/><path d="M21 9.5v5"/>',
  shears: '<path d="M12 12.5L8 3M12 12.5L16 3"/><circle cx="8.5" cy="17.5" r="3.2"/><circle cx="15.5" cy="17.5" r="3.2"/><path d="M12 12.5L9.6 14.6M12 12.5l2.4 2.1"/>',
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
  hotbar.innerHTML = TOOLS.map(t => `<button class="slot${t.id === tool ? ' on' : ''}" data-tool="${t.id}" aria-label="${t.name}${t.id === 'rod' ? ', bait: ' + (bb ? BAIT[bb].name : 'none') : ''}" aria-pressed="${t.id === tool}">${icon(t)}${count(t)}${badge(t)}</button>`).join('');
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
const CAST_DIST = 7.5;   // how far a tap-cast lands, in metres
const fishing = { state: 'idle', t: 0, land: new THREE.Vector3(), from: new THREE.Vector3(), wait: 3, dist: 0, a: 0.75 };
function bestBait() { return BAIT_ORDER.find(b => invCount(b) > 0) || null; }   // FISHING: no bare hook any more
function setFish(st) { fishing.state = st; fishing.t = 0; }
function castTarget() {
  const ft = player.pos.z > -2.6 ? spots.freshTarget(player.pos.x, player.pos.z) : null; if (ft) return new THREE.Vector3(ft.x, 0, ft.z);   // FISHING: by the river or lake, cast there
  // aim the way you face; if you face inland, aim out to sea
  const f = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  if (onDock(player.pos.x, player.pos.z)) { if (Math.abs(f.x) < 0.35 && f.z > -0.5) f.set(Math.sign(f.x || 1), 0, -0.4); }
  else if (f.z > -0.3) f.set(f.x * 0.5, 0, -1);
  f.normalize();
  const p = player.pos.clone().addScaledVector(f, CAST_DIST + tackle.seaReach());   // TACKLE: the sea cast zips further out
  p.z = Math.min(p.z, -5.4);
  if (Math.abs(p.x - DOCK.x) < DOCK.half + 0.7 && p.z > DOCK.zFar - 1) p.x = DOCK.x + Math.sign(p.x - DOCK.x || 1) * (DOCK.half + 1.0);
  return p;
}
function beginCast(target) {
  if (!bestBait()) { toast(spots.noBaitWhy()); return; }   // FISHING: no bait, no cast
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
function landFish() {
  if (fishing.state !== 'bite') return;
  const fish = rollFish(fishing.bait || 'worm', todKey, Math.random, { place: fishing.place, rain: weather.level > 0 });   // FISHING: by place, season and rain
  fishing.rec = dex.record(fish, rollSize(fish));   // FISHING: its size, and your biggest
  setFish('catch'); audio.play('catch');
  if (!fishIcon[fish.id]) startFishJump(fishing.land.x, fishing.land.z, fish);   // picture not ready (very slow connection): the old 3D jump
  else addSplash(fishing.land.x, fishing.land.z);
  addItem(fish.id, 1); S.caught[fish.id] = (S.caught[fish.id] || 0) + 1; addXP(XP.catch + (S.caught[fish.id] === 1 ? XP.newFish : 0)); commit();
  showCatch(fish);
}
function reelIn() { if (fishing.state !== 'idle' && fishing.state !== 'reel') { setFish('reel'); audio.play('reel'); } }
function updateFishing(dt) {
  const F = fishing; F.t += dt;
  if (tool !== 'rod' && F.state !== 'idle') setFish('idle');
  if (player.moving && ['flick', 'flight', 'wait', 'bite'].includes(F.state)) reelIn();
  const e = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  switch (F.state) {
    case 'idle': F.a = 0.75 + Math.sin(elapsed * 1.6) * 0.03; break;
    case 'flick': F.a = 1.9 + (0.15 - 1.9) * e(F.t / 0.13); if (F.t > 0.13) { worldRodTip.getWorldPosition(F.from); setFish('flight'); } break;
    case 'flight': F.a = 0.15; if (F.t > tackle.castShape(F.place, F.dist).dur) { addSplash(F.land.x, F.land.z); if (tackle.castKind(F.place) === 'zip') setTimeout(() => addSplash(F.land.x, F.land.z), 110); audio.play(tackle.landSound(F.place));   /* TACKLE: flight time, splash and sound by cast feel */ const bw = BAIT[F.bait || 'worm'].bite; F.wait = settings.debug && settings.instantBite ? DEBUG.biteSeconds : (bw[0] + Math.random() * (bw[1] - bw[0])) * tackle.perks(F.place).bite /* TACKLE: faster rods */; setFish('wait'); } break;
    case 'wait': F.a = 0.2 + Math.sin(elapsed * 2) * 0.02; if (F.t > F.wait) { setFish('bite'); addSplash(F.land.x, F.land.z); audio.play('bite'); } break;
    case 'bite': F.a = 0.2 - Math.abs(Math.sin(F.t * 18)) * 0.08;
      if (F.t > 2.5 + tackle.perks(F.place).reel) { toast('It got away!'); setFish('reel'); } break;   // TACKLE: better rods give a longer Reel! window
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
    out.copy(F.land); out.y = WATER_Y + 0.03 + Math.sin(elapsed * 4) * 0.02 - (F.state === 'bite' ? 0.07 : 0);
    return true;
  }
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
  if (r.w < 0.01) { r.lw = 0; return; }
  const b = body, S = b.H / 1.7;
  const f = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  const right = new THREE.Vector3(-Math.cos(player.yaw), 0, Math.sin(player.yaw));
  const torso = b.bones.Torso.getWorldPosition(new THREE.Vector3());
  r.a = fishing.a;
  const lift = fishing.state === 'flick' ? 0.05 * S : 0;
  const grip = torso.clone().addScaledVector(f, 0.3 * S).addScaledVector(right, 0.04 * S).add(new THREE.Vector3(0, -0.1 * S + lift, 0));
  const dir = f.clone().multiplyScalar(Math.cos(r.a)).add(new THREE.Vector3(0, Math.sin(r.a), 0)).normalize();
  // right hand on the grip, left hand a little further up the rod
  const down = new THREE.Vector3(0, -1, 0);
  solveArm(b, 'R', grip, down.clone().addScaledVector(right, 0.6), r.w);
  // one hand while idle or walking and for the flick; the left hand joins just above the right once the line is out
  const both = ['wait', 'bite', 'catch'].includes(fishing.state);
  r.lw += ((both ? 1 : 0) - r.lw) * Math.min(1, dt * (both ? 6 : 12));
  if (r.lw > 0.02) solveArm(b, 'L', grip.clone().addScaledVector(dir, 0.085 * S), down.clone().addScaledVector(right, -0.6), r.w * r.lw);
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
function toast(msg) { toastEl.querySelector('span').textContent = msg; toastEl.hidden = false; toastT = 2.2; }
const openSheet = (id) => { document.querySelectorAll('.sheet').forEach(x => x.hidden = x.id !== id); if (id === 'bag') renderBag(); if (id === 'settings') renderSettings(); };
document.getElementById('menuBtn').addEventListener('click', () => openSheet('menu'));
document.getElementById('menuFish').addEventListener('click', () => dex.open());   // FISHING: the fish book
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('.sheet').hidden = true));
document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openSheet(b.dataset.open)));
document.querySelectorAll('[data-soon]').forEach(b => b.addEventListener('click', () => toast(b.dataset.soon + ' arrives in a later update')));
const useBtn = document.getElementById('useBtn');
let useAction = null;
const ACTIONS = {
  talk: { label: 'Talk', icon: 'chat', color: '#ff9f6b' },
  board: { label: 'Orders', icon: 'board', color: '#c98a5a' },
  cast: { label: 'Cast', icon: 'fish', color: '#3ea6e8' },
  reel: { label: 'Reel', icon: 'rod', color: '#3b6fb0' },
  wait: { label: 'Waiting', icon: 'bobber', color: '#f7dc7a', soft: true },
  bite: { label: 'Reel!', icon: 'reel', color: '#9fdc95', soft: true, pulse: true },
  till: { label: 'Till', icon: 'hoe', color: '#b5793f' },
  plant: { label: 'Plant', icon: 'sprout', color: '#4caf50' },
  harvest: { label: 'Harvest', icon: 'basket', color: '#f2a531' },
  lot: { label: 'Buy', icon: 'coin', color: '#e8a93a' },
  clear: { label: 'Clear', icon: 'hoe', color: '#3e8ee8' },
  load: { label: 'Load', icon: 'crate', color: '#c98d4b' },
  dig: { label: 'Dig', icon: 'shovel', color: '#a8743f' },
  needtool: { label: 'Need', icon: 'lock', color: '#9a8fae' },
  collect: { label: 'Collect', icon: 'coin', color: '#e0a020' },
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
const NO_TILL = [[-0.7, -1.3, 1.3], [4.6, -1.4, 2.0], [3.2, -0.9, 1.0], [BOARD.x, BOARD.z, 1.2], [ROSA_CART.x, ROSA_CART.z, 2.4]];   // Higgins, Fishel's stall, Fishel, order board, Rosa's cart
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
function addPlot(c, saved, quiet) {
  if (plots.has(cellKey(c))) return plots.get(cellKey(c));
  if (!saved) audio.play('till');
  plotMat = plotMat || new THREE.MeshStandardMaterial({ color: 0x7a5233, roughness: 1, flatShading: true });
  rowMat = rowMat || new THREE.MeshStandardMaterial({ color: 0x5e3d24, roughness: 1 });
  const g = new THREE.Group();
  plotGeo = plotGeo || { base: new THREE.BoxGeometry(0.92, 0.08, 0.92), row: new THREE.BoxGeometry(0.8, 0.06, 0.12) };
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
const cropScale = {};
function plotScale(id) {
  if (cropScale[id] == null) {
    const c = CROPS[id], last = M.crops[c.stages[c.stages.length - 1]].scene, sz = new THREE.Box3().setFromObject(last).getSize(new THREE.Vector3());
    cropScale[id] = Math.min(0.95, 0.95 / Math.max(sz.x, sz.z, 0.01));
  }
  return cropScale[id];
}
function syncCrop(p, quiet) {
  const st = stageOf(p), c = p.save.crop && CROPS[p.save.crop];
  p.grown = !!c && st === c.stages.length - 1;
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
    m = new THREE.Group(); const sc = plotScale(p.save.crop), n = c.clump || 1;
    for (let i = 0; i < n; i++) {   // thin crops (wheat) grow as a small clump
      const o = M.crops[model].scene.clone(true); o.scale.setScalar(sc);
      if (n > 1) o.position.set(((i * 37) % 3 - 1) * 0.12, 0, (i - (n - 1) / 2) * 0.26);
      o.rotation.y = rot + i * 2.1; m.add(o);
    }
    m.position.y = 0.04;
  } else {
    m = M.nature[model].scene.clone(true);
    m.scale.setScalar(SCALE.nature * (p.grown ? 0.7 : 0.6)); m.position.y = 0.05; m.rotation.y = rot;
  }
  shadowize(m); p.g.add(m); p.cropMesh = m;
  if (p.grown && !quiet && (c.kit !== 'crops' || M.crops[model])) damageText(p.g.position.clone().setY(p.g.position.y + 1.0), 'Ready!');
}
function plantIn(p, crop) { audio.play('plant'); p.save.crop = crop; p.save.plantedAt = Date.now(); p.save.emptySince = null; p.stage = -2; syncCrop(p, true); }
function harvest(p) {
  audio.play('harvest');
  const crop = CROPS[p.save.crop];
  const n = crop.yield[0] + (Math.random() < 0.45 ? crop.yield[1] - crop.yield[0] : 0);
  addItem(crop.item, n); addXP(XP.crop * n);
  p.save.crop = null; p.save.plantedAt = 0; p.save.emptySince = Date.now(); syncCrop(p);
  damageText(p.g.position.clone().setY(p.g.position.y + 1.0), '+' + n);
  toast(`Harvested ${n} ${crop.name.toLowerCase()}${n > 1 ? 's' : ''}`);
  renderHotbar(); commit();
  return n;
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
  if (a.kind === 'talk') { if (a.key === 'fishel') openBaitShop(); else if (a.key === 'rosa') openRosaShop(); else startTalk(); return; }
  if (a.kind === 'board') { openOrders(true); return; }
  if (a.kind === 'lot') { openLotSheet(a.lot); return; }
  if (a.kind === 'clear') { startClear(a.item); return; }
  if (a.kind === 'load') { openCargo(a.box); return; }
  if (a.kind === 'dig') { digSpot(a.spot); return; }
  if (a.kind === 'needtool') { toast(a.why); return; }
  if (a.kind === 'collect') { collectCargo(); return; }
  if (a.kind === 'nobait') { toast(spots.noBaitWhy()); return; }   // FISHING
  if (a.kind === 'cast') {
    if (fishing.state !== 'idle') return;
    beginCast(a.at ? a.at.clone().setY(0) : castTarget());
  } else if (a.kind === 'reel' || a.kind === 'wait') {
    reelIn();
  } else if (a.kind === 'bite') {
    landFish();
  } else if (a.kind === 'till') {
    upperOneShot('Attack', 0.45); setTimeout(() => { if (!plots.has(cellKey(a.cell))) { addPlot(a.cell); history.push({ kind: 'till', key: cellKey(a.cell) }); commit(); } }, 220);
  } else if (a.kind === 'plant') {
    const sd = seedSel();
    if (invCount(sd) <= 0) { toast(`Out of seeds. ${seedSeller()} sells more.`); return; }
    upperOneShot('PickUp', 0.6); addItem(sd, -1); plantIn(a.plot, ITEMS[sd].crop); renderHotbar(); history.push({ kind: 'plant', key: cellKey(a.plot.cell), seed: sd }); commit();
  } else if (a.kind === 'harvest') {
    upperOneShot('PickUp', 0.6); const plantedAt = a.plot.save.plantedAt, crop = a.plot.save.crop; const n = harvest(a.plot);
    history.push({ kind: 'harvest', key: cellKey(a.plot.cell), n, plantedAt, crop });
  }
}
// tap the ground: act on that square, walking over first if it's out of reach
const tapRay = new THREE.Raycaster(), tapNdc = new THREE.Vector2();
function handleTap(x, y) {
  if (!groundMesh) return;
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
  else if (h.kind === 'harvest' && p && invCount(CROPS[h.crop].item) >= h.n) { addItem(CROPS[h.crop].item, -h.n); addXP(-XP.crop * h.n); p.save.crop = h.crop; p.save.plantedAt = h.plantedAt; syncCrop(p, true); }
  else { toast("Can't undo that now"); return; }
  renderHotbar(); commit();
  toast('Undone');
});
// Undo sits just left of the action button (or the menu when there's no action), so the two never overlap (Mac)
function placeUndo() {
  if (undoBtn.hidden) return;
  const ref = (!useBtn.hidden ? useBtn : document.getElementById('menuBtn')).getBoundingClientRect();
  undoBtn.style.left = (ref.left - 64 - 12) + 'px';
  undoBtn.style.top = (ref.top + ref.height / 2 - 32) + 'px';
}
function updateUndo() { undoBtn.hidden = decor.on || farm.mode !== 'off' || !(history.length && (tool === 'farm' || tool === 'seeds' || tool === 'fruit') && player.pos.z < FENCE_Z); }

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
  shears: { name: 'Shears', icon: 'shears', sub: 'harvest' },
  can: { name: 'Watering can', short: 'Can', icon: 'can', sub: 'water' },
  shovel: { name: 'Shovel', icon: 'shovel', sub: 'dig spots', gear: true },
  saw: { name: 'Saw', icon: 'saw', sub: 'trees · logs', gear: true, tap: 'Walk up to a tree or log and tap Clear to use the saw.' },
  pick: { name: 'Pickaxe', icon: 'pick', sub: 'big rocks', gear: true, tap: 'Walk up to a big rock and tap Clear to use the pickaxe.' },
};
const FARM_ORDER = ['hoe', 'shears', 'can', 'shovel', 'saw', 'pick'];
const WATER_MS = 60000;            // watering takes this much off the grow time, once per growth stage
const FLOAT = 0.35;                // how high you float while the farm tools are out (m)
// mode: off -> tray (floating, picking) -> ready (tool overhead) -> drag (dangling under your finger) -> return (floating home) -> land -> off
const farm = { mode: 'off', lift: 0, t: 0, P: new THREE.Vector3(), from: new THREE.Vector3(), hip: new THREE.Vector3(), hipO: new THREE.Vector3(),
  foot: new THREE.Vector3(), footO: new THREE.Vector3(), lastG: null, done: new Set(), got: 0, n: 0, upright: 1, retDur: 0.8 };
const farmTray = document.getElementById('farmTray');
// the tool you used last (null until you've picked one); the hotbar shows shears until then
function farmPicked() { return FARM_TOOLS[S.farmTool] ? S.farmTool : null; }
function farmSel() { return farmPicked() || 'shears'; }
function renderFarmTray() {
  const show = (farm.mode === 'tray' || farm.mode === 'ready') && !decor.on;
  farmTray.hidden = !show; if (!show) return;
  const sel = farm.mode === 'ready' ? farmPicked() : null;   // highlighted = the tool in your hands
  farmTray.querySelector('.srow').innerHTML = FARM_ORDER.map(id => { const t = FARM_TOOLS[id];
    const locked = t.gear && !hasTool(id), tag = locked ? `<span class="slock">${svg('lock', '#fff', 10)}${GEAR[id].price}</span>` : '';
    return `<button class="schip${id === sel ? ' on' : ''}${locked ? ' locked' : ''}" data-farm="${id}" aria-pressed="${id === sel}" aria-label="${t.name}: ${t.sub}">${tag}${svg(t.icon, '#2b2140', 26)}<span class="sn">${t.short || t.name}</span><span class="st">${t.sub}</span></button>`; }).join('');
}
farmTray.addEventListener('click', (e) => {
  const b = e.target.closest('[data-farm]'); if (!b) return;
  const t = FARM_TOOLS[b.dataset.farm];
  if (t.gear && !hasTool(b.dataset.farm)) { toast(`${toolSeller()} sells the ${t.name.toLowerCase()} (${GEAR[b.dataset.farm].price} coins, town level ${GEAR[b.dataset.farm].level}).`); return; }
  if (t.tap) { toast(t.tap); return; }
  S.farmTool = b.dataset.farm; commit();
  if (farm.mode !== 'ready') { farm.mode = 'ready'; farm.t = 0; resetDangle(); }   // switching tools keeps you where you are
  renderHotbar(); showFarmTool();
  document.querySelector('#toolName span').textContent = FARM_TOOLS[S.farmTool].name + ' \u00b7 drag across your field'; document.getElementById('toolName').hidden = false; toolNameT = 2.2;
});
function farmOpen() {
  // float up facing the camera; your last tool comes straight into your hands so you can drag right away (or switch)
  // turn to the camera at once: turning while you hang off the tool swung the body round in a circle before it settled (Mac)
  farm.t = 0; player.walkTo = null; player.faceYaw = Math.PI; player.yaw = Math.PI;
  farm.mode = farmPicked() ? 'ready' : 'tray';
  if (farm.mode === 'ready') { resetDangle(); showFarmTool(); document.querySelector('#toolName span').textContent = FARM_TOOLS[farmPicked()].name + ' \u00b7 drag across your field'; document.getElementById('toolName').hidden = false; toolNameT = 2.2; }
  renderFarmTray();
}
function farmOff() {
  if (farm.mode === 'off') return;
  farm.mode = farm.lift > 0.01 ? 'land' : 'off'; farm.t = 0;
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
function farmGrab(x, y) {
  const w = fingerToWorld(x, y); if (!w) return;
  farm.mode = 'drag'; farm.t = 0; farm.done.clear(); farm.got = 0; farm.n = 0; farm.lastG = null;
  renderFarmTray();   // the tray tucks away while you drag
  farm.target = w.P; farmWork(w.G);
}
function farmDrag(x, y) {
  if (farm.mode !== 'drag') return;
  const w = fingerToWorld(x, y); if (!w) return;
  farm.target = w.P; farmWork(w.G);
}
function farmLetGo() {
  if (farm.mode !== 'drag') return;
  farm.mode = 'return'; farm.t = 0; farm.from.copy(farm.P);
  farm.retDur = Math.min(1.4, Math.max(0.5, farm.from.distanceTo(homeHands(new THREE.Vector3())) / 3.5));
  showFarmTool();
  const k = farmSel();
  if (k === 'shears' && farm.got) toast(`Harvested ${farm.got} crop${farm.got > 1 ? 's' : ''}`);
  else if (k === 'can' && farm.n) toast(`Watered ${farm.n} plant${farm.n > 1 ? 's' : ''}: 1 minute sooner each`);
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
  if (kind === 'shears') {
    if (!p || !p.grown) return false;
    const crop = CROPS[p.save.crop], plantedAt = p.save.plantedAt, cropId = p.save.crop;
    const n = crop.yield[0] + (Math.random() < 0.45 ? crop.yield[1] - crop.yield[0] : 0);
    addItem(crop.item, n); addXP(XP.crop * n); p.save.crop = null; p.save.plantedAt = 0; p.save.watered = null; p.save.emptySince = Date.now(); syncCrop(p);
    damageText(p.g.position.clone().setY(p.g.position.y + 0.9), '+' + n);
    history.push({ kind: 'harvest', key: k, n, plantedAt, crop: cropId });
    farm.got += n; farm.n++; buzz(); audio.play('harvest'); renderHotbar(); return true;
  }
  if (kind === 'can') {
    if (!p || !p.save.crop || p.grown) return false;
    const st = stageOf(p);
    if (p.save.watered === st) return true;   // already watered this stage
    p.save.plantedAt -= WATER_MS; p.save.watered = stageOf(p) === st ? st : null; syncCrop(p); setWet(p);
    damageText(p.g.position.clone().setY(p.g.position.y + 0.8), '-1m'); addSplash(c.x + 0.5, c.z + 0.5, true);
    farm.n++; buzz(); audio.play('water'); return true;
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
const TOOL_GRIP = { shears: [0, 0.02, 0], can: [0, 0, 0], hoe: [0.074, 0.01, 0], shovel: [0.074, 0.01, 0] };
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
  for (const [k, g] of [['shears', sh], ['can', can], ['hoe', hoe], ['shovel', shv]]) { g.visible = false; scene.add(g); farmToolMesh[k] = g; }
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
// runs after the animation mixer each frame: float, then (holding a tool) hang from the hands
function applyFarmPose(dt) {
  const b = body; if (!b) return;
  farm.t += dt;
  const floating = farm.mode !== 'off' && farm.mode !== 'land';
  farm.lift += ((floating ? FLOAT : 0) - farm.lift) * Math.min(1, dt * (floating ? 5 : 7));
  if (farm.mode === 'land' && farm.lift < 0.01) { farm.lift = 0; farm.mode = 'off'; if (tool === 'farm') selectTool('none', true); }
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

function nearWater() { return onDock(player.pos.x, player.pos.z) || player.pos.z < -2.0 || !!spots.freshTarget(player.pos.x, player.pos.z); }   // FISHING: + river and lake
function pickUse() {
  if (dlg.open || decor.on || farm.mode !== 'off') return null;
  // people and the board: the closest one wins, and the one you're already facing sticks unless another is
  // clearly closer, so the button doesn't flip back and forth between two of them (Mac)
  if (fishing.state === 'idle') {
    { const fa = spots.action(); if (fa) return fa; }   // FISHING: Take at the worm bucket (right next to it, it wins over Fishel)
    const P = player.pos, d = (x, z) => Math.hypot(P.x - x, P.z - z), cand = [];
    if (nearHiggins()) cand.push({ a: { kind: 'talk', key: 'higgins' }, d: d(higgins.pos.x, higgins.pos.z) });
    if (nearFishel()) cand.push({ a: { kind: 'talk', key: 'fishel' }, d: d(fishel.pos.x, fishel.pos.z) });
    if (nearRosa()) cand.push({ a: { kind: 'talk', key: 'rosa' }, d: d(rosa.pos.x, rosa.pos.z) });
    if (nearBoard()) cand.push({ a: { kind: 'board', key: 'board' }, d: d(BOARD.x, BOARD.z + 0.5) });
    if (cand.length) {
      cand.sort((x, y) => x.d - y.d);
      const cur = useAction && cand.find(c => c.a.key === useAction.key);
      return cur && cur.d < cand[0].d + 0.6 ? cur.a : cand[0].a;
    }
  }
  if (clr) return null;
  const sl = nearLotSign(); if (sl && fishing.state === 'idle') return { kind: 'lot', key: sl.id, lot: sl };
  if (fishing.state === 'idle') { const cb = tool === 'rod' ? null : nearCargo(); if (cb !== null) return { kind: 'load', key: 'cargo' + cb, box: cb }; if (nearChest()) return { kind: 'collect', key: 'collect' }; }
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
  if (tool === 'rod' && (fishing.state === 'catch' || fishing.state === 'reel')) return null;
  if (tool === 'rod' && onWater) return bestBait() ? { kind: 'cast', key: 'dock' } : { kind: 'nobait', key: 'nobait' };   // FISHING: no bait, no cast
  // nearest ripe crop always wins
  let best = null, bd = 1.4;
  for (const pl of plots.values()) {
    const d = Math.hypot(pl.cell.x + 0.5 - player.pos.x, pl.cell.z + 0.5 - player.pos.z);
    if (pl.grown && d < bd) { bd = d; best = pl; }
  }
  if (best) return { kind: 'harvest', key: cellKey(best.cell), plot: best, cell: best.cell };
  const c = facingCell(); const here = plots.get(cellKey(c));
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
    if (fish.tint) o.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); const h = {}; m.material.color.getHSL(h); if (h.l > 0.25) m.material.color.lerp(new THREE.Color(fish.tint), 0.75); } });
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
    tagV.copy(p.g.position); tagV.y += 0.75; tagV.project(camera);
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
  morning: { grade: 'rgba(255,170,205,0.55)', sky: ['#ffd6e4', '#fff3dc'], fog: 0xfbe8e0, sun: [0xffe1c9, 2.3], sunPos: [16, 10, -4], hemi: [0xffe6f0, 0xc9e4d0, 1.35], water: 0x9ad6f2, lamps: 0, clock: '7:40 AM', exp: 1.14 },
  day:     { grade: 'rgba(0,0,0,0)', sky: ['#5ec0ff', '#d6f2ff'], fog: 0xcdeeff, sun: [0xfffbe8, 3.0], sunPos: [10, 20, -6], hemi: [0xffffff, 0x7fb07a, 1.0], water: 0x2f9be0, lamps: 0, clock: '2:15 PM', exp: 1.05 },
  evening: { grade: 'rgba(255,140,60,0.35)', sky: ['#ff9a72', '#ffdcaa'], fog: 0xffd2b0, sun: [0xffb47a, 1.9], sunPos: [-18, 8, -4], hemi: [0xffd9bd, 0x7a6a80, 0.95], water: 0x3f6fa8, lamps: 2.5, clock: '6:50 PM', exp: 1.0 },
  night:   { grade: 'rgba(35,65,195,0.24)', sky: ['#1b3062', '#3c5ea4'], fog: 0x263e6c, sun: [0xa4bcff, 3.3], sunPos: [-8, 16, -10], hemi: [0x4a6cc2, 0x18244a, 1.1], water: 0x285a8c, lamps: 6, clock: '11:20 PM', exp: 1.22, moon: 1, glint: 0.3 },
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
  sun.color.set(t.sun[0]); sun.intensity = t.sun[1];
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
  const c = decorCenter(gh.id, gh.x, gh.z, gh.r); gh.r = (gh.r + 1) % 4;
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
  try { if (cargoReady) refreshCargo(); } catch (e) { /* harbor not built yet */ }
  try { if (cargoReady) refreshDig(); } catch (e) { /* not built yet */ }
  const { lv, have, need } = xpInto(S.xp || 0);
  const frac = lv > S.level ? 1 : have / need, r = 20, c = 2 * Math.PI * r;
  document.getElementById('lvArc').setAttribute('stroke-dasharray', `${(c * frac).toFixed(1)} ${c.toFixed(1)}`);
  document.getElementById('lvNum').textContent = S.level;
  document.getElementById('lvBadge').setAttribute('aria-label', `Town level ${S.level}, ${have} of ${need} XP. Show what levels unlock`);
}
function unlockName(u) { if (u.tool) return GEAR[u.tool].name; if (u.decor) return DECOR[u.decor].name; return u.later || u.place ? u.later || u.place : ITEMS[u.item].kind === 'seed' ? ITEMS[u.item].name : u.item === 'worm' ? 'Worms' : u.item === 'shrimp' ? 'Shrimp bait' : ITEMS[u.item].name; }
function unlockWhere(u) { if (u.tool) return store.isOpen() ? 'Nell\u2019s store' : 'Higgins'; if (u.decor) return 'Nell\u2019s store'; if (u.store) return 'Left of the order board'; return u.later ? 'Coming later' : u.ship ? 'At the dock' : u.land ? 'FOR SALE sign by the gate' : u.place ? 'By the order board' : ITEMS[u.item].kind === 'seed' ? (unlockLevel(u.item) >= 2 ? 'Rosa\u2019s Flowers' : 'Higgins') : 'Fishel'; }
function unlockPic(u) {
  if (u.later) return `<span class="lvlater">${svg('sun', '#854f0b', 34)}</span>`;
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
  const kind = (u) => u.later || u.place || u.tool || u.decor ? 'place' : ITEMS[u.item].kind === 'seed' ? 'seed' : 'fish';   // tools broke this list from v0.1.48 until v0.1.55
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
  const pos = new THREE.Vector3(-0.7, 0, -1.3);
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
function showDialog(text, choices) {
  dlg.open = true; dEl.hidden = false; dText.textContent = text;
  dChoices.innerHTML = '';
  for (const c of choices) {
    const btn = document.createElement('button'); btn.textContent = c.label; if (c.primary) btn.className = 'primary'; if (c.locked) btn.className = 'locked';
    btn.addEventListener('click', () => c.go()); dChoices.appendChild(btn);
  }
  if (higgins) player.faceYaw = Math.atan2(higgins.pos.x - player.pos.x, higgins.pos.z - player.pos.z);
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
const INTRO = [
  'Ah, you made it! Welcome to Tidewell. I’m Higgins, your concierge.',
  'The deed is all yours now: this stretch of beach, the dock and the green beyond. A home away from home.',
  'There’s room to grow, too. More lots can be bought down the road, though I’ll warn you, they don’t come cheap.',
  'To begin, take your rod to the shore or the dock. Hold Cast to fill the meter, let go to cast, and tap Reel! the moment a fish bites.',
  'Or open your farm tools, take the hoe and drag it over some grass in town. I’ve tucked 5 turnip seeds in your bag. Crops keep growing even while you’re away.',
  'And a little housewarming gift: benches, lanterns, fences and flowers. Tap the house button on your toolbar to decorate however you like.',
  'Fishel runs the bait stall by the dock. Better bait, better fish. Whatever you catch or grow, bring it to me and I’ll buy it. Off you go!',
];
const HOWTO = [
  'Fishing: stand at the shore or on the dock with your rod. Hold Cast and let go when the meter looks good. Longer casts find rarer fish.',
  'When the button turns green and says Reel!, tap it quickly or the fish gets away.',
  'Farming: tap Farm tools and you’ll float up. Pick the hoe, shears or watering can, then drag it across the field and you’ll swing along with it. The hoe tills, the shears harvest, and a splash of water makes a plant finish a minute sooner. Plant from your seed bag. Small crops take minutes, pumpkins about an hour.',
];
function sellValue() {
  let total = 0, n = 0;
  for (const [id, c] of Object.entries(S.inv)) { const it = ITEMS[id]; if (it && (it.kind === 'fish' || it.kind === 'crop')) { total += it.price * c; n += c; } }
  return { total, n };
}
function talkMenu(msg) {
  const v = sellValue();
  showDialog(msg || (rosaOpen() && !S.rosaMet ? 'How may I be of service? Oh, and Rosa has her flower cart at the far end of the beach row now, past the new shop. She sells the seeds.' : 'How may I be of service?'), [
    ...(v.n ? [{ label: `Sell everything (${v.n} item${v.n > 1 ? 's' : ''} for ${v.total} coins)`, primary: true, go: sellAll }] : []),
    ...(rosaOpen() ? [] : [{ label: 'Buy seeds', go: () => seedMenu() }]),
    ...(store.isOpen() ? [] : [{ label: 'Browse decor', go: () => decorMenu() }]),   // STORE: the general store takes these over once it's open
    ...(S.level >= GEAR.shovel.level && !store.isOpen() ? [{ label: 'Buy tools', go: () => toolMenu() }] : []),
    { label: 'How do things work again?', go: () => sayLines(HOWTO, () => talkMenu()) },
    { label: 'Goodbye', go: closeDialog },
  ]);
}
function sellAll() {
  const v = sellValue();
  for (const id of Object.keys(S.inv)) { const it = ITEMS[id]; if (it && (it.kind === 'fish' || it.kind === 'crop')) delete S.inv[id]; }
  S.coins += v.total; audio.play('coins'); renderHotbar(); commit();
  toast(`+${v.total} coins`);
  talkMenu(`A pleasure doing business. That comes to ${v.total} coins.`);
}
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
  if (!S.introDone) runIntro();
  else if (!S.kitGiven) sayLines(['Ah, before I forget! Your housewarming kit: a bench, lanterns, fences, flowers, a barrel and a crate.', 'Tap the house button on your toolbar to place them wherever you like. And do visit Fishel by the dock for bait.'], () => { giveStarterKit(); toast('Starter decor added to your bag'); talkMenu(); });
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
  if (!S.rosaMet) { S.rosaMet = true; commit(); }
  renderRosaShop(); openSheet('rosaShop');
}
function renderRosaShop() {
  document.getElementById('rosaCoins').textContent = `you have ${S.coins.toLocaleString()} coins`;
  const n = SHOP.seedPack;
  document.getElementById('rosaList').innerHTML = [...CROP_ORDER].sort((a, b) => unlockLevel(CROPS[a].seed) - unlockLevel(CROPS[b].seed) || CROPS[a].growMinutes - CROPS[b].growMinutes).map(id => {
    const c = CROPS[id], it = ITEMS[c.seed], cost = it.buy * n, lv = unlockLevel(c.seed), open = lv <= S.level, have = invCount(c.seed);
    return `<div class="rrow${open ? '' : ' locked'}" data-rseed="${c.seed}"><div class="ric">${cropImg(id, 40)}</div>
      <div class="rtx"><b>${c.name}</b><span>${n} seeds \u00b7 grows ${c.growMinutes} min${have ? ` \u00b7 you have ${have}` : ''}</span></div>
      ${open ? `<button data-rbuy="${c.seed}" ${S.coins < cost ? 'disabled' : ''}>${cost}</button>` : `<span class="rlock">${svg('lock', '#6a5f7c', 13)} Town level ${lv}</span>`}</div>`;
  }).join('');
}
document.getElementById('rosaList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rbuy]');
  if (b) {
    if (b.disabled) return;
    const sd = b.dataset.rbuy, n = SHOP.seedPack, cost = ITEMS[sd].buy * n;
    if (S.coins < cost || !unlocked(sd)) return;
    audio.play('buy'); S.coins -= cost; addItem(sd, n); S.seedSel = sd; renderHotbar(); commit(); renderRosaShop();
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
// ---------- the cargo ship (decision 70, mockup B + crates, barrels, a star crate and a bigger hold) ----------
// Crates take crops, barrels take fish: load anything until they're full. The star crate asks for something in
// particular and brings a treasure chest. Send the ship and it's gone for a while; it sells everything for more
// than Higgins pays and comes back with the coins (and the chest).
let cargoReady = false, cargoModels = [], chestModel = null, shipAnim = null;
const cargoBubEl = document.getElementById('cargoBubbles');
const cargoOpen = () => S.level >= CARGO.openLevel;
const holdOf = () => CARGO.holds[Math.min((S.cargo && S.cargo.hold) || 0, CARGO.holds.length - 1)];
function cargoBoxes() {
  const h = holdOf(), out = [];
  for (let i = 0; i < h.crates; i++) out.push({ kind: 'crate' });
  for (let i = 0; i < h.barrels; i++) out.push({ kind: 'barrel' });
  out.push({ kind: 'star' });
  return out;
}
function newStar() {
  const pool = ORDERS.wants.filter(w => ITEMS[w.item].kind !== 'crop' || unlockLevel('seed_' + w.item) <= S.level);
  const w = pool[Math.floor(Math.random() * pool.length)];
  return { item: w.item, n: Math.max(2, Math.min(5, w.n[0] + Math.floor(Math.random() * 3))) };
}
function ensureCargo() {
  if (!S.cargo) S.cargo = { hold: 0, boxes: [], star: null, back: 0, payout: null };
  const n = cargoBoxes().length;
  // keep what's loaded when the hold grows; the star crate is always last
  const old = S.cargo.boxes || [], starLoad = old.length ? old[old.length - 1] : {};
  const body = old.slice(0, Math.max(0, old.length - 1));
  S.cargo.boxes = [...Array(n - 1)].map((_, i) => body[i] || {}).concat([starLoad || {}]);
  if (!S.cargo.star) S.cargo.star = newStar();
}
const boxCount = (b) => Object.values(b || {}).reduce((t, n) => t + n, 0);
const capOf = (kind) => kind === 'star' ? S.cargo.star.n : holdOf().cap;
const fits = (kind, id) => kind === 'star' ? id === S.cargo.star.item : kind === 'crate' ? ITEMS[id].kind === 'crop' : ITEMS[id].kind === 'fish';
const shipAway = () => S.cargo && S.cargo.back > 0;
const cargoLoaded = () => S.cargo && S.cargo.boxes.some(b => boxCount(b) > 0);
function boxPos(i) { return { x: DOCK.x + 0.58, z: -4.3 - i * 0.78 }; }
function buildCargo() { cargoReady = true; refreshCargo(true); }
function refreshCargo(first) {
  if (!cargoReady) return;
  const open = cargoOpen();
  if (open) ensureCargo();
  // the crates and barrels on the dock
  const kinds = open ? cargoBoxes().map(b => b.kind) : [];
  if (kinds.join() !== cargoModels.map(o => o.userData.kind).join()) {
    cargoModels.forEach(o => scene.remove(o)); cargoModels = [];
    kinds.forEach((k, i) => {
      const p = boxPos(i), o = place('pirate', k === 'barrel' ? 'barrel' : k === 'star' ? 'crate-bottles' : 'crate', p.x, p.z, { r: (i % 3 - 1) * 0.08, s: 0.62 });
      o.position.y = DOCK_FLOOR + 0.02; o.userData.kind = k; cargoModels.push(o);
    });
    cargoBubEl.innerHTML = kinds.map((k, i) => `<div class="cb ${k}" data-i="${i}"><div class="cbb"></div><div class="cbt"></div></div>`).join('');
  }
  // the ship: at the dock, away, or sailing between
  if (merchant) {
    if (first) { const away = shipAway() && Date.now() < S.cargo.back; merchant.visible = !away; merchant.position.x = SHIP_AT.x; merchant.position.z = SHIP_AT.z; }
  }
  // the chest with your pay waits on the dock once the ship is back
  const showChest = open && S.cargo && S.cargo.payout && !shipAway();
  if (showChest && !chestModel) { chestModel = place('pirate', 'chest', DOCK.x - 1.9, -2.7, { r: 0.4, s: 0.9 }); }   // on the sand by the foot of the dock, clear of the crate bubbles
  if (!showChest && chestModel) { scene.remove(chestModel); chestModel = null; }
  renderCargoBubbles();
}
function boxIcon(kind, b) {
  if (kind === 'star') return `<span class="cstar">★</span>${itemIcon(S.cargo.star.item)}`;
  const top = Object.entries(b).sort((x, y) => y[1] - x[1])[0];
  return top ? itemIcon(top[0]) : `<span class="ic cbx">${svg(kind === 'barrel' ? 'barrel' : 'crate', '#8a5a34', 22)}</span>`;
}
function renderCargoBubbles() {
  if (!S.cargo) return;
  cargoBubEl.querySelectorAll('.cb').forEach(el => {
    const i = +el.dataset.i, k = el.classList.contains('star') ? 'star' : el.classList.contains('barrel') ? 'barrel' : 'crate';
    const b = S.cargo.boxes[i] || {}, n = boxCount(b), cap = capOf(k), full = n >= cap;
    el.classList.toggle('full', full);
    el.querySelector('.cbb').innerHTML = `${boxIcon(k, b)}<span class="cbar"><i style="width:${Math.round(100 * n / cap)}%"></i></span><b>${n}/${cap}</b>${full ? '<span class="cok">✓</span>' : ''}`;
  });
  // the ship's pay, over the chest
  const pay = document.getElementById('cargoPay');
  const p = S.cargo.payout;
  pay.hidden = !(p && !shipAway());
  if (p) pay.querySelector('.cbb').innerHTML = `<span class="scoin"></span><b>+${p.coins.toLocaleString()}</b>${p.extra ? `<span class="cstar">★</span>${itemIcon(p.extra.item)}<b>×${p.extra.n}</b>` : ''}`;
}
const _cb = new THREE.Vector3();
function placeBubble(el, x, y, z, lift, dx = 0) {
  _cb.set(x, y, z).project(camera);
  const on = _cb.z < 1 && Math.abs(_cb.x) < 1.1 && Math.abs(_cb.y) < 1.1;
  el.style.display = on ? '' : 'none';
  if (on) { el.style.left = ((_cb.x + 1) / 2 * innerWidth + dx) + 'px'; el.style.top = ((1 - _cb.y) / 2 * innerHeight - lift) + 'px'; }
}
function tickCargo(dt) {
  if (!cargoReady) return;
  // the trip: once it's time, the ship sails back in and the pay waits in a chest on the dock
  if (shipAway() && Date.now() >= S.cargo.back && !shipAnim) {
    S.cargo.back = 0; commit();
    merchant.visible = true; audio.shipBell(); shipAnim = { t: 0, dur: 7, from: SHIP_OUT, to: SHIP_AT, done: () => { refreshCargo(); toast('The cargo ship is back! Your pay is on the dock.'); } };
  }
  waterUniforms.uRing.value = merchant && merchant.visible && !shipAnim ? 1 : 0;   // rings only around the ship at rest
  if (shipAnim) {
    shipAnim.t += dt; const k = Math.min(1, shipAnim.t / shipAnim.dur), e = k * k * (3 - 2 * k);
    merchant.position.x = shipAnim.from.x + (shipAnim.to.x - shipAnim.from.x) * e;
    merchant.position.z = shipAnim.from.z + (shipAnim.to.z - shipAnim.from.z) * e;
    // sails drop as it casts off, and roll back up as it ties up
    furlSails(merchant, shipAnim.to === SHIP_AT ? Math.max(0, (k - 0.75) * 4) : Math.max(0, 1 - k * 4));
    if (k >= 1) { const d = shipAnim.done; shipAnim = null; if (d) d(); }
  }
  // bubbles over the crates when you're down by the harbor
  const near = cargoOpen() && S.cargo && player.pos.z < 1.5 && Math.abs(player.pos.x - DOCK.x) < 9 && !decor.on && farm.mode === 'off';
  cargoBubEl.hidden = !near;
  if (near) cargoBubEl.querySelectorAll('.cb').forEach(el => { const p = boxPos(+el.dataset.i); placeBubble(el, p.x, DOCK_FLOOR + 0.75, p.z, 0, (+el.dataset.i % 2 ? 1 : -1) * 44); });   // staggered so the row doesn't stack up
  const pay = document.getElementById('cargoPay');
  if (!pay.hidden && chestModel) placeBubble(pay, chestModel.position.x, chestModel.position.y + 0.9, chestModel.position.z, 0);
  if (!near) pay.style.display = 'none';
}
function nearCargo() {
  if (!cargoOpen() || !S.cargo || !onDock(player.pos.x, player.pos.z)) return null;
  let best = null, bd = 1.0;
  cargoBoxes().forEach((b, i) => { const p = boxPos(i), d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z); if (d < bd) { bd = d; best = i; } });
  return best;
}
function nearChest() { return chestModel && Math.hypot(chestModel.position.x - player.pos.x, chestModel.position.z - player.pos.z) < 1.4; }
// --- loading sheet ---
let cargoAt = 0;
function openCargo(i) { cargoAt = i; renderCargo(); openSheet('cargoSheet'); }
function renderCargo() {
  const kind = cargoBoxes()[cargoAt].kind, b = S.cargo.boxes[cargoAt], n = boxCount(b), cap = capOf(kind);
  const title = kind === 'star' ? 'Star crate' : kind === 'barrel' ? 'Barrel' : 'Crate';
  document.getElementById('cgIcon').innerHTML = kind === 'star' ? `<span class="cstar big">★</span>` : svg(kind === 'barrel' ? 'barrel' : 'crate', '#8a5a34', 30);
  document.getElementById('cgTitle').textContent = title;
  document.getElementById('cgBar').innerHTML = `<span class="cbar"><i style="width:${Math.round(100 * n / cap)}%"></i></span><b>${n}/${cap}</b>`;
  document.getElementById('cgHint').innerHTML = kind === 'star' ? `Wants ${S.cargo.star.n} ${ITEMS[S.cargo.star.item].name}. Fill it for a treasure chest!` : kind === 'barrel' ? 'Fish go in barrels. Tap to drop one in, hold to fill it.' : 'Crops go in crates. Tap to drop one in, hold to fill it.';
  const mine = Object.keys(S.inv).filter(id => ITEMS[id] && S.inv[id] > 0 && fits(kind, id));
  document.getElementById('cgHave').innerHTML = mine.length ? mine.map(id => `<button class="cgt" data-add="${id}">${itemIcon(id)}<b>×${S.inv[id]}</b></button>`).join('')
    : `<div class="cgnone">${kind === 'star' ? `You don't have any ${ITEMS[S.cargo.star.item].name} yet` : kind === 'barrel' ? 'No fish in your bag' : 'No crops in your bag'}</div>`;
  const inIt = Object.keys(b).filter(id => b[id] > 0);
  document.getElementById('cgIn').innerHTML = inIt.length ? inIt.map(id => `<button class="cgt in" data-take="${id}">${itemIcon(id)}<b>×${b[id]}</b></button>`).join('') : '<div class="cgnone">Empty</div>';
  const send = document.getElementById('cgSend'), away = shipAway();
  send.disabled = away || !cargoLoaded() || !!S.cargo.payout;
  send.textContent = away ? `The ship is away · back in ${fmtTrip(S.cargo.back - Date.now())}` : S.cargo.payout ? 'Collect your pay first' : 'Send the ship ⛵';
  const nx = CARGO.holds[S.cargo.hold + 1];
  document.getElementById('cgUp').hidden = !nx;
}
function fmtTrip(ms) { const s = Math.max(0, Math.ceil(ms / 1000)), mn = Math.ceil(s / 60); return s < 60 ? s + 's' : mn >= 60 ? `${Math.floor(mn / 60)}h ${mn % 60}m` : `${mn}m`; }
function cargoAdd(id, all) {
  const kind = cargoBoxes()[cargoAt].kind, b = S.cargo.boxes[cargoAt];
  let room = capOf(kind) - boxCount(b); if (room <= 0) { toast('It’s full'); return; }
  const k = Math.min(all ? room : 1, invCount(id)); if (k <= 0) return;
  addItem(id, -k); b[id] = (b[id] || 0) + k;
  renderCargo(); renderCargoBubbles(); commit();
}
function cargoTake(id) {
  const b = S.cargo.boxes[cargoAt]; if (!b[id]) return;
  b[id]--; if (!b[id]) delete b[id]; addItem(id, 1);
  renderCargo(); renderCargoBubbles(); commit();
}
{
  let holdT = null, held = false;
  const have = document.getElementById('cgHave');
  have.addEventListener('pointerdown', (e) => { const t = e.target.closest('[data-add]'); if (!t) return; held = false; holdT = setTimeout(() => { held = true; cargoAdd(t.dataset.add, true); }, 450); });
  const stop = () => { clearTimeout(holdT); holdT = null; };
  have.addEventListener('pointerup', stop); have.addEventListener('pointerleave', stop); have.addEventListener('pointercancel', stop);
  have.addEventListener('click', (e) => { const t = e.target.closest('[data-add]'); if (!t) return; if (held) { held = false; return; } cargoAdd(t.dataset.add, false); });
  document.getElementById('cgIn').addEventListener('click', (e) => { const t = e.target.closest('[data-take]'); if (t) cargoTake(t.dataset.take); });
}
document.getElementById('cgSend').addEventListener('click', () => {
  if (shipAway() || !cargoLoaded() || S.cargo.payout) return;
  let value = 0;
  S.cargo.boxes.forEach(b => { for (const [id, n] of Object.entries(b)) value += ITEMS[id].price * n; });
  const starFull = boxCount(S.cargo.boxes[S.cargo.boxes.length - 1]) >= S.cargo.star.n;
  S.cargo.payout = { coins: Math.max(5, Math.round(value * CARGO.payMult)), extra: starFull ? chestPrize() : null };
  S.cargo.boxes = S.cargo.boxes.map(() => ({}));
  const ms = settings.debug && settings.fastCrops ? CARGO.debugTripSeconds * 1000 : holdOf().tripMinutes * 60000;
  S.cargo.back = Date.now() + ms;
  document.getElementById('cargoSheet').hidden = true;
  audio.shipBell(); shipAnim = { t: 0, dur: 7, from: SHIP_AT, to: SHIP_OUT, done: () => { merchant.visible = false; } };
  refreshCargo(); commit();
  toast(`The ship sets sail! Back in ${fmtTrip(ms)}.`);
});
function chestPrize() {
  const seeds = CROP_ORDER.map(c => CROPS[c].seed).filter(s => unlockLevel(s) <= S.level);
  const opts = [{ item: seeds[Math.floor(Math.random() * seeds.length)], n: 5 }, { item: 'shrimp', n: 5 }, { item: 'decor_' + DECOR_ORDER[Math.floor(Math.random() * DECOR_ORDER.length)], n: 1 }];
  if (unlockLevel('lure') <= S.level) opts.push({ item: 'lure', n: 1 });
  return opts[Math.floor(Math.random() * opts.length)];
}
function collectCargo() {
  const p = S.cargo && S.cargo.payout; if (!p) return;
  S.coins += p.coins; audio.play('coins'); if (p.extra) addItem(p.extra.item, p.extra.n);
  S.cargo.payout = null; S.cargo.star = newStar();
  addXP(XP.order);
  refreshCargo(); commit();
  toast(`+${p.coins.toLocaleString()} coins${p.extra ? ` and ${p.extra.n} × ${ITEMS[p.extra.item].name}` : ''}!`);
}
// --- bigger hold: coins + town level, like the lots ---
document.getElementById('cgUp').addEventListener('click', () => { renderHold(); openSheet('holdSheet'); });
function renderHold() {
  const cur = S.cargo.hold, nx = CARGO.holds[cur + 1];
  document.getElementById('hdList').innerHTML = CARGO.holds.map((h, i) => {
    const pics = svg('crate', '#8a5a34', 20).repeat(h.crates) + svg('barrel', '#8a5a34', 20).repeat(h.barrels);
    const right = i <= cur ? '<b class="hdyes">✓ yours</b>' : `<span class="scoin sm"></span><b>${h.cost.toLocaleString()}</b><span class="hdlv${S.level >= h.level ? ' ok' : ''}">${h.level}</span>`;
    return `<div class="hdrow${i <= cur ? ' mine' : ''}"><span class="hdpics">${pics}</span><b class="hdcap">×${h.cap}</b><span class="hdr">${right}</span></div>`;
  }).join('');
  const b = document.getElementById('hdBuy');
  if (!nx) { b.disabled = true; b.textContent = 'Biggest hold'; return; }
  const lvOK = S.level >= nx.level, coinOK = S.coins >= nx.cost;
  b.disabled = !lvOK || !coinOK;
  b.textContent = !lvOK ? `Reach town level ${nx.level}` : !coinOK ? `Need ${(nx.cost - S.coins).toLocaleString()} more` : `Upgrade for ${nx.cost.toLocaleString()}`;
}
document.getElementById('hdBuy').addEventListener('click', () => {
  const nx = CARGO.holds[S.cargo.hold + 1]; if (!nx || S.level < nx.level || S.coins < nx.cost) return;
  audio.play('buy'); S.coins -= nx.cost; S.cargo.hold++; ensureCargo(); refreshCargo(); commit();
  document.getElementById('holdSheet').hidden = true;
  toast('Bigger hold! More crates and barrels on the dock.');
});

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
// keep 6 slots; an empty slot gets a new order once its timer runs out
function tickOrders() {
  const st = S.orders, now = Date.now(); let changed = false;
  while (st.slots.length < ORDERS.slots) { st.slots.push(makeOrder(Math.random, st.next++, S.level)); changed = true; }
  st.slots = st.slots.map(o => { if (o.empty && now >= o.at) { changed = true; return makeOrder(Math.random, st.next++, S.level); } return o; });
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
  document.getElementById('ordSub').textContent = `${ready} ready \u00b7 ${live.length} total`;
  document.getElementById('ordNote').textContent = ordAtBoard
    ? 'Orders never expire. A new one is pinned about 10 minutes after you fill or toss one.'
    : 'Fill orders at the board next to Higgins. Pin one to keep it on screen.';
  const sorted = [...slots].sort((a, b) => (!!a.empty - !!b.empty) || (orderReady(b) - orderReady(a)));
  document.getElementById('ordList').innerHTML = sorted.map(o => {
    if (o.empty) { const m = Math.max(1, Math.ceil((o.at - Date.now()) / 60000)); return `<div class="orow empty">New order in about ${m} min</div>`; }
    const r = orderReady(o), pinned = S.orders.pinned === o.id, f = ORDER_FOLK[o.who];
    const items = o.items.map(([id, n]) => { const h = Math.min(invCount(id), n); return `<div class="oit">${itemIcon(id)}<div>${ITEMS[id].name}<br><span class="${h >= n ? 'ok' : 'need'}">${h}/${n}${h >= n ? ' \u2713' : ''}</span></div></div>`; }).join('');
    const fill = ordAtBoard ? `<button class="fill" data-ofill="${o.id}" ${r ? '' : 'disabled'}>${r ? 'Fill' : 'Need more'}</button>` : `<button class="fill" disabled>At the board</button>`;
    return `<div class="orow${r ? ' ready' : ''}">${folkAv(o.who)}<div class="omid"><div class="otop"><b>${f.name}</b><span class="orew">${svg('coin', '#c98a1a', 15)}${o.coins} <em>${extraLabel(o.extra)}</em></span></div><div class="oitems">${items}</div></div>
      <div class="obtns">${fill}<div class="row2"><button data-opin="${o.id}" class="${pinned ? 'on' : ''}" aria-label="${pinned ? 'Unpin' : 'Pin to screen'}" aria-pressed="${pinned}">${svg('pin', pinned ? '#e0573e' : '#8a7fa0', 15)}</button>${ordAtBoard ? `<button data-otoss="${o.id}" class="${tossArmed === o.id ? 'armed' : ''}" aria-label="Toss this order">${tossArmed === o.id ? 'Sure?' : svg('x', '#8a7fa0', 14)}</button>` : ''}</div></div></div>`;
  }).join('');
}
function clearSlot(id) {
  const i = S.orders.slots.findIndex(o => o.id === id);
  if (i >= 0) S.orders.slots[i] = { empty: true, at: Date.now() + refillMs() };
  if (S.orders.pinned === id) S.orders.pinned = null;
}
document.getElementById('ordList').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.opin) { const id = +b.dataset.opin; S.orders.pinned = S.orders.pinned === id ? null : id; commit(); renderOrders(); return; }
  if (b.dataset.otoss) { const id = +b.dataset.otoss; if (tossArmed !== id) { tossArmed = id; renderOrders(); return; } tossArmed = null; clearSlot(id); commit(); updateBoardNotes(); renderOrders(); toast('Order tossed'); return; }
  if (b.dataset.ofill) {
    const o = S.orders.slots.find(x => x.id === +b.dataset.ofill); if (!o || !orderReady(o) || !ordAtBoard) return;
    for (const [id, n] of o.items) addItem(id, -n);
    S.coins += o.coins; audio.play('coins'); addXP(XP.order);
    let msg = `+${o.coins} coins \u00b7 +${XP.order} XP`;
    if (o.extra.kind === 'heart') { S.friends[o.who] = (S.friends[o.who] || 0) + 1; msg += ` \u00b7 ${ORDER_FOLK[o.who].name} \u2665+1`; }
    else { addItem(o.extra.item, o.extra.n); msg += ` \u00b7 +${o.extra.n} ${ITEMS[o.extra.item].name}`; }
    clearSlot(o.id); renderHotbar(); commit(); updateBoardNotes(); renderOrders(); toast(msg);
  }
});
document.getElementById('menuOrders').addEventListener('click', () => openOrders(false));
const trackEl = document.getElementById('orderTrack');
trackEl.addEventListener('click', () => openOrders(nearBoard()));
function renderTrack() {
  const o = S.orders.slots.find(x => !x.empty && x.id === S.orders.pinned);
  trackEl.hidden = !o; if (!o) return;
  const r = orderReady(o);
  const miss = o.items.find(([id, n]) => invCount(id) < n) || o.items[0];
  trackEl.classList.toggle('ready', r);
  trackEl.innerHTML = `${svg('pin', '#e0573e', 15)}${folkAv(o.who)}<span class="tt"><b>${ORDER_FOLK[o.who].name}</b><br>${r ? 'Ready \u2014 fill it at the board' : `${ITEMS[miss[0]].name} ${Math.min(invCount(miss[0]), miss[1])}/${miss[1]}`}</span>`;
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
  document.getElementById('mmDbgInfo').innerHTML = 'Separate test save \u00b7 skips the intro<br>Fast crops \u00b7 debug buttons in Settings';
  document.getElementById('mmVer').textContent = VERSION_LABEL;
}
function showMainMenu() { renderMainMenu(); document.body.classList.add('inmenu'); mm.hidden = false; }
function startGame() {
  mm.hidden = true; document.body.classList.remove('inmenu');
  if (settings.debug) {
    if (!S.introDone) { S.introDone = true; if (!S.kitGiven) giveStarterKit(); S.fishelMet = true; renderHotbar(); commit(); }
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
const KIND_ORDER = { fish: 0, crop: 1, seed: 2, bait: 3, feed: 4, decor: 5 };
function itemIcon(id) {
  const it = ITEMS[id], col = RARITY[it.rarity].color;
  if (it.kind === 'crop') return `<span class="ic" style="background:${col}22;border:2px solid ${col}">${cropImg(id, 26)}</span>`;
  if (it.kind === 'seed') return `<span class="ic seedpk">${cropImg(it.crop, 20)}</span>`;
  const k = it.kind === 'fish' ? 'fish' : it.kind === 'crop' ? 'fruit' : it.kind === 'bait' ? id : it.kind === 'feed' ? 'feed' : it.kind === 'decor' ? it.decor : 'seeds';
  return `<span class="ic" style="background:${col}22;border:2px solid ${col}">${svg(k, col, 22)}</span>`;
}
function renderBag() {
  document.getElementById('bagCoins').textContent = `${S.coins.toLocaleString()} coins`;
  const ids = Object.keys(S.inv).filter(id => ITEMS[id] && S.inv[id] > 0)
    .sort((a, b) => (KIND_ORDER[ITEMS[a].kind] - KIND_ORDER[ITEMS[b].kind]) || (RARITY_IDX[ITEMS[b].rarity] - RARITY_IDX[ITEMS[a].rarity]));
  document.getElementById('bagList').innerHTML = ids.length ? ids.map(id => {
    const it = ITEMS[id], r = RARITY[it.rarity];
    return `<div class="row">${itemIcon(id)}<div class="nm">${it.name}<small style="color:${r.color}">${it.kind === 'fish' || it.kind === 'crop' ? r.label + ' · ' + it.price + ' coins each' : it.kind === 'bait' ? 'Bait' : it.kind === 'feed' ? 'Animal feed' : it.kind === 'decor' ? 'Decor' : r.label}</small></div><div class="ct">×${S.inv[id]}</div></div>`;
  }).join('') : '<div class="empty">Your bag is empty. Go fishing or farming!</div>';
  document.getElementById('bagCollection').textContent = `Fish book: ${dex.foundCount()} of ${dex.totalCount()} found.`   /* FISHING */;
}
const RARITY_IDX = { common: 0, uncommon: 1, rare: 2, super: 3, legendary: 4 };

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
  if (k === 'lot') {
    const l = LOTS.find(lotForSale);
    if (!l) toast('Every lot is bought');
    else { const s = lotSignPos(); player.pos.set(s.x + 1.1, 0, s.z - 1.2); toast(`Next lot: ${LOT_NAMES[l.id]}, ${lotPrice().toLocaleString()} coins, level ${lotLevel()}`); }
  }
  if (k === 'cargofill') { ensureCargo(); if (S.level < CARGO.openLevel) { S.level = CARGO.openLevel; S.xp = Math.max(S.xp, 0); renderLevel(); } cargoBoxes().forEach((b, i) => { if (b.kind === 'star') { S.cargo.boxes[i] = { [S.cargo.star.item]: S.cargo.star.n }; } else S.cargo.boxes[i] = { [b.kind === 'crate' ? 'turnip' : 'sunfish']: holdOf().cap }; }); refreshCargo(); commit(); toast('Hold filled'); }
  if (k === 'cargoback') { ensureCargo(); if (S.cargo.back) { S.cargo.back = Date.now() - 1; shipAnim = null; merchant.visible = false; commit(); toast('The ship is on its way back'); } else toast('The ship is at the dock'); }
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
    p.save.plantedAt -= WATER_MS; p.save.watered = stageOf(p) === stg ? stg : null; syncCrop(p); setWet(p); n++;
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
    feet: () => [{ x: player.pos.x, y: player.y || 0, z: player.pos.z }, ...[higgins, fishel, rosa].filter(Boolean).map(n => ({ x: n.pos.x, y: floorY(n.pos.x, n.pos.z), z: n.pos.z }))] });
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
function persistNow() { if (leaving) return; S.pos = [+player.pos.x.toFixed(2), +player.pos.z.toFixed(2)]; storeSave(S, settings.debug); }
addEventListener('pagehide', persistNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) persistNow(); });

// ---------- resize ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w / h < 0.75 ? 44 : 36; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

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
  const lo = landMinX() - CAM_EDGE - 2.2 /* FISHING: far enough left to see the river's other bank */ + hw, hi = landMaxX() + CAM_EDGE - hw;
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
  let mv = dlg.open || farm.mode !== 'off' || ward.on ? new THREE.Vector3() : new THREE.Vector3(joy.dx, 0, joy.dy);
  tickWardrobe(dt);
  placeUndo(); tickClear(dt); tickPoofs(dt); tickChips(dt); tickDig(dt); tickSaleBubble(); tickCargo(dt); spots.frame(); dex.frame(dt); tackle.frame();   // FISHING, TACKLE
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
    for (const n of [higgins, fishel]) if (n) { const hx = np.x - n.pos.x, hz = np.z - n.pos.z, hd = Math.hypot(hx, hz); if (hd < 0.65) { np.x = n.pos.x + hx / hd * 0.65; np.z = n.pos.z + hz / hd * 0.65; } }
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
  audio.frame(player.pos.x, player.pos.z, player.moving, onDock(player.pos.x, player.pos.z), currentTOD());
  weather.frame(dt, elapsed, TOD[todKey], todKey);
  animals.frame(dt, elapsed);   // ANIMALS: hens wander, peck, follow and lay
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
  setUse(pickUse() || animals.pickUse());   // ANIMALS: Collect / Pet / Feed, only when nothing else wants the button
  updateMarker(dt);
  updateLine(dt);
  updateMoonPath();
  updateUndo();
  updatePlots(dt);
  if (toolNameT > 0) { toolNameT -= dt; if (toolNameT <= 0) document.getElementById('toolName').hidden = true; }
  // camera follow (player stays centered)
  updateCamOffset(dt);
  // the focus point follows the player; the camera orbits it at the current tilt,
  // so a tilt change is one smooth swing instead of a turn followed by a drop
  camFocus.lerp(camPos.set(camClampX(player.pos.x), player.y, player.pos.z), 1 - Math.exp(-dt * 6));
  camera.position.copy(camFocus).add(camOffset);
  _camLook.set(camFocus.x, camFocus.y + 1.0, camFocus.z);
  if (ward.blend > 0) { wardCam(_wardPos, _wardLook); const e = ward.blend * ward.blend * (3 - 2 * ward.blend); camera.position.lerp(_wardPos, e); _camLook.lerp(_wardLook, e); }
  if (settings.debug && window.__camPeek) { const c = window.__camPeek, h = body.root.position; camera.position.set(h.x + c[0], h.y + c[1], h.z + c[2]); _camLook.set(h.x + (c[5] || 0), h.y + c[3], h.z + (c[4] || 0)); }   // debug: close-up for mockups and tests
  camera.lookAt(_camLook);
  sun.target.position.set(player.pos.x, 0, player.pos.z - 4);
  const sp = TOD[todKey].sunPos; sun.position.set(player.pos.x + sp[0], sp[1], player.pos.z - 4 + sp[2]);
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
  gateToastT -= dt;
  updateHiggins(dt);
  updateFishel(dt);
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
  ensureRosa();
  // STORE: everything the store borrows from this file, in one place
  store.init({ THREE, scene, camera, renderer, M, SCALE, groundY, player, joy, dlg, get S() { return S; }, get body() { return body; }, NO_TILL, ICON, lanternLights, farmToolMesh,
    commit, addItem, invCount, toast, audio, svg, showDialog, closeDialog, setUse, makeBody, setLook, kHat, anim, syncPuppet, locomote, buildDecorMesh, hasTool, renderHotbar, currentTOD,
    refreshFarmTray: () => { if (farm.mode === 'tray' || farm.mode === 'ready') renderFarmTray(); },
    busy: () => decor.on || farm.mode !== 'off' || fishing.state !== 'idle' || ward.on || dlg.open,
    exposure: () => TOD[todKey].exp,
    snapCamera: () => { camFocus.set(camClampX(player.pos.x), player.y || 0, player.pos.z); } });
  // ANIMALS: everything animals.js borrows from this file (before saved decor is put back: the coop is decor)
  animals.init({ THREE, scene, camera, M, SCALE, groundY, player, get S() { return S; }, settings, ICON, cropIcon, plots, commit, addItem, invCount, addXP, toast, audio, svg, renderHotbar, currentTOD,
    respawnDecor: (rec) => { despawnDecor(rec); spawnDecor(rec); }, fenceZ: () => FENCE_Z, wet: (x, z) => spots.onBank(x, z), busy: () => decor.on || farm.mode !== 'off' || fishing.state !== 'idle' || ward.on || dlg.open });
  // FISHING: everything the fishing files borrow from this file, in one place
  { const _fp = new THREE.Vector3(); let sheets = null;
    const anySheet = () => { sheets = sheets || [...document.querySelectorAll('.sheet')]; return sheets.some(x => !x.hidden); };
    const fishApi = { THREE, scene, camera, M, place, groundY, WATER_Y, waterMat, player, townFence, ICON, svg, toast, commit, addItem, addXP, audio, renderHotbar, openSheet, ensureFish, addSplash, fishIcon, todayKey,
      get S() { return S; }, debug: () => settings.debug, cloneFish: (n) => SkeletonUtils.clone(M.fish[n].scene),
      project: (x, y, z) => { _fp.set(x, y, z).project(camera); return { x: (_fp.x + 1) / 2 * innerWidth, y: (1 - _fp.y) / 2 * innerHeight, z: _fp.z }; },
      waterAt: (nx, ny) => { _fp.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize(); if (_fp.y > -0.05) return null; const t = (WATER_Y - camera.position.y) / _fp.y; return { x: camera.position.x + _fp.x * t, z: camera.position.z + _fp.z * t }; },
      hasBait: () => !!bestBait(), holdingRod: () => tool === 'rod', fishelPos: () => fishel && fishel.pos,
      busy: () => decor.on || ward.on || dlg.open || store.inside() || anySheet(), quiet: () => decor.on || ward.on || dlg.open || store.inside() };
    // TACKLE: what the rods file borrows on top of that
    Object.assign(fishApi, { parseGLB, DOCK, bodies: () => Object.values(bodies), worldRod: () => worldRod && { rod: worldRod, tip: worldRodTip },
      fishingBusy: () => fishing.state !== 'idle', fishingPlace: () => fishing.place, freshNear: (x, z) => !!spots.freshTarget(x, z) });
    spots.init(fishApi); dex.init(fishApi); tackle.init(fishApi); spots.sweepSave(); }
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
  window.__ready = true;
  window.__tidewell = { player, get S() { return S; }, fishing, settings, decor, cropIcon, farm, get body() { return body; }, fishIcon, spots, dex, tackle, farmToolMesh, plots, lotView, get clr() { return clr; }, inRock, get dig() { return digModels; }, setLook: (l) => { for (const b of Object.values(bodies)) setLook(b, l); }, joy };   // used by tools/ (screenshots, tests)
  clock.getDelta();
  requestAnimationFrame(frame);
  // Everything else loads quietly in the background, one pack at a time so the game stays smooth:
  // fish first, then every crop (cheapest seeds first). It's all in long before a player can buy
  // seeds or land a catch, so nothing new ever shows a spinner or a stand-in. (The spinner and
  // sprout stay only as a safety net for a very slow connection.)
  setTimeout(async () => {
    await ensureFish();
    animals.start();   // ANIMALS: hens, eggs and the bubble are built here, in the background (before the shop's inside, which lists them)
    await tackle.preload();   // TACKLE: rods, worm, lure, jetty and steps load quietly right after the fish
    await store.preload();   // STORE: the inside of the shop
    for (const id of CROP_ORDER) await ensureCrop(id);
  }, 1500);
})();
