// Tidewell — character animation (try/run). Everything that decides how a body walks, runs and
// idles lives here; main.js only calls in. The invisible Quaternius rig plays these clips and the
// Kenney dummy copies its pose afterwards (syncPuppet in main.js), so all of this works on the rig.
//
// Gait: idle, walk and run play at the same time with weights from the (smoothed) speed. A single
// phase drives walk and run together, advanced by distance / stride length, so the feet match the
// ground at every speed and the walk<->run switch never restarts the cycle.
import * as THREE from 'three';

// Each look is a set of knobs. 'now' is v0.1.51 as it shipped (for side-by-side comparison only).
//  stride: how far the legs swing (1 = the clip). More swing = longer steps = calmer legs at the same speed.
//  bob:    how much of the clip's up-down hip bounce is kept (0 = none, as in v0.1.51).
//  sink:   how much of the clip's crouch (hips lower while running) is kept.
//  lean:   forward lean of the spine at full run, radians.
//  spine:  how much of the clip's own torso/head motion is kept (sway, twist, breathing).
//  walkArms: run with the walk's relaxed arm swing instead of the pack's pumping sprint arms.
//  arms:   arm swing size (1 = the clip); armFwd: swing centred this far in front (radians, half on the walk);
//  elbow:  extra elbow bend (radians) while running; idle: the idle's look-around (0 = off; breathing stays).
export const GAITS = {
  now: { legacy: true },
  a: { name: 'Quick steps', stride: 1.0, bob: 0.55, sink: 0.35, lean: 0.10, spine: 0.6, walkArms: true, arms: 1.4, elbow: 0.5, breathe: 1 },
  b: { name: 'Easy stride', stride: 1.3, bob: 0.4, sink: 0.25, lean: 0.07, spine: 0.5, walkArms: true, arms: 1.2, armFwd: 0.35, elbow: 0.6, breathe: 1, idle: 0 },
  // Quaternius Universal Animation Library (CC0): Idle_Loop, Walk_Loop, Jog_Fwd_Loop, Idle_Talking_Loop retargeted onto the rig
  // Mac's pick (Nov 14): B's walk and idle, UAL long jog for the run
  w: { name: 'B walk + UAL long jog', stride: 1.3, bob: 0.4, sink: 0.25, lean: 0, spine: 0.5, walkArms: true, arms: 1.2, armFwd: 0.35, elbow: 0.6, breathe: 1, idle: 0, ualRun: 1.25 },
  // idle posture mockups (Nov 15): the shipped look with a relaxed upright idle
  // posture: knee (bend, radians), arm (out from the side), armFwd (forward), elbow (bend), hands (0 = Kenney's fist, 1 = flat)
  x: { name: 'Upright', base: 'w', posture: { knee: 0, arm: 0.12, armFwd: 0, elbow: 0.05, hands: 0.6 } },
  y: { name: 'Relaxed', base: 'w', posture: { knee: 0.06, arm: 0.2, armFwd: 0.12, elbow: 0.25, hands: 0.5, feet: false } },
  z: { name: 'Relaxed + UAL sway', base: 'w', ualIdle: 0.6, posture: { knee: 0.06, arm: 0.2, armFwd: 0.12, elbow: 0.25, hands: 0.5 } },
  // Mac's pick (Nov 15): Relaxed, arms closer to the body, feet straight ahead, hands stay fists "for now"
  r: { name: 'Relaxed (picked)', base: 'w', posture: { knee: 0.06, arm: 0.07, armFwd: 0.1, elbow: 0.25, hands: 0 } },
  r0: { name: 'v0.1.63 stop (freezes mid-stride)', base: 'r', noSettle: true },   // for the stop mockup only
  // standing-up mockups (Nov 16), seconds: legs/hips settle; arms drop (after armDelay); the run's forward lean straightens (after leanDelay)
  s1: { name: 'Stand up in stages', base: 'r', stand: { legs: 0.4, armDelay: 0.03, arms: 0.35, leanDelay: 0.15, lean: 0.55 } },
  // runner's arms mockups (Nov 16), on top of s1 (Mac picked A: stand up in stages)
  ra1: { name: 'Runner arms', base: 's1', armRun: { amp: 0.6, back: 0.3, elbow: 1.45, pump: 0.25, open: 0.45, out: 0.1 } },
  // Mac's pick (Nov 16): Runner arms, elbows a touch further out (no clipping), a real fist
  rf: { name: 'Runner arms + fist', base: 'ra1', armRun: { amp: 0.6, back: 0.3, elbow: 1.45, pump: 0.25, open: 0.45, out: 0.2 },
    posture: { knee: 0.06, arm: 0.07, armFwd: 0.1, elbow: 0.25, hands: 0, fist: { fingers: 1.7, thumb: 1.3 } } },
  // elbows further out (Nov 18): same as rf, wider
  rw1: { name: 'Elbows out more', base: 'rf', armRun: { amp: 0.6, back: 0.3, elbow: 1.45, pump: 0.25, open: 0.45, out: 0.6, handOut: 0.1 } },
  rw2: { name: 'Elbows out wide', base: 'rf', armRun: { amp: 0.6, back: 0.3, elbow: 1.45, pump: 0.25, open: 0.45, out: 0.85, handOut: 0 } },
  ra2: { name: 'Sprinter arms', base: 's1', armRun: { amp: 0.85, back: 0.35, elbow: 1.4, pump: 0.35, open: 0.55, out: 0.08 } },
  s2: { name: 'Stand up in stages, slower', base: 'r', stand: { legs: 0.6, armDelay: 0.05, arms: 0.5, leanDelay: 0.25, lean: 0.9 } },
  r2: { name: 'Relaxed, arms in more', base: 'w', posture: { knee: 0.06, arm: 0.02, armFwd: 0.08, elbow: 0.3, hands: 0.5 } },
  u: { name: 'UAL jog', ual: true, stride: 1, lean: 0, idle: 0 },
  v: { name: 'UAL long jog', ual: true, stride: 1.25, lean: 0, idle: 0 },
  c: { name: 'Bouncy jog', stride: 1.15, bob: 0.85, sink: 0.3, lean: 0.12, spine: 0.8, walkArms: true, arms: 1.6, elbow: 0.7, breathe: 1 },
};

const UPPER = /^(Torso|Neck|Head|Shoulder|UpperArm|LowerArm|Fist|Thumb|Weapon|Index|Middle|Pinky)/;
const SPINE = /^(Abdomen|Torso|Neck|Head)$/;
const PHASE0 = { Walk: 0, Run: -0.05 };         // left foot lands at the same phase in both clips
// a look can start from another one and change a few knobs
const look = (k) => { const g = GAITS[k]; return g.base ? { ...look(g.base), ...g, base: undefined } : g; };
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();

