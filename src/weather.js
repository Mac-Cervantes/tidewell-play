// Tidewell — weather (rainy days). All of the weather code lives here; main.js only calls the
// small hooks exported at the bottom (init, frame, and a few helpers for the debug panel).
//
// What Mac picked (try/weather, Nov 2026):
//  - Sunny is the normal weather. Rain comes "now and then": about 5 days in a 14-day season,
//    one spell of 2 to 4 hours, more in spring and fall, less in summer.
//  - Rain follows the real clock and calendar, worked out from world time (UTC), so it is the
//    same for every player, the same after a reload, and it keeps going while you are away.
//  - A spell starts as drizzle, builds to rain, and 1 in 4 turns heavy for a while in the middle.
//  - Rain waters every planted plot (same small boost as the watering can), also while away.
//  - Walking through a puddle makes a little splash. No fish are tied to the weather.
//  - Thunder: never in drizzle or rain; a soft far-off rumble in heavy rain, no flash.
//  - No shadows while it rains: they fade out as the drizzle starts and come back with the sun.
//    In their place each character gets a soft faded blob under their feet, so nobody looks like they float.
//  - A rainbow stands over the water for ten minutes after daytime rain.
//
// More weather (Mac, Nov 14: "All is good let's leave snow for another time", and "Rarer"):
//  - Morning mist (light, mostly over the water) on some mornings; it lifts when the morning ends.
//  - Grey, overcast light for the hour before and after rain, and on the odd dry grey day. No shadows.
//  - Drifting cloud shadows on some sunny days.
//  - Windy spells: leaves in fall, petals in spring, a few green or brown leaves in summer and winter.
//  - Sun showers in spring and summer: drizzle in sunshine, with the rainbow out while it falls.
//  - Fireflies on some dry summer (and late spring) nights.
//  All of these are looks and sounds only, and all come about half as often as first proposed.
//
// Rules this file keeps:
//  - It never owns the lighting. main.js's setTOD() sets the look for the time of day; while it
//    rains this file blends those values toward a rainy look every frame, and when the rain is
//    gone it asks main.js to apply the time of day again. It reads these fields of a TOD entry:
//    sky, fog, sun, hemi, water, lamps, exp, grade.
//  - It has to run smoothly on an iPhone: all raindrops are one draw call, all ripples and
//    splashes one more, puddles one more. If frames get slow it thins the rain out.
import * as THREE from 'three';
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';

// ---------- the schedule: pure functions of the clock ----------
const DAY = 86400000, MIN = 60000;
const EPOCH = Date.UTC(2026, 0, 5);            // same Monday the seasons count from (data.js seasonInfo)
const SEASON_DAYS = 14;
const RAIN_CHANCE = [0.42, 0.22, 0.36, 0.28];  // Spring, Summer, Fall, Winter: chance a day has rain
const SPELL_MIN = [120, 240];                  // a spell lasts 2 to 4 hours
const HEAVY_CHANCE = 0.25;                     // 1 spell in 4 turns heavy in the middle
const MAX_DRY = 3, MAX_WET = 2;                // never more than 3 dry days in a row, or 2 wet
const EDGE_MIN = 12;                           // fades in and out over 12 minutes
const RAINBOW_MIN = 10;

function hash(a, b) {                          // steady 0..1 number from two whole numbers
  let x = 0x9e3779b9;
  for (const v of [a, b]) {
    x ^= (v + 0x7f4a7c15) | 0; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  }
  return (x >>> 0) / 4294967296;
}
const sn4 = (sn) => ((sn % 4) + 4) % 4;        // 0 spring, 1 summer, 2 fall, 3 winter
const SUN_SHOWER = 0.1;                        // 1 warm-season spell in 10 is a sun shower
const YEAR_DAYS = SEASON_DAYS * 26;            // the dry/wet streak rule is worked out a game year (364 days) at a time
const yearCache = new Map();
// every day of one game year: null (dry) or a spell { start, end, heavy } in ms
function yearSpells(y) {
  if (yearCache.has(y)) return yearCache.get(y);
  const out = [];
  let dry = 0, wet = 0;
  for (let d = 0; d < YEAR_DAYS; d++) {
    const D = y * YEAR_DAYS + d, sn = Math.floor(D / SEASON_DAYS);
    let rain = hash(D, 1) < RAIN_CHANCE[sn4(sn)];
    if (dry >= MAX_DRY) rain = true;
    if (wet >= MAX_WET) rain = false;
    if (rain) { wet++; dry = 0; } else { dry++; wet = 0; }
    if (!rain) { out.push(null); continue; }
    const dur = SPELL_MIN[0] + (SPELL_MIN[1] - SPELL_MIN[0]) * hash(D, 2);
    const start = EPOCH + D * DAY + hash(D, 3) * (1440 - dur) * MIN;
    const sun = sn4(sn) < 2 && hash(D, 5) < SUN_SHOWER;   // spring and summer: now and then the rain is a sun shower
    out.push({ start, end: start + dur * MIN, heavy: !sun && hash(D, 4) < HEAVY_CHANCE, sun });
  }
  if (yearCache.size > 3) yearCache.clear();
  yearCache.set(y, out);
  return out;
}
function spellOn(ms) {                         // the spell on the (UTC) day `ms` falls in, or null
  const D = Math.floor((ms - EPOCH) / DAY), y = Math.floor(D / YEAR_DAYS);
  return yearSpells(y)[D - y * YEAR_DAYS];
}
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// How hard it rains at a moment: 0 dry, about 0.3 drizzle, 0.65 rain, 1 heavy.
export function rainAt(ms) {
  const s = spellOn(ms);
  if (!s || ms <= s.start || ms >= s.end) return 0;
  const u = (ms - s.start) / (s.end - s.start);
  const edge = Math.min(ms - s.start, s.end - ms) / (EDGE_MIN * MIN);
  if (s.sun) return Math.min(1, edge) * 0.3;   // a sun shower never gets past drizzle
  let lv = 0.3 + 0.35 * sm(0.08, 0.25, u) * (1 - sm(0.8, 0.95, u));
  if (s.heavy) lv += 0.35 * sm(0.38, 0.46, u) * (1 - sm(0.6, 0.68, u));
  return Math.min(1, edge) * lv;
}
// the spell running now or the next one to come (looks up to 4 weeks ahead)
export function nextSpell(ms) {
  for (let i = 0; i < 28; i++) { const s = spellOn(ms + i * DAY); if (s && s.end > ms) return s; }
  return null;
}
function lastSpellEnd(ms) {                    // when the most recent finished spell ended (today or yesterday)
  for (let i = 0; i < 2; i++) { const s = spellOn(ms - i * DAY); if (s && s.end <= ms) return s.end; }
  return -Infinity;
}
function rainedBetween(a, b) {                 // did it properly rain at any point between two moments?
  if (b <= a) return false;
  for (let t = a, n = 0; n < 40; t += DAY, n++) {
    const s = spellOn(Math.min(t, b));
    if (s && s.start + 5 * MIN < b && s.end - 5 * MIN > a) return true;
    if (t >= b) break;
  }
  return false;
}
// Rain that fell while the player was away: every growth step whose time overlapped rain counts
// as watered (waterMs sooner), like the can. Returns the new plantedAt.
export function awayWatering(plantedAt, growMs, nStages, wateredStage, since, now, waterMs) {
  const step = growMs / (nStages - 1);
  for (let i = 0; i < nStages - 1; i++) {
    const a = Math.max(plantedAt + i * step, since), b = Math.min(plantedAt + (i + 1) * step, now);
    if (b <= a || i === wateredStage) continue;
    if (rainedBetween(a, b)) plantedAt -= waterMs;
  }
  return plantedAt;
}

