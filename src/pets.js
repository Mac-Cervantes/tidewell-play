// Tidewell — pets (try/pets). Companions that follow you round the harbor; one follows at a time, the rest stay home.
//
// The fish (Mac's picks, Nov 16): a code-made goldfish in a clear bubble. A stray that jumps beside the dock at town
// level 2 (free, Adopt); floats low right behind you and drifts close by when you stand still; treats fill three
// hearts and each heart makes bites come faster (2 / 5 / 10%); its bed is a fish bowl on a stool; hops in beside your
// bobber while you fish.
// The puppy (Mac's picks, Nov 17): the Quaternius Shiba Inu, small. It arrives in a crate at the foot of the dock at town level 4
// (when the cargo ship opens; free, Adopt); walks right behind you or at your side, whichever it likes when there's
// room; its bed is a doghouse; no bonus yet.
// Both: tap the pet for picture buttons (pet, treat, name) and tap its name tag for a small card; beds are placed
// like decor; asleep in bed at night.
// Hooks in main.js are marked PETS (import, tap, frame, pickUse, init, start, the bite wait, petSolid).
import { ITEMS, DECOR, STORE, PETS } from './data.js';
export { PETS };   // the numbers live in data.js since v0.1.68

const K = PETS.kinds;
const TRY = false;                            // TRY: the try-out panel (levels, free pets, treats, no daily limit, fps). Off since the merge (v0.1.68).

let A = null, THREE = null, ready = false, dogSrc = null;
const srcs = {};                              // loaded models by kind: dog (Shiba), cat
const rt = {};                                // each pet in the world, by kind: { g, x, z, y, yaw, sp, ... }
const strays = {};                            // the fish jumping by the dock, the puppy in its crate
let ui = null, ring = null, card = null, sheet = null, ray = null;
let fx = [], fpsAvg = 60, lastT = 0, idleT = 0;
const _v = { p: null };

const fresh = () => ({ v: 1, list: [], day: '', fed: 0, fast: false });
const st = () => { const S = A.S; if (!S.pets || S.pets.v !== 1) S.pets = fresh(); return S.pets; };
const pet = (k) => st().list.find(p => p.k === k) || null;
const heartsOf = (p) => (p.treats >= PETS.treatsFor[2] ? 3 : p.treats >= PETS.treatsFor[1] ? 2 : 1);
const pct = (p) => Math.round(PETS.bonus[heartsOf(p) - 1] * 100);
const rnd = (a, b) => a + Math.random() * (b - a);
const today = () => new Date().toDateString();
const bedRec = (k) => A.S.decor.find(r => r.id === K[k].bed) || null;
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ok = (x, z) => A.walkable(x, z) && !A.solid(x, z);
const eachEv = (el) => { for (const ev of ['pointerdown', 'pointerup', 'pointermove', 'touchstart']) el.addEventListener(ev, e => e.stopPropagation()); };
// the fish's bonus (Mac: "tied to the treats you feed it … 2, 5, 10% with more hearts"); only while it's out with you
export const biteMul = () => { const p = A && pet('fish'); return p && rt.fish && rt.fish.out ? 1 - PETS.bonus[heartsOf(p) - 1] : 1; };

// ---------- registered as soon as this file loads, so a save with a placed bed opens cleanly ----------
ITEMS.pet_treat = { name: 'Pet treat', kind: 'feed', rarity: 'common', price: 2, buy: PETS.treat.buy };
DECOR.fishbowl = { name: 'Fish bowl', model: ['pirate', 'barrel', 0.6], size: [1, 1], buy: 0, fixed: true, build: () => buildBowl() };
ITEMS.decor_fishbowl = { name: DECOR.fishbowl.name, kind: 'decor', rarity: 'common', price: 0, decor: 'fishbowl' };
DECOR.doghouse = { name: 'Doghouse', model: ['pirate', 'barrel', 0.6], size: [2, 2], buy: 0, turns: [0, 1, 3], build: (r) => buildDoghouse(r) };   // turns: door to the front, right or left, never the back (Mac, v0.1.92)
ITEMS.decor_doghouse = { name: DECOR.doghouse.name, kind: 'decor', rarity: 'common', price: 0, decor: 'doghouse' };
DECOR.catbed = { name: 'Cat basket', model: ['pirate', 'barrel', 0.6], size: [1, 1], buy: 0, fixed: true, build: () => buildCatBed() };
ITEMS.decor_catbed = { name: DECOR.catbed.name, kind: 'decor', rarity: 'common', price: 0, decor: 'catbed' };
if (STORE.extra) STORE.extra.items.treat = {   // one more tile in Nell's Animals tab
  pic: () => `<img src="${treatPicture()}" alt="">`,
  info: () => ({ name: `Pet treats ×${PETS.treat.pack}`, price: PETS.treat.buy, level: STORE.level, own: false, once: false, have: A ? A.invCount('pet_treat') : 0, blurb: '' }),
  can: () => '', give: (q) => { A.addItem('pet_treat', q * PETS.treat.pack); A.toast(`+${q * PETS.treat.pack} pet treats`); },
};

export function init(api) {
  A = api; THREE = api.THREE; _v.p = new THREE.Vector3();
  Object.assign(A.ICON, {
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    hand: '<path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6 7-3 0-4.5-1.5-6-4l-2-3.5a1.5 1.5 0 0 1 2.6-1.5L8 14"/>',
    treat: '<circle cx="12" cy="12" r="8.5"/><circle cx="9" cy="9.5" r=".9"/><circle cx="14.5" cy="9" r=".9"/><circle cx="15" cy="14.5" r=".9"/><circle cx="9.5" cy="15" r=".9"/><circle cx="12" cy="12" r=".9"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    pencil: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
    petfish: '<path d="M3 12c3-5 9-6 13-2l4-3v10l-4-3c-4 4-10 3-13-2z"/><circle cx="8" cy="11" r=".9"/>',
    walk: '<circle cx="13" cy="4.5" r="2"/><path d="M13 8l-3 4 3 3v6M10 12l-3 1M13 10l4 2M10 15l-3 5"/>',
    home: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-6h4v6"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    fast: '<path d="M4 6l7 6-7 6M13 6l7 6-7 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    fishbowl: '<path d="M8 5h8"/><path d="M9 5c-4 2-5.5 5-5.5 8a8.5 8.5 0 0 0 17 0c0-3-1.5-6-5.5-8"/><path d="M5 12q3.5-2 7 0t7 0"/>',
    doghouse: '<path d="M3 11l9-7 9 7v9H3z"/><path d="M9 20v-5a3 3 0 0 1 6 0v5"/>',
    catbed: '<ellipse cx="12" cy="15" rx="9" ry="5"/><path d="M3 15c0-4 4-7 9-7s9 3 9 7"/>',
    paw: '<ellipse cx="12" cy="16" rx="5.5" ry="4.5"/><ellipse cx="5" cy="10.5" rx="2.2" ry="2.8"/><ellipse cx="9.3" cy="6.2" rx="2.2" ry="2.8"/><ellipse cx="14.7" cy="6.2" rx="2.2" ry="2.8"/><ellipse cx="19" cy="10.5" rx="2.2" ry="2.8"/>',
  });
}
export function start() {
  if (!A || ready) return;
  buildUI();
  ready = true;
  // the puppy's model: its own pack, loaded quietly in the background (decision 57); the fish is made in code
  import('../assets/pack-pets.js').then(m => Promise.all([
    A.parseGLB(m.default.ShibaInu, '').then(g => { dogSrc = g; srcs.dog = g; }),
    A.parseGLB(m.default.Cat, '').then(g => { srcs.cat = g; }),
  ])).catch(() => {});
}

