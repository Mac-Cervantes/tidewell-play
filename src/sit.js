// Tidewell — sitting on a bench (a tester asked to sit down; Mac: benches only). The pose is made in code on the dummy,
// after the idle has been copied to it: the hips drop to the seat, thighs forward, shins down, hands placed.
// k-space: +z is forward, +y up, the character's left is +x.
import * as THREE from 'three';
import { aimBoneK as aimBone } from './anim.js';
export const SIT = {
  A: { name: 'Upright', hip: 0.37, back: -0.06, hands: 'knees', thigh: -0.1, spread: 0.1, shin: 0.12, arm: [0.2, -0.78, 0.5], fore: [-0.06, -0.45, 0.9] },                 // hands on knees
  B: { name: 'Relaxed', hip: 0.37, back: 0.2, thigh: -0.06, spread: 0.2, shin: 0.5, arm: [0.42, -0.88, -0.12], fore: [0.2, -0.95, 0.2] },             // leaning back, legs out, hands on the seat
  C: { name: 'Kid', hip: 0.37, back: 0.05, thigh: -0.04, spread: 0.1, shin: 0, swing: 0.45, arm: [0.3, -0.9, 0.15], fore: [0.05, -0.9, 0.35] },        // hands on the seat's edge, legs swinging
};
const t = new THREE.Vector3(), q = new THREE.Quaternion(), ax = new THREE.Vector3(1, 0, 0), p = new THREE.Vector3();
// b: the body · o: one of SIT · w: 0..1 how seated · time: seconds (for the swing) · seatY: the seat's height above the ground in metres (or null: o.hip)
export function sitPose(b, o, w, time = 0, seatY = null) {
  const k = b.puppet.k, B = (n) => k.getObjectByName(n); if (w <= 0) return;
  // drop the hips to the seat
  const hips = B('Hips'); k.updateMatrixWorld(true);
  const hy = hips.getWorldPosition(p).y - b.root.getWorldPosition(t).y, want = seatY != null ? seatY + 0.09 : o.hip;
  k.position.y -= (hy - want) * w / (k.parent.getWorldScale(t).y || 1); k.updateMatrixWorld(true);
  // lean the whole upper body from the hips, back straight (bending only the spine arched the back: Mac). The legs are aimed afterwards, so they stay put.
  if (o.back) { hips.getWorldQuaternion(q); const kq = k.getWorldQuaternion(new THREE.Quaternion()), turn = new THREE.Quaternion().setFromAxisAngle(ax, -o.back * w).premultiply(kq).multiply(kq.clone().invert());
    hips.quaternion.copy(hips.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(turn.multiply(q))); hips.updateMatrixWorld(true); }
  for (const [side, sg, ph] of [['Left', 1, 0], ['Right', -1, Math.PI]]) {
    const up = B(side + 'UpLeg'), leg = B(side + 'Leg'), foot = B(side + 'Foot'), toes = B(side + 'Toes');
    aimBone(k, up, leg, t.set(sg * o.spread, o.thigh, 1).normalize(), w);
    const sh = o.shin + (o.swing ? Math.sin(time * 2.6 + ph) * o.swing : 0);
    aimBone(k, leg, foot, t.set(sg * o.spread * 0.4, -1, sh).normalize(), w);
    if (toes) aimBone(k, foot, toes, t.set(0, -0.25 - Math.max(0, sh) * 0.3, 1).normalize(), w);
    const arm = B(side + 'Arm'), fore = B(side + 'ForeArm'), hand = B(side + 'Hand');
    if (o.hands === 'knees') {                                    // reach: the hand lands on top of its own knee, elbow out and back
      const S = k.worldToLocal(arm.getWorldPosition(new THREE.Vector3())), E = k.worldToLocal(fore.getWorldPosition(new THREE.Vector3())), H = k.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
      const K = k.worldToLocal(leg.getWorldPosition(new THREE.Vector3())), a = E.distanceTo(S), c = H.distanceTo(E);
      const T = K.clone().add(new THREE.Vector3(0, a * 0.33, -a * 0.22));                                     // on the thigh just behind the kneecap (palm height above the bone)
      const u = T.clone().sub(S); let d = u.length(); u.divideScalar(d); d = Math.min(a + c - 1e-4 * a, Math.max(Math.abs(a - c) + 1e-4 * a, d));
      const along = (a * a - c * c + d * d) / (2 * d), out = Math.sqrt(Math.max(0, a * a - along * along));
      const n = new THREE.Vector3(sg * 0.8, 0.1, -0.6); n.addScaledVector(u, -n.dot(u)).normalize();
      const E2 = S.clone().addScaledVector(u, along).addScaledVector(n, out);
      aimBone(k, arm, fore, t.copy(E2).sub(S).normalize(), w);
      aimBone(k, fore, hand, t.copy(S).addScaledVector(u, d).sub(E2).normalize(), w);
    } else {
      aimBone(k, arm, fore, t.set(sg * o.arm[0], o.arm[1], o.arm[2]).normalize(), w);
      aimBone(k, fore, hand, t.set(sg * o.fore[0], o.fore[1], o.fore[2]).normalize(), w);
    }
  }
}
