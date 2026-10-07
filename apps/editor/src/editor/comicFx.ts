// Manhwa panel effects for melee (GATEBREAKER M0), drawn on the HUD canvas
// over the inked scene:
//
// - SFX lettering: the sound of a blow as a word (SHK, BOOM, CLANG), tilted
//   and outlined in ink, popping in at the impact and fading.
// - Speed lines: radial strokes rushing in from the panel's edges toward the
//   impact, leaving the subject clear, on heavy blows, parries and perfect
//   dodges.
// - Impact frames: for finishers, knockouts and parries, a few frames where
//   the ink pass inverts the panel to black and white (InkPass.impact).
//
// Everything runs on real time, so slow motion doesn't stretch the lettering.
import * as THREE from "three";

export type ComicHit = "light" | "heavy" | "finisher" | "block" | "parry" | "guardBreak" | "dodge" | "blast" | "break";

// Words per kind of blow; one is picked in turn so repeats vary.
export const SFX_WORDS: Record<ComicHit, readonly string[]> = {
  light: ["SHK", "TAK", "THWP", "SKT"],
  heavy: ["BOOM", "KRAK", "THOOM", "WHAM"],
  finisher: ["KA-BOOM", "KRA-KOOM", "DOOM"],
  block: ["CLANG", "TING", "KANG"],
  parry: ["SHING", "KSHING"],
  guardBreak: ["CRACK", "KRSSH"],
  dodge: ["FWOOSH", "SWSH"],
  blast: ["VWOOM", "FZZT"],
  break: ["BREAK!"],
};

interface Word {
  text: string;
  point: THREE.Vector3;
  age: number;
  life: number;
  size: number; // px at 720p
  tilt: number;
  fill: string;
  dx: number;
  dy: number;
}

interface Lines {
  point: THREE.Vector3;
  age: number;
  life: number;
  seed: number;
  dense: number; // 0..1
}

const BIG: ReadonlySet<ComicHit> = new Set(["heavy", "finisher", "parry", "guardBreak", "break"]);

export class ComicFx {
  enabled = false;
  // 0..1 while an impact frame is showing; the ink pass inverts the panel.
  impact = 0;
  private words: Word[] = [];
  private lines: Lines[] = [];
  private impactLeft = 0;
  private turn = 0;

  hit(kind: ComicHit, point: THREE.Vector3) {
    if (!this.enabled) return;
    const choices = SFX_WORDS[kind];
    const text = choices[this.turn++ % choices.length]!;
    const big = BIG.has(kind);
    const side = this.turn % 2 === 0 ? 1 : -1;
    this.words.push({
      text,
      point: point.clone(),
      age: 0,
      life: kind === "finisher" || kind === "break" ? 1.1 : big ? 0.8 : 0.55,
      size: kind === "finisher" || kind === "break" ? 96 : big ? 70 : kind === "dodge" ? 40 : 46,
      tilt: side * (0.1 + 0.12 * ((this.turn * 7) % 5) / 5),
      fill: kind === "break" ? "#f2c230" : kind === "parry" ? "#ffe066" : kind === "block" ? "#cfe3ff" : kind === "finisher" ? "#ff5a3a" : kind === "dodge" ? "#b9a6ff" : "#ffffff",
      dx: side * (big ? 70 : 46),
      // Consecutive words step up the panel instead of piling on each other.
      dy: -(big ? 70 : 44) - (this.turn % 3) * 34,
    });
    if (this.words.length > 6) this.words.shift();
    if (big || kind === "dodge") {
      this.lines.push({ point: point.clone(), age: 0, life: kind === "finisher" || kind === "break" ? 0.5 : 0.3, seed: this.turn * 977, dense: kind === "finisher" || kind === "break" ? 1 : 0.6 });
      if (this.lines.length > 2) this.lines.shift();
    }
    if (kind === "finisher" || kind === "parry" || kind === "break") this.impactLeft = kind === "parry" ? 0.06 : 0.09;
  }

  // Advances in real seconds.
  update(dt: number) {
    for (const w of this.words) w.age += dt;
    for (const l of this.lines) l.age += dt;
    this.words = this.words.filter((w) => w.age < w.life);
    this.lines = this.lines.filter((l) => l.age < l.life);
    this.impactLeft = Math.max(0, this.impactLeft - dt);
    this.impact = this.enabled && this.impactLeft > 0 ? 1 : 0;
  }

  clear() {
    this.words.length = 0;
    this.lines.length = 0;
    this.impactLeft = 0;
    this.impact = 0;
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, project: (point: THREE.Vector3) => { x: number; y: number } | undefined) {
    if (!this.enabled) return;
    const scale = height / 720;
    for (const l of this.lines) {
      const at = project(l.point);
      if (!at) continue;
      const t = l.age / l.life;
      const reach = Math.hypot(width, height);
      const clear = (140 + 80 * t) * scale; // the subject stays clear
      const count = Math.round(70 + 60 * l.dense);
      ctx.save();
      ctx.globalAlpha = 0.85 * (1 - t * t);
      ctx.fillStyle = "#050308";
      let seed = l.seed;
      const random = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      for (let i = 0; i < count; i++) {
        const angle = random() * Math.PI * 2;
        const inner = clear + random() * 180 * scale;
        const half = (0.004 + random() * 0.01) * (1 + l.dense);
        // A thin wedge from the edge of the panel toward the impact.
        ctx.beginPath();
        ctx.moveTo(at.x + Math.cos(angle) * inner, at.y + Math.sin(angle) * inner);
        ctx.lineTo(at.x + Math.cos(angle - half) * reach, at.y + Math.sin(angle - half) * reach);
        ctx.lineTo(at.x + Math.cos(angle + half) * reach, at.y + Math.sin(angle + half) * reach);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    for (const w of this.words) {
      const at = project(w.point);
      if (!at) continue;
      const t = w.age / w.life;
      // Slams in oversized, settles, then fades in its last third.
      const pop = t < 0.12 ? 1.45 - (t / 0.12) * 0.45 : 1 + 0.05 * (t - 0.12);
      const alpha = t < 0.66 ? 1 : 1 - (t - 0.66) / 0.34;
      const size = w.size * scale;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(at.x + w.dx * scale, at.y + w.dy * scale - t * 18 * scale);
      ctx.rotate(w.tilt);
      ctx.scale(pop, pop);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `italic 900 ${size}px Impact, 'Arial Black', 'Helvetica Neue', system-ui, sans-serif`;
      ctx.lineJoin = "round";
      // A wide ink outline, then a drop shadow offset, then the fill.
      ctx.lineWidth = Math.max(4, size * 0.16);
      ctx.strokeStyle = "#050308";
      ctx.strokeText(w.text, size * 0.05, size * 0.06);
      ctx.strokeText(w.text, 0, 0);
      ctx.fillStyle = w.fill;
      ctx.fillText(w.text, 0, 0);
      ctx.restore();
    }
  }
}