// ---------- models ----------
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.85, ...o });
function mesh(geo, m, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; return o; }
function buildFish() {
  const g = new THREE.Group(), Rr = 0.15, fin = mat(0xffb35c, { side: THREE.DoubleSide });
  g.add(mesh(new THREE.IcosahedronGeometry(Rr, 1), mat(0xff9340), 0, 0, 0, 0.9, 1, 1.2));
  g.add(mesh(new THREE.IcosahedronGeometry(Rr, 1), mat(0xffd9a0), 0, -0.035, 0.02, 0.78, 0.8, 1.02));
  const tail = new THREE.Group(); tail.position.set(0, 0, -0.16); g.add(tail);
  for (const s of [-1, 1]) {
    const f = mesh(new THREE.ConeGeometry(0.085, 0.2, 4), fin, 0, s * 0.055, -0.09, 0.35, 1, 1); f.rotation.x = Math.PI / 2 + s * 0.55; tail.add(f);
    const p = mesh(new THREE.ConeGeometry(0.05, 0.11, 4), fin, s * 0.13, -0.05, 0.02, 0.35, 1, 1); p.rotation.set(0.5, 0, -s * 1.9); g.add(p);
    g.add(mesh(new THREE.SphereGeometry(0.047, 12, 10), mat(0xffffff, { flatShading: false }), s * 0.098, 0.035, 0.105));
    g.add(mesh(new THREE.SphereGeometry(0.026, 10, 8), mat(0x2b2140, { flatShading: false }), s * 0.128, 0.04, 0.122));
    g.add(mesh(new THREE.SphereGeometry(0.022, 8, 6), mat(0xff7f8f, { flatShading: false }), s * 0.1, -0.03, 0.14, 1, 0.6, 1));
  }
  const d = mesh(new THREE.ConeGeometry(0.06, 0.12, 4), fin, 0, 0.16, -0.03, 0.3, 1, 1.3); d.rotation.x = -0.5; g.add(d);
  g.scale.setScalar(1.3); g.userData.tail = tail;
  return g;
}
// the clear bubble (round 2, option A): a faint white film and rim, so the fish keeps its colors
function buildBubble(r = 0.37) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, roughness: 0.15, depthWrite: false })));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 24, 18), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, side: THREE.BackSide, depthWrite: false })));
  const hi = new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })); hi.position.set(-r * 0.5, r * 0.55, r * 0.55); hi.scale.set(1, 1.5, 0.5); g.add(hi);
  return g;
}
function buildBlob() { const m = new THREE.Mesh(new THREE.CircleGeometry(0.24, 20), new THREE.MeshBasicMaterial({ color: 0x2b2140, transparent: true, opacity: 0.18, depthWrite: false })); m.rotation.x = -Math.PI / 2; return m; }
const BOWL_Y = 0.6;
function buildBowl() {
  const g = new THREE.Group(), wood = mat(0xa9713d), dark = mat(0x7a4d28);
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.07, 10), wood, 0, 0.36));
  for (const [x, z] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) g.add(mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.34, 6), dark, x, 0.17, z));
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 18, 0, Math.PI * 2, 0.5, Math.PI), new THREE.MeshStandardMaterial({ color: 0xeefaff, transparent: true, opacity: 0.26, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false })); glass.position.y = 0.63; g.add(glass);
  const rim = mesh(new THREE.TorusGeometry(0.135, 0.016, 6, 20), mat(0xe9fbff, { flatShading: false }), 0, 0.868, 0); rim.rotation.x = Math.PI / 2; g.add(rim);
  const w = new THREE.Mesh(new THREE.CircleGeometry(0.25, 24), new THREE.MeshStandardMaterial({ color: 0x57b8e6, transparent: true, opacity: 0.7, roughness: 0.2 })); w.rotation.x = -Math.PI / 2; w.position.y = 0.72; g.add(w);
  for (let i = 0; i < 6; i++) g.add(mesh(new THREE.IcosahedronGeometry(0.035, 0), mat([0xd9d2c5, 0xb7c7d6, 0xf2c9a0][i % 3]), Math.cos(i) * 0.1, 0.42, Math.sin(i * 1.7) * 0.1));
  return g;
}
// the doghouse (round 3, option B): a 2 × 2 footprint, the house at the back and a mat in front where the puppy lies
const MAT_Z = 0.5;
function buildDoghouse(r = 0) {
  const top = new THREE.Group(), g = new THREE.Group(); top.add(g); g.rotation.y = r * Math.PI / 2;
  const wood = mat(0xb9793f), roof = mat(0xd0483c), dark = mat(0x3a2a22), W = 1.0, D = 1.05, H = 0.7, cz = -0.42;
  g.add(mesh(new THREE.BoxGeometry(W, H, D), wood, 0, H / 2, cz));
  for (const sd of [-1, 1]) { const r = mesh(new THREE.BoxGeometry(0.74, 0.06, D + 0.2), roof, sd * 0.27, H + 0.2, cz); r.rotation.z = -sd * 0.72; g.add(r); }
  const gb = mesh(new THREE.CylinderGeometry(0.5, 0.5, D - 0.02, 3), wood, 0, H + 0.12, cz, 1, 0.7, 1); gb.rotation.x = Math.PI / 2; g.add(gb);
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.04), dark, 0, 0.25, cz + D / 2 + 0.005));
  const arch = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 12, 1, false, 0, Math.PI), dark, 0, 0.5, cz + D / 2 + 0.005); arch.rotation.set(Math.PI / 2, 0, Math.PI / 2); g.add(arch);
  const m = mesh(new THREE.BoxGeometry(0.95, 0.05, 0.7), mat(0xe9c98f), 0, 0.03, MAT_Z); m.castShadow = false; m.receiveShadow = true; g.add(m);
  // a water bowl and a food bowl down the right side, a bone on the left (Mac, v0.1.95: mockup C plus the bone). Looks only.
  const bowl = (x, z, fill) => { const b = mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.09, 12), mat(0xd0483c), x, 0.045, z); g.add(b); const w = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 12), mat(fill, { flatShading: false }), x, 0.085, z); w.castShadow = false; g.add(w); };
  bowl(0.74, 0.74, 0x57b8e6); bowl(0.74, 0.36, 0x9a6a3c);
  const bone = new THREE.Group(), bm = mat(0xfff3d6, { flatShading: false });
  const bar = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 8), bm); bar.rotation.z = Math.PI / 2; bone.add(bar);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bone.add(mesh(new THREE.SphereGeometry(0.055, 8, 6), bm, sx * 0.14, 0, sz * 0.04));
  bone.position.set(-0.74, 0.055, 0.62); bone.rotation.y = 0.5; g.add(bone);
  return top;
}
function buildCrate() {
  const g = new THREE.Group(), wood = mat(0xb9793f), dark = mat(0x8a5a2b), S = 0.78, Hh = 0.3;
  g.add(mesh(new THREE.BoxGeometry(S, 0.05, S), dark, 0, 0.025, 0));
  for (const [x, z, w, d] of [[0, -S / 2, S, 0.05], [0, S / 2, S, 0.05], [-S / 2, 0, 0.05, S], [S / 2, 0, 0.05, S]]) g.add(mesh(new THREE.BoxGeometry(w, Hh, d), wood, x, Hh / 2, z));
  for (const [x, z] of [[-S / 2, -S / 2], [S / 2, -S / 2], [-S / 2, S / 2], [S / 2, S / 2]]) g.add(mesh(new THREE.BoxGeometry(0.08, Hh + 0.04, 0.08), dark, x, Hh / 2, z));
  return g;
}
// the walkers (puppy, cat): one model each (nose along +z), set on its feet, sized by length, with one action per clip
const CAT_COATS = { tux: { Grey: 0x5a5a66, White: 0xf4f1ea, Pink: 0xf29bb2 }, orange: { Grey: 0xf0943c, White: 0xfff3e0, Pink: 0xf29bb2 }, tabby: { Grey: 0xf0943c, White: 0xfff3e0, Pink: 0xf29bb2, stripe: 0.62 } };
const catLab = () => (typeof window !== 'undefined' && window.__catLab) || {};
const catCoat = () => CAT_COATS[catLab().coat || K.cat.coat] || CAT_COATS.tux;
// tabby stripes, painted in the shader from each point's place on the model at rest (x runs nose to tail, z is up), so they stay put while it walks
function tabby(m, dark) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uStripe = { value: dark };
    sh.vertexShader = 'varying vec3 vCatP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCatP = position;');
    sh.fragmentShader = 'varying vec3 vCatP;\nuniform float uStripe;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { float tail = smoothstep(-0.0165, -0.0195, vCatP.x);
        float along = mix((vCatP.x + abs(vCatP.y) * 0.9) * 520.0, vCatP.z * 640.0, tail);
        float band = smoothstep(0.35, 0.6, sin(along));
        float back = mix(smoothstep(0.016, 0.024, vCatP.z), 1.0, tail);
        float face = smoothstep(0.019, 0.015, vCatP.x);
        diffuseColor.rgb *= mix(1.0, uStripe, band * back * face); }`);
  };
  m.customProgramCacheKey = () => 'tabby';
}   // the pack's tuxedo cat; the colours didn't survive the file conversion
// the cat pack only has Idle and Walking, so every other clip the code asks for falls back to one of those
const CLIP = { cat: { Idle: 'Idle', Walk: 'Walking', Gallop: 'Walking', Idle_2: 'Idle', Idle_2_HeadLow: 'Idle', Eating: 'Idle', Jump_ToIdle: 'Idle', Death: 'Idle' } };
const rigs = {};
function buildRig(k) {
  if (rigs[k]) return rigs[k];
  const src = srcs[k], s = src.scene, w = new THREE.Group();
  s.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { m.metalness = 0; m.roughness = 0.85; m.flatShading = true; if (k === 'cat') { const coat = catCoat(); if (coat[m.name] != null) m.color.setHex(coat[m.name]); if (m.name === 'Grey' && coat.stripe) tabby(m, coat.stripe); } m.needsUpdate = true; }); } });
  if (k === 'cat') s.rotation.y = -Math.PI / 2;   // the pack's cat has its nose along +x; turned to +z like the puppy (it walked sideways in v0.1.72)
  s.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(s, true), sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  s.position.set(-c.x, -box.min.y, -c.z); w.add(s); w.scale.setScalar((k === 'cat' && catLab().length || K[k].length) / Math.max(sz.x, sz.z));
  const mx = new THREE.AnimationMixer(s), acts = {};
  for (const a of src.animations) acts[a.name.split('|').pop()] = mx.clipAction(a);
  let blob = null;
  if (k === 'cat') { blob = buildBlob(); blob.material.opacity = 0.3; const u = 1 / w.scale.x, big = K.cat.length / 0.7; blob.scale.set(0.62 * u * big, 1.05 * u * big, 1); blob.position.y = 0.025 * u; blob.renderOrder = 1; w.add(blob); }   // soft dark patch right under the cat, so it reads as sitting on the grass (the sun's shadow alone lands a little away from it)
  return (rigs[k] = { w, s, blob, baseY: s.position.y, mx, acts, cur: '' });
}
const buildDog = () => buildRig('dog');
// blend to a clip; the puppy's 'Death' is borrowed as its lying-down pose (no sleep clip in the pack): it starts near its end and holds there
function anim(k, want, dt, speed = 1) {
  const d = rigs[k]; if (!d) return;
  const name = (CLIP[k] && CLIP[k][want]) || want, once = k === 'dog' && (name === 'Death' || name === 'Jump_ToIdle');
  if (d.cur !== name) {
    const a = d.acts[name]; a.reset(); a.enabled = true; a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = true;
    if (k === 'dog' && name === 'Death') a.time = a.getClip().duration * 0.88;
    a.fadeIn(0.22).play(); if (d.cur) d.acts[d.cur].fadeOut(0.22); d.cur = name;
  }
  d.acts[name].timeScale = speed; d.mx.update(dt);
}
const dogAnim = (name, dt, speed) => anim('dog', name, dt, speed);
// ---------- the cat loaf (v0.1.74, from Mac's photo): what the cat does when it's been still for a while ----------
// One pose, the full loaf: compact body, head up, paws tucked under, tail wrapped round its side. (v0.1.73's partial and face-plant
// loaves are gone, Mac: "those don't make physical sense".) The pack has no sitting clip, so it's posed in code on top of the idle:
// the legs tuck up into the body, the body settles, shortens a little and tips its chest up, and the tail is laid along the hip.
const LOAF = { legs: ['Bone014', 'Bone017', 'Bone008', 'Bone011'], tailBones: ['Bone004', 'Bone005', 'Bone006', 'Bone007'],
  tuck: 0.05, drop: 0.98, neck: 0.55, head: -0.48, squash: [0.82, 1.08], pitch: -0.08,
  tail: [[0.7, -0.8, -0.1], [0.55, -0.3, 0.8], [0.1, -0.05, 1], [-0.3, 0, 1]] };   // each tail piece's direction: x = the cat's side, y = up, z = its nose
function catPose(rig, k) {
  if (!rig || rig.noPose) return;
  if (!rig.b) {
    rig.b = {}; rig.s.traverse(o => { if (o.isBone) rig.b[o.name] = o; });
    if (![...LOAF.legs, ...LOAF.tailBones, 'Bone016'].every(n => rig.b[n])) { rig.noPose = true; return; }
    rig.w.updateWorldMatrix(true, true);
    const at = (n) => rig.b[n].getWorldPosition(new THREE.Vector3());   // leg length along the bones, so it's the same whatever pose the cat is in right now
    rig.leg = (at('Bone014').distanceTo(at('Bone015')) + at('Bone015').distanceTo(at('Bone016'))) / (rig.w.getWorldScale(new THREE.Vector3()).x || 1);
    rig.q = new THREE.Quaternion(); rig.q2 = new THREE.Quaternion(); rig.wq = new THREE.Quaternion(); rig.v = new THREE.Vector3(); rig.up = new THREE.Vector3(0, 1, 0);
  }
  const b = rig.b, L = LOAF, tuck = 1 + (L.tuck - 1) * k;
  for (const n of L.legs) b[n].scale.setScalar(tuck);
  rig.s.position.y = rig.baseY - rig.leg * L.drop * k;
  rig.s.scale.set(1 + (L.squash[0] - 1) * k, 1 + (L.squash[1] - 1) * k, 1);   // the model's own x is its nose-to-tail line
  rig.w.rotation.x = L.pitch * k;
  if (rig.blob) rig.blob.rotation.x = -Math.PI / 2 - L.pitch * k;
  if (k <= 0.001) return;
  if (b.Bone002 && b.Bone003) {   // sphinx neck: chest bone tips up, head tips back down to level (the walk/idle clip resets these every frame)
    rig.e = rig.e || new THREE.Euler();
    rig.e.set(L.neck * k, 0, 0); b.Bone002.quaternion.multiply(rig.q.setFromEuler(rig.e));
    rig.e.set(L.head * k, 0, 0); b.Bone003.quaternion.multiply(rig.q.setFromEuler(rig.e));
  }
  rig.w.updateWorldMatrix(true, true); rig.w.getWorldQuaternion(rig.wq);
  L.tailBones.forEach((n, i) => {
    const bone = b[n]; rig.v.set(L.tail[i][0], L.tail[i][1], L.tail[i][2]).normalize().applyQuaternion(rig.wq);
    rig.q.setFromUnitVectors(rig.up, rig.v);                                   // point the bone (its own +y) along that direction…
    bone.parent.getWorldQuaternion(rig.q2).invert(); rig.q2.multiply(rig.q);   // …in its parent's space
    bone.quaternion.slerp(rig.q2, k); bone.updateMatrixWorld(true);
  });
}
// o is the stray or the pet cat: after a few seconds of standing still it settles into the loaf, and stands up quickly when it moves
function catLoaf(o, dt, still, sleepy) {
  o.stillT = still ? (o.stillT || 0) + dt : 0;
  o.loaf = still && (sleepy || o.stillT > 3.5);
  const want = o.loaf ? 1 : 0; o.loafK = (o.loafK || 0) + (want - (o.loafK || 0)) * Math.min(1, dt * (want ? 2.5 : 8));
  catPose(rigs.cat, o.loafK < 0.01 ? 0 : o.loafK);
}
function buildCatBed() {   // a round basket with a cushion
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.4, 0.34, 0.16, 12), mat(0xb9793f), 0, 0.08, 0));
  const c = mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.06, 12), mat(0xf2a0b5), 0, 0.17, 0); c.castShadow = false; g.add(c);
  g.scale.set(1.3, 1, 1.3);   // the cat got bigger in v0.1.76
  return g;
}

// ---------- the pets in the world ----------
function spawn(k, x, z) {
  if (rt[k]) return rt[k];
  if (k !== 'fish' && !srcs[k]) return null;
  const P = A.player.pos, g = new THREE.Group();
  const R = { k, g, x: x ?? P.x - 0.8, z: z ?? P.z, y: 0, yaw: 0, sp: 0, k1: 1, loop: 0, spin: 0, roamT: 1, goal: null, look: null, stuck: 0, woke: false, doze: false, out: false, bubT: 2, shot: null, slot: 'back', slotT: 0 };
  if (k === 'fish') { R.fish = buildFish(); R.bub = buildBubble(); R.blob = buildBlob(); R.tail = R.fish.userData.tail; g.add(R.fish); g.add(R.bub); A.scene.add(R.blob); R.y = 0.5; }
  else { const d = buildRig(k); d.w.position.set(0, 0, 0); d.w.rotation.set(0, 0, 0); g.add(d.w); }
  A.scene.add(g); rt[k] = R;
  return R;
}
function despawn(k) { const R = rt[k]; if (!R) return; A.scene.remove(R.g); if (R.blob) A.scene.remove(R.blob); delete rt[k]; if (ring && ring.p.k === k) closeRing(); }
// one step toward a point; `free` flies over anything (the fish to the bobber or its bowl). Returns the distance left.
function step(R, tx, tz, speed, dt, free) {
  const dx = tx - R.x, dz = tz - R.z, d = Math.hypot(dx, dz);
  if (d < 0.02 || speed <= 0) { R.sp += (0 - R.sp) * Math.min(1, dt * 8); return d; }
  const s = Math.min(d, speed * dt), nx = R.x + dx / d * s, nz = R.z + dz / d * s;
  let mx = R.x, mz = R.z;
  if (free || ok(nx, nz)) { mx = nx; mz = nz; } else if (ok(nx, R.z)) mx = nx; else if (ok(R.x, nz)) mz = nz;
  const moved = Math.hypot(mx - R.x, mz - R.z);
  R.stuck = moved < s * 0.3 ? R.stuck + dt : 0;
  if (moved > 1e-4) { const want = Math.atan2(mx - R.x, mz - R.z); let dy = want - R.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); R.yaw += dy * Math.min(1, dt * 9); }
  R.sp += (moved / Math.max(dt, 1e-4) - R.sp) * Math.min(1, dt * 8);
  R.x = mx; R.z = mz;
  return d - moved;
}
const stand = (R, dt) => step(R, R.x, R.z, 0, dt, false);
function face(R, x, z, dt) { let dy = Math.atan2(x - R.x, z - R.z) - R.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); R.yaw += dy * Math.min(1, dt * 4); }
function hop(R, x, z) { pop('pop', R.x, R.y + 0.3, R.z); R.x = x; R.z = z; R.stuck = 0; pop('pop', x, R.y + 0.3, z); }
// where a pet waits when it's "at home" but its bed isn't placed yet: on the sand beside the dock steps
const waitSpot = (k) => (k === 'dog' ? { x: A.DOCK.x + A.DOCK.half + 0.5, z: -2.85 } : k === 'cat' ? { x: A.DOCK.x - A.DOCK.half - 1.5, z: -2.6 } : { x: A.DOCK.x - A.DOCK.half - 0.6, z: -3.0 });
const anchorY = (R) => R.y + (R.k === 'dog' ? 0.35 : R.k === 'cat' ? 0.28 : 0);
// the spot a following pet heads for: behind you, or (the puppy) beside you when it feels like it and there's room
function slotAt(name) {
  const P = A.player.pos, yaw = A.player.yaw, fx_ = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  if (name === 'left') return { x: P.x - rx * PETS.side - fx_ * 0.15, z: P.z - rz * PETS.side - fz * 0.15 };
  if (name === 'right') return { x: P.x + rx * PETS.side - fx_ * 0.15, z: P.z + rz * PETS.side - fz * 0.15 };
  return { x: P.x - fx_ * PETS.back, z: P.z - fz * PETS.back };
}
// shared by both pets once they're out with you: follow, catch up, pop back if left behind, drift when you stop.
// Returns 'follow' | 'roam' | 'pause'.
function follow(R, dt, canSide) {
  const P = A.player.pos, dP = Math.hypot(P.x - R.x, P.z - R.z);
  if (dP > 11 || (R.stuck > 2.2 && dP > 3)) { const b = slotAt('back'); if (ok(b.x, b.z)) hop(R, b.x, b.z); else hop(R, P.x, P.z); return 'follow'; }
  if (idleT < 1.2 || dP > PETS.roam + 0.6) {
    R.slotT -= dt;
    let t = slotAt(R.slot);
    if (canSide && (R.slotT <= 0 || !ok(t.x, t.z))) {         // "whatever the dog decides if there is space"
      const open = ['back', 'left', 'right'].filter(n => { const q = slotAt(n); return ok(q.x, q.z); });
      R.slot = open.length ? open[Math.floor(Math.random() * open.length)] : 'back'; R.slotT = rnd(4, 9); t = slotAt(R.slot);
    }
    if (!ok(t.x, t.z)) t = { x: P.x, z: P.z };
    const d = Math.hypot(t.x - R.x, t.z - R.z);
    if (d > 0.22 && dP > 0.55) step(R, t.x, t.z, Math.min(7.5, 1.0 + d * 3.4), dt, false); else stand(R, dt);
    R.goal = null; R.roamT = rnd(0.8, 1.8);
    if (!A.player.moving && R.sp < 0.3) face(R, P.x, P.z, dt);
    return 'follow';
  }
  R.roamT -= dt;
  if (!R.goal && R.roamT <= 0) {
    for (let i = 0; i < 6 && !R.goal; i++) { const a = rnd(0, 6.283), r = rnd(0.7, PETS.roam), x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r; if (ok(x, z)) R.goal = { x, z }; }
    if (!R.goal) R.roamT = 1;
  }
  if (R.goal) {
    if (step(R, R.goal.x, R.goal.z, R.k === 'fish' ? 0.75 : 1.1, dt, false) < 0.08 || R.stuck > 0.6) { R.goal = null; R.roamT = rnd(1.2, 3.4); R.look = nearestThing(R); R.stuck = 0; }
    return 'roam';
  }
  stand(R, dt); const L = R.look || P; face(R, L.x, L.z, dt);
  return 'pause';
}
function nearestThing(R) {
  let best = null, bd = 5;
  for (const n of A.npcs()) { const d = Math.hypot(n.x - R.x, n.z - R.z); if (d < bd) { bd = d; best = n; } }
  return best && Math.random() < 0.7 ? { x: best.x, z: best.z } : null;
}

export function frame(dt, elapsed) {
  if (!ready) return;
  { const now = performance.now(); if (lastT) fpsAvg += (1000 / Math.max(1, now - lastT) - fpsAvg) * 0.05; lastT = now; }   // real time: dt is capped, so it can't measure a slow phone
  tickStrays(dt, elapsed); tickCat(dt);
  tickFx(dt);
  const night = A.currentTOD() === 'night';
  idleT = A.player.moving ? 0 : idleT + dt;
  if (ring && A.player.moving) closeRing();
  for (const k of Object.keys(rt)) if (!pet(k)) despawn(k);
  for (const p of st().list) {
    const R = rt[p.k] || spawn(p.k); if (!R) continue;
    if (!night) R.woke = false;
    const held = !!ring && ring.p === p;                          // its buttons are open: it holds still so they're easy to tap
    if (p.k === 'fish') tickFish(p, R, dt, elapsed, night, held); else tickDog(p, R, dt, elapsed, night, held);   // tickDog walks the puppy and the cat
  }
  placeUI();
}

function tickFish(p, R, dt, elapsed, night, held) {
  const P = A.player.pos, F = A.fishing, bowl = bedRec('fish');
  const away = !p.with || (night && !R.woke && !!bowl);
  let gy = A.floorY(R.x, R.z) + K.fish.height, scale = 1, showBub = true;
  R.doze = false; R.out = false;
  if (away && bowl) {                                             // in its bowl: paddling by day, asleep at night
    const bx = bowl.x + 0.5, bz = bowl.z + 0.5, d = Math.hypot(bx - R.x, bz - R.z);
    if (!R.inBowl) { if (d > 14) { R.x = bx; R.z = bz; } step(R, bx, bz, Math.min(6, 1.5 + d * 2), dt, true); if (d < 0.12) { R.inBowl = true; A.addSplash(bx, bz, true); } gy = A.floorY(R.x, R.z) + Math.max(K.fish.height, BOWL_Y + 0.45 * Math.min(1, 2 / (d + 0.01))); }
    if (R.inBowl) { const a = elapsed * (night ? 0 : 0.9); R.x = bx + Math.cos(a) * 0.05; R.z = bz + Math.sin(a) * 0.05; if (!night) R.yaw = -a; gy = A.groundY(bx, bz) + BOWL_Y; scale = 0.72; showBub = false; R.doze = night; R.sp = 0; }
    R.swim = false;
  } else if (away) {                                              // at home, but no bowl placed: waits on the sand by the dock
    const h = waitSpot('fish'), d = Math.hypot(h.x - R.x, h.z - R.z);
    if (d > 16) { R.x = h.x; R.z = h.z; } else if (d > 0.1) step(R, h.x, h.z, Math.min(5, 1.2 + d * 2), dt, true); else stand(R, dt);
    R.inBowl = false;
  } else {
    if (R.inBowl) { R.inBowl = false; A.addSplash(R.x, R.z, true); }
    R.out = true;
    const fishingNow = (F.state === 'wait' || F.state === 'bite') && F.land;
    if (held && !R.swim && !R.wet) { stand(R, dt); face(R, P.x, P.z, dt); }
    else if (fishingNow) {                                         // hops in beside the bobber while you fish
      R.swim = true;
      const tx = F.land.x + 0.55, tz = F.land.z + 0.15, d = step(R, tx, tz, 4.5, dt, true);
      if (d < 0.5) { gy = A.WATER_Y + 0.03; showBub = false; if (!R.wet) { R.wet = true; A.addSplash(R.x, R.z); A.audio.play('plop'); } face(R, F.land.x, F.land.z, dt); }
      else gy = Math.max(A.floorY(R.x, R.z), A.WATER_Y) + K.fish.height + 0.25;
    } else {
      if (R.wet) { R.wet = false; A.addSplash(R.x, R.z); }
      const dP = Math.hypot(P.x - R.x, P.z - R.z);
      if (R.swim) {                                                // back from the water: fly until there's ground under it
        step(R, P.x, P.z, 5, dt, true); gy = Math.max(A.floorY(R.x, R.z), A.WATER_Y) + K.fish.height + 0.2;
        if (ok(R.x, R.z) || dP < 0.6) R.swim = false;
      } else if (night && idleT > 6 && dP < PETS.roam + 0.6) {     // no bowl yet: dozes beside you at night
        R.doze = true; gy = A.floorY(R.x, R.z) + 0.3; stand(R, dt);
      } else if (follow(R, dt, false) === 'pause') {
        R.bubT -= dt; if (R.bubT <= 0 && R.look) { R.bubT = rnd(2.5, 5); pop('bub', R.x + Math.sin(R.yaw) * 0.3, R.y + 0.05, R.z + Math.cos(R.yaw) * 0.3); }
      }
    }
  }
  R.y += (gy - R.y) * Math.min(1, dt * (R.wet || R.inBowl ? 7 : 4));
  R.k1 += (scale - R.k1) * Math.min(1, dt * 6);
  const bob = held ? 0 : R.doze ? Math.sin(elapsed * 1.1) * 0.015 : R.inBowl || R.wet ? Math.sin(elapsed * 2.4) * 0.012 : Math.sin(elapsed * 2.2) * 0.05;
  R.g.position.set(R.x, R.y + bob, R.z); R.g.scale.setScalar(R.k1);
  if (R.loop > 0) R.loop = Math.max(0, R.loop - dt / 0.7);
  if (R.spin > 0) R.spin = Math.max(0, R.spin - dt / 0.8);
  const ease = (t) => t * t * (3 - 2 * t);
  R.g.rotation.set(0, R.yaw + ease(1 - R.spin) * Math.PI * 4 * (R.spin > 0 ? 1 : 0), 0);
  R.fish.rotation.x = -ease(1 - R.loop) * Math.PI * 2 * (R.loop > 0 ? 1 : 0) + (R.doze ? 0.25 : 0);
  R.fish.rotation.z = R.doze ? 0.35 : 0;
  R.tail.rotation.y = Math.sin(elapsed * (R.doze ? 1.5 : 6 + R.sp * 3)) * (R.doze ? 0.12 : 0.35 + Math.min(0.3, R.sp * 0.08));
  R.bub.visible = showBub && R.k1 > 0.9; R.bub.rotation.y = -R.yaw;
  R.blob.visible = R.bub.visible && !R.swim; R.blob.position.set(R.x, A.floorY(R.x, R.z) + 0.03, R.z);
}

function tickDog(p, R, dt, elapsed, night, held) {
  const k = p.k, P = A.player.pos, house = bedRec(k);
  const away = !p.with || (night && !R.woke && !!house);
  let clip = 'Idle', speed = 1;
  R.doze = false; R.out = false; R.atHome = false;
  if (away) {                                                     // on its mat in front of the doghouse (or waiting by the dock)
    const h = !house ? waitSpot(k) : k === 'dog' ? { x: house.x + 1 + Math.sin((house.r || 0) * Math.PI / 2) * MAT_Z, z: house.z + 1 + Math.cos((house.r || 0) * Math.PI / 2) * MAT_Z } : { x: house.x + 0.5, z: house.z + 0.5 }, d = Math.hypot(h.x - R.x, h.z - R.z);   // the doghouse's mat, or in the cat basket
    if (d > 0.14) { if (d > 16 || R.stuck > 2.5) { R.x = h.x; R.z = h.z; R.stuck = 0; } else step(R, h.x, h.z, Math.min(5.5, 1.2 + d * 2.2), dt, d < 1.6); }
    else { stand(R, dt); R.atHome = true; R.doze = night && !!house; let dy = (R.doze ? 1.1 : 0) - R.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); R.yaw += dy * Math.min(1, dt * 4); }
  } else {
    R.out = true;
    if (held) { stand(R, dt); face(R, P.x, P.z, dt); }
    else if (night && !house && idleT > 6 && Math.hypot(P.x - R.x, P.z - R.z) < PETS.roam + 0.6) { R.doze = true; stand(R, dt); }
    else if (follow(R, dt, true) === 'pause' && R.look) clip = 'Idle_2_HeadLow';   // sniffs toward whoever is near
  }
  if (R.shot) { R.shot.t -= dt; if (R.shot.t <= 0) R.shot = null; }
  if (R.doze) clip = 'Death';
  else if (R.sp > 3.4) { clip = 'Gallop'; speed = k === 'cat' ? Math.min(3.2, R.sp / 1.1) : Math.min(1.5, Math.max(0.8, R.sp / 5)); }
  else if (R.sp > 0.3) { clip = 'Walk'; speed = k === 'cat' ? Math.min(3.2, Math.max(0.7, R.sp / 1.1)) : Math.min(1.9, Math.max(0.7, R.sp / 1.5)); }
  else if (R.shot) clip = R.shot.name;
  anim(k, clip, dt, speed);
  if (k === 'cat') catLoaf(R, dt, R.sp < 0.15 && !held && !R.shot, R.doze);
  R.y = A.floorY(R.x, R.z) + (R.doze && house ? (k === 'cat' ? 0.2 : 0.04) : 0);
  R.g.position.set(R.x, R.y, R.z); R.g.rotation.set(0, R.yaw, 0);
}

// ---------- strays: the fish jumping beside the dock (level 2), the puppy in its crate at the foot of the dock (level 4) ----------
// (the crate sits on the sand at the foot of the dock, not on it: the dock's right side belongs to the cargo boxes and their Load button)
const strayAt = (k) => k === 'cat' ? (strays.cat ? { x: strays.cat.x, z: strays.cat.z } : { x: A.player.pos.x, z: A.player.pos.z }) : (k === 'fish' ? { x: A.DOCK.x - A.DOCK.half - 0.95, z: -6.6 } : { x: A.DOCK.x + A.DOCK.half + 0.5, z: -2.85 });
function tickStrays(dt, elapsed) {
  const lv = A.S.level || 1;
  for (const k of ['fish', 'dog']) {
    const want = !pet(k) && lv >= K[k].level && (k !== 'dog' || !!dogSrc);
    let s = strays[k];
    if (!want) { if (s) { A.scene.remove(s.g); delete strays[k]; } continue; }
    const at = strayAt(k);
    if (!s) {
      const g = k === 'fish' ? buildFish() : new THREE.Group();
      if (k === 'dog') { const d = buildDog(); d.w.position.set(0, 0.07, 0); d.w.rotation.set(0, 0.9, 0); g.add(buildCrate()); g.add(d.w); g.position.set(at.x, A.floorY(at.x, at.z), at.z); g.rotation.y = 0.2; }
      A.scene.add(g); s = strays[k] = { g, t: 0, air: false };
    }
    if (k === 'dog') { dogAnim(Math.hypot(A.player.pos.x - at.x, A.player.pos.z - at.z) < 3 ? 'Idle_2' : 'Idle', dt); continue; }
    const T = 2.6; s.t = (s.t + dt) % T;
    const u = s.t / T, up = u < 0.42 ? Math.sin(u / 0.42 * Math.PI) : 0, air = up > 0.02;
    if (air !== s.air) { s.air = air; const near = Math.hypot(A.player.pos.x - at.x, A.player.pos.z - at.z) < 9; A.addSplash(at.x + (air ? -0.25 : 0.25), at.z); if (near) A.audio.play('plop'); }
    s.g.position.set(at.x - 0.25 + Math.min(1, u / 0.42) * 0.5, A.WATER_Y - 0.12 + up * 1.05, at.z);
    s.g.rotation.order = 'YXZ'; s.g.rotation.set(air ? -(0.9 - u / 0.42 * 1.8) : 0, Math.PI / 2, 0);   // nose up on the way out, down on the way in
    s.g.userData.tail.rotation.y = Math.sin(elapsed * 14) * 0.5;
  }
}
// ---------- the stray cat (Mac, v0.1.72): it wanders from day one and slowly becomes yours ----------
// Shy at first (it trots off if you run at it), then curious (it comes over), then friendly (it tags along for a bit).
// A treat or a common fish is a point (3 a day), a pet is a point (once a day); PETS.tame.perPaw points fill a paw; all paws → Adopt.
const tame = () => { const a = st(); if (!a.cat) a.cat = { pts: 0, fed: 0, pet: 0, day: '' }; if (a.cat.day !== today()) { a.cat.day = today(); a.cat.fed = 0; a.cat.pet = 0; } return a.cat; };
const pawsOf = () => Math.min(PETS.tame.paws, Math.floor(tame().pts / PETS.tame.perPaw));
const commonFish = () => Object.keys(A.S.inv).filter(id => ITEMS[id] && ITEMS[id].kind === 'fish' && ITEMS[id].rarity === 'common' && A.S.inv[id] > 0).sort((x, y) => ITEMS[x].price - ITEMS[y].price)[0] || null;
const catFood = () => (A.invCount('pet_treat') > 0 ? 'pet_treat' : commonFish());
const catRange = (x, z) => x > -9.5 && x < 10.5 && z > -2.7 && z < 5.2 && ok(x, z);   // the beach and the grass in front of your land
function tickCat(dt) {
  const want = !pet('cat') && !!srcs.cat;
  let c = strays.cat;
  if (!want) { if (c) { A.scene.remove(c.g); delete strays.cat; } return; }
  const P = A.player.pos;
  if (!c) {
    const d = buildRig('cat'), g = new THREE.Group(); d.w.position.set(0, 0, 0); d.w.rotation.set(0, 0, 0); g.add(d.w); A.scene.add(g);
    const at = [[5.6, 1.6], [-2, 1.2], [3, 3], [0.5, 2.2]].find(q => catRange(q[0], q[1])) || [P.x + 2, P.z];
    c = strays.cat = { k: 'cat', g, x: at[0], z: at[1], y: 0, yaw: 2, sp: 0, stuck: 0, goal: null, wait: 1.5, flee: 0, followT: 0, coolT: 0, hold: 0, px: P.x, pz: P.z, pv: 0 };
  }
  c.pv += (Math.hypot(P.x - c.px, P.z - c.pz) / Math.max(dt, 1e-3) - c.pv) * Math.min(1, dt * 6); c.px = P.x; c.pz = P.z;   // how fast you're coming
  const dP = Math.hypot(P.x - c.x, P.z - c.z), paws = pawsOf(), running = c.pv > 3.4;
  c.hold = Math.max(0, c.hold - dt); c.coolT = Math.max(0, c.coolT - dt); c.flee = Math.max(0, c.flee - dt);
  const pick = (cx, cz, r) => { for (let i = 0; i < 8; i++) { const a = rnd(0, 6.283), q = rnd(1.2, r), x = cx + Math.sin(a) * q, z = cz + Math.cos(a) * q; if (catRange(x, z)) return { x, z }; } return null; };
  if (c.hold > 0 || sheet) { stand(c, dt); face(c, P.x, P.z, dt); }
  else if (paws === 0 && running && dP < 3.2 && c.flee <= 0) {                // shy: run at it and it trots away
    const ux = (c.x - P.x) / Math.max(dP, 0.1), uz = (c.z - P.z) / Math.max(dP, 0.1);
    c.goal = catRange(c.x + ux * 4, c.z + uz * 4) ? { x: c.x + ux * 4, z: c.z + uz * 4 } : pick(c.x, c.z, 4.5); c.flee = 1.6;
  }
  if (c.hold > 0 || sheet) { /* held still above */ }
  else if (c.flee > 0 && c.goal) { if (step(c, c.goal.x, c.goal.z, 3.6, dt, false) < 0.15 || c.stuck > 0.5) { c.goal = null; c.flee = 0; c.wait = rnd(1.5, 3); } }
  else if (paws >= 3 && c.coolT <= 0 && dP < 6.5 && dP > 1.25) {              // friendly: tags along for a while, then wanders off
    step(c, P.x, P.z, Math.min(4.5, 1 + (dP - 1.1) * 2.6), dt, false); c.goal = null;
    c.followT += dt; if (c.followT > 20) { c.followT = 0; c.coolT = 14; c.wait = 0.5; }
  }
  else if (paws >= 1 && paws < 3 && dP < 5 && dP > 1.35 && !running) { step(c, P.x, P.z, 1.3, dt, false); c.goal = null; }   // curious: comes over
  else if (dP < 1.7 && !running) { stand(c, dt); face(c, P.x, P.z, dt); c.goal = null; }   // right beside you: waits to see what you've got
  else {                                                                       // wandering
    if (!c.goal) { stand(c, dt); c.wait -= dt; if (c.wait <= 0) { c.goal = pick(c.x, c.z, 4.5); if (!c.goal) c.wait = 1; } }
    else if (step(c, c.goal.x, c.goal.z, 0.95, dt, false) < 0.12 || c.stuck > 0.7) { c.goal = null; c.stuck = 0; c.wait = Math.random() < 0.45 ? rnd(9, 18) : rnd(2, 5); }   // a short stop, or a long one (long enough to loaf)
  }
  anim('cat', c.sp > 0.3 ? 'Walk' : 'Idle', dt, c.sp > 0.3 ? Math.min(3.2, Math.max(0.7, c.sp / 1.1)) : 1);
  catLoaf(c, dt, c.sp < 0.15 && c.hold <= 0 && !(dP < 1.7), false);   // it stands up when you come right up to it
  c.y = A.floorY(c.x, c.z); c.g.position.set(c.x, c.y, c.z); c.g.rotation.set(0, c.yaw, 0);
}
function catPoint(what) {
  const t = tame(), c = strays.cat; if (!c) return;
  const before = pawsOf(); t.pts++; c.hold = 2.4;
  A.audio.play(what === 'pet' ? 'peep' : 'eggPop'); pop(what === 'pet' ? 'heart' : 'plus', c.x, c.y + 0.6, c.z);
  if (pawsOf() > before) { A.audio.play('levelUp'); for (let i = 0; i < 4; i++) setTimeout(() => strays.cat && pop('heart', strays.cat.x + rnd(-0.3, 0.3), strays.cat.y + 0.6, strays.cat.z), i * 130); }
  A.renderHotbar(); A.commit();
  if (pawsOf() >= PETS.tame.paws) setTimeout(() => adopt('cat', false), 900);   // all paws: it's yours
}
function catGive() {
  const t = tame(), id = catFood();
  if (t.fed >= PETS.tame.treatsPerDay) { A.toast('The cat is full. Come back tomorrow'); return; }
  if (!id) { A.toast('It wants a fish. Catch a common one, like a Silver Minnow'); return; }
  A.addItem(id, -1); t.fed++; catPoint('give');
}
function catPet() { const t = tame(); if (t.pet >= PETS.tame.petsPerDay) return; t.pet++; catPoint('pet'); }

function adopt(k, free) {
  const a = st(); if (pet(k)) return;
  if (k === 'dog' && !dogSrc) { A.toast('One moment: the puppy is still on its way'); return; }
  if (k === 'cat' && !srcs.cat) return;
  const at = strayAt(k), catYaw = k === 'cat' && strays.cat ? strays.cat.yaw : 0, p = { k, name: K[k].names[0], born: Date.now(), treats: 0, with: true };
  for (const q of a.list) q.with = false;                         // one follows at a time; the others head home
  a.list.push(p);
  A.addItem('decor_' + K[k].bed, 1); A.addItem('pet_treat', PETS.starter);
  if (strays[k]) { A.scene.remove(strays[k].g); delete strays[k]; }
  const R = free ? spawn(k) : spawn(k, at.x + (k === 'dog' ? 0.5 : 0), at.z);
  if (R && k === 'fish' && !free) { R.swim = true; R.y = A.WATER_Y + 0.4; A.addSplash(at.x, at.z); }
  if (R && k === 'dog') { R.yaw = 0.9; R.shot = { name: 'Jump_ToIdle', t: 1.2 }; }
  if (R && k === 'cat') R.yaw = catYaw;
  A.audio.play('levelUp'); for (let i = 0; i < 3; i++) setTimeout(() => rt[k] && pop('heart', rt[k].x, anchorY(rt[k]) + 0.3, rt[k].z), i * 160);
  A.renderHotbar(); A.commit();
  openNaming(p, true);
}

// ---------- the action button: Adopt at the dock, Wake / Come at a bed ----------
export function pickUse() {
  if (!ready || A.busy() || sheet || card) return null;
  const P = A.player.pos;
  for (const k of ['dog', 'fish']) if (strays[k]) { const at = strayAt(k); if (Math.hypot(P.x - at.x, P.z - at.z) < (k === 'fish' ? 2.4 : 1.7)) return { kind: 'collect', key: 'petAdopt' + k, icon: 'heart', label: 'Adopt', go: () => adopt(k, false) }; }
  if (strays.cat && Math.hypot(P.x - strays.cat.x, P.z - strays.cat.z) < 1.9) {   // the stray cat: Give (a treat or a common fish), then Pet once it's curious
    const t = tame(), canGive = t.fed < PETS.tame.treatsPerDay, canPet = pawsOf() >= 1 && t.pet < PETS.tame.petsPerDay;
    if (canGive && catFood()) return { kind: 'collect', key: 'catGive', icon: 'petfish', label: 'Give', go: catGive };
    if (canPet) return { kind: 'collect', key: 'catPet', icon: 'hand', label: 'Pet', go: catPet };
    if (canGive) return { kind: 'collect', key: 'catGive', icon: 'petfish', label: 'Give', go: catGive };
  }
  for (const p of st().list) {
    const R = rt[p.k]; if (!R || !(R.inBowl || R.atHome)) continue;
    if (Math.hypot(P.x - R.x, P.z - R.z) > 1.5) continue;
    if (!p.with) return { kind: 'collect', key: 'petCome' + p.k, icon: 'walk', label: 'Come', go: () => setWith(p, true) };
    return { kind: 'collect', key: 'petWake' + p.k, icon: 'heart', label: 'Wake', go: () => { R.woke = true; A.audio.play('eggPop'); pop('heart', R.x, anchorY(R) + 0.3, R.z); } };
  }
  return null;
}
function setWith(p, v) {
  if (!p) return;
  if (v) { for (const q of st().list) if (q !== p && q.with) { q.with = false; if (!bedRec(q.k)) A.toast(`${q.name} waits by the dock. Place the ${K[q.k].bedName.toLowerCase()} for a home`); } if (rt[p.k]) rt[p.k].woke = true; }
  else if (!bedRec(p.k)) A.toast(`${p.name} waits by the dock. Place the ${K[p.k].bedName.toLowerCase()} for a home`);
  p.with = v;
  A.audio.play('tap'); A.commit(); if (card) paintCard();
}

// ---------- tap a pet: three picture buttons and its name tag ----------
export function tap(x, y) {
  if (!ready || A.busy() || sheet || card) return false;
  if (ring) { closeRing(); return true; }
  if (!ray) ray = { r: new THREE.Raycaster(), n: new THREE.Vector2(), s: new THREE.Sphere() };
  ray.n.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.r.setFromCamera(ray.n, A.camera);
  for (const p of st().list) { const R = rt[p.k]; if (!R) continue;
    ray.s.center.set(R.x, anchorY(R), R.z); ray.s.radius = 0.6;
    if (ray.r.ray.intersectsSphere(ray.s)) { openRing(p); return true; } }
  return false;
}
function openRing(p) {
  closeRing();
  const el = document.createElement('div'); el.id = 'petRing';
  el.innerHTML = `<button class="rb" data-a="pet" aria-label="Pet" style="--c:#ffb3c1">${A.svg('hand', '#2b2140', 34)}</button><button class="rb" data-a="treat" aria-label="Treat" style="--c:#ffe08a">${A.svg('treat', '#2b2140', 34)}<i></i></button><button class="rb" data-a="name" aria-label="Name" style="--c:#9fdcf5">${A.svg('tag', '#2b2140', 34)}</button><button class="nt" data-a="more" aria-label="More about ${esc(p.name)}"><span></span>${A.svg('down', '#2b2140', 22)}</button>`;
  document.body.appendChild(el); ring = { el, p, t: 0 }; eachEv(el);
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (!b) return; ring.t = 0; const a = b.dataset.a;
    if (a === 'pet') doPet(p); else if (a === 'treat') doTreat(p); else if (a === 'name') { closeRing(); openNaming(p, false); } else { closeRing(); openCard(p); } });
  A.audio.play('popOpen'); paintRing();
}
const fishCount = () => Object.keys(A.S.inv).reduce((n, id) => n + (ITEMS[id] && ITEMS[id].kind === 'fish' && ITEMS[id].rarity === 'common' ? A.S.inv[id] : 0), 0);
const treatsFor = (p) => A.invCount('pet_treat') + (K[p.k].worms ? A.invCount('worm') : 0) + (K[p.k].fish ? fishCount() : 0);
function paintRing() { if (!ring) return; ring.el.querySelector('.nt span').textContent = ring.p.name; const n = treatsFor(ring.p), i = ring.el.querySelector('.rb i'); i.textContent = n; i.dataset.none = n ? '' : '1'; }
function closeRing() { if (ring) { ring.el.remove(); ring = null; } }
function doPet(p) {
  const R = rt[p.k]; if (!R) return;
  if (p.k === 'fish') R.loop = 1; else R.shot = { name: 'Jump_ToIdle', t: 1.25 };   // the fish loops; the puppy does a happy hop
  if (p.k === 'dog' && rigs.dog && rigs.dog.cur === 'Jump_ToIdle') rigs.dog.acts.Jump_ToIdle.reset().play();   // petted again mid-hop: hop again
  A.audio.play('peep');
  for (let i = 0; i < 3; i++) setTimeout(() => rt[p.k] && pop('heart', R.x + rnd(-0.2, 0.2), anchorY(R) + 0.3, R.z), i * 140);
}
function doTreat(p) {
  const a = st(), R = rt[p.k]; if (!R) return;
  if (a.day !== today()) { a.day = today(); for (const q of a.list) q.fed = 0; }
  if (!a.fast && (p.fed || 0) >= PETS.perDay) { A.toast(`${p.name} is full. More tomorrow`); if (p.k === 'fish') R.spin = 0.4; return; }
  const id = A.invCount('pet_treat') > 0 ? 'pet_treat' : K[p.k].worms && A.invCount('worm') > 0 ? 'worm' : K[p.k].fish ? commonFish() : null;
  if (!id) { A.toast(K[p.k].worms ? 'No treats. Worms work too; Nell sells pet treats' : K[p.k].fish ? 'No treats. A common fish works too' : 'No treats. Nell sells pet treats'); return; }
  const before = heartsOf(p);
  A.addItem(id, -1); p.treats++; p.fed = (p.fed || 0) + 1;
  if (p.k === 'fish') R.spin = 1; else { R.shot = { name: 'Eating', t: 1.8 }; }
  A.audio.play('eggPop'); pop('plus', R.x, anchorY(R) + 0.35, R.z);
  if (heartsOf(p) > before) { A.audio.play('levelUp'); for (let i = 0; i < 5; i++) setTimeout(() => rt[p.k] && pop('heart', R.x + rnd(-0.3, 0.3), anchorY(R) + 0.3, R.z), i * 120); A.toast(p.k === 'fish' ? `${p.name}: bites come ${pct(p)}% faster` : `${p.name} loves you more`); }
  A.renderHotbar(); A.commit(); paintRing();
}

// ---------- the small card (tap the name tag): hearts, days together, the bonus, With me / At home ----------
const heartSVG = (on, s = 28) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="${on ? '#ff6f7d' : '#fff'}" stroke="#2b2140" stroke-width="2.2" stroke-linejoin="round"/></svg>`;
function openCard(p) {
  if (card) closeCard();
  const el = document.createElement('div'); el.id = 'petCard'; el.className = 'petOver';
  document.body.appendChild(el); card = { el, p }; eachEv(el);
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-x]')) { closeCard(); return; }
    const w = e.target.closest('[data-with]'); if (w) setWith(p, w.dataset.with === '1');
  });
  A.audio.play('popOpen'); paintCard();
}
function closeCard() { if (card) { card.el.remove(); card = null; A.audio.play('popClose'); } }
function paintCard() {
  const p = card && card.p; if (!p || !st().list.includes(p)) { closeCard(); return; }
  const h = heartsOf(p), days = Math.floor((Date.now() - p.born) / 864e5) + 1, next = h < 3 ? PETS.treatsFor[h] - p.treats : 0;
  const bonus = p.k === 'fish' ? `<div class="chip blue">${A.svg('petfish', '#2b2140', 26)}${A.svg('fast', '#2b2140', 20)}<b>${pct(p)}%</b> faster bites</div>` : '';
  card.el.innerHTML = `<div class="cd" role="dialog" aria-label="${esc(p.name)}"><button class="x" data-x aria-label="Close">✕</button>
    <div class="hd"><img src="${picture(p.k)}" width="84" height="84" alt=""><div><h2>${esc(p.name)}</h2><div class="hh" aria-label="${h} of 3 hearts">${[0, 1, 2].map(i => heartSVG(i < h)).join('')}</div>${next ? `<small>${A.svg('treat', '#2b2140', 16)} ${next} more for the next heart</small>` : ''}</div></div>
    <div class="chips"><div class="chip">${A.svg('cal', '#2b2140', 26)}Day ${days}</div>${bonus}</div>
    <div class="seg"><button data-with="1" class="${p.with ? 'on' : ''}">${A.svg('walk', '#2b2140', 26)}With me</button><button data-with="0" class="${p.with ? '' : 'on'}">${A.svg('home', '#2b2140', 26)}At home</button></div></div>`;
}

