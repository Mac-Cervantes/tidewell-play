// Rods and the tackle models (try/fishing, round 3 mockups: "Rods A", "Cast feel", the extras).
// - Five rod models: the stick rod works everywhere; two upgrades for the river and lake, two for the sea.
//   An upgrade unlocks through the fish book (catches or pages in that water) and is then bought from Fishel.
//   The right rod comes out by itself for the water you're fishing.
// - Two cast feels: Plop (river and lake: slow, high, close) and Zip (sea: fast, flat, far), with their own sounds.
// - The other models Mac attached: the lake jetty, the steps onto the dock, the worm (bucket and shop picture)
//   and a lure as the Glow Lure's picture.
// Models: Quaternius (CC0), assets/models/tackle → assets/pack-tackle.js, loaded in the background (decision 57).
// main.js only calls the small hooks exported here; look for "TACKLE" there.
import { RODS, ROD_ORDER, CAST, FISH } from './data.js';
import { bucketGroup } from './fishing-spots.js';

let A = null, THREE = null;
const M = {};                      // loaded models by name
const pics = {};                   // pictures rendered from the models: rod ids, 'worm', 'lure'
let loaded = false, loading = null;
const SCALE = 0.22;                // rod model → meters (the model's origin is where the hand holds it)

// ---------- which rod, and what it does ----------
const waterOf = (place) => (place === 'river' || place === 'lake' ? 'fresh' : 'sea');
const owned = (id) => id === 'stick' || (A.S.rods || []).includes(id);
// the best rod you own for this water (the stick rod if none)
export function rodFor(place) {
  const w = waterOf(place);
  return ROD_ORDER.filter(id => RODS[id].water === w && owned(id)).pop() || 'stick';
}
export function perks(place) { const r = RODS[rodFor(place)]; return { reel: r.reel || 0, bite: r.bite || 1 }; }
// book progress in one kind of water: total catches and different fish found
function progress(water) {
  let catches = 0, pages = 0;
  for (const f of FISH) if (waterOf(f.place) === water) { const n = (A.S.caught && A.S.caught[f.id]) || 0; catches += n; if (n) pages++; }
  return { catches, pages };
}
function unlock(id) {
  const r = RODS[id], p = progress(r.water), i = ROD_ORDER.indexOf(id);
  const prev = ROD_ORDER.slice(0, i).filter(q => RODS[q].water === r.water).pop();
  const kind = r.need.catches ? 'catches' : 'pages';
  return { kind, have: Math.min(p[kind], r.need[kind]), need: r.need[kind], open: p[kind] >= r.need[kind] && (!prev || owned(prev)), prevMissing: !!prev && !owned(prev) };
}

// ---------- how a cast flies ----------
export const castKind = (place) => (waterOf(place) === 'fresh' ? 'plop' : 'zip');
export function castShape(place, dist) { const c = CAST[castKind(place)]; return { dur: c.dur[0] + dist * c.dur[1], arc: c.arc[0] + dist * c.arc[1] }; }
export const castSound = (place) => (castKind(place) === 'plop' ? 'castPlop' : 'castZip');
export const landSound = (place) => (castKind(place) === 'plop' ? 'plop' : 'splash');
export const seaReach = () => CAST.zip.extra;   // the sea cast lands this much further out

