// GATEBREAKER's interface (M1), drawn on the HUD canvas:
//
// - The Ledger's system windows (hud.system): a translucent navy pane with a
//   glowing edge, a title and body lines, sliding in.
// - Comic-panel cutscenes (hud.panels): each shot is a camera position and
//   target, a caption box and an optional sound word, framed as a slanted
//   manhwa panel with white gutters. Space or Enter skips the whole scene.
// - A boss bar (hud.boss): name, health and the stagger bar, with BREAK
//   flashing while the boss is Broken.
import * as THREE from "three";

export interface PanelShot {
  from: THREE.Vector3;
  to: THREE.Vector3;
  caption: string;
  sfx: string;
  seconds: number;
}

// "x y z > tx ty tz | caption | sfx | seconds", one shot per line.
export function parsePanels(spec: string): PanelShot[] {
  const shots: PanelShot[] = [];
  for (const line of spec.split("\n")) {
    if (!line.trim()) continue;
    const [where = "", caption = "", sfx = "", seconds = ""] = line.split("|").map((part) => part.trim());
    const [a = "", b = ""] = where.split(">");
    const from = a.trim().split(/\s+/).map(Number);
    const to = b.trim().split(/\s+/).map(Number);
    if (from.length !== 3 || to.length !== 3 || [...from, ...to].some((n) => !Number.isFinite(n))) continue;
    const time = Number(seconds);
    shots.push({
      from: new THREE.Vector3(from[0], from[1], from[2]),
      to: new THREE.Vector3(to[0], to[1], to[2]),
      caption,
      sfx,
      seconds: Number.isFinite(time) && time > 0 ? Math.min(time, 30) : 3,
    });
  }
  return shots;
}

// Splits text into lines no wider than `width` pixels.
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

const FONT = "-apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";

export interface BossReadout {
  health: number; // 0..1, < 0 gone
  stagger: number; // 0..1, < 0 none
  broken: boolean;
}

