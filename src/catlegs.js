// Tidewell — the cat's front legs, rebuilt (Mac, Nov 20: "we need to do a cat model rebuild because the elbow is too low").
// The pack's cat has its front-leg joint at mid-leg and its Walking clip bends it forward like a person's knee.
// A cat's elbow sits up at the ribs, with a long straight forearm under it and the paw hanging from the wrist.
//   rerigFrontLegs: once per model, before it is cloned. Moves each front elbow up to the ring of points at the ribs
//     (bone positions, bind matrices and the skin weights of the leg).
//   walkFrontLegs: every frame of the walk, after the clip. The front legs are walked in code: the paw is planted and
//     slides back under a straight leg, then lifts (elbow back at the ribs, forearm reaching forward, paw hanging) and
//     swings forward to land. The back legs, body, head and tail still come from the clip.
const FRONT = [['Bone014', 'Bone015', 'Bone016', 'Bone016_end'], ['Bone017', 'Bone018', 'Bone019', 'Bone019_end']];
export const CATWALK = {
  elbow: 0.34,     // how far down from the shoulder the elbow sits now (was 1 = mid-leg), as a share of the old upper leg
  stride: 0.34,    // how far ahead of and behind the shoulder the paw lands and lifts, in leg lengths
  lift: 0.4,       // how high the wrist comes up at the top of the step, in leg lengths
  reach: 0.3,      // how far past its landing spot the paw reaches at the top of the step, in leg lengths
  swing: 0.36,     // the share of the walk cycle a front paw is in the air
  start: [0.07, 0.57],   // where in the clip each front leg lifts (left, right): kept from the pack's clip so the back legs still match
  hang: 1.75,      // radians the paw hangs down from flat at the top of the step
  tip: 1.0,        // radians the upper leg tips back at the top of the step (the elbow slides back along the ribs)
  slide: [0.14, 0.06],   // how far the shoulder may slide down and up, in leg lengths
};

