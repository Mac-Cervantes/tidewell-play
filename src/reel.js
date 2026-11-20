// Tidewell — REEL: the reeling mini-game (try/reel).
// Fake nibbles while you wait, then a short fight after you tap Reel!:
//   red light, green light (v0.1.112): hold (the button, or a thumb anywhere on the water) to wind the fish in while
//   the bar over your head is green; let go when it goes red, or the line snaps.
// The numbers are in data.js (REEL, REEL_RULES). main.js only has small hooks marked REEL.
// newFight / stepFight have no drawing in them, so tools/reel-sim.mjs can run the same rules.
import { REEL, REEL_RULES as RU } from './data.js';

const between = (g, rand) => g[0] + rand() * (g[1] - g[0]);

export function newFight(rarity, perk = 0, rand = Math.random) {
  const R = REEL[rarity] || REEL.common;
  return { R, rand, prog: RU.start, t: 0, slack: 0, strain: 0, ev: null, done: null, snapped: false,
    next: R.gap ? RU.calm + between(R.gap, rand) : Infinity,
    speed: (1 + RU.rodBoost * Math.min(1, perk)) / R.secs };
}
// one step of the fight. hold: is the player winding?
// f.ev is null on green, { kind: 'warn' } on yellow, { kind: 'thrash' } on red. Returns 'warn' | 'thrash' | 'snap' when it just happened.
export function stepFight(f, dt, hold) {
  const R = f.R; let what = null;
  f.t += dt;
  if (f.ev) {
    f.ev.t += dt;
    if (f.ev.t >= f.ev.len) {
      if (f.ev.kind === 'warn') { f.ev = { kind: 'thrash', t: 0, len: Array.isArray(R.thrashLen) ? between(R.thrashLen, f.rand) : R.thrashLen, dir: 1 }; f.strain = 0; what = 'thrash'; }
      else { f.ev = null; f.strain = 0; f.next = f.t + between(R.gap, f.rand); }
    }
  }
  if (!f.ev && f.t >= f.next) { f.ev = { kind: 'warn', t: 0, len: RU.warn, dir: 1 }; what = 'warn'; }
  const red = f.ev && f.ev.kind === 'thrash';
  f.winding = false; f.paying = false;
  if (red) {                                                       // (slack time is paused on red, not reset: a player who never holds must still lose the fish)
    if (hold) { f.slack = 0; f.strain += dt; if (f.strain > RU.grace) { f.done = 'lost'; f.snapped = true; what = 'snap'; } }
    else { f.strain = 0; f.paying = true; f.prog = Math.max(0, f.prog - RU.redSlip * dt); }   // you let it run: a little line goes out
  } else if (hold) {
    f.slack = 0; f.prog += f.speed * dt; f.winding = true;
  } else {
    f.slack += dt; f.paying = true; f.prog = Math.max(0, f.prog - RU.slip * dt);
  }
  if (!f.done) { if (f.slack > RU.slackMax) f.done = 'lost'; else if (f.prog >= 1) f.done = 'won'; }
  return what;
}
// when the fake nibbles come, in seconds after the bobber lands
export function nibbleTimes(rarity, wait, rand = Math.random) {
  const R = REEL[rarity] || REEL.common;
  let n = R.nibbles[0] + Math.floor(rand() * (R.nibbles[1] - R.nibbles[0] + 1));
  const lo = 0.8, hi = wait - RU.nibWin - RU.nibGap;
  n = Math.min(n, Math.floor((hi - lo) / (RU.nibWin + RU.nibGap)) + 1);
  if (hi <= lo || n <= 0) return [];
  const out = []; const slot = (hi - lo) / n;
  for (let i = 0; i < n; i++) out.push(lo + slot * i + rand() * Math.max(0, slot - RU.nibWin - RU.nibGap));
  return out;
}

// ---------- the game side ----------
let A, hud, fx, ring, ringArc, fight = null;
const btn = { down: false, ox: 0, dx: 0, swallow: false };
let tick = 0, splashT = 0;
const RING = 2 * Math.PI * 38;

