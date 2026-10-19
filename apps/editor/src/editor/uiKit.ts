// The UI kit: 21 ready-made game UI widgets (the Widget kind of the UI
// component), each in six styles taken from shipped games: Modern (Apex
// Legends, Valorant), Battle Royale (Fortnite), Tactical (The Division,
// Call of Duty), Fantasy (Elden Ring, Zelda), Sci-fi (Destiny, Halo) and
// Minimal. docs/UI_KIT.md lists the references for each widget.
//
// A widget paints itself on the HUD canvas from the live game (UIData,
// gathered by main.ts every frame) or, while editing, from sample data,
// and returns the regions a click acts on (menus, sliders, the wheel).
import type { UIAnchor, UIStyle, UIVisibility, UIWidget } from "../scene/Components";
import { uiStyleNames, uiWidgetNames } from "../scene/Components";
import type { UIRect } from "./uiLayout";
import { rarityColors } from "./lootView";

export { uiStyleNames, uiWidgetNames };

export type WidgetGroup = "Combat HUD" | "Navigation" | "Interaction & loot" | "Menus & dialogue";
export const widgetGroups: readonly WidgetGroup[] = ["Combat HUD", "Navigation", "Interaction & loot", "Menus & dialogue"];

export interface WidgetInfo {
  name: UIWidget;
  group: WidgetGroup;
  about: string;
  // Where a new one goes, its size at font size 16, and when it shows.
  anchor: UIAnchor;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  visibleWhen: UIVisibility;
  // Authored text the widget shows (see each widget below), and value.
  text: string;
  value: number;
}

const info = (
  name: UIWidget,
  group: WidgetGroup,
  about: string,
  anchor: UIAnchor,
  [offsetX, offsetY]: [number, number],
  [width, height]: [number, number],
  visibleWhen: UIVisibility = "always",
  text = "",
  value = 0,
): WidgetInfo => ({ name, group, about, anchor, offsetX, offsetY, width, height, visibleWhen, text, value });

export const widgetCatalog: readonly WidgetInfo[] = [
  info("Health", "Combat HUD", "The player's health, with shield and stamina when they have them.", "bottom-left", [24, -24], [300, 60]),
  info("Ammo", "Combat HUD", "The gun in hand: magazine, reserve, rounds left and reloads.", "bottom-right", [-24, -24], [250, 84]),
  info("Crosshair", "Combat HUD", "Spreads with the gun, turns red over an enemy, marks hits and kills.", "center", [0, 0], [64, 64]),
  info("Damage numbers", "Combat HUD", "Numbers that pop off what you hit; critical hits stand out.", "center", [0, -60], [200, 100]),
  info("Kill feed", "Combat HUD", "Who took down whom, and with what.", "top-right", [-20, 20], [330, 110]),
  info("Boss bar", "Combat HUD", "A boss's name, health with a damage trail, and its stagger.", "top-center", [0, 64], [560, 58], "always", "Gate Warden", 0.72),
  info("Minimap", "Navigation", "A map that turns with you: enemies, loot and waypoints.", "top-left", [20, 20], [180, 180]),
  info("Compass", "Navigation", "A heading strip with waypoint bearings and distances.", "top-center", [0, 10], [480, 44]),
  info("Objective", "Navigation", "The current goal. Text: title, then a detail line; value: progress.", "top-left", [20, 214], [300, 86], "always", "Clear the range\nDown every target in lane 2", 0.4),
  info("Waypoints", "Navigation", "Markers on the world (ui.marker) with distance, held at the screen edge when off screen.", "center", [0, 0], [160, 60]),
  info("Interact prompt", "Interaction & loot", "Press or hold to pick up, open or use; says when a key is needed.", "center", [0, 64], [300, 56]),
  info("Pickup feed", "Interaction & loot", "What you just picked up, in its rarity colour.", "bottom-right", [-24, -124], [270, 150]),
  info("Loot card", "Interaction & loot", "A weapon on the ground: rarity, damage, fire rate, magazine.", "center", [230, -10], [260, 156]),
  info("Inventory", "Interaction & loot", "Everything carried: weapons and items with counts, weight against its limit, and what is worn (click to wear or take off).", "center", [0, 0], [440, 300], "pause"),
  info("Hotbar", "Interaction & loot", "Weapon slots 1-9, the one in hand lit; click to switch.", "bottom-center", [0, -24], [340, 58]),
  info("Weapon wheel", "Interaction & loot", "A radial weapon picker; point at a slot and click.", "middle-right", [-60, 0], [320, 320], "pause"),
  info("Pause menu", "Menus & dialogue", "Resume, Restart, Settings and Quit. Text: its title.", "middle-left", [80, 0], [320, 300], "pause", "Paused"),
  info("Main menu", "Menus & dialogue", "A title screen with Play, Settings and Quit. Text: title, then a subtitle.", "middle-left", [80, 0], [420, 380], "play", "My Game\nPress Play to start"),
  info("Settings", "Menus & dialogue", "Volume, look sensitivity, invert look, aim assist, camera shake.", "bottom-right", [-40, -40], [360, 270], "pause"),
  info("Dialogue", "Menus & dialogue", "Speaker, a typed-out line and choices. Text: 'Speaker: line', then '> choice' lines.", "bottom-center", [0, -110], [660, 160], "always",
    "Quartermaster: Crates are behind the range. Bring me what you find.\n> Where's the key?\n> On my way."),
  info("Notification", "Menus & dialogue", "A banner that slides in when its text changes. Text: title, then body.", "top-center", [0, 120], [380, 74], "always", "Area unlocked\nThe east range is open"),
  info("Fighter bars", "Combat HUD", "A fighter's health, mana, energy (ultimate) and guard. Source picks whose.", "bottom-left", [24, -24], [360, 96]),
  info("World health bar", "Combat HUD", "Health bars floating over every entity with Health that is near you. One is enough for the scene.", "center", [0, 0], [200, 40]),
  info("Hint", "Combat HUD", "A line of help shown while the mouse is free. Text: what it says.", "center", [0, 120], [420, 32], "play", "Click to aim with the mouse (Esc releases)"),
  info("Vehicle instruments", "Navigation", "Speedometer, gear, nitro and a road minimap while driving. One is enough for the scene.", "bottom-right", [-24, -24], [200, 200]),
  info("Flight instruments", "Navigation", "Altitude, speed, throttle, fuel and hull while flying a Spaceship. One is enough for the scene.", "center", [0, 0], [240, 160]),
];

export function widgetInfo(name: UIWidget): WidgetInfo {
  return widgetCatalog.find((w) => w.name === name) ?? widgetCatalog[0]!;
}

// What the widgets show, gathered from the game each frame.
export interface UIData {
  time: number; // seconds
  width: number; // the HUD canvas, CSS pixels
  height: number;
  pointer: { x: number; y: number } | undefined;
  health: number; // 0..1; -1: no health
  healthGhost: number; // where health was a moment ago (the damage trail)
  healthMax: number;
  shield: number; // 0..1; -1: none
  stamina: number; // 0..1; -1: none
  weapon: { name: string; magazine: number; capacity: number; reserve: number; reload: number; melee: boolean } | undefined;
  slots: { name: string; melee: boolean }[];
  slot: number;
  spread: number; // crosshair gap, px
  hostile: boolean; // the crosshair is over an enemy
  hitAge: number; // seconds since the last hit (Infinity: none)
  killAge: number;
  heading: number; // radians: 0 north (-z), clockwise
  player: { x: number; z: number } | undefined;
  blips: { x: number; z: number; kind: "enemy" | "ally" | "loot" | "marker"; color?: string }[];
  markers: { label: string; distance: number; bearing: number; x: number; y: number; onScreen: boolean }[];
  prompt: { verb: string; name: string; key: string; hold: number; locked: boolean; need: string; rarity: number } | undefined;
  loot: { name: string; rarity: number; damage: number; rpm: number; magazine: number; melee: boolean } | undefined;
  pickups: { label: string; amount: number; rarity: number; kind: number; age: number }[];
  kills: { killer: string; victim: string; mine: boolean; age: number }[];
  damage: { x: number; y: number; amount: number; crit: boolean; age: number }[];
  boss: { name: string; health: number; ghost: number; stagger: number } | undefined;
  items: { name: string; count: number; slot?: string }[];
  // The Player's Inventory limits and worn items (absent without an Inventory component).
  gear: { weight: number; maxWeight: number; kinds: number; maxKinds: number; worn: { head: string; body: string; hands: string } } | undefined;
  settings: { master: number; sensitivity: number; invertY: boolean; aimAssist: boolean; shake: boolean };
  title: string; // the game's name
  fighter: { health: number; mana: number; energy: number; guard: number } | undefined; // the source's fighter bars
  captured: boolean; // the mouse is captured by the game
}

// What a click on a widget does: "resume", "restart", "quit", "settings",
// "play", "slot:N", "choice:N", "next", "slider:<setting>" (the value is
// where along the hit the click landed), "toggle:<setting>".
export interface UIHit extends UIRect {
  action: string;
  test?: (x: number, y: number) => boolean; // a finer shape than the rect
}

// The authored part of a widget.
export interface WidgetInput {
  widget: UIWidget;
  style: UIStyle;
  text: string;
  value: number;
  fontSize: number;
  textAge: number; // seconds since its text last changed
  preview: boolean; // editing: sample data, nothing live
}

interface Skin {
  font: string;
  weight: number;
  upper: boolean;
  italic: boolean;
  tracking: number; // letter spacing, px
  text: string;
  dim: string;
  accent: string;
  health: string;
  shield: string;
  stamina: string;
  danger: string;
  panel: string;
  panelHi: string;
  edge: string;
  track: string;
  frame: "slant" | "bubble" | "bracket" | "ornate" | "chamfer" | "soft";
  glow: number; // accent glow blur
  shadow: number; // text and shape drop shadow blur
  outline: number; // text outline width
  outlineColor: string;
  round: boolean; // round minimap, wheel-like shapes
}

