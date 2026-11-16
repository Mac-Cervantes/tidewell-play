// Character looks (decision 62): paints the Kenney character skin atlas from a look. Same file as tools/kenney-skin-painter.js.
// Paints a Kenney "characterMedium" skin atlas (1024x1024) from a look description.
// Regions (atlas px): head 0..639 x 0..489 (face front ~x256..512), torso/shirt 0..639 x 490..1023
// (sleeves at both edges), shoe tops 639..824 x 134..524, hands 824..1023 x 134..524,
// soles 639..1023 x 0..134, arms/legs skin 639..1023 x 524..764, pants 611..1023 x 764..1023.
export const SKIN = ['#ffd9c2', '#f5b48f', '#f59474', '#d9825b', '#b4643f', '#7a4128'];
export const HAIR_COLORS = ['#2a1712', '#4d2414', '#8a4a22', '#d89a4a', '#f2d27a', '#c8452c', '#9aa3ad', '#3f63b8', '#e07ab0'];
export const CLOTH = ['#f2654c', '#ffb43a', '#ffe08a', '#7cc957', '#3aa587', '#3e8fe0', '#2a4e8a', '#8a63d2', '#e8846a', '#ffffff', '#9a9a9a', '#2b2b2b'];

const shade = (hex, k) => {   // k<1 darker, >1 lighter
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(k < 1 ? c * k : c + (255 - c) * (k - 1))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
};

// hair shapes in head-region coordinates (640 x 490). The face sits around x 320, eyes y ~215.
function hairPath(ctx, style) {
  ctx.beginPath();
  const top = () => { ctx.moveTo(0, 0); ctx.lineTo(640, 0); };
  if (style === 'buzz') { ctx.rect(0, 0, 640, 120); return; }
  if (style === 'short') {   // side part
    top(); ctx.lineTo(640, 290); ctx.quadraticCurveTo(560, 300, 470, 240); ctx.lineTo(430, 150);
    ctx.quadraticCurveTo(360, 120, 300, 150); ctx.quadraticCurveTo(240, 175, 215, 150); ctx.lineTo(170, 240);
    ctx.quadraticCurveTo(80, 300, 0, 290); ctx.closePath(); return;
  }
  if (style === 'bangs') {   // straight fringe
    top(); ctx.lineTo(640, 330); ctx.quadraticCurveTo(560, 330, 470, 260); ctx.lineTo(450, 170); ctx.lineTo(190, 170);
    ctx.lineTo(170, 260); ctx.quadraticCurveTo(80, 330, 0, 330); ctx.closePath(); return;
  }
  if (style === 'bob') {
    top(); ctx.lineTo(640, 400); ctx.lineTo(430, 400); ctx.lineTo(425, 250); ctx.quadraticCurveTo(410, 150, 330, 150); ctx.quadraticCurveTo(250, 150, 225, 190);
    ctx.lineTo(215, 400); ctx.lineTo(0, 400); ctx.closePath(); return;
  }
  if (style === 'long') {
    top(); ctx.lineTo(640, 490); ctx.lineTo(422, 490); ctx.lineTo(420, 210); ctx.quadraticCurveTo(400, 160, 320, 145); ctx.quadraticCurveTo(240, 160, 220, 210);
    ctx.lineTo(218, 490); ctx.lineTo(0, 490); ctx.closePath(); return;
  }
  if (style === 'spiky') {
    top(); ctx.lineTo(640, 270); ctx.lineTo(470, 230); ctx.lineTo(440, 150);
    for (let x = 440, i = 0; x > 200; x -= 40, i++) ctx.lineTo(x - 20, i % 2 ? 150 : 185);
    ctx.lineTo(200, 150); ctx.lineTo(170, 230); ctx.lineTo(0, 270); ctx.closePath(); return;
  }
  ctx.rect(0, 0, 640, 60);   // 'bald'
}