// ---------- naming (round 1, option C): pick a tile or write your own ----------
function openNaming(p, first) {
  if (sheet || !p) return;
  const el = document.createElement('div'); el.id = 'petName'; el.className = 'petOver';
  const pool = K[p.k].names.filter(n => n !== p.name).sort(() => Math.random() - 0.5).slice(0, 5); pool.unshift(p.name);
  el.innerHTML = `<div class="cd" role="dialog" aria-label="Name your pet"><div class="hd"><img src="${picture(p.k)}" width="72" height="72" alt=""><h2></h2></div>
    <div class="tiles">${pool.slice(0, 6).map(n => `<button data-n="${esc(n)}">${esc(n)}</button>`).join('')}</div>
    <button class="own" data-own>${A.svg('pencil', '#2b2140', 24)}Write my own</button>
    <label class="in" hidden><span>Name</span><input type="text" maxlength="12" autocomplete="off" autocapitalize="words" spellcheck="false"></label>
    <button class="done" data-done>${A.svg('check', '#2b2140', 28)}Done</button></div>`;
  document.body.appendChild(el); sheet = { el, p, name: p.name, first }; eachEv(el);
  const input = el.querySelector('input'), paint = () => { el.querySelector('h2').textContent = sheet.name || '…'; el.querySelectorAll('.tiles button').forEach(b => b.classList.toggle('on', b.dataset.n === sheet.name)); };
  input.addEventListener('input', () => { sheet.name = input.value.trim().slice(0, 12); paint(); });
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') doneNaming(); });
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-n]'); if (t) { sheet.name = t.dataset.n; input.value = ''; A.audio.play('tap'); paint(); return; }
    if (e.target.closest('[data-own]')) { el.querySelector('.in').hidden = false; el.querySelector('.own').hidden = true; input.value = sheet.name; input.focus(); input.select(); return; }
    if (e.target.closest('[data-done]')) doneNaming();
  });
  A.audio.play('popOpen'); paint();
}
function doneNaming() {
  if (!sheet) return; const p = sheet.p;
  p.name = sheet.name || p.name || K[p.k].names[0];
  const first = sheet.first; sheet.el.remove(); sheet = null; A.audio.play('popClose'); A.commit();
  if (first) { A.toast(`Tap ${p.name} to pet it`); setTimeout(() => A.toast(`${K[p.k].bedName}: place it like decor`), 2600); }
}