// average of a quaternion track (good enough for small spreads)
function meanQ(v) {
  const m = new THREE.Quaternion(0, 0, 0, 0), a = new THREE.Quaternion(v[0], v[1], v[2], v[3]);
  for (let i = 0; i < v.length; i += 4) { _q.fromArray(v, i); const s = _q.dot(a) < 0 ? -1 : 1; m.x += s * _q.x; m.y += s * _q.y; m.z += s * _q.z; m.w += s * _q.w; }
  return m.normalize();
}
// q' = to * (from^-1 q)^k : keep k of the motion around 'from', re-centred on 'to'
function rescaleQ(track, from, to, k) {
  const v = track.values.slice(), inv = from.clone().invert();
  for (let i = 0; i < v.length; i += 4) {
    _q.fromArray(v, i); _q2.copy(inv).multiply(_q);
    if (_q2.w < 0) { _q2.x *= -1; _q2.y *= -1; _q2.z *= -1; _q2.w *= -1; }
    const ang = 2 * Math.acos(Math.min(1, _q2.w)), s = Math.sqrt(1 - _q2.w * _q2.w);
    if (s > 1e-5) _q2.setFromAxisAngle(_v.set(_q2.x / s, _q2.y / s, _q2.z / s), ang * k); else _q2.identity();
    _q.copy(to).multiply(_q2).toArray(v, i);
  }
  return new THREE.QuaternionKeyframeTrack(track.name, track.times, v);
}
// today's idle without the fighter's crouch: legs and hips back to the rig's straight stand
function straighten(c, rest) {
  return new THREE.AnimationClip(c.name, c.duration, c.tracks.map(t => {
    const [bn, prop] = t.name.split('.'), r = rest[bn];
    if (prop === 'quaternion' && r && r.q && /^(UpperLeg|LowerLeg|Neck|Head)/.test(bn)) return rescaleQ(t, meanQ(t.values), r.q, 1);
    if (bn === 'Body' && prop === 'position' && r) { const v = t.values.slice(); let my = 0; for (let i = 1; i < v.length; i += 3) my += v[i] / (v.length / 3);
      for (let i = 1; i < v.length; i += 3) v[i] = r.p.y + (v[i] - my); return new THREE.VectorKeyframeTrack(t.name, t.times, v); }
    return t;
  }));
}
// The pack's run is lopsided: one arm stays up like a boxer's guard and one foot parks in front, then
// whips back. Rebuild the bad side from the good one, half a cycle later and mirrored.
// Which side each part is copied from; the other side is rebuilt from it. The Rogue's right arm
// barely moves in its walk (it carries a dagger), so both clips take their arms from the left.
const PART = { arms: /^(Shoulder|UpperArm|LowerArm)/, legs: /^(UpperLeg|LowerLeg|Foot)/ };
function mirrorRight(c, MIRROR) {
  const d = c.duration, from = (bn) => { for (const [k, re] of Object.entries(PART)) if (re.test(bn)) return MIRROR[k] || null; return null; };
  const side = (bn) => bn.slice(-1), part = (bn) => from(bn);
  const keep = c.tracks.filter(t => { const bn = t.name.split('.')[0]; const f = part(bn); return !f || side(bn) === f; }), add = [];
  for (const t of c.tracks) {
    const [bn, prop] = t.name.split('.'); const f = part(bn); if (!f || side(bn) !== f) continue;
    const it = t.createInterpolant(), n = t.times.length, size = t.getValueSize(), v = new Float32Array(n * size);
    for (let i = 0; i < n; i++) {
      const r = it.evaluate((t.times[i] + d / 2) % d);
      if (prop === 'quaternion') { v[i * 4] = r[0]; v[i * 4 + 1] = -r[1]; v[i * 4 + 2] = -r[2]; v[i * 4 + 3] = r[3]; }
      else { v[i * 3] = -r[0]; v[i * 3 + 1] = r[1]; v[i * 3 + 2] = r[2]; }
    }
    const Track = prop === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
    add.push(new Track(bn.slice(0, -1) + (f === 'L' ? 'R' : 'L') + '.' + prop, t.times, v));
  }
  return new THREE.AnimationClip(c.name, d, keep.concat(add));
}
// shape one base clip for a gait look; rest = the rig's bind pose (bone name -> {q, p})
// relaxed arms for the run: the walk's arm swing, stretched to the run's length (same foot timing)
const ARM = /^(Shoulder|UpperArm|LowerArm)(L|R)$/;
function walkArms(run, walk) {
  const d = run.duration, D = walk.duration, shift = PHASE0.Run;   // walk phase = run phase + shift... both land the left foot together
  const tracks = run.tracks.filter(t => !ARM.test(t.name.split('.')[0]));
  for (const t of walk.tracks) {
    const bn = t.name.split('.')[0]; if (!ARM.test(bn)) continue;
    const it = t.createInterpolant(), n = 25, times = new Float32Array(n), v = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { times[i] = d * i / (n - 1); const ph = ((i / (n - 1)) - shift + 1) % 1; v.set(it.evaluate(ph * D), i * 4); }
    tracks.push(new THREE.QuaternionKeyframeTrack(t.name, times, v));
  }
  return new THREE.AnimationClip(run.name, d, tracks);
}
// bend the elbows a little more (LowerArm about its own x)
function bendElbows(c, a) {
  if (!a) return c;
  const bend = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
  return new THREE.AnimationClip(c.name, c.duration, c.tracks.map(t => {
    if (!/^LowerArm(L|R)\.quaternion$/.test(t.name)) return t;
    const v = t.values.slice(); for (let i = 0; i < v.length; i += 4) _q.fromArray(v, i).multiply(bend).toArray(v, i);
    return new THREE.QuaternionKeyframeTrack(t.name, t.times, v);
  }));
}
function shape(c, kind, g, rest, walk) {
  if (kind === 'Idle' && g.straight) c = straighten(c, rest);
  if (kind === 'Walk') c = mirrorRight(c, { arms: 'L' });
  if (kind === 'Run') { c = mirrorRight(c, { arms: 'L', legs: 'L' }); if (g.walkArms) c = walkArms(c, mirrorRight(walk, { arms: 'L' })); c = bendElbows(c, g.elbow); }
  const tracks = [];
  for (const t of c.tracks) {
    const [bn, prop] = t.name.split('.');
    const r = rest[bn];
    if (prop === 'quaternion' && SPINE.test(bn)) {
      if (r) tracks.push(rescaleQ(t, meanQ(t.values), r.q, kind === 'Idle' ? g.breathe : g.spine));   // keep the motion, drop the built-in lean
    } else if (prop === 'quaternion' && /^UpperLeg/.test(bn) && kind !== 'Idle') {
      const m = meanQ(t.values); tracks.push(rescaleQ(t, m, m, g.stride));
    } else if (prop === 'quaternion' && /^(UpperArm|Shoulder)/.test(bn) && kind !== 'Idle') {
      const m = meanQ(t.values), sw = rescaleQ(t, m, m, g.arms);
      const fwd = /^UpperArm/.test(bn) && rest[bn] ? (kind === 'Run' ? g.armFwd : g.armFwd * 0.5) || 0 : 0;
      if (fwd) {   // swing centred a little in front of the body: turn about the world side axis, in the parent's frame
        const P = rest[bn].parentWorld, R = _q2.setFromAxisAngle(_v.set(1, 0, 0), -fwd), M = P.clone().invert().multiply(R).multiply(P);
        const v = sw.values; for (let i = 0; i < v.length; i += 4) _q.fromArray(v, i).premultiply(M).toArray(v, i);
      }
      tracks.push(sw);
    } else if (bn === 'Body' && prop === 'position') {
      if (!r) continue;
      const v = t.values.slice(); let my = 0; for (let i = 1; i < v.length; i += 3) my += v[i]; my /= v.length / 3;
      const bob = kind === 'Idle' ? 1 : g.bob, sink = kind === 'Idle' ? 1 : g.sink;
      for (let i = 0; i < v.length; i += 3) { v[i] = r.p.x + (v[i] - r.p.x); v[i + 1] = r.p.y + (my - r.p.y) * sink + (v[i + 1] - my) * bob; v[i + 2] = r.p.z; }
      tracks.push(new THREE.VectorKeyframeTrack(t.name, t.times, v));
    } else tracks.push(t);
  }
  return new THREE.AnimationClip(c.name + '_' + kind, c.duration, tracks);
}