export class LedgerHud {
  private window?: { title: string; body: string; age: number };
  private shots: PanelShot[] = [];
  private shot = 0;
  private shotAge = 0;
  private boss?: { name: string; title: string; shown: number };
  readonly camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);

  // hud.system / hud.system_close.
  system(title: string, body: string) {
    if (!title) {
      this.window = undefined;
      return;
    }
    const same = this.window?.title === title;
    this.window = { title, body, age: same ? this.window!.age : 0 };
  }

  get systemText(): string {
    return this.window ? `${this.window.title}: ${this.window.body.replace(/\n/g, " ")}` : "";
  }

  panels(spec: string) {
    this.shots = parsePanels(spec);
    this.shot = 0;
    this.shotAge = 0;
  }

  get playing(): boolean {
    return this.shot < this.shots.length;
  }

  skip() {
    this.shot = this.shots.length;
  }

  // The bar's entity name and title; an empty name hides it.
  setBoss(name: string, title: string) {
    this.boss = name ? { name, title, shown: 0 } : undefined;
  }

  get bossName(): string | undefined {
    return this.boss?.name;
  }

  clear() {
    this.window = undefined;
    this.shots = [];
    this.shot = 0;
    this.boss = undefined;
  }

  // Real seconds. Points the cutscene camera at the current shot.
  update(dt: number, aspect: number) {
    if (this.window) this.window.age += dt;
    if (this.boss) this.boss.shown = Math.min(1, this.boss.shown + dt * 2);
    if (!this.playing) return;
    this.shotAge += dt;
    const current = this.shots[this.shot]!;
    if (this.shotAge >= current.seconds) {
      this.shot++;
      this.shotAge = 0;
      if (!this.playing) return;
    }
    const shot = this.shots[this.shot]!;
    // A slow push in, like a camera holding on a panel.
    const t = this.shotAge / shot.seconds;
    const push = shot.to.clone().sub(shot.from).multiplyScalar(0.06 * t);
    this.camera.position.copy(shot.from).add(push);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(shot.to);
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, boss?: BossReadout): string[] {
    const lines: string[] = [];
    const scale = height / 720;
    if (this.playing) lines.push(...this.drawPanel(ctx, width, height, scale));
    else if (this.boss && boss && boss.health >= 0) lines.push(this.drawBoss(ctx, width, height, scale, boss));
    if (this.window) lines.push(this.drawWindow(ctx, width, height, scale));
    return lines;
  }

  private drawPanel(ctx: CanvasRenderingContext2D, width: number, height: number, scale: number): string[] {
    const shot = this.shots[this.shot]!;
    const t = this.shotAge / shot.seconds;
    // A slanted panel: the edges lean a little differently every shot.
    const lean = ((this.shot % 3) - 1) * 0.035 * width;
    const m = 34 * scale;
    const quad: [[number, number], [number, number], [number, number], [number, number]] = [
      [m + Math.max(0, lean), m],
      [width - m + Math.min(0, lean), m],
      [width - m - Math.max(0, lean), height - m],
      [m - Math.min(0, lean), height - m],
    ];
    ctx.save();
    // White page around the panel (even-odd: everything but the quad).
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.moveTo(quad[0][0], quad[0][1]);
    for (const [px, py] of quad.slice(1)) ctx.lineTo(px, py);
    ctx.closePath();
    ctx.fillStyle = "#f4f1ea";
    ctx.fill("evenodd");
    // The ink border.
    ctx.beginPath();
    ctx.moveTo(quad[0][0], quad[0][1]);
    for (const [px, py] of quad.slice(1)) ctx.lineTo(px, py);
    ctx.closePath();
    ctx.lineWidth = 5 * scale;
    ctx.strokeStyle = "#08060c";
    ctx.stroke();
    // Each shot cuts in from black.
    const fade = Math.max(0, 1 - this.shotAge / 0.25);
    if (fade > 0) {
      ctx.globalAlpha = fade;
      ctx.fillStyle = "#08060c";
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
    // The caption box, top-left inside the panel.
    if (shot.caption) {
      ctx.font = `600 ${Math.round(19 * scale)}px ${FONT}`;
      const text = wrap(ctx, shot.caption, width * 0.42);
      const lineHeight = 26 * scale;
      const boxW = Math.max(...text.map((line) => ctx.measureText(line).width)) + 28 * scale;
      const boxH = text.length * lineHeight + 20 * scale;
      const x = quad[0][0] + 26 * scale;
      const y = m + 22 * scale;
      ctx.globalAlpha = Math.min(1, this.shotAge / 0.35);
      ctx.fillStyle = "#fdfbf6";
      ctx.fillRect(x, y, boxW, boxH);
      ctx.lineWidth = 3 * scale;
      ctx.strokeStyle = "#08060c";
      ctx.strokeRect(x, y, boxW, boxH);
      ctx.fillStyle = "#08060c";
      ctx.textBaseline = "top";
      text.forEach((line, i) => ctx.fillText(line, x + 14 * scale, y + 10 * scale + i * lineHeight));
      ctx.globalAlpha = 1;
    }
    // The sound word slams in at the right.
    if (shot.sfx && t > 0.15) {
      const pop = t < 0.25 ? 1.4 - ((t - 0.15) / 0.1) * 0.4 : 1;
      const size = 92 * scale;
      ctx.translate(width * 0.72, height * 0.62);
      ctx.rotate(-0.12);
      ctx.scale(pop, pop);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `italic 900 ${size}px Impact, 'Arial Black', ${FONT}`;
      ctx.lineJoin = "round";
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = "#08060c";
      ctx.strokeText(shot.sfx, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(shot.sfx, 0, 0);
    }
    ctx.restore();
    // How to skip.
    ctx.save();
    ctx.font = `600 ${Math.round(13 * scale)}px ${FONT}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(8,6,12,0.7)";
    ctx.fillText("Space / Enter: skip", width - m, height - 10 * scale);
    ctx.restore();
    return [`Panel ${this.shot + 1} of ${this.shots.length}: ${shot.caption}${shot.sfx ? ` (${shot.sfx})` : ""}`];
  }

  private drawWindow(ctx: CanvasRenderingContext2D, width: number, height: number, scale: number): string {
    const win = this.window!;
    const enter = Math.min(1, win.age / 0.3);
    const w = Math.min(560 * scale, width - 40);
    ctx.save();
    ctx.font = `${Math.round(16 * scale)}px ${FONT}`;
    const body = wrap(ctx, win.body, w - 48 * scale);
    const lineHeight = 23 * scale;
    const h = 92 * scale + body.length * lineHeight;
    const x = (width - w) / 2;
    const y = height * 0.2 - (1 - enter) * 30 * scale;
    ctx.globalAlpha = enter;
    // A glowing edge, then the pane.
    ctx.shadowColor = "rgba(90,180,255,0.85)";
    ctx.shadowBlur = 22 * scale;
    ctx.fillStyle = "rgba(10,18,40,0.88)";
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2 * scale;
    ctx.strokeStyle = "rgba(120,200,255,0.95)";
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = "rgba(120,200,255,0.35)";
    ctx.strokeRect(x + 6 * scale, y + 6 * scale, w - 12 * scale, h - 12 * scale);
    // Header.
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(140,210,255,0.9)";
    ctx.font = `700 ${Math.round(12 * scale)}px ${FONT}`;
    ctx.fillText("◆  THE LEDGER  ◆", width / 2, y + 14 * scale);
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${Math.round(22 * scale)}px ${FONT}`;
    ctx.fillText(win.title, width / 2, y + 34 * scale);
    ctx.fillStyle = "rgba(225,238,255,0.95)";
    ctx.font = `${Math.round(16 * scale)}px ${FONT}`;
    body.forEach((line, i) => ctx.fillText(line, width / 2, y + 72 * scale + i * lineHeight));
    ctx.restore();
    return `Ledger: ${this.systemText}`;
  }

  // Low and centred, above the player's own bars, clear of the controls
  // line and the objective at the top.
  private drawBoss(ctx: CanvasRenderingContext2D, width: number, height: number, scale: number, boss: BossReadout): string {
    const info = this.boss!;
    const w = Math.min(640 * scale, width * 0.6);
    const x = (width - w) / 2;
    const y = height - 165 * scale;
    ctx.save();
    ctx.globalAlpha = info.shown;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = `900 ${Math.round(18 * scale)}px ${FONT}`;
    ctx.lineWidth = 4 * scale;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText(info.title, width / 2, y - 6 * scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(info.title, width / 2, y - 6 * scale);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x - 3, y - 3, w + 6, 14 * scale + 6);
    ctx.fillStyle = "#c62b2b";
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, boss.health)), 14 * scale);
    if (boss.stagger >= 0) {
      const sy = y + 18 * scale;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x - 3, sy - 3, w + 6, 6 * scale + 6);
      ctx.fillStyle = boss.broken ? "#ffffff" : "#f2c230";
      ctx.fillRect(x, sy, w * (boss.broken ? 1 : Math.max(0, Math.min(1, boss.stagger))), 6 * scale);
    }
    if (boss.broken && Math.floor(performance.now() / 160) % 2 === 0) {
      ctx.textBaseline = "top";
      ctx.font = `italic 900 ${Math.round(26 * scale)}px Impact, 'Arial Black', ${FONT}`;
      ctx.strokeText("BREAK", width / 2, y + 30 * scale);
      ctx.fillStyle = "#f2c230";
      ctx.fillText("BREAK", width / 2, y + 30 * scale);
    }
    ctx.restore();
    return `${info.title}: ${Math.round(Math.max(0, boss.health) * 100)}%${boss.broken ? ", Broken" : ""}`;
  }
}
