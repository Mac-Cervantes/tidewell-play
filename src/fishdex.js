// The fish book (try/fishing; mockup "Book A": a grid of pictures with a card at the bottom).
// Every fish as a picture rendered from its 3D model, a silhouette until you catch it, how many you've
// caught, your biggest, its rarity, and picture hints: where, when and season always show; the bait and
// rain hints unlock (town level / a few catches at that place / ask Fishel for coins), and catching the
// fish opens everything. Also the Sightings page: the dolphin and the whale surface out at sea now and then.
// main.js only calls init(), open(), record() and frame(); look for "FISHING" there.
import { FISH, SIGHTS, RARITY, RARITY_ORDER, PLACES, HINTS, BAIT, BAIT_ORDER, XP, inches } from './data.js';

let A = null, THREE = null, el = null;
let tab = 'sea', sel = null, askFor = null;

const IC = {
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M19 19v2H6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  leaf: '<path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15z"/><path d="M5 19l9-9"/>',
  year: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/>',
  drop: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>',
  ruler: '<rect x="2" y="8" width="20" height="8" rx="1"/><path d="M6 8v3M10 8v4M14 8v3M18 8v4"/>',
  bino: '<circle cx="7" cy="15" r="4"/><circle cx="17" cy="15" r="4"/><path d="M7 11V6h3v8M17 11V6h-3v8"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
};
const ic = (k, sz = 24, c = '#2b2140', w = 2.2) => IC[k]
  ? `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`
  : A.svg(k, c, sz, w);
const TABS = [['sea', 'wave', 'Sea'], ['river', 'river', 'River'], ['lake', 'pond', 'Lake'], ['sights', 'bino', 'Sightings']];
const tabFish = (t) => FISH.filter(f => PLACES[f.place].tab === t).sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
const caught = (id) => (A.S.caught && A.S.caught[id]) || 0;
const seen = (id) => (A.S.seen && A.S.seen[id]) || 0;
export const foundCount = () => FISH.filter(f => caught(f.id)).length + SIGHTS.filter(s => seen(s.id)).length;
export const totalCount = () => FISH.length + SIGHTS.length;
const placeCatches = (place) => FISH.reduce((n, f) => n + (f.place === place ? caught(f.id) : 0), 0);
const bestBait = (f) => BAIT_ORDER.slice().sort((a, b) => BAIT[b].mult[f.rarity] - BAIT[a].mult[f.rarity])[0];

// ---------- hints ----------
function hintOpen(f, which) {
  if (caught(f.id)) return true;
  if (A.S.hints && A.S.hints[f.id] && A.S.hints[f.id][which]) return true;
  return which === 'bait' ? A.S.level >= HINTS.baitLevel[f.rarity] : placeCatches(f.place) >= HINTS.rainTask;
}
function whenChip(f) {
  const t = f.times || [];
  if (!t.length) return ['clock', 'Any time'];
  const dayish = t.includes('morning') || t.includes('day'), nightish = t.includes('evening') || t.includes('night');
  return dayish && !nightish ? ['sun', 'Day'] : !dayish && nightish ? ['moon', 'Night'] : ['clock', 'Any time'];
}
function seasonChip(f) {
  if (f.only) return ['leaf', f.only + ' only'];
  if (f.season) return ['leaf', Object.keys(f.season).map(s => s.slice(0, 3)).join(' ') + ' +'];
  return ['year', 'All year'];
}
const chip = (icon, label) => `<div class="fbchip">${ic(icon, 28)}<span>${label}</span></div>`;
function lockChip(f, which, label) {
  const foot = which === 'bait'
    ? `Lv ${HINTS.baitLevel[f.rarity]}`
    : `<i class="pips">${[0, 1, 2].map(i => `<i class="${i < Math.min(HINTS.rainTask, placeCatches(f.place)) ? 'on' : ''}"></i>`).join('')}</i>`;
  return `<button class="fbchip lock${askFor === which ? ' ask' : ''}" data-ask="${which}" aria-label="${label} hint, locked">${ic('lock', 24, '#5a5470')}<span>${label}</span><em>${foot}</em></button>`;
}
function chipsFor(f) {
  const [wi, wl] = whenChip(f), [si, sl] = seasonChip(f), p = PLACES[f.place];
  const bait = hintOpen(f, 'bait') ? chip(bestBait(f), BAIT[bestBait(f)].name) : lockChip(f, 'bait', 'Bait');
  const rain = hintOpen(f, 'rain') ? chip('drop', f.rain ? 'Rain +' : 'Same') : lockChip(f, 'rain', 'Rain');
  return chip(p.icon, p.name) + chip(wi, wl) + chip(si, sl) + bait + rain;
}

