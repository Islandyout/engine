// Player settings and platform helpers (0.73.0): a settings panel (quality
// preset, look sensitivity and inversion, reduced motion, minimap,
// footprints, touch controls), a screen-reader announcer, on-screen touch
// controls that press the same keys a keyboard would, and a frame-time
// capture for profiling. Kept per browser in localStorage.
//
// GATEBREAKER M4 added the comfort settings: master, music and effects
// volume, brightness, ink line strength, impact flashes, camera shake, hold
// or toggle block, the minimap's size, and the key list with rebinding (a
// per-game swap of physical keys, so a game's actions and its scripts' own
// keys move together). The panel doubles as a pause menu (hud.pause_menu).

export type QualityPreset = "low" | "medium" | "high";
export type MinimapSize = "small" | "medium" | "large";

export interface PlayerSettings {
  quality: QualityPreset;
  sensitivity: number; // look multiplier, 0.5..1.5
  invertY: boolean;
  reducedMotion: boolean;
  minimap: boolean;
  footprints: boolean;
  touch: "auto" | "on" | "off";
  // Flying (0.75.0): the mouse steers the ship (a virtual stick, captured
  // by a click) or only looks around it.
  flightMouse: "steer" | "look";
  // Volumes 0..1 over the scene's own mix.
  master: number;
  music: number;
  sfx: number; // effects: sounds, ambience and interface cues
  brightness: number; // exposure multiplier, 0.6..1.6
  ink: number; // ink line strength over the scene's, 0..1.5
  flash: number; // impact-frame flashes, 0..1
  shake: boolean; // camera shake
  blockToggle: boolean; // block: one press raises it, the next lowers it
  minimapSize: MinimapSize; // read by the minimap
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
  master: 1,
  music: 0.85,
  sfx: 1,
  brightness: 1,
  ink: 1,
  flash: 1,
  shake: true,
  blockToggle: false,
  minimapSize: "medium",
};

const clampNumber = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