// ---------- the other weather: when it happens (all from the clock, all rarer than rain) ----------
const GREY_LEAD = 60;                          // minutes of grey sky before and after a rain spell
const GREY_DAY = 1 / 12, CLOUD_DAY = 1 / 8, WIND_DAY = 1 / 8;   // chance per day
const MIST_COLD = 1 / 6, MIST_WARM = 1 / 12;   // chance per morning: fall and winter, spring and summer
const FIREFLY_NIGHT = 0.5;                     // of the dry summer / late-spring nights
const dayOf = (ms) => Math.floor((ms - EPOCH) / DAY);
const seasonOf = (D) => sn4(Math.floor(D / SEASON_DAYS));
// the player's own calendar day (mist and fireflies belong to the local morning and night)
const localDay = (ms) => Math.floor((ms - new Date(ms).getTimezoneOffset() * MIN - EPOCH) / DAY);
function daySpell(D, salt, chance, minM, maxM) {   // at most one spell on a (UTC) day, or null
  if (hash(D, salt) >= chance) return null;
  const dur = minM + (maxM - minM) * hash(D, salt + 100);
  const start = EPOCH + D * DAY + hash(D, salt + 200) * (1440 - dur) * MIN;
  return { start, end: start + dur * MIN };
}
const ramp = (s, ms, edgeMin) => !s || ms <= s.start || ms >= s.end ? 0 : Math.min(1, Math.min(ms - s.start, s.end - ms) / (edgeMin * MIN));
const greySpell = (D) => daySpell(D, 6, GREY_DAY, 120, 300);
const cloudSpell = (D) => daySpell(D, 7, CLOUD_DAY, 180, 360);
const windSpell = (D) => daySpell(D, 8, WIND_DAY, 60, 180);
export function greyAt(ms) {                   // 0..1 overcast: around every rain spell, plus the odd dry grey day
  let g = 0;
  for (let i = -1; i <= 1; i++) {
    const s = spellOn(ms + i * DAY); if (!s || s.sun) continue;
    const L = GREY_LEAD * MIN;
    if (ms > s.start - L && ms < s.end + L) g = Math.max(g, ms < s.start ? 1 - (s.start - ms) / L : ms > s.end ? 1 - (ms - s.end) / L : 1);
  }
  if (!spellOn(ms)) g = Math.max(g, ramp(greySpell(dayOf(ms)), ms, 20));
  return g;
}
export function cloudsAt(ms) {                 // 0..1 drifting cloud shadows, only on days without rain or grey
  const D = dayOf(ms); if (spellOn(ms) || greySpell(D)) return 0;
  return ramp(cloudSpell(D), ms, 10);
}
export function windAt(ms) { return ramp(windSpell(dayOf(ms)), ms, 8); }
export function mistMorning(ms) { const D = localDay(ms); return hash(D, 9) < (seasonOf(D) >= 2 ? MIST_COLD : MIST_WARM); }
export function firefliesTonight(ms) {         // one answer for the whole night, either side of midnight
  const D = localDay(ms - DAY / 2), sn = seasonOf(D), d = ((D % SEASON_DAYS) + SEASON_DAYS) % SEASON_DAYS;
  return (sn === 1 || (sn === 0 && d >= 9)) && hash(D, 10) < FIREFLY_NIGHT;
}