// ---------- the models ----------
export function preload() {
  if (loaded || loading) return loading;
  loading = (async () => {
    const pack = (await import('../assets/pack-tackle.js')).default;
    await Promise.all(Object.keys(pack).map(n => A.parseGLB(pack[n], './assets/tackle/').then(g => {
      g.scene.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; (Array.isArray(m.material) ? m.material : [m.material]).forEach(q => { q.metalness = 0; q.roughness = 0.85; q.flatShading = true; q.color.multiplyScalar(1.25); q.needsUpdate = true; }); } });
      M[n] = g.scene;
    })));
    renderPics(); buildJetty(); buildSteps(); dressBucket();
    loaded = true; shownRod = null;
    if (shopEl && !shopEl.hidden) renderShop();
  })().catch(err => { loading = null; console.error(err); });
  return loading;
}
function renderPics() {
  const cv = document.createElement('canvas'), W = 450, H = 76;
  const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0x000000, 0);
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x8a7f9a, 2.3));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(1, 3, 4); sc.add(sun);
  const shoot = (model, w, h, turn) => {
    r.setSize(w, h, false);
    const o = model.clone(true), piv = new THREE.Group(); piv.add(o); sc.add(piv); piv.updateMatrixWorld(true);
    o.position.sub(new THREE.Box3().setFromObject(piv).getCenter(new THREE.Vector3()));
    turn(piv); piv.updateMatrixWorld(true);
    const s = new THREE.Box3().setFromObject(piv).getSize(new THREE.Vector3()), half = Math.max(s.x / 2, s.y / 2 * (w / h)) * 1.06;
    const cam = new THREE.OrthographicCamera(-half, half, half * h / w, -half * h / w, 0.01, 100); cam.position.set(0, 0, 20); cam.lookAt(0, 0, 0);
    r.render(sc, cam); sc.remove(piv);
    return cv.toDataURL();
  };
  for (const id of ROD_ORDER) pics[id] = shoot(M[RODS[id].model], W, H, p => { p.rotation.z = -Math.PI / 2; p.rotation.x = 0.25; });
  pics.worm = shoot(M.Worm, 160, 120, p => { p.rotation.y = -0.5; p.rotation.x = 0.3; });
  pics.lure = shoot(M.Lure_4, 200, 100, p => { p.rotation.x = 0.2; });
  r.dispose(); r.forceContextLoss();
}
// pictures for Fishel's bait cards (null until the models are in: the line icon shows instead)
export const pic = (id) => (id === 'worm' ? pics.worm : id === 'lure' ? pics.lure : pics[id]) || null;

// the rod in your hands: swap the simple stick for the model of the rod you'd use here
let shownRod = null;
function rodHere() {
  const P = A.player.pos;
  if (A.fishingBusy()) return rodFor(A.fishingPlace());
  if (P.z > -2.6 && A.freshNear(P.x, P.z)) return rodFor('river');
  if (P.z < -1.5) return rodFor('beach');
  return shownRod || 'stick';
}
function dress(group, tip, at, tilt) {
  if (!group) return;
  for (const c of group.children) if (c.isMesh) c.visible = false;        // the old stick, grip and reel
  const old = group.getObjectByName('tackleRod'); if (old) group.remove(old);
  const o = M[RODS[shownRod].model].clone(true); o.name = 'tackleRod'; o.scale.setScalar(SCALE);
  const top = new THREE.Box3().setFromObject(M[RODS[shownRod].model]).max.y * o.scale.x;
  if (tilt === null) { o.position.set(0, at, 0); tip.position.y = at + top - 0.02; }                      // the two-handed rod runs along +Y
  else { const dy = Math.cos(tilt), dz = Math.sin(tilt); o.rotation.x = tilt; o.position.set(0, 0.017 + dy * at, -0.035 + dz * at); tip.position.set(0, o.position.y + dy * top, o.position.z + dz * top); }
  group.add(o);
}
function showRod(id) {
  shownRod = id;
  const w = A.worldRod(); if (w) dress(w.rod, w.tip, 0.02, null);
  for (const b of A.bodies()) if (b.tools && b.tools.rod) dress(b.tools.rod, b.tools.rod.userData.tip, 0.14, Math.PI / 2 - 0.45);
}

