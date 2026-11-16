// The walk-in general store (try/store; decisions 5, 25, 48, 49).
// This file is the OUTSIDE: the building on the land, its door, the sign that stands there before it
// opens, and the fade in and out. The INSIDE (room, keeper, shelves, buying) is src/interior.js, which
// loads quietly in the background the same way fish and crops do (decision 57).
// main.js only calls init(), frame(), block(), isOpen() and preload(); look for "STORE" there.
import { STORE } from './data.js';

let A = null;                       // what main.js lends us (see init)
let THREE = null;
const AT = { x: -6.6, z: -0.7 };    // middle of the building; the door faces the camera (+z)
let T = 2.2;                        // one Kenney wall tile in meters
const DOOR = { x: 0, z: 0 };        // set in init: middle of the doorway, on the front wall
const HALF = 2.4;                   // half the building's width, with a little room for the player's body

let building = null, door = null, doorAng = 0, doorGoal = 0, pop = 1;
let plot = null, bubble = null, fade = null;
let state = 'out', t = 0;           // out | entering | in | leaving
let push = 0, leaning = false;      // how long the player has leaned on the door (seconds)
let inner = null, innerJob = null;  // the interior module, once loaded
let wasOpen = null;

export const isOpen = () => !!A && A.S.level >= STORE.level;
export const inside = () => state === 'in' || state === 'leaving';

export function init(api) {
  A = api; THREE = api.THREE; T = api.SCALE.town; _vec = new THREE.Vector3();
  DOOR.x = AT.x + T / 2; DOOR.z = AT.z + T;
  A.NO_TILL.push([AT.x, AT.z + 0.2, 3.5]);                 // no tilling or decor on the shop's ground
  // icons the store adds (the decor tray and bag draw decor by these names)
  Object.assign(A.ICON, {
    bag: '<path d="M5 9h14l-1.2 11H6.2z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/>',
    banner: '<path d="M6 3v18"/><path d="M6 5h11v10l-5.5-3L6 15"/>',
    chest: '<path d="M4 11a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8H4z"/><path d="M4 12h16"/><path d="M12 11v3"/>',
    cart: '<path d="M3 7h13l-1.5 8h-10z"/><circle cx="8" cy="18" r="2"/><path d="M16 7l2-3h3"/>',
    fountain: '<path d="M4 16h16l-1.5 4h-13z"/><path d="M12 16V8"/><path d="M12 8c-2-3-5-2-5 1"/><path d="M12 8c2-3 5-2 5 1"/>',
  });
  const st = document.createElement('style');
  st.textContent = `
#storeFade { position: fixed; inset: 0; z-index: 30; background: #fff3dc; opacity: 0; pointer-events: none; transition: opacity .25s ease; }
#storeFade.on { opacity: 1; pointer-events: auto; }
#storeSoon { position: fixed; z-index: 6; transform: translate(-50%, -100%); pointer-events: none; }
#storeSoon .sb { display: flex; align-items: center; gap: 8px; background: #fffdf5; border: 3px solid #2b2140; border-radius: 22px; padding: 8px 14px; box-shadow: 0 5px 0 rgba(43,33,64,.25); animation: storeBob 1.6s ease-in-out infinite; }
#storeSoon .lv { position: relative; display: inline-flex; width: 44px; height: 44px; border-radius: 50%; background: #fffdf5; border: 4px solid #7cc957; box-shadow: 0 0 0 2px #2b2140; align-items: center; justify-content: center; font-weight: 700; font-size: 24px; box-sizing: border-box; color: #2b2140; }
#storeSoon .lk { position: absolute; right: -10px; bottom: -6px; width: 22px; height: 22px; border-radius: 50%; background: #e2574c; border: 2px solid #2b2140; display: flex; align-items: center; justify-content: center; }
@keyframes storeBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
body.in-store #hotbar, body.in-store #menuBtn, body.in-store #cropTags, body.in-store #cargoBubbles, body.in-store #cargoPay, body.in-store #saleBubble,
body.in-store #hint, body.in-store #toolName, body.in-store #grade, body.in-store #orderTrack, body.in-store #seasonTxt, body.in-store #ver, body.in-store #storeSoon { display: none !important; }`;
  document.head.appendChild(st);
  fade = document.createElement('div'); fade.id = 'storeFade'; fade.setAttribute('aria-hidden', 'true'); document.body.appendChild(fade);
  bubble = document.createElement('div'); bubble.id = 'storeSoon'; bubble.hidden = true; bubble.setAttribute('aria-hidden', 'true');
  bubble.innerHTML = `<div class="sb">${A.svg('bag', '#2b2140', 34, 2.4)}<span class="lv">${STORE.level}<span class="lk">${A.svg('lock', '#fff', 12, 3)}</span></span></div>`;
  document.body.appendChild(bubble);
  sync(true);
}

// the inside loads in the background after the first screen is up (and again here if someone reaches the door first)
export function preload() {
  if (!A) return Promise.resolve();
  return innerJob || (innerJob = import('./interior.js').then(m => { inner = m.create(A, { STORE }); }).catch(err => { innerJob = null; console.error(err); }));
}