// ---------- the rainy look: what the time-of-day values blend toward at full (heavy) rain ----------
const LOOK = {
  day:     { sky: ['#6f8494', '#a9b8c1'], fog: 0x9fb0bb, sun: [0xc9d3dc, 0.8], hemi: [0xc5d2dc, 0x6f8a80, 1.35], water: 0x47748f, exp: 0.95, lamps: 2, drop: [0.92, 0.96, 1.0, 0.5], ring: 0xffffff },
  evening: { sky: ['#7d7088', '#b3a0a0'], fog: 0x9a92a6, sun: [0xd8b0a4, 0.8], hemi: [0xcabfd4, 0x676280, 1.5], water: 0x425c7c, exp: 0.96, lamps: 4, grade: [150, 140, 200, 0.2], drop: [0.95, 0.92, 0.98, 0.45], ring: 0xf0e4ee },
  night:   { sky: ['#14244a', '#2b446e'], fog: 0x1f3152, sun: [0x97aae6, 1.6], hemi: [0x4260aa, 0x141d3a, 1.2], water: 0x214870, exp: 1.2, lamps: 8.5, drop: [0.72, 0.82, 1.0, 0.36], ring: 0x9db4ee },
};
LOOK.morning = LOOK.day;
const FOG_RAIN = [16, 48];
// morning mist: pale and soft; the far water fades into white
const MIST = { sky: ['#cfdde4', '#eef2ee'], fog: 0xe9eff0, near: 15, far: 50, sun: [0xfff0dc, 1.9], hemi: [0xf4f6f6, 0x9ab89a, 1.15], water: 0x6fb0d8, exp: 1.02 };
const GREY_F = 0.5;                            // a fully overcast sky looks like rain at half strength, without the rain
// what blows past on a windy day, by season: [three colors, size in m, how many of MAX_LEAVES]
const LEAVES = [
  { cols: [0xffd3e2, 0xffffff, 0xffb7d0], size: 0.13, amount: 1 },      // spring: petals
  { cols: [0x6fbf4a, 0x8fd45e, 0x4f9a3a], size: 0.19, amount: 0.4 },   // summer: a few green leaves
  { cols: [0xe8842c, 0xd9541e, 0xf0b93a], size: 0.21, amount: 0.65 },  // fall: leaves
  { cols: [0x9a6a42, 0xb58a5a, 0x7a5233], size: 0.19, amount: 0.25 },  // winter: a few brown leaves
];
const MAX_LEAVES = 120, MAX_FLIES = 22;
const GROUND_WET = 0.7;                        // ground color multiplier when soaked
const MAX_DROPS = 900, MAX_RINGS = 44;
const BOX = new THREE.Vector3(17, 12, 24);     // raindrops live in a box that follows the player
// puddles sit in the same spots every time it rains (x, z, radius); hidden where a plot or decor is
const PUDDLES = [[1.2, 1.0, 0.55], [0.2, -0.6, 0.7], [2.3, 3.6, 0.6], [0.9, 5.2, 0.5], [3.2, 0.2, 0.45], [-0.6, 1.6, 0.4], [1.6, -2.0, 0.5], [2.9, 5.6, 0.65],
  [-4.4, 0.6, 0.55], [-2.2, -1.4, 0.5], [5.6, 2.4, 0.6], [6.8, -0.8, 0.5], [-6.2, 3.8, 0.6], [4.4, 7.2, 0.55]];

let G = null;                                  // everything main.js handed over in init()
const st = { level: 0, target: 0, wet: 0, snap: true, raining: false, quality: 1, slowT: 0, emaDt: 1 / 60,
  grey: 0, clouds: 0, wind: 0, mist: 0, fly: 0, sunny: false, leafKind: 2,
  skyKey: '', gradeKey: '', applied: false, waterT: 0, audioT: 0, thunderT: 40, puddleT: 0, bowUntil: 0, overrideWas: null, fog0: [32, 75] };
let drops, dropU, rings, ringData, puddles, puddleOn = [], bow, blobs, blobTex, cloudSheets, mistSheets, leaves, leafU, flies, flyData;
const MAX_BLOBS = 8, BLOB_DARK = 0.42;
const c1 = new THREE.Color(), c2 = new THREE.Color(), m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();