// ---------- pictures and little effects ----------
function draw(size, fn) { const c = document.createElement('canvas'); c.width = c.height = size; const k = c.getContext('2d'); k.strokeStyle = '#2b2140'; k.lineJoin = 'round'; k.lineCap = 'round'; fn(k); return c.toDataURL(); }
const _pics = {};
function picture(kind) {
  if (_pics[kind]) return _pics[kind];
  if (kind === 'cat') return (_pics.cat = draw(168, k => {          // the cat's face: dark grey, pink ears, white muzzle, green eyes
    k.fillStyle = '#ffe3b8'; k.beginPath(); k.arc(84, 84, 84, 0, 6.3); k.fill();
    k.lineWidth = 6; k.fillStyle = '#4b4b55';
    for (const s of [-1, 1]) { k.beginPath(); k.moveTo(84 + s * 16, 54); k.lineTo(84 + s * 48, 20); k.lineTo(84 + s * 54, 72); k.closePath(); k.fill(); k.stroke(); }
    k.fillStyle = '#f29bb2'; for (const s of [-1, 1]) { k.beginPath(); k.moveTo(84 + s * 30, 52); k.lineTo(84 + s * 44, 34); k.lineTo(84 + s * 47, 60); k.closePath(); k.fill(); }
    k.fillStyle = '#4b4b55'; k.beginPath(); k.ellipse(84, 94, 52, 44, 0, 0, 6.3); k.fill(); k.stroke();
    k.fillStyle = '#f4f1ea'; k.beginPath(); k.ellipse(84, 112, 26, 20, 0, 0, 6.3); k.fill();
    k.fillStyle = '#9ad46a'; for (const s of [-1, 1]) { k.beginPath(); k.ellipse(84 + s * 22, 86, 10, 9, 0, 0, 6.3); k.fill(); }
    k.fillStyle = '#2b2140'; for (const s of [-1, 1]) { k.beginPath(); k.ellipse(84 + s * 22, 86, 3.5, 8, 0, 0, 6.3); k.fill(); }
    k.fillStyle = '#f29bb2'; k.beginPath(); k.moveTo(77, 102); k.lineTo(91, 102); k.lineTo(84, 110); k.closePath(); k.fill();
    k.lineWidth = 3.5; k.beginPath(); k.moveTo(84, 110); k.lineTo(84, 116); k.moveTo(74, 118); k.quadraticCurveTo(84, 126, 94, 118); k.stroke();
    k.lineWidth = 2.5; for (const s of [-1, 1]) for (const dy of [-5, 4]) { k.beginPath(); k.moveTo(84 + s * 30, 110 + dy * 0.4); k.lineTo(84 + s * 62, 108 + dy * 2); k.stroke(); }
  }));
  return (_pics[kind] = kind === 'fish' ? draw(168, k => {
    k.fillStyle = '#bfe6f7'; k.beginPath(); k.arc(84, 84, 84, 0, 6.3); k.fill();
    k.lineWidth = 6; k.fillStyle = '#ffb35c'; k.beginPath(); k.moveTo(58, 86); k.lineTo(22, 58); k.lineTo(30, 86); k.lineTo(22, 116); k.closePath(); k.fill(); k.stroke();
    k.beginPath(); k.moveTo(82, 46); k.lineTo(96, 26); k.lineTo(108, 50); k.closePath(); k.fill(); k.stroke();
    k.fillStyle = '#ff9340'; k.beginPath(); k.ellipse(94, 86, 44, 38, 0, 0, 6.3); k.fill(); k.stroke();
    k.fillStyle = '#ffd9a0'; k.beginPath(); k.ellipse(96, 102, 30, 16, 0, 0, 3.15); k.fill();
    k.fillStyle = '#fff'; k.beginPath(); k.arc(112, 76, 14, 0, 6.3); k.fill(); k.lineWidth = 4; k.stroke();
    k.fillStyle = '#2b2140'; k.beginPath(); k.arc(116, 77, 7, 0, 6.3); k.fill();
    k.fillStyle = '#ff7f8f'; k.beginPath(); k.ellipse(128, 98, 8, 5, 0, 0, 6.3); k.fill();
    k.strokeStyle = 'rgba(255,255,255,.9)'; k.lineWidth = 5; k.beginPath(); k.arc(84, 84, 74, 3.5, 4.3); k.stroke();
  }) : draw(168, k => {                                            // the puppy's face: tan head, cream cheeks, pointed ears
    k.fillStyle = '#cfeacb'; k.beginPath(); k.arc(84, 84, 84, 0, 6.3); k.fill();
    k.lineWidth = 6; k.fillStyle = '#b5682c';
    for (const s of [-1, 1]) { k.beginPath(); k.moveTo(84 + s * 20, 52); k.lineTo(84 + s * 50, 22); k.lineTo(84 + s * 56, 70); k.closePath(); k.fill(); k.stroke(); }
    k.fillStyle = '#c9783a'; k.beginPath(); k.ellipse(84, 92, 50, 46, 0, 0, 6.3); k.fill(); k.stroke();
    k.fillStyle = '#fff1dc'; k.beginPath(); k.ellipse(84, 110, 32, 24, 0, 0, 6.3); k.fill();
    k.fillStyle = '#2b2140'; for (const s of [-1, 1]) { k.beginPath(); k.arc(84 + s * 20, 84, 6.5, 0, 6.3); k.fill(); }
    k.beginPath(); k.ellipse(84, 102, 9, 6.5, 0, 0, 6.3); k.fill();
    k.lineWidth = 4; k.beginPath(); k.moveTo(84, 108); k.lineTo(84, 116); k.moveTo(72, 118); k.quadraticCurveTo(84, 128, 96, 118); k.stroke();
    k.fillStyle = '#ff7f8f'; for (const s of [-1, 1]) { k.beginPath(); k.ellipse(84 + s * 34, 104, 7, 4.5, 0, 0, 6.3); k.fill(); }
  }));
}
let _treatPic = null;
function treatPicture() {
  return _treatPic || (_treatPic = draw(96, k => { k.lineWidth = 5; k.fillStyle = '#e9b46a'; k.beginPath(); k.arc(48, 48, 32, 0, 6.3); k.fill(); k.stroke(); k.fillStyle = '#8a5a2b'; for (const [x, y] of [[36, 38], [58, 34], [60, 58], [38, 60], [48, 48]]) { k.beginPath(); k.arc(x, y, 4, 0, 6.3); k.fill(); } }));
}
// floating hearts, +1, bubbles and pops: small DOM pictures that rise from a spot in the world
function pop(kind, x, y, z) {
  if (!ui || fx.length > 14) return;
  const el = document.createElement('div'); el.className = 'petFx ' + kind;
  el.innerHTML = kind === 'heart' ? heartSVG(true, 26) : kind === 'plus' ? `+1` : '';
  ui.layer.appendChild(el); fx.push({ el, x, y, z, t: 0, dur: kind === 'pop' ? 0.35 : kind === 'bub' ? 1.4 : 1.1, kind, dx: rnd(-0.15, 0.15) });
}
function tickFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; const u = f.t / f.dur;
    if (u >= 1) { f.el.remove(); fx.splice(i, 1); continue; }
    const s = project(f.x + f.dx * u, f.y + u * (f.kind === 'pop' ? 0 : 0.7), f.z);
    f.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${f.kind === 'pop' ? 0.4 + u * 1.4 : 0.7 + Math.min(1, u * 4) * 0.3})`; f.el.style.opacity = s.ok ? String(1 - u * u) : '0'; }
}
function project(x, y, z) { _v.p.set(x, y, z).project(A.camera); return { x: (_v.p.x + 1) / 2 * innerWidth, y: (1 - _v.p.y) / 2 * innerHeight, ok: _v.p.z < 1 }; }
// the ring of buttons, each pet's Zzz and each stray's heart follow their owners on screen
const zSprites = {}; let zTex = null;
function zSprite(k) {
  if (zSprites[k]) return zSprites[k];
  if (!zTex) { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.font = '96px "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Emoji", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('\u{1F4A4}', 64, 70); zTex = new THREE.CanvasTexture(c); zTex.colorSpace = THREE.SRGBColorSpace; }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false, fog: false })); sp.scale.setScalar(0.42); sp.visible = false; A.scene.add(sp);
  return (zSprites[k] = sp);
}
function placeUI() {
  if (!ui) return;
  const quiet = A.busy() || !!sheet || !!card;
  if (ring) {
    const R = rt[ring.p.k]; ring.t += 1 / Math.max(20, fpsAvg);
    if (!R || quiet || ring.t > 7) closeRing();
    else { const s = project(R.x, anchorY(R), R.z), flip = s.x > innerWidth - 190, low = s.y < 170; ring.el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`; ring.el.dataset.flip = flip ? '1' : ''; ring.el.dataset.low = low ? '1' : ''; }
  }
  for (const k of ['fish', 'dog', 'cat']) {
    const R = rt[k], z = R && R.doze && !quiet;
    // a sleeping pet shows a small 💤 in the world, not a bubble on top of the screen, so you walk in front of it (Mac, v0.1.97)
    if (z) { const sp = zSprite(k), t = performance.now() / 1000; sp.position.set(R.x + 0.16, R.y + (k === 'fish' ? 0.5 : k === 'cat' ? 0.58 : 0.68) + Math.sin(t * 1.6) * 0.03, R.z); sp.visible = true; }
    else if (zSprites[k]) zSprites[k].visible = false;
    ui.zzz[k].hidden = true;
    const at = strays[k] && k !== 'cat' ? strayAt(k) : null, h = at && !quiet && Math.hypot(A.player.pos.x - at.x, A.player.pos.z - at.z) < 12;
    if (h) { const s = project(at.x, k === 'fish' ? A.WATER_Y + 1.5 : A.floorY(at.x, at.z) + 1.25, at.z); ui.heart[k].style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`; }
    ui.heart[k].hidden = !h;
  }
  { // the stray cat's paw tag (mockup A): five paws that fill in, shown when you're near it
    // the paw tag: small, only when you're right by the cat and it's standing still (it was big and rode along while the cat followed you; Mac, v0.1.93)
    const c = strays.cat, show = !!c && !quiet && (c.sp || 0) < 0.15 && Math.hypot(A.player.pos.x - c.x, A.player.pos.z - c.z) < 3.2;
    if (show) {
      const n = pawsOf(); if (ui.paws.dataset.n !== String(n)) { ui.paws.dataset.n = String(n); ui.paws.innerHTML = [0, 1, 2, 3, 4].map(i => `<svg width="11" height="11" viewBox="0 0 24 24" fill="${i < n ? '#b9733b' : '#e9e2d4'}" stroke="${i < n ? '#2b2140' : '#b9b1c6'}" stroke-width="1.6" aria-hidden="true">${A.ICON.paw}</svg>`).join(''); ui.paws.setAttribute('aria-label', `${n} of 5 paws`); }
      const s = project(c.x, c.y + 0.72 * K.cat.length / 0.7, c.z); ui.paws.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`;
    }
    ui.paws.hidden = !show;
  }
  if (ui.fps) ui.fps.textContent = Math.round(fpsAvg) + ' fps';
}

