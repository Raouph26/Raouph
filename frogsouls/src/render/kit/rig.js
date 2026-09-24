import * as THREE from 'three';
import { PartBuilder } from './builder.js';
import { I } from '../anim/pose.js';

// ─────────────────────────────────────────────────────────────────────────────
// Humanoid rig: a joint hierarchy with a PartBuilder on every bone. Dressers
// (frog.js, boss.js) add primitives in bone-local space, then finalize()
// merges each bone into a single mesh. Joint names match ASSETS.md so a real
// rigged model can replace this later without touching animation code.
// ─────────────────────────────────────────────────────────────────────────────

export const BUILD = {
  normal:  { hipH: .92, torsoH: .46, chestH: .40, chestW: .56, chestD: .36, shoulderW: .34, upperLen: .33, foreLen: .31, thighLen: .44, shinLen: .42, legSpread: .15, limb: 1.00, head: 1.0 },
  lean:    { hipH: .98, torsoH: .48, chestH: .38, chestW: .46, chestD: .30, shoulderW: .29, upperLen: .36, foreLen: .34, thighLen: .48, shinLen: .46, legSpread: .13, limb: .82,  head: .92 },
  heavy:   { hipH: .84, torsoH: .46, chestH: .48, chestW: .86, chestD: .54, shoulderW: .50, upperLen: .32, foreLen: .31, thighLen: .40, shinLen: .38, legSpread: .21, limb: 1.45, head: 1.05 },
  long:    { hipH: .96, torsoH: .50, chestH: .40, chestW: .52, chestD: .34, shoulderW: .36, upperLen: .44, foreLen: .44, thighLen: .46, shinLen: .44, legSpread: .15, limb: .92,  head: .95 },
  crowned: { hipH: .98, torsoH: .50, chestH: .46, chestW: .70, chestD: .44, shoulderW: .44, upperLen: .38, foreLen: .36, thighLen: .46, shinLen: .44, legSpread: .18, limb: 1.2,  head: 1.05 },
  frog:    { hipH: .74, torsoH: .36, chestH: .36, chestW: .58, chestD: .44, shoulderW: .33, upperLen: .28, foreLen: .27, thighLen: .36, shinLen: .36, legSpread: .19, limb: 1.05, head: 1.0 },
};

