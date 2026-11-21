// Tidewell — where the cast will land, and a hand that teaches tapping the water (Mac, v0.1.129, mockup C).
// While you hold the rod by the water: a yellow ring with a bobber sits where the Cast button will land. On your first
// casts a pointing hand taps another spot on the water, until you've cast by tapping the water yourself.
const CSS = `
#aimSpot, #aimHand { position: fixed; left: 0; top: 0; z-index: 4; pointer-events: none; }
#aimSpot[hidden], #aimHand[hidden] { display: none; }
#aimSpot i, #aimHand i { position: absolute; left: 0; top: 0; border-radius: 50%; transform: translate(-50%, -50%); box-sizing: border-box; }
#aimSpot i { border: 4px solid rgba(255,210,63,.95); width: 60px; height: 33px; }
#aimSpot i + i { border-color: rgba(255,210,63,.4); width: 92px; height: 50px; animation: aimPulse 1.6s ease-in-out infinite; }
#aimSpot b { position: absolute; left: -9px; top: -18px; width: 18px; height: 24px; box-sizing: border-box; border: 3px solid #2b2140; border-radius: 50%/60% 60% 40% 40%; background: linear-gradient(#e5484d 50%, #fff 50%); }
#aimHand i { border: 4px solid rgba(255,255,255,.95); width: 52px; height: 29px; animation: aimTap 1.3s ease-out infinite; }
#aimHand i + i { border-color: rgba(255,255,255,.5); width: 88px; height: 48px; animation-delay: .18s; }
#aimHand img { position: absolute; left: 6px; top: 4px; width: 62px; transform: rotate(-120deg); transform-origin: 30% 50%; filter: drop-shadow(0 3px 0 rgba(43,33,64,.35)); animation: aimPoke 1.3s ease-in-out infinite; }
@keyframes aimPulse { 50% { opacity: .35; } }
@keyframes aimTap { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.5); } 30% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1.15); } }
@keyframes aimPoke { 0%, 100% { translate: 8px 10px; } 25% { translate: 0 0; } 50% { translate: 8px 10px; } }
`;
export function createAimHint({ THREE, camera, handSrc }) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const spot = document.createElement('div'); spot.id = 'aimSpot'; spot.hidden = true; spot.innerHTML = '<i></i><i></i><b></b>'; document.body.appendChild(spot);
  const hand = document.createElement('div'); hand.id = 'aimHand'; hand.hidden = true; hand.innerHTML = `<i></i><i></i><img src="${handSrc}" alt="">`; document.body.appendChild(hand);
  const v = new THREE.Vector3();
  const scr = (p, y) => { v.set(p.x, y, p.z).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, v.z < 1]; };
  const onScreen = (x, y) => x > 50 && x < innerWidth - 50 && y > 130 && y < innerHeight - 250;
  return {
    onScreen: (p, y) => { const [x, yy, ok] = scr(p, y); return ok && onScreen(x, yy); },
    inView: (p, y) => { const [x, yy, ok] = scr(p, y); return ok && x > 34 && x < innerWidth - 34 && yy > 110 && yy < innerHeight - 200; },
    // target: where Cast lands (or null to hide everything) · tapAt: where the hand taps (or null) · y: the water's height
    update(target, tapAt, y) {
      let show = false;
      if (target) { const [x, yy, ok] = scr(target, y); show = ok && x > 10 && x < innerWidth - 10 && yy > 60 && yy < innerHeight - 120; if (show) spot.style.transform = `translate(${Math.round(x)}px,${Math.round(yy)}px)`; }
      if (spot.hidden === show) spot.hidden = !show;
      let h = false;
      if (target && tapAt) { const [x, yy, ok] = scr(tapAt, y); h = ok && onScreen(x, yy); if (h) hand.style.transform = `translate(${Math.round(x)}px,${Math.round(yy)}px)`; }
      if (hand.hidden === h) hand.hidden = !h;
    },
  };
}
