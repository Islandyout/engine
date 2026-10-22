// Secondary motion for hanging cloth and hair: skirts, robes and long hair lag behind a character's movement, swing out when it
// turns and flutter a little when it stands. It is a vertex shader on the worn piece (no bones to simulate): each vertex below
// the piece's anchor height is pushed against the character's velocity by how far down it hangs, plus a slow ripple.
import * as THREE from "three";

// Gear ids that hang, with where they hang from and to (model height, metres): [top, bottom].
export const hangingPieces: Record<number, [number, number]> = {
  354: [1.0, 0.2], // long skirt (hunter rig)
  355: [1.5, 0.8], // outer robe
  357: [1.75, 1.2], // long hair (hunter rig)
  361: [1.75, 1.15], // long hair (base body)
  362: [1.78, 1.5], // buns
};

export interface Sway {
  velocity: { value: THREE.Vector3 };
  time: { value: number };
}

export function makeSway(): Sway {
  return { velocity: { value: new THREE.Vector3() }, time: { value: 0 } };
}

// Patches a material (already this piece's own copy) to sway.
export function swayMaterial(material: THREE.Material, sway: Sway, top: number, bottom: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSwayVelocity = sway.velocity;
    shader.uniforms.uSwayTime = sway.time;
    shader.uniforms.uSwayTop = { value: top };
    shader.uniforms.uSwayBottom = { value: bottom };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uSwayVelocity;\nuniform float uSwayTime, uSwayTop, uSwayBottom;")
      .replace(
        "#include <skinning_vertex>",
        `#include <skinning_vertex>
{
  // 0 at the anchor, 1 at the hem; squared so the top follows the body and the hem swings.
  float hang = clamp((uSwayTop - transformed.y) / max(uSwayTop - uSwayBottom, 0.05), 0.0, 1.0);
  hang *= hang;
  vec3 drift = -uSwayVelocity * 0.11 * hang;
  float ripple = sin(uSwayTime * 2.3 + transformed.y * 5.0 + transformed.x * 4.0) * 0.006 * hang;
  transformed += vec3(drift.x + ripple, min(drift.y, 0.0) * 0.4 - abs(drift.x + drift.z) * 0.25 * hang, drift.z + ripple * 0.6);
}`,
      );
  };
  material.customProgramCacheKey = () => `cloth-sway-${top}-${bottom}`;
  material.needsUpdate = true;
}

// Follows characters' movement and feeds each its velocity in its own frame (z forward), smoothed.
export class SwayTracker {
  private readonly tracked = new Map<THREE.Object3D, { sway: Sway; last: THREE.Vector3; smooth: THREE.Vector3 }>();
  private readonly world = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();

  track(anchor: THREE.Object3D, sway: Sway) {
    this.tracked.set(anchor, { sway, last: anchor.getWorldPosition(new THREE.Vector3()), smooth: new THREE.Vector3() });
  }

  forget(anchor: THREE.Object3D) {
    this.tracked.delete(anchor);
  }

  update(dt: number, time: number, near: (anchor: THREE.Object3D) => boolean) {
    if (dt <= 0) return;
    for (const [anchor, entry] of this.tracked) {
      if (!anchor.parent) {
        this.tracked.delete(anchor);
        continue;
      }
      entry.sway.time.value = time;
      if (!near(anchor)) continue;
      anchor.getWorldPosition(this.world);
      const velocity = this.world.clone().sub(entry.last).divideScalar(dt);
      entry.last.copy(this.world);
      // A teleport (a respawn, a door) is not a run.
      if (velocity.lengthSq() > 400) velocity.set(0, 0, 0);
      // Into the character's frame, then smoothed: cloth does not snap to a new speed.
      anchor.getWorldQuaternion(this.quaternion).invert();
      velocity.applyQuaternion(this.quaternion);
      entry.smooth.lerp(velocity, 1 - Math.exp(-dt * 7));
      entry.sway.velocity.value.copy(entry.smooth);
    }
  }
}
