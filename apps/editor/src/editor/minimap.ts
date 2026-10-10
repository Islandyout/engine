// Area maps (GATEBREAKER M4): a round minimap at the top right and a full
// map on M, both drawn on the HUD canvas from what a script sends:
//
// - hud.map_layout(spec): the static map, one item per line -- the bounds
//   the minimap shows inside, filled areas (blocks, the park, the river),
//   roads, building footprints, trees, points of interest (stations, the
//   smith, the Gate Board, home) and place names;
// - hud.map_marker(id, kind, x, z, color, label): what changes -- open Gate
//   sites in their rank's colour, quest givers (a ! over their heads in the
//   world too, ? when a quest is ready to hand in) and the tracked quest's
//   target, which stays on the minimap's rim while it is out of range.
//
// The minimap turns with the camera (an N on its rim) or stays north-up (N
// on the full map toggles it); its size (small, medium, large) comes from
// the player settings and shrinks on small screens. It shows while the
// player is inside the layout's bounds and no panel or Ledger window is up.
// The layout is drawn once into its own canvas; the minimap and the full
// map are redrawn at most 15 times a second into theirs and copied onto the
// HUD every frame, so neither costs a render pass of the 3D scene.
//
// M opens the full map (north up, a legend, every marker); M or Esc closes
// it, as does a click or tap. While it is open the game gets no keys or
// mouse. A tap on the minimap opens it (phones).
import * as THREE from "three";