// ---- Universal Animation Library -> the pack rig ----
// Each UAL bone's turn away from UAL's own idle (frame 0) is applied, in world space, to the rig bone's
// bind pose. The dummy's copy offsets are measured in that same pose, so the dummy ends up as
// "its own idle, moved the way the UAL mannequin moves". Hips also get UAL's pelvis bob and sway.
const UAL_MAP = [['pelvis', 'Hips'], ['spine_01', 'Abdomen'], ['spine_03', 'Torso'], ['neck_01', 'Neck'], ['Head', 'Head'],
  ['clavicle_l', 'Shoulder.L'], ['upperarm_l', 'UpperArm.L'], ['lowerarm_l', 'LowerArm.L'], ['hand_l', 'Fist.L'],
  ['clavicle_r', 'Shoulder.R'], ['upperarm_r', 'UpperArm.R'], ['lowerarm_r', 'LowerArm.R'], ['hand_r', 'Fist.R'],
  ['thigh_l', 'UpperLeg.L'], ['calf_l', 'LowerLeg.L'], ['foot_l', 'Foot.L'],
  ['thigh_r', 'UpperLeg.R'], ['calf_r', 'LowerLeg.R'], ['foot_r', 'Foot.R']];
const UAL_CLIP = { Idle: 'Idle_Loop', Walk: 'Walk_Loop', Run: 'Jog_Fwd_Loop', Talk: 'Idle_Talking_Loop' };
function retargetUAL(ual, root, bone) {
  const us = ual.scene, find = (n) => ual.animations.find(c => c.name === n);
  const um = new THREE.AnimationMixer(us);
  const pairs = UAL_MAP.map(([u, r]) => ({ u: us.getObjectByName(u), r: bone(r) })).filter(p => p.u && p.r);
  root.updateMatrixWorld(true);
  for (const p of pairs) { p.r0 = p.r.getWorldQuaternion(new THREE.Quaternion()); p.parent0 = p.r.parent.getWorldQuaternion(new THREE.Quaternion()); }
  const byObj = new Map(pairs.map(p => [p.r, p]));
  const body = bone('Body'), hips = bone('Hips'), feet = bone('Foot.L');
  const body0 = body.getWorldPosition(new THREE.Vector3()), bodyLocal0 = body.position.clone(), rootInv = body.parent.matrixWorld.clone().invert();
  const rigHip = hips.getWorldPosition(new THREE.Vector3()).y - feet.getWorldPosition(new THREE.Vector3()).y;
  // UAL reference: the average pose over the walk cycle. (Idle_Loop's first frame stands turned: hips 13°,
  // right foot 44° out, which twisted every retargeted clip.) The walk is symmetric and faces straight ahead.
  const refClip = find('Walk_Loop') || find(UAL_CLIP.Idle), ref = um.clipAction(refClip); ref.play();
  const pel = us.getObjectByName('pelvis'), pel0 = new THREE.Vector3(), sums = pairs.map(() => new THREE.Vector4());
  const R = 16; let ualHip = 0;
  for (let i = 0; i < R; i++) {
    um.setTime(refClip.duration * i / R); us.updateMatrixWorld(true);
    pel0.add(pel.getWorldPosition(_v).multiplyScalar(1 / R));
    ualHip += (pel.getWorldPosition(_v).y - Math.min(us.getObjectByName('foot_l').getWorldPosition(new THREE.Vector3()).y, us.getObjectByName('foot_r').getWorldPosition(new THREE.Vector3()).y)) / R;
    pairs.forEach((p, j) => { const q = p.u.getWorldQuaternion(_q), sm = sums[j]; const sg = i && (sm.x * q.x + sm.y * q.y + sm.z * q.z + sm.w * q.w) < 0 ? -1 : 1; sm.x += sg * q.x; sm.y += sg * q.y; sm.z += sg * q.z; sm.w += sg * q.w; });
  }
  pairs.forEach((p, j) => { const sm = sums[j]; p.inv0 = new THREE.Quaternion(sm.x, sm.y, sm.z, sm.w).normalize().invert(); });
  ref.stop(); um.uncacheAction(refClip);
  const k = rigHip / ualHip, W = new THREE.Quaternion(), Pw = new THREE.Quaternion(), v = new THREE.Vector3();
  const out = {};
  for (const [key, name] of Object.entries(UAL_CLIP)) {
    const c = find(name); if (!c) continue;
    const a = um.clipAction(c); a.play();
    const n = Math.max(2, Math.round(c.duration * 30) + 1), times = new Float32Array(n);
    const q = pairs.map(() => new Float32Array(n * 4)), pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = times[i] = c.duration * i / (n - 1);
      um.setTime(t); us.updateMatrixWorld(true);
      const world = new Map();
      pairs.forEach((p, j) => {
        W.copy(p.u.getWorldQuaternion(_q)).multiply(p.inv0).multiply(p.r0);   // UAL's turn since its idle, on the rig's bind pose
        world.set(p.r, W.clone());
        const par = byObj.get(p.r.parent); Pw.copy(par ? world.get(p.r.parent) : p.parent0);
        Pw.invert().multiply(W).toArray(q[j], i * 4);
      });
      v.copy(pel.getWorldPosition(_v)).sub(pel0).multiplyScalar(k).add(body0).applyMatrix4(rootInv);
      v.toArray(pos, i * 3);
    }
    a.stop(); um.uncacheAction(c);
    const tracks = pairs.map((p, j) => new THREE.QuaternionKeyframeTrack(p.r.name + '.quaternion', times, q[j]));
    tracks.push(new THREE.VectorKeyframeTrack(body.name + '.position', times, pos));
    out[key] = new THREE.AnimationClip('UAL|' + name, c.duration, tracks);
  }
  body.position.copy(bodyLocal0); um.uncacheRoot(us);
  return out;
}
// keep k of every bone's motion around its average pose (and of the hips' sway)
function calmer(c, k) {
  return new THREE.AnimationClip(c.name, c.duration, c.tracks.map(t => {
    if (t.name.endsWith('.quaternion')) { const m = meanQ(t.values); return rescaleQ(t, m, m, k); }
    if (t.name.endsWith('.position')) { const v = t.values.slice(), n = v.length / 3, m = [0, 0, 0];
      for (let i = 0; i < v.length; i++) m[i % 3] += v[i] / n; for (let i = 0; i < v.length; i++) v[i] = m[i % 3] + (v[i] - m[i % 3]) * k;
      return new THREE.VectorKeyframeTrack(t.name, t.times, v); }
    return t;
  }));
}
// UAL looks: the clips as they are, only the leg swing scaled
function shapeUAL(c, kind, g) {
  if (kind === 'Idle' && g.ualIdle && g.ualIdle !== 1) return calmer(c, g.ualIdle);
  if (kind === 'Idle' || kind === 'Talk' || (g.stride ?? 1) === 1) return c;
  return new THREE.AnimationClip(c.name, c.duration, c.tracks.map(t => /^UpperLeg/.test(t.name) && t.name.endsWith('.quaternion') ? (m => rescaleQ(t, m, m, g.stride))(meanQ(t.values)) : t));
}