// ---------- drawing the book ----------
const stars = (f) => { const n = RARITY_ORDER.indexOf(f.rarity) + 1, c = f.rarity === 'common' ? '#6b7280' : RARITY[f.rarity].color;
  return `<span class="fbstars" aria-label="${n} of 5 stars">${[0, 1, 2, 3, 4].map(i => `<svg width="15" height="15" viewBox="0 0 24 24" fill="${i < n ? c : '#fff'}" stroke="#2b2140" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.8 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3.1 1.2-6.2L3 9.6l6.3-.8z"/></svg>`).join('')}</span>`; };
const pic = (id, got) => A.fishIcon[id] ? `<img src="${A.fishIcon[id]}" alt="" class="${got ? '' : 'sil'}" draggable="false">` : '<span class="q">?</span>';
function tile(id, got, n, color) {
  return `<button class="fbtile${got ? '' : ' no'}${sel === id ? ' on' : ''}" data-fish="${id}" style="border-color:${color}" aria-label="${got ? 'Caught' : 'Not caught yet'}">${pic(id, got)}<b>${got ? '&times;' + n : '?'}</b></button>`;
}
function render() {
  if (!el) return;
  const list = tab === 'sights' ? SIGHTS : tabFish(tab);
  if (!list.some(f => f.id === sel)) { sel = list[0].id; askFor = null; }
  el.querySelector('.fbn').innerHTML = `${A.svg('fish', '#2b2140', 20)}<b>${foundCount()}</b>/ ${totalCount()}`;
  el.querySelector('.fbtabs').innerHTML = TABS.map(([t, icon, name]) => {
    const l = t === 'sights' ? SIGHTS : tabFish(t), n = t === 'sights' ? l.filter(s => seen(s.id)).length : l.filter(f => caught(f.id)).length;
    return `<button class="${t === tab ? 'on' : ''}" data-tab="${t}" aria-label="${name}">${ic(icon, 24)}<span>${n}/${l.length}</span></button>`;
  }).join('');
  el.querySelector('.fbgrid').innerHTML = tab === 'sights'
    ? SIGHTS.map(s => tile(s.id, seen(s.id) > 0, seen(s.id), '#3e8fe0')).join('')
    : list.map(f => tile(f.id, caught(f.id) > 0, caught(f.id), RARITY[f.rarity].color)).join('');
  const card = el.querySelector('.fbcard');
  if (tab === 'sights') {
    const s = SIGHTS.find(q => q.id === sel), got = seen(s.id) > 0;
    card.innerHTML = `<div class="fbtop"><div class="fbpic">${pic(s.id, got)}</div><div><h3>${got ? s.name : '? ? ?'}</h3><p>Watch the sea from the beach or the dock.</p></div></div>
      <div class="fbstats"><div>${ic('bino', 24)}<b>${got ? '&times;' + seen(s.id) : '&ndash;'}</b><span>seen</span></div></div>
      <div class="fbchips">${chip('wave', 'Sea')}${chip('clock', 'Any time')}${chip('year', 'All year')}</div>`;
    return;
  }
  const f = FISH.find(q => q.id === sel), got = caught(f.id) > 0, big = A.S.big && A.S.big[f.id];
  const price = HINTS.price[f.rarity];
  card.innerHTML = `<div class="fbtop"><div class="fbpic">${pic(f.id, got)}</div><div><h3>${got ? f.name : '? ? ?'}</h3>${stars(f)}<p>${RARITY[f.rarity].label}</p></div></div>
    <div class="fbstats"><div>${A.svg('fish', '#2b2140', 24)}<b>${got ? '&times;' + caught(f.id) : '&ndash;'}</b><span>caught</span></div><div>${ic('ruler', 24)}<b>${big ? inches(big) : '&ndash;'}</b><span>in</span></div></div>
    <div class="fbchips">${chipsFor(f)}</div>
    ${askFor && !hintOpen(f, askFor) ? `<button class="fbask" data-buy="${askFor}" ${A.S.coins < price ? 'disabled' : ''}>Ask Fishel ${A.svg('coin', '#2b2140', 18)}<b>${price}</b></button>` : ''}`;
}
function onClick(e) {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; sel = null; askFor = null; render(); }
  else if (t.dataset.fish) { sel = t.dataset.fish; askFor = null; render(); }
  else if (t.dataset.ask) { askFor = askFor === t.dataset.ask ? null : t.dataset.ask; render(); }
  else if (t.dataset.buy) {
    const f = FISH.find(q => q.id === sel), price = HINTS.price[f.rarity];
    if (A.S.coins < price) return;
    A.S.coins -= price; A.S.hints = A.S.hints || {}; (A.S.hints[f.id] = A.S.hints[f.id] || {})[t.dataset.buy] = true;
    askFor = null; A.audio.play('buy'); A.commit(); render();
  } else if (t.classList.contains('fbx')) el.hidden = true;
}
export function open(fishId) {
  if (fishId) { const f = FISH.find(q => q.id === fishId); if (f) { tab = PLACES[f.place].tab; sel = f.id; } }
  askFor = null; A.ensureFish(); A.openSheet('fishBook'); render();
}