function face(ctx, f, skin) {
  const ink = '#2b1a1a', cx = 320, ey = 215;
  ctx.save();
  // brows
  ctx.strokeStyle = f.browColor || ink; ctx.lineWidth = 9; ctx.lineCap = 'round';
  const bw = f.brows === 'thick' ? 13 : 8; ctx.lineWidth = bw;
  for (const s of [-1, 1]) { ctx.beginPath(); const x = cx + s * 38; ctx.moveTo(x - 16, ey - 30 + (f.brows === 'angry' ? -s * 0 : 0)); ctx.quadraticCurveTo(x, f.brows === 'angry' ? ey - 26 : ey - 40, x + 16, f.brows === 'angry' ? ey - 22 : ey - 32); ctx.stroke(); }
  // eyes
  ctx.fillStyle = ink;
  for (const s of [-1, 1]) {
    const x = cx + s * 38;
    if (f.eyes === 'happy') { ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(x, ey + 6, 12, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    else if (f.eyes === 'sleepy') { ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x - 13, ey); ctx.lineTo(x + 13, ey); ctx.stroke(); }
    else { ctx.beginPath(); ctx.ellipse(x, ey, 10, f.eyes === 'big' ? 17 : 13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + 3, ey - 5, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = ink; }
  }
  // cheeks + freckles
  if (f.blush) { ctx.fillStyle = 'rgba(240,90,90,0.28)'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * 62, ey + 32, 18, 11, 0, 0, Math.PI * 2); ctx.fill(); } }
  if (f.freckles) { ctx.fillStyle = shade(skin, 0.75); for (const s of [-1, 1]) for (const [dx, dy] of [[52, 26], [64, 34], [76, 26], [60, 18]]) { ctx.beginPath(); ctx.arc(cx + s * dx, ey + dy, 3.5, 0, Math.PI * 2); ctx.fill(); } }
  // nose
  ctx.fillStyle = shade(skin, 0.86); ctx.beginPath(); ctx.ellipse(cx, ey + 26, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
  // mouth
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 7;
  const my = ey + 52;
  if (f.mouth === 'grin') { ctx.beginPath(); ctx.moveTo(cx - 20, my - 4); ctx.quadraticCurveTo(cx, my + 22, cx + 20, my - 4); ctx.closePath(); ctx.fill(); }
  else if (f.mouth === 'o') { ctx.beginPath(); ctx.ellipse(cx, my, 7, 9, 0, 0, Math.PI * 2); ctx.fill(); }
  else if (f.mouth === 'flat') { ctx.beginPath(); ctx.moveTo(cx - 13, my); ctx.lineTo(cx + 13, my); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(cx - 17, my - 3); ctx.quadraticCurveTo(cx, my + 12, cx + 17, my - 3); ctx.stroke(); }
  // facial hair
  if (f.beard === 'mustache') { ctx.fillStyle = f.browColor || ink; ctx.beginPath(); ctx.moveTo(cx - 34, my - 4); ctx.quadraticCurveTo(cx, my - 30, cx + 34, my - 4); ctx.quadraticCurveTo(cx, my - 14, cx - 34, my - 4); ctx.fill(); }
  if (f.beard === 'beard') { ctx.fillStyle = f.browColor || ink; ctx.beginPath(); ctx.moveTo(cx - 90, ey + 10); ctx.quadraticCurveTo(cx - 80, my + 70, cx, my + 80); ctx.quadraticCurveTo(cx + 80, my + 70, cx + 90, ey + 10);
    ctx.lineTo(cx + 70, ey + 20); ctx.quadraticCurveTo(cx + 40, my + 2, cx, my - 18); ctx.quadraticCurveTo(cx - 40, my + 2, cx - 70, ey + 20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(skin, 0.9); ctx.beginPath(); ctx.ellipse(cx, my + 4, 16, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = ink; ctx.beginPath(); ctx.moveTo(cx - 12, my + 3); ctx.lineTo(cx + 12, my + 3); ctx.stroke(); }
  ctx.restore();
}

// repeating patterns on the torso and sleeves (y 490..1023), drawn in color c2 over the top color
function pattern(ctx, kind, c2, c1) {
  ctx.save(); ctx.beginPath(); ctx.rect(0, 490, 640, 534); ctx.clip(); ctx.fillStyle = c2; ctx.strokeStyle = c2;
  if (kind === 'dots') for (let y = 510, r = 0; y < 1024; y += 44, r++) for (let x = (r % 2) * 26 + 10; x < 640; x += 52) { ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill(); }
  if (kind === 'check') { ctx.globalAlpha = 0.55; for (let x = 0; x < 640; x += 54) ctx.fillRect(x, 490, 27, 534); for (let y = 490; y < 1024; y += 54) ctx.fillRect(0, y, 640, 27); }
  if (kind === 'stars') for (let y = 520, r = 0; y < 1024; y += 60, r++) for (let x = (r % 2) * 36 + 18; x < 640; x += 72) {
    ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, q = i % 2 ? 7 : 16; ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } ctx.closePath(); ctx.fill(); }
  if (kind === 'flowers') for (let y = 520, r = 0; y < 1024; y += 64, r++) for (let x = (r % 2) * 38 + 20; x < 640; x += 76) {
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 10, y + Math.sin(a) * 10, 8, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = c2; }
  ctx.restore();
}

// look = { skin, hair, hairColor, eyes, brows, mouth, blush, freckles, beard,
//          top: 'tee'|'long'|'tank'|'stripe'|'overalls'|'hoodie'|'raincoat'|'sweater'|'dungarees'|'dress'|'sundress', topColor, topColor2,
//          pattern: 'dots'|'check'|'stars'|'flowers' (in topColor2), bottom: 'pants'|'shorts'|'rolled'|'skirt', bottomColor, shoes, shoeStyle: 'boots',
//          hat, hatColor, hatColor2 }   hats, skirts and hoods are 3D pieces (src/wear3d.js). Every new key is optional, so older saved looks paint as before.
export function paintSkin(canvas, look) {
  const ctx = canvas.getContext('2d'), W = 1024;
  canvas.width = canvas.height = W;
  const skin = look.skin || SKIN[2];
  if (look.blank) {   // the plain white dummy: no face, hair or clothes
    ctx.fillStyle = look.blank === true ? '#f6f4ef' : look.blank; ctx.fillRect(0, 0, W, W);
    ctx.fillStyle = 'rgba(43,33,64,0.10)'; ctx.fillRect(639, 0, 385, 134);   // soles a touch darker
    return canvas;
  }
  ctx.fillStyle = skin; ctx.fillRect(0, 0, W, W);
  // soft skin shading on the neck area
  ctx.fillStyle = shade(skin, 0.95); ctx.fillRect(230, 300, 180, 190);
  // hair
  ctx.fillStyle = look.hairColor; hairPath(ctx, look.hair || 'short'); ctx.fill();
  ctx.fillStyle = shade(look.hairColor, 1.12); ctx.fillRect(0, 0, 640, 18);
  face(ctx, { ...look, browColor: look.beard || look.hair === 'buzz' || look.hair === 'bald' ? shade(look.hairColor, 0.9) : look.hairColor === '#f2d27a' ? '#8a5a2a' : shade(look.hairColor, 0.8) }, skin);
  // top (torso band). Sleeves are the outer columns (0..160, 483..639).
  const tc = look.topColor, t2 = look.topColor2 || shade(tc, 0.85), top = look.top || 'tee';
  const bib = top === 'overalls' || top === 'dungarees', dress = top === 'dress' || top === 'sundress';
  ctx.fillStyle = tc; ctx.fillRect(0, 490, 640, 534);
  // the outer columns are the forearms: bare for tees, covered for long sleeves
  const shortSleeve = top === 'tee' || top === 'stripe' || bib || top === 'dress', noSleeve = top === 'sundress';
  if (top === 'stripe') { ctx.fillStyle = t2; for (let y = 520; y < 1024; y += 64) ctx.fillRect(160, y, 323, 28); }
  // patterns (dots, checks, flowers, stars) in the second color; they stop at the sleeve ends
  if (look.pattern && !bib) pattern(ctx, look.pattern, t2, tc);
  if (shortSleeve) { ctx.fillStyle = skin; ctx.fillRect(0, 490, 160, 534); ctx.fillRect(483, 490, 157, 534); }
  if (noSleeve) {   // bare arms and shoulders, with two straps over the top
    ctx.fillStyle = skin; ctx.fillRect(0, 490, 215, 534); ctx.fillRect(430, 490, 210, 534);
    ctx.beginPath(); ctx.ellipse(322, 754, 100, 86, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = tc; ctx.fillRect(258, 664, 26, 186); ctx.fillRect(360, 664, 26, 186);
  }
  // back of the shirt is y 490..760, the front is y 760..1023
  if (bib) { ctx.fillStyle = t2; ctx.fillRect(225, 880, 190, 144); ctx.fillRect(160, 980, 323, 44);
    const sx = top === 'dungarees' ? [270, 348, 26] : [235, 375, 30];   // strap left x, right x, width: dungaree straps run straight up by the neck (Mac)
    ctx.fillRect(sx[0], 760, sx[2], 130); ctx.fillRect(sx[1], 760, sx[2], 130); ctx.fillRect(sx[0], 490, sx[2], 270); ctx.fillRect(sx[1], 490, sx[2], 270);
    ctx.fillStyle = '#ffd36a'; for (const x of [sx[0] + sx[2] / 2, sx[1] + sx[2] / 2]) { ctx.beginPath(); ctx.arc(x, 892, 11, 0, Math.PI * 2); ctx.fill(); }
    if (top === 'dungarees') { ctx.strokeStyle = shade(t2, 0.75); ctx.lineWidth = 6; ctx.strokeRect(282, 925, 80, 60);
      ctx.fillStyle = t2; ctx.fillRect(160, 490, 323, 70); ctx.fillRect(160, 954, 323, 70); } }   // a low back panel up from the waist (the back runs from the hips at 490 up to the neck at 760; Mac picked "low back")
  const dark = shade(tc, 0.82), cuffs = () => { ctx.fillStyle = dark; ctx.fillRect(0, 490, 46, 534); ctx.fillRect(594, 490, 46, 534); ctx.fillRect(160, 996, 323, 28); ctx.fillRect(160, 490, 323, 22); };
  if (top === 'hoodie') {
    cuffs();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(272, 920); ctx.lineTo(372, 920); ctx.lineTo(398, 992); ctx.lineTo(246, 992); ctx.closePath(); ctx.fill();   // pouch pocket
    ctx.strokeStyle = dark; ctx.lineWidth = 16; ctx.beginPath(); ctx.ellipse(322, 754, 62, 52, 0, 0, Math.PI * 2); ctx.stroke();                                 // hood seam
    ctx.strokeStyle = '#fffcf4'; ctx.lineWidth = 7; ctx.lineCap = 'round'; for (const x of [302, 342]) { ctx.beginPath(); ctx.moveTo(x, 808); ctx.lineTo(x, 872); ctx.stroke(); }   // drawstrings
  }
  if (top === 'raincoat') {
    cuffs();
    ctx.fillStyle = dark; ctx.fillRect(318, 800, 8, 224); ctx.fillRect(236, 940, 58, 12); ctx.fillRect(350, 940, 58, 12);   // front opening and pocket flaps
    ctx.fillStyle = shade(tc, 1.25); ctx.beginPath(); ctx.ellipse(322, 754, 70, 58, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(322, 754, 40, 32, 0, 0, Math.PI * 2); ctx.fill();   // collar
    ctx.fillStyle = '#2b2140'; for (const y of [836, 896, 956]) { ctx.beginPath(); ctx.arc(340, y, 9, 0, Math.PI * 2); ctx.fill(); }
  }
  if (top === 'sweater') {   // fisherman's sweater: cable columns, ribbed hem and cuffs, a thick collar
    const hi = shade(tc, 1.35), lo = shade(tc, 0.84);
    for (const x of [214, 268, 322, 376, 430]) for (let y = 490; y < 1024; y += 30) {
      ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.strokeStyle = lo; ctx.beginPath(); ctx.moveTo(x - 11, y); ctx.lineTo(x + 11, y + 24); ctx.stroke();
      ctx.strokeStyle = hi; ctx.beginPath(); ctx.moveTo(x + 11, y); ctx.lineTo(x - 11, y + 24); ctx.stroke();
    }
    ctx.fillStyle = lo; for (const x of [241, 295, 349, 403]) ctx.fillRect(x - 2, 490, 4, 534);
    for (let x = 0; x < 640; x += 14) { ctx.fillRect(x, 996, 5, 28); ctx.fillRect(x, 490, 5, 22); }
    for (let y = 496; y < 1024; y += 14) { ctx.fillRect(0, y, 46, 5); ctx.fillRect(594, y, 46, 5); }
    ctx.strokeStyle = hi; ctx.lineWidth = 22; ctx.beginPath(); ctx.ellipse(322, 754, 52, 44, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // collar
  if (top !== 'sweater' && top !== 'raincoat' && top !== 'dungarees' && !noSleeve) { ctx.fillStyle = shade(tc, 0.85); ctx.fillRect(160, 490, 324, 14); }   // (this strip lands on the back of the waist: left off the dungarees so no shirt shows through them, Mac)
  // pants / shorts (legs region; y runs from the hips at 764 down to the ankles at 1023)
  const bc = look.bottomColor || '#2a4e8a';
  ctx.fillStyle = bib ? t2 : bc; ctx.fillRect(611, 764, 413, 260);
  if (look.bottom === 'shorts' || top === 'dungarees') { ctx.fillStyle = skin; ctx.fillRect(611, 900, 413, 124); }
  if (look.bottom === 'rolled' && !bib) { ctx.fillStyle = shade(bc, 1.3); ctx.fillRect(611, 946, 413, 22); ctx.fillStyle = skin; ctx.fillRect(611, 968, 413, 56); }
  if (dress || (look.bottom === 'skirt' && !bib)) {   // bare legs under a skirt, with short bloomers in a darker shade
    const kc = dress ? tc : bc;
    ctx.fillStyle = skin; ctx.fillRect(611, 764, 413, 260); ctx.fillStyle = shade(kc, 0.8); ctx.fillRect(611, 764, 413, 70);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(611, 764, 413, 14);
  if (look.shoeStyle === 'boots') { ctx.fillStyle = look.shoes || '#ffd23a'; ctx.fillRect(611, 952, 413, 72); ctx.fillStyle = shade(look.shoes || '#ffd23a', 0.8); ctx.fillRect(611, 952, 413, 10); }   // rain boots up the calf
  // shoes: tops + soles
  const sc = look.shoes || '#ffffff';
  ctx.fillStyle = '#d7e3ea'; ctx.fillRect(639, 134, 185, 390);
  for (const y of [150, 325]) { ctx.fillStyle = sc; ctx.beginPath(); ctx.roundRect(668, y, 130, 150, 18); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; if (look.shoeStyle !== 'boots') for (let i = 0; i < 3; i++) ctx.fillRect(712, y + 52 + i * 18, 44, 7); }
  if (look.shoeStyle === 'boots') { ctx.fillStyle = sc; ctx.fillRect(639, 134, 185, 390); }
  ctx.fillStyle = shade(sc, 0.7); ctx.fillRect(639, 0, 385, 134);
  return canvas;
}