// v0.1.51's filter: drop the spine lean and hip drop entirely
const LEAN = /^(Abdomen|Torso|Neck|Head)\.quaternion$|^Body\.position$/;
const upright = (c) => new THREE.AnimationClip(c.name + '_upright', c.duration, c.tracks.filter(t => !LEAN.test(t.name)));
const split = (c, upper) => new THREE.AnimationClip(c.name + (upper ? '_up' : '_low'), c.duration,
  c.tracks.filter(t => UPPER.test(t.name.split('.')[0]) === upper));

// Build every action a body needs. rigAnims: the Rogue rig's clips; pool: the run clips (Wizard or Ranger).
// bone(n): finds a rig bone by its pack name ('Foot.L'). legRatio: dummy leg length / rig leg length.
export function buildActions(b, rigAnims, pool, bone, gaitKey = 'a', ual = null) {
  const g = look(gaitKey), mixer = b.mixer;
  const find = (list, n) => list.find(c => c.name.endsWith('|' + n));
  const rest = {};
  for (const n of ['Body', 'Abdomen', 'Torso', 'Neck', 'Head', 'UpperLeg.L', 'UpperLeg.R', 'LowerLeg.L', 'LowerLeg.R']) { const o = bone(n); if (o) rest[o.name] = { q: o.quaternion.clone(), p: o.position.clone() }; }
  b.root.updateMatrixWorld(true);
  for (const n of ['UpperArm.L', 'UpperArm.R']) { const o = bone(n); if (o) rest[o.name] = { parentWorld: o.parent.getWorldQuaternion(new THREE.Quaternion()) }; }
  const useUAL = g.ual && ual, mix = g.ualRun && ual;
  const pack = { Idle: find(rigAnims, 'Idle'), Walk: find(rigAnims, 'Walk'), Run: find(pool, 'Run') };
  const U = useUAL || mix ? retargetUAL(ual, b.root, bone) : null;
  const base = useUAL ? U : mix ? { Idle: g.ualIdle ? U.Idle : pack.Idle, Walk: pack.Walk, Run: U.Run, Talk: U.Talk } : pack;
  const fromUAL = (n) => useUAL || (mix && (n === 'Run' || n === 'Talk' || (n === 'Idle' && g.ualIdle)));
  const acts = {};
  for (const [n, c0] of Object.entries(base)) {
    const c = g.legacy ? upright(c0) : fromUAL(n) ? shapeUAL(c0, n, mix ? { stride: g.ualRun } : g) : shape(c0, n, g, rest, pack.Walk);
    acts[n] = { low: mixer.clipAction(split(c, false)), up: mixer.clipAction(split(c, true)) };
  }
  for (const [key, n] of [['Attack', 'Dagger_Attack'], ['PickUp', 'PickUp']]) {
    const c = find(rigAnims, n) || find(rigAnims, 'Punch');
    const a = mixer.clipAction(split(c, true)); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; acts[key] = a;
  }
  b.acts = acts; b.cur = 'Idle'; b.upBusy = 0; b.gaitKey = gaitKey;
  b.ualClips = ['Walk', 'Run'].filter(n => base[n] && fromUAL(n));   // these stand on the upright base too (see posture)
  // NOTE (v0.1.66): main.js stepPhase() reads gait.phase and gait.front.Walk to time the footstep sounds; rename them there too
  b.gait = { phase: 0, speed: 0, w: { Idle: 1, Walk: 0, Run: 0 }, lean: 0, talk: 0, talkTo: 0 };
  if (g.legacy) { acts.Idle.low.play(); acts.Idle.up.play(); }
  else for (const n of ['Idle', 'Walk', 'Run', 'Talk']) if (acts[n]) for (const a of [acts[n].low, acts[n].up]) { a.play(); a.setEffectiveWeight(n === 'Idle' ? 1 : 0); if (n === 'Walk' || n === 'Run') a.timeScale = 0; }
  // posture: straighten the rig's built-in forward lean (no base clip drives Abdomen in v0.1.51)
  if (g.legacy) bone('Abdomen').rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), -0.12);
  b.gait.ab = bone('Abdomen'); b.gait.head = bone('Head'); b.gait.t = Math.random() * 20; b.gait.saved = [new THREE.Quaternion(), new THREE.Quaternion()];
  return acts;
}