export const skins: Record<UIStyle, Skin> = {
  // Apex Legends, Valorant: slanted dark plates, white bars, red accent.
  Modern: {
    font: "'Segoe UI', Inter, Roboto, system-ui, sans-serif", weight: 700, upper: true, italic: false, tracking: 1,
    text: "#f4f6f8", dim: "rgba(244, 246, 248, 0.62)", accent: "#ff4655", health: "#f4f6f8", shield: "#4fb0ff", stamina: "#f7d154", danger: "#ff4655",
    panel: "rgba(14, 18, 24, 0.66)", panelHi: "rgba(255, 70, 85, 0.24)", edge: "rgba(255, 255, 255, 0.18)", track: "rgba(0, 0, 0, 0.45)",
    frame: "slant", glow: 0, shadow: 6, outline: 0, outlineColor: "#000", round: false,
  },
  // Fortnite: heavy italic type with a dark outline, blue bubbles, green health, blue shield.
  "Battle Royale": {
    font: "'Arial Black', 'Segoe UI Black', Impact, sans-serif", weight: 900, upper: true, italic: true, tracking: 0.5,
    text: "#ffffff", dim: "#cfe0ff", accent: "#ffd23f", health: "#59e04f", shield: "#3ea8ff", stamina: "#ffd23f", danger: "#ff3b3b",
    panel: "rgba(24, 46, 120, 0.85)", panelHi: "rgba(74, 132, 255, 0.95)", edge: "#0a1238", track: "rgba(10, 18, 56, 0.78)",
    frame: "bubble", glow: 0, shadow: 0, outline: 4, outlineColor: "#0a1238", round: false,
  },
  // The Division, Call of Duty: thin lines, corner brackets, orange accent, segmented armour.
  Tactical: {
    font: "Bahnschrift, 'DIN Alternate', 'Roboto Condensed', 'Arial Narrow', sans-serif", weight: 600, upper: true, italic: false, tracking: 2,
    text: "#e8ecef", dim: "rgba(232, 236, 239, 0.55)", accent: "#ff7a1a", health: "#e8ecef", shield: "#79cfff", stamina: "#e8ecef", danger: "#ff3d2e",
    panel: "rgba(6, 8, 10, 0.5)", panelHi: "rgba(255, 122, 26, 0.22)", edge: "rgba(232, 236, 239, 0.5)", track: "rgba(232, 236, 239, 0.12)",
    frame: "bracket", glow: 0, shadow: 3, outline: 0, outlineColor: "#000", round: false,
  },
  // Elden Ring, Zelda: serif type, gold rules and diamonds, red / blue / green bars.
  Fantasy: {
    font: "Cinzel, 'Trajan Pro', 'Palatino Linotype', 'Book Antiqua', Georgia, serif", weight: 600, upper: false, italic: false, tracking: 1,
    text: "#efe4c8", dim: "rgba(239, 228, 200, 0.62)", accent: "#d8b46a", health: "#b3262a", shield: "#3c5fc4", stamina: "#3f9a4a", danger: "#d23a2a",
    panel: "rgba(20, 15, 10, 0.8)", panelHi: "rgba(216, 180, 106, 0.2)", edge: "#8a6d3b", track: "rgba(0, 0, 0, 0.62)",
    frame: "ornate", glow: 0, shadow: 4, outline: 0, outlineColor: "#000", round: true,
  },
  // Destiny, Halo: cut corners, cyan glow, wide-set type.
  "Sci-fi": {
    font: "Orbitron, Eurostile, 'Bank Gothic', 'Segoe UI', sans-serif", weight: 600, upper: true, italic: false, tracking: 2,
    text: "#d6f6ff", dim: "rgba(150, 220, 255, 0.62)", accent: "#36d6ff", health: "#c6f2ff", shield: "#36d6ff", stamina: "#9cff6a", danger: "#ff5a4f",
    panel: "rgba(3, 18, 30, 0.62)", panelHi: "rgba(54, 214, 255, 0.18)", edge: "rgba(54, 214, 255, 0.8)", track: "rgba(54, 214, 255, 0.12)",
    frame: "chamfer", glow: 10, shadow: 0, outline: 0, outlineColor: "#000", round: true,
  },
  // Little chrome: white type with soft shadows, thin lines.
  Minimal: {
    font: "Inter, 'Helvetica Neue', 'Segoe UI', Arial, sans-serif", weight: 500, upper: false, italic: false, tracking: 0,
    text: "#ffffff", dim: "rgba(255, 255, 255, 0.58)", accent: "#ffffff", health: "#ffffff", shield: "#a8d4ff", stamina: "#ffffff", danger: "#ff6b6b",
    panel: "rgba(0, 0, 0, 0.32)", panelHi: "rgba(255, 255, 255, 0.14)", edge: "rgba(255, 255, 255, 0)", track: "rgba(255, 255, 255, 0.2)",
    frame: "soft", glow: 0, shadow: 8, outline: 0, outlineColor: "#000", round: true,
  },
};

// Icons on a 24-unit grid (filled, even-odd).
const iconPaths = {
  cross: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
  shield: "M12 2l8 3v6c0 5.2-3.4 9.4-8 11-4.6-1.6-8-5.8-8-11V5z",
  bullet: "M9 22V10c0-3.5 1.4-6.6 3-8 1.6 1.4 3 4.5 3 8v12z",
  skull: "M12 2C7 2 4 5.5 4 10c0 2.6 1.2 4.6 3 5.8V19h2v2h2v-2h2v2h2v-2h2v-3.2c1.8-1.2 3-3.2 3-5.8 0-4.5-3-8-8-8zM8.5 13a2 2 0 110-4 2 2 0 010 4zm7 0a2 2 0 110-4 2 2 0 010 4z",
  coin: "M12 3a9 9 0 100 18 9 9 0 000-18zm0 3a6 6 0 110 12 6 6 0 010-12z",
  key: "M2 12a5 5 0 019.6-2H22v4h-2v3h-3v-3h-5.4A5 5 0 012 12zm5-2a2 2 0 100 4 2 2 0 000-4z",
  gem: "M6 3h12l4 6-10 12L2 9z",
  sword: "M20 2h2v2L11 15l2 2-2 2-2-2-4 4-2-2 4-4-2-2 2-2 2 2z",
  gun: "M2 8h18l1-2h2v6h-7l-1 2h-3l-1.5 6H6l1.5-6H2z",
  chest: "M3 11h18v9H3zM3 9c0-3 2-5 5-5h8c3 0 5 2 5 5v.5H3zM10 13h4v4h-4z",
  pin: "M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7zm0 4.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z",
  star: "M12 2l3 7h7l-5.6 4.4L18.5 21 12 16.8 5.5 21l2.1-7.6L2 9h7z",
  lock: "M7 10V7a5 5 0 0110 0v3h2v12H5V10zm3 0h4V7a2 2 0 00-4 0z",
  bag: "M5 8h14l1 13H4zM9 8a3 3 0 016 0h-2a1 1 0 00-2 0z",
  arrow: "M12 2l8 20-8-5-8 5z",
} as const;
export type IconName = keyof typeof iconPaths;
const iconCache = new Map<IconName, Path2D>();

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// The icon for loot: a pickup kind (0 weapon, 1 ammo, 2 health, 3 item,
// -1 locked) and its name.
export function lootIcon(kind: number, name: string): IconName {
  if (kind === -1) return "lock";
  if (kind === 0) return /sword|axe|hammer|dagger|knife|blade|melee|fists|bow|shield/i.test(name) ? "sword" : "gun";
  if (kind === 1) return "bullet";
  if (kind === 2) return "cross";
  if (/coin|gold|cash|money/i.test(name)) return "coin";
  if (/key/i.test(name)) return "key";
  return "gem";
}

interface TextOptions {
  color?: string;
  align?: CanvasTextAlign;
  base?: CanvasTextBaseline;
  weight?: number;
  raw?: boolean; // keep the case (names, dialogue)
  plain?: boolean; // no outline, glow or shadow
  max?: number; // squeeze to this width
  alpha?: number;
}