// ---------- the lake jetty and the steps onto the dock ----------
const JETTY = { x: -5.2, z: 17.7, half: 2.12, wide: 0.74, base: -0.62, scale: 0.2, top: 3.83 };   // Dock_Long_NoRope, out from the lake's path-side shore
let jetty = null;
function buildJetty() {
  jetty = M.Dock_Long_NoRope.clone(true); jetty.scale.setScalar(JETTY.scale); jetty.rotation.y = Math.PI / 2;
  jetty.position.set(JETTY.x, JETTY.base, JETTY.z); A.scene.add(jetty);
}
export const onDeck = (x, z) => !!jetty && Math.abs(x - JETTY.x) < JETTY.half && Math.abs(z - JETTY.z) < JETTY.wide;
export const deckY = (x, z) => (onDeck(x, z) ? JETTY.base + JETTY.top * JETTY.scale : null);
function buildSteps() {
  const d = A.DOCK, s = M.Dock_Stairs.clone(true);
  s.scale.set(0.2, 0.086, 0.1); s.position.set(d.x, 0.02, d.zNear + 0.46); A.scene.add(s);   // top step level with the deck, bottom on the sand
}
function dressBucket() {
  const b = bucketGroup(); if (!b) return;
  b.traverse(c => { if (c.userData.worm) c.visible = false; });
  for (const [x, z, r] of [[-0.06, 0.03, 0.4], [0.07, -0.05, 2.6]]) { const w = M.Worm.clone(true); w.scale.setScalar(0.3); w.position.set(x, 0.235, z); w.rotation.y = r; b.add(w); }
}

// ---------- Fishel's shop: a Rods tab ----------
let shopEl = null, tab = 'bait';
const lockPill = (u, water) => `<span class="tkp lock">${A.svg(u.kind === 'catches' ? 'fish' : 'book', '#2b2140', 16)}<b>${u.have}/${u.need}</b>${A.svg(water === 'fresh' ? 'pond' : 'wave', '#2b2140', 16)}</span>`;
function row(id) {
  const r = RODS[id], has = owned(id), u = id === 'stick' ? null : unlock(id);
  const perk = (icon, t) => `<span class="tkp perk">${A.svg(icon, '#2b2140', 15)}${t}</span>`;
  const right = has ? `<span class="tkp yours">${A.svg('check', '#2b2140', 15)}Yours</span>`
    : u.open ? `<button class="tkbuy" data-rod="${id}" ${A.S.coins < r.buy ? 'disabled' : ''}>${A.svg('coin', '#2b2140', 16)}<b>${r.buy.toLocaleString()}</b></button>`
      : u.prevMissing && u.have >= u.need ? `<span class="tkp lock">${A.svg('lock', '#2b2140', 15)}after the one above</span>` : lockPill(u, r.water);
  return `<div class="tkrow${has ? ' has' : ''}">${pics[id] ? `<img src="${pics[id]}" alt="" draggable="false">` : '<div class="tkph"></div>'}
    <div class="tkl"><span class="tkn">${r.name}</span>${r.reel ? perk('clock', '+' + r.reel + ' s') : ''}${r.bite ? perk('bolt', 'Fast') : ''}${right}</div></div>`;
}
const head = (icon, title, castIcon, cast) => `<div class="tkh">${A.svg(icon, '#2b2140', 24)}<span>${title}</span><span class="tkp cast">${A.svg(castIcon, '#2b2140', 17)}${cast}</span></div>`;
function renderShop() {
  if (!shopEl) return;
  const bait = tab === 'bait';
  shopEl.querySelector('#baitCards').hidden = !bait; shopEl.querySelector('.note').hidden = !bait;
  shopEl.querySelectorAll('.tktabs button').forEach(b => b.classList.toggle('on', b.dataset.tk === tab));
  const list = shopEl.querySelector('#rodList'); list.hidden = bait;
  if (bait) return;
  const ids = (w) => ROD_ORDER.filter(id => RODS[id].water === w).map(row).join('');
  list.innerHTML = row('stick') + head('pond', 'River and lake', 'arc', 'Plop') + ids('fresh') + head('wave', 'Sea', 'zip', 'Zip') + ids('sea')
    + '<p class="tknote">Catch fish and fill your fish book to unlock a rod. The right rod comes out by itself where you fish.</p>';
}
function buy(id) {
  const r = RODS[id];
  if (owned(id) || !unlock(id).open || A.S.coins < r.buy) return;
  A.S.coins -= r.buy; A.S.rods = [...(A.S.rods || []), id];
  A.audio.play('buy'); A.commit(); A.toast(`${r.name}: yours!`); renderShop();
}
// called whenever Fishel's shop opens
export function shopOpened() { tab = 'bait'; renderShop(); }