export interface MapRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
export interface MapArea extends MapRect {
  color: string;
  label: string;
}
export interface MapPoint {
  kind: string;
  x: number;
  z: number;
  label: string;
}
export interface MapLayout {
  bounds: MapRect;
  areas: MapArea[];
  roads: MapRect[];
  buildings: MapRect[];
  trees: { x: number; z: number }[];
  pois: MapPoint[];
  labels: { x: number; z: number; text: string }[];
}
export interface MapMarker extends MapPoint {
  id: string;
  color: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const rect = (a: number, b: number, c: number, d: number): MapRect => ({ x0: Math.min(a, c), z0: Math.min(b, d), x1: Math.max(a, c), z1: Math.max(b, d) });

// hud.map_layout's text. Undefined without a "bounds" line.
export function parseMapLayout(spec: string): MapLayout | undefined {
  const layout: MapLayout = { bounds: rect(0, 0, 0, 0), areas: [], roads: [], buildings: [], trees: [], pois: [], labels: [] };
  let bounded = false;
  for (const raw of spec.split("\n")) {
    const parts = raw.trim().split(/\s+/);
    const kind = parts[0];
    if (!kind) continue;
    const n = (i: number) => Number(parts[i]);
    const numbers = (count: number, from = 1) => Array.from({ length: count }, (_, i) => n(from + i)).every(Number.isFinite);
    const rest = (from: number) => parts.slice(from).join(" ");
    if ((kind === "bounds" || kind === "area" || kind === "road" || kind === "building") && numbers(4)) {
      const r = rect(n(1), n(2), n(3), n(4));
      if (kind === "bounds") {
        layout.bounds = r;
        bounded = r.x1 > r.x0 && r.z1 > r.z0;
      } else if (kind === "road") layout.roads.push(r);
      else if (kind === "building") layout.buildings.push(r);
      else if (HEX.test(parts[5] ?? "")) layout.areas.push({ ...r, color: parts[5]!, label: rest(6) });
    } else if (kind === "tree" && numbers(2)) layout.trees.push({ x: n(1), z: n(2) });
    else if (kind === "poi" && parts[1] && numbers(2, 2)) layout.pois.push({ kind: parts[1], x: n(2), z: n(3), label: rest(4) });
    else if (kind === "label" && numbers(2) && parts.length > 3) layout.labels.push({ x: n(1), z: n(2), text: rest(3) });
  }
  return bounded ? layout : undefined;
}

// hud.map_marker's text: "id|kind|x|z|color|label".
export function parseMapMarker(text: string): MapMarker | undefined {
  const [id = "", kind = "", x = "", z = "", color = "", ...label] = text.split("|");
  if (!id || !kind || !Number.isFinite(Number(x)) || !Number.isFinite(Number(z)) || x === "" || z === "") return undefined;
  return { id, kind, x: Number(x), z: Number(z), color: HEX.test(color) ? color : "", label: label.join("|") };
}

// A world offset (dx, dz) from the player in the minimap's frame: `up` is
// along `forward` (a unit xz heading: the camera's, or north +z), `right`
// to its right. Seen from above with +z up the screen, +x is on the left:
// the map is the world's own handedness, never a mirror of it.
export function toMinimap(dx: number, dz: number, fx: number, fz: number): { right: number; up: number } {
  return { right: -dx * fz + dz * fx, up: dx * fx + dz * fz };
}

// A point held inside a circle of `radius` (the rim, for far markers).
export function clampToRim(x: number, y: number, radius: number): { x: number; y: number; clamped: boolean } {
  const d = Math.hypot(x, y);
  if (d <= radius || d === 0) return { x, y, clamped: false };
  return { x: (x / d) * radius, y: (y / d) * radius, clamped: true };
}

// The minimap's diameter: small, medium or large (the player setting),
// shrunk on screens under 960 x 720, never under 88 px.
export function minimapDiameter(size: string | undefined, width: number, height: number): number {
  const base = size === "small" ? 140 : size === "large" ? 210 : 180;
  return Math.round(Math.max(88, base * Math.min(1, height / 720, width / 960)));
}

// Rank colours, low to high: the same steps as item rarity.
export const RANK_COLORS: Record<string, string> = { E: "#a9b4c4", D: "#5fd16a", C: "#4aa8ff", B: "#b866ff", A: "#ffb020", S: "#ff4545" };

// The layout image: PX pixels a metre, north (+z) up, +x to the left, with a
// margin of river and street around the bounds.
const PX = 4;
const MARGIN = 10;
export function imageFrame(bounds: MapRect) {
  const x0 = bounds.x0 - MARGIN,
    x1 = bounds.x1 + MARGIN,
    z0 = bounds.z0 - MARGIN,
    z1 = bounds.z1 + MARGIN;
  return { x0, x1, z0, z1, width: Math.ceil((x1 - x0) * PX), height: Math.ceil((z1 - z0) * PX) };
}
// World (x, z) to the layout image's pixels.
export function toImage(frame: { x1: number; z1: number }, x: number, z: number) {
  return { u: (frame.x1 - x) * PX, v: (frame.z1 - z) * PX };
}

// The canvas transform [a, b, c, d, e, f] that draws the layout image on the
// minimap: centred on the player (px, pz) at (cx, cy), `scale` pixels a
// metre, `forward` up.
export function minimapTransform(frame: { x1: number; z1: number }, px: number, pz: number, fx: number, fz: number, scale: number, cx: number, cy: number) {
  const k = scale / PX;
  const r0 = -(frame.x1 - px) * fz + (frame.z1 - pz) * fx;
  const u0 = (frame.x1 - px) * fx + (frame.z1 - pz) * fz;
  return [k * fz, k * fx, -k * fx, k * fz, cx + scale * r0, cy - scale * u0] as const;
}

// The full map's box inside (x, y, w, h): the image's aspect, centred.
export function fitMap(frame: { width: number; height: number }, x: number, y: number, w: number, h: number) {
  const s = Math.min(w / frame.width, h / frame.height);
  const mw = frame.width * s,
    mh = frame.height * s;
  return { x: x + (w - mw) / 2, y: y + (h - mh) / 2, w: mw, h: mh, scale: s * PX };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// Where a w x h label near an icon at (x, y) (`gap` from its centre) fits:
// below, above, right, left, then the corners, clear of everything in
// `taken` (which it joins). Undefined when it fits nowhere.
export function placeLabel(taken: Box[], x: number, y: number, gap: number, w: number, h: number): { x: number; y: number } | undefined {
  const below = y + gap + h / 2,
    above = y - gap - h / 2,
    right = x + gap + w / 2,
    left = x - gap - w / 2;
  for (const [cx, cy] of [
    [x, below],
    [x, above],
    [right, y],
    [left, y],
    [x + w / 2, below],
    [x - w / 2, below],
    [x + w / 2, above],
    [x - w / 2, above],
  ] as const) {
    const box = { x: cx - w / 2, y: cy - h / 2, w, h };
    if (taken.some((t) => overlaps(t, box))) continue;
    taken.push(box);
    return { x: cx, y: cy };
  }
  return undefined;
}

const FONT = "-apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
const INK = "#05060a";
// Kept on the minimap's rim when out of range; the rest only show in range.
const RIM_KINDS = new Set(["target", "gate", "giver", "turnin"]);
const LEGEND: [kind: string, text: string][] = [
  ["player", "You"],
  ["gate", "Open Gate (rank colour)"],
  ["site", "Gate site (closed today)"],
  ["station", "Subway station (G: ride)"],
  ["board", "Gate Board"],
  ["smith", "Smith Kang"],
  ["home", "Home: rest, save"],
  ["mat", "Training mat (Daily)"],
  ["giver", "Quest to take"],
  ["turnin", "Quest to hand in"],
  ["target-rim", "Tracked quest"],
];

function inkText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill = "#ffffff", weight = 800) {
  ctx.font = `${weight} ${Math.round(size)}px ${FONT}`;
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2.5, size * 0.28);
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

// One icon, centred at (x, y), about `size` pixels across.
export function drawIcon(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, size: number, color = "", heading?: { x: number; y: number }, time = 0) {
  const r = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1.5, size * 0.12);
  ctx.strokeStyle = INK;
  const disc = (fill: string, radius = r) => {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };
  const glyph = (text: string, fill: string) => {
    ctx.font = `900 ${Math.round(size * 0.78)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = fill;
    ctx.fillText(text, 0, size * 0.04);
  };
  switch (kind) {
    case "player": {
      // An arrow along the heading (screen x right, y down).
      const h = heading ?? { x: 0, y: -1 };
      ctx.rotate(Math.atan2(h.x, -h.y));
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.15);
      ctx.lineTo(r * 0.8, r * 0.85);
      ctx.lineTo(0, r * 0.4);
      ctx.lineTo(-r * 0.8, r * 0.85);
      ctx.closePath();
      ctx.lineWidth = Math.max(2, size * 0.16);
      ctx.fillStyle = "#ffffff";
      ctx.stroke();
      ctx.fill();
      break;
    }
    case "gate": {
      // A rift: the rank's colour round a dark eye, a white ring between.
      disc(color || RANK_COLORS.E!);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.52, 0, Math.PI * 2);
      ctx.fillStyle = "#12081f";
      ctx.fill();
      ctx.lineWidth = Math.max(1.2, size * 0.1);
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      break;
    }
    case "site": {
      ctx.setLineDash([size * 0.18, size * 0.14]);
      ctx.lineWidth = Math.max(1.2, size * 0.1);
      ctx.strokeStyle = "rgba(200,206,220,0.75)";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "station": {
      // Line 2 green, and a train's front: body, window, lamps.
      ctx.beginPath();
      ctx.roundRect(-r, -r, size, size, size * 0.22);
      ctx.fillStyle = "#2fae4a";
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(-r * 0.55, -r * 0.62, r * 1.1, r * 1.05, r * 0.25);
      ctx.fill();
      ctx.fillStyle = "#2fae4a";
      ctx.fillRect(-r * 0.38, -r * 0.45, r * 0.76, r * 0.36);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-r * 0.55, r * 0.55, r * 0.3, r * 0.22);
      ctx.fillRect(r * 0.25, r * 0.55, r * 0.3, r * 0.22);
      break;
    }
    case "smith": {
      disc("#ff8a3a");
      // An anvil.
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.moveTo(-r * 0.62, -r * 0.3);
      ctx.lineTo(r * 0.62, -r * 0.3);
      ctx.lineTo(r * 0.3, r * 0.05);
      ctx.lineTo(r * 0.18, r * 0.05);
      ctx.lineTo(r * 0.3, r * 0.45);
      ctx.lineTo(-r * 0.3, r * 0.45);
      ctx.lineTo(-r * 0.18, r * 0.05);
      ctx.lineTo(-r * 0.4, r * 0.05);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "board": {
      ctx.beginPath();
      ctx.rect(-r, -r * 0.8, size, size * 0.8);
      ctx.fillStyle = "#3fd0ff";
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      for (const k of [-0.42, -0.08, 0.26]) ctx.fillRect(-r * 0.62, r * k, r * 1.24, r * 0.16);
      break;
    }
    case "home": {
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r, -r * 0.05);
      ctx.lineTo(r * 0.72, -r * 0.05);
      ctx.lineTo(r * 0.72, r * 0.85);
      ctx.lineTo(-r * 0.72, r * 0.85);
      ctx.lineTo(-r * 0.72, -r * 0.05);
      ctx.lineTo(-r, -r * 0.05);
      ctx.closePath();
      ctx.fillStyle = "#ffd59a";
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.fillRect(-r * 0.2, r * 0.25, r * 0.4, r * 0.6);
      break;
    }
    case "mat": {
      ctx.beginPath();
      ctx.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6);
      ctx.fillStyle = "#d8424e";
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "giver":
    case "turnin": {
      disc("#ffd84a");
      glyph(kind === "giver" ? "!" : "?", INK);
      break;
    }
    case "target":
    case "target-rim": {
      // A ring round the spot that pulses outward, and a diamond pinned
      // above it (so the place's own icon still shows); on the rim, the
      // diamond alone.
      if (kind === "target") {
        const pulse = (time * 1.2) % 1;
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.9 + pulse * 0.8), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,225,77,${(1 - pulse) * 0.9})`;
        ctx.lineWidth = Math.max(1.5, size * 0.1);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(2, size * 0.14);
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.lineWidth = Math.max(1, size * 0.07);
        ctx.strokeStyle = "#ffe14d";
        ctx.stroke();
        ctx.translate(0, -size * 1.05);
        ctx.scale(0.8, 0.8);
      }
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.rect(-r * 0.62, -r * 0.62, r * 1.24, r * 1.24);
      ctx.fillStyle = "#ffe14d";
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.5, size * 0.12);
      ctx.fill();
      ctx.stroke();
      break;
    }
    default:
      disc(color || "#d0d6e4", r * 0.6);
  }
  ctx.restore();
}