const CSS = `
#reelHud { position: fixed; z-index: 6; left: 0; right: 0; top: calc(64px + env(safe-area-inset-top)); display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
#reelHearts { display: flex; gap: 4px; background: rgba(255,252,244,.97); border: 2px solid #2b2140; border-radius: 999px; padding: 5px 10px; box-shadow: 0 3px 0 rgba(43,33,64,.35); }
#reelHearts span { display: flex; transition: transform .2s; }
#reelHearts span.gone { opacity: .25; transform: scale(.8); }
#reelCue { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 17px; color: #2b2140; background: rgba(255,252,244,.97); border: 2px solid #2b2140; border-radius: 999px; padding: 6px 14px; box-shadow: 0 3px 0 rgba(43,33,64,.35); }
#reelCue.red { background: #e5484d; color: #fff; }
#reelCue.blue { background: #3ea6e8; color: #fff; }
#reelFx { position: fixed; z-index: 5; left: 0; top: 0; width: 0; height: 0; pointer-events: none; }
#reelFx i { position: absolute; left: -34px; top: -34px; width: 68px; height: 68px; border-radius: 50%; border: 5px solid #e5484d; box-sizing: border-box; animation: reelRed .45s ease-out infinite; }
#reelFx b { position: absolute; top: -20px; font-size: 40px; line-height: 40px; font-weight: 900; color: #fff; text-shadow: 0 2px 0 #2b2140, 0 0 6px #2b2140; animation: reelDart .5s ease-in-out infinite alternate; }
#reelFx b.l { right: 26px; } #reelFx b.r { left: 26px; }
@keyframes reelRed { from { transform: scale(.5); opacity: 1; } to { transform: scale(1.35); opacity: 0; } }
@keyframes reelDart { from { transform: translateX(-4px); } to { transform: translateX(4px); } }
#reelRing { position: absolute; left: -8px; top: -8px; width: 82px; height: 82px; pointer-events: none; transform: rotate(-90deg); }
#useBtn { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }   /* a long hold is not a long-press */
/* v0.1.109 (Mac): while the line is out, the button sits big in the bottom middle, under your character, where a phone keyboard would be, so the thumb has room to slide both ways */
body.lineout #useBtn { position: fixed !important; left: 50%; bottom: calc(112px + env(safe-area-inset-bottom)); margin: 0 0 0 -50px; width: 100px; height: 100px; font-size: 16px; z-index: 6; }
body.lineout .petHeart { display: none !important; }   /* a pet's heart bubble could sit on top of the button */
body.lineout #useBtn svg:not(#reelRing) { width: 34px; height: 34px; }
body.lineout #reelRing { left: -9px; top: -9px; width: 112px; height: 112px; }
/* v0.1.111 (Mac: "the tool bar never faded out of focus"): the toolbar and menu fade and blur for as long as the line is out,
   not only in the fight. They still work while you wait (so you can put the rod away) and are locked during the fight. */
#hotbar, #menuBtn { transition: opacity .25s, filter .25s; }
body.lineout #hotbar, body.lineout #menuBtn { opacity: .38; filter: blur(1.5px); -webkit-filter: blur(1.5px); }
body.fighting #hotbar, body.fighting #menuBtn { opacity: .25; pointer-events: none; }
body.lineout #toolName { display: none !important; }
/* v0.1.112: the catch bar floats over your character's head, where a thumb never covers it */
#reelBar { position: fixed; z-index: 5; left: 0; top: 0; width: 96px; height: 18px; border: 3px solid #2b2140; border-radius: 999px; background: #fffcf4; box-sizing: border-box; overflow: hidden; pointer-events: none; box-shadow: 0 3px 0 rgba(43,33,64,.4); }
#reelBar[hidden] { display: none; }
#reelBar i { display: block; height: 100%; width: 0; background: #57c95a; border-radius: 999px 0 0 999px; transition: background .12s; }
#reelBar.warn { border-color: #b98900; } #reelBar.warn i { background: #ffd23f; }
#reelBar.red { border-color: #b3261e; background: #ffd9d6; animation: reelShake .12s linear infinite; } #reelBar.red i { background: #e5484d; }
@keyframes reelShake { 0% { margin-left: -2px; } 50% { margin-left: 2px; } 100% { margin-left: -2px; } }
body.reelwarn #useBtn { background: #ffd23f !important; color: #2b2140 !important; }
/* v0.1.114 (Mac: "again the button is covered by the thumb"): the light has to show where a thumb can't hide it.
   A wide halo round the button, a coloured glow round the edge of the screen, and "Let go!" over your head. */
#reelHalo { position: fixed; z-index: 5; left: 50%; bottom: calc(112px + env(safe-area-inset-bottom) - 38px); width: 176px; height: 176px; margin-left: -88px; border-radius: 50%; box-sizing: border-box; border: 12px solid #57c95a; background: rgba(87,201,90,.18); pointer-events: none; transition: border-color .1s, background .1s; }
#reelHalo[hidden] { display: none; }
#reelHalo.warn { border-color: #ffd23f; background: rgba(255,210,63,.3); }
#reelHalo.red { border-color: #e5484d; background: rgba(229,72,77,.38); animation: reelPulse .28s ease-in-out infinite alternate; }
@keyframes reelPulse { from { transform: scale(1); } to { transform: scale(1.12); } }
#reelEdge { position: fixed; inset: 0; z-index: 4; pointer-events: none; opacity: 0; transition: opacity .12s; box-shadow: inset 0 0 0 0 transparent; }
#reelEdge.warn { opacity: 1; box-shadow: inset 0 0 46px 10px rgba(255,210,63,.75); }
#reelEdge.red { opacity: 1; box-shadow: inset 0 0 60px 16px rgba(229,72,77,.85); }
#reelSay { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); white-space: nowrap; font-weight: 800; font-size: 20px; color: #fff; background: #e5484d; border: 3px solid #2b2140; border-radius: 999px; padding: 3px 14px; box-shadow: 0 3px 0 rgba(43,33,64,.4); }
/* the signal sits over the catch bar the whole fight (Mac): green Reel, yellow Careful!, red Let go! */
#reelSay { background: #57c95a; color: #2b2140; }
#reelBar.warn #reelSay { background: #ffd23f; color: #2b2140; }
#reelBar.red #reelSay { background: #e5484d; color: #fff; font-size: 23px; }
#reelBar { overflow: visible !important; width: 120px !important; height: 22px !important; }
#reelBar i { border-radius: 999px !important; }
#reelRing { display: none !important; }
`;