// ---- v0.1.51 behaviour, kept for the 'now' look ----
function legacyPlay(b, name, rate = 1, fade = 0.2) {
  const A = b.acts;
  for (const k of ['Walk', 'Run']) A[k].low.timeScale = A[k].up.timeScale = k === name ? rate : 1;
  if (b.cur === name) return;
  const from = A[b.cur], to = A[name];
  to.low.reset().setEffectiveWeight(1).fadeIn(fade).play(); from.low.fadeOut(fade);
  if (b.upBusy <= 0) { to.up.reset().setEffectiveWeight(1).fadeIn(fade).play(); from.up.fadeOut(fade); }
  else { to.up.stop(); from.up.stop(); }
  b.cur = name;
}
function legacySpeed(b, v) {
  if (v < 0.05) return legacyPlay(b, 'Idle');
  if (v < 2.5) legacyPlay(b, 'Walk', Math.min(1.5, v / 1.6)); else legacyPlay(b, 'Run', Math.min(1.35, Math.max(0.85, v / 4.2)));
}

// v0.1.130 (Mac: "make the character animate its running a little faster"): the run takes this many times more steps for the
// same ground speed (1 = the feet match the ground exactly; above 1 they slide a touch). The run's top speed is unchanged.
export const RUN_CADENCE = 1.15;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Move a body at ground speed v (m/s) for dt seconds. Call once per frame, before mixer.update.
export function locomote(b, v, dt) {
  const g = look(b.gaitKey);
  if (g.legacy) return legacySpeed(b, v);
  const G = b.gait, A = b.acts;
  unpose(b);
  G.t += dt;
  // the feet follow the real speed (no lag = no sliding); only the walk/run/idle mix is eased
  // stopping eases out a little slower than starting, so the last step can finish
  G.speed += (v - G.speed) * Math.min(1, dt * (v >= G.speed || g.noSettle ? 7 : G.settle != null && G.settle <= 0 ? 10 : 5));   // once the last step lands, settle quickly
  const s = G.speed;
  const moving = smooth(0.05, 0.6, s), run = smooth(2.5, 3.1, s);
  const w = G.w; w.Idle = 1 - moving; w.Walk = moving * (1 - run); w.Run = moving * run;
  G.wu = w.Idle; G.runMix = run;
  // metres per cycle of what you see (measured on the dummy by calibrate)
  const stride = G.stride.Walk * (1 - run) + G.stride.Run / RUN_CADENCE * run;
  if (v > 0.05 || !G.pass || g.noSettle) { G.phase = (G.phase + v * dt / stride) % 1; G.settle = null; }
  else if (moving > 0.01) {
    // just let go: finish the step to the next place the legs pass each other, then hold there while
    // the idle fades in (instead of freezing mid-stride)
    if (G.settle == null) {   // how far (in cycles) to the next stopping place
      let best = 1; for (const p of G.pass[run > 0.5 ? 'Run' : 'Walk']) best = Math.min(best, ((p - G.phase) % 1 + 1) % 1);
      G.settle = best;
    }
    const step = Math.min(G.settle, Math.max(s / stride, 1.2) * dt);   // at the speed it had, never a crawl
    G.phase = (G.phase + step) % 1; G.settle -= step;
  }
  // Standing up in stages (look knob 'stand'): hold the stride while the last step finishes, then the legs
  // and hips settle first, and the spine and arms follow later and slower, so it doesn't pop up all at once.
  if (g.stand && G.pass) {
    if (v > 0.05) { G.standT = null; G.hold = null; G.stopLean = 0; }
    else {
      if (G.hold == null) G.hold = { idle: w.Idle, run };   // the mix at the moment of letting go
      if (G.settle != null && G.settle > 0) G.standT = null;
      else if (G.standT == null) G.standT = 0; else G.standT += dt;
      const S = g.stand, h = G.hold, t = G.standT ?? 0, up = G.standT == null ? 0 : 1;
      const wl = h.idle + (1 - h.idle) * up * smooth(0, 1, t / S.legs);                 // feet plant, legs straighten
      const wu = h.idle + (1 - h.idle) * up * smooth(0, 1, (t - S.armDelay) / S.arms);   // arms drop (they're heavy: early)
      w.Idle = wl; w.Walk = (1 - wl) * (1 - h.run); w.Run = (1 - wl) * h.run; G.wu = wu; G.runMix = h.run;
      // the body stays leaning forward from the run and straightens up last
      // (it takes over from the run's own lean as that fades with the legs, so nothing jumps)
      G.stopLean = (1 - h.idle) * (0.05 + 0.1 * h.run) * up * smooth(0, 1, t / S.legs) * (1 - smooth(0, 1, (t - S.leanDelay) / S.lean));
    }
  }
  for (const n of ['Walk', 'Run']) {
    const d = A[n].low.getClip().duration, t = ((G.phase + (G.phase0 ? G.phase0[n] : PHASE0[n])) % 1 + 1) % 1 * d;
    A[n].low.time = t; A[n].up.time = t;
  }
  G.upW = (G.upW ?? 1) + ((b.upBusy > 0 ? 0 : 1) - (G.upW ?? 1)) * Math.min(1, dt * 12);   // hand the arms back gently after a one-shot
  G.talk += (G.talkTo - G.talk) * Math.min(1, dt * 4);
  const talk = A.Talk ? G.talk : 0;
  for (const n of ['Idle', 'Walk', 'Run', 'Talk']) {
    if (!A[n]) continue;
    // the talk loop moves the upper body only; its legs stand turned out, so the legs stay on the idle
    const wn = n === 'Idle' ? w.Idle * (1 - talk) : n === 'Talk' ? w.Idle * talk : w[n];
    A[n].low.setEffectiveWeight(n === 'Talk' ? 0 : n === 'Idle' ? w.Idle : wn);
    // the upper body has its own idle weight (G.wu), which lags behind the legs while standing up
    const wu = G.wu, un = n === 'Idle' ? wu * (1 - talk) : n === 'Talk' ? wu * talk : (1 - wu) * (n === 'Run' ? G.runMix : 1 - G.runMix);
    A[n].up.setEffectiveWeight(un * G.upW);
  }
  G.lean += (g.lean * run * moving + 0.03 * moving * (1 - run) - G.lean) * Math.min(1, dt * 5);
  b.cur = w.Run > w.Walk && w.Run > w.Idle ? 'Run' : w.Walk > w.Idle ? 'Walk' : 'Idle';
}