// Drawing in one skin at one scale.
class Paint {
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly k: Skin,
    readonly s: number,
  ) {}
  // A glow (Sci-fi) is a canvas shadow blur; a drop shadow is drawn by
  // hand (text()), since a blurred shadow on every label costs whole
  // milliseconds a frame on a software-rendered canvas.
  private effects(color: string) {
    const c = this.ctx;
    if (this.k.glow) {
      c.shadowColor = color;
      c.shadowBlur = this.k.glow * this.s;
    }
  }
  private plain() {
    const c = this.ctx;
    c.shadowBlur = 0;
    c.shadowOffsetY = 0;
    c.shadowColor = "transparent";
  }
  font(size: number, weight = this.k.weight) {
    this.ctx.font = `${this.k.italic ? "italic " : ""}${weight} ${Math.max(1, Math.round(size * this.s))}px ${this.k.font}`;
    const spaced = this.ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    if ("letterSpacing" in spaced) spaced.letterSpacing = `${this.k.tracking * this.s}px`;
  }
  cased(text: string, raw?: boolean) {
    return this.k.upper && !raw ? text.toUpperCase() : text;
  }
  measure(text: string, size: number, o: TextOptions = {}) {
    this.font(size, o.weight);
    return this.ctx.measureText(this.cased(text, o.raw)).width;
  }
  text(text: string, x: number, y: number, size: number, o: TextOptions = {}): number {
    const c = this.ctx;
    const t = this.cased(text, o.raw);
    this.font(size, o.weight);
    c.textAlign = o.align ?? "left";
    c.textBaseline = o.base ?? "middle";
    const color = o.color ?? this.k.text;
    const alpha = c.globalAlpha;
    c.globalAlpha = alpha * (o.alpha ?? 1);
    if (this.k.outline && !o.plain) {
      c.lineJoin = "round";
      c.lineWidth = this.k.outline * this.s * Math.min(1, size / 18);
      c.strokeStyle = this.k.outlineColor;
      c.strokeText(t, x, y, o.max);
    }
    if (this.k.shadow && !o.plain) {
      c.fillStyle = "rgba(0, 0, 0, 0.6)";
      c.fillText(t, x, y + Math.max(1, this.s), o.max);
    }
    if (!o.plain) this.effects(color);
    c.fillStyle = color;
    c.fillText(t, x, y, o.max);
    this.plain();
    c.globalAlpha = alpha;
    return Math.min(c.measureText(t).width, o.max ?? Infinity);
  }
  // Word wrap within `width`.
  wrap(text: string, width: number, size: number, raw = true): string[] {
    this.font(size);
    const out: string[] = [];
    for (const paragraph of this.cased(text, raw).split("\n")) {
      let line = "";
      for (const word of paragraph.split(" ")) {
        const next = line ? `${line} ${word}` : word;
        if (line && this.ctx.measureText(next).width > width) {
          out.push(line);
          line = word;
        } else line = next;
      }
      out.push(line);
    }
    return out;
  }
  // The skin's plate outline.
  shape(x: number, y: number, w: number, h: number) {
    const c = this.ctx;
    const d = Math.min(h * 0.3, 10 * this.s);
    c.beginPath();
    switch (this.k.frame) {
      case "slant":
        c.moveTo(x + d, y);
        c.lineTo(x + w, y);
        c.lineTo(x + w - d, y + h);
        c.lineTo(x, y + h);
        c.closePath();
        return;
      case "bubble":
      case "soft":
        roundRect(c, x, y, w, h, Math.min(h / 2, (this.k.frame === "bubble" ? 10 : 6) * this.s));
        return;
      case "chamfer":
        c.moveTo(x + d, y);
        c.lineTo(x + w, y);
        c.lineTo(x + w, y + h - d);
        c.lineTo(x + w - d, y + h);
        c.lineTo(x, y + h);
        c.lineTo(x, y + d);
        c.closePath();
        return;
      default:
        c.rect(x, y, w, h);
    }
  }
  panel(x: number, y: number, w: number, h: number, hi = false) {
    const { ctx: c, k, s } = this;
    this.shape(x, y, w, h);
    if (k.frame === "bubble") {
      const g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, hi ? "#7fb2ff" : "rgba(52, 96, 205, 0.92)");
      g.addColorStop(1, hi ? "#3a64e0" : k.panel);
      c.fillStyle = g;
    } else if (k.frame === "ornate") {
      const g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, "rgba(44, 33, 22, 0.88)");
      g.addColorStop(1, k.panel);
      c.fillStyle = g;
    } else c.fillStyle = k.panel;
    c.fill();
    if (hi && k.frame !== "bubble") {
      c.fillStyle = k.panelHi;
      c.fill();
    }
    switch (k.frame) {
      case "slant": {
        // An accent stripe down the leading edge.
        const d = Math.min(h * 0.3, 10 * s);
        c.fillStyle = hi ? k.accent : k.edge;
        c.beginPath();
        c.moveTo(x + d, y);
        c.lineTo(x + d + 3 * s, y);
        c.lineTo(x + 3 * s, y + h);
        c.lineTo(x, y + h);
        c.closePath();
        c.fill();
        break;
      }
      case "bubble":
        c.lineWidth = 3 * s;
        c.strokeStyle = k.edge;
        c.stroke();
        break;
      case "bracket":
        this.brackets(x, y, w, h, hi ? k.accent : k.edge);
        break;
      case "ornate":
        c.lineWidth = 1.5 * s;
        c.strokeStyle = k.edge;
        c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        c.lineWidth = s;
        c.strokeStyle = hi ? k.accent : "rgba(216, 180, 106, 0.45)";
        c.strokeRect(x + 3.5 * s, y + 3.5 * s, w - 7 * s, h - 7 * s);
        for (const [cx, cy] of [
          [x, y],
          [x + w, y],
          [x, y + h],
          [x + w, y + h],
        ] as const)
          this.diamond(cx, cy, 4 * s, k.accent);
        break;
      case "chamfer":
        c.lineWidth = s;
        c.strokeStyle = hi ? k.accent : k.edge;
        this.effects(k.accent);
        c.stroke();
        this.plain();
        c.fillStyle = k.accent;
        c.fillRect(x + Math.min(h * 0.3, 10 * s) + 4 * s, y - 2 * s, Math.min(18 * s, w / 4), 2 * s);
        break;
      case "soft":
        break;
    }
  }
  brackets(x: number, y: number, w: number, h: number, color: string) {
    const c = this.ctx;
    const l = Math.min(10 * this.s, w / 3, h / 3);
    c.strokeStyle = color;
    c.lineWidth = 1.5 * this.s;
    c.beginPath();
    c.moveTo(x, y + l);
    c.lineTo(x, y);
    c.lineTo(x + l, y);
    c.moveTo(x + w - l, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w, y + l);
    c.moveTo(x + w, y + h - l);
    c.lineTo(x + w, y + h);
    c.lineTo(x + w - l, y + h);
    c.moveTo(x + l, y + h);
    c.lineTo(x, y + h);
    c.lineTo(x, y + h - l);
    c.stroke();
  }
  diamond(x: number, y: number, r: number, color: string) {
    const c = this.ctx;
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x, y - r);
    c.lineTo(x + r, y);
    c.lineTo(x, y + r);
    c.lineTo(x - r, y);
    c.closePath();
    c.fill();
  }
  bar(x: number, y: number, w: number, h: number, value: number, color: string, o: { segments?: number; ghost?: number } = {}) {
    const { ctx: c, k, s } = this;
    const v = clamp01(value);
    this.shape(x, y, w, h);
    c.fillStyle = k.track;
    c.fill();
    c.save();
    this.shape(x, y, w, h);
    c.clip();
    if (o.ghost !== undefined && o.ghost > v) {
      c.fillStyle = k.frame === "ornate" ? "rgba(255, 214, 140, 0.7)" : "rgba(255, 255, 255, 0.5)";
      c.fillRect(x + w * v, y, w * (clamp01(o.ghost) - v), h);
    }
    if (k.frame === "ornate" || k.frame === "bubble") {
      const g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, color);
      g.addColorStop(1, shade(color, k.frame === "ornate" ? 0.55 : 0.75));
      c.fillStyle = g;
    } else c.fillStyle = color;
    this.effects(color);
    c.fillRect(x, y, w * v, h);
    this.plain();
    if (k.frame === "bubble") {
      c.fillStyle = "rgba(255, 255, 255, 0.3)";
      c.fillRect(x, y, w * v, h * 0.4);
    }
    if (o.segments && o.segments > 1) {
      const skew = k.frame === "slant" ? Math.min(h * 0.3, 10 * s) : 0;
      c.fillStyle = k.frame === "bubble" ? k.edge : "rgba(0, 0, 0, 0.6)";
      for (let i = 1; i < o.segments; i++) {
        const sx = x + (w * i) / o.segments;
        c.beginPath();
        c.moveTo(sx + skew / 2 - s, y);
        c.lineTo(sx + skew / 2 + s * 1.5, y);
        c.lineTo(sx - skew / 2 + s * 1.5, y + h);
        c.lineTo(sx - skew / 2 - s, y + h);
        c.closePath();
        c.fill();
      }
    }
    c.restore();
    if (k.frame === "bubble" || k.frame === "ornate" || k.frame === "chamfer") {
      this.shape(x, y, w, h);
      c.lineWidth = (k.frame === "bubble" ? 2.5 : 1.2) * s;
      c.strokeStyle = k.edge;
      c.stroke();
    }
  }
  icon(name: IconName, x: number, y: number, size: number, color: string, plain = false) {
    if (typeof Path2D === "undefined") return;
    let path = iconCache.get(name);
    if (!path) {
      path = new Path2D(iconPaths[name]);
      iconCache.set(name, path);
    }
    const c = this.ctx;
    c.save();
    c.translate(x - size / 2, y - size / 2);
    c.scale(size / 24, size / 24);
    if (this.k.outline && !plain) {
      c.lineWidth = (this.k.outline * 24) / size;
      c.lineJoin = "round";
      c.strokeStyle = this.k.outlineColor;
      c.stroke(path);
    }
    if (!plain) this.effects(color);
    c.fillStyle = color;
    c.fill(path, "evenodd");
    c.restore();
  }
  // A key cap centred on (x, y); returns its width.
  key(label: string, x: number, y: number, size: number): number {
    const { ctx: c, k, s } = this;
    const h = size * s;
    const w = Math.max(h, this.measure(label, size * 0.55, { raw: true }) + 10 * s);
    const left = x - w / 2,
      top = y - h / 2;
    let ink = k.panel;
    c.beginPath();
    if (k.round && k.frame !== "chamfer") c.arc(x, y, Math.max(w, h) / 2, 0, Math.PI * 2);
    else if (k.frame === "chamfer") {
      this.shape(left, top, w, h);
    } else roundRect(c, left, top, w, h, k.frame === "bubble" ? 6 * s : 2 * s);
    switch (k.frame) {
      case "bubble":
        c.fillStyle = k.accent;
        c.fill();
        c.lineWidth = 2.5 * s;
        c.strokeStyle = k.edge;
        c.stroke();
        ink = k.edge;
        break;
      case "ornate":
        c.fillStyle = "rgba(20, 15, 10, 0.9)";
        c.fill();
        c.lineWidth = 1.5 * s;
        c.strokeStyle = k.accent;
        c.stroke();
        ink = k.accent;
        break;
      case "chamfer":
        c.fillStyle = "rgba(54, 214, 255, 0.15)";
        c.fill();
        c.lineWidth = 1.2 * s;
        c.strokeStyle = k.accent;
        c.stroke();
        ink = k.accent;
        break;
      case "soft":
        c.lineWidth = 1.5 * s;
        c.strokeStyle = k.text;
        c.stroke();
        ink = k.text;
        break;
      default:
        c.fillStyle = k.text;
        c.fill();
        ink = "#11161c";
    }
    this.text(label, x, y + 0.5 * s, size * 0.55, { align: "center", color: ink, raw: true, plain: true, weight: 700 });
    return Math.max(w, k.round && k.frame !== "chamfer" ? h : w);
  }
  ring(x: number, y: number, r: number, progress: number, color: string) {
    const c = this.ctx;
    c.lineWidth = 3 * this.s;
    c.strokeStyle = "rgba(0, 0, 0, 0.45)";
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = color;
    this.effects(color);
    c.beginPath();
    c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(progress));
    c.stroke();
    this.plain();
  }
  button(x: number, y: number, w: number, h: number, label: string, hover: boolean, hits: UIHit[], action: string, size = 17) {
    this.panel(x, y, w, h, hover);
    const centred = this.k.frame === "bubble" || this.k.frame === "ornate";
    this.text(label, centred ? x + w / 2 : x + 18 * this.s, y + h / 2, size, {
      align: centred ? "center" : "left",
      color: hover && this.k.frame !== "bubble" ? (this.k.frame === "soft" ? this.k.text : this.k.accent) : this.k.text,
    });
    if (hover && this.k.frame === "soft") {
      this.ctx.fillStyle = this.k.text;
      this.ctx.fillRect(x + 6 * this.s, y + h / 2 - 1 * this.s, 6 * this.s, 2 * this.s);
    }
    hits.push({ left: x, top: y, width: w, height: h, action });
  }
  toggle(x: number, y: number, on: boolean) {
    const { ctx: c, k, s } = this;
    const w = 38 * s,
      h = 20 * s;
    c.beginPath();
    if (k.round || k.frame === "bubble") roundRect(c, x, y, w, h, h / 2);
    else c.rect(x, y, w, h);
    c.fillStyle = on ? (k.frame === "bubble" ? k.health : k.accent) : k.track;
    c.fill();
    if (k.frame === "bubble") {
      c.lineWidth = 2.5 * s;
      c.strokeStyle = k.edge;
      c.stroke();
    }
    const knob = h - 6 * s;
    const kx = on ? x + w - knob - 3 * s : x + 3 * s;
    c.fillStyle = on && k.frame !== "bubble" && k.accent === "#ffffff" ? "#11161c" : k.text;
    c.beginPath();
    if (k.round || k.frame === "bubble") c.arc(kx + knob / 2, y + h / 2, knob / 2, 0, Math.PI * 2);
    else c.rect(kx, y + 3 * s, knob, knob);
    c.fill();
    return { left: x, top: y, width: w, height: h };
  }
  slider(x: number, y: number, w: number, value: number) {
    const { ctx: c, k, s } = this;
    const h = 6 * s;
    this.bar(x, y - h / 2, w, h, value, k.accent === "#ffffff" ? k.text : k.accent);
    c.fillStyle = k.text;
    c.beginPath();
    const kx = x + w * clamp01(value);
    if (k.round || k.frame === "bubble") c.arc(kx, y, 8 * s, 0, Math.PI * 2);
    else c.rect(kx - 4 * s, y - 9 * s, 8 * s, 18 * s);
    c.fill();
    if (k.frame === "bubble") {
      c.lineWidth = 2.5 * s;
      c.strokeStyle = k.edge;
      c.stroke();
    }
    return { left: x - 8 * s, top: y - 12 * s, width: w + 16 * s, height: 24 * s };
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  c.moveTo(x + radius, y);
  c.arcTo(x + w, y, x + w, y + h, radius);
  c.arcTo(x + w, y + h, x, y + h, radius);
  c.arcTo(x, y + h, x, y, radius);
  c.arcTo(x, y, x + w, y, radius);
  c.closePath();
}