export interface MapView {
  player?: THREE.Object3D;
  camera: THREE.Camera;
  // World to HUD pixels (undefined behind the camera).
  project: (point: THREE.Vector3) => { x: number; y: number } | undefined;
  minimap: boolean; // the player setting and the script's hud.minimap
  size?: string; // small, medium or large
  panels: boolean; // a comic-panel cutscene is playing
  window: boolean; // a Ledger window is up
}

const NORTH_UP_KEY = "game-engine-editor:minimap-north-up";
const REDRAW = 1 / 15;

export class DistrictMap {
  private layout?: MapLayout;
  private frame?: ReturnType<typeof imageFrame>;
  private image?: HTMLCanvasElement;
  private readonly markers = new Map<string, MapMarker>();
  private mini?: HTMLCanvasElement;
  private big?: HTMLCanvasElement;
  private drawnAt = -Infinity;
  private bigAt = -Infinity;
  private miniBox?: { cx: number; cy: number; r: number };
  // What the last frame saw: the player inside the bounds, and whether a
  // panel holds the screen.
  private inside = false;
  private blocked = false;
  open = false;
  northUp = false;

  constructor() {
    try {
      this.northUp = globalThis.localStorage?.getItem(NORTH_UP_KEY) === "1";
    } catch {
      this.northUp = false;
    }
  }

