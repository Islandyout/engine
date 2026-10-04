// Exploration HUD (0.73.0): the minimaps (flight: the bodies around the
// ship; on foot: what's around the walker) and the full-screen map (the
// system from above, or the current world's surface with its known sites).
// Pure drawing from plain data, so main.ts gathers and this only paints.

export interface MapBody {
  name: string;
  x: number; // system frame, star at the origin, metres (orbital plane x/z)
  z: number;
  radius: number;
  color: string;
  parent: number;
  target: boolean;
  current: boolean; // the ship's reference body
}

export interface MapSite {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  kind: string; // "site", "landmark", "resource", "waypoint", "ship", "player"
}

export interface LocalBlip {
  x: number; // frame metres, relative to the walker
  z: number;
  kind: "ship" | "marker" | "flora" | "fauna" | "mineral" | "resource" | "npc" | "site" | "fleeing";
  label?: string;
}

const COLORS: Record<string, string> = {
  ship: "#8ff7ff",
  marker: "#ffd36a",
  flora: "#7fd17a",
  fauna: "#f2c94c",
  mineral: "#b8c2cc",
  resource: "#6fc8ff",
  npc: "#e8a7ff",
  site: "#ffd36e",
  fleeing: "#ff6a5a",
  landmark: "#8ff7ff",
  waypoint: "#ffd36a",
  player: "#ffffff",
};

function frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "rgba(6, 12, 18, 0.72)";
  ctx.strokeStyle = "rgba(143, 247, 255, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = "#cfe7f5", align: CanvasTextAlign = "left") {
  ctx.font = "600 11px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// On foot: a north-up (frame -z up) disc of `range` metres around the