export function parseSettings(text: string | null): PlayerSettings {
  try {
    const v = JSON.parse(text ?? "{}") as Partial<PlayerSettings>;
    const d = defaultSettings;
    return {
      quality: v.quality === "low" || v.quality === "medium" || v.quality === "high" ? v.quality : d.quality,
      sensitivity: clampNumber(v.sensitivity, 0.5, 1.5, d.sensitivity),
      invertY: v.invertY === true,
      reducedMotion: v.reducedMotion === true,
      minimap: v.minimap !== false,
      footprints: v.footprints !== false,
      touch: v.touch === "on" || v.touch === "off" ? v.touch : "auto",
      flightMouse: v.flightMouse === "look" ? "look" : "steer",
      master: clampNumber(v.master, 0, 1, d.master),
      music: clampNumber(v.music, 0, 1, d.music),
      sfx: clampNumber(v.sfx, 0, 1, d.sfx),
      brightness: clampNumber(v.brightness, 0.6, 1.6, d.brightness),
      ink: clampNumber(v.ink, 0, 1.5, d.ink),
      flash: clampNumber(v.flash, 0, 1, d.flash),
      shake: v.shake !== false,
      blockToggle: v.blockToggle === true,
      minimapSize: v.minimapSize === "small" || v.minimapSize === "large" ? v.minimapSize : "medium",
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

// -- Keys (M4) ----------------------------------------------------------------
// A game's InputActions name keys ("space", "q", "shift"); the browser
// reports KeyboardEvent.code ("Space", "KeyQ", "ShiftLeft"). Rebinding
// swaps two physical keys: a KeyRemap maps a pressed code to the code the
// game sees, and stays a permutation, so no key is ever lost.
export type KeyRemap = Record<string, string>;

const namedCodes: Record<string, string> = {
  space: "Space",
  enter: "Enter",
  escape: "Escape",
  tab: "Tab",
  backspace: "Backspace",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  shift: "ShiftLeft",
  rshift: "ShiftRight",
  ctrl: "ControlLeft",
  rctrl: "ControlRight",
  alt: "AltLeft",
  ralt: "AltRight",
};

export function codeForBinding(name: string): string | undefined {
  if (/^[a-z]$/.test(name)) return `Key${name.toUpperCase()}`;
  if (/^[0-9]$/.test(name)) return `Digit${name}`;
  if (/^f([1-9]|1[0-2])$/.test(name)) return name.toUpperCase();
  return namedCodes[name];
}

// "KeyQ" -> "Q", "ShiftLeft" -> "Shift".
export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  const named: Record<string, string> = {
    ShiftLeft: "Shift",
    ShiftRight: "Right Shift",
    ControlLeft: "Ctrl",
    ControlRight: "Right Ctrl",
    AltLeft: "Alt",
    AltRight: "Right Alt",
  };
  if (named[code]) return named[code]!;
  if (code.startsWith("Arrow")) return `${code.slice(5)} arrow`;
  return code;
}

// The KeyboardEvent.key a script sees for a code a remap hands it.
export function keyForCode(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (code === "Space") return " ";
  if (code.startsWith("Shift")) return "shift";
  if (code.startsWith("Control")) return "control";
  if (code.startsWith("Alt")) return "alt";
  return code.toLowerCase();
}

// The physical key that gives the game `code`.
export function physicalFor(remap: KeyRemap, code: string): string {
  for (const [physical, logical] of Object.entries(remap)) if (logical === code) return physical;
  return code;
}

// Pressing `physical` gives the game `code` from now on; the key that gave
// `code` takes over whatever `physical` gave.
export function rebind(remap: KeyRemap, code: string, physical: string): KeyRemap {
  const next = { ...remap };
  const old = physicalFor(next, code);
  const displaced = next[physical] ?? physical;
  next[physical] = code;
  if (old !== physical) next[old] = displaced;
  for (const [k, v] of Object.entries(next)) if (k === v) delete next[k];
  return next;
}

export interface BindingRow {
  action: string;
  label: string;
  code?: string; // the key the game binds it to, rebindable
  other: string; // its other sources, readable
}

const actionLabels: Record<string, string> = {
  move_x: "Move left / right",
  move_y: "Move forward / back",
  look_x: "Look",
  look_y: "",
  light: "Attack",
  heavy: "Heavy attack",
  dodge: "Dodge",
  block: "Block / parry",
  skill1: "Skill 1",
  skill2: "Skill 2",
  skill3: "Skill 3",
  ultimate: "Ultimate",
  lock: "Lock on",
  interact: "Interact",
};
const sourceLabels: Record<string, string> = {
  mouse_left: "Left click",
  mouse_right: "Right click",
  mouse_middle: "Middle click",
  mouse_dx: "Mouse",
  mouse_dy: "Mouse",
  wheel: "Wheel",
};

// An InputActions text as rows: each action's first key (rebindable) and
// its other keyboard and mouse sources as text. Gamepad sources are left out.
export function bindingRows(text: string): BindingRow[] {
  const rows: BindingRow[] = [];
  for (const raw of text.split("\n")) {
    const m = /^([\w.]+)\s*:\s*(.*)$/.exec(raw.replace(/#.*/, "").trim());
    if (!m) continue;
    const action = m[1]!;
    const label = actionLabels[action] ?? action.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
    if (!label) continue;
    const sources = m[2]!
      .split(",")
      .map((s) => s.trim().replace(/^-/, "").replace(/\*.*$/, ""))
      .filter((s) => s && !s.startsWith("pad_"));
    const axis = action.startsWith("move_") || action.startsWith("look_");
    const code = axis ? undefined : sources.map(codeForBinding).find((c) => c);
    const rest = sources
      .filter((s) => !code || codeForBinding(s) !== code)
      .map((s) => sourceLabels[s] ?? (codeForBinding(s) ? keyLabel(codeForBinding(s)!) : s));
    rows.push({ action, label, code, other: [...new Set(rest)].join(", ") });
  }
  return rows;
}

const remapStoreKey = (game: string) => `game-engine-player:keys:${encodeURIComponent(game)}`;
export function loadKeyRemap(game: string): KeyRemap {
  try {
    const v = JSON.parse(localStorage.getItem(remapStoreKey(game)) ?? "{}") as unknown;
    if (!v || typeof v !== "object") return {};
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return {};
  }
}
export function storeKeyRemap(game: string, remap: KeyRemap) {
  try {
    if (Object.keys(remap).length) localStorage.setItem(remapStoreKey(game), JSON.stringify(remap));
    else localStorage.removeItem(remapStoreKey(game));
  } catch {
    // As storeSettings.
  }
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
  input.setAttribute("aria-label", labelText);
  label.append(span, input);
  return label;
}

export interface SettingsPanelOptions {
  onProfile?: () => void;
  onClose?: () => void;
  // As a pause menu: the title says so and Done reads Resume.
  paused?: boolean;
  // The game's InputActions text, for the key list, with its rebinding.
  bindings?: string;
  remap?: KeyRemap;
  onRemap?: (remap: KeyRemap) => void;
}

// The settings panel; close() (or Done, Esc in the caller, a click outside)
// removes it and calls onClose.
export function openSettingsPanel(root: HTMLElement, settings: PlayerSettings, onChange: (s: PlayerSettings) => void, options: SettingsPanelOptions = {}) {
  root.querySelector("#player-settings")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "player-settings";
  overlay.className = "games-library";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", options.paused ? "Paused: settings" : "Settings");
  const panel = document.createElement("div");
  panel.className = "games-panel settings-panel";
  const title = document.createElement("h2");
  title.textContent = options.paused ? "Paused" : "Settings";
  panel.append(title);
  if (options.paused) {
    const note = document.createElement("p");
    note.className = "settings-note";
    note.textContent = "The game waits while this is open. Esc, Resume or a click outside goes back.";
    panel.append(note);
  }
  const update = (patch: Partial<PlayerSettings>) => {
    Object.assign(settings, patch);
    storeSettings(settings);
    onChange(settings);
  };
  const section = (text: string) => {
    const h = document.createElement("h4");
    h.textContent = text;
    panel.append(h);
  };
  type NumberKey = "sensitivity" | "master" | "music" | "sfx" | "brightness" | "ink" | "flash";
  const slider = (key: NumberKey, text: string, min: number, max: number, step = 0.05) => {
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(settings[key]);
    input.oninput = () => update({ [key]: Number(input.value) });
    panel.append(row(text, input));
  };
  type BoolKey = "invertY" | "reducedMotion" | "minimap" | "footprints" | "shake";
  const check = (key: BoolKey, text: string) => {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = settings[key];
    box.onchange = () => update({ [key]: box.checked });
    panel.append(row(text, box));
  };
  const choice = <T extends string>(text: string, value: T, entries: [T, string][], set: (v: T) => void) => {
    const select = document.createElement("select");
    for (const [v, label] of entries) select.add(new Option(label, v, false, value === v));
    select.onchange = () => set(select.value as T);
    panel.append(row(text, select));
  };

  section("Display");
  choice("Graphics quality", settings.quality, [["low", "Low"], ["medium", "Medium"], ["high", "High"]], (quality) => update({ quality }));
  slider("brightness", "Brightness", 0.6, 1.6);
  slider("ink", "Ink lines", 0, 1.5);
  slider("flash", "Impact flashes", 0, 1);
  check("shake", "Camera shake");
  check("reducedMotion", "Reduced motion (no shake, no drifting particles)");

  section("Sound");
  slider("master", "Master volume", 0, 1);
  slider("music", "Music", 0, 1);
  slider("sfx", "Effects", 0, 1);

  section("Controls");
  slider("sensitivity", "Look sensitivity", 0.5, 1.5);
  check("invertY", "Invert look Y");
  const rows = options.bindings ? bindingRows(options.bindings) : [];
  if (rows.some((r) => r.action === "block"))
    choice("Block", settings.blockToggle ? "toggle" : "hold", [["hold", "Hold"], ["toggle", "Toggle (press again to lower)"]], (v) => update({ blockToggle: v === "toggle" }));
  choice("Mouse while flying", settings.flightMouse, [["steer", "Steers the ship"], ["look", "Looks around"]], (flightMouse) => update({ flightMouse }));
  choice("Touch controls", settings.touch, [["auto", "Automatic"], ["on", "Always"], ["off", "Never"]], (touch) => update({ touch }));

  section("Interface");
  check("minimap", "Minimap");
  choice("Minimap size", settings.minimapSize, [["small", "Small"], ["medium", "Medium"], ["large", "Large"]], (minimapSize) => update({ minimapSize }));
  check("footprints", "Footprints");

  // The keys: click one, then press its new key (Esc cancels).
  let stopCapture = () => {};
  if (rows.length) {
    section("Keys");
    let remap = { ...(options.remap ?? {}) };
    const list = document.createElement("div");
    list.className = "settings-keys";
    const note = document.createElement("p");
    note.className = "settings-note";
    note.textContent = "Click a key, then press the new one (Esc cancels). Two actions never share a key: they swap.";
    const draw = () => {
      list.replaceChildren();
      for (const r of rows) {
        const line = document.createElement("div");
        line.className = "settings-row";
        line.dataset.action = r.action;
        const name = document.createElement("span");
        name.textContent = r.label;
        const keys = document.createElement("span");
        keys.className = "settings-key-cell";
        if (r.code) {
          const button = document.createElement("button");
          button.className = "btn btn-sm settings-key";
          button.textContent = keyLabel(physicalFor(remap, r.code));
          button.setAttribute("aria-label", `${r.label}: ${button.textContent}. Change`);
          button.onclick = () => {
            stopCapture();
            button.textContent = "Press a key…";
            const capture = (e: KeyboardEvent) => {
              e.preventDefault();
              e.stopImmediatePropagation();
              stopCapture();
              if (e.code !== "Escape" && e.code) {
                remap = rebind(remap, r.code!, e.code);
                options.onRemap?.(remap);
              }
              draw();
            };
            window.addEventListener("keydown", capture, true);
            stopCapture = () => {
              window.removeEventListener("keydown", capture, true);
              stopCapture = () => {};
            };
          };
          keys.append(button);
        }
        if (r.other) keys.append(` ${r.code ? "· " : ""}${r.other}`);
        line.append(name, keys);
        list.append(line);
      }
    };
    draw();
    const reset = document.createElement("button");
    reset.className = "btn btn-sm";
    reset.textContent = "Reset keys";
    reset.onclick = () => {
      stopCapture();
      remap = {};
      options.onRemap?.(remap);
      draw();
    };
    panel.append(note, list, reset);
  }

  const actions = document.createElement("div");
  actions.className = "game-actions";
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    stopCapture();
    overlay.remove();
    options.onClose?.();
  };
  if (options.onProfile) {
    const profile = document.createElement("button");
    profile.className = "btn btn-sm";
    profile.textContent = "Capture 60 s profile";
    profile.onclick = () => {
      close();
      options.onProfile!();
    };
    actions.append(profile);
  }
  const done = document.createElement("button");
  done.className = "btn btn-sm btn-primary";
  done.textContent = options.paused ? "Resume" : "Done";
  done.onclick = close;
  actions.append(done);
  panel.append(actions);
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  overlay.append(panel);
  root.append(overlay);
  return { close, element: overlay };
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
