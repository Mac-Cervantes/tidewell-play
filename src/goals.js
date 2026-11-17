// src/goals.js — the first ten goals (v0.1.67, Mac: "the player is never guided by the game itself").
// One goal at a time: a card under the season panel (mockup B), and while it's the current goal the game points the way:
//   a path of round dots from you to the goal, a glow on the person (or a ring at the place), a pointing hand,
//   an arrow at the screen edge when the goal is off screen, and a glow + hand on the button to press.
// Texts and prizes are GOALS in data.js; what counts as done and where to point is RULES here.
// main.js hooks are marked GOALS. The hand picture is assets/ui/hand.svg (points right), made to be swapped for a pack's.
import { GOALS, ITEMS } from './data.js';
import { mergeVertices } from '../lib/addons/utils/BufferGeometryUtils.js';

const HAND_SRC = './assets/ui/hand.svg';
let A, T, card, fx, hand, arrow, doneEl, ring, glowEl = null, hullOf = null;
const dots = [], doneQ = [];
const byId = (id) => document.getElementById(id);
const vis = (id) => { const e = byId(id); return !!e && !e.hidden; };
const slot = (i) => document.querySelectorAll('#hotbar .slot')[i] || null;
const isOn = (el) => !!el && el.classList.contains('on');
const total = (S) => Object.values(S.caught || {}).reduce((a, b) => a + b, 0);
const npcAt = (k) => { const n = A.npc(k); return n ? { x: n.pos.x, z: n.pos.z, npc: n, h: 2.45 } : null; };

// on: a main.js event finishes it · poll: checked every frame · use: action-button labels to light up
// ui: a button to point at · at: a spot in the world to lead to · start: remember where things stood
const RULES = {
  hello:   { on: 'talk', use: ['Talk'], at: () => npcAt('higgins') },
  plant:   { poll: (S) => S.plots.some(p => p.crop), use: ['Plant'], ui: (S) => S.plots.length ? (isOn(slot(2)) ? null : slot(2)) : (isOn(slot(1)) ? null : slot(1)) },
  water:   { poll: (S) => S.plots.some(p => p.crop && p.watered != null), ui: () => isOn(slot(1)) ? null : slot(1) },
  worms:   { on: 'worms', use: ['Take'], at: () => ({ ...A.bucketPos(), ring: true, h: 1.1 }), skip: () => A.bucketCount() <= 0 },
  catch:   { start: (S, g) => { g.base = total(S); }, poll: (S, g) => total(S) > (g.base || 0), use: ['Cast', 'Reel!'],
             ui: () => isOn(slot(0)) ? null : slot(0),
             at: () => A.fishing.state === 'idle' ? { x: A.DOCK.x - 0.45, z: -6.5, via: [{ x: A.DOCK.x, z: -3.4 }], ring: true, h: 1.3 } : null },
  book:    { poll: () => vis('fishBook'), menu: true, ui: () => vis('menu') ? byId('menuFish') : byId('menuBtn') },
  sell:    { on: 'sell', use: ['Talk'], at: () => npcAt('higgins'), dialog: true,
             ui: () => A.dlgOpen() ? [...document.querySelectorAll('#dChoices button')].find(b => /^Sell/.test(b.textContent)) || null : null },
  bench:   { poll: (S) => S.decor.length > 0, ui: () => isOn(slot(4)) ? null : slot(4) },
  order:   { on: 'order', use: ['Orders'], at: () => ({ x: A.BOARD.x, z: A.BOARD.z + 0.9, ring: true, h: 2.3 }) },
  harvest: { on: 'harvest', use: ['Harvest', 'Plant'],
             ui: (S) => S.plots.some(q => q.crop) ? null : S.plots.length ? (isOn(slot(2)) ? null : slot(2)) : (isOn(slot(1)) ? null : slot(1)),   // nothing growing: point back at planting
             at: (S) => { const p = S.plots.find(q => q.crop); return p ? { x: p.x + 0.5, z: p.z + 0.5, ring: true, h: 1.2 } : null; } },
};

function state() {
  const S = A.S;
  if (!S.goals) {   // a harbor that's already under way skips the goals; a new one starts at the first
    const old = S.introDone && ((S.level || 1) >= 2 || (S.xp || 0) >= 40);
    S.goals = old ? { i: GOALS.length, done: true } : { i: 0 };
  }
  return S.goals;
}
const cur = () => { const g = state(); return g.done ? null : GOALS[g.i]; };

export function event(name) { const d = cur(); if (d && RULES[d.id].on === name) complete(); }
export function debug(k) {
  if (k === 'restart') { A.S.goals = { i: 0 }; doneQ.length = 0; doneEl.hidden = true; A.commit(); A.toast('Goals: back to the first one'); }
  if (k === 'skip' && cur()) complete();
}

