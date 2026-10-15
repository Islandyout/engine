// On-screen controls for playing on a touch screen: a thumb stick on the
// left (it appears where the thumb lands), a look area on the right, and
// action buttons. They drive a virtual gamepad that main.ts merges with any
// real one, so every game's InputActions (pad_a, pad_rt, pad_lx...) work
// without changes. Shown only in Play on a touch device.

// Standard Gamepad API button indices.
export const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, ls: 10, rs: 11 } as const;

export interface VirtualPad {
  buttons: boolean[]; // standard mapping, 17 entries
  axes: [number, number, number, number]; // left x/y, right x/y
  active: boolean;
}

// The stick's deflection for a thumb at (x, y) that landed at (ox, oy):
// -1..1 per axis, length capped at 1, with a small dead zone.
export function stickVector(ox: number, oy: number, x: number, y: number, radius: number): { x: number; y: number } {
  let dx = (x - ox) / radius,
    dy = (y - oy) / radius;
  const length = Math.hypot(dx, dy);
  if (length < 0.08) return { x: 0, y: 0 };
  if (length > 1) {
    dx /= length;
    dy /= length;
  }
  return { x: dx, y: dy };
}

// A look drag as a right-stick deflection: pixels moved since the last poll
// over `gain` pixels for a full push, capped at 1.
export function lookDeflection(dx: number, dy: number, gain = 14): { x: number; y: number } {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v / gain));
  return { x: clamp(dx), y: clamp(dy) };
}

// Action buttons: a virtual gamepad button each (so InputActions work),
// and a few keys that game scripts read directly.
const PAD_BUTTONS: { label: string; index: number; title: string }[] = [
  { label: "Jump", index: PAD.a, title: "Jump (pad A)" },
  { label: "Attack", index: PAD.x, title: "Light attack / fire (pad X)" },
  { label: "Heavy", index: PAD.y, title: "Heavy attack / interact (pad Y)" },
  { label: "Kick", index: PAD.b, title: "Kick / crouch (pad B)" },
  { label: "Aim", index: PAD.lt, title: "Aim / block (left trigger)" },
  { label: "Fire", index: PAD.rt, title: "Fire (right trigger)" },
  { label: "Sprint", index: PAD.lb, title: "Sprint (left shoulder)" },
  { label: "Reload", index: PAD.rb, title: "Reload / special (right shoulder)" },
  { label: "Dodge", index: PAD.ls, title: "Dodge (left stick press)" },
  { label: "Lock", index: PAD.rs, title: "Lock on (right stick press)" },
];
const KEY_BUTTONS: { label: string; code: string; key: string; title: string }[] = [
  { label: "E", code: "KeyE", key: "e", title: "Use (E)" },
  { label: "G", code: "KeyG", key: "g", title: "Use (G)" },
  { label: "Map", code: "KeyM", key: "m", title: "Map (M)" },
  { label: "Menu", code: "Escape", key: "escape", title: "Pause menu (Escape)" },
];

export interface TouchControls {
  pad: VirtualPad;
  element: HTMLElement;
  sample(): VirtualPad;
  dispose(): void;
}