export function createRig(buildName = 'normal') {
  const S = BUILD[buildName] ?? BUILD.normal;
  const g = () => new THREE.Group();

  const root = g(), body = g();
  root.add(body);

  const pelvis = g(); pelvis.position.y = S.hipH; body.add(pelvis);
  const spine = g(); spine.position.y = 0.06; spine.rotation.order = 'YXZ'; pelvis.add(spine);
  const chest = g(); chest.position.y = S.torsoH; chest.rotation.order = 'YXZ'; spine.add(chest);
  const neck = g(); neck.position.y = S.chestH; chest.add(neck);
  const head = g(); head.rotation.order = 'YXZ'; neck.add(head);
  body.rotation.order = 'YXZ';

  const arm = (side) => {
    const sx = side === 'R' ? -1 : 1;
    const shoulder = g(); shoulder.position.set(sx * S.shoulderW, S.chestH * 0.78, 0); chest.add(shoulder);
    const upper = g(); upper.rotation.order = 'XZY'; shoulder.add(upper);
    const elbow = g(); elbow.position.y = -S.upperLen; upper.add(elbow);
    const fore = g(); elbow.add(fore);
    const wrist = g(); wrist.position.y = -S.foreLen; fore.add(wrist);
    const hand = g(); wrist.add(hand);
    return { shoulder, upper, fore, hand };
  };
  const leg = (side) => {
    const sx = side === 'R' ? -1 : 1;
    const hip = g(); hip.position.set(sx * S.legSpread, 0, 0); pelvis.add(hip);
    const thigh = g(); thigh.rotation.order = 'XZY'; hip.add(thigh);
    const knee = g(); knee.position.y = -S.thighLen; thigh.add(knee);
    const shin = g(); knee.add(shin);
    const ankle = g(); ankle.position.y = -S.shinLen; shin.add(ankle);
    const foot = g(); ankle.add(foot);
    return { hip, thigh, shin, foot };
  };
  const armR = arm('R'), armL = arm('L'), legR = leg('R'), legL = leg('L');

  // the weapon socket: weapon geometry is authored blade-along-+y from the grip;
  // this turns it to point forward out of the fist.
  const socket = g(); socket.rotation.order = 'XYZ';
  armR.hand.add(socket);
  const offhand = g(); offhand.rotation.order = 'XYZ'; armL.hand.add(offhand);

  const joints = { root, body, pelvis, spine, chest, neck, head, socket, offhand,
    upperR: armR.upper, foreR: armR.fore, handR: armR.hand,
    upperL: armL.upper, foreL: armL.fore, handL: armL.hand,
    thighR: legR.thigh, shinR: legR.shin, footR: legR.foot,
    thighL: legL.thigh, shinL: legL.shin, footL: legL.foot };

  const parts = {};
  for (const k of ['pelvis', 'spine', 'chest', 'head', 'upperR', 'foreR', 'handR', 'upperL', 'foreL', 'handL',
    'thighR', 'shinR', 'footR', 'thighL', 'shinL', 'footL']) parts[k] = new PartBuilder();

  const rig = {
    spec: S, root, joints, parts, meshes: [],
    finalize(material) {
      for (const k in parts) {
        const m = parts[k].build(material);
        if (m) { joints[k].add(m); rig.meshes.push(m); }
      }
      return rig;
    },
  };
  return rig;
}

/** Write a pose onto the rig's joints. */
/**
 * @param pivotH height (above the feet) that `pitch` turns around. 0 tips the
 *   whole body over its feet (falls, knockdowns); a roll passes the height of
 *   the tucked body's middle so it tumbles in place instead of through the floor.
 */
export function applyPose(rig, p, pivotH = 0) {
  const J = rig.joints, S = rig.spec;
  const th = p[I.pitch];
  J.body.position.set(0, p[I.drop] + pivotH * (1 - Math.cos(th)), -pivotH * Math.sin(th));
  J.body.rotation.set(th, p[I.twist], p[I.roll]);
  J.pelvis.position.y = S.hipH + p[I.pelvisY];
  J.pelvis.rotation.y = -p[I.pelvisTwist];
  J.spine.rotation.set(p[I.lean], -p[I.spineTwist], p[I.tilt]);
  J.chest.rotation.set(p[I.chestLean], -p[I.chestTwist], 0);
  J.head.rotation.set(p[I.nod], -p[I.look], 0);

  J.upperR.rotation.set(-p[I.rRaise], p[I.rTwist], -p[I.rOut]);
  J.foreR.rotation.x = -p[I.rElbow];
  J.handR.rotation.set(p[I.rWrist], 0, p[I.rWristZ]);
  J.upperL.rotation.set(-p[I.lRaise], -p[I.lTwist], p[I.lOut]);
  J.foreL.rotation.x = -p[I.lElbow];
  J.handL.rotation.set(p[I.lWrist], 0, -p[I.lWristZ]);

  J.thighR.rotation.set(-p[I.rHip], 0, -p[I.rHipOut]);
  J.shinR.rotation.x = p[I.rKnee];
  J.footR.rotation.x = p[I.rAnkle];
  J.thighL.rotation.set(-p[I.lHip], 0, p[I.lHipOut]);
  J.shinL.rotation.x = p[I.lKnee];
  J.footL.rotation.x = p[I.lAnkle];

  // blade out of the fist: +y → forward, then pitch and roll about its own axis
  J.socket.rotation.set(Math.PI / 2 + p[I.wPitch], p[I.wRoll], 0);
}