const prizeHTML = (p, big) => p.coins
  ? `<span class="gcoin${big ? ' big' : ''}"></span><b>${big ? '+' : ''}${p.coins}</b>`
  : `<b>${big ? '+' : ''}${p.n} ${ITEMS[p.item] ? ITEMS[p.item].name : p.item}</b>`;

function complete() {
  const S = A.S, g = state(), d = GOALS[g.i]; if (!d) return;
  if (d.prize.coins) S.coins += d.prize.coins; else A.addItem(d.prize.item, d.prize.n);
  g.i++; delete g.started; delete g.base; if (g.i >= GOALS.length) g.done = true;
  doneQ.push({ d, next: GOALS[g.i] || null });
  A.renderHotbar(); A.commit();
}

// ---------- the card and the "Goal done!" card ----------
const STAR = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.5 5.7 21.1l1.5-7L2 9.3l7-.8z" fill="#ffd84d" stroke="#2b2140" stroke-width="2" stroke-linejoin="round"/></svg>`;
let cardKey = '';
function renderCard() {
  const d = cur(), show = !!d;
  if (card.hidden === show) card.hidden = !show;
  if (!d || cardKey === d.id) return;
  cardKey = d.id;
  card.innerHTML = `<span class="gtop">${STAR(20)}<b>${d.title}</b></span>
    <span class="gmid">${A.svg(d.pic, '#2b2140', 24)}<span class="gbar"></span><b>0/1</b></span>
    <span class="gprize">Prize: ${prizeHTML(d.prize)}</span>`;
}
function tickDone() {
  if (!doneQ.length || !doneEl.hidden || A.busy()) return;
  const { d, next } = doneQ.shift();
  doneEl.innerHTML = `<div class="gdcard" role="dialog" aria-label="Goal done">${STAR(54)}
    <div class="gdh">${next ? 'Goal done!' : 'All ten done!'}</div><div class="gdsub">${d.title}</div><div class="gdprize">${prizeHTML(d.prize, true)}</div>
    ${next ? `<div class="gdnext"><span>Next goal</span><b>${next.title}</b></div>` : '<div class="gdnext"><b>You know your way around. The harbor is yours!</b></div>'}
    <button class="gdok">Nice!</button></div>`;
  doneEl.hidden = false; A.audio.play('levelUp');
  doneEl.querySelector('.gdok').addEventListener('click', () => { doneEl.hidden = true; });
}

// ---------- pointing the way ----------
function setGlow(el) { if (glowEl === el) return; if (glowEl) glowEl.classList.remove('goalGlow'); glowEl = el; if (el) el.classList.add('goalGlow'); }
function place(node, x, y, rot) { node.hidden = false; node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot}deg)`; }
function hull(n) {   // a soft yellow glow around a person: two see-through shells just outside the body, moving with it
  if (hullOf === n) return;
  if (hullOf && hullOf.b.goalHull) hullOf.b.goalHull.forEach(h => { h.visible = false; });
  hullOf = n; if (!n) return;
  if (!n.b.goalHull) {
    const skins = []; n.b.puppet.k.traverse(o => { if (o.isSkinnedMesh) skins.push(o); });
    n.b.goalHull = [];
    for (const o of skins) {
      const w = new T.BufferGeometry(); for (const k of ['position', 'skinIndex', 'skinWeight']) w.setAttribute(k, o.geometry.attributes[k]);
      if (o.geometry.index) w.setIndex(o.geometry.index);
      const hg = mergeVertices(w, 1e-4); hg.computeVertexNormals();
      const sc = o.getWorldScale(new T.Vector3()).x || 1;
      for (const [off, op] of [[0.045, 0.95], [0.1, 0.4]]) {
        const m = new T.MeshBasicMaterial({ color: 0xffd84d, side: T.BackSide, transparent: true, opacity: op, depthWrite: false });
        const amt = (off / sc).toFixed(5);
        m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed += normal * ${amt};`); };
        m.customProgramCacheKey = () => 'goalhull' + amt;
        const h = new T.SkinnedMesh(hg, m); h.bind(o.skeleton, o.bindMatrix); h.frustumCulled = false;
        h.position.copy(o.position); h.quaternion.copy(o.quaternion); h.scale.copy(o.scale); o.parent.add(h); n.b.goalHull.push(h);
      }
    }
  }
  n.b.goalHull.forEach(h => { h.visible = true; });
}
const _v = { x: 0, y: 0, z: 0 };
function screen(x, y, z) {
  const v = new T.Vector3(x, y, z).project(A.camera);
  _v.x = (v.x * 0.5 + 0.5) * innerWidth; _v.y = (-v.y * 0.5 + 0.5) * innerHeight; _v.z = v.z; return _v;
}
function path(at, t) {
  const P = A.player.pos, pts = [{ x: P.x, z: P.z }];
  for (const w of at.via || []) if ((P.z - w.z) * (at.z - w.z) < 0) pts.push(w);   // a waypoint only while it's still between you and the goal
  pts.push(at);
  let n = 0, carry = 0.9 - (t * 0.6) % 0.55, left = 0;
  for (let i = 1; i < pts.length; i++) left += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  for (let i = 1; i < pts.length && n < dots.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 0.01) continue;
    let s = carry;
    for (; s < L && n < dots.length; s += 0.55) {
      if (left - s < 0.7) break;   // stop short of the goal
      const x = a.x + (b.x - a.x) * s / L, z = a.z + (b.z - a.z) * s / L, d = dots[n++];
      d.position.set(x, A.floorY(x, z) + 0.16, z); d.visible = true;
    }
    carry = s - L; left -= L;
  }
  for (; n < dots.length; n++) dots[n].visible = false;
}
function hideWorld() { hull(null); ring.visible = false; for (const d of dots) d.visible = false; }
function hideAll() { setGlow(null); hand.hidden = true; arrow.hidden = true; hideWorld(); }

