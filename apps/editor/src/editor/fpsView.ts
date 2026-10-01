// First-person view math (0.60.0), independent of three.js so it can be unit
// tested: mouse/stick look, and the camera effects layered on the player's
// eye position -- head bob, a landing dip, crouch easing and a sprint FOV
// kick. main.ts places the camera from the result.

export interface Look {
  yaw: number; // radians; 0 looks down -z, positive turns left
  pitch: number; // radians; positive looks up
}

export const maxPitch = 1.55; // just short of straight up/down
const radiansPerPixel = 0.0022;
const stickRadiansPerSecond = 2.6;
const stickDeadZone = 0.15;

function clampPitch(look: Look) {
  look.pitch = Math.max(-maxPitch, Math.min(maxPitch, look.pitch));
}

// Mouse movement in CSS pixels (movementX/Y).
export function applyMouseLook(look: Look, dx: number, dy: number, sensitivity: number, invertY: boolean) {
  look.yaw -= dx * radiansPerPixel * sensitivity;
  look.pitch -= dy * radiansPerPixel * sensitivity * (invertY ? -1 : 1);
  clampPitch(look);
}

// A right stick, -1..1 per axis, held for dt seconds.
export function applyStickLook(
  look: Look,
  x: number,
  y: number,
  dt: number,
  sensitivity: number,
  invertY: boolean,
) {
  const dead = (v: number) => (Math.abs(v) < stickDeadZone ? 0 : (v - Math.sign(v) * stickDeadZone) / (1 - stickDeadZone));
  look.yaw -= dead(x) * stickRadiansPerSecond * sensitivity * dt;
  look.pitch -= dead(y) * stickRadiansPerSecond * sensitivity * dt * (invertY ? -1 : 1);
  clampPitch(look);
}

export interface ViewInput {
  speed: number; // horizontal ground speed
  grounded: boolean;
  landingSpeed: number; // downward speed on a landing tick, else 0
  eyeHeight: number; // target eye height above the feet
  sprinting: boolean;
  headBob: number; // 0 = off, 1 = normal
}

export interface ViewOffsets {
  eyeHeight: number; // eased eye height above the feet
  x: number; // camera-local sideways bob
  y: number; // vertical bob plus landing dip
  roll: number; // radians
  fovAdd: number; // degrees
}

export class ViewEffects {
  private phase = 0;
  private bobAmount = 0;
  private dip = 0;
  private dipVelocity = 0;
  private eye: number | undefined;
  private fovAdd = 0;

  step(dt: number, input: ViewInput): ViewOffsets {
    // Crouching and standing ease over about a tenth of a second.
    this.eye = this.eye === undefined ? input.eyeHeight : this.eye + (input.eyeHeight - this.eye) * (1 - Math.exp(-dt * 14));
    // Bob: one up-down cycle per footstep, fading in and out with speed.
    const moving = input.grounded && input.speed > 0.5 ? Math.min(input.speed / 4.5, 1.6) : 0;
    this.bobAmount += (moving - this.bobAmount) * (1 - Math.exp(-dt * 10));
    this.phase += dt * (5.2 + input.speed * 0.9) * (moving > 0 ? 1 : 0);
    // Landing: a damped spring kicked downward by the impact speed.
    if (input.landingSpeed > 2) this.dipVelocity -= Math.min(input.landingSpeed, 20) * 0.13;
    const stiffness = 120,
      damping = 14;
    this.dipVelocity += (-stiffness * this.dip - damping * this.dipVelocity) * dt;
    this.dip += this.dipVelocity * dt;
    this.fovAdd += ((input.sprinting ? 6 : 0) - this.fovAdd) * (1 - Math.exp(-dt * 8));
    const bob = this.bobAmount * input.headBob;
    return {
      eyeHeight: this.eye,
      x: Math.cos(this.phase) * 0.025 * bob,
      y: -Math.abs(Math.sin(this.phase)) * 0.045 * bob + this.dip,
      roll: Math.cos(this.phase) * 0.004 * bob,
      fovAdd: this.fovAdd,
    };
  }

  reset() {
    this.phase = 0;
    this.bobAmount = 0;
    this.dip = 0;
    this.dipVelocity = 0;
    this.eye = undefined;
    this.fovAdd = 0;
  }
}