  // A script's hud.map_layout / hud.map_marker / hud.clear_map_marker.
  host(kind: string, text: string) {
    if (kind === "map_layout") {
      this.layout = text.trim() ? parseMapLayout(text) : undefined;
      this.frame = this.layout && imageFrame(this.layout.bounds);
      this.image = undefined;
      this.drawnAt = this.bigAt = -Infinity;
      if (!this.layout) this.open = false;
    } else if (kind === "map_marker") {
      const marker = parseMapMarker(text);
      if (marker) this.markers.set(marker.id, marker);
      this.drawnAt = this.bigAt = -Infinity;
    } else if (kind === "map_marker_clear") {
      this.markers.delete(text);
      this.drawnAt = this.bigAt = -Infinity;
    }
  }

  reset() {
    this.layout = this.frame = this.image = this.miniBox = undefined;
    this.markers.clear();
    this.open = this.inside = this.blocked = false;
  }

  get canOpen(): boolean {
    return !!this.layout && this.inside && !this.blocked;
  }

  toggleNorthUp() {
    this.northUp = !this.northUp;
    this.drawnAt = this.bigAt = -Infinity;
    try {
      globalThis.localStorage?.setItem(NORTH_UP_KEY, this.northUp ? "1" : "0");
    } catch {
      // Private windows: the choice lasts for this visit.
    }
  }

  setOpen(open: boolean) {
    this.open = open && this.canOpen;
    this.bigAt = -Infinity;
  }

  // A key from the touch controls (they bypass the DOM's key events):
  // true when the map took it.
  touchKey(code: string, down: boolean): boolean {
    if (this.open) {
      if (down && (code === "KeyM" || code === "Escape")) this.setOpen(false);
      return true;
    }
    if (down && code === "KeyM" && this.canOpen) {
      this.setOpen(true);
      return true;
    }
    return false;
  }

  // Keys and pointer events, caught before the game's own listeners: M
  // opens the map; while it is open nothing reaches the game.
  bindInput(target: Window, playing: () => boolean, onOpen: () => void) {
    const stop = (event: Event) => {
      event.stopImmediatePropagation();
      if (!(event instanceof KeyboardEvent) || !/^F\d+$/.test(event.code)) event.preventDefault();
    };
    target.addEventListener(
      "keydown",
      (event) => {
        if (!playing()) return;
        const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
        if (this.open) {
          stop(event);
          if (event.repeat) return;
          if (event.code === "KeyM" || event.code === "Escape") this.setOpen(false);
          else if (event.code === "KeyN") this.toggleNorthUp();
        } else if (!typing && event.code === "KeyM" && !event.repeat && this.canOpen) {
          stop(event);
          this.setOpen(true);
          onOpen();
        }
      },
      { capture: true },
    );
    target.addEventListener(
      "pointerdown",
      (event) => {
        if (!playing()) return;
        if (this.open) {
          stop(event);
          this.setOpen(false);
          return;
        }
        // A tap on the minimap opens the map.
        const box = this.miniBox;
        const canvas = event.target instanceof HTMLCanvasElement ? event.target : undefined;
        if (!box || !canvas || !this.canOpen) return;
        const bounds = canvas.getBoundingClientRect();
        if (Math.hypot(event.clientX - bounds.left - box.cx, event.clientY - bounds.top - box.cy) > box.r) return;
        stop(event);
        this.setOpen(true);
        onOpen();
      },
      { capture: true },
    );
    for (const type of ["pointermove", "mousemove", "wheel", "contextmenu"] as const)
      target.addEventListener(
        type,
        (event) => {
          if (this.open && playing()) stop(event);
        },
        { capture: true },
      );
  }

