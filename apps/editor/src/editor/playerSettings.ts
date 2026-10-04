// Player settings and platform helpers (0.73.0): a settings panel (quality
// preset, look sensitivity and inversion, reduced motion, minimap,
// footprints, touch controls), a screen-reader announcer, on-screen touch
// controls that press the same keys a keyboard would, and a frame-time
// capture for profiling. Kept per browser in localStorage.

export type QualityPreset = "low" | "medium" | "high";

export interface PlayerSettings {
  quality: QualityPreset;
  sensitivity: number; // look multiplier, 0.25..3
  invertY: boolean;
  reducedMotion: boolean;
  minimap: boolean;
  footprints: boolean;
  touch: "auto" | "on" | "off";
  // Flying (0.75.0): the mouse steers the ship (a virtual stick, captured
  // by a click) or only looks around it.
  flightMouse: "steer" | "look";
}

const KEY = "game-engine-player:settings";
export const defaultSettings: PlayerSettings = {
  quality: "high",
  sensitivity: 1,
  invertY: false,
  reducedMotion: false,
  minimap: true,
  footprints: true,
  touch: "auto",
  flightMouse: "steer",
};

export function parseSettings(text: string | null): PlayerSettings {
  try {
    const v = JSON.parse(text ?? "{}") as Partial<PlayerSettings>;
    return {
      quality: v.quality === "low" || v.quality === "medium" || v.quality === "high" ? v.quality : defaultSettings.quality,
      sensitivity: typeof v.sensitivity === "number" && Number.isFinite(v.sensitivity) ? Math.min(3, Math.max(0.25, v.sensitivity)) : 1,
      invertY: v.invertY === true,
      reducedMotion: v.reducedMotion === true,
      minimap: v.minimap !== false,
      footprints: v.footprints !== false,
      touch: v.touch === "on" || v.touch === "off" ? v.touch : "auto",
      flightMouse: v.flightMouse === "look" ? "look" : "steer",
    };
  } catch {
    return { ...defaultSettings };
  }
}

export function loadSettings(): PlayerSettings {
  try {
    return parseSettings(localStorage.getItem(KEY));
  } catch {
    return { ...defaultSettings };
  }
}

export function storeSettings(settings: PlayerSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private mode / blocked storage: settings last this session only.
  }
}

// What a quality preset changes: maximum pixel ratio, shadows, post effects.
export function qualityProfile(preset: QualityPreset) {
  return {
    low: { pixelRatio: 0.75, shadows: false, bloom: false, scatter: 0.5 },
    medium: { pixelRatio: 1, shadows: true, bloom: false, scatter: 0.75 },
    high: { pixelRatio: 2, shadows: true, bloom: true, scatter: 1 },
  }[preset];
}

// Frame-time percentiles over a capture.
export function summarizeFrames(frames: number[]) {
  if (!frames.length) return { frames: 0, average: 0, p50: 0, p95: 0, p99: 0, fps: 0 };
  const sorted = [...frames].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  const average = frames.reduce((a, b) => a + b, 0) / frames.length;
  return { frames: frames.length, average, p50: at(0.5), p95: at(0.95), p99: at(0.99), fps: 1000 / average };
}

export function isTouchDevice() {
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
}

// A polite live region for screen readers.
export class Announcer {
  private readonly region: HTMLDivElement;
  private last = "";
  constructor(root: HTMLElement) {
    this.region = document.createElement("div");
    this.region.setAttribute("aria-live", "polite");
    this.region.className = "sr-only";
    root.appendChild(this.region);
  }
  say(text: string) {
    if (!text || text === this.last) return;
    this.last = text;
    this.region.textContent = text;
  }
}

function row(labelText: string, input: HTMLElement) {
  const label = document.createElement("label");
  label.className = "settings-row";
  const span = document.createElement("span");
  span.textContent = labelText;
  label.append(span, input);
  return label;
}