export function init(api) {
  A = api;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  hud = document.createElement('div'); hud.id = 'reelHud'; hud.hidden = true;
  hud.innerHTML = '<div id="reelHearts"></div><div id="reelCue" hidden></div>';
  document.body.appendChild(hud);
  fx = document.createElement('div'); fx.id = 'reelFx'; fx.hidden = true; document.body.appendChild(fx);
  bar = document.createElement('div'); bar.id = 'reelBar'; bar.hidden = true; bar.innerHTML = '<i></i><b id="reelSay">Let go!</b>'; document.body.appendChild(bar); barFill = bar.firstChild; say = bar.lastChild;
  halo = document.createElement('div'); halo.id = 'reelHalo'; halo.hidden = true; document.body.appendChild(halo);
  edge = document.createElement('div'); edge.id = 'reelEdge'; document.body.appendChild(edge);
  const b = A.useBtn; b.style.position = 'relative'; b.style.touchAction = 'none';
  b.insertAdjacentHTML('beforeend', '<svg id="reelRing" viewBox="0 0 88 88" style="display:none"><circle cx="44" cy="44" r="38" fill="none" stroke="rgba(43,33,64,.55)" stroke-width="7"/><circle id="reelArc" cx="44" cy="44" r="38" fill="none" stroke="#ffd23f" stroke-width="7" stroke-linecap="round"/></svg>');
  ring = b.querySelector('#reelRing'); ringArc = b.querySelector('#reelArc'); ringArc.style.strokeDasharray = RING;
  // the button: pressing Reel! starts the fight right away, so the same press keeps winding
  b.addEventListener('pointerdown', (e) => {
    btn.swallow = false;
    if (A.fishing.state === 'bite') strike();
    if (A.fishing.state !== 'fight') return;
    btn.down = true; btn.ox = e.clientX; btn.dx = 0;
    try { b.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
  });
  b.addEventListener('pointermove', (e) => { if (btn.down) btn.dx = Math.max(-1, Math.min(1, (e.clientX - btn.ox) / 44)); });
  const up = () => { btn.down = false; btn.dx = 0; if (btn.swallow) setTimeout(() => { btn.swallow = false; }, 350); };   // only the tap that comes with this release is ignored
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  debugRow();
  // the fight ended with the thumb still on the button: letting go must not count as a tap on Cast
  document.addEventListener('click', (e) => { if (btn.swallow && e.target.closest && e.target.closest('#useBtn')) { btn.swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
}

// Debug harbor only: pick how hard the next fish fights, and grab worms, so the fight can be tried without luck.
let force = '';
function debugRow() {
  const after = document.getElementById('fastSeg'); if (!after) return;
  try { force = sessionStorage.getItem('tidewell.reelForce') || ''; } catch (e) { /* fine */ }
  after.insertAdjacentHTML('afterend', '<p class="label">Next fish fights like</p><div class="seg small-seg" id="reelDbg"><button data-r="">Real odds</button><button data-r="uncommon">Uncommon</button><button data-r="rare">Rare</button><button data-r="super">Super</button><button data-r="legendary">Legend</button></div><div class="seg small-seg"><button id="reelWorms">+20 worms</button></div>');
  const btns = document.querySelectorAll('#reelDbg button'), show = () => btns.forEach(b => b.classList.toggle('on', b.dataset.r === force));
  btns.forEach(b => b.addEventListener('click', () => { force = b.dataset.r; try { sessionStorage.setItem('tidewell.reelForce', force); } catch (e) { /* fine */ } show(); }));
  document.getElementById('reelWorms').addEventListener('click', () => { if (!A.debug()) return; A.addItem('worm', 20); A.renderHotbar(); A.commit(); A.toast('+20 worms'); });
  show();
}
// the bobber lands: plan the fake nibbles for the fish that is on its way
export function onLand(F, instant) {
  F.fightAs = force && A.debug() ? force : null;   // same fish, but it fights like the picked rarity
  F.nibs = instant || !F.fish ? [] : nibbleTimes(F.fightAs || F.fish.rarity, F.wait); F.nibT = 0;
}
// the Wait button was tapped: true if it was a nibble (too early: the fish swims off, the bait stays)
export function early() {
  const F = A.fishing;
  if (F.state !== 'wait' || !(F.nibT > 0)) return false;
  F.nibT = 0; A.addItem(F.bait, 1); A.renderHotbar(); A.commit();
  A.toast('Too early! It swam off'); A.audio.play('miss'); A.reelIn();
  return true;
}
// Reel! was tapped on a real bite
export function strike() {
  const F = A.fishing;
  if (F.state !== 'bite') return;
  fight = newFight(F.fightAs || (F.fish ? F.fish.rarity : 'common'), A.perk());
  A.setFish('fight'); A.audio.play('reel');
  btn.down = false; btn.dx = 0; tick = 0; splashT = 0;
  bar.hidden = false; barFill.style.width = '0%'; bar.className = ''; say.textContent = 'Reel'; halo.hidden = false; halo.className = ''; edge.className = ''; A.useBtn.classList.add('reeling');
}
export function on() { return !!fight; }
export function state() { return fight; }
export function use() { return fight && fight.ev && fight.ev.kind === 'thrash' ? { kind: 'fightstop', key: 'fightstop' } : { kind: 'fight', key: 'fight' }; }

function end() {
  if (btn.down) btn.swallow = true;
  fight = null; hud.hidden = true; fx.hidden = true; bar.hidden = true; halo.hidden = true; edge.className = ''; document.body.classList.remove('reelwarn'); if (shade) shade.visible = false; ring.style.display = 'none'; A.useBtn.classList.remove('reeling'); btn.down = false;
}

const side = { x: 1, z: 0 }, tmp = { v: null };
let bar = null, barFill = null, say = null, halo = null, edge = null, wasOut = false, wasFight = false, shade = null, shadeYaw = 0;
// v0.1.109 (Mac: "a black silhouette of a fish, that sells the struggle more than the white arrows"): the dark shape of the
// fish just under the surface where the line meets the water. It pulls away from you, bolts sideways on a dart and
// whips about on a thrash. Bigger for rarer fish.
function fishShade() {
  if (shade) return shade;
  const T = A.THREE, sh = new T.Shape();
  sh.moveTo(0.5, 0); sh.quadraticCurveTo(0.22, 0.25, -0.2, 0.09); sh.lineTo(-0.5, 0.27); sh.lineTo(-0.4, 0); sh.lineTo(-0.5, -0.27); sh.lineTo(-0.2, -0.09); sh.quadraticCurveTo(0.22, -0.25, 0.5, 0);
  const g = new T.ShapeGeometry(sh, 10); g.rotateX(-Math.PI / 2);   // flat on the water, nose along +x
  shade = new T.Mesh(g, new T.MeshBasicMaterial({ color: 0x0a0f2c, transparent: true, opacity: 0.62, depthWrite: false, fog: false }));
  shade.visible = false; shade.renderOrder = 2; A.scene.add(shade); return shade;
}
function drawShade(v, dt) {
  const m = fishShade(), f = fight, ev = f.ev, F = A.fishing, p = A.player.pos, el = A.elapsed();
  let hx = F.land.x - p.x, hz = F.land.z - p.z;                     // by default it pulls straight away from you
  let want = Math.atan2(-hz, hx) + (ev && ev.kind === 'thrash' ? Math.sin(el * 30) * 1.1 : ev ? Math.sin(el * 24) * 0.5 : Math.sin(el * (f.winding ? 15 : 7)) * (f.winding ? 0.32 : 0.18));   // whips on red, shivers on yellow
  let d = want - shadeYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); shadeYaw += d * Math.min(1, dt * 12);
  const k = 0.45 + f.R.secs * 0.105;
  m.position.set(v.x - Math.cos(shadeYaw) * 0.28 * k, A.WATER_Y + 0.08, v.z + Math.sin(shadeYaw) * 0.28 * k);   // a little above the water sheet: its waves rise a few cm and would hide it   // the line runs to its mouth
  m.rotation.y = shadeYaw; m.scale.setScalar(k); m.visible = true;
}

// what the character's body should do in the fight (main.js poses it): how hard it leans back, which way the fish drags it, a shake on red
export function struggle() {
  const f = fight; if (!f) return null;
  const ev = f.ev, u = ev ? Math.min(1, ev.t / 0.18) : 0;
  return { wind: !!f.winding, drag: 0, thrash: ev && ev.kind === 'thrash' ? u : ev ? u * 0.25 : 0, prog: Math.min(1, f.prog) };
}
function pos(out) {   // where the bobber is in the fight: pulled in as the ring fills, dragged sideways by a dart
  const F = A.fishing, p = A.player.pos, f = fight;
  const pull = Math.min(1, f.prog) * 0.3;
  out.set(F.land.x + (p.x - F.land.x) * pull, A.WATER_Y + 0.03, F.land.z + (p.z - F.land.z) * pull);
  const ev = f.ev;
  if (ev && ev.kind === 'dart') {
    const u = Math.min(1, ev.t / 0.25) * Math.min(1, (ev.len - ev.t) / 0.25);
    out.x += side.x * ev.dir * 0.6 * u; out.z += side.z * ev.dir * 0.6 * u;
  }
  const el = A.elapsed();
  out.y += Math.sin(el * 9) * 0.025 - 0.05;
  if (ev && ev.kind === 'thrash') { out.x += Math.sin(el * 43) * 0.06; out.z += Math.cos(el * 37) * 0.06; out.y += Math.sin(el * 31) * 0.04; }
  return true;
}
export function bobber(out) { return fight ? pos(out) : false; }
export function rodAngle() { return 0.32 + (fight && fight.winding ? Math.sin(A.elapsed() * 22) * 0.05 : 0) - (fight && fight.ev ? 0.1 : 0); }
export function nibbleDip(F) { return F.nibT > 0 ? Math.abs(Math.sin((RU.nibWin - F.nibT) * 13)) * 0.04 : 0; }

export function update(dt) {
  const F = A.fishing;
  const out = F.state === 'wait' || F.state === 'bite' || F.state === 'fight';
  if (out !== wasOut) { wasOut = out; document.body.classList.toggle('lineout', out); }
  const fg = F.state === 'fight' && !!fight;
  if (fg !== wasFight) { wasFight = fg; document.body.classList.toggle('fighting', fg); }
  if (F.state === 'wait' && F.nibs && F.nibs.length && F.t >= F.nibs[0]) { F.nibs.shift(); F.nibT = RU.nibWin; A.audio.play('nibble'); }
  else if (F.nibT > 0) F.nibT -= dt;
  if (!fight) return;
  if (F.state !== 'fight') { end(); return; }   // the rod was put away mid-fight
  A.player.walkTo = null;
  const hold = btn.down || A.joy.id !== null;
  const m = A.camera.matrixWorld.elements, L = Math.hypot(m[0], m[2]) || 1; side.x = m[0] / L; side.z = m[2] / L;
  const what = stepFight(fight, dt, hold);
  const ev = fight.ev, red = !!ev && ev.kind === 'thrash', warn = !!ev && ev.kind === 'warn';
  if (what === 'thrash') { A.audio.play('thrash'); if (navigator.vibrate) try { navigator.vibrate(30); } catch (e) { /* not supported */ } }
  // sounds: a rising zip while you wind, the line running out when you let go, a snap if you hold on red too long
  tick -= dt;
  if (fight.winding && tick <= 0) { tick = 0.075; A.audio.play('reelzip', Math.min(1, fight.prog)); }
  else if (fight.paying && tick <= 0) { tick = 0.13; A.audio.play('unravel'); }
  const v = tmp.v || (tmp.v = new A.THREE.Vector3()); pos(v);
  if (red) { splashT -= dt; if (splashT <= 0) { splashT = 0.28; A.addSplash(v.x, v.z); } }
  drawShade(v, dt);
  // the bar over your head: green while it's safe to wind, yellow just before a thrash, red while the fish thrashes
  const hp = tmp.h || (tmp.h = new A.THREE.Vector3()); hp.set(A.player.pos.x, A.player.pos.y + 2.25, A.player.pos.z).project(A.camera);
  bar.style.transform = `translate(${Math.round((hp.x + 1) / 2 * innerWidth)}px,${Math.round((1 - hp.y) / 2 * innerHeight)}px) translate(-50%,-100%)`;
  barFill.style.width = Math.round(Math.min(1, fight.prog) * 100) + '%';
  const cls = red ? 'red' : warn ? 'warn' : ''; if (bar.className !== cls) { bar.className = cls; halo.className = cls; edge.className = cls; say.textContent = red ? 'Let go!' : warn ? 'Careful!' : 'Reel'; document.body.classList.toggle('reelwarn', warn); }
  fx.hidden = !red;
  if (red) {
    v.project(A.camera);
    const clamp = (n, hi) => Math.max(56, Math.min(hi - 56, n));
    fx.style.transform = `translate(${clamp((v.x + 1) / 2 * innerWidth, innerWidth)}px,${clamp((1 - v.y) / 2 * innerHeight, innerHeight)}px)`;
    if (fx.dataset.k !== 't') { fx.dataset.k = 't'; fx.innerHTML = '<i></i>'; }
  }
  if (fight.done === 'won') { end(); A.landFish(); }
  else if (fight.done === 'lost') { const snap = fight.snapped; end(); A.toast(snap ? 'Snap! Let go on red' : 'It got away!'); A.audio.play(snap ? 'snap' : 'miss'); A.setFish('reel'); }
}