  // Every frame (Play and Pause). Returns lines for the HUD's text mirror.
  draw(ctx: CanvasRenderingContext2D, width: number, height: number, view: MapView, time = performance.now() / 1000): string[] {
    const layout = this.layout;
    this.miniBox = undefined;
    if (!layout || !view.player) {
      this.open = false;
      return [];
    }
    const me = view.player.position;
    const b = layout.bounds;
    this.inside = me.x >= b.x0 && me.x <= b.x1 && me.z >= b.z0 && me.z <= b.z1;
    this.blocked = view.panels;
    if (!this.inside || view.panels) this.open = false;
    if (!this.inside) return [];
    const lines: string[] = [];
    // (Under a Ledger window: none, rather than over it.)
    if (!this.open && !view.panels && !view.window) lines.push(...this.drawWorldMarks(ctx, view, time));
    if (this.open) return [...lines, this.drawBig(ctx, width, height, view, time)];
    if (!view.minimap || view.panels || view.window) return lines;
    return [...lines, this.drawMini(ctx, width, height, view, time)];
  }

  private ensureImage(): HTMLCanvasElement | undefined {
    if (this.image || !this.layout || !this.frame || typeof document === "undefined") return this.image;
    const { layout, frame } = this;
    const canvas = document.createElement("canvas");
    canvas.width = frame.width;
    canvas.height = frame.height;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#1a1e29";
    g.fillRect(0, 0, frame.width, frame.height);
    const box = (r: MapRect) => {
      const a = toImage(frame, r.x1, r.z1);
      return [a.u, a.v, (r.x1 - r.x0) * PX, (r.z1 - r.z0) * PX] as const;
    };
    for (const area of layout.areas) {
      g.fillStyle = area.color;
      g.fillRect(...box(area));
    }
    // Roads: kerb-dark edges, a light surface.
    g.fillStyle = "#0e1016";
    for (const road of layout.roads) {
      const [u, v, w, h] = box(road);
      g.fillRect(u - 3, v - 3, w + 6, h + 6);
    }
    g.fillStyle = "#8d94a6";
    for (const road of layout.roads) g.fillRect(...box(road));
    // Trees: dark green dots.
    g.fillStyle = "#2f6a3c";
    g.strokeStyle = "#0f2414";
    g.lineWidth = 2;
    for (const tree of layout.trees) {
      const p = toImage(frame, tree.x, tree.z);
      g.beginPath();
      g.arc(p.u, p.v, 1.8 * PX, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // Buildings: solid blocks, inked.
    g.lineWidth = 3;
    g.strokeStyle = INK;
    for (const building of layout.buildings) {
      const [u, v, w, h] = box(building);
      g.fillStyle = "#3a3f4f";
      g.fillRect(u, v, w, h);
      g.fillStyle = "#4a5064";
      g.fillRect(u + 3, v + 3, w - 6, Math.min(h - 6, 6));
      g.strokeRect(u, v, w, h);
    }
    this.image = canvas;
    return canvas;
  }

  private markerList(): MapPoint[] {
    return [...(this.layout?.pois ?? []), ...this.markers.values()];
  }

  // The ! and ? over quest givers' heads.
  private drawWorldMarks(ctx: CanvasRenderingContext2D, view: MapView, time: number): string[] {
    const me = view.player!.position;
    const lines: string[] = [];
    for (const m of this.markers.values()) {
      if (m.kind !== "giver" && m.kind !== "turnin") continue;
      const d = Math.hypot(m.x - me.x, m.z - me.z);
      if (d > 45) continue;
      const at = view.project(new THREE.Vector3(m.x, 2.25 + Math.sin(time * 3 + m.x) * 0.06, m.z));
      if (!at) continue;
      const size = Math.max(22, Math.min(44, 560 / Math.max(d, 1)));
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      inkText(ctx, m.kind === "giver" ? "!" : "?", at.x, at.y, size, "#ffd84a", 900);
      ctx.restore();
      if (d < 12) lines.push(`${m.kind === "giver" ? "!" : "?"} ${m.label}`);
    }
    return lines;
  }

  private forward(view: MapView): { x: number; z: number } {
    if (this.northUp) return { x: 0, z: 1 };
    const dir = view.camera.getWorldDirection(new THREE.Vector3());
    const length = Math.hypot(dir.x, dir.z);
    return length > 1e-4 ? { x: dir.x / length, z: dir.z / length } : { x: 0, z: 1 };
  }

  private facing(view: MapView): { x: number; z: number } {
    const dir = view.player!.getWorldDirection(new THREE.Vector3());
    const length = Math.hypot(dir.x, dir.z);
    return length > 1e-4 ? { x: dir.x / length, z: dir.z / length } : { x: 0, z: 1 };
  }

  private tracked(): MapMarker | undefined {
    for (const m of this.markers.values()) if (m.kind === "target") return m;
    return undefined;
  }

  private drawMini(ctx: CanvasRenderingContext2D, width: number, height: number, view: MapView, time: number): string {
    const d = minimapDiameter(view.size, width, height);
    const r = d / 2;
    const pad = 14; // room for the N and the plate on the rim
    const left = width - 18 - d,
      top = 12;
    this.miniBox = { cx: left + r, cy: top + r, r };
    const me = view.player!.position;
    const target = this.tracked();
    const far = target ? Math.round(Math.hypot(target.x - me.x, target.z - me.z)) : 0;
    if (typeof document !== "undefined" && time - this.drawnAt >= REDRAW) {
      this.drawnAt = time;
      const size = d + pad * 2;
      if (!this.mini) this.mini = document.createElement("canvas");
      if (this.mini.width !== size) this.mini.width = this.mini.height = size;
      const g = this.mini.getContext("2d")!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, size, size);
      const cx = size / 2,
        cy = size / 2;
      // 45 metres from the centre to the rim.
      const scale = r / 45;
      const f = this.forward(view);
      g.save();
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fillStyle = "#1a1e29";
      g.fill();
      g.clip();
      const image = this.ensureImage();
      if (image && this.frame) {
        g.setTransform(...minimapTransform(this.frame, me.x, me.z, f.x, f.z, scale, cx, cy));
        g.drawImage(image, 0, 0);
        g.setTransform(1, 0, 0, 1, 0, 0);
      }
      // A dark wash toward the rim keeps icons readable over the streets.
      const wash = g.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
      wash.addColorStop(0, "rgba(8,10,18,0)");
      wash.addColorStop(1, "rgba(8,10,18,0.45)");
      g.fillStyle = wash;
      g.fillRect(0, 0, size, size);
      const icon = Math.max(12, Math.round(d * 0.095));
      const place = (x: number, z: number) => {
        const p = toMinimap(x - me.x, z - me.z, f.x, f.z);
        return { x: p.right * scale, y: -p.up * scale };
      };
      // Markers: the target last, so it sits on top.
      const points = this.markerList().sort((a, b) => Number(a.kind === "target") - Number(b.kind === "target"));
      for (const m of points) {
        const p = place(m.x, m.z);
        const inner = r - icon * 0.7;
        const rim = clampToRim(p.x, p.y, inner);
        if (rim.clamped && !RIM_KINDS.has(m.kind)) continue;
        g.globalAlpha = rim.clamped ? 0.85 : 1;
        const kind = rim.clamped && m.kind === "target" ? "target-rim" : m.kind;
        drawIcon(g, kind, cx + rim.x, cy + rim.y, rim.clamped ? icon * 0.85 : icon, (m as MapMarker).color, undefined, time);
        g.globalAlpha = 1;
      }
      // The hunter.
      const h = this.facing(view);
      const hp = toMinimap(h.x, h.z, f.x, f.z);
      drawIcon(g, "player", cx, cy, icon * 1.15, "", { x: hp.right, y: -hp.up });
      g.restore();
      // The ink rim: black, then a pale line inside it.
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.lineWidth = 4;
      g.strokeStyle = INK;
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, r - 3, 0, Math.PI * 2);
      g.lineWidth = 1.5;
      g.strokeStyle = "rgba(200,225,255,0.85)";
      g.stroke();
      g.textAlign = "center";
      g.textBaseline = "middle";
      // The tracked quest and how far: a plate on the bottom of the rim.
      if (target) {
        const text = `${target.label || "Quest"} · ${far} m`;
        const fs = Math.max(10, Math.round(d * 0.068));
        g.font = `800 ${fs}px ${FONT}`;
        const w = Math.min(d * 0.9, g.measureText(text).width + fs * 1.6);
        const y = cy + r - fs * 0.2;
        g.fillStyle = "rgba(6,8,14,0.92)";
        g.beginPath();
        g.roundRect(cx - w / 2, y - fs * 0.75, w, fs * 1.5, fs * 0.75);
        g.fill();
        g.lineWidth = 1.5;
        g.strokeStyle = "rgba(255,225,77,0.95)";
        g.stroke();
        g.fillStyle = "#ffe14d";
        g.fillText(text, cx, y + 0.5, w - fs * 0.6);
      }
      // N on the rim, over everything.
      const n = toMinimap(0, 1, f.x, f.z);
      const nx = cx + n.right * (r - 1),
        ny = cy - n.up * (r - 1);
      const nr = Math.max(8, d * 0.055);
      g.beginPath();
      g.arc(nx, ny, nr, 0, Math.PI * 2);
      g.fillStyle = "#e23b3b";
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = INK;
      g.stroke();
      g.font = `900 ${Math.round(nr * 1.3)}px ${FONT}`;
      g.fillStyle = "#ffffff";
      g.fillText("N", nx, ny + 0.5);
    }
    if (this.mini) ctx.drawImage(this.mini, left - pad, top - pad);
    return `Minimap${this.northUp ? " (north up)" : ""}${target ? `: ${target.label} ${far} m` : ""}`;
  }