// ---------- catches ----------
// Called for every catch (after S.caught is counted). Keeps your biggest; returns what the catch card shows.
export function record(fish, size) {
  const S = A.S; S.big = S.big || {};
  const old = S.big[fish.id] || 0, best = size > old;
  if (best) S.big[fish.id] = Math.round(size * 1000) / 1000;
  return { inches: inches(size), record: best && old > 0 };
}

// ---------- sightings ----------
let sight = null, nextSight = 90;
function spawnSight(force) {
  const P = A.player.pos;
  const s = force ? SIGHTS.find(q => q.id === force) : (Math.random() < SIGHTS[1].chance ? SIGHTS[1] : SIGHTS[0]);
  const g = A.M.fish[s.model]; if (!g) { A.ensureFish(); return false; }
  const o = A.cloneFish(s.model);
  // Measure the animal as it is really drawn (with its bones), not its raw mesh. The raw mesh of these two is about 100
  // times bigger than what the bones draw, so they came out 4 cm long: there, counted, and impossible to see. (Mac, v0.1.93)
  o.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(o, true), len = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
  o.scale.multiplyScalar(s.len / len);
  o.traverse(m => { if (m.isMesh) { m.frustumCulled = false; m.castShadow = true; } });
  // pick a spot on the water in the open middle of your screen (below the panels at the top, above the toolbar), not too far
  // off to be seen, and clear of the dock and the ship. No good spot right now: don't show it at all, try again shortly.
  // (It used to fall back to a spot off screen or behind the panels, and far ones faded into the haze. Mac, v0.1.93)
  let x = 0, z = 0, ok = false;
  for (let i = 0; i < 14 && !ok; i++) {
    const w = A.waterAt((Math.random() * 2 - 1) * 0.5, -0.1 + Math.random() * 0.5);
    if (!w || w.z > -6.5 || Math.hypot(w.x - P.x, w.z - P.z) > 24 || (w.x > -4 && w.x < 9 && w.z > -22)) continue;
    x = w.x; z = w.z; ok = true;
  }
  if (!ok) return false;
  const holder = new THREE.Group(); holder.add(o); A.scene.add(holder);
  const dirX = Math.random() < 0.5 ? 1 : -1, whale = s.id === 'whale';
  sight = { s, holder, t: 0, dur: whale ? 5.5 : 2.2, x: x - dirX * (whale ? 1.5 : 2.25), z, dirX, whale, counted: false };   // the middle of its path is the spot picked
  A.addSplash(x, z);
  return true;
}
function tickSight(dt) {
  if (!sight) {
    const P = A.player.pos;
    if (P.z > 0.5 || A.quiet()) return;            // only while you're down by the water
    nextSight -= dt;
    if (nextSight <= 0) { nextSight = spawnSight() ? (A.debug() ? 30 : 240 + Math.random() * 240) : 20; }
    return;
  }
  const q = sight; q.t += dt; const u = Math.min(1, q.t / q.dur), h = q.holder;
  if (q.whale) { h.position.set(q.x + q.dirX * u * 3, A.WATER_Y - 1.5 + Math.sin(Math.PI * u) * 1.55, q.z); h.rotation.set(0, q.dirX > 0 ? Math.PI / 2 : -Math.PI / 2, 0); h.rotateX(-Math.cos(Math.PI * u) * 0.25); }
  else { h.position.set(q.x + q.dirX * u * 4.5, A.WATER_Y - 0.3 + Math.sin(Math.PI * u) * 2.1, q.z); h.rotation.set(0, q.dirX > 0 ? Math.PI / 2 : -Math.PI / 2, 0); h.rotateX(-Math.cos(Math.PI * u) * 1.0); }
  if (!q.counted && u > 0.5) {
    q.counted = true;
    const v = A.project(h.position.x, h.position.y, h.position.z);
    if (v.z < 1 && v.x > innerWidth * 0.06 && v.x < innerWidth * 0.94 && v.y > innerHeight * 0.16 && v.y < innerHeight * 0.72 && !A.busy()) {   // it only counts if you could really see it: in the open part of the screen, with no menu up
      const S = A.S; S.seen = S.seen || {}; S.seen[q.s.id] = (S.seen[q.s.id] || 0) + 1;
      const first = S.seen[q.s.id] === 1;
      if (first) A.addXP(XP.newFish);
      A.audio.play(first ? 'catch' : 'splash'); A.commit();
      A.toast(first ? `You spotted a ${q.s.name.toLowerCase()}! It's in your fish book.` : `A ${q.s.name.toLowerCase()}!`);
    }
  }
  if (u >= 1) { A.addSplash(h.position.x, h.position.z); A.scene.remove(h); sight = null; }
}
export function frame(dt) { if (A) tickSight(dt); }
export const debugSight = (id) => { if (sight) return false; return spawnSight(id || 'dolphin'); };   // tests and the debug panel
export const sighting = () => !!sight;