// ---------- the building (Kenney Fantasy Town Kit, already in the town pack) ----------
function piece(g, kit, name, x, y, z, r = 0, s = 1) {
  const o = A.M[kit][name].scene.clone(true);
  o.scale.setScalar(A.SCALE[kit] * s); o.position.set(x, y, z); o.rotation.y = r;
  o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  g.add(o); return o;
}
function box(g, w, h, d, color, x, y, z, o = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
  m.position.set(x, y, z); m.castShadow = !o.flat; m.receiveShadow = true; g.add(m); return m;
}
// the roof's teal comes from Kenney's color texture; a red copy of that texture gives the shop its own roof
let redRoof = null;
function paintRoof(g) {
  g.traverse(m => {
    if (!m.isMesh || !/^roof/.test(m.name) || !m.material.map) return;
    if (!redRoof) {
      const src = m.material.map, im = src.image, c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height), a = d.data, col = new THREE.Color(), h = {};
      for (let i = 0; i < a.length; i += 4) {
        col.setRGB(a[i] / 255, a[i + 1] / 255, a[i + 2] / 255); col.getHSL(h);
        if (h.h > 0.38 && h.h < 0.58 && h.s > 0.15) { col.setHSL(0.01, Math.min(1, h.s * 1.1), Math.min(1, h.l * 1.05)); a[i] = col.r * 255; a[i + 1] = col.g * 255; a[i + 2] = col.b * 255; }
      }
      x.putImageData(d, 0, 0);
      const tex = new THREE.CanvasTexture(c); tex.flipY = src.flipY; tex.colorSpace = src.colorSpace; tex.magFilter = src.magFilter; tex.minFilter = src.minFilter; tex.generateMipmaps = src.generateMipmaps;
      redRoof = m.material.clone(); redRoof.map = tex;
    }
    m.material = redRoof;
  });
}
function signBoard(g, x, y, z, w) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const k = c.getContext('2d');
  k.fillStyle = '#fff6df'; k.beginPath(); k.roundRect(8, 8, 240, 240, 40); k.fill(); k.lineWidth = 14; k.strokeStyle = '#7a4a2a'; k.stroke();
  // a shopping bag, drawn (no emoji)
  k.lineWidth = 16; k.lineCap = 'round'; k.lineJoin = 'round'; k.strokeStyle = '#2b2140'; k.fillStyle = '#ff9f6b';
  k.beginPath(); k.moveTo(66, 108); k.lineTo(190, 108); k.lineTo(178, 204); k.lineTo(78, 204); k.closePath(); k.fill(); k.stroke();
  k.beginPath(); k.moveTo(100, 108); k.lineTo(100, 88); k.arc(128, 88, 28, Math.PI, 0); k.lineTo(156, 108); k.stroke();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w), new THREE.MeshBasicMaterial({ map: tex, transparent: true })); m.position.set(x, y, z); g.add(m);
  box(g, w + 0.08, w + 0.08, 0.06, 0x7a4a2a, x, y, z - 0.04);
}
function build() {
  const g = new THREE.Group(), fz = T, x0 = -T / 2;
  const front = ['wall-wood-window-shutters', 'wall-wood-door'];
  for (let i = 0; i < 2; i++) {
    const x = x0 + i * T;
    const f = piece(g, 'town', front[i], x, 0, fz - T / 2, -Math.PI / 2);
    if (i === 1) door = f.getObjectByName('door');
    piece(g, 'town', 'wall-wood', x, 0, -fz + T / 2, Math.PI / 2);
    for (let j = 0; j < 2; j++) piece(g, 'town', 'roof-gable', x, T, -fz + T / 2 + j * T, Math.PI / 2);   // gable toward the camera
  }
  for (let j = 0; j < 2; j++) { const z = -fz + T / 2 + j * T; piece(g, 'town', 'wall-wood', x0 + T, 0, z, 0); piece(g, 'town', 'wall-wood', x0, 0, z, Math.PI); }
  paintRoof(g);
  box(g, 2 * T - 0.2, 0.06, 2 * T - 0.2, 0x8a6a4a, 0, 0.03, 0, { flat: true });       // floor seen through the doorway
  box(g, 0.9, 1.5, 0.04, 0x3a2a22, T / 2, 0.75, fz - 0.3, { flat: true });             // dark behind the door when it swings
  box(g, 1.3, 0.04, 0.8, 0xc8443a, T / 2, 0.03, fz + 0.5, { flat: true });             // doormat
  signBoard(g, 0, 2.95, fz + 0.12, 1.05);
  for (const sx of [T / 2 - 0.95, T / 2 + 0.95]) piece(g, 'town', 'lantern', sx, 0, fz + 0.45, 0, 0.5);
  piece(g, 'pirate', 'crate-bottles', -1.6, 0, fz + 0.5, 0.2, 0.65); piece(g, 'pirate', 'barrel', -0.7, 0, fz + 0.45, 0, 0.55);
  const lamp = new THREE.PointLight(0xffc56b, 0, 7, 1.6); lamp.position.set(T / 2, 2.0, fz + 0.8); g.add(lamp); A.lanternLights.push(lamp);   // lit at night with the other lanterns
  g.position.set(AT.x, A.groundY(AT.x, AT.z), AT.z);
  A.scene.add(g);
  return g;
}
// before it opens: a marked-out plot with a sign, so players see the shop coming (Mac)
function buildPlot() {
  const g = new THREE.Group();
  box(g, 2 * T, 0.05, 2 * T, 0xd9bf8a, 0, 0.02, 0, { flat: true });
  for (const [x, z] of [[-T, -T], [T, -T], [-T, T], [T, T]]) box(g, 0.14, 0.5, 0.14, 0x7a4a2a, x, 0.25, z);
  box(g, 0.12, 1.3, 0.12, 0x7a4a2a, T / 2, 0.65, T + 0.3); signBoard(g, T / 2, 1.45, T + 0.38, 0.8);
  g.position.set(AT.x, A.groundY(AT.x, AT.z), AT.z);
  A.scene.add(g);
  return g;
}
function sync(first) {
  const open = isOpen();
  if (open === wasOpen) return;
  wasOpen = open;
  if (open) {
    if (plot) { A.scene.remove(plot); plot = null; }
    if (!building) building = build();
    bubble.hidden = true;
    if (!first) { pop = 0; A.audio.play('popOpen'); A.toast(`${STORE.name} is open!`); }
  } else {
    if (building) { A.scene.remove(building); building = null; door = null; }
    if (!plot) plot = buildPlot();
  }
}