// A hex or rgb() colour darkened to `k` of its brightness.
function shade(color: string, k: number): string {
  let r = 255,
    g = 255,
    b = 255;
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    r = n >> 16;
    g = (n >> 8) & 255;
    b = n & 255;
  } else if (rgb) [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`;
}

const inside = (pointer: UIData["pointer"], x: number, y: number, w: number, h: number) =>
  !!pointer && pointer.x >= x && pointer.x <= x + w && pointer.y >= y && pointer.y <= y + h;

type Draw = (p: Paint, r: UIRect, d: UIData, o: WidgetInput, hits: UIHit[]) => void;

// ---- Combat HUD ----

const health: Draw = (p, r, d) => {
  if (d.health < 0) return;
  const { k, s } = p;
  const { left: x, top: y, width: w, height: h } = r;
  const low = d.health < 0.3;
  const pulse = low ? 0.65 + 0.35 * Math.sin(d.time * 8) : 1;
  const hpColor = low ? k.danger : k.health;
  const hp = Math.round(d.health * d.healthMax);
  if (k.frame === "ornate") {
    // Elden Ring: three bars stacked top-left, no plate.
    const bh = Math.max(6 * s, h * 0.2);
    p.bar(x, y + 2 * s, w, bh, d.health, hpColor, { ghost: d.healthGhost });
    p.bar(x, y + 2 * s + bh + 5 * s, w * 0.72, bh * 0.75, d.shield < 0 ? 1 : d.shield, k.shield);
    p.bar(x, y + 2 * s + bh * 1.75 + 10 * s, w * 0.6, bh * 0.75, d.stamina < 0 ? 1 : d.stamina, k.stamina);
    return;
  }
  const minimal = k.frame === "soft";
  if (!minimal) p.panel(x, y, w, h);
  const pad = 10 * s;
  const icon = h * 0.42;
  p.icon(k.frame === "bubble" ? "cross" : k.frame === "chamfer" ? "shield" : "cross", x + pad + icon / 2 + (k.frame === "slant" ? 6 * s : 0), y + h / 2, icon, hpColor);
  const numberX = x + pad * 2 + icon + (k.frame === "slant" ? 6 * s : 0);
  const big = k.frame === "bubble" ? 26 : 22;
  p.ctx.globalAlpha = pulse;
  p.text(String(hp), numberX, y + h / 2 + 1 * s, big, { color: low ? k.danger : k.text, weight: 800 });
  p.ctx.globalAlpha = 1;
  const barsX = numberX + p.measure("100", big, { weight: 800 }) + pad;
  const barsW = x + w - pad - barsX - (k.frame === "slant" ? 8 * s : 0);
  if (barsW < 20 * s) return;
  const segments = k.frame === "bracket" ? 4 : k.frame === "chamfer" ? 10 : 0;
  if (d.shield >= 0) {
    p.bar(barsX, y + h * 0.2, barsW, h * (minimal ? 0.1 : 0.2), d.shield, k.shield, { segments: k.frame === "bubble" ? 0 : 4 });
    p.bar(barsX, y + h * 0.5, barsW, h * (minimal ? 0.12 : 0.3), d.health, hpColor, { ghost: d.healthGhost, segments });
  } else p.bar(barsX, y + h * (minimal ? 0.45 : 0.32), barsW, h * (minimal ? 0.12 : 0.36), d.health, hpColor, { ghost: d.healthGhost, segments });
};

const ammo: Draw = (p, r, d) => {
  const weapon = d.weapon;
  if (!weapon) return;
  const { k, s } = p;
  const { left: x, top: y, width: w, height: h } = r;
  if (k.frame !== "soft" && k.frame !== "ornate") p.panel(x, y, w, h);
  else if (k.frame === "ornate") p.panel(x, y, w, h);
  const pad = 12 * s;
  const right = x + w - pad - (k.frame === "slant" ? 8 * s : 0);
  p.text(weapon.name, right, y + 16 * s, 13, { align: "right", color: k.dim, raw: k.frame === "ornate", max: w - pad * 2 });
  if (d.slots.length > 1) p.text(`${d.slot + 1}/${d.slots.length}`, x + pad + (k.frame === "slant" ? 10 * s : 0), y + 16 * s, 12, { color: k.dim });
  if (weapon.melee) {
    p.icon("sword", right - 18 * s, y + h * 0.62, 28 * s, k.text);
    p.text(k.frame === "ornate" ? "Melee" : "melee", right - 40 * s, y + h * 0.62, 20, { align: "right" });
    return;
  }
  const low = weapon.capacity > 0 && weapon.magazine <= Math.max(1, weapon.capacity * 0.25);
  const reserve = weapon.reserve < 0 ? "∞" : String(weapon.reserve);
  const reserveW = p.text(reserve, right, y + h * 0.55, 18, { align: "right", color: k.dim });
  const slash = p.text("/", right - reserveW - 6 * s, y + h * 0.55, 18, { align: "right", color: k.dim });
  p.text(String(weapon.magazine), right - reserveW - slash - 12 * s, y + h * 0.52, k.frame === "bubble" ? 34 : 32, {
    align: "right",
    color: low ? k.danger : k.text,
    weight: 800,
  });
  // Rounds as pips (a bar past 30), or the reload's progress.
  const rowY = y + h - 14 * s;
  const rowX = x + pad + (k.frame === "slant" ? 6 * s : 0);
  const rowW = right - rowX;
  if (weapon.reload >= 0) {
    p.bar(rowX, rowY - 3 * s, rowW, 6 * s, weapon.reload, k.accent === "#ffffff" ? k.text : k.accent);
    p.text("Reloading", rowX, rowY - 14 * s, 11, { color: k.accent === "#ffffff" ? k.text : k.accent });
  } else if (weapon.capacity > 0 && weapon.capacity <= 30) {
    const gap = 2 * s;
    const pip = Math.min(8 * s, (rowW - gap * (weapon.capacity - 1)) / weapon.capacity);
    for (let i = 0; i < weapon.capacity; i++) {
      p.ctx.fillStyle = i < weapon.magazine ? (low ? k.danger : k.text) : k.track;
      const px = right - (i + 1) * pip - i * gap;
      if (k.frame === "chamfer" || k.frame === "slant") {
        p.ctx.beginPath();
        p.ctx.moveTo(px + 2 * s, rowY - 5 * s);
        p.ctx.lineTo(px + pip, rowY - 5 * s);
        p.ctx.lineTo(px + pip - 2 * s, rowY + 5 * s);
        p.ctx.lineTo(px, rowY + 5 * s);
        p.ctx.fill();
      } else p.ctx.fillRect(px, rowY - 5 * s, pip, 10 * s);
    }
  } else if (weapon.capacity > 0) p.bar(rowX, rowY - 3 * s, rowW, 6 * s, weapon.magazine / weapon.capacity, low ? k.danger : k.text);
};

const crosshair: Draw = (p, r, d) => {
  if (d.weapon?.melee) return;
  const { ctx: c, k, s } = p;
  const cx = r.left + r.width / 2,
    cy = r.top + r.height / 2;
  const color = d.hostile ? k.danger : k.frame === "ornate" ? k.accent : k.frame === "chamfer" ? k.accent : "#ffffff";
  const gap = 5 * s + d.spread;
  c.lineCap = "butt";
  const lines = (length: number, width: number) => {
    c.lineWidth = width + 2 * s;
    c.strokeStyle = "rgba(0, 0, 0, 0.55)";
    for (const pass of [0, 1]) {
      c.beginPath();
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        c.moveTo(cx + dx * gap, cy + dy * gap);
        c.lineTo(cx + dx * (gap + length), cy + dy * (gap + length));
      }
      c.stroke();
      if (pass === 0) {
        c.lineWidth = width;
        c.strokeStyle = color;
      }
    }
  };
  const dot = (radius: number) => {
    c.fillStyle = "rgba(0, 0, 0, 0.55)";
    c.beginPath();
    c.arc(cx, cy, radius + s, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = color;
    c.beginPath();
    c.arc(cx, cy, radius, 0, Math.PI * 2);
    c.fill();
  };
  switch (k.frame) {
    case "slant":
      lines(8 * s, 2 * s);
      dot(1.5 * s);
      break;
    case "bubble":
      c.lineWidth = 2 * s;
      c.strokeStyle = color;
      c.beginPath();
      c.arc(cx, cy, gap + 6 * s, 0, Math.PI * 2);
      c.stroke();
      lines(5 * s, 2.5 * s);
      break;
    case "bracket":
      lines(10 * s, 1.5 * s);
      break;
    case "ornate":
      p.diamond(cx, cy, 3.5 * s, color);
      c.lineWidth = s;
      c.strokeStyle = "rgba(216, 180, 106, 0.5)";
      c.beginPath();
      c.arc(cx, cy, gap + 8 * s, 0, Math.PI * 2);
      c.stroke();
      break;
    case "chamfer":
      c.lineWidth = 2 * s;
      c.strokeStyle = color;
      c.shadowColor = color;
      c.shadowBlur = 8 * s;
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.arc(cx, cy, gap + 8 * s, (i * Math.PI) / 2 + 0.35, ((i + 1) * Math.PI) / 2 - 0.35);
        c.stroke();
      }
      c.shadowBlur = 0;
      dot(1.5 * s);
      break;
    case "soft":
      dot(2.5 * s);
      break;
  }
  // Hit marker: an X, red on a kill.
  if (d.hitAge < 0.3) {
    const kill = d.killAge < 0.45;
    c.globalAlpha = 1 - d.hitAge / 0.3;
    c.lineWidth = (kill ? 3 : 2) * s;
    c.strokeStyle = kill ? k.danger : "#ffffff";
    const a = 6 * s,
      b = 13 * s;
    c.beginPath();
    for (const [dx, dy] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      c.moveTo(cx + dx * a, cy + dy * a);
      c.lineTo(cx + dx * b, cy + dy * b);
    }
    c.stroke();
    c.globalAlpha = 1;
  }
};

const damageNumbers: Draw = (p, r, d, o) => {
  const { k } = p;
  const list = o.preview
    ? [
        { x: r.left + r.width * 0.3, y: r.top + r.height * 0.7, amount: 24, crit: false, age: (d.time % 1.2) * 0.8 },
        { x: r.left + r.width * 0.55, y: r.top + r.height * 0.55, amount: 96, crit: true, age: ((d.time + 0.4) % 1.2) * 0.8 },
        { x: r.left + r.width * 0.75, y: r.top + r.height * 0.75, amount: 31, crit: false, age: ((d.time + 0.8) % 1.2) * 0.8 },
      ]
    : d.damage;
  for (const hit of list) {
    if (hit.age > 1) continue;
    const pop = hit.age < 0.12 ? 1.35 - hit.age * 2.9 : 1;
    const size = (hit.crit ? 24 : 17) * pop;
    p.text(String(Math.round(hit.amount)), hit.x, hit.y - hit.age * 46 * p.s, size, {
      align: "center",
      color: hit.crit ? (k.accent === "#ffffff" ? "#ffd54a" : k.accent) : k.text,
      alpha: hit.age > 0.6 ? 1 - (hit.age - 0.6) / 0.4 : 1,
      weight: 800,
    });
  }
};

const killFeed: Draw = (p, r, d, o) => {
  const { k, s } = p;
  const rows = o.preview
    ? [
        { killer: "You", victim: "Raider", mine: true, age: 1 },
        { killer: "Vex", victim: "Marauder", mine: false, age: 2 },
        { killer: "You", victim: "Gate Warden", mine: true, age: 3 },
      ]
    : d.kills;
  const rowH = 26 * s;
  rows.slice(-4).forEach((row, i) => {
    const alpha = row.age > 5 ? Math.max(0, 1 - (row.age - 5)) : 1;
    if (alpha <= 0) return;
    p.ctx.globalAlpha = alpha;
    const y = r.top + i * (rowH + 4 * s);
    const victimW = p.measure(row.victim, 13, { raw: true });
    const killerW = p.measure(row.killer, 13, { raw: true });
    const w = Math.min(r.width, victimW + killerW + 60 * s);
    const x = r.left + r.width - w;
    if (k.frame !== "soft") p.panel(x, y, w, rowH, row.mine);
    const mid = y + rowH / 2;
    p.text(row.killer, x + 12 * s, mid, 13, { raw: true, color: row.mine ? (k.accent === "#ffffff" ? k.text : k.accent) : k.text });
    p.icon("skull", x + 12 * s + killerW + 18 * s, mid, 14 * s, k.dim);
    p.text(row.victim, x + w - 12 * s, mid, 13, { raw: true, align: "right", color: k.danger });
    p.ctx.globalAlpha = 1;
  });
};

const bossBar: Draw = (p, r, d, o) => {
  const { k, s } = p;
  const boss = o.preview ? { name: o.text || "Gate Warden", health: o.value || 0.72, ghost: (o.value || 0.72) + 0.08, stagger: 0.45 } : d.boss;
  if (!boss) return;
  const { left: x, top: y, width: w, height: h } = r;
  const barH = Math.max(10 * s, h * 0.32);
  const barY = y + h * 0.42;
  if (k.frame === "ornate") p.text(boss.name, x, y + h * 0.2, 18, { raw: true });
  else p.text(boss.name, x + w / 2, y + h * 0.2, 17, { align: "center", raw: k.frame === "soft" });
  if (k.frame === "bracket") p.brackets(x - 6 * s, barY - 6 * s, w + 12 * s, barH + 12 * s, k.edge);
  p.bar(x, barY, w, barH, boss.health, k.frame === "ornate" ? k.health : k.danger, { ghost: boss.ghost, segments: k.frame === "chamfer" ? 20 : 0 });
  if (boss.stagger > 0) p.bar(x + w * 0.2, barY + barH + 5 * s, w * 0.6, 4 * s, boss.stagger, k.frame === "ornate" ? k.accent : k.stamina);
};

// ---- Navigation ----

const minimap: Draw = (p, r, d, o) => {
  const { ctx: c, k, s } = p;
  const size = Math.min(r.width, r.height);
  const x = r.left,
    y = r.top;
  const cx = x + size / 2,
    cy = y + size / 2;
  const range = 60; // metres from the centre to the edge
  const scale = size / 2 / range;
  const heading = o.preview ? d.time * 0.2 : d.heading;
  const player = o.preview ? { x: 0, z: 0 } : d.player;
  if (!player) return;
  const round = k.round;
  // The map's outline: round, or the skin's plate (Modern's square, not
  // slanted).
  const outline = () => {
    c.beginPath();
    if (round) c.arc(cx, cy, size / 2, 0, Math.PI * 2);
    else if (k.frame === "slant") roundRect(c, x, y, size, size, 4 * s);
    else p.shape(x, y, size, size);
  };
  c.save();
  outline();
  c.fillStyle = k.frame === "ornate" ? "rgba(48, 40, 26, 0.85)" : k.frame === "bubble" ? "rgba(40, 92, 60, 0.85)" : k.panel;
  c.fill();
  c.clip();
  const cos = Math.cos(heading),
    sin = Math.sin(heading);
  const place = (wx: number, wz: number) => {
    const dx = wx - player.x,
      dz = wz - player.z;
    const right = dx * cos + dz * sin;
    const forward = dx * sin - dz * cos;
    return { x: cx + right * scale, y: cy - forward * scale };
  };
  // A grid that turns with the player.
  c.strokeStyle = k.frame === "chamfer" ? "rgba(54, 214, 255, 0.14)" : "rgba(255, 255, 255, 0.08)";
  c.lineWidth = s;
  const step = 20;
  const ox = Math.floor(player.x / step) * step,
    oz = Math.floor(player.z / step) * step;
  c.beginPath();
  for (let i = -4; i <= 4; i++) {
    const a = place(ox + i * step, oz - 80),
      b = place(ox + i * step, oz + 80);
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    const e = place(ox - 80, oz + i * step),
      f = place(ox + 80, oz + i * step);
    c.moveTo(e.x, e.y);
    c.lineTo(f.x, f.y);
  }
  c.stroke();
  if (k.frame === "chamfer") {
    // A radar sweep.
    const a = (d.time * 2) % (Math.PI * 2);
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
    g.addColorStop(0, "rgba(54, 214, 255, 0.0)");
    g.addColorStop(1, "rgba(54, 214, 255, 0.22)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(cx, cy);
    c.arc(cx, cy, size / 2, a - 0.6, a);
    c.closePath();
    c.fill();
  }
  const blips = o.preview
    ? [
        { x: 20, z: -25, kind: "enemy" as const },
        { x: -30, z: -10, kind: "enemy" as const },
        { x: 10, z: 18, kind: "loot" as const, color: rarityColors[3] },
        { x: -12, z: 30, kind: "ally" as const },
        { x: 35, z: -45, kind: "marker" as const },
      ]
    : d.blips;
  for (const blip of blips) {
    const at = place(blip.x, blip.z);
    if (blip.kind === "marker") {
      const dx = at.x - cx,
        dy = at.y - cy;
      const far = Math.hypot(dx, dy);
      const limit = size / 2 - 9 * s;
      const pin = far > limit ? { x: cx + (dx / far) * limit, y: cy + (dy / far) * limit } : at;
      p.icon("pin", pin.x, pin.y - 6 * s, 16 * s, blip.color ?? (k.accent === "#ffffff" ? "#ffd54a" : k.accent));
      continue;
    }
    const color = blip.kind === "enemy" ? k.danger : blip.kind === "ally" ? "#5fe08a" : (blip.color ?? "#ffffff");
    c.fillStyle = color;
    c.beginPath();
    if (blip.kind === "loot") c.rect(at.x - 3 * s, at.y - 3 * s, 6 * s, 6 * s);
    else c.arc(at.x, at.y, 3.5 * s, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
  // The rim, north, and the player's arrow.
  outline();
  c.lineWidth = (k.frame === "bubble" ? 3 : k.frame === "ornate" ? 2 : 1) * s;
  c.strokeStyle = k.frame === "ornate" ? k.accent : k.frame === "soft" ? "rgba(255, 255, 255, 0.35)" : k.edge;
  c.stroke();
  if (k.frame === "bracket") p.brackets(x - 4 * s, y - 4 * s, size + 8 * s, size + 8 * s, k.accent);
  const north = { x: cx - Math.sin(heading) * (size / 2 - 10 * s), y: cy - Math.cos(heading) * (size / 2 - 10 * s) };
  p.text("N", north.x, north.y, 12, { align: "center", color: k.frame === "ornate" ? k.accent : k.text, weight: 800 });
  c.save();
  c.translate(cx, cy);
  p.icon("arrow", 0, 0, 16 * s, k.frame === "soft" ? "#ffffff" : k.accent);
  c.restore();
};

const compass: Draw = (p, r, d, o) => {
  const { ctx: c, k, s } = p;
  const { left: x, top: y, width: w, height: h } = r;
  const heading = o.preview ? Math.sin(d.time * 0.3) * 0.8 : d.heading;
  const span = Math.PI; // the strip shows half the horizon
  if (k.frame !== "soft" && k.frame !== "ornate") p.panel(x, y, w, h * 0.62);
  if (k.frame === "ornate") {
    c.strokeStyle = k.edge;
    c.lineWidth = s;
    c.beginPath();
    c.moveTo(x, y + h * 0.62);
    c.lineTo(x + w, y + h * 0.62);
    c.stroke();
  }
  const cx = x + w / 2;
  const toX = (bearing: number) => cx + (wrapAngle(bearing - heading) / span) * w;
  c.save();
  c.beginPath();
  c.rect(x, y - 4 * s, w, h + 8 * s);
  c.clip();
  const names: Record<number, string> = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };
  for (let deg = 0; deg < 360; deg += 15) {
    const tx = toX((deg * Math.PI) / 180);
    const fade = 1 - Math.min(1, Math.abs(tx - cx) / (w / 2));
    if (fade <= 0) continue;
    c.globalAlpha = 0.25 + 0.75 * fade;
    const name = names[deg];
    if (name)
      p.text(name, tx, y + h * 0.31, name.length === 1 ? 15 : 12, {
        align: "center",
        color: deg === 0 ? (k.accent === "#ffffff" ? k.text : k.accent) : k.text,
        weight: 800,
      });
    else {
      c.fillStyle = k.dim;
      c.fillRect(tx - 0.75 * s, y + h * 0.18, 1.5 * s, h * 0.26);
    }
  }
  c.globalAlpha = 1;
  const markers = o.preview ? [{ label: "Crate", distance: 42, bearing: heading + 0.5 }] : d.markers;
  for (const marker of markers) {
    const mx = toX(marker.bearing);
    if (Math.abs(mx - cx) > w / 2) continue;
    p.icon("pin", mx, y + h * 0.31, 14 * s, k.accent === "#ffffff" ? "#ffd54a" : k.accent);
    p.text(`${Math.round(marker.distance)}m`, mx, y + h * 0.82, 11, { align: "center", color: k.dim });
  }
  c.restore();
  // The heading caret.
  c.fillStyle = k.accent === "#ffffff" ? k.text : k.accent;
  c.beginPath();
  c.moveTo(cx - 5 * s, y + h * 0.62 + 6 * s);
  c.lineTo(cx + 5 * s, y + h * 0.62 + 6 * s);
  c.lineTo(cx, y + h * 0.62);
  c.closePath();
  c.fill();
  if (k.frame === "soft") {
    const deg = Math.round(((((heading * 180) / Math.PI) % 360) + 360) % 360);
    p.text(String(deg), cx, y + h * 0.88, 11, { align: "center", color: k.dim });
  }
};

const objective: Draw = (p, r, d, o) => {
  const { k, s } = p;
  const [title = "", ...rest] = o.text.split("\n");
  if (!title) return;
  const { left: x, top: y, width: w, height: h } = r;
  const pad = 12 * s;
  if (k.frame !== "soft") p.panel(x, y, w, h);
  const left = x + pad + (k.frame === "slant" ? 8 * s : 0);
  if (k.frame === "ornate") p.diamond(left + 4 * s, y + 18 * s, 4 * s, k.accent);
  p.text(k.frame === "ornate" ? "Quest" : "Objective", left + (k.frame === "ornate" ? 14 * s : 0), y + 18 * s, 11, {
    color: k.accent === "#ffffff" ? k.dim : k.accent,
    weight: 800,
  });
  p.text(title, left, y + 40 * s, 16, { raw: k.frame === "ornate" || k.frame === "soft", max: w - pad * 2 });
  if (rest.length) p.text(rest.join(" "), left, y + 60 * s, 12, { raw: true, color: k.dim, max: w - pad * 2 });
  if (o.value > 0) p.bar(left, y + h - 12 * s, w - pad * 2 - (left - x - pad), 4 * s, o.value, k.accent === "#ffffff" ? k.text : k.accent);
};

const waypoints: Draw = (p, r, d, o) => {
  const { ctx: c, k, s } = p;
  const markers = o.preview
    ? [{ label: "Supply crate", distance: 42, bearing: 0, x: r.left + r.width / 2, y: r.top + r.height / 2, onScreen: true }]
    : d.markers;
  const color = k.accent === "#ffffff" ? "#ffd54a" : k.accent;
  const margin = 36 * s;
  for (const marker of markers) {
    let { x, y } = marker;
    let edge = false;
    if (!marker.onScreen || x < margin || x > d.width - margin || y < margin || y > d.height - margin) {
      // Held at the screen edge, pointing the way.
      const cx = d.width / 2,
        cy = d.height / 2;
      // On screen near an edge: from the centre through it; off screen: by
      // its bearing (behind you, along the bottom).
      let dx = marker.onScreen ? x - cx : Math.sin(marker.bearing - d.heading),
        dy = marker.onScreen ? y - cy : -Math.cos(marker.bearing - d.heading);
      const k2 = Math.min((cx - margin) / Math.max(1e-6, Math.abs(dx)), (cy - margin) / Math.max(1e-6, Math.abs(dy)));
      dx *= k2;
      dy *= k2;
      x = cx + dx;
      y = cy + dy;
      edge = true;
    }
    p.icon("pin", x, y - 10 * s, 22 * s, color);
    p.text(`${Math.round(marker.distance)} m`, x, y + 10 * s, 12, { align: "center" });
    if (!edge) p.text(marker.label, x, y - 30 * s, 12, { align: "center", raw: true, color: k.dim });
  }
  c.globalAlpha = 1;
};

// ---- Interaction & loot ----

const interactPrompt: Draw = (p, r, d, o) => {
  const { k, s } = p;
  const prompt = o.preview ? { verb: "Open", name: "Supply crate", key: "E", hold: (d.time % 2) / 2, locked: false, need: "", rarity: 2 } : d.prompt;
  if (!prompt) return;
  const { left: x, top: y, width: w, height: h } = r;
  const keySize = h * 0.62;
  const label = prompt.locked ? (prompt.verb === "Exit" ? prompt.need : `Needs ${prompt.need || "a key"}`) : prompt.verb;
  const nameW = p.measure(prompt.name, 15, { raw: true });
  const labelW = p.measure(label, 13);
  const total = keySize / s + 16 + Math.max(nameW, labelW) / s + 24;
  const pw = Math.min(w, total * s);
  const px = x + (w - pw) / 2;
  if (k.frame !== "soft") p.panel(px, y, pw, h);
  const kx = px + 12 * s + keySize / 2 + (k.frame === "slant" ? 6 * s : 0);
  if (prompt.locked) p.icon("lock", kx, y + h / 2, keySize * 0.8, k.danger);
  else {
    p.key(prompt.key, kx, y + h / 2, keySize / s);
    if (prompt.hold >= 0) p.ring(kx, y + h / 2, keySize * 0.66, prompt.hold, k.accent === "#ffffff" ? k.text : k.accent);
  }
  const tx = kx + keySize / 2 + 14 * s;
  p.text(label, tx, y + h * 0.32, 13, { color: prompt.locked ? k.danger : k.dim });
  p.text(prompt.name, tx, y + h * 0.66, 15, { raw: true, color: rarityColors[prompt.rarity] ?? k.text, max: px + pw - tx - 8 * s });
};

const pickupFeed: Draw = (p, r, d, o) => {
  const { k, s } = p;
  const rows = o.preview
    ? [
        { label: "Ammo", amount: 30, rarity: 0, kind: 1, age: 1.5 },
        { label: "Medkit", amount: 25, rarity: 1, kind: 2, age: 1 },
        { label: "Carbine", amount: 1, rarity: 3, kind: 0, age: 0.5 },
      ]
    : d.pickups;
  const rowH = 30 * s;
  const shown = rows.slice(-Math.max(1, Math.floor(r.height / (rowH + 4 * s))));
  shown.forEach((row, i) => {
    const age = row.age;
    const alpha = age > 5 ? Math.max(0, 1 - (age - 5)) : 1;
    if (alpha <= 0) return;
    const slide = age < 0.2 ? (1 - age / 0.2) * 40 * s : 0;
    const y = r.top + r.height - (shown.length - i) * (rowH + 4 * s);
    const color = rarityColors[row.rarity] ?? k.text;
    const text = row.kind === 1 || row.kind === 2 || (row.kind === 3 && row.amount > 1) ? `+${row.amount} ${row.label}` : row.label;
    const w = Math.min(r.width, p.measure(text, 14, { raw: true }) + 56 * s);
    const x = r.left + r.width - w + slide;
    p.ctx.globalAlpha = alpha;
    if (k.frame !== "soft") p.panel(x, y, w, rowH);
    p.ctx.fillStyle = color;
    p.ctx.fillRect(x + w - 4 * s, y, 4 * s, rowH);
    p.icon(lootIcon(row.kind, row.label), x + 20 * s, y + rowH / 2, 16 * s, color);
    p.text(text, x + 36 * s, y + rowH / 2, 14, { raw: true, color: k.text });
    p.ctx.globalAlpha = 1;
  });
};

const lootCard: Draw = (p, r, d, o) => {
  const { ctx: c, k, s } = p;
  const loot = o.preview ? { name: "Carbine", rarity: 3, damage: 32, rpm: 720, magazine: 30, melee: false } : d.loot;
  if (!loot) return;
  const { left: x, top: y, width: w, height: h } = r;
  const color = rarityColors[loot.rarity] ?? k.text;
  p.panel(x, y, w, h);
  // The rarity band.
  c.save();
  p.shape(x, y, w, h);
  c.clip();
  const g = c.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  c.globalAlpha = 0.45;
  c.fillStyle = g;
  c.fillRect(x, y, w, 40 * s);
  c.globalAlpha = 1;
  c.restore();
  const pad = 14 * s + (k.frame === "slant" ? 6 * s : 0);
  p.text(loot.name, x + pad, y + 16 * s, 17, { raw: k.frame === "ornate" || k.frame === "soft", max: w - pad * 2 });
  p.text(["Common", "Uncommon", "Rare", "Epic", "Legendary"][loot.rarity] ?? "", x + pad, y + 33 * s, 11, { color });
  const stats: [string, number, number][] = loot.melee
    ? [["Melee", 1, 1]]
    : [
        ["Damage", loot.damage, 120],
        ["Fire rate", loot.rpm, 1200],
        ["Magazine", loot.magazine, 60],
      ];
  stats.forEach(([name, value, max], i) => {
    const sy = y + 56 * s + i * 22 * s;
    p.text(name, x + pad, sy, 11, { color: k.dim });
    if (!loot.melee) {
      p.text(String(Math.round(value)), x + w - pad, sy, 12, { align: "right" });
      p.bar(x + pad + 76 * s, sy - 2.5 * s, w - pad * 2 - 112 * s, 5 * s, value / max, color);
    }
  });
  const ky = y + h - 18 * s;
  const kw = p.key("E", x + pad + 10 * s, ky, 20);
  p.text("Pick up", x + pad + kw + 12 * s, ky, 12, { color: k.dim });
};

const inventory: Draw = (p, r, d, o, hits) => {
  const { ctx: c, k, s } = p;
  const { left: x, top: y, width: w, height: h } = r;
  p.panel(x, y, w, h);
  const pad = 16 * s;
  const left = x + pad + (k.frame === "slant" ? 8 * s : 0);
  p.text("Inventory", left, y + 22 * s, 18, { weight: 800 });
  const slots = o.preview ? [{ name: "Carbine", melee: false }, { name: "Sword", melee: true }] : d.slots;
  const items: UIData["items"] = o.preview
    ? [
        { name: "Coin", count: 120 },
        { name: "Key", count: 1 },
        { name: "Helmet", count: 1, slot: "head" },
        { name: "Gem", count: 3 },
      ]
    : d.items;
  const gear: UIData["gear"] = o.preview ? { weight: 7.5, maxWeight: 20, kinds: 4, maxKinds: 6, worn: { head: "Helmet", body: "", hands: "" } } : d.gear;
  // Weight and kinds against their limits (when it has any).
  if (gear) {
    const parts: string[] = [];
    if (gear.maxWeight > 0) parts.push(`${Math.round(gear.weight * 10) / 10} / ${gear.maxWeight} kg`);
    if (gear.maxKinds > 0) parts.push(`${gear.kinds} / ${gear.maxKinds} kinds`);
    if (parts.length) p.text(parts.join("  ·  "), x + w - pad, y + 22 * s, 12, { align: "right", color: gear.maxWeight > 0 && gear.weight >= gear.maxWeight ? "#ff6b5e" : k.dim });
  }
  const cols = 6;
  const gap = 8 * s;
  const cell = Math.min((w - pad * 2 - gap * (cols - 1)) / cols, 80 * s);
  let top = y + 44 * s;
  const frame = (cx: number, cy: number, lit: boolean, hover: boolean, filled: boolean) => {
    c.beginPath();
    if (k.round && k.frame !== "chamfer") roundRect(c, cx, cy, cell, cell, 6 * s);
    else p.shape(cx, cy, cell, cell);
    c.fillStyle = lit || hover ? k.panelHi : "rgba(0, 0, 0, 0.35)";
    c.fill();
    c.lineWidth = s;
    c.strokeStyle = filled ? (lit ? (k.accent === "#ffffff" ? k.text : k.accent) : k.edge) : "rgba(255, 255, 255, 0.08)";
    c.stroke();
  };
  // Worn: head, body, hands. A click takes the item off.
  if (gear) {
    (["head", "body", "hands"] as const).forEach((slot, i) => {
      const cx = left + i * (cell + gap);
      const worn = gear.worn[slot];
      frame(cx, top, !!worn, inside(d.pointer, cx, top, cell, cell), !!worn);
      p.text(slot, cx + cell / 2, top + 11 * s, 10, { align: "center", color: k.dim });
      if (worn) {
        p.icon(lootIcon(3, worn), cx + cell / 2, top + cell * 0.5, cell * 0.36, k.text);
        p.text(worn, cx + cell / 2, top + cell - 8 * s, 10, { align: "center", raw: true, color: k.dim, max: cell - 6 * s });
        hits.push({ left: cx, top, width: cell, height: cell, action: `unequip:${slot}` });
      }
    });
    top += cell + gap;
  }
  const worn = gear ? new Set(Object.values(gear.worn)) : new Set<string>();
  const entries: { icon: IconName; name: string; count: number; lit: boolean; wear?: string }[] = [
    ...slots.map((slot, i) => ({ icon: (slot.melee ? "sword" : "gun") as IconName, name: slot.name, count: 0, lit: i === d.slot })),
    ...items.map((item) => ({ icon: lootIcon(3, item.name), name: item.name, count: item.count, lit: worn.has(item.name), wear: item.slot })),
  ];
  const rows = Math.max(1, Math.floor((h - (top - y) - pad + gap) / (cell + gap)));
  for (let i = 0; i < cols * rows; i++) {
    const cx = left + (i % cols) * (cell + gap);
    const cy = top + Math.floor(i / cols) * (cell + gap);
    const entry = entries[i];
    frame(cx, cy, !!entry?.lit, inside(d.pointer, cx, cy, cell, cell), !!entry);
    if (!entry) continue;
    p.icon(entry.icon, cx + cell / 2, cy + cell * 0.42, cell * 0.42, entry.icon === "coin" ? "#ffc83d" : entry.icon === "gem" ? rarityColors[3] : k.text);
    p.text(entry.name, cx + cell / 2, cy + cell - 10 * s, 10, { align: "center", raw: true, color: k.dim, max: cell - 6 * s });
    if (entry.count > 1) p.text(String(entry.count), cx + cell - 5 * s, cy + 10 * s, 11, { align: "right", weight: 800 });
    if (i < slots.length) hits.push({ left: cx, top: cy, width: cell, height: cell, action: `slot:${i}` });
    else if (entry.wear && !entry.lit) hits.push({ left: cx, top: cy, width: cell, height: cell, action: `equip:${entry.wear}:${entry.name}` });
  }
};

const hotbar: Draw = (p, r, d, o, hits) => {
  const { ctx: c, k, s } = p;
  const slots = o.preview
    ? [
        { name: "Pistol", melee: false },
        { name: "Carbine", melee: false },
        { name: "Sword", melee: true },
      ]
    : d.slots;
  if (!slots.length) return;
  const count = Math.max(5, slots.length);
  const gap = 6 * s;
  const cell = Math.min(r.height - 14 * s, (r.width - gap * (count - 1)) / count);
  const total = count * cell + (count - 1) * gap;
  const x0 = r.left + (r.width - total) / 2;
  const current = o.preview ? Math.floor(d.time / 1.5) % slots.length : d.slot;
  for (let i = 0; i < count; i++) {
    const x = x0 + i * (cell + gap);
    const y = r.top;
    const slot = slots[i];
    const lit = i === current && !!slot;
    c.beginPath();
    if (k.frame === "bubble" || k.frame === "soft") roundRect(c, x, y, cell, cell, 8 * s);
    else p.shape(x, y, cell, cell);
    c.fillStyle = lit ? (k.frame === "bubble" ? "rgba(74, 132, 255, 0.95)" : k.panelHi) : k.panel;
    c.fill();
    c.lineWidth = (lit ? 2 : 1) * s * (k.frame === "bubble" ? 1.5 : 1);
    c.strokeStyle = lit ? (k.frame === "bubble" ? "#ffffff" : k.accent) : k.frame === "bubble" ? k.edge : k.edge;
    c.stroke();
    p.text(String(i + 1), x + 6 * s, y + 9 * s, 10, { color: k.dim, weight: 800 });
    if (slot) {
      p.icon(slot.melee ? "sword" : "gun", x + cell / 2, y + cell / 2 + 2 * s, cell * 0.5, lit ? k.text : k.dim);
      hits.push({ left: x, top: y, width: cell, height: cell, action: `slot:${i}` });
    }
    if (lit) p.text(slot.name, x + cell / 2, y + cell + 8 * s, 11, { align: "center", raw: true });
  }
};

const weaponWheel: Draw = (p, r, d, o, hits) => {
  const { ctx: c, k, s } = p;
  const slots = o.preview
    ? [
        { name: "Pistol", melee: false },
        { name: "Carbine", melee: false },
        { name: "Shotgun", melee: false },
        { name: "Sword", melee: true },
      ]
    : d.slots;
  if (!slots.length) return;
  const n = Math.max(4, slots.length);
  const R = Math.min(r.width, r.height) / 2;
  const r0 = R * 0.42;
  const cx = r.left + r.width / 2,
    cy = r.top + r.height / 2;
  const hovered = d.pointer && Math.hypot(d.pointer.x - cx, d.pointer.y - cy) > r0 * 0.6 ? wedgeAt(d.pointer.x - cx, d.pointer.y - cy, n) : -1;
  const lit = hovered >= 0 ? hovered : o.preview ? Math.floor(d.time / 1.2) % slots.length : d.slot;
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + ((i - 0.5) / n) * Math.PI * 2 + 0.02;
    const a1 = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI * 2 - 0.02;
    const slot = slots[i];
    c.beginPath();
    c.arc(cx, cy, R, a0, a1);
    c.arc(cx, cy, r0, a1, a0, true);
    c.closePath();
    c.fillStyle = i === lit && slot ? (k.frame === "bubble" ? "rgba(74, 132, 255, 0.95)" : k.panelHi) : k.panel;
    c.fill();
    c.lineWidth = (k.frame === "bubble" ? 3 : 1) * s;
    c.strokeStyle = i === lit && slot && k.frame !== "bubble" ? k.accent : k.frame === "soft" ? "rgba(255, 255, 255, 0.2)" : k.edge;
    c.stroke();
    if (!slot) continue;
    const mid = (a0 + a1) / 2;
    const ix = cx + Math.cos(mid) * (r0 + R) * 0.5,
      iy = cy + Math.sin(mid) * (r0 + R) * 0.5;
    p.icon(slot.melee ? "sword" : "gun", ix, iy - 6 * s, 26 * s, i === lit ? k.text : k.dim);
    p.text(String(i + 1), ix, iy + 16 * s, 10, { align: "center", color: k.dim });
    hits.push({
      left: cx - R,
      top: cy - R,
      width: R * 2,
      height: R * 2,
      action: `slot:${i}`,
      test: (x, y) => Math.hypot(x - cx, y - cy) >= r0 && Math.hypot(x - cx, y - cy) <= R && wedgeAt(x - cx, y - cy, n) === i,
    });
  }
  const name = slots[lit]?.name ?? "";
  if (k.frame === "ornate") {
    c.strokeStyle = k.accent;
    c.lineWidth = 1.5 * s;
    c.beginPath();
    c.arc(cx, cy, r0 - 6 * s, 0, Math.PI * 2);
    c.stroke();
  }
  p.text(name, cx, cy, 15, { align: "center", raw: k.frame === "ornate" || k.frame === "soft", max: r0 * 1.6 });
};

// Which of `n` wedges (the first centred straight up) holds (dx, dy).
function wedgeAt(dx: number, dy: number, n: number): number {
  const angle = Math.atan2(dy, dx) + Math.PI / 2; // 0 up, clockwise
  return ((Math.round((angle / (Math.PI * 2)) * n) % n) + n) % n;
}

// ---- Menus & dialogue ----

function backdrop(p: Paint, d: UIData, strength: number) {
  const c = p.ctx;
  const g = c.createLinearGradient(0, 0, d.width, 0);
  g.addColorStop(0, `rgba(0, 0, 0, ${0.75 * strength})`);
  g.addColorStop(0.6, `rgba(0, 0, 0, ${0.35 * strength})`);
  g.addColorStop(1, `rgba(0, 0, 0, ${0.15 * strength})`);
  c.fillStyle = g;
  c.fillRect(0, 0, d.width, d.height);
}

function menu(p: Paint, r: UIRect, d: UIData, hits: UIHit[], title: string, subtitle: string, entries: [string, string][], titleSize: number) {
  const { k, s } = p;
  const { left: x, top: y, width: w } = r;
  const bubble = k.frame === "bubble";
  if (k.frame === "ornate") {
    p.text(title, x + w / 2, y + 26 * s, titleSize, { align: "center", raw: true, color: k.text });
    p.ctx.fillStyle = k.accent;
    p.ctx.fillRect(x + w * 0.2, y + 26 * s + titleSize * 0.8 * s, w * 0.6, s);
    p.diamond(x + w / 2, y + 26 * s + titleSize * 0.8 * s, 4 * s, k.accent);
  } else p.text(title, bubble ? x + w / 2 : x, y + 26 * s, titleSize, { align: bubble ? "center" : "left", weight: 900 });
  let top = y + 26 * s + titleSize * s;
  if (subtitle) {
    p.text(subtitle, k.frame === "ornate" || bubble ? x + w / 2 : x, top, 13, { align: k.frame === "ornate" || bubble ? "center" : "left", color: k.dim, raw: true });
    top += 22 * s;
  }
  top += 12 * s;
  const bh = 44 * s;
  for (const [label, action] of entries) {
    p.button(x, top, w, bh, label, inside(d.pointer, x, top, w, bh), hits, action);
    top += bh + 10 * s;
  }
}

const pauseMenu: Draw = (p, r, d, o, hits) => {
  backdrop(p, d, 0.8);
  menu(p, r, d, hits, o.text.split("\n")[0] || "Paused", o.text.split("\n").slice(1).join(" "), [
    ["Resume", "resume"],
    ["Restart", "restart"],
    ["Settings", "settings"],
    ["Quit", "quit"],
  ], 30);
};

const mainMenu: Draw = (p, r, d, o, hits) => {
  const [title, ...rest] = o.text.split("\n");
  backdrop(p, d, 1);
  menu(p, r, d, hits, title || d.title || "Untitled", rest.join(" "), [
    ["Play", "play"],
    ["Settings", "settings"],
    ["Quit", "quit"],
  ], 44);
};

const settings: Draw = (p, r, d, o, hits) => {
  const { k, s } = p;
  const { left: x, top: y, width: w, height: h } = r;
  p.panel(x, y, w, h);
  const pad = 18 * s + (k.frame === "slant" ? 6 * s : 0);
  p.text("Settings", x + pad, y + 24 * s, 18, { weight: 800 });
  const rows: [string, string, number | boolean][] = [
    ["Volume", "master", d.settings.master],
    ["Look sensitivity", "sensitivity", (d.settings.sensitivity - 0.5) / 1],
    ["Invert look", "invertY", d.settings.invertY],
    ["Aim assist", "aimAssist", d.settings.aimAssist],
    ["Camera shake", "shake", d.settings.shake],
  ];
  const step = Math.min(42 * s, (h - 56 * s) / rows.length);
  rows.forEach(([label, key, value], i) => {
    const ry = y + 58 * s + i * step;
    p.text(label, x + pad, ry, 13, { color: k.text });
    const controlX = x + w * 0.52;
    if (typeof value === "boolean") {
      const box = p.toggle(x + w - pad - 38 * s, ry - 10 * s, value);
      hits.push({ ...box, action: `toggle:${key}` });
    } else {
      const box = p.slider(controlX, ry, x + w - pad - controlX - 8 * s, value);
      hits.push({ left: controlX, top: box.top, width: x + w - pad - controlX - 8 * s, height: box.height, action: `slider:${key}` });
    }
  });
};

// A dialogue's text: "Speaker: line", then "> choice" lines.
export function parseDialogue(text: string): { speaker: string; line: string; choices: string[] } {
  const lines = text.split("\n");
  const choices = lines.filter((l) => l.trimStart().startsWith(">")).map((l) => l.trimStart().slice(1).trim());
  const body = lines.filter((l) => !l.trimStart().startsWith(">")).join(" ").trim();
  const colon = body.indexOf(":");
  return colon > 0 && colon < 40 ? { speaker: body.slice(0, colon).trim(), line: body.slice(colon + 1).trim(), choices } : { speaker: "", line: body, choices };
}

const dialogue: Draw = (p, r, d, o, hits) => {
  const { k, s } = p;
  const { speaker, line, choices } = parseDialogue(o.text);
  if (!line && !choices.length) return;
  const { left: x, top: y, width: w, height: h } = r;
  p.panel(x, y, w, h);
  const pad = 18 * s + (k.frame === "slant" ? 6 * s : 0);
  if (speaker) {
    const nameW = p.measure(speaker, 14, { raw: true }) + 28 * s;
    if (k.frame === "ornate") p.text(speaker, x + w / 2, y - 2 * s, 17, { align: "center", raw: true, color: k.accent });
    else {
      p.panel(x + pad - 6 * s, y - 14 * s, nameW, 26 * s, true);
      p.text(speaker, x + pad + 8 * s, y - 1 * s, 14, { raw: true, color: k.frame === "bubble" ? k.text : k.accent === "#ffffff" ? k.text : k.accent });
    }
  }
  const textW = choices.length ? w * 0.58 : w - pad * 2;
  const typed = o.preview ? line : line.slice(0, Math.floor(o.textAge * 45));
  p.wrap(typed, textW, 15)
    .slice(0, 4)
    .forEach((row, i) => p.text(row, x + pad, y + 30 * s + i * 22 * s, 15, { raw: true }));
  if (choices.length) {
    const cx = x + pad + textW + 16 * s;
    const cw = x + w - pad - cx;
    const ch = Math.min(34 * s, (h - 24 * s) / choices.length - 6 * s);
    choices.forEach((choice, i) => {
      const cy = y + 14 * s + i * (ch + 6 * s);
      p.button(cx, cy, cw, ch, `${i + 1}. ${choice}`, inside(d.pointer, cx, cy, cw, ch), hits, `choice:${i + 1}`, 12);
    });
  } else hits.push({ left: x, top: y, width: w, height: h, action: "next" });
};

const notification: Draw = (p, r, d, o) => {
  const { k, s } = p;
  const [title = "", ...rest] = o.text.split("\n");
  if (!title) return;
  const age = o.preview ? 1 : o.textAge;
  if (age > 5) return;
  const t = Math.min(1, age / 0.3);
  const alpha = age > 4.4 ? Math.max(0, 1 - (age - 4.4) / 0.6) : t;
  const { left: x, width: w, height: h } = r;
  const y = r.top - (1 - t) * 24 * s;
  p.ctx.globalAlpha = alpha;
  if (k.frame === "ornate") {
    // A centred banner between gold rules (Elden Ring's area names).
    p.text(title, x + w / 2, y + h * 0.42, 24, { align: "center", raw: true });
    p.ctx.fillStyle = k.accent;
    p.ctx.fillRect(x, y + h * 0.78, w, s);
    if (rest.length) p.text(rest.join(" "), x + w / 2, y + h * 0.95, 12, { align: "center", raw: true, color: k.dim });
  } else {
    p.panel(x, y, w, h, k.frame === "bubble");
    const pad = 16 * s + (k.frame === "slant" ? 8 * s : 0);
    p.icon("star", x + pad + 10 * s, y + h / 2, 20 * s, k.accent === "#ffffff" ? "#ffd54a" : k.accent);
    p.text(title, x + pad + 30 * s, y + h * 0.36, 16, { weight: 800, max: w - pad * 2 - 30 * s });
    if (rest.length) p.text(rest.join(" "), x + pad + 30 * s, y + h * 0.68, 12, { raw: true, color: k.dim, max: w - pad * 2 - 30 * s });
  }
  p.ctx.globalAlpha = 1;
};

const fighterBars: Draw = (p, r, d) => {
  const f = d.fighter;
  if (!f) return;
  const { k, s } = p;
  const { left: x, top: y, width: w, height: h } = r;
  p.panel(x, y, w, h);
  const pad = 12 * s, bw = w - pad * 2 - 74 * s;
  const row = (i: number, th: number, ratio: number, color: string, label: string) => {
    const top = y + pad + i * ((h - pad * 2) / 4);
    p.bar(x + pad, top, bw, th * s, ratio, color);
    p.text(label, x + pad + bw + 8 * s, top + (th * s) / 2, 11, { weight: 700, color: k.dim });
  };
  row(0, 14, f.health, f.health > 0.3 ? k.health : k.danger, "HP");
  row(1, 9, f.mana, k.shield, "MANA");
  row(2, 9, f.energy, f.energy >= 0.9 ? k.accent : k.stamina, f.energy >= 0.9 ? "ULTIMATE READY" : "ULTIMATE");
  row(3, 6, f.guard, k.text, "GUARD");
};
const hint: Draw = (p, r, d, o) => {
  if (d.captured && !o.preview) return;
  const text = o.text.split("\n")[0] ?? "";
  if (!text) return;
  p.panel(r.left, r.top, r.width, r.height);
  p.text(text, r.left + r.width / 2, r.top + r.height / 2, 13, { align: "center", raw: true, max: r.width - 16 });
};
// These draw live in the game's own views (the car and flight views); the widget is the switch,
// and what you see while editing is its placeholder.
const placeholder = (label: string): Draw => (p, r, d, o) => {
  if (!o.preview) return;
  p.panel(r.left, r.top, r.width, r.height);
  p.text(label, r.left + r.width / 2, r.top + r.height / 2, 12, { align: "center", raw: true, color: p.k.dim, max: r.width - 12 });
};

const draws: Record<UIWidget, Draw> = {
  "Fighter bars": fighterBars,
  "World health bar": placeholder("World health bars (shown over entities in play)"),
  Hint: hint,
  "Vehicle instruments": placeholder("Vehicle instruments (shown while driving)"),
  "Flight instruments": placeholder("Flight instruments (shown while flying)"),
  Health: health,
  Ammo: ammo,
  Crosshair: crosshair,
  "Damage numbers": damageNumbers,
  "Kill feed": killFeed,
  "Boss bar": bossBar,
  Minimap: minimap,
  Compass: compass,
  Objective: objective,
  Waypoints: waypoints,
  "Interact prompt": interactPrompt,
  "Pickup feed": pickupFeed,
  "Loot card": lootCard,
  Inventory: inventory,
  Hotbar: hotbar,
  "Weapon wheel": weaponWheel,
  "Pause menu": pauseMenu,
  "Main menu": mainMenu,
  Settings: settings,
  Dialogue: dialogue,
  Notification: notification,
};

// Paints one widget in `rect` and returns what clicks on it do.
export function drawWidget(ctx: CanvasRenderingContext2D, input: WidgetInput, rect: UIRect, data: UIData): UIHit[] {
  const hits: UIHit[] = [];
  const paint = new Paint(ctx, skins[input.style], input.fontSize / 16);
  ctx.save();
  try {
    draws[input.widget](paint, rect, data, input, hits);
  } finally {
    ctx.restore();
  }
  return hits;
}

// What the widgets show while editing: a player mid-fight.
export function sampleUIData(time: number, width: number, height: number): UIData {
  return {
    time,
    width,
    height,
    pointer: undefined,
    health: 0.68,
    healthGhost: 0.8,
    healthMax: 100,
    shield: 0.5,
    stamina: 0.85,
    weapon: { name: "Carbine", magazine: 18, capacity: 30, reserve: 90, reload: -1, melee: false },
    slots: [
      { name: "Pistol", melee: false },
      { name: "Carbine", melee: false },
      { name: "Sword", melee: true },
    ],
    slot: 1,
    spread: 4,
    hostile: false,
    hitAge: (time % 2) < 0.3 ? time % 2 : Infinity,
    killAge: Infinity,
    heading: 0,
    player: { x: 0, z: 0 },
    blips: [],
    markers: [],
    prompt: undefined,
    loot: undefined,
    pickups: [],
    kills: [],
    damage: [],
    boss: undefined,
    items: [],
    gear: undefined,
    settings: { master: 0.8, sensitivity: 1, invertY: false, aimAssist: true, shake: true },
    title: "My Game",
    fighter: { health: 0.68, mana: 0.6, energy: 0.45, guard: 0.8 },
    captured: false,
  };
}

// Applies a widget hit's slider or toggle to the settings; returns whether
// it was one.
export function applySettingHit(action: string, at: number, target: UIData["settings"]): boolean {
  const [kind, key] = action.split(":");
  if (kind === "slider") {
    if (key === "master") target.master = clamp01(at);
    else if (key === "sensitivity") target.sensitivity = 0.5 + clamp01(at);
    else return false;
    return true;
  }
  if (kind === "toggle" && (key === "invertY" || key === "aimAssist" || key === "shake")) {
    target[key] = !target[key];
    return true;
  }
  return false;
}