// Measure how far the visible feet travel per cycle, once, after initPosture (body at the origin, facing +z). sync(b) copies the rig pose onto the dummy; feet: the dummy's two foot bones.
export function calibrate(b, sync, feet) {
  const G = b.gait; if (!G || look(b.gaitKey).legacy) return;
  const A = b.acts, p = new THREE.Vector3(), N = 48;
  G.stride = {};
  for (const n of ['Walk', 'Run']) {
    for (const k of ['Idle', 'Walk', 'Run', 'Talk']) if (A[k]) for (const a of [A[k].low, A[k].up]) a.setEffectiveWeight(k === n ? 1 : 0);
    G.w.Idle = 0; G.w.Walk = n === 'Walk' ? 1 : 0; G.w.Run = n === 'Run' ? 1 : 0;   // so posture() sees this clip
    const d = A[n].low.getClip().duration, pts = [];
    for (let i = 0; i <= N; i++) {
      for (const a of [A[n].low, A[n].up]) a.time = d * i / N;
      b.mixer.update(0); b.root.updateMatrixWorld(true); sync(b); posture(b);
      pts.push(feet.map(f => { f.getWorldPosition(p); return [p.z, p.y]; }));
    }
    // stance = a foot in the lowest quarter of its height range, moving back; match its speed
    const v = [];
    for (const f of [0, 1]) {
      const ys = pts.map(q => q[f][1]), lo = Math.min(...ys), hi = Math.max(...ys);
      for (let i = 1; i <= N; i++) { const dz = pts[i - 1][f][0] - pts[i][f][0]; if (ys[i] < lo + (hi - lo) * 0.25 && dz > 0) v.push(dz); }
    }
    v.sort((x, y) => x - y);
    const sum = (v[v.length >> 1] || 0.01) * N;
    G.stride[n] = Math.max(0.2, sum);
    let best = 0; for (let i = 1; i < N; i++) if (pts[i][0][0] > pts[best][0][0]) best = i;   // left foot furthest forward
    (G.front = G.front || {})[n] = best / N;
    // the best places to stop: both feet as low as they get (on the ground), and not far apart
    const lo = Math.min(...pts.flat().map(q => q[1])), span = Math.max(1e-6, Math.max(...pts.flat().map(q => q[1])) - lo);
    const zs = pts.flat().map(q => q[0]), zspan = Math.max(1e-6, Math.max(...zs) - Math.min(...zs));
    const score = pts.map(q => (Math.max(q[0][1], q[1][1]) - lo) / span + 0.35 * Math.abs(q[0][0] - q[1][0]) / zspan);
    const pass = [];
    for (let i = 0; i < N; i++) { const pv = score[(i + N - 1) % N], nx = score[(i + 1) % N]; if (score[i] <= pv && score[i] <= nx) pass.push(i / N); }
    pass.sort((x, y) => score[Math.round(x * N)] - score[Math.round(y * N)]);
    (G.passRaw = G.passRaw || {})[n] = pass.slice(0, 2);
  }
  // line the clips up so the left foot lands at the same phase in walk and run (the walk is the reference)
  G.phase0 = { Walk: 0, Run: G.front.Run - G.front.Walk };
  // the same stopping places on the shared phase (phase = clip fraction - phase0)
  G.pass = {}; for (const n of ['Walk', 'Run']) G.pass[n] = (G.passRaw[n] || [0, 0.5]).map(f => ((f - G.phase0[n]) % 1 + 1) % 1);
  for (const k of ['Idle', 'Walk', 'Run', 'Talk']) if (A[k]) for (const a of [A[k].low, A[k].up]) a.setEffectiveWeight(k === 'Idle' ? 1 : 0);
  G.w.Idle = 1; G.w.Walk = 0; G.w.Run = 0;
  b.mixer.update(0); sync(b);
}

// After mixer.update: lean into the run, and keep an idle body breathing and glancing around.
// The mixer only rewrites a bone when its value changes, so these tweaks are undone (unpose) before
// the next mixer.update; otherwise they would pile up frame after frame.
function unpose(b) {
  const G = b.gait; if (!G.posed) return;
  G.ab.quaternion.copy(G.saved[0]); G.head.quaternion.copy(G.saved[1]); G.posed = false;
}
export function pose(b) {
  const G = b.gait, g = look(b.gaitKey); if (!G || g.legacy) return;
  const t = G.t, wb = G.w.Idle, wi = wb * (g.idle ?? 1);
  G.saved[0].copy(G.ab.quaternion); G.saved[1].copy(G.head.quaternion); G.posed = true;   // undone in locomote() before the next mixer.update
  G.ab.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), G.lean + (G.stopLean || 0) + wb * 0.03 * Math.sin(t * 2 * Math.PI / 3.4)));
  if (wi > 0.01 && G.head && b.upBusy <= 0) {
    // a slow look left and right, and a small nod now and then
    const yaw = 0.16 * Math.sin(t * 0.55) * Math.sin(t * 0.21), nod = 0.04 * Math.sin(t * 0.9 + 1);
    G.head.quaternion.multiply(_q.setFromAxisAngle(_v.set(0, 1, 0), yaw * wi)).multiply(_q2.setFromAxisAngle(_v.set(1, 0, 0), nod * wi));
  }
}

// one-shot on the upper body while the legs keep going (PickUp, Attack)
export function upperOneShot(b, key, dur) {
  const A = b.acts, legacy = look(b.gaitKey).legacy, base = A[b.cur];
  if (legacy && b.upBusy <= 0) base.up.fadeOut(0.06);
  A.Attack.stop(); A.PickUp.stop();
  A[key].reset().setEffectiveWeight(1).fadeIn(0.06).play();
  b.upBusy = dur;
}
export function tickUpper(b, dt) {
  if (b.upBusy <= 0) return;
  b.upBusy -= dt;
  if (b.upBusy > 0) return;
  const A = b.acts;
  A.Attack.fadeOut(0.15); A.PickUp.fadeOut(0.15);
  if (look(b.gaitKey).legacy) { const base = A[b.cur]; base.up.reset(); base.up.time = base.low.time; base.up.setEffectiveWeight(1).fadeIn(0.15).play(); }
  // new looks: locomote() sets the upper weights back next frame
}

