// Foot IK: a standing character's feet follow the ground under them. The animation was made for a flat floor; on a slope one
// foot is above the ground and the other sinks. Each foot's height is shifted by how much the terrain at the foot differs from the
// terrain under the character's root (so a step's lift is kept), the body drops to the lower foot, and each leg is solved with
// two-bone IK (thigh and calf) with the knee bending the way the animation bent it.
import * as THREE from "three";

// Where the knee goes: the point at distance |thigh| from `hip` and |calf| from `target`, on the side the animation's knee was.
export function solveKnee(hip: THREE.Vector3, knee: THREE.Vector3, foot: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  const l1 = knee.distanceTo(hip), l2 = foot.distanceTo(knee);
  const toTarget = target.clone().sub(hip);
  const reach = Math.min(Math.max(toTarget.length(), 1e-4), l1 + l2 - 1e-4);
  const dir = toTarget.normalize();
  // The animation's own bend direction: the knee's offset from the hip-foot line.
  const line = foot.clone().sub(hip).normalize();
  const bend = knee.clone().sub(hip);
  bend.addScaledVector(line, -bend.dot(line));
  bend.addScaledVector(dir, -bend.dot(dir));
  if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1).addScaledVector(dir, -dir.z);
  bend.normalize();
  const along = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
  const out = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  return hip.clone().addScaledVector(dir, along).addScaledVector(bend, out);
}

interface Leg {
  thigh: THREE.Object3D;
  calf: THREE.Object3D;
  foot: THREE.Object3D;
}

const scratch = {
  a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), t: new THREE.Vector3(), k: new THREE.Vector3(),
  q: new THREE.Quaternion(), wq: new THREE.Quaternion(), pq: new THREE.Quaternion(),
};

// Turns `bone` in world space so a vector `from` becomes `to` (both from the bone's position).
function aim(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  const rotation = scratch.q.setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
  bone.getWorldQuaternion(scratch.wq);
  scratch.wq.premultiply(rotation);
  bone.parent!.getWorldQuaternion(scratch.pq);
  bone.quaternion.copy(scratch.pq.invert().multiply(scratch.wq));
  bone.updateMatrixWorld(true);
}

export class FootIK {
  readonly legs: Leg[] = [];
  // The pose of each leg bone before this solver turned it, and what it wrote: when the bone is still exactly what was written, the
  // animation has not set it since (a held or paused pose), so the next solve starts from the original and does not pile on.
  private saved = new Map<THREE.Object3D, { base: THREE.Quaternion; written: THREE.Quaternion }>();
  constructor(readonly root: THREE.Object3D) {
    for (const side of ["l", "r"]) {
      const find = (name: string) => {
        let found: THREE.Object3D | undefined;
        root.traverse((node) => {
          if (!found && (node as THREE.Bone).isBone && node.name === `${name}_${side}`) found = node;
        });
        return found;
      };
      const [thigh, calf, foot] = [find("thigh"), find("calf"), find("foot")];
      if (thigh && calf && foot) this.legs.push({ thigh, calf, foot });
    }
  }

  // `groundAt(x, z)`: the terrain's height, or undefined off the terrain. Returns the drop applied to the body (metres, <= 0).
  apply(groundAt: (x: number, z: number) => number | undefined): number {
    if (this.legs.length < 2) return 0;
    for (const [bone, pose] of this.saved) if (bone.quaternion.equals(pose.written)) bone.quaternion.copy(pose.base);
    this.saved.clear();
    this.root.updateMatrixWorld(true);
    const rootGround = groundAt(this.root.position.x, this.root.position.z);
    if (rootGround === undefined) return 0;
    const deltas = this.legs.map((leg) => {
      leg.foot.getWorldPosition(scratch.a);
      const g = groundAt(scratch.a.x, scratch.a.z);
      return g === undefined ? 0 : THREE.MathUtils.clamp(g - rootGround, -0.5, 0.5);
    });
    const drop = Math.min(0, ...deltas);
    if (Math.abs(drop) > 1e-4) {
      this.root.position.y += drop;
      this.root.updateMatrixWorld(true);
    }
    this.legs.forEach((leg, i) => {
      const lift = deltas[i]! - drop;
      if (Math.abs(lift) < 0.004) return;
      leg.thigh.getWorldPosition(scratch.a);
      leg.calf.getWorldPosition(scratch.b);
      leg.foot.getWorldPosition(scratch.c);
      const bones = [leg.thigh, leg.calf];
      for (const bone of bones) this.saved.set(bone, { base: bone.quaternion.clone(), written: new THREE.Quaternion() });
      scratch.t.copy(scratch.c);
      scratch.t.y += lift;
      scratch.k.copy(solveKnee(scratch.a, scratch.b, scratch.c, scratch.t));
      aim(leg.thigh, scratch.b.clone().sub(scratch.a), scratch.k.clone().sub(scratch.a));
      // The thigh moved the calf and foot; the calf now turns the foot onto the target.
      leg.calf.getWorldPosition(scratch.b);
      leg.foot.getWorldPosition(scratch.c);
      aim(leg.calf, scratch.c.clone().sub(scratch.b), scratch.t.clone().sub(scratch.b));
      for (const bone of bones) this.saved.get(bone)!.written.copy(bone.quaternion);
    });
    return drop;
  }
}