  private drawBig(ctx: CanvasRenderingContext2D, width: number, height: number, view: MapView, time: number): string {
    const layout = this.layout!;
    const me = view.player!.position;
    const target = this.tracked();
    if (typeof document !== "undefined" && (time - this.bigAt >= REDRAW || !this.big || this.big.width !== width || this.big.height !== height)) {
      this.bigAt = time;
      if (!this.big) this.big = document.createElement("canvas");
      if (this.big.width !== width || this.big.height !== height) {
        this.big.width = width;
        this.big.height = height;
      }
      const g = this.big.getContext("2d")!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, width, height);
      const k = Math.min(1.25, Math.max(0.6, Math.min(width / 1280, height / 720)));
      g.fillStyle = "rgba(4,6,14,0.88)";
      g.fillRect(0, 0, width, height);
      // The Ledger's pane: navy, a glowing edge.
      const m = Math.round(16 * k);
      const px = m,
        py = m,
        pw = width - m * 2,
        ph = height - m * 2;
      g.save();
      g.shadowColor = "rgba(90,180,255,0.85)";
      g.shadowBlur = 20 * k;
      g.fillStyle = "rgba(10,18,40,0.96)";
      g.fillRect(px, py, pw, ph);
      g.restore();
      g.lineWidth = 2;
      g.strokeStyle = "rgba(120,200,255,0.95)";
      g.strokeRect(px, py, pw, ph);
      // Title.
      g.textAlign = "left";
      g.textBaseline = "top";
      g.fillStyle = "rgba(140,210,255,0.9)";
      g.font = `700 ${Math.round(12 * k)}px ${FONT}`;
      g.fillText("◆  THE LEDGER  ◆", px + 18 * k, py + 12 * k);
      g.fillStyle = "#ffffff";
      g.font = `800 ${Math.round(22 * k)}px ${FONT}`;
      g.fillText("DISTRICT MAP", px + 18 * k, py + 28 * k);
      // The map and the legend: side by side when wide, stacked when not;
      // the keys top right, or under the title on a narrow screen.
      const wide = pw > 720;
      g.textAlign = wide ? "right" : "left";
      g.fillStyle = "rgba(225,238,255,0.9)";
      g.font = `600 ${Math.round(13 * k)}px ${FONT}`;
      const keys = `M / Esc / tap: close   ·   N: minimap ${this.northUp ? "turns with you" : "north up"}`;
      g.fillText(keys, wide ? px + pw - 18 * k : px + 18 * k, wide ? py + 16 * k : py + 56 * k, pw - 36 * k);
      const legendW = wide ? Math.round(230 * k) : 0;
      const legendH = wide ? 0 : Math.round(118 * k);
      const top = (wide ? 62 : 80) * k;
      const area = { x: px + 18 * k, y: py + top, w: pw - 36 * k - legendW - (wide ? 16 * k : 0), h: ph - top - 18 * k - legendH };
      const frame = this.frame!;
      const fit = fitMap(frame, area.x, area.y, area.w, area.h);
      const image = this.ensureImage();
      if (image) g.drawImage(image, fit.x, fit.y, fit.w, fit.h);
      g.lineWidth = 3;
      g.strokeStyle = INK;
      g.strokeRect(fit.x, fit.y, fit.w, fit.h);
      const at = (x: number, z: number) => ({ x: fit.x + (frame.x1 - x) * fit.scale, y: fit.y + (frame.z1 - z) * fit.scale });
      g.save();
      g.beginPath();
      g.rect(fit.x, fit.y, fit.w, fit.h);
      g.clip();
      // Markers, then their labels and the place names wherever they fit:
      // below, above, right or left of the icon, clear of every other icon
      // and label (one that fits nowhere is left out).
      const icon = Math.round(20 * k);
      const points = this.markerList().sort((a, b) => Number(a.kind === "target") - Number(b.kind === "target"));
      const taken: Box[] = [];
      const hunter = at(me.x, me.z);
      taken.push({ x: hunter.x - icon * 0.7, y: hunter.y - icon * 0.7, w: icon * 1.4, h: icon * 1.4 });
      for (const p of points) {
        const s = at(p.x, p.z);
        drawIcon(g, p.kind, s.x, s.y, icon, (p as MapMarker).color, undefined, time);
        if (p.kind !== "target") taken.push({ x: s.x - icon / 2, y: s.y - icon / 2, w: icon, h: icon });
      }
      g.textAlign = "center";
      g.textBaseline = "middle";
      const labelSize = 11.5 * k;
      g.font = `700 ${Math.round(labelSize)}px ${FONT}`;
      const order = ["giver", "turnin", "gate", "station", "smith", "board", "home"];
      const named = points.filter((p) => p.label && p.kind !== "target").sort((a, b) => (order.indexOf(a.kind) + 99) % 99 - ((order.indexOf(b.kind) + 99) % 99));
      for (const p of named) {
        const s = at(p.x, p.z);
        const w = g.measureText(p.label).width + 6,
          h = labelSize + 4;
        const spot = placeLabel(taken, s.x, s.y, icon / 2 + 2, w, h);
        if (spot) inkText(g, p.label, spot.x, spot.y, labelSize, p.kind === "gate" ? (p as MapMarker).color || "#ffffff" : "#ffffff", 700);
      }
      for (const label of layout.labels) {
        const p = at(label.x, label.z);
        g.font = `700 ${Math.round(12 * k)}px ${FONT}`;
        const w = g.measureText(label.text).width + 6,
          h = 12 * k + 4;
        const box = { x: p.x - w / 2, y: p.y - h / 2, w, h };
        if (taken.some((t) => overlaps(t, box))) continue;
        taken.push(box);
        inkText(g, label.text, p.x, p.y, 12 * k, "rgba(232,238,250,0.92)", 700);
      }
      // The hunter, on top of everything.
      const h = this.facing(view);
      const s = at(me.x, me.z);
      drawIcon(g, "player", s.x, s.y, icon * 1.2, "", { x: -h.x, y: -h.z });
      g.restore();
      // N, above the map.
      g.textAlign = "center";
      g.textBaseline = "middle";
      inkText(g, "▲ N", fit.x + fit.w / 2, fit.y - 10 * k, 13 * k, "#ff6a6a", 900);
      // Legend.
      const lx = wide ? px + pw - legendW - 6 * k : px + 18 * k;
      let ly = wide ? py + 66 * k : fit.y + fit.h + 14 * k;
      const row = Math.round(23 * k);
      const columns = wide ? 1 : Math.max(1, Math.floor((pw - 36 * k) / (210 * k)));
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.fillStyle = "rgba(140,210,255,0.9)";
      g.font = `800 ${Math.round(12 * k)}px ${FONT}`;
      if (wide) {
        g.fillText("LEGEND", lx, ly);
        ly += row;
      }
      const startY = ly;
      LEGEND.forEach(([kind, text], i) => {
        const col = i % columns,
          rowIndex = Math.floor(i / columns);
        const x = lx + col * 210 * k,
          y = (wide ? startY : startY) + rowIndex * (wide ? row : row * 0.9);
        drawIcon(g, kind, x + 9 * k, y, Math.round(16 * k), kind === "gate" ? RANK_COLORS.D : "", kind === "player" ? { x: 0, y: -1 } : undefined, time);
        g.fillStyle = "#e6eeff";
        g.font = `600 ${Math.round(13 * k)}px ${FONT}`;
        g.fillText(text, x + 24 * k, y);
      });
      if (wide) {
        ly = startY + LEGEND.length * row + 8 * k;
        // The rank colours.
        g.fillStyle = "rgba(140,210,255,0.9)";
        g.font = `800 ${Math.round(12 * k)}px ${FONT}`;
        g.fillText("GATE RANKS", lx, ly);
        ly += row * 0.9;
        Object.entries(RANK_COLORS).forEach(([rank, color], i) => {
          const x = lx + 9 * k + i * 30 * k;
          drawIcon(g, "gate", x, ly, Math.round(16 * k), color);
          g.textAlign = "center";
          inkText(g, rank, x, ly + 16 * k, 11 * k, color, 900);
          g.textAlign = "left";
        });
        ly += row * 1.6;
        if (target) {
          g.fillStyle = "rgba(140,210,255,0.9)";
          g.font = `800 ${Math.round(12 * k)}px ${FONT}`;
          g.fillText("TRACKING", lx, ly);
          g.fillStyle = "#ffe14d";
          g.font = `700 ${Math.round(14 * k)}px ${FONT}`;
          g.fillText(`${target.label} · ${Math.round(Math.hypot(target.x - me.x, target.z - me.z))} m`, lx, ly + row * 0.9, legendW - 8 * k);
          g.fillStyle = "rgba(225,238,255,0.8)";
          g.font = `600 ${Math.round(12 * k)}px ${FONT}`;
          g.fillText("J: quest log, pick what to track", lx, ly + row * 1.8, legendW - 8 * k);
        }
      }
    }
    if (this.big) ctx.drawImage(this.big, 0, 0);
    const shown = [...this.markers.values()].filter((m) => m.label).map((m) => m.label);
    return `DISTRICT MAP: ${shown.join(", ")}${target ? ` · tracking ${target.label}` : ""} · M or Esc closes`;
  }
}