let time = 0;
function guide(dt, r) {
  time += dt;
  const S = A.S, bob = Math.sin(time * 5) * 5;
  if (!doneEl.hidden || A.titleOn() || A.wardOn()) { hideAll(); return; }
  let el = null, at = null;
  const u = r.ui ? r.ui(S) : null;
  if (A.dlgOpen()) el = r.dialog ? u : null;
  else if (A.sheetOpen()) el = r.menu && vis('menu') ? u : null;
  else if (!A.playing()) el = null;
  else {
    const use = byId('useBtn');
    if (r.use && !use.hidden && r.use.includes(byId('useLabel').textContent)) el = use;
    else if (u) el = u;
    else at = r.at ? r.at(S) : null;
  }
  setGlow(el);
  if (el) {
    hideWorld(); arrow.hidden = true;
    const b = el.getBoundingClientRect();
    if (b.top > 120) place(hand, b.left + b.width / 2 - 32, b.top - 52 + bob, 90);       // above, pointing down
    else place(hand, b.left + b.width / 2 - 32, b.bottom + 4 - bob, -90);                 // below, pointing up
    return;
  }
  if (!at) { hand.hidden = true; arrow.hidden = true; hideWorld(); return; }
  const gy = A.floorY(at.x, at.z);
  hull(at.npc || null);
  ring.visible = !!at.ring; if (at.ring) { ring.position.set(at.x, gy + 0.06, at.z); ring.scale.setScalar(1 + 0.12 * Math.sin(time * 4)); }
  path(at, time);
  const p = screen(at.x, gy + (at.h || 1.5), at.z), m = 46;
  const off = p.z > 1 || p.x < m || p.x > innerWidth - m || p.y < 150 || p.y > innerHeight - 170;
  if (!off) { arrow.hidden = true; place(hand, p.x - 32, p.y - 50 + bob, 90); return; }
  hand.hidden = true;
  const cx = innerWidth / 2, cy = innerHeight / 2; let dx = p.x - cx, dy = p.y - cy; if (p.z > 1) { dx = -dx; dy = -dy; }
  const k = Math.min((cx - m) / Math.max(1, Math.abs(dx)), (dy < 0 ? cy - 150 : cy - 170) / Math.max(1, Math.abs(dy)));
  place(arrow, cx + dx * k - 22, cy + dy * k - 26 + bob * 0.6, Math.atan2(dy, dx) * 180 / Math.PI - 90);
}

export function frame(dt) {
  const S = A.S, g = state();
  byId('menuFish').hidden = !g.done && g.i < 5;      // the Fish Book shows up with its goal (Mac: hide the buttons)
  byId('menuOrders').hidden = !g.done && g.i < 8;    // and Orders with the order goal
  renderCard();
  if (g.done) { hideAll(); tickDone(); return; }
  const r = RULES[GOALS[g.i].id];
  if (!g.started) { g.started = 1; if (r.start) r.start(S, g); }
  if ((r.poll && r.poll(S, g)) || (r.skip && r.skip())) { hideAll(); complete(); return; }
  guide(dt, r); tickDone();
}

