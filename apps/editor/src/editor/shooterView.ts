// The over-the-shoulder camera for a third-person shooter (a Player with a
// ThirdPerson CharacterController and Weapons), the way GTA and Fortnite
// frame it: the view looks where the player aims, from behind and beside
// the character so the crosshair in the middle of the screen is never
// behind their head. Aiming pulls the camera in and narrows the view by the
// weapon's zoom; the shoulder can be swapped. Yaw and pitch follow the
// engine's look convention (yaw 0 looks along -z, + turns left; + pitch
// looks up), so a shot along aimDirection() goes where the crosshair is.
import * as THREE from "three";

export type AimDevice = "mouse" | "gamepad" | "touch";
export const aimDeviceCode: Record<AimDevice, number> = { mouse: 0, gamepad: 1, touch: 2 };

export class ShooterView {
  yaw = 0;
  pitch = -0.05;
  // +1 over the right shoulder, -1 over the left.
  shoulder = 1;
  device: AimDevice = "mouse";
  // 0 at the hip .. 1 aimed, eased.
  aimBlend = 0;
  private shoulderBlend = 1;
  private placed = false;
  private lastYaw = 0;
  private lastPitch = 0;
  // How fast the view is turning (rad/s), smoothed: aim assist's pull only
  // works while the player turns.
  lookSpeed = 0;

  // Starts behind a character facing `bodyYaw` (atan2(x, z) of its facing).
  reset(bodyYaw: number) {
    this.yaw = bodyYaw - Math.PI;
    this.pitch = -0.05;
    this.shoulder = 1;
    this.shoulderBlend = 1;
    this.aimBlend = 0;
    this.placed = false;
    this.lookSpeed = 0;
  }

  // Turns the view by radians (already scaled by sensitivity).
  look(yaw: number, pitch: number) {
    this.yaw = Math.atan2(Math.sin(this.yaw + yaw), Math.cos(this.yaw + yaw));
    this.pitch = THREE.MathUtils.clamp(this.pitch + pitch, -1.2, 1.2);
  }

  swapShoulder() {
    this.shoulder = -this.shoulder;
  }

  // The unit direction the view looks (and the crosshair points).
  aimDirection(target = new THREE.Vector3()): THREE.Vector3 {
    const c = Math.cos(this.pitch);
    return target.set(-Math.sin(this.yaw) * c, Math.sin(this.pitch), -Math.cos(this.yaw) * c);
  }

  // The yaw a character's model takes to face the aim (atan2(x, z)).
  get bodyYaw(): number {
    return this.yaw + Math.PI;
  }

  // Places `view` for a character standing at `feet` and `height` tall.
  // `clear(from, to)` returns how far the camera can go along that line
  // before something blocks it (undefined: nothing does).
  place(
    view: THREE.PerspectiveCamera,
    feet: THREE.Vector3,
    options: { height: number; aiming: boolean; zoom: number; fov: number; dt: number; clear?: (from: THREE.Vector3, to: THREE.Vector3) => number | undefined },
  ) {
    const { dt } = options;
    const ease = (rate: number) => 1 - Math.exp(-dt * rate);
    this.aimBlend += ((options.aiming ? 1 : 0) - this.aimBlend) * ease(12);
    this.shoulderBlend += (this.shoulder - this.shoulderBlend) * ease(10);
    const turned = Math.abs(Math.atan2(Math.sin(this.yaw - this.lastYaw), Math.cos(this.yaw - this.lastYaw))) + Math.abs(this.pitch - this.lastPitch);
    this.lookSpeed += (turned / Math.max(dt, 1e-3) - this.lookSpeed) * ease(15);
    this.lastYaw = this.yaw;
    this.lastPitch = this.pitch;
    // Sized for a 1.75 m person.
    const size = options.height / 1.75;
    const forward = this.aimDirection();
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const pivot = feet.clone().addScaledVector(new THREE.Vector3(0, 1, 0), options.height * 0.92);
    const distance = THREE.MathUtils.lerp(2.6, 1.25, this.aimBlend) * size;
    const side = THREE.MathUtils.lerp(0.55, 0.45, this.aimBlend) * size * this.shoulderBlend;
    // Over the shoulder: beside the head, then back along the view.
    const shoulderPoint = pivot.clone().addScaledVector(right, side).add(new THREE.Vector3(0, 0.08 * size, 0));
    const wanted = shoulderPoint.clone().addScaledVector(forward, -distance);
    let position = wanted;
    if (options.clear) {
      // Neither through a wall beside the character nor behind it.
      const sideRoom = options.clear(pivot, shoulderPoint);
      const from = sideRoom === undefined ? shoulderPoint : pivot.clone().lerp(shoulderPoint, Math.max(0, sideRoom - 0.15) / Math.max(side, 1e-3));
      const back = from.clone().addScaledVector(forward, -distance);
      const room = options.clear(from, back);
      position = room === undefined ? back : from.clone().addScaledVector(forward, -Math.max(0.2, room - 0.2));
    }
    view.position.copy(position);
    view.lookAt(position.clone().add(forward));
    view.fov = options.fov * (1 + (options.zoom - 1) * this.aimBlend);
    view.updateProjectionMatrix();
    this.placed = true;
  }

  get ready(): boolean {
    return this.placed;
  }
}