export const ready = () => loaded;      // tests
export const shown = () => shownRod;
export function frame() {
  if (!A || !loaded) return;
  const id = rodHere();
  if (id !== shownRod) showRod(id);
}

export function init(api) {
  A = api; THREE = api.THREE;
  Object.assign(A.ICON, {
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    arc: '<path d="M3 19C6 3 18 3 21 19"/><circle cx="21" cy="19" r="1.2"/>',
    zip: '<path d="M3 14h15"/><path d="M13 9l5 5-5 5"/>',
    clock: A.ICON.clock || '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: A.ICON.check || '<path d="M5 12l5 5 9-10"/>',
    book: A.ICON.book || '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M19 19v2H6"/>',
  });
  const st = document.createElement('style');
  st.textContent = `
#baitShop .tktabs { display: flex; gap: 6px; margin: 6px 0 8px; }
#baitShop .tktabs button { flex: 1; min-height: 44px; border: 2px solid #2b2140; border-radius: 12px; background: #fff; font: inherit; font-size: 16px; font-weight: 700; color: #2b2140; cursor: pointer; }
#baitShop .tktabs button.on { background: #ffe08a; }
#rodList { display: flex; flex-direction: column; gap: 7px; max-height: 58vh; overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y; }
#rodList .tkrow { background: #fff; border: 2px solid #2b2140; border-radius: 14px; padding: 5px 9px 7px; }
#rodList .tkrow.has { background: #f6f1e4; }
#rodList .tkrow img, #rodList .tkph { display: block; width: 100%; aspect-ratio: 450 / 76; pointer-events: none; }
#rodList .tkl { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
#rodList .tkn { font-size: 16px; font-weight: 700; flex: 1; white-space: nowrap; }
#rodList .tkp { display: inline-flex; align-items: center; gap: 3px; border: 2px solid #2b2140; border-radius: 999px; padding: 0 8px 0 5px; font-size: 13px; font-weight: 700; white-space: nowrap; }
#rodList .tkp.perk { background: #dff1fb; } #rodList .tkp.yours { background: #c9efc0; } #rodList .tkp.lock { background: #f1ede2; } #rodList .tkp.cast { background: #fff3d1; font-size: 14px; }
#rodList .tkp b { font-size: 15px; }
#rodList .tkbuy { display: inline-flex; align-items: center; gap: 4px; min-height: 36px; border: 2px solid #2b2140; border-radius: 999px; background: #ffe08a; padding: 0 12px 0 8px; font: inherit; color: #2b2140; cursor: pointer; box-shadow: 0 2px 0 rgba(43,33,64,.3); }
#rodList .tkbuy b { font-size: 16px; } #rodList .tkbuy:disabled { opacity: 0.5; box-shadow: none; }
#rodList .tkh { display: flex; align-items: center; gap: 7px; margin-top: 4px; font-size: 18px; font-weight: 700; color: #2b2140; } #rodList .tkh span:nth-child(2) { flex: 1; }
#rodList .tknote { font-size: 12.5px; text-align: center; margin: 2px 0 0; }`;
  document.head.appendChild(st);
  shopEl = document.getElementById('baitShop');
  const tabs = document.createElement('div'); tabs.className = 'tktabs';
  tabs.innerHTML = '<button data-tk="bait">Bait</button><button data-tk="rods">Rods</button>';
  const list = document.createElement('div'); list.id = 'rodList'; list.hidden = true;
  const cards = shopEl.querySelector('#baitCards'); cards.parentNode.insertBefore(tabs, cards); cards.parentNode.insertBefore(list, cards);
  tabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.tk; renderShop(); } });
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-rod]'); if (b && !b.disabled) buy(b.dataset.rod); });
}