// ---------- walking: the building is solid; leaning on the door for a moment walks you in ----------
function hit(x, z) { const dx = x - AT.x, dz = z - AT.z; return Math.abs(dx) < HALF && dz < T + 0.25 && dz > -T - 1.2; }
export function block(np, pos) {
  if (!A || !building || state !== 'out' || !hit(np.x, np.z)) return;
  if (Math.abs(pos.x - DOOR.x) < 0.5 && np.z < pos.z && !A.busy()) leaning = true;
  if (!hit(np.x, pos.z)) np.z = pos.z; else if (!hit(pos.x, np.z)) np.x = pos.x; else { np.x = pos.x; np.z = pos.z; }
}

// ---------- every frame. Returns true while you're inside (the store draws the frame itself). ----------
let _vec = null;
export function frame(dt) {
  if (!A) return false;
  if (state === 'in') {
    if (inner.frame(dt) === 'leave') { state = 'leaving'; t = 0; fade.classList.add('on'); A.setUse(null); }
    return true;
  }
  if (state === 'leaving') {
    t += dt; inner.frame(dt, true);
    if (t > 0.28) {
      inner.exit(); document.body.classList.remove('in-store');
      A.player.pos.set(DOOR.x, 0, DOOR.z + 0.85); A.player.yaw = 0; A.player.faceYaw = null;   // one step in front of the door, facing the camera
      A.snapCamera();
      state = 'out'; push = 0; doorAng = -1.9; doorGoal = 0; fade.classList.remove('on');
      return false;
    }
    return true;
  }
  sync(false);
  if (pop < 1 && building) { pop = Math.min(1, pop + dt / 0.45); const e = 1 + 0.25 * Math.sin(pop * Math.PI) * (1 - pop) * 3; building.scale.set(1, 0.6 + 0.4 * pop, 1).multiplyScalar(pop < 1 ? e : 1); }
  if (door) { doorAng += (doorGoal - doorAng) * Math.min(1, dt * 9); door.rotation.y = doorAng; }
  if (state === 'out') {
    push = leaning ? push + dt : 0; leaning = false;
    if (building && push > 0.25) { state = 'entering'; t = 0; push = 0; doorGoal = -1.9; A.dlg.open = true; A.audio.play('popOpen'); preload(); }
    // the sign's bubble while the shop isn't open yet
    if (plot) {
      const near = Math.hypot(A.player.pos.x - AT.x, A.player.pos.z - (AT.z + T)) < 4.5 && !A.busy();
      if (near) {
        const p = _vec.set(DOOR.x, 2.0, AT.z + T + 0.3).project(A.camera);
        bubble.hidden = !(p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1);
        bubble.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; bubble.style.top = ((1 - p.y) / 2 * innerHeight - 6) + 'px';
      } else bubble.hidden = true;
    }
    return false;
  }
  // entering: the door swings, the screen fades to cream, then you're inside
  t += dt;
  if (t > 0.14) fade.classList.add('on');
  if (t > 8 && !inner) {      // safety net for a very slow connection: back outside, try again later
    state = 'out'; A.dlg.open = false; doorGoal = 0; fade.classList.remove('on'); A.toast('The shop is still unpacking. Try again in a moment.');
    return false;
  }
  if (t > 0.42 && inner) {
    A.dlg.open = false; A.setUse(null);
    document.body.classList.add('in-store');
    inner.enter(); state = 'in'; fade.classList.remove('on');
    return true;
  }
  return false;
}
