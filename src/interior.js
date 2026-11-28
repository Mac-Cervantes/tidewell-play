// The INSIDE of the walk-in general store (try/store; decision 48: interiors are their own scene with a fixed camera).
// Loaded in the background by src/store.js, never by main.js. Everything here is built once, when this file loads:
// the room, Nell, the stock on the shelves, the price tags and the buying screens.
// Picked by Mac from the mockups: room B (shelves face you, counter on the right, lower camera), buying C
// (walk up to a shelf item, or ask Nell for the whole list), furniture from plain boxes for now.
import { DECOR, TOOLS } from './data.js';

export function create(A, { STORE }) {
  const THREE = A.THREE, T = A.SCALE.town;
  const W = 5, D = 5;                                   // 5 m wide: fits a phone held upright without the camera panning
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x241b33);
  const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0xd0a880, 1.25));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.5); sun.position.set(3.5, 9, 6); sun.target.position.set(0, 0, 0);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  { const c = sun.shadow.camera; c.left = -4.5; c.right = 4.5; c.top = 4.5; c.bottom = -4.5; c.near = 1; c.far = 24; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03; }
  scene.add(sun, sun.target);

  // ---------- the room ----------
  const wood = 0x9a6a42, woodL = 0xe9c796, woodD = 0x7a4a2a;
  const mats = {};
  const mat = (c) => mats[c] || (mats[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
  function box(g, w, h, d, color, x, y, z, flat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)); m.position.set(x, y, z); m.castShadow = !flat; m.receiveShadow = true; g.add(m); return m;
  }
  function planks(w, d) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const k = c.getContext('2d');
    k.fillStyle = '#d2a574'; k.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8; i++) { k.fillStyle = i % 2 ? '#cb9c6a' : '#d8ad7e'; k.fillRect(i * 32, 0, 31, 256); k.fillStyle = '#b98a5a'; for (let j = 0; j < 3; j++) k.fillRect(i * 32, (i * 87 + j * 95) % 256, 31, 2); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(w / 3.3, d / 3.3);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); m.receiveShadow = true; return m;
  }
  function wall(name, x, z, r, k) {
    const o = A.M.town[name].scene.clone(true); o.scale.setScalar(T * k); o.position.set(x, 0, z); o.rotation.y = r;
    o.traverse(m => { if (m.isMesh) m.receiveShadow = true; }); scene.add(o);
  }
  { const k = W / (2 * T), t = T * k;                    // two wall tiles across, stretched a little to 5 m
    const f = planks(W, D); f.position.y = -0.05; scene.add(f);
    for (let i = 0; i < 2; i++) wall('wall-wood', -W / 2 + t / 2 + i * t, -D / 2 - t / 2 + 0.1 * t, -Math.PI / 2, k);
    for (let j = 0; j < 2; j++) { const z = -D / 2 + t / 2 + j * t; wall('wall-wood', W / 2 + t / 2 - 0.1 * t, z, Math.PI, k); wall('wall-wood', -W / 2 - t / 2 + 0.1 * t, z, 0, k); }
    // the doorway: a notch in front with the mat and daylight coming in
    const n = planks(1.7, 0.8); n.position.set(0, -0.05, D / 2 + 0.4); scene.add(n);
    box(scene, 1.3, 0.03, 0.75, 0xc8443a, 0, 0.012, D / 2 + 0.1, true);
    box(scene, 1.7, 0.02, 0.5, 0xfff3c4, 0, 0.008, D / 2 + 0.62, true);
  }

  // ---------- stock: what stands on the shelves and the table ----------
  const SLOTS = [];                                       // { id, kind: 'decor'|'tool', x, y, z (where the item sits), sx, sz (where you stand) }
  function model(entry, fit) {
    let o;
    if (entry.startsWith('tool:')) {
      o = A.farmToolMesh[entry.slice(5)].clone(true); o.visible = true; o.traverse(m => { m.visible = true; });
      const g = new THREE.Group(); o.position.set(0, 0, 0); o.rotation.set(-Math.PI / 2 + 0.25, 0, 0); g.add(o); o = g;       // standing up, leaning back
    } else o = A.buildDecorMesh(entry, 0);
    o.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3());
    const k = Math.min(1.2, fit / Math.max(s.x, s.z, s.y * 0.7));
    const h = new THREE.Group(); o.position.y -= b.min.y; o.position.x -= (b.min.x + b.max.x) / 2; o.position.z -= (b.min.z + b.max.z) / 2; h.add(o); h.scale.setScalar(k);
    h.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });
    return h;
  }
  const slotOf = (entry, x, y, z, sx, sz) => ({ entry, kind: entry.startsWith('tool:') ? 'tool' : 'decor', id: entry.replace('tool:', ''), x, y, z, sx, sz });
  function shelf(cx, entries) {
    const w = 2.2, z = -D / 2 + 0.36, g = new THREE.Group(); g.position.set(cx, 0, z); scene.add(g);
    box(g, w, 1.7, 0.06, woodD, 0, 0.85, -0.27); for (const s of [-1, 1]) box(g, 0.07, 1.7, 0.6, wood, s * w / 2, 0.85, 0);
    box(g, w, 0.06, 0.6, woodL, 0, 0.5, 0); box(g, w, 0.06, 0.6, woodL, 0, 1.25, 0); box(g, w + 0.1, 0.07, 0.66, wood, 0, 1.72, 0);
    box(g, w, 0.5, 0.56, wood, 0, 0.25, 0);                                             // closed cupboard below
    entries.forEach((e, i) => {
      const x = -w / 2 + (i + 0.5) * w / entries.length, m = model(e, 0.42); m.position.set(x, 0.53, 0.05); g.add(m);
      SLOTS.push(slotOf(e, cx + x, 0.53, z + 0.05, cx + x, z + 0.95));
    });
    // a few things up top, just for looks
    for (const [e, x] of cx < 0 ? [['crate', -0.6], ['banner', 0.5]] : [['cart', -0.45], ['crate', 0.65]]) { const m = model(e, 0.34); m.position.set(x, 1.28, 0); m.rotation.y = x; g.add(m); }
  }
  shelf(-1.2, STORE.shelf.slice(0, 3)); shelf(1.2, STORE.shelf.slice(3, 6));
  // the table on the left
  { const g = new THREE.Group(), tx = -1.85, tz = 0.95, tw = 1.0, td = 1.9; g.position.set(tx, 0, tz); scene.add(g);
    box(g, tw, 0.5, td, wood, 0, 0.25, 0); box(g, tw + 0.12, 0.07, td + 0.12, woodL, 0, 0.53, 0);
    STORE.table.forEach((e, i) => { const z = -td / 2 + (i + 0.5) * td / STORE.table.length, m = model(e, 0.8); m.position.set(0, 0.565, z); m.rotation.y = e === 'bench' ? Math.PI / 2 : 0; g.add(m);
      SLOTS.push(slotOf(e, tx, 0.565, tz + z, tx + 1.0, tz + z)); }); }
  // the counter on the right, with a till
  const COUNTER = { x: W / 2 - 1.0, z: 0.75 };
  { const g = new THREE.Group(); g.position.set(COUNTER.x, 0, COUNTER.z); scene.add(g);
    box(g, 0.6, 0.7, 1.8, wood, 0, 0.35, 0); box(g, 0.74, 0.08, 1.94, woodL, 0, 0.73, 0); box(g, 0.04, 0.2, 1.8, 0xc8443a, -0.31, 0.42, 0);
    box(g, 0.3, 0.24, 0.34, 0x4f6f8f, 0, 0.89, -0.5); box(g, 0.12, 0.1, 0.3, 0xf2c230, -0.02, 1.04, -0.5);
    const f = A.M.nature.flower_yellowA.scene.clone(true); f.scale.setScalar(A.SCALE.nature * 0.8); f.position.set(0, 0.77, 0.6); g.add(f); }
  // rug
  box(scene, 2.0, 0.02, 1.9, 0xfff3dc, -0.15, 0.008, 0.75, true); box(scene, 1.7, 0.02, 1.6, 0xd98a5a, -0.15, 0.012, 0.75, true);

  // ---------- Nell (same dummy and animations as everyone, src/anim.js) ----------
  const KEEPER = { x: W / 2 - 0.38, z: COUNTER.z, yaw: -Math.PI / 2 };
  const nell = A.makeBody('f'); nell.root.visible = true;
  A.setLook(nell, { skin: '#f0c9a4', hair: 'long', hairColor: '#8a4a22', eyes: 'big', mouth: 'smile', blush: true, top: 'long', topColor: '#4f9a6a', bottom: 'pants', bottomColor: '#6b4a34', shoes: '#3a2a22' });
  A.kHat(nell, 0xe8846a, [[0.125, 0.135, 0.06, 0.03]]);                                  // coral headband
  scene.add(nell.root); nell.root.position.set(KEEPER.x, 0, KEEPER.z); nell.root.rotation.y = KEEPER.yaw;

  // ---------- pictures for the buying screens, rendered once from the real models ----------
  const pics = {};
  { const cv = document.createElement('canvas'), R = 128;
    const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.setSize(R, R, false); r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0x000000, 0);
    const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0xc9b79a, 2.0));
    const l = new THREE.DirectionalLight(0xffffff, 2.2); l.position.set(3, 6, 5); sc.add(l);
    const c2 = new THREE.PerspectiveCamera(26, 1, 0.01, 100);
    for (const id of STORE.decor) {
      const o = A.buildDecorMesh(id, 0); sc.add(o); o.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(o), ctr = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3()).length();
      c2.position.set(ctr.x + size * 0.9, ctr.y + size * 0.85, ctr.z + size * 1.6); c2.lookAt(ctr); r.render(sc, c2);
      pics[id] = `<img src="${cv.toDataURL('image/png')}" alt="">`; sc.remove(o);
    }
    r.dispose(); r.forceContextLoss(); }
  for (const id of STORE.tools) pics['tool:' + id] = A.svg(id, '#2b2140', 44, 2);
  const picOf = (kind, id) => kind === 'extra' ? STORE.extra.items[id].pic() : kind === 'tool' ? pics['tool:' + id] : pics[id];   // ANIMALS: 'extra' = a tab another file adds (STORE.extra)

  // ---------- what things cost and whether you can have them ----------
  const info = (kind, id) => kind === 'extra' ? STORE.extra.items[id].info() : kind === 'tool'
    ? { name: TOOLS[id].name, price: TOOLS[id].price, level: TOOLS[id].level, own: A.hasTool(id), once: true, blurb: 'For ' + TOOLS[id].does }
    : { name: DECOR[id].name, price: DECOR[id].buy, level: DECOR[id].level || 0, own: false, once: false, have: A.invCount('decor_' + id) };
  const locked = (it) => A.S.level < it.level;

  // ---------- screens (their own bits of HTML and CSS, added to the page once) ----------
  const st = document.createElement('style');
  st.textContent = `
#stTags { position: fixed; inset: 0; z-index: 5; pointer-events: none; }
.sttag { position: absolute; transform: translate(-50%, -100%); display: flex; align-items: center; gap: 4px; background: #fffdf5; border: 2px solid #2b2140; border-radius: 11px; padding: 1px 6px 1px 4px; font-weight: 700; font-size: 13px; color: #2b2140; box-shadow: 0 3px 0 rgba(43,33,64,.3); white-space: nowrap; transition: transform .15s ease; }
.sttag.near { transform: translate(-50%, -100%) scale(1.7); z-index: 2; pointer-events: auto; cursor: pointer; }
.sttag.own { background: #e9f6dc; }
.sttag .pr { display: flex; align-items: center; gap: 4px; }
.sttag .nm { display: none; font-size: 10px; line-height: 1.1; font-weight: 700; text-align: center; }
.sttag .nm small { display: none; font-size: 7.5px; font-weight: 600; color: #6a5f7c; letter-spacing: .02em; text-transform: uppercase; }
#stTags[data-names="near"] .sttag.near, #stTags[data-names="all"] .sttag { flex-direction: column; gap: 1px; padding: 2px 6px 2px; }
#stTags[data-names="near"] .sttag.near .nm, #stTags[data-names="all"] .sttag .nm { display: block; }
#stTags[data-names="near"] .sttag.near .nm small, #stTags[data-names="all"] .sttag.near .nm small { display: block; }
#stTags[data-names="all"] .sttag:not(.near) .nm { font-size: 9px; font-weight: 600; }
#stPlate { position: fixed; right: 150px; left: 14px; bottom: calc(42px + env(safe-area-inset-bottom)); z-index: 6; pointer-events: none; display: flex; justify-content: flex-end; }
#stPlate[hidden] { display: none; }
#stPlate div { background: #fffdf5; border: 2px solid #2b2140; border-radius: 14px; padding: 6px 14px; box-shadow: 0 3px 0 rgba(43,33,64,.3); color: #2b2140; font-weight: 700; font-size: 20px; line-height: 1.15; text-align: right; }
#stPlate small { display: block; font-size: 13px; font-weight: 600; color: #6a5f7c; }
.sttag[data-kind="decor"] { --kc: #c4508f; } .sttag[data-kind="tool"] { --kc: #2c7dbd; }
#stTags[data-color="word"] .sttag .nm small { color: var(--kc); font-weight: 700; }
#stTags[data-color="pill"] .sttag .nm small { color: #fff; background: var(--kc); border-radius: 6px; padding: 1px 5px; margin: 1px auto; width: max-content; font-weight: 700; }
#stTags[data-color="edge"] .sttag { border-color: var(--kc); } #stTags[data-color="edge"] .sttag .nm small { color: var(--kc); font-weight: 700; }
.stcoin { display: inline-block; width: 1em; height: 1em; border-radius: 50%; background: #f4c542; border: .14em solid #b8860b; box-sizing: border-box; flex: none; }
.stlv { display: inline-flex; width: 1.5em; height: 1.5em; border-radius: 50%; border: .16em solid #7cc957; background: #fff; align-items: center; justify-content: center; font-weight: 700; font-size: .82em; box-sizing: border-box; flex: none; }
#stCard { position: fixed; left: 10px; right: 10px; bottom: calc(14px + env(safe-area-inset-bottom)); z-index: 12; max-width: 400px; margin: 0 auto; background: #fffcf4; border: 2px solid #2b2140; border-radius: 18px; padding: 12px; display: flex; gap: 12px; align-items: center; box-shadow: 0 5px 0 rgba(43,33,64,.25); color: #2b2140; animation: stUp .22s cubic-bezier(.3,1.4,.5,1) both; }
@keyframes stUp { from { transform: translateY(30px); opacity: 0; } to { transform: none; opacity: 1; } }
#stCard .pic { width: 84px; height: 84px; border-radius: 14px; background: #fff3dc; border: 2px solid #2b2140; display: flex; align-items: center; justify-content: center; flex: none; }
#stCard .pic img { width: 86%; height: 86%; object-fit: contain; }
#stCard .col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
#stCard .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
#stCard .nm { font-size: 19px; font-weight: 600; } #stCard .nm small { display: block; font-size: 12px; font-weight: 500; color: #6a5f7c; }
#stCard .pr { display: inline-flex; align-items: center; gap: 5px; font-weight: 700; font-size: 26px; }
#stCard .pr.no { color: #c8362b; animation: stShake .3s; }
@keyframes stShake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
#stCard .row { display: flex; gap: 6px; align-items: center; }
#stCard button { height: 46px; border-radius: 12px; border: 2px solid #2b2140; font-family: inherit; font-weight: 700; color: #2b2140; cursor: pointer; padding: 0; }
#stCard .st { width: 46px; flex: none; background: #fff3dc; font-size: 24px; }
#stCard .q { width: 30px; text-align: center; font-size: 24px; font-weight: 700; flex: none; }
#stCard .buy { flex: 1; min-width: 0; background: #7cc957; font-size: 19px; box-shadow: 0 2px 0 rgba(43,33,64,.3); }
#stCard .buy:disabled { background: #e6dfd2; color: #8a8096; box-shadow: none; }
#stCard .x { position: absolute; right: 2px; top: -50px; width: 44px; height: 44px; border-radius: 50%; background: #fffcf4; font-size: 20px; }
#stList { position: fixed; inset: 0; z-index: 11; background: rgba(43,33,64,.25); display: flex; align-items: flex-end; justify-content: center; padding: 0 8px calc(14px + env(safe-area-inset-bottom)); color: #2b2140; }
#stList .card { width: min(400px, 100%); background: #fffcf4; border: 2px solid #2b2140; border-radius: 18px; padding: 12px; display: flex; flex-direction: column; gap: 9px; box-shadow: 0 5px 0 rgba(43,33,64,.25); animation: stUp .22s cubic-bezier(.3,1.4,.5,1) both; }
#stList .hd { display: flex; align-items: center; justify-content: space-between; } #stList h2 { margin: 0; font-size: 19px; }
#stList .hd button { border: 0; background: none; min-width: 44px; min-height: 44px; font-size: 22px; font-family: inherit; color: #2b2140; cursor: pointer; }
#stList .tabs { display: flex; gap: 6px; } #stList .tabs button { min-height: 40px; font-family: inherit; font-size: 15px; font-weight: 600; border: 2px solid #2b2140; border-radius: 999px; padding: 2px 16px; background: #fffcf4; color: #2b2140; cursor: pointer; }
#stList .tabs button.on { background: #ffe9a8; }
#stList .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; max-height: min(46vh, 380px); overflow-y: auto; padding: 1px; }
#stList .tile { background: #fff3dc; border: 2px solid #2b2140; border-radius: 14px; padding: 6px 4px 7px; display: flex; flex-direction: column; align-items: center; gap: 2px; font-family: inherit; color: #2b2140; cursor: pointer; min-height: 96px; justify-content: space-between; }
#stList .tile .tp { width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; } #stList .tile .tp img { width: 100%; height: 100%; object-fit: contain; }
#stList .tile .pr { display: inline-flex; align-items: center; gap: 4px; font-weight: 700; font-size: 20px; }
#stList .tile.locked .tp { opacity: .45; } #stList .tile.locked .pr, #stList .tile.own .pr { font-size: 14px; font-weight: 600; color: #6a5f7c; }
#stList .tile.own { background: #e9f6dc; }`;
  document.head.appendChild(st);
  const tagsEl = document.createElement('div'); tagsEl.id = 'stTags'; tagsEl.hidden = true; document.body.appendChild(tagsEl);
  const coin = '<span class="stcoin"></span>';
  const priceHTML = (it) => it.own ? A.svg('check', '#2f7d32', 16, 3.2) : locked(it) ? `${A.svg('lock', '#6a5f7c', 13, 2.6)}<span class="stlv">${it.level}</span>` : `${coin}${it.price}`;
  for (const s of SLOTS) {
    s.el = document.createElement('div'); s.el.className = 'sttag'; tagsEl.appendChild(s.el);
    s.el.addEventListener('click', () => openCard(s.kind, s.id));
  }
  // Names on the shelf tags (Mac: "the items in the store should have a name and its use, like Barrel (decor)").
  // TAG_NAMES: 'near' = the item you're standing at shows its name and kind over the price · 'all' = every tag shows its name,
  // and the one you're at adds the kind · 'plate' = tags stay as they are and a name plate sits by the Buy button · '' = prices only.
  const TAG_NAMES = 'near';   // Mac picked A (Nov 21)
  const TAG_COLOR = 'edge';   // Mac picked 3: every tag outlined in its kind's colour (pink Decor, blue Tool)
  const tagMode = () => (window.__tagLab != null ? window.__tagLab : TAG_NAMES);
  const KIND = { decor: 'Decor', tool: 'Tool' };
  const plate = document.createElement('div'); plate.id = 'stPlate'; plate.hidden = true; document.body.appendChild(plate);
  function refreshTags() {
    const m = tagMode(); tagsEl.dataset.names = m; if (!tagsEl.dataset.color) tagsEl.dataset.color = TAG_COLOR;
    for (const s of SLOTS) { const it = info(s.kind, s.id); s.el.innerHTML = (m === 'near' || m === 'all' ? `<span class="nm">${it.name}<small>${KIND[s.kind] || ''}</small></span>` : '') + `<span class="pr">${priceHTML(it)}</span>`; s.el.classList.toggle('own', !!it.own); s.el.dataset.kind = s.kind; }
  }

  // the buy card (walk-up and list both end here): picture, big price, − 1 +, Buy
  let card = null, cardFrom = null;
  function closeCard() { if (card) { card.el.remove(); card = null; A.audio.play('popClose'); } }
  function openCard(kind, id, from) {
    const it = info(kind, id);
    if (locked(it)) { A.toast(`${it.name}: town level ${it.level}`); return; }
    if (it.own) { A.toast(`You already have the ${it.name.toLowerCase()}`); return; }
    if (card) card.el.remove();
    cardFrom = from || null; if (list) list.el.hidden = true;
    const el = document.createElement('div'); el.id = 'stCard';
    el.innerHTML = `<button class="x" data-x aria-label="Close">✕</button><div class="pic">${picOf(kind, id)}</div><div class="col">
      <div class="top"><span class="nm">${it.name}<small></small></span><span class="pr">${coin}<b></b></span></div>
      <div class="row">${it.once ? '' : '<button class="st" data-q="-1" aria-label="One fewer">−</button><span class="q">1</span><button class="st" data-q="1" aria-label="One more">+</button>'}<button class="buy" data-buy>Buy</button></div></div>`;
    document.body.appendChild(el);
    card = { el, kind, id, q: 1 }; paintCard(); A.audio.play('popOpen');
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) { closeCard(); if (cardFrom === 'list') openList(); return; }
      const qb = e.target.closest('[data-q]'); if (qb) { card.q = Math.max(1, Math.min(99, card.q + Number(qb.dataset.q))); paintCard(); return; }
      if (e.target.closest('[data-buy]')) buy();
    });
  }
  function paintCard() {
    const it = info(card.kind, card.id), cost = it.price * card.q;
    card.el.querySelector('.pr b').textContent = cost.toLocaleString();
    card.el.querySelector('.nm small').textContent = it.once || it.blurb ? it.blurb : it.have ? `you have ${it.have}` : '';
    const q = card.el.querySelector('.q'); if (q) q.textContent = card.q;
  }
  function buy() {
    const it = info(card.kind, card.id), cost = it.price * card.q, S = A.S;
    if (S.coins < cost) {
      const p = card.el.querySelector('.pr'); p.classList.remove('no'); void p.offsetWidth; p.classList.add('no');
      A.toast('Not enough coins yet'); return;
    }
    if (card.kind === 'extra') { const no = STORE.extra.items[card.id].can(card.q); if (no) { A.toast(no); return; } }   // ANIMALS
    S.coins -= cost; A.audio.play('buy');
    if (card.kind === 'extra') STORE.extra.items[card.id].give(card.q);
    else if (card.kind === 'tool') { S.tools = [...(S.tools || []), card.id]; A.toast(`${it.name}: it’s in your Farm tools`); }
    else { A.addItem('decor_' + card.id, card.q); A.toast(`+${card.q} ${it.name.toLowerCase()}`); }
    A.renderHotbar(); A.commit(); A.refreshFarmTray(); refreshTags();
    if (card.kind === 'tool' || it.once) { closeCard(); if (cardFrom === 'list') openList(); } else { card.q = 1; paintCard(); }
  }

  // Nell's list: every item as a picture with a big price
  let list = null, tab = 'decor';
  function openList() {
    if (!list) {
      const el = document.createElement('div'); el.id = 'stList';
      el.innerHTML = `<div class="card"><div class="hd"><h2>${STORE.name}</h2><button data-x aria-label="Close">✕</button></div>
        <div class="tabs"><button data-tab="decor">Decor</button><button data-tab="tools">Tools</button>${STORE.extra ? `<button data-tab="extra">${STORE.extra.label}</button>` : ''}</div><div class="grid"></div></div>`;
      document.body.appendChild(el); list = { el };
      el.addEventListener('click', (e) => {
        if (e.target === el || e.target.closest('[data-x]')) { closeList(); return; }
        const tb = e.target.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; paintList(); return; }
        const ti = e.target.closest('[data-item]'); if (ti) openCard(ti.dataset.kind, ti.dataset.item, 'list');
      });
    }
    list.el.hidden = false; paintList();
  }
  function closeList() { if (list && !list.el.hidden) { list.el.hidden = true; A.audio.play('popClose'); } }
  function paintList() {
    for (const b of list.el.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
    const kind = tab === 'extra' ? 'extra' : tab === 'tools' ? 'tool' : 'decor', ids = tab === 'extra' ? Object.keys(STORE.extra.items).filter(id => !STORE.extra.items[id].hidden || !STORE.extra.items[id].hidden())   /* RANCH: an item can stay off the list until it's time (the bridge blueprint) */ : tab === 'tools' ? STORE.tools : STORE.decor;
    list.el.querySelector('.grid').innerHTML = ids.map(id => { const it = info(kind, id), lk = locked(it);
      return `<button class="tile${lk ? ' locked' : ''}${it.own ? ' own' : ''}" data-kind="${kind}" data-item="${id}" aria-label="${it.name}${lk ? ', opens at town level ' + it.level : it.own ? ', yours' : ', ' + it.price + ' coins'}"><span class="tp">${picOf(kind, id)}</span><span class="pr">${it.own ? A.svg('check', '#2f7d32', 16, 3.2) + ' yours' : lk ? `${A.svg('lock', '#6a5f7c', 13, 2.6)}<span class="stlv">${it.level}</span>` : coin + it.price}</span></button>`; }).join('');
  }
  const uiOpen = () => !!card || (list && !list.el.hidden);
  function talk() {
    if (!A.S.storeMet) {
      A.S.storeMet = true; A.commit();
      // the dialog card is Higgins's; it wears Nell's name while she talks
      const nm = document.querySelector('#dialog .dname'), was = nm ? nm.innerHTML : '';
      const done = (then) => () => { if (nm) nm.innerHTML = was; A.closeDialog(); if (then) then(); };
      if (nm) nm.innerHTML = `${STORE.keeper} <span>general store</span>`;
      A.showDialog(`Hello, neighbor! I\u2019m ${STORE.keeper}. Decor and tools are my corner of town now. Have a look around the shelves, or ask me for the whole list.`,
        [{ label: 'Show me the list', primary: true, go: done(openList) }, { label: 'I\u2019ll look around', go: done() }]);
    } else openList();
  }

  // ---------- you, inside ----------
  const me = { x: 0, z: 0, yaw: Math.PI, on: false };
  let body = null, near = null, useKey = '';
  const R = 0.3;
  // where you can stand: the middle of the room and the strip in front of the shelves; the table and counter are solid
  function free(x, z) {
    if (Math.abs(x) < 0.55 && z > D / 2 - 0.4) return z < D / 2 + 0.75;                  // the doorway
    if (Math.abs(x) > W / 2 - R || z > D / 2 - R || z < -D / 2 + 0.95) return false;
    if (x > COUNTER.x - 0.3 - R && z > COUNTER.z - 0.97 - R) return false;               // counter and Nell's corner
    if (x < -1.35 + R && z > -0.05 - R) return false;                                    // table
    return true;
  }
  function placeCam() {
    const cv = A.renderer.domElement, asp = cv.clientWidth / Math.max(1, cv.clientHeight);
    if (cam.aspect !== asp) { cam.aspect = asp; cam.updateProjectionMatrix(); }
    const th = Math.tan(cam.fov * Math.PI / 360);
    const d = Math.max((W + 0.9) / (2 * th * asp), (D + 3.2) / (2 * th) * 0.8), a = 39 * Math.PI / 180;   // far enough to show the whole room, about 40° down
    cam.position.set(0, 0.4 + d * Math.sin(a), 0.3 + d * Math.cos(a)); cam.lookAt(0, 0.4, 0.3);
  }
  const _p = new THREE.Vector3();
  function placeTags() {
    const w = innerWidth, h = innerHeight;
    if (tagsEl.dataset.names !== tagMode()) refreshTags();
    for (const s of SLOTS) {
      _p.set(s.x, s.y + 0.5, s.z).project(cam);
      s.el.style.left = ((_p.x + 1) / 2 * w) + 'px'; s.el.style.top = ((1 - _p.y) / 2 * h) + 'px';
      s.el.classList.toggle('near', s === near);
      if (s === near && tagMode() === 'plate') { const it = info(s.kind, s.id), html = `<div>${it.name}<small>${KIND[s.kind] || ''}</small></div>`; if (plate.dataset.h !== html) { plate.dataset.h = html; plate.innerHTML = html; } }
    }
    plate.hidden = !(tagMode() === 'plate' && near && SLOTS.includes(near));
  }

  function enter() {
    body = A.body; me.x = 0; me.z = D / 2 - 0.45; me.yaw = Math.PI; me.on = true; near = null; useKey = '';
    scene.add(body.root);                                 // your character steps into this scene (the dummy rides along)
    refreshTags(); tagsEl.hidden = false; placeCam();
  }
  function exit() {
    closeCard(); closeList(); if (A.dlg.open) A.closeDialog();
    me.on = false; tagsEl.hidden = true; plate.hidden = true; A.setUse(null);
    A.scene.add(body.root); A.renderer.toneMappingExposure = A.exposure();
    A.anim.setTalk(body, false); body = null;
  }

  // one frame inside. Returns 'leave' when you walk out over the mat. `frozen` = the fade out is running.
  function frame(dt, frozen) {
    const busy = frozen || A.dlg.open || uiOpen();
    let dx = busy ? 0 : A.joy.dx, dz = busy ? 0 : A.joy.dy, mag = Math.min(1, Math.hypot(dx, dz)), v = 0;
    if (mag > 0.12) {
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      const sp = mag < 0.55 ? 1.6 + mag * 1.4 : 3.2 + (mag - 0.55) / 0.45 * 1.2;         // a little slower than outside: it's a small room
      let nx = me.x + dx * sp * dt, nz = me.z + dz * sp * dt;
      if (!free(nx, nz)) { if (free(nx, me.z)) nz = me.z; else if (free(me.x, nz)) nx = me.x; else { nx = me.x; nz = me.z; } }
      v = Math.hypot(nx - me.x, nz - me.z) / Math.max(dt, 1e-4); me.x = nx; me.z = nz;
      const yaw = Math.atan2(dx, dz); let d = yaw - me.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); me.yaw += d * Math.min(1, dt * 12);
    }
    A.locomote(Math.min(v, 5), dt);
    const talking = A.dlg.open || (list && !list.el.hidden);
    A.anim.setTalk(nell, talking); A.anim.setTalk(body, talking, 0.35);
    body.root.position.set(me.x, 0, me.z); body.root.rotation.set(0, me.yaw, 0);
    body.mixer.update(dt); A.anim.pose(body); body.root.updateMatrixWorld(true); A.syncPuppet(body);
    A.anim.idleTick(nell, dt); A.syncPuppet(nell);
    A.audio.frame(A.player.pos.x, A.player.pos.z, v > 0.2, false, A.currentTOD());       // the music carries on; the shore stays where you left it

    // what's in reach: the nearest thing on a shelf or the table, or Nell across the counter
    near = null;
    if (!busy) {
      let bd = 0.75;
      for (const s of SLOTS) { const d = Math.hypot(me.x - s.sx, (me.z - s.sz) * 0.6); if (d < bd) { bd = d; near = s; } }
      const atCounter = !near && me.x > COUNTER.x - 1.35 && me.z > COUNTER.z - 1.3 && me.z < D / 2 - 0.2;
      const key = near ? 'store:' + near.entry : atCounter ? 'store:nell' : '';
      if (key !== useKey) {
        useKey = key;
        if (near) { const s = near; A.setUse({ kind: 'talk', key, icon: 'bag', label: 'Buy', go: () => openCard(s.kind, s.id) }); }
        else if (atCounter) A.setUse({ kind: 'talk', key, go: talk });
        else A.setUse(null);
      }
    } else if (useKey) { useKey = ''; A.setUse(null); }
    placeCam(); placeTags();
    A.renderer.toneMappingExposure = 1.05;                // always the same cozy light, whatever the hour outside
    A.renderer.render(scene, cam);
    return !frozen && me.z > D / 2 + 0.3 ? 'leave' : null;
  }

  return { enter, exit, frame };
}