export function init(api) {
  A = api; THREE = api.THREE;
  const st = document.createElement('style');
  st.textContent = `
#fishBook { align-items: center; justify-content: center; }
#fishBook .fb { background: #fffcf4; border: 2px solid #2b2140; border-radius: 20px; width: min(372px, 95vw); max-height: min(92vh, 780px); display: flex; flex-direction: column; overflow: hidden; color: #2b2140; }
#fishBook .fbh { display: flex; align-items: center; gap: 8px; padding: 12px 12px 8px; }
#fishBook .fbh h2 { margin: 0; font-size: 22px; flex: 1; }
#fishBook .fbn { display: flex; align-items: center; gap: 4px; background: #ffe08a; border: 2px solid #2b2140; border-radius: 999px; padding: 1px 10px; font-size: 14px; font-weight: 600; }
#fishBook .fbn b { font-size: 22px; }
#fishBook .fbx { width: 44px; height: 44px; border-radius: 50%; border: 2px solid #2b2140; background: #fff; display: flex; align-items: center; justify-content: center; padding: 0; cursor: pointer; }
#fishBook .fbtabs { display: flex; gap: 6px; padding: 0 12px 8px; }
#fishBook .fbtabs button { flex: 1; height: 54px; border: 2px solid #2b2140; border-radius: 14px; background: #fff; font: inherit; color: inherit; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0; padding: 0; cursor: pointer; font-size: 13px; font-weight: 700; }
#fishBook .fbtabs button.on { background: #ffe08a; }
#fishBook .fbgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; padding: 4px 12px 12px; overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y; flex: 1; min-height: 110px; align-content: start; }
#fishBook .fbtile { position: relative; aspect-ratio: 1.08; border: 4px solid; outline: 2px solid #2b2140; outline-offset: -1px; border-radius: 16px; background: #fff; display: flex; align-items: center; justify-content: center; padding: 4px; cursor: pointer; font: inherit; color: inherit; min-width: 0; }
#fishBook .fbtile.no { background: #f1ede2; }
#fishBook .fbtile.on { box-shadow: 0 0 0 3px #fffcf4, 0 0 0 6px #2b2140; }
#fishBook .fbtile img { max-width: 86%; max-height: 70%; pointer-events: none; }
#fishBook img.sil { filter: brightness(0); opacity: 0.3; }
#fishBook .q { font-size: 34px; font-weight: 700; color: #5a5470; }
#fishBook .fbtile b { position: absolute; right: 6px; bottom: 2px; font-size: 17px; }
#fishBook .fbtile.no b { color: #5a5470; font-size: 20px; }
#fishBook .fbcard { background: #fff3d1; border-top: 2px solid #2b2140; border-radius: 20px 20px 0 0; padding: 12px 12px calc(12px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 8px; }
#fishBook .fbtop { display: flex; align-items: center; gap: 10px; }
#fishBook .fbpic { width: 116px; height: 78px; flex: none; background: #dff1fb; border: 2px solid #2b2140; border-radius: 14px; display: flex; align-items: center; justify-content: center; }
#fishBook .fbpic img { max-width: 88%; max-height: 82%; }
#fishBook h3 { margin: 0 0 2px; font-size: 20px; }
#fishBook .fbtop p { margin: 0; font-size: 13px; font-weight: 600; color: #2b2140; }
#fishBook .fbstars { display: flex; gap: 2px; }
#fishBook .fbstats { display: flex; gap: 8px; }
#fishBook .fbstats div { flex: 1; background: #fff; border: 2px solid #2b2140; border-radius: 14px; padding: 3px 10px; display: flex; align-items: center; gap: 7px; }
#fishBook .fbstats b { font-size: 30px; line-height: 1.1; }
#fishBook .fbstats span { font-size: 13px; font-weight: 600; }
#fishBook .fbchips { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; align-items: start; }
#fishBook .fbchip { min-height: 70px; border: 2px solid #2b2140; border-radius: 14px; background: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 3px 1px; font: inherit; color: inherit; min-width: 0; }
#fishBook .fbchip span { font-size: 11.5px; font-weight: 700; text-align: center; line-height: 1.1; }
#fishBook .fbchip.lock { border-style: dashed; border-color: #6b6480; background: #f1ede2; cursor: pointer; }
#fishBook .fbchip.lock span { color: #5a5470; }
#fishBook .fbchip.lock.ask { background: #ffe08a; border-style: solid; border-color: #2b2140; }
#fishBook .fbchip em { font-style: normal; font-size: 12px; font-weight: 700; }
#fishBook .pips { display: flex; gap: 2px; } #fishBook .pips i { width: 10px; height: 8px; border-radius: 3px; background: #fff; border: 1.5px solid #2b2140; } #fishBook .pips i.on { background: #4caf50; }
#fishBook .fbask { align-self: center; min-height: 44px; display: flex; align-items: center; gap: 6px; background: #ffe08a; border: 2px solid #2b2140; border-radius: 999px; padding: 4px 16px; font: inherit; font-size: 16px; font-weight: 700; color: #2b2140; cursor: pointer; box-shadow: 0 3px 0 rgba(43,33,64,.3); }
#fishBook .fbask:disabled { opacity: 0.5; box-shadow: none; }`;
  document.head.appendChild(st);
  el = document.createElement('div'); el.id = 'fishBook'; el.className = 'sheet'; el.hidden = true;
  el.innerHTML = `<div class="fb"><div class="fbh">${ic('book', 28)}<h2>Fish Book</h2><span class="fbn"></span><button class="fbx" aria-label="Close">${ic('x', 22)}</button></div>
    <div class="fbtabs"></div><div class="fbgrid"></div><div class="fbcard"></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click', onClick);
}