function buildDrops() {
  // every drop is a thin quad; the vertex shader makes it fall, wrap inside the box and face the camera
  const seed = new Float32Array(MAX_DROPS * 4 * 4), corner = new Float32Array(MAX_DROPS * 4 * 2), idx = [];
  for (let i = 0; i < MAX_DROPS; i++) {
    const r = [Math.random(), Math.random(), Math.random(), i / MAX_DROPS];
    for (let k = 0; k < 4; k++) {
      seed.set(r, (i * 4 + k) * 4);
      corner.set([k % 2 ? 1 : -1, k < 2 ? 0 : 1], (i * 4 + k) * 2);
    }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_DROPS * 12), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  geo.setIndex(idx);
  dropU = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: BOX }, uAmount: { value: 0 }, uLen: { value: 0.5 },
    uSpeed: { value: 10 }, uWind: { value: -0.22 }, uColor: { value: new THREE.Vector4(1, 1, 1, 0.5) } };
  const mat = new THREE.ShaderMaterial({ uniforms: dropU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      attribute vec4 aSeed; attribute vec2 aCorner;
      uniform float uTime, uAmount, uLen, uSpeed, uWind; uniform vec3 uCenter, uBox;
      varying float vA;
      void main() {
        if (aSeed.w >= uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
        float sp = uSpeed * (0.8 + 0.4 * aSeed.z), fall = uTime * sp;
        vec3 lo = uCenter - vec3(uBox.x * 0.5, 0.5, uBox.z * 0.5 + 2.0);
        vec3 p = vec3(aSeed.x * uBox.x + uWind * fall, aSeed.y * uBox.y - fall, fract(aSeed.x * 7.31 + aSeed.y * 3.17) * uBox.z);
        p = lo + mod(p - lo, uBox);
        vec3 dir = normalize(vec3(uWind, -1.0, 0.0));
        vec4 a = modelViewMatrix * vec4(p, 1.0), b = modelViewMatrix * vec4(p - dir * uLen * (0.7 + 0.6 * aSeed.z), 1.0);
        vec2 d = b.xy - a.xy; float dl = max(length(d), 0.0001);
        vec2 side = vec2(-d.y, d.x) / dl;
        vec4 mv = mix(a, b, aCorner.y);
        mv.xy += side * aCorner.x * 0.0009 * (0.8 + 0.5 * aSeed.z) * max(1.0, -mv.z);   // about the same width on screen near and far
        gl_Position = projectionMatrix * mv;
        vA = (0.55 + 0.45 * aSeed.z) * (1.0 - 0.6 * aCorner.y);
      }`,
    fragmentShader: `
      uniform vec4 uColor; varying float vA;
      void main() { gl_FragColor = vec4(uColor.rgb, uColor.a * vA); }` });
  drops = new THREE.Mesh(geo, mat);
  drops.frustumCulled = false; drops.renderOrder = 5; drops.visible = false;
  G.scene.add(drops);
}
function buildRings() {
  // rain rings on the water and tiny splashes on the ground: one instanced mesh, faded through its color
  const geo = new THREE.RingGeometry(0.78, 1, 14); geo.rotateX(-Math.PI / 2);
  rings = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), MAX_RINGS);
  rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rings.frustumCulled = false; rings.renderOrder = 4; rings.visible = false; rings.count = 0;
  ringData = [];
  for (let i = 0; i < MAX_RINGS; i++) { ringData.push({ x: 0, y: 0, z: 0, age: 1 + Math.random(), life: 1, size: 0.3 }); rings.setColorAt(i, c1.set(0)); }
  G.scene.add(rings);
}
function buildPuddles() {
  const geo = new THREE.CircleGeometry(1, 7); geo.rotateX(-Math.PI / 2);
  puddles = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xa9b8c1, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0, depthWrite: false, flatShading: true }), PUDDLES.length);
  puddles.frustumCulled = false; puddles.receiveShadow = true; puddles.visible = false; puddles.renderOrder = 1;
  G.scene.add(puddles);
}
function layPuddles() {                        // called when the ground starts getting wet: skip spots that are in use
  puddleOn = [];
  let n = 0;
  for (let i = 0; i < PUDDLES.length; i++) {
    const [x, z, r] = PUDDLES[i];
    if (!G.puddleOk(x, z)) continue;
    v1.set(x, G.surfaceY(x, z) + 0.015, z); v2.set(r * 1.25, 1, r * 0.8);
    q0.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, i * 1.3);
    puddles.setMatrixAt(n++, m4.compose(v1, q0, v2));
    puddleOn.push(PUDDLES[i]);
  }
  puddles.count = n; puddles.instanceMatrix.needsUpdate = true;
}
function buildBlobs() {
  // a soft round smudge, darkest in the middle and fading to nothing at the edge
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  // drawn in greys on black (not in see-through white): three.js reads an alphaMap from the color, not the alpha
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.45, '#999999'); grad.addColorStop(1, '#000000');
  g.fillStyle = '#000000'; g.fillRect(0, 0, 64, 64); g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(cv);
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  blobs = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x0a1420, alphaMap: blobTex, transparent: true, opacity: 0, depthWrite: false, fog: false }), MAX_BLOBS);
  blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blobs.frustumCulled = false; blobs.renderOrder = 2; blobs.visible = false; blobs.count = 0;
  G.scene.add(blobs);
}
// big soft sheets that drift across: dark ones up high are cloud shadows, pale ones low down are mist
function buildSheets(n, color, depthTest, order) {
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color, alphaMap: blobTex, transparent: true, opacity: 0, depthWrite: false, depthTest, fog: false }), n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false; m.renderOrder = order; m.visible = false;
  G.scene.add(m);
  return m;
}
const wrap = (v, lo, span) => lo + ((((v - lo) % span) + span) % span);
function moveSheets(mesh, elapsed, y, sx, sz, vx, vz, spanX, zLo, spanZ) {
  const px = G.player.pos.x, pz = G.player.pos.z;
  for (let i = 0; i < mesh.count; i++) {
    const x = wrap(i * spanX * 0.37 + elapsed * vx * (0.85 + 0.1 * i), px - spanX / 2, spanX);
    const z = wrap(i * spanZ * 0.41 + elapsed * vz, pz + zLo, spanZ);
    v1.set(x, y, z); v2.set(sx * (0.85 + 0.12 * (i % 3)), 1, sz * (0.9 + 0.1 * ((i + 1) % 3)));
    mesh.setMatrixAt(i, m4.compose(v1, q0.identity(), v2));
  }
  mesh.instanceMatrix.needsUpdate = true;
}
function buildLeaves() {
  // leaves and petals: small tumbling quads carried along by the wind, all in one draw call
  const seed = new Float32Array(MAX_LEAVES * 4 * 4), corner = new Float32Array(MAX_LEAVES * 4 * 2), idx = [];
  for (let i = 0; i < MAX_LEAVES; i++) {
    const r = [Math.random(), Math.random(), Math.random(), i / MAX_LEAVES];
    for (let k = 0; k < 4; k++) { seed.set(r, (i * 4 + k) * 4); corner.set([k % 2 ? 1 : -1, k < 2 ? 0 : 1], (i * 4 + k) * 2); }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_LEAVES * 12), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  geo.setIndex(idx);
  leafU = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(20, 3.2, 24) }, uAmount: { value: 0 }, uSize: { value: 0.08 },
    uDim: { value: 1 }, uC0: { value: new THREE.Color() }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() } };
  const mat = new THREE.ShaderMaterial({ uniforms: leafU, side: THREE.DoubleSide,
    vertexShader: `
      attribute vec4 aSeed; attribute vec2 aCorner;
      uniform float uTime, uAmount, uSize; uniform vec3 uCenter, uBox, uC0, uC1, uC2;
      varying vec3 vCol;
      void main() {
        if (aSeed.w >= uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec3(0.0); return; }
        float t = uTime * (0.8 + 0.5 * aSeed.z);
        vec3 lo = uCenter - vec3(uBox.x * 0.5, -0.15, uBox.z * 0.5 + 2.0);
        vec3 p = vec3(aSeed.x * uBox.x + t * 3.4,
                      aSeed.y * uBox.y - t * 0.3 + 0.35 * sin(t * 2.1 + aSeed.x * 40.0),
                      fract(aSeed.x * 7.31 + aSeed.y * 3.17) * uBox.z + t * 0.8 + 0.5 * sin(t * 1.3 + aSeed.y * 30.0));
        p = lo + mod(p - lo, uBox);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float a = t * 5.0 + aSeed.x * 60.0, flip = 0.35 + 0.65 * abs(sin(t * 3.0 + aSeed.y * 50.0));
        vec2 c = vec2(aCorner.x * uSize * 0.75, (aCorner.y * 2.0 - 1.0) * uSize * 0.5 * flip);
        mv.xy += vec2(c.x * cos(a) - c.y * sin(a), c.x * sin(a) + c.y * cos(a));
        gl_Position = projectionMatrix * mv;
        float k = fract(aSeed.z * 3.0 + aSeed.x);
        vCol = k < 0.34 ? uC0 : (k < 0.67 ? uC1 : uC2);
      }`,
    fragmentShader: `
      uniform float uDim; varying vec3 vCol;
      void main() { gl_FragColor = vec4(vCol * uDim, 1.0); }` });
  leaves = new THREE.Mesh(geo, mat);
  leaves.frustumCulled = false; leaves.visible = false;
  G.scene.add(leaves);
}
function buildFlies() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_FLIES * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_FLIES * 3), 3));
  flies = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.6, map: blobTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  flies.frustumCulled = false; flies.visible = false;
  flyData = [];
  for (let i = 0; i < MAX_FLIES; i++) flyData.push({ x: 0, z: 0, y: 0, ok: false, ph: Math.random() * 20, sp: 0.7 + Math.random() * 0.6 });
  G.scene.add(flies);
}
function homeFly(f) {                          // a spot over land near the player
  const px = G.player.pos.x, pz = G.player.pos.z;
  for (let n = 0; n < 4; n++) {
    const x = px + (Math.random() - 0.5) * 20, z = pz + (Math.random() - 0.5) * 22, y = G.surfaceY(x, z);
    if (y > G.waterY + 0.15) { f.x = x; f.z = z; f.y = y + 0.35 + Math.random() * 0.9; f.ok = true; return; }
  }
  f.ok = false;
}
function buildBow() {
  const cols = [0xff6b6b, 0xffa94d, 0xffe066, 0x8ce99a, 0x74c0fc, 0xb197fc], parts = [];
  cols.forEach((c, i) => {
    const g = new THREE.TorusGeometry(7 - i * 0.28, 0.14, 4, 40, Math.PI), n = g.attributes.position.count, col = new Float32Array(n * 3);
    c1.set(c); for (let k = 0; k < n; k++) col.set([c1.r, c1.g, c1.b], k * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(g);
  });
  bow = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  bow.position.set(-3, -0.3, -19); bow.rotation.y = 0.25; bow.visible = false;
  G.scene.add(bow);
}

// ---------- blending the time-of-day look toward rain ----------
const hexLerp = (a, b, f) => '#' + c1.set(a).lerp(c2.set(b), f).getHexString();
function parseRGBA(s) { const m = /rgba?\(([^)]+)\)/.exec(s || ''); return m ? m[1].split(',').map(Number) : [0, 0, 0, 0]; }
const Tm = { sky: ['', ''], fog: '', sun: ['', 0], hemi: ['', '', 0], water: '', lamps: 0, exp: 1, grade: '' };
function mistMix(T, m) {                       // the time-of-day entry, blended toward the mist look
  Tm.sky[0] = hexLerp(T.sky[0], MIST.sky[0], m); Tm.sky[1] = hexLerp(T.sky[1], MIST.sky[1], m);
  Tm.fog = hexLerp(T.fog, MIST.fog, m);
  Tm.sun[0] = hexLerp(T.sun[0], MIST.sun[0], m); Tm.sun[1] = T.sun[1] + (MIST.sun[1] - T.sun[1]) * m;
  Tm.hemi[0] = hexLerp(T.hemi[0], MIST.hemi[0], m); Tm.hemi[1] = hexLerp(T.hemi[1], MIST.hemi[1], m); Tm.hemi[2] = T.hemi[2] + (MIST.hemi[2] - T.hemi[2]) * m;
  Tm.water = hexLerp(T.water, MIST.water, m);
  Tm.lamps = T.lamps; Tm.exp = T.exp + (MIST.exp - T.exp) * m; Tm.grade = T.grade;
  return Tm;
}
function applyLook(T, key, f, m) {
  const near0 = st.fog0[0] + (MIST.near - st.fog0[0]) * m, far0 = st.fog0[1] + (MIST.far - st.fog0[1]) * m;
  if (m > 0) T = mistMix(T, m);
  const R = LOOK[key] || LOOK.day, q = Math.round(f * 50) / 50;
  const skyKey = key + q + '/' + Math.round(m * 50);
  if (skyKey !== st.skyKey) {                  // the sky is a page background: only touch it when it changes
    st.skyKey = skyKey;
    document.getElementById('sky').style.background = `linear-gradient(${hexLerp(T.sky[0], R.sky[0], q)}, ${hexLerp(T.sky[1], R.sky[1], q)} 60%)`;
    if (R.grade) { const g = parseRGBA(T.grade), r = R.grade; document.getElementById('grade').style.background = `rgba(${g.map((v, i) => +(v + (r[i] - v) * q).toFixed(3)).join(',')})`; }
  }
  const s = G.scene, mix = (a, b) => a + (b - a) * f;
  s.fog.color.set(T.fog).lerp(c2.set(R.fog), f);
  s.fog.near = mix(near0, FOG_RAIN[0]); s.fog.far = mix(far0, FOG_RAIN[1]);
  G.sun.color.set(T.sun[0]).lerp(c2.set(R.sun[0]), f); G.sun.intensity = mix(T.sun[1], R.sun[1]);
  G.sun.shadow.intensity = (1 - sm(0.03, 0.25, f)) * (1 - 0.4 * m);   // no shadows under a rainy or grey sky (Mac); softer ones in mist
  G.hemi.color.set(T.hemi[0]).lerp(c2.set(R.hemi[0]), f); G.hemi.groundColor.set(T.hemi[1]).lerp(c2.set(R.hemi[1]), f); G.hemi.intensity = mix(T.hemi[2], R.hemi[2]);
  const wm = G.waterMat(); if (wm) wm.color.set(T.water).lerp(c2.set(R.water), f);
  const lamps = mix(T.lamps, Math.max(T.lamps, R.lamps)); G.lanternLights.forEach(l => l.intensity = lamps);
  G.renderer.toneMappingExposure = mix(T.exp, R.exp);
  G.waterUniforms.uDash.value = f > 0.42 ? 0 : 1;   // sun sparkles go away once it properly rains
}
function clearLook() {
  st.skyKey = ''; st.applied = false;
  G.scene.fog.near = st.fog0[0]; G.scene.fog.far = st.fog0[1];
  G.waterUniforms.uDash.value = 1;
  G.sun.shadow.intensity = 1;
  G.resetTOD();
}

// debug buttons. 'off', 'drizzle', 'rain', 'heavy' force the rain; 'mist', 'grey', 'clouds', 'leaves', 'petals',
// 'sunshower', 'fireflies' show one kind of weather by itself; nothing = follow the clock
const RAIN_OV = { off: 0, drizzle: 0.3, rain: 0.65, heavy: 1, sunshower: 0.3 };
function override() {
  const o = G.settings.debug ? G.settings.wxOverride : null;
  return o ? { kind: o, rain: RAIN_OV[o] || 0 } : null;
}
const ease = (cur, goal, step) => cur + Math.max(-step, Math.min(step, goal - cur));

function spawnRing(r, cx, cz) {
  r.x = cx + (Math.random() - 0.5) * 20; r.z = cz - 3 + (Math.random() - 0.5) * 26;
  r.y = G.surfaceY(r.x, r.z);
  const water = r.y <= G.waterY + 0.001;
  r.size = water ? 0.32 + Math.random() * 0.3 : 0.1 + Math.random() * 0.06;
  r.life = water ? 1.3 + Math.random() * 0.6 : 0.5 + Math.random() * 0.25;
  r.y += water ? 0.05 : 0.03; r.age = 0;
}

// stepping in a puddle: one really small ring at your feet (Mac), borrowed from the rain-ring pool
function puddleSplash(x, z) {
  let r = ringData[MAX_RINGS - 1];
  for (let i = MAX_RINGS - 1; i >= 0; i--) if (ringData[i].age >= 1) { r = ringData[i]; break; }
  r.x = x; r.z = z; r.y = G.surfaceY(x, z) + 0.05; r.size = 0.11; r.life = 0.45; r.age = 0;
  rings.visible = true;                        // so it still shows on a puddle that outlasts the rain
}

// ---------- once a frame from main.js ----------
function frame(dt, elapsed, T, key) {
  if (!G) return;
  const now = Date.now(), ov = override(), kind = ov ? ov.kind : null;
  // debug: stopping forced rain in daylight brings the rainbow, like the real thing
  if (kind !== st.overrideWas) { if (kind === 'off' && st.level > 0.3 && key !== 'night') st.bowUntil = now + RAINBOW_MIN * MIN; st.overrideWas = kind; }
  st.target = ov ? ov.rain : rainAt(now);
  const spell = ov ? null : spellOn(now);
  // a sun shower keeps the sunny look (at night it is just a drizzle)
  st.sunny = kind === 'sunshower' || (!!spell && spell.sun && key !== 'night');
  const dry = st.target === 0;
  const greyT = ov ? +(kind === 'grey') : greyAt(now);
  const cloudT = ov ? +(kind === 'clouds') : (key === 'night' ? 0 : cloudsAt(now));
  const windT = ov ? +(kind === 'leaves' || kind === 'petals') : windAt(now);
  const mistT = ov ? +(kind === 'mist') : +(key === 'morning' && dry && mistMorning(now));
  const flyT = ov ? +(kind === 'fireflies') : +(key === 'night' && dry && firefliesTonight(now));
  if (st.snap) { st.level = st.target; st.wet = Math.min(1, st.target * 1.15); st.grey = greyT; st.clouds = cloudT; st.wind = windT; st.mist = mistT; st.fly = flyT; st.snap = false; }
  else {
    st.level = ease(st.level, st.target, dt / 5);
    st.grey = ease(st.grey, greyT, dt / 8); st.clouds = ease(st.clouds, cloudT, dt / 8); st.wind = ease(st.wind, windT, dt / 6);
    st.mist = ease(st.mist, mistT, dt / 12); st.fly = ease(st.fly, flyT, dt / 6);
  }
  const lv = st.level < 0.004 ? 0 : st.level;
  const f = st.sunny ? 0 : Math.max(lv, GREY_F * st.grey);   // how far the light goes toward the rainy look

  // slow frames: thin the rain out (never below 40%), and keep it that way for this visit
  st.emaDt += (Math.min(dt, 0.1) - st.emaDt) * 0.05;
  if (lv > 0 && st.emaDt > 1 / 40) { st.slowT += dt; if (st.slowT > 2) { st.quality = Math.max(0.4, st.quality - 0.2); st.slowT = 0; } } else st.slowT = 0;

  // ground wetness lags the rain: soaks in under a minute, dries over a few
  const wetGoal = Math.min(1, lv * 1.15), wasDry = st.wet <= 0.001;
  st.wet += wetGoal > st.wet ? Math.min(dt / 40, wetGoal - st.wet) : Math.max(-dt / 150, wetGoal - st.wet);

  const raining = lv > 0.02 && !st.sunny;       // the rainy tune is for grey rain, not for sun showers
  if (raining !== st.raining) { st.raining = raining; G.audio.setWeather(raining ? 'rain' : null); }
  if ((st.audioT -= dt) <= 0) { st.audioT = 0.25; if (G.audio.setRain) G.audio.setRain(lv); if (G.audio.setWind) G.audio.setWind(st.wind); }

  // light, sky, water
  if (f > 0 || st.mist > 0.002) { applyLook(T, key, f, st.mist); st.applied = true; }
  else if (st.applied) clearLook();
  const gm = G.ground(); if (gm && (st.wet > 0 || !wasDry)) gm.material.color.setScalar(1 - (1 - GROUND_WET) * st.wet);

  // raindrops
  drops.visible = lv > 0;
  if (lv > 0) {
    const R = LOOK[key] || LOOK.day;
    dropU.uTime.value = elapsed; dropU.uCenter.value.copy(G.player.pos);
    dropU.uAmount.value = Math.pow(lv, 1.3) * st.quality;
    dropU.uLen.value = 0.35 + 0.5 * lv; dropU.uSpeed.value = 9 + 5 * lv; dropU.uWind.value = -0.12 - 0.14 * lv;
    dropU.uColor.value.set(R.drop[0], R.drop[1], R.drop[2], R.drop[3]);
  }

  // rings on the water, splashes on the ground
  const nRings = lv > 0 ? Math.round(MAX_RINGS * Math.min(1, lv * 1.1) * st.quality) : 0;
  let live = false;
  if (nRings > 0 || rings.visible) {
    const R = LOOK[key] || LOOK.day, px = G.player.pos.x, pz = G.player.pos.z;
    for (let i = 0; i < MAX_RINGS; i++) {
      const r = ringData[i];
      r.age += dt / r.life;
      if (r.age >= 1) {
        if (i < nRings && r.age >= 1 + (i % 5) * 0.08) spawnRing(r, px, pz);
        else { rings.setMatrixAt(i, m4.makeScale(0, 0, 0)); continue; }
      }
      live = true;
      const k = r.size * (0.15 + 0.85 * r.age);
      v1.set(r.x, r.y, r.z); v2.set(k, 1, k * 0.9);
      rings.setMatrixAt(i, m4.compose(v1, q0.identity(), v2));
      rings.setColorAt(i, c1.set(R.ring).multiplyScalar(0.6 * Math.pow(1 - r.age, 1.3)));
    }
    rings.count = MAX_RINGS; rings.visible = live;
    rings.instanceMatrix.needsUpdate = true; if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
  }

  // soft blobs under the characters, fading in as the real shadows fade out
  const blobA = BLOB_DARK * sm(0.03, 0.25, f);
  blobs.visible = blobA > 0.005;
  if (blobs.visible) {
    const feet = G.feet(); let n = 0;
    for (const f of feet) {
      if (n >= MAX_BLOBS) break;
      v1.set(f.x, f.y + 0.035, f.z); v2.set(0.62, 1, 0.52);   // Mac: smaller (was 0.95 x 0.8)
      blobs.setMatrixAt(n++, m4.compose(v1, q0.identity(), v2));
    }
    blobs.count = n; blobs.material.opacity = blobA; blobs.instanceMatrix.needsUpdate = true;
  }

  // puddles
  if (wasDry && st.wet > 0.001) layPuddles();
  const pud = 0.6 * sm(0.35, 0.8, st.wet);
  puddles.visible = pud > 0.01 && puddles.count > 0;
  if (puddles.visible) {
    puddles.material.opacity = pud;
    puddles.material.color.set((LOOK[key] || LOOK.day).sky[1]);
    // walking through one: a little splash and a plip, at most a few a second
    st.puddleT -= dt;
    if (G.player.moving && st.puddleT <= 0 && pud > 0.3) {
      const x = G.player.pos.x, z = G.player.pos.z;
      for (const p of puddleOn) if (Math.hypot(x - p[0], z - p[1]) < p[2] * 1.05) { puddleSplash(x, z); G.splash(x, z); st.puddleT = 0.28; break; }
    }
  }

  // rain waters the crops (same boost as the can, once per growth step)
  if (lv > 0.15 && (st.waterT -= dt) <= 0) { st.waterT = 4; G.waterCrops(); }

  // heavy rain only: a soft, far-off rumble now and then. No flash.
  if (lv > 0.85) { if ((st.thunderT -= dt) <= 0) { st.thunderT = 25 + Math.random() * 35; G.audio.play('rumble'); } }
  else st.thunderT = Math.min(st.thunderT, 12);

  // rainbow: ten minutes after a daytime spell ends (from the clock, so a reload keeps it)
  let bowLeft = 0;
  if (lv < 0.05 && key !== 'night') {
    const end = ov == null ? lastSpellEnd(now) + RAINBOW_MIN * MIN : 0;
    bowLeft = Math.max(end, st.bowUntil) - now;
  }
  let bowGoal = bowLeft > 0 ? 0.5 * Math.min(1, bowLeft / MIN) : 0;
  if (st.sunny && lv > 0.1) bowGoal = 0.5;      // a sun shower has its rainbow out while it falls
  bow.material.opacity += Math.max(-dt / 20, Math.min(dt / 20, bowGoal - bow.material.opacity));
  bow.visible = bow.material.opacity > 0.005;

  // cloud shadows drifting over a sunny day
  cloudSheets.visible = st.clouds > 0.01;
  if (cloudSheets.visible) { cloudSheets.material.opacity = 0.5 * st.clouds; moveSheets(cloudSheets, elapsed, 4, 15, 10.5, 0.9, 0.25, 54, -24, 46); }

  // mist: pale bands drifting low over the far side of the view
  mistSheets.visible = st.mist > 0.01;
  if (mistSheets.visible) { mistSheets.material.opacity = 0.45 * st.mist; moveSheets(mistSheets, elapsed, 1.3, 17, 6, 0.35, 0, 44, -20, 15); }

  // wind: leaves or petals for the season
  leaves.visible = st.wind > 0.01;
  if (leaves.visible) {
    if (st.wind < 0.05 || kind === 'leaves' || kind === 'petals') st.leafKind = kind === 'petals' ? 0 : kind === 'leaves' ? 2 : seasonOf(dayOf(now));
    const K = LEAVES[st.leafKind];
    leafU.uTime.value = elapsed; leafU.uCenter.value.copy(G.player.pos);
    leafU.uAmount.value = K.amount * st.wind * st.quality; leafU.uSize.value = K.size;
    leafU.uDim.value = key === 'night' ? 0.45 : key === 'evening' ? 0.85 : 1;
    leafU.uC0.value.set(K.cols[0]); leafU.uC1.value.set(K.cols[1]); leafU.uC2.value.set(K.cols[2]);
  }

  // fireflies: each one wanders around its own spot and glows on and off
  flies.visible = st.fly > 0.01;
  if (flies.visible) {
    const pos = flies.geometry.attributes.position, col = flies.geometry.attributes.color, px = G.player.pos.x, pz = G.player.pos.z;
    for (let i = 0; i < MAX_FLIES; i++) {
      const fl = flyData[i];
      if (!fl.ok || Math.abs(fl.x - px) > 13 || Math.abs(fl.z - pz) > 14) homeFly(fl);
      const t = elapsed * fl.sp + fl.ph;
      pos.setXYZ(i, fl.x + 0.5 * Math.sin(t * 0.7), fl.y + 0.18 * Math.sin(t * 1.3), fl.z + 0.5 * Math.cos(t * 0.53));
      const glow = fl.ok ? 1.5 * st.fly * Math.pow(0.5 + 0.5 * Math.sin(t * 1.1), 2) : 0;
      col.setXYZ(i, glow, glow * 0.95, glow * 0.4);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }
}

function init(g) {
  G = g;
  st.fog0 = [g.scene.fog.near, g.scene.fog.far];
  buildDrops(); buildRings(); buildPuddles(); buildBlobs(); buildBow();
  cloudSheets = buildSheets(3, 0x10223f, false, 3); mistSheets = buildSheets(4, 0xffffff, true, 3); buildLeaves(); buildFlies();
  st.snap = true;
  if (rainAt(Date.now()) > 0 || (override() && override().rain > 0)) layPuddles();
}
function describe(now = Date.now()) {          // a few lines for the debug panel: what the clock has in store
  const f = (t) => new Date(t).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const day = (t) => new Date(t).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const s = nextSpell(now); let out = 'No rain in the next 4 weeks';
  if (s) {
    const mins = Math.round((s.end - s.start) / MIN), len = `${Math.floor(mins / 60)} h ${mins % 60} min`;
    out = (s.start <= now ? `Raining until ${f(s.end)}` : `Next rain: ${f(s.start)}, ${len}`) + (s.sun ? ', a sun shower' : s.heavy ? ', turns heavy' : '');
  }
  const next = {}, D0 = dayOf(now);
  for (let i = 0; i < 56; i++) {
    const D = D0 + i, t = now + i * DAY, r = spellOn(EPOCH + D * DAY + 1);
    const w = windSpell(D); if (!next.Wind && w && w.end > now) next.Wind = f(w.start);
    const g = !r && greySpell(D); if (!next['Grey day'] && g && g.end > now) next['Grey day'] = f(g.start);
    const c = !r && !greySpell(D) && cloudSpell(D); if (!next.Clouds && c && c.end > now) next.Clouds = f(c.start);
    if (!next.Mist && mistMorning(t) && !(i === 0 && new Date(now).getHours() >= 10)) next.Mist = day(t) + ' morning';
    if (!next['Sun shower'] && r && r.sun && r.end > now) next['Sun shower'] = f(r.start);
    if (!next.Fireflies && firefliesTonight(t + DAY / 2)) next.Fireflies = day(t) + ' night';
  }
  const rest = Object.keys(next).map(k => `${k}: ${next[k]}`);
  return out + (rest.length ? '. Also coming. ' + rest.join('. ') + '.' : '.');
}

export const weather = {
  init, frame, describe, rainAt, nextSpell, awayWatering, greyAt, cloudsAt, windAt, mistMorning, firefliesTonight,
  setOverride(o) { if (G) { G.settings.wxOverride = o || null; } },
  get level() { return st.level; },
  _debug() { return { ...st, sun: G && G.sun.intensity, dropsOn: drops && drops.visible, drops: dropU && dropU.uAmount.value, rings: rings && rings.visible, puddles: puddles && puddles.count }; },
};