// walker; blips beyond it are pinned to the rim as arrows.
export function drawLocalMinimap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  heading: number,
  blips: LocalBlip[],
  range = 160,
) {
  const r = size / 2;
  const cx = x + r, cy = y + r;
  ctx.save();
  ctx.fillStyle = "rgba(6, 12, 18, 0.66)";
  ctx.strokeStyle = "rgba(143, 247, 255, 0.4)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(143, 247, 255, 0.12)";
  for (const f of [0.33, 0.66]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * f, 0, Math.PI * 2);
    ctx.stroke();
  }
  label(ctx, "N", cx, y + 9, "#8ff7ff", "center");
  for (const blip of blips) {
    const d = Math.hypot(blip.x, blip.z);
    const color = COLORS[blip.kind] ?? "#fff";
    if (d > range) {
      if (blip.kind !== "marker" && blip.kind !== "ship" && blip.kind !== "site") continue;
      const a = Math.atan2(blip.z, blip.x);
      const px = cx + Math.cos(a) * (r - 7), py = cy + Math.sin(a) * (r - 7);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-4, -4.5);
      ctx.lineTo(-4, 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      continue;
    }
    const px = cx + (blip.x / range) * (r - 6), py = cy + (blip.z / range) * (r - 6);
    ctx.fillStyle = color;
    ctx.beginPath();
    if (blip.kind === "ship") ctx.rect(px - 4, py - 4, 8, 8);
    else if (blip.kind === "marker" || blip.kind === "site") {
      ctx.moveTo(px, py - 5);
      ctx.lineTo(px + 5, py);
      ctx.lineTo(px, py + 5);
      ctx.lineTo(px - 5, py);
      ctx.closePath();
    } else ctx.arc(px, py, blip.kind === "npc" || blip.kind === "fauna" || blip.kind === "fleeing" ? 3 : 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // The walker, pointing the way they face.
  ctx.translate(cx, cy);
  ctx.rotate(heading);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 5);
  ctx.lineTo(0, 2);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// The system from above, fitted to the box; `focus` (a body index or -1
// for the star) is the centre, `span` the metres across.
export function drawSystem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  bodies: MapBody[],
  ship: { x: number; z: number } | undefined,
  focus: { x: number; z: number },
  span: number,
  title: string,
) {
  ctx.save();
  frame(ctx, x, y, w, h);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const scale = Math.min(w, h) / span;
  const px = (vx: number) => x + w / 2 + (vx - focus.x) * scale;
  const pz = (vz: number) => y + h / 2 + (vz - focus.z) * scale;
  // Orbits.
  ctx.strokeStyle = "rgba(143, 247, 255, 0.14)";
  for (const b of bodies) {
    const parent = b.parent >= 0 ? bodies[b.parent] : undefined;
    const ox = parent ? parent.x : 0, oz = parent ? parent.z : 0;
    const radius = Math.hypot(b.x - ox, b.z - oz) * scale;
    if (radius < 2 || radius > Math.max(w, h) * 6) continue;
    ctx.beginPath();
    ctx.arc(px(ox), pz(oz), radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  // The star.
  ctx.fillStyle = "#fff1d8";
  ctx.beginPath();
  ctx.arc(px(0), pz(0), 5, 0, Math.PI * 2);
  ctx.fill();
  for (const b of bodies) {
    const r = Math.max(3, b.radius * scale);
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(px(b.x), pz(b.z), r, 0, Math.PI * 2);
    ctx.fill();
    if (b.target) {
      ctx.strokeStyle = "#ffd36a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px(b.x), pz(b.z), r + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    label(ctx, b.name, px(b.x) + r + 5, pz(b.z), b.current ? "#8ff7ff" : b.target ? "#ffd36a" : "#cfe7f5");
  }
  if (ship) {
    ctx.fillStyle = "#8ff7ff";
    ctx.fillRect(px(ship.x) - 3, pz(ship.z) - 3, 6, 6);
  }
  ctx.restore();
  label(ctx, title, x + 10, y + 12, "#8ff7ff");
}

// A planet's surface as an equirectangular map with known sites.
export function drawSurface(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  image: CanvasImageSource | undefined,
  sites: MapSite[],
  title: string,
) {
  ctx.save();
  frame(ctx, x, y, w, h);
  const mx = x + 12, my = y + 26, mw = w - 24, mh = h - 38;
  if (image) ctx.drawImage(image, mx, my, mw, mh);
  ctx.strokeStyle = "rgba(143, 247, 255, 0.15)";
  for (let i = 1; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(mx, my + (mh * i) / 6);
    ctx.lineTo(mx + mw, my + (mh * i) / 6);
    ctx.stroke();
  }
  for (let i = 1; i < 12; i++) {
    ctx.beginPath();
    ctx.moveTo(mx + (mw * i) / 12, my);
    ctx.lineTo(mx + (mw * i) / 12, my + mh);
    ctx.stroke();
  }
  for (const site of sites) {
    const sx = mx + ((site.longitude + 180) / 360) * mw;
    const sy = my + ((90 - site.latitude) / 180) * mh;
    ctx.fillStyle = COLORS[site.kind] ?? "#ffd36e";
    ctx.beginPath();
    if (site.kind === "ship" || site.kind === "player") ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    else {
      ctx.moveTo(sx, sy - 6);
      ctx.lineTo(sx + 6, sy);
      ctx.lineTo(sx, sy + 6);
      ctx.lineTo(sx - 6, sy);
      ctx.closePath();
    }
    ctx.fill();
    label(ctx, site.label, sx + 9, sy, COLORS[site.kind] ?? "#ffd36e");
  }
  ctx.restore();
  label(ctx, title, x + 12, y + 13, "#8ff7ff");
}

// The equirectangular terrain image for a body, from a height sampler.
export function surfaceImage(
  width: number,
  height: number,
  sample: (x: number, y: number, z: number) => number,
  amplitude: number,
  base: string,
  sea: number | undefined,
  snow: boolean,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(width, height);
  const hex = parseInt(base.slice(1), 16);
  const br = (hex >> 16) & 255, bg = (hex >> 8) & 255, bb = hex & 255;
  for (let row = 0; row < height; row++) {
    const lat = (90 - ((row + 0.5) / height) * 180) * (Math.PI / 180);
    for (let col = 0; col < width; col++) {
      const lon = (((col + 0.5) / width) * 360 - 180) * (Math.PI / 180);
      const hgt = sample(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      const t = amplitude > 0 ? Math.max(-1, Math.min(1, hgt / amplitude)) : 0;
      let r = br * (0.75 + t * 0.35), g = bg * (0.75 + t * 0.35), b = bb * (0.75 + t * 0.35);
      if (sea !== undefined && hgt < sea) {
        const depth = Math.min(1, (sea - hgt) / Math.max(amplitude, 1));
        r = 22 + 18 * (1 - depth);
        g = 44 + 26 * (1 - depth);
        b = 52 + 30 * (1 - depth);
      } else if (snow && t > 0.55) {
        const k = Math.min(1, (t - 0.55) * 3);
        r += (236 - r) * k;
        g += (242 - g) * k;
        b += (246 - b) * k;
      }
      const i = (row * width + col) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// "id|body|lat|lon|label|kind" (host.send("map_site", ...)).
export function parseMapSite(text: string): (MapSite & { body: string }) | undefined {
  const [id, body, lat, lon, label = "", kind = "site"] = text.split("|");
  const latitude = Number(lat), longitude = Number(lon);
  if (!id || !body || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  return { id, body, latitude, longitude, label, kind };
}
