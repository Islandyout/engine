// Trackpad and touch in the editor viewport. Pure decisions (unit tested);
// main.ts applies them to the orbit camera.
//
// - A mouse wheel zooms, as before.
// - On a trackpad, a two-finger scroll orbits, a pinch zooms (browsers send
//   it as a wheel event with ctrlKey) and Shift + scroll pans.
// - Touch: one finger orbits, two fingers pinch to zoom and drag to pan
//   (OrbitControls), a tap selects, a long press opens the entity menu.

export type WheelDevice = "auto" | "trackpad" | "mouse";

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number; // 0 pixels, 1 lines, 2 pages
  ctrlKey: boolean;
  shiftKey: boolean;
}

export type WheelAction = { kind: "zoom" } | { kind: "orbit" | "pan"; dx: number; dy: number };

// A trackpad sends pixel deltas, often fractional, often sideways and
// small; a wheel sends whole notches (lines in Firefox, ±100 or ±120 pixels
// in Chromium and Safari) straight up and down.
export function looksLikeTrackpad(event: WheelLike): boolean {
  if (event.deltaMode !== 0) return false;
  if (event.deltaX !== 0) return true;
  const y = Math.abs(event.deltaY);
  return !Number.isInteger(event.deltaY) || (y > 0 && y < 40);
}

export function classifyWheel(event: WheelLike, device: WheelDevice): WheelAction {
  if (event.ctrlKey) return { kind: "zoom" }; // a pinch, or Ctrl + wheel
  const trackpad = device === "trackpad" || (device === "auto" && looksLikeTrackpad(event));
  if (!trackpad) return { kind: "zoom" };
  // Pixel deltas; lines and pages scaled to roughly pixels.
  const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
  const dx = event.deltaX * scale,
    dy = event.deltaY * scale;
  return { kind: event.shiftKey ? "pan" : "orbit", dx, dy };
}

// A press that barely moved: a tap if released quickly, a long press once
// held past HOLD_MS.
export const TAP_SLOP = 10;
export const TAP_MS = 500;
export const HOLD_MS = 550;

export function pressKind(dx: number, dy: number, ms: number): "tap" | "hold" | "drag" | "pending" {
  if (Math.hypot(dx, dy) > TAP_SLOP) return "drag";
  if (ms >= HOLD_MS) return "hold";
  return ms <= TAP_MS ? "tap" : "pending";
}