// ---- standing posture ----
// Every clip reaches the dummy as a change from the Kenney idle's first frame, and that frame is a
// hunched, knees-bent stance with curled fingers. While standing, swap that base for an upright
// stand built from the dummy's own straight bind pose (arms lowered to the sides).
// dummy: the Kenney gltf { scene, animations }. Call once after the puppet is built.
const POSE_BONES = ['Hips', 'Spine', 'Chest', 'UpperChest', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
export function initPosture(b, dummy) {
  const g = look(b.gaitKey), P = b.puppet; if (!g.posture || !P) return;
  const pz = g.posture, idle = dummy.animations[0], k = P.k;
  // the upright stand: a bind-pose copy with the arms lowered, then read back as local rotations
  const s = dummy.scene.clone(true); s.position.set(0, 0, 0); s.rotation.set(0, 0, 0); s.scale.set(1, 1, 1); s.updateMatrixWorld(true);
  const by = (n) => s.getObjectByName(n), wq = (o) => o.getWorldQuaternion(new THREE.Quaternion()), wp = (o) => o.getWorldPosition(new THREE.Vector3());
  const turn = (o, R) => { const W = R.clone().multiply(wq(o)); o.quaternion.copy(wq(o.parent).invert().multiply(W)); o.updateMatrixWorld(true); };
  for (const side of ['Left', 'Right']) {
    const arm = by(side + 'Arm'), fore = by(side + 'ForeArm'), hand = by(side + 'Hand');
    const out = Math.sign(wp(hand).x - wp(arm).x) || 1;
    const want = new THREE.Vector3(out * Math.sin(pz.arm), -Math.cos(pz.arm), Math.sin(pz.armFwd)).normalize();
    turn(arm, new THREE.Quaternion().setFromUnitVectors(wp(fore).sub(wp(arm)).normalize(), want));
    if (pz.elbow) turn(fore, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pz.elbow));
    // feet straight ahead (the bind pose splays them about 9°)
    const foot = by(side + 'Foot'), toe = by(side + 'Toes_end');
    if (toe && pz.feet !== false) { const d = wp(toe).sub(wp(foot)); turn(foot, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(d.x, d.z))); }
    if (pz.knee) { turn(by(side + 'UpLeg'), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pz.knee)); turn(by(side + 'Leg'), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 2 * pz.knee)); turn(by(side + 'Foot'), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pz.knee)); }
  }
  // hips: the stand is taller than the crouch. Measure hip-over-foot height in both, in the hips' parent units.
  const ki = dummy.scene.clone(true); ki.position.set(0, 0, 0); ki.rotation.set(0, 0, 0); ki.scale.set(1, 1, 1);
  const km = new THREE.AnimationMixer(ki); km.clipAction(idle).play(); km.update(0); ki.updateMatrixWorld(true);   // the Kenney idle's first frame
  const tall = (root) => root.getObjectByName('Hips').getWorldPosition(new THREE.Vector3()).y - Math.min(root.getObjectByName('LeftFoot').getWorldPosition(new THREE.Vector3()).y, root.getObjectByName('RightFoot').getWorldPosition(new THREE.Vector3()).y);
  const lift = tall(s) - tall(ki);   // in the dummy's own units (P.k space, which is upright)
  // per bone: C = (Kenney idle, world)^-1 * (upright stand, world). Right-multiplying a bone's world
  // rotation by C swaps the base the motion was measured from, so it holds while limbs swing too.
  const fix = [], copied = new Set(P.pairs.map(q => q.t));
  for (const n of POSE_BONES) {
    const o = by(n), oi = ki.getObjectByName(n), t = k.getObjectByName(n); if (!o || !oi || !t) continue;
    fix.push({ t, C: wq(oi).invert().multiply(wq(o)), base: copied.has(t) ? null : oi.quaternion.clone(), arm: /Shoulder|Arm|Hand/.test(n), spine: /Spine|Chest|Neck|Head/.test(n), W: new THREE.Quaternion(), N: new THREE.Quaternion() });
  }
  km.uncacheRoot(ki);
  // fingers are never animated, so this is for good: a real fist (Mac: "fingers should curl inwards into a
  // fist"), or else uncurl them part way. The finger block curls down into the palm (the bind pose is palm
  // down), the thumb folds over it.
  if (pz.fist) {
    // tighter fist: keep curling each joint the way the Kenney idle already curls it (same axis), further
    k.traverse(o => {
      const m = /Hand(Thumb|Index)\d$/.exec(o.name); if (!m) return;
      const r = s.getObjectByName(o.name); if (!r) return;
      const d = r.quaternion.clone().invert().multiply(o.quaternion);   // bind -> Kenney idle, in the joint's frame
      if (d.w < 0) { d.x *= -1; d.y *= -1; d.z *= -1; d.w *= -1; }
      const ang = 2 * Math.acos(Math.min(1, d.w)), sn = Math.sqrt(Math.max(1e-9, 1 - d.w * d.w));
      const f = m[1] === 'Thumb' ? pz.fist.thumb : pz.fist.fingers;
      o.quaternion.copy(r.quaternion).multiply(_q.setFromAxisAngle(_v.set(d.x / sn, d.y / sn, d.z / sn), Math.min(ang * f, Math.PI * 0.6)));
    });
  } else k.traverse(o => { if (/Hand(Thumb|Index|Middle|Ring|Pinky)/.test(o.name)) { const r = s.getObjectByName(o.name); if (r) o.quaternion.slerp(r.quaternion, pz.hands); } });
  b.posture = { fix, lift, feet: pz.feet === false ? null : ['Left', 'Right'].map(sd => ({ foot: k.getObjectByName(sd + 'Foot'), toe: k.getObjectByName(sd + 'Toes_end') })).filter(f => f.foot && f.toe) };
}
// after syncPuppet: blend toward the upright stand by how much the body is standing still.
// busy: 0 = free, 1 = the arms are posed by something else (fishing, rod carry), 2 = skip (hanging from a farm tool)
const _pq = new THREE.Quaternion();
export function posture(b, busy = 0) {
  const p = b.posture, G = b.gait; if (!p || !G || busy >= 2) return;
  // the upright base is for standing and for the library clips (their motion is measured from an upright
  // walk, not from Kenney's crouch); the pack walk keeps its own base
  let w = G.w.Idle; for (const n of b.ualClips || []) w += G.w[n];
  // upper body: its own (slower, while standing up) idle weight, plus its share of the library clips
  const wuI = G.wu ?? G.w.Idle, rm = G.runMix ?? 0, ual = b.ualClips || [];
  const wU = wuI + (1 - wuI) * ((ual.includes('Run') ? rm : 0) + (ual.includes('Walk') ? 1 - rm : 0));
  if (w < 0.002 && wU < 0.002) return;
  const wa = busy ? 0 : wU * (G.upW ?? 1);   // arms also wait for one-shots (Pick up) to finish
  for (const f of p.fix) if (f.base) f.t.quaternion.copy(f.base);
  b.puppet.k.updateMatrixWorld(true);
  for (const f of p.fix) f.t.getWorldQuaternion(f.W);   // the pose as copied, before any change
  const done = new Map();
  for (const f of p.fix) {   // parents come first in POSE_BONES
    const k = f.arm ? wa : f.spine ? wU : w;
    f.N.copy(f.W); if (k > 0.002) f.N.slerp(_pq.copy(f.W).multiply(f.C), k);
    const par = done.get(f.t.parent) || f.t.parent.getWorldQuaternion(_q2);
    f.t.quaternion.copy(_q.copy(par).invert().multiply(f.N));
    done.set(f.t, f.N);
  }
  const P = b.puppet, h = P.hipT;   // raise the hips straight up in the dummy's space (the hips' parent is rotated)
  P.k.updateMatrixWorld(true);
  const at = P.k.worldToLocal(h.getWorldPosition(_v)); at.y += p.lift * w;
  h.position.copy(h.parent.worldToLocal(P.k.localToWorld(at)));
  P.k.updateMatrixWorld(true);
  if (p.feet && G.w.Run > 0.01) straightFeet(b, G.w.Run);
  // runner's arms: the upper body's share of the run, and only when nothing else poses the arms
  const g = look(b.gaitKey), wArm = (1 - (G.wu ?? G.w.Idle)) * (G.runMix ?? 0) * (G.upW ?? 1);
  if (g.armRun && !busy && wArm > 0.01) runArms(b, g.armRun, wArm);
}
// Runner's arms (Mac: "like a runner/sprinter, elbows close to the body, hands in a fist"): the upper arm
// swings straight forward and back, opposite the leg on its side; the elbow stays bent near 90°, a bit more
// in front; the arm stays close to the side and the hand never crosses the belly.
// o: { amp: swing (radians), back: extra swing behind, elbow: bend (radians), pump: extra bend in front, open: elbow opens behind, out: away from the side }
const _ra = new THREE.Vector3(), _rb = new THREE.Vector3(), _rt = new THREE.Vector3(), _rq = new THREE.Quaternion(), _rk = new THREE.Quaternion();
export function aimBoneK(k, bone, child, target, w) { k.getWorldQuaternion(_rk); aimBone(k, bone, child, target, w); }   // for callers outside this file
function aimBone(k, bone, child, target, w) {   // turn bone (in the dummy's space) so it points along target
  const cur = k.worldToLocal(child.getWorldPosition(_rb)).sub(k.worldToLocal(bone.getWorldPosition(_ra))).normalize();
  _rq.setFromUnitVectors(cur, target);
  if (w < 1) _rq.slerp(_q2.identity(), 1 - w);
  _rq.premultiply(_rk).multiply(_q2.copy(_rk).invert());   // dummy space -> world
  const W = bone.getWorldQuaternion(_q).premultiply(_rq);
  bone.quaternion.copy(bone.parent.getWorldQuaternion(_q2).invert().multiply(W)); bone.updateMatrixWorld(true);
}
function runArms(b, o, w) {
  const G = b.gait, k = b.puppet.k; k.getWorldQuaternion(_rk);
  const lf = G.front ? G.front.Walk : 0;   // shared phase where the left foot is furthest forward
  const c = Math.cos(2 * Math.PI * (G.phase - lf));   // +1: left foot forward -> left arm back, right arm forward
  for (const [side, sg, sw] of [['Left', 1, -c], ['Right', -1, c]]) {
    const arm = k.getObjectByName(side + 'Arm'), fore = k.getObjectByName(side + 'ForeArm'), hand = k.getObjectByName(side + 'Hand');
    if (!arm || !fore || !hand) continue;
    const th = sw > 0 ? sw * o.amp : sw * (o.amp + (o.back || 0));   // forward is +z in the dummy's space
    _rt.set(sg * Math.sin(o.out), -Math.cos(th), Math.sin(th)).normalize();
    aimBone(k, arm, fore, _rt, w);
    const e = th + o.elbow + Math.max(0, sw) * (o.pump || 0) - Math.max(0, -sw) * (o.open || 0);   // forearm angle from straight down; the elbow opens on the back swing so the fist passes the hip
    _rt.set(sg * Math.sin(o.out) * (o.handOut ?? 0.4), -Math.cos(e), Math.sin(e)).normalize();   // forearm: keeps less of the elbow's outward angle, so the fist stays near the body line
    aimBone(k, fore, hand, _rt, w);
  }
}
// The library jog lands both feet turned about 7° to the right (they straighten during the step).
// Mac wants them pointing forward: turn each foot about "up" by its own toe yaw, while it's flat-ish.
const _fq = new THREE.Quaternion(), _fk = new THREE.Quaternion(), _fa = new THREE.Vector3(), _fb = new THREE.Vector3();
function straightFeet(b, wRun) {
  const P = b.puppet, k = P.k; k.getWorldQuaternion(_fk);
  for (const f of b.posture.feet) {
    const a = k.worldToLocal(f.foot.getWorldPosition(_fa)), d = k.worldToLocal(f.toe.getWorldPosition(_fb)).sub(a);
    const flat = Math.hypot(d.x, d.z) / Math.max(1e-6, d.length());   // 1 = toe level, 0 = pointing up or down
    const amt = wRun * Math.min(1, Math.max(0, (flat - 0.5) / 0.3)); if (amt < 0.01) continue;
    const yaw = Math.atan2(d.x, d.z); if (Math.abs(yaw) > 0.6) continue;   // only small turns; a foot swinging back flips
    _fq.setFromAxisAngle(_fa.set(0, 1, 0), -yaw * amt).premultiply(_fk).multiply(_q2.copy(_fk).invert());   // k-space turn, in world
    const W = f.foot.getWorldQuaternion(_q).premultiply(_fq);
    f.foot.quaternion.copy(f.foot.parent.getWorldQuaternion(_q2).invert().multiply(W)); f.foot.updateMatrixWorld(true);
  }
}

// NPCs: lean into the talking loop while the player chats with them
export function setTalk(b, on, amount = 1) { if (b.gait) b.gait.talkTo = on ? amount : 0; }
// an NPC standing at its post: idle only (breathing), one call per frame instead of mixer.update
export function idleTick(b, dt) { locomote(b, 0, dt); b.mixer.update(dt); pose(b); }