// `press` sends a key the way a physical keyboard would (for the key
// buttons); everything else goes through `pad`.
export function createTouchControls(root: HTMLElement, press: (code: string, key: string, down: boolean) => void): TouchControls {
  const pad: VirtualPad = { buttons: Array<boolean>(17).fill(false), axes: [0, 0, 0, 0], active: false };
  const layer = document.createElement("div");
  layer.className = "touch-controls";
  const stickZone = document.createElement("div");
  stickZone.className = "touch-stick-zone";
  const base = document.createElement("div");
  base.className = "touch-stick";
  base.hidden = true;
  const knob = document.createElement("div");
  knob.className = "touch-knob";
  base.append(knob);
  stickZone.append(base);
  const lookZone = document.createElement("div");
  lookZone.className = "touch-look-zone";
  const buttons = document.createElement("div");
  buttons.className = "touch-buttons";
  const keys = document.createElement("div");
  keys.className = "touch-keys";
  layer.append(stickZone, lookZone, buttons, keys);
  root.append(layer);

  const RADIUS = 56;
  let stick: { id: number; ox: number; oy: number } | undefined;
  stickZone.addEventListener("pointerdown", (e) => {
    if (stick) return;
    stickZone.setPointerCapture?.(e.pointerId);
    const rect = stickZone.getBoundingClientRect();
    stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
    base.hidden = false;
    base.style.left = `${e.clientX - rect.left}px`;
    base.style.top = `${e.clientY - rect.top}px`;
    knob.style.transform = "translate(-50%, -50%)";
    pad.active = true;
  });
  stickZone.addEventListener("pointermove", (e) => {
    if (!stick || e.pointerId !== stick.id) return;
    const v = stickVector(stick.ox, stick.oy, e.clientX, e.clientY, RADIUS);
    pad.axes[0] = v.x;
    pad.axes[1] = v.y;
    knob.style.transform = `translate(calc(-50% + ${v.x * RADIUS}px), calc(-50% + ${v.y * RADIUS}px))`;
  });
  const endStick = (e: PointerEvent) => {
    if (!stick || e.pointerId !== stick.id) return;
    stick = undefined;
    pad.axes[0] = pad.axes[1] = 0;
    base.hidden = true;
  };
  stickZone.addEventListener("pointerup", endStick);
  stickZone.addEventListener("pointercancel", endStick);

  // Look: finger movement since the last poll becomes right-stick
  // deflection. A tap passes through to what's underneath (the game's own
  // on-screen buttons).
  let look: { id: number; x: number; y: number; sx: number; sy: number; at: number } | undefined;
  let lookDx = 0,
    lookDy = 0;
  lookZone.addEventListener("pointerdown", (e) => {
    if (look) return;
    lookZone.setPointerCapture?.(e.pointerId);
    look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, at: performance.now() };
    pad.active = true;
  });
  lookZone.addEventListener("pointermove", (e) => {
    if (!look || e.pointerId !== look.id) return;
    lookDx += e.clientX - look.x;
    lookDy += e.clientY - look.y;
    look.x = e.clientX;
    look.y = e.clientY;
  });
  const endLook = (e: PointerEvent) => {
    if (!look || e.pointerId !== look.id) return;
    const tap = Math.hypot(e.clientX - look.sx, e.clientY - look.sy) < 10 && performance.now() - look.at < 350;
    look = undefined;
    if (!tap || e.type === "pointercancel") return;
    layer.style.display = "none";
    const under = document.elementFromPoint(e.clientX, e.clientY);
    layer.style.display = "";
    if (!under) return;
    const init = { bubbles: true, clientX: e.clientX, clientY: e.clientY, button: 0, buttons: 1, pointerType: "touch", isPrimary: true };
    under.dispatchEvent(new PointerEvent("pointerdown", init));
    under.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));
  };
  lookZone.addEventListener("pointerup", endLook);
  lookZone.addEventListener("pointercancel", endLook);

  const hold = (b: HTMLButtonElement, set: (down: boolean) => void) => {
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      b.setPointerCapture?.(e.pointerId);
      b.classList.add("is-down");
      set(true);
    });
    const up = () => {
      b.classList.remove("is-down");
      set(false);
    };
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
  };
  const button = (label: string, title: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "touch-button";
    b.textContent = label;
    b.title = title;
    b.setAttribute("aria-label", title);
    return b;
  };
  for (const spec of PAD_BUTTONS) {
    const b = button(spec.label, spec.title);
    b.dataset.pad = String(spec.index);
    hold(b, (down) => {
      pad.buttons[spec.index] = down;
      if (down) pad.active = true;
    });
    buttons.append(b);
  }
  const heldKeys = new Set<string>();
  for (const spec of KEY_BUTTONS) {
    const b = button(spec.label, spec.title);
    b.dataset.key = spec.code;
    hold(b, (down) => {
      if (down === heldKeys.has(spec.code)) return;
      if (down) heldKeys.add(spec.code);
      else heldKeys.delete(spec.code);
      press(spec.code, spec.key, down);
    });
    keys.append(b);
  }

  return {
    pad,
    element: layer,
    // Called once per gamepad poll: turns the look drag into deflection.
    sample() {
      const v = lookDeflection(lookDx, lookDy);
      pad.axes[2] = v.x;
      pad.axes[3] = v.y;
      lookDx = lookDy = 0;
      return pad;
    },
    dispose() {
      for (const code of [...heldKeys]) press(code, "", false);
      pad.buttons.fill(false);
      pad.axes = [0, 0, 0, 0];
      layer.remove();
    },
  };
}
