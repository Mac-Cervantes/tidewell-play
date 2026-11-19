// Tidewell — the cargo ship (decisions 70 and 90). A merchant ship at the end of the dock, from town level 4.
// Crates (crops) and barrels (fish) stand on the dock from the ship end toward the beach; each takes one kind of thing and
// has its own level (holds 5 / 10 / 15). You buy the next one where its see-through outline stands. One star crate asks for
// something in particular and adds a treasure chest. Send the ship: it's away an hour, sells for 1.5x Higgins's price, and
// the pay waits in a chest by the dock steps. Numbers are in CARGO in data.js.
//
// Moved out of main.js in v0.1.86 with the code unchanged. main.js builds it with createCargo({...}) and calls
// build(), refresh(), tick(dt), the near...() checks for the action button, and open()/collect()/renderHold().
import * as THREE from 'three';
import { CARGO, ITEMS, XP, ORDERS, CROPS, CROP_ORDER, DECOR_ORDER, unlockLevel } from './data.js';

export function createCargo(A) {
  // A.merchant (the ship model) and A.tool() are read fresh each time; everything else here never changes identity
  const { S, settings, player, camera, scene, DOCK, DOCK_FLOOR, SHIP_AT, SHIP_IN, SHIP_OUT, waterUniforms, farm, decor, audio,
    commit, toast, svg, itemIcon, place, addItem, invCount, addXP, onDock, openSheet, furlSails } = A;

  // Crates take crops, barrels take fish: load anything until they're full. The star crate asks for something in
  // particular and brings a treasure chest. Send the ship and it's gone for a while; it sells everything for more
  // than Higgins pays and comes back with the coins (and the chest).
  let cargoReady = false, cargoModels = [], chestModel = null, shipAnim = null;
  const cargoBubEl = document.getElementById('cargoBubbles');
  const cargoOpen = () => S.level >= CARGO.openLevel;
  // each crate or barrel on the dock: { kind, lv }. S.cargo.boxes holds what's loaded, one entry per slot, then the star crate last.
  function cargoBoxes() { return [...S.cargo.slots.map(s => ({ kind: s.kind, lv: s.lv })), { kind: 'star' }]; }
  const nextBox = () => (S.cargo ? CARGO.more[S.cargo.slots.length - CARGO.start.length] : null) || null;   // the next one you can buy, or null
  function newStar() {
    const pool = ORDERS.wants.filter(w => ITEMS[w.item].kind !== 'crop' || unlockLevel('seed_' + w.item) <= S.level);
    const w = pool[Math.floor(Math.random() * pool.length)];
    return { item: w.item, n: Math.max(2, Math.min(5, w.n[0] + Math.floor(Math.random() * 3))) };
  }
  function ensureCargo() {
    if (!S.cargo) S.cargo = { slots: CARGO.start.map(kind => ({ kind, lv: 1 })), boxes: [], star: null, back: 0, payout: null };
    if (!S.cargo.slots) {   // a save from before v0.1.82: its bundle becomes single crates and barrels; ×10 was level 2, ×20 level 3
      const h = CARGO.holds[Math.min(S.cargo.hold || 0, CARGO.holds.length - 1)], lv = h.cap >= 20 ? 3 : 2;
      S.cargo.slots = [...Array(h.crates).fill('crate'), ...Array(h.barrels).fill('barrel')].map(kind => ({ kind, lv }));
      delete S.cargo.hold;
    }
    const n = S.cargo.slots.length + 1;
    // keep what's loaded when a crate is added; the star crate is always last
    const old = S.cargo.boxes || [], starLoad = old.length ? old[old.length - 1] : {};
    const body = old.slice(0, Math.max(0, old.length - 1));
    S.cargo.boxes = [...Array(n - 1)].map((_, i) => body[i] || {}).concat([starLoad || {}]);
    if (!S.cargo.star) S.cargo.star = newStar();
  }
  const boxCount = (b) => Object.values(b || {}).reduce((t, n) => t + n, 0);
  const capOf = (kind, i) => kind === 'star' ? S.cargo.star.n : CARGO.caps[(S.cargo.slots[i] ? S.cargo.slots[i].lv : 1) - 1];
  // crops in crates, fish in barrels, and one kind of thing per crate or barrel until it's empty again (Mac)
  const fits = (kind, id, b) => { const inIt = Object.keys(b || {}).filter(k => b[k] > 0); if (kind !== 'star' && inIt.length && !inIt.includes(id)) return false;
    return kind === 'star' ? id === S.cargo.star.item : kind === 'crate' ? ITEMS[id].kind === 'crop' : ITEMS[id].kind === 'fish'; };
  const shipAway = () => S.cargo && S.cargo.back > 0;
  const cargoLoaded = () => S.cargo && S.cargo.boxes.some(b => boxCount(b) > 0);
  // crates down both sides of the dock, small picture bubbles, and the full bubble on the crate you stand at (mockup C, v0.1.81); window.__cargoLab overrides for mockups
  const cargoLab = () => ({ zig: 1, sm: 1, focus: 1, gap: 1.15, ...(window.__cargoLab || {}) });
  function spotPos(p) { const L = cargoLab(); return { x: DOCK.x + (p % 2 ? -1 : 1) * (DOCK.half - 0.39), z: DOCK.zFar + 1.7 + p * L.gap }; }
  function boxPos(i) { return spotPos(S.cargo && i >= S.cargo.slots.length ? 0 : i + 1); }   // the star crate stands nearest the ship
  const nextPos = () => spotPos(S.cargo.slots.length + 1);
  function buildCargo() { cargoReady = true; refreshCargo(true); }
  function refreshCargo(first) {
    if (!cargoReady) return;
    const open = cargoOpen();
    if (open) ensureCargo();
    // the crates and barrels on the dock
    const kinds = open ? cargoBoxes().map(b => b.kind) : [], lvs = open ? cargoBoxes().map(b => b.lv || 0) : [];
    if (kinds.join() + lvs.join() !== cargoModels.map(o => o.userData.kind).join() + cargoModels.map(o => o.userData.lv).join()) {
      cargoModels.forEach(o => scene.remove(o)); cargoModels = [];
      kinds.forEach((k, i) => {
        const p = boxPos(i), o = place('pirate', k === 'barrel' ? 'barrel' : k === 'star' ? 'crate-bottles' : 'crate', p.x, p.z, { r: (i % 3 - 1) * 0.08, s: k === 'star' ? 0.62 : 0.5 + 0.07 * lvs[i] });   // a higher level is a bigger crate
        o.position.y = DOCK_FLOOR + 0.02; o.userData.kind = k; o.userData.lv = lvs[i]; cargoModels.push(o);
      });
      cargoBubEl.innerHTML = kinds.map((k, i) => `<div class="cb ${k}" data-i="${i}"><div class="cbb"></div><div class="cbt"></div></div>`).join('');
    }
    // the ship: at the dock, away, or sailing between
    if (A.merchant) {
      if (first) { const away = shipAway() && Date.now() < S.cargo.back; A.merchant.visible = !away; A.merchant.position.x = SHIP_AT.x; A.merchant.position.z = SHIP_AT.z; }
    }
    // the chest with your pay waits on the dock once the ship is back
    const showChest = open && S.cargo && S.cargo.payout && !shipAway();
    if (showChest && !chestModel) { chestModel = place('pirate', 'chest', DOCK.x - DOCK.half - 0.95, -2.7, { r: 0.4, s: 0.9 }); }   // on the sand by the foot of the dock, clear of the crate bubbles
    if (!showChest && chestModel) { scene.remove(chestModel); chestModel = null; }
    // the next crate or barrel you can buy: a see-through one in its spot, with a price bubble (mockup A)
    // only once you can buy it (your town level is there): no outline or price before that (Mac, v0.1.93)
    const nx0 = open && !shipAway() ? nextBox() : null, nb = nx0 && S.level >= nx0.level ? nx0 : null;
    if ((nb ? nb.kind : '') !== (ghostBox ? ghostBox.userData.kind : '') || (ghostBox && nb && ghostBox.userData.at !== S.cargo.slots.length)) {
      if (ghostBox) { scene.remove(ghostBox); ghostBox = null; }
      if (nb) {
        const q = nextPos(); ghostBox = place('pirate', nb.kind === 'barrel' ? 'barrel' : 'crate', q.x, q.z, { s: 0.5 });
        ghostBox.position.y = DOCK_FLOOR + 0.02; ghostBox.userData.kind = nb.kind; ghostBox.userData.at = S.cargo.slots.length;
        ghostBox.traverse(m => { if (m.isMesh) { m.material = ghostMat; m.castShadow = false; } });
      }
    }
    renderCargoBubbles();
  }
  let ghostBox = null;
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false });
  function boxIcon(kind, b) {
    if (kind === 'star') return `<span class="cstar">★</span>${itemIcon(S.cargo.star.item)}`;
    const top = Object.entries(b).sort((x, y) => y[1] - x[1])[0];
    return top ? itemIcon(top[0]) : `<span class="ic cbx">${svg(kind === 'barrel' ? 'barrel' : 'crate', '#8a5a34', 22)}</span>`;
  }
  function renderCargoBubbles() {
    if (!S.cargo) return;
    cargoBubEl.querySelectorAll('.cb').forEach(el => {
      const i = +el.dataset.i, k = el.classList.contains('star') ? 'star' : el.classList.contains('barrel') ? 'barrel' : 'crate';
      const b = S.cargo.boxes[i] || {}, n = boxCount(b), cap = capOf(k, i), full = n >= cap, lv = S.cargo.slots[i] ? S.cargo.slots[i].lv : 0;
      el.classList.toggle('full', full);
      el.querySelector('.cbb').innerHTML = `${boxIcon(k, b)}<span class="cbar"><i style="width:${Math.min(100, Math.round(100 * n / cap))}%"></i></span><b>${n}/${cap}</b>${full ? '<span class="cok">✓</span>' : ''}${lv ? `<span class="clv">${'<i></i>'.repeat(lv)}</span>` : ''}`;
    });
    const nb = nextBox(), nx = document.getElementById('cargoNext');
    if (nb) nx.querySelector('.cbb').innerHTML = `<span class="scoin"></span><b>${nb.cost.toLocaleString()}</b>`;   // a small price tag (the town level is already met when it shows)
    // the ship's pay, over the chest
    const pay = document.getElementById('cargoPay');
    const p = S.cargo.payout;
    pay.hidden = !(p && !shipAway());
    if (p) pay.querySelector('.cbb').innerHTML = `<span class="scoin"></span><b>+${p.coins.toLocaleString()}</b>${p.extra ? `<span class="cstar">★</span>${itemIcon(p.extra.item)}<b>×${p.extra.n}</b>` : ''}`;
  }
  const _cb = new THREE.Vector3();
  function placeBubble(el, x, y, z, lift, dx = 0) {
    _cb.set(x, y, z).project(camera);
    const on = _cb.z < 1 && Math.abs(_cb.x) < 1.1 && Math.abs(_cb.y) < 1.1;
    el.style.display = on ? '' : 'none';
    if (on) { el.style.left = ((_cb.x + 1) / 2 * innerWidth + dx) + 'px'; el.style.top = ((1 - _cb.y) / 2 * innerHeight - lift) + 'px'; }
  }
  // Debug (Mac, v0.1.103): watch the ship leave and come back without loading it. 5 seconds, sail out, 3 seconds away,
  // sail in. Same animation, speed and bell as a real trip; the save is not touched.
  let demo = null;
  function demoTrip() {
    if (!cargoReady || !A.merchant) return 'The ship is still loading';
    if (demo || shipAnim) return 'The ship is already moving';
    if (shipAway()) return 'The ship is away. Tap "Cargo: ship back now" first';
    demo = { stage: 'count', t: 5, was: A.merchant.visible, said: 6 }; A.merchant.visible = true; return '';
  }
  function tickDemo(dt) {
    if (!demo || shipAnim) return;
    demo.t -= dt;
    if (demo.stage === 'count') {
      const n = Math.ceil(demo.t); if (n < demo.said && n > 0) { demo.said = n; toast('Ship leaves in ' + n); }
      if (demo.t <= 0) { demo.stage = 'out'; audio.shipBell(); shipAnim = { t: 0, dur: 7, from: SHIP_AT, to: SHIP_OUT, done: () => { A.merchant.visible = false; demo.stage = 'gone'; demo.t = 3; } }; }
    } else if (demo.stage === 'gone' && demo.t <= 0) {
      demo.stage = 'in'; A.merchant.visible = true; audio.shipBell();
      shipAnim = { t: 0, dur: 7, from: SHIP_IN, to: SHIP_AT, done: () => { A.merchant.visible = demo.was; demo = null; toast('Ship is back'); } };
    }
  }
  function tickCargo(dt) {
    if (!cargoReady) return;
    tickDemo(dt);
    // the trip: once it's time, the ship sails back in and the pay waits in a chest on the dock
    if (shipAway() && Date.now() >= S.cargo.back && !shipAnim && !demo) {
      S.cargo.back = 0; commit();
      A.merchant.visible = true; audio.shipBell(); shipAnim = { t: 0, dur: 7, from: SHIP_IN, to: SHIP_AT, done: () => { refreshCargo(); toast('The cargo ship is back! Your pay is on the dock.'); } };
    }
    waterUniforms.uRing.value = A.merchant && A.merchant.visible && !shipAnim ? 1 : 0;   // rings only around the ship at rest
    if (shipAnim) {
      shipAnim.t += dt; const k = Math.min(1, shipAnim.t / shipAnim.dur), e = k * k * (3 - 2 * k);
      A.merchant.position.x = shipAnim.from.x + (shipAnim.to.x - shipAnim.from.x) * e;
      A.merchant.position.z = shipAnim.from.z + (shipAnim.to.z - shipAnim.from.z) * e;
      // sails drop as it casts off, and roll back up as it ties up
      furlSails(A.merchant, shipAnim.to === SHIP_AT ? Math.max(0, (k - 0.75) * 4) : Math.max(0, 1 - k * 4));
      if (k >= 1) { const d = shipAnim.done; shipAnim = null; if (d) d(); }
    }
    // bubbles over the crates when you're down by the harbor
    const near = cargoOpen() && S.cargo && player.pos.z < 1.5 && Math.abs(player.pos.x - DOCK.x) < 9 && !decor.on && farm.mode === 'off';
    cargoBubEl.hidden = !near;
    if (near) cargoBubEl.querySelectorAll('.cb').forEach(el => { const p = boxPos(+el.dataset.i); placeBubble(el, p.x, DOCK_FLOOR + 0.75, p.z, 0, cargoLab().sm ? 0 : cargoLab().zig ? (+el.dataset.i % 2 ? -1 : 1) * 30 : (+el.dataset.i % 2 ? 1 : -1) * 44); if (parseFloat(el.style.top) > innerHeight - 100) el.style.display = 'none'; });   // never over the toolbar
    cargoBubEl.classList.toggle('sm', !!cargoLab().sm);
    if (near && cargoLab().focus) { const at = A.tool() === 'rod' ? null : nearCargo(); cargoBubEl.querySelectorAll('.cb').forEach(el => el.classList.toggle('big', +el.dataset.i === at)); }   // staggered so the row doesn't stack up
    const nx = document.getElementById('cargoNext'); nx.hidden = !(near && ghostBox && Math.hypot(nextPos().x - player.pos.x, nextPos().z - player.pos.z) < 3.5);   // the price shows when you walk up to it
    if (!nx.hidden) { const q = nextPos(); placeBubble(nx, q.x, DOCK_FLOOR + 0.8, q.z, 0); }
    const pay = document.getElementById('cargoPay');
    if (!pay.hidden && chestModel) placeBubble(pay, chestModel.position.x, chestModel.position.y + 0.9, chestModel.position.z, 0);
    if (!near) pay.style.display = 'none';
  }
  function nearCargo() {
    if (!cargoOpen() || !S.cargo || !onDock(player.pos.x, player.pos.z)) return null;
    let best = null, bd = 1.0;
    cargoBoxes().forEach((b, i) => { const p = boxPos(i), d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function nearNextBox() { if (!ghostBox || !onDock(player.pos.x, player.pos.z)) return false; const q = nextPos(); return Math.hypot(q.x - player.pos.x, q.z - player.pos.z) < 1.0; }
  function nearChest() { return chestModel && Math.hypot(chestModel.position.x - player.pos.x, chestModel.position.z - player.pos.z) < 1.4; }
  // --- loading sheet ---
  let cargoAt = 0;
  function openCargo(i) { cargoAt = i; renderCargo(); openSheet('cargoSheet'); }
  function renderCargo() {
    const kind = cargoBoxes()[cargoAt].kind, b = S.cargo.boxes[cargoAt], n = boxCount(b), cap = capOf(kind, cargoAt), slot = S.cargo.slots[cargoAt];
    const title = kind === 'star' ? 'Star crate' : `${kind === 'barrel' ? 'Barrel' : 'Crate'} <span class="cglv">Level ${slot.lv}<span class="clv">${'<i></i>'.repeat(slot.lv)}${'<i class="off"></i>'.repeat(CARGO.caps.length - slot.lv)}</span></span>`;
    document.getElementById('cgIcon').innerHTML = kind === 'star' ? `<span class="cstar big">★</span>` : svg(kind === 'barrel' ? 'barrel' : 'crate', '#8a5a34', 30);
    document.getElementById('cgTitle').innerHTML = title;
    document.getElementById('cgBar').innerHTML = `<span class="cbar"><i style="width:${Math.min(100, Math.round(100 * n / cap))}%"></i></span><b>${n}/${cap}</b>`;
    document.getElementById('cgHint').innerHTML = kind === 'star' ? `Wants ${S.cargo.star.n} ${ITEMS[S.cargo.star.item].name}. Fill it for a treasure chest!` : n ? `This one is for ${ITEMS[Object.keys(b).find(k => b[k] > 0)].name} until it\u2019s empty again. Tap to drop one in, hold to fill it.` : kind === 'barrel' ? 'One kind of fish per barrel. Tap to drop one in, hold to fill it.' : 'One kind of crop per crate. Tap to drop one in, hold to fill it.';
    const mine = Object.keys(S.inv).filter(id => ITEMS[id] && S.inv[id] > 0 && fits(kind, id, b));
    document.getElementById('cgHave').innerHTML = mine.length ? mine.map(id => `<button class="cgt" data-add="${id}">${itemIcon(id)}<b>×${S.inv[id]}</b></button>`).join('')
      : `<div class="cgnone">${kind === 'star' ? `You don't have any ${ITEMS[S.cargo.star.item].name} yet` : n ? 'Nothing more of that kind in your bag' : kind === 'barrel' ? 'No fish in your bag' : 'No crops in your bag'}</div>`;
    const inIt = Object.keys(b).filter(id => b[id] > 0);
    document.getElementById('cgIn').innerHTML = inIt.length ? inIt.map(id => `<button class="cgt in" data-take="${id}">${itemIcon(id)}<b>×${b[id]}</b></button>`).join('') : '<div class="cgnone">Empty</div>';
    const send = document.getElementById('cgSend'), away = shipAway();
    send.disabled = away || !cargoLoaded() || !!S.cargo.payout;
    send.textContent = away ? `The ship is away · back in ${fmtTrip(S.cargo.back - Date.now())}` : S.cargo.payout ? 'Collect your pay first' : 'Send the ship ⛵';
    // level up this crate or barrel: coins + a town level
    const up = document.getElementById('cgUp'), lu = slot ? CARGO.levelUp[slot.lv - 1] : null;
    up.hidden = !lu;
    if (lu) { const lvOK = S.level >= lu.level, coinOK = S.coins >= lu.cost; up.disabled = !lvOK || !coinOK;
      up.innerHTML = `<b>Level ${slot.lv + 1}</b><small>${!lvOK ? `town level ${lu.level}` : `holds ${CARGO.caps[slot.lv]}`}</small><span class="cgcost"><span class="scoin sm"></span>${lu.cost}</span>`; }
  }
  function fmtTrip(ms) { const s = Math.max(0, Math.ceil(ms / 1000)), mn = Math.ceil(s / 60); return s < 60 ? s + 's' : mn >= 60 ? `${Math.floor(mn / 60)}h ${mn % 60}m` : `${mn}m`; }
  function cargoAdd(id, all) {
    const kind = cargoBoxes()[cargoAt].kind, b = S.cargo.boxes[cargoAt];
    if (!fits(kind, id, b)) return;
    let room = capOf(kind, cargoAt) - boxCount(b); if (room <= 0) { toast('It’s full'); return; }
    const k = Math.min(all ? room : 1, invCount(id)); if (k <= 0) return;
    addItem(id, -k); b[id] = (b[id] || 0) + k;
    renderCargo(); renderCargoBubbles(); commit();
  }
  function cargoTake(id) {
    const b = S.cargo.boxes[cargoAt]; if (!b[id]) return;
    b[id]--; if (!b[id]) delete b[id]; addItem(id, 1);
    renderCargo(); renderCargoBubbles(); commit();
  }
  {
    let holdT = null, held = false;
    const have = document.getElementById('cgHave');
    have.addEventListener('pointerdown', (e) => { const t = e.target.closest('[data-add]'); if (!t) return; held = false; holdT = setTimeout(() => { held = true; cargoAdd(t.dataset.add, true); }, 450); });
    const stop = () => { clearTimeout(holdT); holdT = null; };
    have.addEventListener('pointerup', stop); have.addEventListener('pointerleave', stop); have.addEventListener('pointercancel', stop);
    have.addEventListener('click', (e) => { const t = e.target.closest('[data-add]'); if (!t) return; if (held) { held = false; return; } cargoAdd(t.dataset.add, false); });
    document.getElementById('cgIn').addEventListener('click', (e) => { const t = e.target.closest('[data-take]'); if (t) cargoTake(t.dataset.take); });
  }
  document.getElementById('cgSend').addEventListener('click', () => {
    if (shipAway() || !cargoLoaded() || S.cargo.payout) return;
    let value = 0;
    S.cargo.boxes.forEach(b => { for (const [id, n] of Object.entries(b)) value += ITEMS[id].price * n; });
    const starFull = boxCount(S.cargo.boxes[S.cargo.boxes.length - 1]) >= S.cargo.star.n;
    S.cargo.payout = { coins: Math.max(5, Math.round(value * CARGO.payMult)), extra: starFull ? chestPrize() : null };
    S.cargo.boxes = S.cargo.boxes.map(() => ({}));
    const ms = settings.debug && settings.fastCrops ? CARGO.debugTripSeconds * 1000 : CARGO.tripMinutes * 60000;
    S.cargo.back = Date.now() + ms;
    document.getElementById('cargoSheet').hidden = true;
    audio.shipBell(); shipAnim = { t: 0, dur: 7, from: SHIP_AT, to: SHIP_OUT, done: () => { A.merchant.visible = false; } };
    refreshCargo(); commit();
    toast(`The ship sets sail! Back in ${fmtTrip(ms)}.`);
  });
  function chestPrize() {
    const seeds = CROP_ORDER.map(c => CROPS[c].seed).filter(s => unlockLevel(s) <= S.level);
    const opts = [{ item: seeds[Math.floor(Math.random() * seeds.length)], n: 5 }, { item: 'shrimp', n: 5 }, { item: 'decor_' + DECOR_ORDER[Math.floor(Math.random() * DECOR_ORDER.length)], n: 1 }];
    if (unlockLevel('lure') <= S.level) opts.push({ item: 'lure', n: 1 });
    return opts[Math.floor(Math.random() * opts.length)];
  }
  function collectCargo() {
    const p = S.cargo && S.cargo.payout; if (!p) return;
    S.coins += p.coins; audio.play('coins'); if (p.extra) addItem(p.extra.item, p.extra.n);
    S.cargo.payout = null; S.cargo.star = newStar();
    addXP(XP.order);
    refreshCargo(); commit();
    toast(`+${p.coins.toLocaleString()} coins${p.extra ? ` and ${p.extra.n} × ${ITEMS[p.extra.item].name}` : ''}!`);
  }
  // --- level up a crate or barrel, and buy the next one for the dock (coins + town level, like the lots) ---
  document.getElementById('cgUp').addEventListener('click', () => {
    const slot = S.cargo.slots[cargoAt], lu = slot && CARGO.levelUp[slot.lv - 1]; if (!lu || S.level < lu.level || S.coins < lu.cost) return;
    audio.play('buy'); S.coins -= lu.cost; slot.lv++; refreshCargo(); renderCargo(); commit();
    toast(`${slot.kind === 'barrel' ? 'Barrel' : 'Crate'} level ${slot.lv}! It holds ${CARGO.caps[slot.lv - 1]} now.`);
  });
  function renderHold() {
    const nb = nextBox(), b = document.getElementById('hdBuy'); if (!nb) { b.disabled = true; return; }
    const name = nb.kind === 'barrel' ? 'barrel' : 'crate';
    document.getElementById('hdTitle').textContent = `A new ${name}`;
    document.getElementById('hdGreet').textContent = `One more ${name} for the dock. It starts at level 1 and holds ${CARGO.caps[0]} ${nb.kind === 'barrel' ? 'fish' : 'crops'} of one kind.`;
    document.getElementById('hdList').innerHTML = `<div class="hdrow"><span class="hdpics">${svg(name, '#8a5a34', 30)}</span><b class="hdcap">×${CARGO.caps[0]}</b><span class="hdr"><span class="scoin sm"></span><b>${nb.cost.toLocaleString()}</b><span class="hdlv${S.level >= nb.level ? ' ok' : ''}">${nb.level}</span></span></div>`;
    const lvOK = S.level >= nb.level, coinOK = S.coins >= nb.cost;
    b.disabled = !lvOK || !coinOK;
    b.textContent = !lvOK ? `Reach town level ${nb.level}` : !coinOK ? `Need ${(nb.cost - S.coins).toLocaleString()} more` : `Buy for ${nb.cost.toLocaleString()}`;
  }
  document.getElementById('hdBuy').addEventListener('click', () => {
    const nb = nextBox(); if (!nb || S.level < nb.level || S.coins < nb.cost) return;
    audio.play('buy'); S.coins -= nb.cost; S.cargo.slots.push({ kind: nb.kind, lv: 1 }); ensureCargo(); refreshCargo(); commit();
    document.getElementById('holdSheet').hidden = true;
    toast(`A new ${nb.kind === 'barrel' ? 'barrel' : 'crate'} on the dock!`);
  });


  return { build: buildCargo, refresh: refreshCargo, ensure: ensureCargo, tick: tickCargo, open: openCargo, collect: collectCargo, renderHold,
    nearBox: nearCargo, nearNextBox, nearChest, boxes: cargoBoxes, capOf,
    ready: () => cargoReady, sailing: () => !!shipAnim, stopSailing: () => { shipAnim = null; demo = null; }, demoTrip };
}
