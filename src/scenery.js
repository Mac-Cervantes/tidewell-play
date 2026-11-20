// SCENERY (try/scenery): points of interest around the harbor: sea rocks, a lighthouse, an old wreck, a water mill.
// Looks only. Every model is from the Kenney packs. Made in code (decision 28): the lighthouse lamp (glass, halo, beam),
// the paint colours on the lighthouse, the lighter tint on the sea rocks, and the small hut the mill wheel hangs on (pack walls, put together here).
// MOCKUP PHASE: nothing is placed unless window.__sceneryLab is set, e.g.
//   window.__sceneryLab = { rocks: 'a' | 'b', light: 'a' | 'b' | 'c', beam: 0 | 1, wreck: 1, mill: 1 }
// or call window.__tidewell.scenery.set({...}) to rebuild without a reload.
let A = null, root = null, spin = [], lamps = [], lampK = 0, keep = [];
const lab = () => (typeof window !== 'undefined' && window.__sceneryLab) || null;

function put(parent, kit, name, x, y, z, o = {}) {
  const T = A.THREE, m = A.M[kit][name].scene.clone(true), s = (o.s ?? 1) * A.SCALE[kit];
  m.scale.set(s * (o.sx ?? 1), s * (o.sy ?? 1), s * (o.sx ?? 1)); m.rotation.y = o.r ?? 0; m.position.set(x, y, z);
  m.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true;
    if (o.paint != null) { c.material = c.material.clone(); c.material.map = null; c.material.color = new T.Color(o.paint); c.material.emissive = new T.Color(o.paint).multiplyScalar(0.16); c.material.needsUpdate = true; keep.push(c.material); }
    else if (o.tint != null) { c.material = c.material.clone(); if (Array.isArray(o.tint)) { c.material.color.multiply(new T.Color().setRGB(o.tint[0], o.tint[1], o.tint[2])); c.material.emissive = new T.Color(0x1d1f27); } else c.material.color = new T.Color(o.tint); keep.push(c.material); } } });
  parent.add(m); return m;
}
let haloTex = null;
function halo() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,244,200,1)'); r.addColorStop(0.25, 'rgba(255,214,120,0.55)'); r.addColorStop(1, 'rgba(255,190,90,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  haloTex = new A.THREE.CanvasTexture(c); return haloTex;
}
let fadeTex = null;
function fade() {   // bright at the lamp, gone by the far end
  if (fadeTex) return fadeTex;
  const c = document.createElement('canvas'); c.width = 4; c.height = 64; const g = c.getContext('2d'), r = g.createLinearGradient(0, 0, 0, 64);
  r.addColorStop(0, '#fff'); r.addColorStop(0.5, '#555'); r.addColorStop(1, '#000'); g.fillStyle = r; g.fillRect(0, 0, 4, 64);
  fadeTex = new A.THREE.CanvasTexture(c); return fadeTex;
}
// a lamp made in code: a glowing ball, a soft halo, and (beam) two faint cones that sweep round. No real lights, so it costs almost nothing.
function lamp(parent, y, size, beam) {
  const T = A.THREE, g = new T.Group(); g.position.y = y; parent.add(g);
  const ball = new T.Mesh(new T.CylinderGeometry(size, size, size * 1.7, 10), new T.MeshBasicMaterial({ color: 0xfff1c0 })); g.add(ball);   // the glass
  const sp = new T.Sprite(new T.SpriteMaterial({ map: halo(), blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); sp.scale.setScalar(size * 9); g.add(sp);
  const L = { ball, sp, size, cones: [], g };
  if (beam) for (const d of [0, Math.PI]) {
    const len = 15, geo = new T.CylinderGeometry(size * 0.45, 2.1, len, 14, 1, true); geo.translate(0, -len / 2, 0); geo.rotateZ(Math.PI / 2);   // narrow end at the lamp, pointing +x
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0xffe9a8, map: fade(), transparent: true, opacity: 0.0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
    m.rotation.y = d; g.add(m); L.cones.push(m);
  }
  lamps.push(L); return L;
}
// --- the lighthouse: pirate-kit tower pieces on a rock island. Not the castle tower (no battlements, no blue cone): slim, tapered, a lamp room on top.
function lighthouse(style, x, z, beam, size = 1) {
  const T = A.THREE, g = new T.Group(); g.position.set(x, A.WATER_Y, z); g.scale.setScalar(size); root.add(g);
  put(g, 'pirate', 'rocks-a', 0.2, -0.75, 0.3, { s: 1.25, r: 0.6, tint: ROCK }); put(g, 'pirate', 'rocks-c', -1.9, -0.5, -1.2, { s: 0.9, r: 2.2, tint: ROCK }); put(g, 'pirate', 'rocks-c', 1.7, -0.6, 1.6, { s: 0.7, r: 4.1, tint: ROCK });
  const U = 2 * A.SCALE.pirate;   // one tower piece is 2 units tall
  let y = 0.55;
  const white = 0xfbf7ee, red = 0xe0503f, room = 0x566080;
  const top = (s, capS) => {   // the lamp room: the kit's watch room painted slate, glass inside, a low red cap
    put(g, 'pirate', 'tower-watch', 0, y, 0, { s, paint: room }); lamp(g, y + 1.62 * s, 0.98 * s, beam); y += 2.785 * A.SCALE.pirate * s;
    put(g, 'pirate', 'tower-roof', 0, y - 0.04, 0, { s: capS, sy: 0.5, paint: red });
  };
  if (style === 'c') {   // C: short and stout harbor light, white with one red band
    put(g, 'pirate', 'tower-base-door', 0, y, 0, { s: 1, paint: white }); y += U;
    put(g, 'pirate', 'tower-middle', 0, y, 0, { s: 1, sx: 0.93, paint: red, r: 0.39 }); y += U;
    put(g, 'pirate', 'tower-middle-windows', 0, y, 0, { s: 1, sx: 0.88, paint: white }); y += U;
    top(0.78, 0.6);
  } else {   // A: tall and slim, white with red bands. B: the same with a balcony ring under the lamp (the kit's tower top, cut low and painted red)
    const lv = [['tower-base-door', 1.0], ['tower-middle', 0.93], ['tower-middle-windows', 0.9], ['tower-middle', 0.8], ['tower-middle', 0.74]], s = 0.82;
    lv.forEach(([n, w], i) => { put(g, 'pirate', n, 0, y, 0, { s, sx: w, r: i * 0.39, paint: i === 1 || i === 3 ? red : white }); y += U * s; });
    if (style === 'b') { put(g, 'pirate', 'tower-top', 0, y - 0.25, 0, { s: 0.74, sy: 0.42, paint: red }); y += 0.35; top(0.56, 0.45); }
    else top(0.64, 0.5);
  }
  return g;
}
const ROCK = [1.42, 1.38, 1.36];   // the kit's sea rocks, a little lighter so they don't go black against the sun
function rocks(set) {
  const W = A.WATER_Y, P = (n, x, z, s, r, y = -0.55) => put(root, 'pirate', n, x, W + y, z, { s, r, tint: ROCK });
  // just past the cargo ship's lane (z -14.5 … -20.5 stays clear all the way across)
  P('rocks-b', -5.2, -24.6, 1.3, 0.4); P('rocks-c', -2.4, -26.4, 0.8, 2.0); P('rocks-a', 12.2, -24.8, 1.15, 3.3);
  // between the beach and the lane, clear of the dock
  if (!(lab().light && lab().lightAt === 'near')) P('rocks-c', 12.6, -11.4, 0.8, 1.2, -0.5);
  P('rocks-c', -8.8, -12.0, 0.7, 4.4, -0.5);
  if (set === 'b') {   // B, the rocky coast: more of them, the beach ends too, plus tall stacks from the nature kit
    P('rocks-a', 17.4, -9.4, 0.9, 5.0); P('rocks-c', -19.6, -9.8, 0.9, 0.3); P('rocks-b', 17.0, -26.5, 1.1, 5.2); P('rocks-c', 21.5, -23.5, 1.0, 1.0); P('rocks-a', -22.5, -24, 1.1, 2.6);
    const S = (n, x, z, s, r) => put(root, 'nature', n, x, W - 0.5, z, { s, r });
    S('rock_tallA', 14.6, -23.2, 3.2, 0.5); S('rock_tallD', -8.2, -22.6, 3.4, 1.9); S('rock_tallA', 14.6, -12.6, 2.2, 3.6); S('rock_tallD', -11.0, -12.9, 2.2, 0.2);
  }
}
function wreck() {   // an old mossy hull run up on rocks, out on the left past the ship's lane
  const W = A.WATER_Y, x = -10.6, z = -24.4;
  put(root, 'pirate', 'rocks-c', x + 2.6, W - 0.55, z + 1.2, { s: 1.0, r: 1.1, tint: ROCK }); put(root, 'pirate', 'rocks-a', x - 2.4, W - 0.7, z - 1.4, { s: 0.95, r: 4.0, tint: ROCK });
  const s = put(root, 'pirate', 'ship-wreck', x, W - 0.55, z, { s: 0.8, r: 0.75 }); s.rotation.z = 0.16; s.rotation.x = -0.05;
}
// a small hut from the town kit's walls and roof (as the coop and Nell's store are), with the pack's water wheel turning in the river
function hut(x, z, s) {
  const T = A.THREE, g = new T.Group(), t = A.SCALE.town * s; g.position.set(x, A.groundY(x, z), z); root.add(g);
  const pc = (n, px, py, pz, r) => put(g, 'town', n, px, py, pz, { s, r });
  pc('wall-wood-window-shutters', 0, 0, 0, -Math.PI / 2); pc('wall-wood', 0, 0, 0, Math.PI / 2); pc('wall-wood', 0, 0, 0, Math.PI); pc('wall-wood-door', 0, 0, 0, 0); pc('roof-gable', 0, t, 0, Math.PI / 2);
  return g;
}
function mill() {   // on the home bank, between the two oaks: the hut on the grass, the wheel in the river
  const z = 3.2, bx = A.bankX ? A.bankX(z) : -12.3, x = bx + 1.25; hut(x, z, 0.8);
  const w = put(root, 'town', 'watermill', bx - 0.42, 0.5, z, { s: 0.6 }); spin.push({ o: w, ax: 'x', sp: -0.7 });
}
function build() {
  const T = A.THREE, c = lab();
  if (root) { A.scene.remove(root); keep.forEach(m => m.dispose()); lamps.forEach(L => { L.ball.geometry.dispose(); L.ball.material.dispose(); L.sp.material.dispose(); L.cones.forEach(m => { m.geometry.dispose(); m.material.dispose(); }); }); }
  root = new T.Group(); spin = []; lamps = []; keep = []; A.scene.add(root);
  if (!c) return;
  if (c.rocks) rocks(c.rocks);
  if (c.light) { const near = c.lightAt === 'near', at = near ? [11.6, -11.6] : [6.6, -24.2]; lighthouse(c.light, at[0], at[1], c.beam, near ? 0.8 : 1); }
  if (c.wreck) wreck();
  if (c.mill) mill();
}
export const scenery = {
  init(api) { A = api; build(); },
  set(c) { window.__sceneryLab = c; build(); },
  // lamps: 0 by day … 6 at night (the same number the lanterns get)
  frame(dt, t, lampsNow) {
    if (!root) return;
    lampK += ((lampsNow > 0.5 ? Math.min(1, lampsNow / 4) : 0) - lampK) * Math.min(1, dt * 2);
    for (const s of spin) s.o.rotation[s.ax] += s.sp * dt;
    for (const L of lamps) {
      const k = lampK;
      L.sp.material.opacity = 0.95 * k; L.sp.visible = k > 0.02;
      L.ball.material.color.setRGB(0.80 + 0.2 * k, 0.76 + 0.2 * k, 0.56 + 0.26 * k);
      L.cones.forEach(m => { m.material.opacity = 0.3 * k; m.visible = k > 0.02; });
      if (L.cones.length) L.g.rotation.y = t * 0.45;
    }
  },
};
