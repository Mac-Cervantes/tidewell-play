// Tidewell — REEL: the reeling mini-game (try/reel).
// Fake nibbles while you wait, then a short fight after you tap Reel!:
//   a tension meter (v0.1.124): hold (the button, or a thumb anywhere on the water) to wind the fish in; it comes closer
//   as you do. The meter beside you shows how tight the line is. Ease off in the yellow; a second in the red snaps it.
// The numbers are in data.js (REEL, REEL_RULES). main.js only has small hooks marked REEL.
// newFight / stepFight have no drawing in them, so tools/reel-sim.mjs can run the same rules.
import { REEL, REEL_RULES as RU } from './data.js';

const between = (g, rand) => g[0] + rand() * (g[1] - g[0]);

export function newFight(rarity, perk = 0, rand = Math.random) {
  const R = REEL[rarity] || REEL.common;
  return { R, rand, prog: RU.start, t: 0, ten: 0, slack: 0, strain: 0, ev: null, done: null, snapped: false, wob: rand() * 6,
    next: R.gap ? RU.calm + between(R.gap, rand) : Infinity,
    speed: (1 + RU.rodBoost * Math.min(1, perk)) / R.secs };
}
// which part of the meter the tension is in: 'green' | 'yellow' | 'red'
export const zone = (ten) => ten >= RU.red ? 'red' : ten >= RU.yellow ? 'yellow' : 'green';
// one step of the fight. hold: is the player winding?
// Tension meter (Mac, v0.1.124): holding winds the fish closer and pulls the line tight; letting go loosens it. Now and
// then the fish pulls (f.ev = { kind: 'pull' }) and the tension shoots up. Stay in red too long and the line snaps.
// Too much slack is forgiving: the fish only slips back a little, and gets away after a long time with no reeling.
// Returns 'pull' when a pull just started, 'snap' when the line just snapped.
export function stepFight(f, dt, hold) {
  const R = f.R; let what = null;
  f.t += dt;
  if (f.ev) { f.ev.t += dt; if (f.ev.t >= f.ev.len) { f.ev = null; f.next = f.t + between(R.gap, f.rand); } }
  if (!f.ev && f.t >= f.next) { f.ev = { kind: 'pull', t: 0, len: between(R.pullLen, f.rand), str: between(R.pull, f.rand) }; what = 'pull'; }
  const pull = f.ev ? f.ev.str * Math.min(1, f.ev.t / RU.pullRamp) * Math.min(1, (f.ev.len - f.ev.t) / RU.pullRamp + 0.3) : 0;
  const want = hold ? RU.hold + pull + Math.sin(f.t * 5 + f.wob) * 0.03 : pull * RU.loosePull;
  f.ten = Math.max(0, Math.min(1, f.ten + (want - f.ten) * Math.min(1, (want > f.ten ? RU.rise : RU.fall) * dt)));
  f.strain = f.ten >= RU.red ? f.strain + dt : 0;
  f.winding = !!hold; f.paying = !hold;
  if (hold) { f.slack = 0; f.prog += f.speed * dt; }
  else { f.slack += dt; f.prog = Math.max(0, f.prog - (f.ev ? RU.runSlip : RU.slip) * dt); }
  if (f.strain > RU.snap) { f.done = 'lost'; f.snapped = true; what = 'snap'; }
  else if (f.slack > RU.slackMax) f.done = 'lost';
  else if (f.prog >= 1) f.done = 'won';
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
/* v0.1.120 (a tester's phone): crate bubbles on the dock sat on top of the fishing button. While the line is out the
   button's layer goes above every bubble, and the dock's crate bubbles hide. */
body.lineout #actions { z-index: 8; }
body.lineout #cargoBubbles, body.lineout #cargoPay, body.lineout #cargoNext { display: none !important; }
body.lineout #useBtn svg:not(#reelRing) { width: 34px; height: 34px; }
body.lineout #reelRing { left: -9px; top: -9px; width: 112px; height: 112px; }
/* v0.1.111 (Mac: "the tool bar never faded out of focus"): the toolbar and menu fade and blur for as long as the line is out,
   not only in the fight. They still work while you wait (so you can put the rod away) and are locked during the fight. */
#hotbar, #menuBtn { transition: opacity .25s, filter .25s; }
body.lineout #hotbar, body.lineout #menuBtn { opacity: .38; filter: blur(1.5px); -webkit-filter: blur(1.5px); }
body.fighting #hotbar, body.fighting #menuBtn { opacity: .25; pointer-events: none; }
body.lineout #toolName { display: none !important; }
#reelEdge { position: fixed; inset: 0; z-index: 4; pointer-events: none; opacity: 0; transition: opacity .12s; box-shadow: inset 0 0 0 0 transparent; }
#reelEdge.warn { opacity: 1; box-shadow: inset 0 0 46px 10px rgba(255,210,63,.75); }
#reelEdge.red { opacity: 1; box-shadow: inset 0 0 60px 16px rgba(229,72,77,.85); }
#reelRing { display: none !important; }
/* v0.1.124 (Mac): the tension meter. A rectangle beside you, from your head down past your feet (lower when you fish out
   to sea, behind you when you fish to the side). Bright below the line, faded above. Sweat flies off your head in the
   yellow (2 drops) and the red (4). */
#reelMeter { position: fixed; z-index: 5; left: 0; top: 0; width: 20px; border: 3px solid #2b2140; border-radius: 4px; overflow: hidden; background: #fff; box-shadow: 0 3px 0 rgba(43,33,64,.4); pointer-events: none; box-sizing: content-box; }
#reelMeter[hidden] { display: none; }
#reelMeter .z { position: absolute; left: 0; bottom: 0; width: 100%; height: 100%; display: flex; flex-direction: column-reverse; }
#reelMeter .z i { display: block; }
#reelMeter .z i:nth-child(1) { background: #57c95a; } #reelMeter .z i:nth-child(2) { background: #ffd23f; } #reelMeter .z i:nth-child(3) { background: #e5484d; }
#reelMeter .dim { position: absolute; inset: 0; opacity: .3; filter: saturate(.5); }
#reelMeter .lit { position: absolute; left: 0; bottom: 0; width: 100%; overflow: hidden; }
#reelMeter .lit .z { filter: brightness(1.08) saturate(1.2); }
#reelMeter b { position: absolute; left: 0; right: 0; height: 2px; margin-bottom: -1px; background: #2b2140; }
#reelMeter.red { animation: reelShake .12s linear infinite; }
@keyframes reelShake { 0% { margin-left: -2px; } 50% { margin-left: 2px; } 100% { margin-left: -2px; } }
#reelSweat { position: fixed; z-index: 5; left: 0; top: 0; width: 0; height: 0; pointer-events: none; }
#reelSweat span { position: absolute; left: 0; top: 0; line-height: 0; animation: reelDrop .6s ease-out infinite; opacity: 0; }
#reelSweat span svg { display: block; }
@keyframes reelDrop { 0% { opacity: 0; transform: translate(var(--x0), var(--y0)) rotate(var(--r)) scale(.6); } 15% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--x1), var(--y1)) rotate(var(--r)) scale(1); } }
`;

export function init(api) {
  A = api;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  hud = document.createElement('div'); hud.id = 'reelHud'; hud.hidden = true;
  hud.innerHTML = '<div id="reelHearts"></div><div id="reelCue" hidden></div>';
  document.body.appendChild(hud);
  fx = document.createElement('div'); fx.id = 'reelFx'; fx.hidden = true; document.body.appendChild(fx);
  edge = document.createElement('div'); edge.id = 'reelEdge'; document.body.appendChild(edge);
  const Z = `<div class="z"><i style="flex:${RU.yellow}"></i><i style="flex:${RU.red - RU.yellow}"></i><i style="flex:${1 - RU.red}"></i></div>`;
  meter = document.createElement('div'); meter.id = 'reelMeter'; meter.hidden = true;
  meter.innerHTML = `<div class="dim">${Z}</div><div class="lit">${Z}</div><b></b>`; document.body.appendChild(meter);
  meterLit = meter.querySelector('.lit'); meterLine = meter.querySelector('b'); meterZ = meter.querySelectorAll('.z');
  sweat = document.createElement('div'); sweat.id = 'reelSweat'; sweat.hidden = true; document.body.appendChild(sweat);
  const drop = '<svg width="13" height="18" viewBox="0 0 20 27"><path d="M10 1C10 1 2 12 2 17.5A8 8 0 0 0 18 17.5C18 12 10 1 10 1Z" fill="#7fd0ff" stroke="#2b2140" stroke-width="2.4"/><ellipse cx="7" cy="17" rx="2" ry="3.2" fill="#fff" opacity=".85"/></svg>';
  // four drops: the first two show in the yellow, all four in the red. Each flies out from the head and falls.
  sweat.innerHTML = [[1, 0, -35, 0], [-1, 0.3, 35, 0.15], [1, 0.15, -20, 0.3], [-1, 0.45, 20, 0.45]].map(([sx, dl, r, y]) =>
    `<span style="--x0:${sx * 10}px;--y0:${-4 + y * 10}px;--x1:${sx * 26}px;--y1:${12 + y * 14}px;--r:${r}deg;animation-delay:${dl}s">${drop}</span>`).join('');
  const b = A.useBtn; b.style.position = 'relative'; b.style.touchAction = 'none';
  b.insertAdjacentHTML('beforeend', '<svg id="reelRing" viewBox="0 0 88 88" style="display:none"><circle cx="44" cy="44" r="38" fill="none" stroke="rgba(43,33,64,.55)" stroke-width="7"/><circle id="reelArc" cx="44" cy="44" r="38" fill="none" stroke="#ffd23f" stroke-width="7" stroke-linecap="round"/></svg>');
  ring = b.querySelector('#reelRing'); ringArc = b.querySelector('#reelArc'); ringArc.style.strokeDasharray = RING;
  // the button: pressing Reel! starts the fight right away, so the same press keeps winding
  b.addEventListener('pointerdown', (e) => {
    btn.swallow = false;
    if (A.fishing.state === 'bite') strike();
    if (A.fishing.state !== 'fight') return;
    btn.down = true; btn.ox = e.clientX; btn.dx = 0;
    haptic(15);   // v0.1.125 (Mac): a little buzz on every press of Reel
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

// A short buzz. Android: navigator.vibrate. iPhone Safari has no vibrate; since iOS 18 a tap on a switch's label gives a
// light tick, so a hidden one is clicked instead. Both only work inside a touch, so this is called from pointerdown.
let tapSw = null;
function haptic(ms) {
  if (navigator.vibrate) { try { if (navigator.vibrate(ms)) return; } catch (e) { /* not supported */ } }
  if (!tapSw) {
    tapSw = document.createElement('label'); tapSw.setAttribute('aria-hidden', 'true');
    tapSw.style.cssText = 'position:fixed;left:-99px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    tapSw.innerHTML = '<input type="checkbox" switch tabindex="-1">'; document.body.appendChild(tapSw);
  }
  try { tapSw.click(); } catch (e) { /* fine */ }
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
  meter.hidden = false; meter.className = ''; sweat.hidden = true; sweatN = -1; edge.className = ''; A.useBtn.classList.add('reeling');
}
export function on() { return !!fight; }
export function state() { return fight; }
export function use() { return { kind: 'fight', key: 'fight' }; }

function end() {
  if (btn.down) btn.swallow = true;
  fight = null; hud.hidden = true; fx.hidden = true; meter.hidden = true; sweat.hidden = true; edge.className = ''; document.body.classList.remove('reelwarn'); if (shade) shade.visible = false; ring.style.display = 'none'; A.useBtn.classList.remove('reeling'); btn.down = false;
}

const side = { x: 1, z: 0 }, tmp = { v: null };
let meter = null, meterLit = null, meterLine = null, meterZ = null, sweat = null, sweatN = -1, meterH = 0;
let edge = null, wasOut = false, wasFight = false, shade = null, shadeYaw = 0;
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
  let want = Math.atan2(-hz, hx) + (ev ? Math.sin(el * 30) * (0.5 + 0.6 * Math.min(1, ev.t / RU.pullRamp)) : Math.sin(el * (f.winding ? 15 : 7)) * (f.winding ? 0.32 : 0.18));   // whips while it pulls
  let d = want - shadeYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); shadeYaw += d * Math.min(1, dt * 12);
  const k = 0.45 + f.R.secs * 0.105;
  m.position.set(v.x - Math.cos(shadeYaw) * 0.28 * k, A.WATER_Y + 0.08, v.z + Math.sin(shadeYaw) * 0.28 * k);   // a little above the water sheet: its waves rise a few cm and would hide it   // the line runs to its mouth
  m.rotation.y = shadeYaw; m.scale.setScalar(k); m.visible = true;
}

// what the character's body should do in the fight (main.js poses it): how hard it leans back, which way the fish drags it, a shake on red
export function struggle() {
  const f = fight; if (!f) return null;
  const tight = Math.max(0, Math.min(1, (f.ten - RU.hold) / (RU.red - RU.hold + 0.1)));   // yanked forward and shaken as the line goes tight
  return { wind: !!f.winding, drag: 0, thrash: tight, prog: Math.min(1, f.prog) };
}
function pos(out) {   // where the bobber is in the fight: pulled in as the ring fills, dragged sideways by a dart
  const F = A.fishing, p = A.player.pos, f = fight;
  const pull = Math.min(1, f.prog) * RU.closer;   // v0.1.124 (Mac): the fish comes right up to you as you reel it in
  out.set(F.land.x + (p.x - F.land.x) * pull, A.WATER_Y + 0.03, F.land.z + (p.z - F.land.z) * pull);
  const ev = f.ev;
  if (ev && ev.kind === 'dart') {
    const u = Math.min(1, ev.t / 0.25) * Math.min(1, (ev.len - ev.t) / 0.25);
    out.x += side.x * ev.dir * 0.6 * u; out.z += side.z * ev.dir * 0.6 * u;
  }
  const el = A.elapsed();
  out.y += Math.sin(el * 9) * 0.025 - 0.05;
  if (ev) { out.x += Math.sin(el * 43) * 0.06; out.z += Math.cos(el * 37) * 0.06; out.y += Math.sin(el * 31) * 0.04; }
  return true;
}
export function bobber(out) { return fight ? pos(out) : false; }
export function rodAngle() { return 0.32 + (fight && fight.winding ? Math.sin(A.elapsed() * 22) * 0.05 : 0) - (fight ? Math.max(0, fight.ten - RU.hold) * 0.3 : 0); }
export function nibbleDip(F) { return F.nibT > 0 ? Math.abs(Math.sin((RU.nibWin - F.nibT) * 13)) * 0.04 : 0; }

// the meter beside you, and the sweat on your head
const scr = (x, y, z, o) => { o.set(x, y, z).project(A.camera); return [(o.x + 1) / 2 * innerWidth, (1 - o.y) / 2 * innerHeight]; };
function placeMeter(z) {
  const p = A.player.pos, o = tmp.o || (tmp.o = new A.THREE.Vector3()), S = A.player.H || 1, yaw = A.player.yaw;
  const [fx, fy] = scr(p.x, p.y, p.z, o), [, ty] = scr(p.x, p.y + 1.12 * S, p.z, o), [hx, hy] = scr(p.x, p.y + 0.95 * S, p.z, o);
  const [bx] = scr(p.x - Math.sin(yaw) * 0.6, p.y + 0.5 * S, p.z - Math.cos(yaw) * 0.6, o), [cx] = scr(p.x, p.y + 0.5 * S, p.z, o);
  const sideways = Math.abs(bx - cx) > 8, side = sideways ? Math.sign(bx - cx) : 1;   // behind you when you fish to the side, else on your right
  const H0 = Math.max(30, fy - ty), H = Math.round(H0 * 1.7), top = ty + (sideways ? 0 : H0 * 0.45);   // lower when you fish out to sea
  if (H !== meterH) { meterH = H; meter.style.height = H + 'px'; meterZ.forEach(e => { e.style.height = H + 'px'; }); }
  meter.style.transform = `translate(${Math.round(fx + side * 40 - 13)}px,${Math.round(top)}px)`;
  const pc = (Math.min(1, fight.ten) * 100).toFixed(1) + '%';
  meterLit.style.height = pc; meterLine.style.bottom = pc;
  const cls = z === 'red' ? 'red' : ''; if (meter.className !== cls) meter.className = cls;
  const n = z === 'red' ? 4 : z === 'yellow' ? 2 : 0;
  if (n !== sweatN) { sweatN = n; sweat.hidden = !n; sweat.querySelectorAll('span').forEach((e, i) => { e.style.display = i < n ? '' : 'none'; }); }
  if (n) sweat.style.transform = `translate(${Math.round(hx)}px,${Math.round(hy)}px)`;
}
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
  const z = zone(fight.ten);
  if (what === 'pull') { A.audio.play('thrash'); if (navigator.vibrate) try { navigator.vibrate(30); } catch (e) { /* not supported */ } }
  // sounds: a rising zip while you wind, the line running out when you let go, a snap if you stay in the red too long
  tick -= dt;
  if (fight.winding && tick <= 0) { tick = 0.075; A.audio.play('reelzip', Math.min(1, fight.prog)); }
  else if (fight.paying && tick <= 0) { tick = 0.13; A.audio.play('unravel'); }
  const v = tmp.v || (tmp.v = new A.THREE.Vector3()); pos(v);
  if (fight.ev) { splashT -= dt; if (splashT <= 0) { splashT = 0.28; A.addSplash(v.x, v.z); } }
  drawShade(v, dt);
  placeMeter(z);
  if (fight.done === 'won') { end(); A.landFish(); }
  else if (fight.done === 'lost') { const snap = fight.snapped; end(); A.toast(snap ? 'Snap! Too tight' : 'It got away!'); A.audio.play(snap ? 'snap' : 'miss'); A.setFish('reel'); }
}