export function init(api) {
  A = api; T = A.THREE;
  const css = document.createElement('style'); css.textContent = CSS; document.head.appendChild(css);
  card = document.createElement('button'); card.id = 'goalCard'; card.className = 'panel'; card.hidden = true; card.setAttribute('aria-label', 'Your goal');
  byId('seasonTxt').after(card);
  card.addEventListener('click', () => { const d = cur(); if (d) A.toast(d.hint); });
  fx = document.createElement('div'); fx.id = 'goalFx';
  fx.innerHTML = `<img id="goalHand" src="${HAND_SRC}" alt="" hidden><div id="goalArrow" hidden><svg width="44" height="52" viewBox="0 0 44 52"><path d="M14 4h16v22h10L22 48 4 26h10z" fill="#ffd84d" stroke="#2b2140" stroke-width="3.5" stroke-linejoin="round"/></svg></div>`;
  document.body.appendChild(fx); hand = byId('goalHand'); arrow = byId('goalArrow');
  doneEl = document.createElement('div'); doneEl.id = 'goalDone'; doneEl.hidden = true; document.body.appendChild(doneEl);
  // round dots that always face the camera (Mac: circles, not ovals)
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.beginPath(); x.arc(32, 32, 24, 0, 7); x.fillStyle = '#fffbe6'; x.fill(); x.lineWidth = 7; x.strokeStyle = '#2b2140'; x.stroke();
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
  const mat = new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  for (let i = 0; i < 40; i++) { const s = new T.Sprite(mat); s.scale.setScalar(0.24); s.visible = false; s.renderOrder = 4; A.scene.add(s); dots.push(s); }
  ring = new T.Mesh(new T.RingGeometry(0.5, 0.66, 40), new T.MeshBasicMaterial({ color: 0xffd84d, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.visible = false; ring.renderOrder = 3; A.scene.add(ring);
}

const CSS = `
#goalCard { display: flex; flex-direction: column; align-items: stretch; gap: 4px; width: 178px; padding: 7px 10px; text-align: left; white-space: normal !important; font: inherit; color: #2b2140; cursor: pointer; pointer-events: auto; }
#goalCard[hidden] { display: none; }
#goalCard .gtop { display: flex; align-items: flex-start; gap: 6px; font-size: 15px; line-height: 1.15; } #goalCard .gtop svg { flex: none; }
#goalCard .gmid { display: flex; align-items: center; gap: 7px; } #goalCard .gmid b { font-size: 16px; }
#goalCard .gbar { flex: 1; height: 11px; border-radius: 7px; border: 2px solid #2b2140; background: #efe8d8; box-sizing: border-box; }
#goalCard .gprize { font-size: 12.5px; color: #6b5a8a; display: flex; align-items: center; gap: 4px; } #goalCard .gprize b { color: #2b2140; }
.gcoin { display: inline-block; width: 14px; height: 14px; border-radius: 50%; background: #f4c542; border: 2.5px solid #b8860b; box-sizing: border-box; }
.gcoin.big { width: 24px; height: 24px; border-width: 3px; vertical-align: -3px; margin-right: 6px; }
#goalFx { position: fixed; inset: 0; pointer-events: none; z-index: 60; }
#goalFx > * { position: absolute; left: 0; top: 0; will-change: transform; filter: drop-shadow(0 3px 0 rgba(43,33,64,.3)); }
#goalHand { width: 64px; height: 48px; } #goalArrow { width: 44px; height: 52px; } #goalFx > [hidden] { display: none; }
body.inmenu #goalFx, body.inmenu #goalDone { display: none; }
.goalGlow { box-shadow: 0 0 0 4px #ffd84d, 0 0 16px 8px rgba(255,226,100,.9) !important; animation: goalPulse .8s ease-in-out infinite alternate; }
@keyframes goalPulse { to { box-shadow: 0 0 0 5px #ffd84d, 0 0 24px 12px rgba(255,226,100,.95); } }
#goalDone { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; background: rgba(43,33,64,.25); font-family: inherit; color: #2b2140; }
#goalDone[hidden] { display: none; }
#goalDone .gdcard { width: min(290px, 80vw); background: #fffcf4; border: 3px solid #2b2140; border-radius: 22px; padding: 16px; text-align: center; box-shadow: 0 5px 0 rgba(43,33,64,.3); animation: gdpop .3s cubic-bezier(.3,1.5,.5,1); }
@keyframes gdpop { from { transform: scale(.6); opacity: 0; } }
#goalDone .gdh { font-size: 24px; font-weight: 700; } #goalDone .gdsub { font-size: 13.5px; color: #6b5a8a; }
#goalDone .gdprize { font-size: 26px; font-weight: 700; margin-top: 8px; }
#goalDone .gdnext { margin-top: 12px; padding-top: 10px; border-top: 2px dashed #cdbfe0; } #goalDone .gdnext span { display: block; font-size: 13px; color: #6b5a8a; } #goalDone .gdnext b { font-size: 17px; }
#goalDone .gdok { margin-top: 12px; width: 100%; background: #8fcf63; border: 2.5px solid #2b2140; border-radius: 14px; padding: 9px; font: inherit; font-weight: 700; font-size: 17px; color: #2b2140; cursor: pointer; }
`;