function buildUI() {
  const css = document.createElement('style');
  css.textContent = `
#petLayer { position: fixed; inset: 0; z-index: 6; pointer-events: none; font-family: Fredoka, system-ui, sans-serif; color: #2b2140; overflow: hidden; }
#petLayer > * { position: absolute; left: 0; top: 0; }
.petFx { font-size: 22px; font-weight: 700; text-shadow: 0 1px 0 #fff, 0 -1px 0 #fff, 1px 0 0 #fff, -1px 0 0 #fff; will-change: transform; }
.petFx.bub, .petFx.pop { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255,255,255,.95); background: rgba(255,255,255,.25); }
.petFx.pop { width: 44px; height: 44px; }
.petBub { background: #fff; border: 2px solid #2b2140; border-radius: 18px; box-shadow: 0 3px 0 rgba(43,33,64,.3); display: flex; align-items: center; justify-content: center; font-weight: 700; }
.petHeart { width: 60px; height: 52px; animation: petBob 1.3s ease-in-out infinite; }
.petZzz { padding: 2px 12px; height: 38px; gap: 3px; }
.petPaws { padding: 1px 5px; gap: 1px; border-radius: 9px; border-width: 2px; opacity: .92; }
.petBub[hidden] { display: none; }
@keyframes petBob { 50% { margin-top: -6px; } }
#petRing { position: fixed; left: 0; top: 0; z-index: 9; width: 0; height: 0; font-family: Fredoka, system-ui, sans-serif; }
#petRing button { position: absolute; border: 2px solid #2b2140; box-shadow: 0 3px 0 rgba(43,33,64,.4); color: #2b2140; font-family: inherit; padding: 0; cursor: pointer; animation: petPop .22s cubic-bezier(.3,1.5,.6,1) both; }
#petRing .rb { width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%; background: var(--c); display: flex; align-items: center; justify-content: center; }
#petRing .rb:nth-child(1) { left: -20px; top: -96px; } #petRing .rb:nth-child(2) { left: 66px; top: -70px; animation-delay: .04s; } #petRing .rb:nth-child(3) { left: 104px; top: 8px; animation-delay: .08s; }
#petRing[data-flip="1"] .rb:nth-child(1) { left: 20px; } #petRing[data-flip="1"] .rb:nth-child(2) { left: -66px; } #petRing[data-flip="1"] .rb:nth-child(3) { left: -104px; }
#petRing[data-low="1"] .rb:nth-child(1) { top: 96px; } #petRing[data-low="1"] .rb:nth-child(2) { top: 84px; }
#petRing .rb i { position: absolute; right: -6px; top: -6px; min-width: 24px; height: 24px; box-sizing: border-box; padding: 0 5px; border-radius: 12px; border: 2px solid #2b2140; background: #fff; font-style: normal; font-size: 14px; font-weight: 700; line-height: 20px; text-align: center; }
#petRing .rb i[data-none="1"] { background: #e9e4ee; color: #5f5472; }
#petRing .nt { left: 0; top: 58px; transform: translateX(-50%); min-width: 120px; height: 48px; border-radius: 999px; background: #fffcf4; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 0 10px 0 16px; font-size: 19px; font-weight: 700; white-space: nowrap; animation-name: petPopC; }
@keyframes petPop { from { transform: scale(.3); opacity: 0; } } @keyframes petPopC { from { transform: translateX(-50%) scale(.3); opacity: 0; } }
.petOver { position: fixed; inset: 0; z-index: 20; display: flex; align-items: flex-end; justify-content: center; padding: 0 10px calc(14px + env(safe-area-inset-bottom)); box-sizing: border-box; background: rgba(43,33,64,.3); font-family: Fredoka, system-ui, sans-serif; color: #2b2140; }
.petOver .cd { position: relative; width: 100%; max-width: 420px; background: #fffdf5; border: 3px solid #2b2140; border-radius: 22px; box-shadow: 0 6px 0 rgba(43,33,64,.25); padding: 14px; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; }
.petOver .x { position: absolute; right: 10px; top: 10px; width: 44px; height: 44px; border-radius: 50%; border: 2px solid #2b2140; background: #fff; font-size: 18px; font-weight: 700; color: #2b2140; padding: 0; }
.petOver .hd { display: flex; align-items: center; gap: 12px; padding-right: 48px; } .petOver .hd img { border-radius: 50%; border: 2px solid #2b2140; flex: none; }
.petOver h2 { margin: 0 0 6px; font-size: 26px; font-weight: 700; line-height: 1; } #petName h2 { margin: 0; font-size: 28px; }
.petOver .hh { display: flex; gap: 4px; } .petOver small { display: flex; align-items: center; gap: 4px; margin-top: 5px; font-size: 14px; font-weight: 600; }
.petOver .chips { display: flex; gap: 8px; } .petOver .chip { flex: 1; min-height: 56px; border: 2px solid #2b2140; border-radius: 14px; background: #fff; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 19px; font-weight: 700; }
.petOver .chip.blue { flex: 1.5; background: #dff1fb; font-size: 15px; gap: 3px; } .petOver .chip b { font-size: 22px; margin-right: 3px; }
.petOver .seg { display: flex; border: 2px solid #2b2140; border-radius: 14px; overflow: hidden; }
.petOver .seg button { flex: 1; min-height: 52px; border: 0; background: #fff; display: flex; align-items: center; justify-content: center; gap: 6px; font-family: inherit; color: #2b2140; font-size: 17px; font-weight: 600; }
.petOver .seg button + button { border-left: 2px solid #2b2140; } .petOver .seg button.on { background: #8fdc8a; font-weight: 700; }
.petOver .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.petOver .tiles button, .petOver .own { min-height: 56px; border: 2px solid #2b2140; border-radius: 14px; background: #fff; font-family: inherit; color: #2b2140; font-size: 19px; font-weight: 600; }
.petOver .tiles button.on { background: #ffe08a; } .petOver .own { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 18px; }
.petOver .in { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 600; } .petOver .in[hidden], .petOver .own[hidden] { display: none; }
.petOver .in input { flex: 1; min-width: 0; height: 56px; box-sizing: border-box; border: 3px solid #2b2140; border-radius: 14px; background: #fff; padding: 0 12px; font-family: inherit; font-size: 24px; font-weight: 700; color: #2b2140; }
.petOver .done { min-height: 60px; border: 2px solid #2b2140; border-radius: 16px; background: #8fdc8a; box-shadow: 0 3px 0 rgba(43,33,64,.35); display: flex; align-items: center; justify-content: center; gap: 8px; font-family: inherit; color: #2b2140; font-size: 20px; font-weight: 700; }
#petTry { position: fixed; left: max(8px, calc(50% - 192px)); top: calc(150px + env(safe-area-inset-top)); z-index: 8; font-family: Fredoka, system-ui, sans-serif; color: #2b2140; }
#petTry > button { width: 48px; height: 48px; border-radius: 50%; border: 2px solid #2b2140; background: #ffb35c; box-shadow: 0 2px 0 rgba(43,33,64,.35); display: flex; align-items: center; justify-content: center; padding: 0; }
#petTry .pn { margin-top: 6px; width: 176px; background: #fffdf5; border: 2px solid #2b2140; border-radius: 14px; padding: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; } #petTry .pn[hidden] { display: none; }
#petTry .pn button { min-height: 44px; border: 2px solid #2b2140; border-radius: 10px; background: #ffe08a; font-family: inherit; font-weight: 700; font-size: 13px; color: #2b2140; padding: 0 2px; } #petTry .pn button.on { background: #8fdc8a; }
#petTry .pn .w { grid-column: 1 / 3; } #petTry .pn span { grid-column: 1 / 3; font-size: 13px; font-weight: 600; text-align: center; }
body.decorating #petTry, body.inward #petTry, body.decorating #petRing, body.inward #petRing, body.inward #petLayer, body.decorating #petLayer { display: none; }`;
  document.head.appendChild(css);
  const layer = document.createElement('div'); layer.id = 'petLayer';
  const zz = '<span style="font-size:20px">Z</span><span style="font-size:15px">z</span><span style="font-size:11px">z</span>';
  layer.innerHTML = '<div class="petBub petPaws" hidden></div>' + ['fish', 'dog', 'cat'].map(k => `<div data-h="${k}" class="petBub petHeart" hidden>${heartSVG(true, 30)}</div><div data-z="${k}" class="petBub petZzz" hidden aria-label="Sleeping">${zz}</div>`).join('');
  document.body.appendChild(layer);
  ui = { layer, heart: {}, zzz: {}, fps: null, paws: layer.querySelector('.petPaws') };
  for (const k of ['fish', 'dog', 'cat']) { ui.heart[k] = layer.querySelector(`[data-h="${k}"]`); ui.zzz[k] = layer.querySelector(`[data-z="${k}"]`); }
  if (TRY) buildTry();
}
// TRY: the try-out panel. Not part of the game; goes away at the merge.
function buildTry() {
  const el = document.createElement('div'); el.id = 'petTry';
  el.innerHTML = `<button aria-label="Pets try-out panel">${A.svg('petfish', '#2b2140', 28)}</button><div class="pn" hidden><button data-t="lv2">Level 2</button><button data-t="lv4">Level 4</button><button data-t="fish">Free fish</button><button data-t="dog">Free puppy</button><button data-t="treats">+5 treats</button><button data-t="fast">No treat limit</button><button data-t="tod" class="w">Night / day</button><button data-t="reset" class="w">Start over (no pets)</button><span></span></div>`;
  document.body.appendChild(el); ui.fps = el.querySelector('span'); eachEv(el);
  const pn = el.querySelector('.pn'), paint = () => { pn.querySelector('[data-t="fast"]').classList.toggle('on', !!st().fast); };
  const toLevel = (n) => { let guard = 0; while ((A.S.level || 1) < n && guard++ < 40) A.addXP(100); A.toast('Town level ' + A.S.level + ': look on the dock'); };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; const t = b.dataset.t;
    if (!t) { pn.hidden = !pn.hidden; paint(); return; }
    if (t === 'lv2') toLevel(2); else if (t === 'lv4') toLevel(4);
    else if (t === 'fish' || t === 'dog') { if (pet(t)) A.toast('You already have one'); else adopt(t, true); }
    else if (t === 'treats') { A.addItem('pet_treat', 5); A.toast('+5 pet treats'); A.renderHotbar(); }
    else if (t === 'fast') { st().fast = !st().fast; }
    else if (t === 'tod') { A.toggleNight(); }
    else if (t === 'reset') { for (const k of ['fish', 'dog']) { const rec = bedRec(k); if (rec) A.removeDecor(rec); A.addItem('decor_' + K[k].bed, -A.invCount('decor_' + K[k].bed)); despawn(k); } A.S.pets = fresh(); A.toast('No pets. They wait at the dock again'); }
    A.commit(); paint();
  });
}

export const _debug = () => ({ ok, solid: (x, z) => A.solid(x, z), walk: (x, z) => A.walkable(x, z), rt, strays, get R() { return rt.fish; }, get stray() { return strays.fish; }, st: st(), pet, mine: () => pet('fish'), adopt: (free) => adopt('fish', free), adoptKind: adopt,
  doPet: (p) => doPet(p || pet('fish')), doTreat: (p) => doTreat(p || pet('fish')), openRing: (p) => openRing(p || pet('fish')), openCard: (p) => openCard(p || pet('fish')), openNaming, doneNaming, setWith: (v, p) => setWith(p || pet('fish'), v), heartsOf, biteMul, strayAt: (k) => strayAt(k || 'fish'), fps: fpsAvg,
  get dogReady() { return !!dogSrc; }, get ring() { return ring; }, get sheet() { return sheet; }, get card() { return card; } });