export function openSettingsPanel(root: HTMLElement, settings: PlayerSettings, onChange: (s: PlayerSettings) => void, onProfile?: () => void) {
  root.querySelector("#player-settings")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "player-settings";
  overlay.className = "games-library";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Settings");
  const panel = document.createElement("div");
  panel.className = "games-panel settings-panel";
  const title = document.createElement("h2");
  title.textContent = "Settings";
  panel.append(title);
  const update = (patch: Partial<PlayerSettings>) => {
    Object.assign(settings, patch);
    storeSettings(settings);
    onChange(settings);
  };
  const quality = document.createElement("select");
  for (const q of ["low", "medium", "high"]) quality.add(new Option(q[0]!.toUpperCase() + q.slice(1), q, false, settings.quality === q));
  quality.onchange = () => update({ quality: quality.value as QualityPreset });
  panel.append(row("Graphics quality", quality));
  const sensitivity = document.createElement("input");
  sensitivity.type = "range";
  sensitivity.min = "0.25";
  sensitivity.max = "3";
  sensitivity.step = "0.05";
  sensitivity.value = String(settings.sensitivity);
  sensitivity.oninput = () => update({ sensitivity: Number(sensitivity.value) });
  panel.append(row("Look sensitivity", sensitivity));
  const flightMouse = document.createElement("select");
  flightMouse.add(new Option("Steers the ship", "steer", false, settings.flightMouse === "steer"));
  flightMouse.add(new Option("Looks around", "look", false, settings.flightMouse === "look"));
  flightMouse.onchange = () => update({ flightMouse: flightMouse.value as "steer" | "look" });
  panel.append(row("Mouse while flying", flightMouse));
  const check = (key: "invertY" | "reducedMotion" | "minimap" | "footprints", text: string) => {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = settings[key];
    box.onchange = () => update({ [key]: box.checked });
    panel.append(row(text, box));
  };
  check("invertY", "Invert look Y");
  check("reducedMotion", "Reduced motion (no shake, no drifting particles)");
  check("minimap", "Minimap");
  check("footprints", "Footprints");
  const touch = document.createElement("select");
  for (const t of ["auto", "on", "off"]) touch.add(new Option(t === "auto" ? "Automatic" : t === "on" ? "Always" : "Never", t, false, settings.touch === t));
  touch.onchange = () => update({ touch: touch.value as PlayerSettings["touch"] });
  panel.append(row("Touch controls", touch));
  const actions = document.createElement("div");
  actions.className = "game-actions";
  if (onProfile) {
    const profile = document.createElement("button");
    profile.className = "btn btn-sm";
    profile.textContent = "Capture 60 s profile";
    profile.onclick = () => {
      onProfile();
      overlay.remove();
    };
    actions.append(profile);
  }
  const close = document.createElement("button");
  close.className = "btn btn-sm btn-primary";
  close.textContent = "Done";
  close.onclick = () => overlay.remove();
  actions.append(close);
  panel.append(actions);
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
  overlay.append(panel);
  root.append(overlay);
}

// On-screen controls for touch: a movement stick (WASD) and buttons, each
// pressing a key code the way a physical keyboard would.
export function createTouchControls(root: HTMLElement, press: (code: string, key: string, down: boolean) => void) {
  const layer = document.createElement("div");
  layer.className = "touch-controls";
  const stick = document.createElement("div");
  stick.className = "touch-stick";
  const knob = document.createElement("div");
  knob.className = "touch-knob";
  stick.append(knob);
  layer.append(stick);
  const held = new Set<string>();
  const set = (code: string, key: string, on: boolean) => {
    if (on === held.has(code)) return;
    if (on) held.add(code);
    else held.delete(code);
    press(code, key, on);
  };
  const move = (dx: number, dy: number) => {
    knob.style.transform = `translate(${dx * 36}px, ${dy * 36}px)`;
    set("KeyW", "w", dy < -0.35);
    set("KeyS", "s", dy > 0.35);
    set("KeyA", "a", dx < -0.35);
    set("KeyD", "d", dx > 0.35);
  };
  let origin: { x: number; y: number; id: number } | undefined;
  stick.addEventListener("pointerdown", (e) => {
    origin = { x: e.clientX, y: e.clientY, id: e.pointerId };
    stick.setPointerCapture(e.pointerId);
  });
  stick.addEventListener("pointermove", (e) => {
    if (!origin || e.pointerId !== origin.id) return;
    const dx = Math.max(-1, Math.min(1, (e.clientX - origin.x) / 40));
    const dy = Math.max(-1, Math.min(1, (e.clientY - origin.y) / 40));
    move(dx, dy);
  });
  const release = () => {
    origin = undefined;
    move(0, 0);
  };
  stick.addEventListener("pointerup", release);
  stick.addEventListener("pointercancel", release);
  const buttons = document.createElement("div");
  buttons.className = "touch-buttons";
  for (const [label, code, key] of [
    ["E", "KeyE", "e"],
    ["SCAN", "KeyF", "f"],
    ["UP", "Space", " "],
    ["DOWN", "KeyC", "c"],
    ["THR+", "ShiftLeft", "shift"],
    ["CUT", "KeyX", "x"],
    ["NAV", "KeyN", "n"],
    ["MAP", "KeyM", "m"],
    ["JRNL", "KeyJ", "j"],
    ["MENU", "KeyP", "p"],
  ] as const) {
    const b = document.createElement("button");
    b.className = "touch-button";
    b.textContent = label;
    b.setAttribute("aria-label", label);
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      set(code, key, true);
    });
    const up = () => set(code, key, false);
    b.addEventListener("pointerup", up);
    b.addEventListener("pointerleave", up);
    b.addEventListener("pointercancel", up);
    buttons.append(b);
  }
  layer.append(buttons);
  root.append(layer);
  return {
    element: layer,
    dispose() {
      for (const code of [...held]) press(code, "", false);
      layer.remove();
    },
  };
}