export function rerigFrontLegs(THREE, model) {
  let mesh = null; model.traverse(o => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  if (!mesh || mesh.userData.catRerig) return !!mesh;
  const sk = mesh.skeleton, idx = (n) => sk.bones.findIndex(b => b.name === n);
  if (FRONT.some(l => l.slice(0, 3).some(n => idx(n) < 0))) return false;
  const V = THREE.Vector3, M3 = THREE.Matrix3;
  const bind = (i) => new THREE.Matrix4().copy(sk.boneInverses[i]).invert();
  const moves = [];
  for (const [s, e, w] of FRONT) {
    const is = idx(s), ie = idx(e), iw = idx(w), Bs = bind(is), Be = bind(ie);
    const S = new V().setFromMatrixPosition(Bs), E = new V().setFromMatrixPosition(Be), W = new V().setFromMatrixPosition(bind(iw));
    const E2 = S.clone().lerp(E, CATWALK.elbow), delta = E2.clone().sub(E);            // in the mesh's bind space
    // the elbow bone moves by delta: its bind matrix, its place in the shoulder's frame, and the wrist's place in its own frame
    sk.boneInverses[ie].multiply(new THREE.Matrix4().makeTranslation(-delta.x, -delta.y, -delta.z));
    sk.bones[ie].position.add(delta.clone().applyMatrix3(new M3().setFromMatrix4(Bs).invert()));
    sk.bones[iw].position.sub(delta.clone().applyMatrix3(new M3().setFromMatrix4(Be).invert()));
    moves.push({ is, ie, S, E, E2, W });
  }
  // the skin: everything on the leg below the new elbow follows the forearm; the ring at the ribs blends the two
  const up = moves[0].S.clone().sub(moves[0].W).normalize(), g = mesh.geometry, P = g.attributes.position, J = g.attributes.skinIndex, Wt = g.attributes.skinWeight, p = new V();
  for (const m of moves) {
    const hE = m.E2.dot(up), lo = hE - 0.16 * m.S.distanceTo(m.E), hi = hE + 0.2 * m.S.distanceTo(m.E);   // fully forearm below lo, untouched above hi
    for (let i = 0; i < P.count; i++) {
      let t = 0; const slot = [];
      for (let k = 0; k < 4; k++) { const j = J.getComponent(i, k), w = Wt.getComponent(i, k); if ((j === m.is || j === m.ie) && w > 0) { t += w; slot.push(k); } }
      if (!t) continue;
      const h = p.fromBufferAttribute(P, i).dot(up); if (h >= hi) continue;
      let fore = Math.min(1, (hi - h) / (hi - lo)); fore = fore * fore * (3 - 2 * fore);
      let old = 0; for (const k of slot) if (J.getComponent(i, k) === m.ie) old += Wt.getComponent(i, k);
      const wf = Math.max(old, t * fore), ws = t - wf;                                  // never less forearm than it had
      const a = slot[0], b = slot.length > 1 ? slot[1] : -1;
      if (b < 0) {                                                                       // one slot: needs a second one for the other bone
        let free = -1; for (let k = 0; k < 4; k++) if (k !== a && Wt.getComponent(i, k) === 0) { free = k; break; }
        if (free < 0 || ws < 0.01) { J.setComponent(i, a, wf >= ws ? m.ie : m.is); continue; }
        J.setComponent(i, a, m.ie); Wt.setComponent(i, a, wf); J.setComponent(i, free, m.is); Wt.setComponent(i, free, ws);
      } else { J.setComponent(i, a, m.ie); Wt.setComponent(i, a, wf); J.setComponent(i, b, m.is); Wt.setComponent(i, b, ws); for (const k of slot.slice(2)) Wt.setComponent(i, k, 0); }
    }
  }
  J.needsUpdate = true; Wt.needsUpdate = true; mesh.userData.catRerig = true;
  return true;
}

// ---- the walk ----
let T = null, v = null;
const make = () => ({ S0: new T.Vector3(), W0: new T.Vector3(), S: new T.Vector3(), E: new T.Vector3(), W: new T.Vector3(), E2: new T.Vector3(), W2: new T.Vector3(), Tt: new T.Vector3(), p: new T.Vector3(),
  d: new T.Vector3(), d2: new T.Vector3(), u: new T.Vector3(), n: new T.Vector3(), f: new T.Vector3(), up: new T.Vector3(0, 1, 0),
  q: new T.Quaternion(), q3: new T.Quaternion(), r: new T.Quaternion(), pi: new T.Quaternion() });
function turn(b, q) {   // turn bone b by world-space rotation q
  b.parent.getWorldQuaternion(v.pi).invert(); b.getWorldQuaternion(v.q3);
  b.quaternion.copy(v.pi).multiply(v.q.copy(q).multiply(v.q3)); b.updateMatrixWorld(true);
}
const aim = (b, from, to, at) => {   // turn bone b about its own head so the direction from→to points from→at
  v.d.subVectors(to, from).normalize(); v.d2.subVectors(at, from).normalize(); if (v.d.dot(v.d2) > 0.999999) return;
  turn(b, v.r.setFromUnitVectors(v.d, v.d2));
};
const ease = (x) => x * x * (3 - 2 * x);
// the bones the walk needs, and the leg's shape in the bind pose (the file's rest pose is not the bind pose: its left legs are mid-step)
export function frontLegs(THREE, model) {
  const B = (n) => model.getObjectByName(n), root = B('Bone'), chest = B('Bone002');
  let mesh = null; model.traverse(o => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  const legs = FRONT.map(l => l.map(B)); if (!mesh || !root || !chest || legs.some(l => l.some(b => !b))) return null;
  const sk = mesh.skeleton, bind = (b) => new THREE.Matrix4().copy(sk.boneInverses[sk.bones.indexOf(b)]).invert();   // bone → the armature's own space
  return { root, chest, arm: root.parent, legs: legs.map(([sh, el, wr, toe]) => {
    const Bs = bind(sh), Bw = bind(wr), S0 = new THREE.Vector3().setFromMatrixPosition(Bs);
    return { sh, el, wr, toe, S0, W0: new THREE.Vector3().setFromMatrixPosition(Bw), T0: toe.position.clone().applyMatrix4(Bw),
      P0: S0.clone().applyMatrix4(bind(sh.parent).invert()), keep: [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()] };
  }) };
}
// phase: where the walk clip is, 0..1 · weight: how much of the walk is showing, 0..1 (so it blends in and out with the clip)
export function walkFrontLegs(THREE, rig, phase, weight = 1, C = CATWALK) {
  if (!T) { T = THREE; v = make(); }
  if (!rig || weight <= 0) return;
  rig.arm.updateWorldMatrix(true, true);
  rig.chest.getWorldPosition(v.f).sub(rig.root.getWorldPosition(v.p)); v.f.y = 0; v.f.normalize();           // the way the cat faces
  rig.legs.forEach((g, i) => {
    const { sh, el, wr, toe } = g;
    sh.position.lerp(g.P0, weight); sh.updateMatrixWorld(true);                                             // the clip slides the shoulders about; the walk here places them itself
    g.keep[0].copy(sh.quaternion); g.keep[1].copy(el.quaternion); g.keep[2].copy(wr.quaternion);              // the clip's pose, to blend from
    // the leg at rest, in the world: where the wrist stands, and how long things are
    const S0 = v.S0.copy(g.S0).applyMatrix4(rig.arm.matrixWorld), W0 = v.W0.copy(g.W0).applyMatrix4(rig.arm.matrixWorld);
    const L = S0.distanceTo(W0), c = v.p.copy(g.T0).applyMatrix4(rig.arm.matrixWorld).distanceTo(W0);
    // where this paw is in its step
    let u = (phase - C.start[i]) % 1; if (u < 0) u += 1;
    let x, lift = 0, hang = 0;
    if (u < C.swing) { const s = u / C.swing, late = Math.sin(Math.PI * Math.pow(s, 1.5));                    // the paw comes up, reaches out past where it will land, then sets down
      x = -C.stride + 2 * C.stride * ease(s) + C.reach * late; lift = late; hang = Math.sin(Math.PI * Math.pow(s, 0.75)); }
    else { const s = (u - C.swing) / (1 - C.swing); x = C.stride - 2 * C.stride * s; }
    v.W2.copy(W0).addScaledVector(v.f, x * L).addScaledVector(v.up, lift * C.lift * L);                        // the wrist's target
    // The upper leg is short, so it isn't solved for: it hangs straight down while the paw is planted and tips back (the
    // elbow slides back and up along the ribs) while the leg is lifted. The shoulder then slides up or down a little, like a
    // cat's shoulder blade, so the long forearm lands the wrist exactly on its target.
    sh.getWorldPosition(v.S); el.getWorldPosition(v.E); wr.getWorldPosition(v.W);
    const a = v.E.distanceTo(v.S), b = v.W.distanceTo(v.E), tip = C.tip * Math.pow(lift, 0.7);
    v.d.copy(v.f).multiplyScalar(-Math.sin(tip)).addScaledVector(v.up, -Math.cos(tip));                        // the way the upper leg points
    v.E2.copy(v.S).addScaledVector(v.d, a);
    v.u.subVectors(v.W2, v.E2); const dy = v.u.y; v.u.y = 0; const hx = Math.min(b * 0.98, v.u.length());
    const slide = Math.max(-C.slide[0] * L, Math.min(C.slide[1] * L, Math.sqrt(b * b - hx * hx) + dy));       // how far the shoulder moves up
    if (Math.abs(slide) > 1e-7) { v.S.addScaledVector(v.up, slide * weight); sh.position.copy(sh.parent.worldToLocal(v.p.copy(v.S))); sh.updateMatrixWorld(true); el.getWorldPosition(v.E); v.E2.addScaledVector(v.up, slide * weight); }
    aim(sh, v.S, v.E, v.E2);
    el.getWorldPosition(v.E); wr.getWorldPosition(v.W); aim(el, v.E, v.W, v.W2);
    // the paw: flat on the ground, hanging from the wrist in the air
    wr.getWorldPosition(v.W); toe.getWorldPosition(v.p); const th = hang * C.hang;
    v.Tt.copy(v.W).addScaledVector(v.f, Math.cos(th) * c).addScaledVector(v.up, -Math.sin(th) * c); aim(wr, v.W, v.p, v.Tt);
    if (weight < 1) { /* position: the clip sets it again next frame */ sh.quaternion.slerpQuaternions(g.keep[0], sh.quaternion, weight); el.quaternion.slerpQuaternions(g.keep[1], el.quaternion, weight); wr.quaternion.slerpQuaternions(g.keep[2], wr.quaternion, weight); sh.updateMatrixWorld(true); }
  });
}
