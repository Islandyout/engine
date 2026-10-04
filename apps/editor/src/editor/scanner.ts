// The field scanner (0.72.0): hold F facing something scannable -- a
// Scannable entity, a scattered plant or rock, a landmark -- and a scan
// fills. Aim and stillness speed it up; turning to another target keeps a
// little progress. A finished scan is reported once per key (a species is
// catalogued by scanning any one of it). Pure logic plus its HUD; main.ts
// gathers candidates and tells scripts (on_ui("scan", key)).
import * as THREE from "three";

export interface ScanTarget {
  key: string;
  name: string;
  kind: string;
  position: THREE.Vector3;
  range: number;
}

const seconds: Record<string, number> = { Landmark: 3, Culture: 2.4, Fauna: 2, Flora: 1.6, Mineral: 1.6 };

export class Scanner {
  target?: ScanTarget;
  progress = 0; // 0..1
  quality = 0;
  readonly done = new Set<string>();
  private lastCompleted?: { name: string; until: number };

  // The best target in front of `from` (looking along `forward`, flattened
  // for a walker), or undefined.
  pick(from: THREE.Vector3, forward: THREE.Vector3, candidates: Iterable<ScanTarget>) {
    let best: { target: ScanTarget; score: number; aim: number } | undefined;
    const flat = new THREE.Vector3(forward.x, 0, forward.z).normalize();
    const to = new THREE.Vector3();
    for (const candidate of candidates) {
      to.copy(candidate.position).sub(from);
      const distance = to.length();
      if (distance > candidate.range) continue;
      to.y = 0;
      const aim = distance < 1.5 ? 1 : to.normalize().dot(flat);
      if (aim < 0.6) continue;
      const sticky = this.target?.key === candidate.key && this.target.position.equals(candidate.position) ? 0.5 : 1;
      const score = distance * (2 - aim) * sticky;
      if (!best || score < best.score) best = { target: candidate, score, aim };
    }
    return best;
  }

  // One frame. Returns the target whose scan just completed, if any.
  update(dt: number, holding: boolean, moving: boolean, from: THREE.Vector3, forward: THREE.Vector3, candidates: Iterable<ScanTarget>) {
    if (!holding) {
      this.target = undefined;
      this.progress = 0;
      return undefined;
    }
    const best = this.pick(from, forward, candidates);
    if (!best) {
      this.target = undefined;
      this.progress = Math.max(0, this.progress - dt);
      return undefined;
    }
    if (this.target?.key !== best.target.key) this.progress *= 0.35;
    this.target = best.target;
    if (this.done.has(best.target.key)) return undefined;
    this.quality = THREE.MathUtils.clamp((best.aim - 0.6) / 0.4, 0.2, 1) * (moving ? 0.6 : 1);
    this.progress += (dt * (0.4 + 0.85 * this.quality)) / (seconds[best.target.kind] ?? 1.6);
    if (this.progress < 1) return undefined;
    this.done.add(best.target.key);
    this.progress = 0;
    this.lastCompleted = { name: best.target.name, until: performance.now() + 2500 };
    return best.target;
  }

  // The reticle readout, centred under the crosshair; returns its text.
  draw(ctx: CanvasRenderingContext2D, width: number, height: number, holding: boolean): string | undefined {
    const now = performance.now();
    let text: string | undefined;
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "13px ui-monospace, Menlo, Consolas, monospace";
    const x = width / 2, y = height / 2 + 46;
    if (this.target && holding) {
      const catalogued = this.done.has(this.target.key);
      text = catalogued ? `${this.target.name} (catalogued)` : `SCAN ${this.target.name} ${Math.round(this.progress * 100)}%`;
      ctx.fillStyle = catalogued ? "rgba(207,231,245,0.75)" : "#8ff7ff";
      ctx.fillText(`${this.target.name.toUpperCase()} · ${this.target.kind.toUpperCase()}`, x, y);
      if (!catalogued) {
        ctx.strokeStyle = "rgba(143,247,255,0.25)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, height / 2, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "#8ff7ff";
        ctx.beginPath();
        ctx.arc(x, height / 2, 22, -Math.PI / 2, -Math.PI / 2 + this.progress * Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillText("CATALOGUED", x, y + 17);
      }
    } else if (holding) {
      ctx.fillStyle = "rgba(207,231,245,0.6)";
      ctx.fillText("NO SCAN TARGET", x, y);
      text = "SCAN no target";
    }
    if (this.lastCompleted && now < this.lastCompleted.until) {
      ctx.fillStyle = "#9be37a";
      ctx.fillText(`CATALOGUED: ${this.lastCompleted.name.toUpperCase()}`, x, y + 36);
    }
    ctx.restore();
    return text;
  }

  reset() {
    this.target = undefined;
    this.progress = 0;
    this.done.clear();
    this.lastCompleted = undefined;
  }
}
