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
  // A fleeing animal (0.73.0) can't be scanned: the scan resets.
  fleeing?: boolean;
}

const seconds: Record<string, number> = { Landmark: 3, Culture: 2.4, Fauna: 2, Flora: 1.6, Mineral: 1.6, Atmosphere: 2.5 };

// What scripts tune (0.73.0, host.send("scanner", "range time interference
// condition")): Survey Optics' range and speed, weather interference and
// the scanner component's condition, all of which shape confidence.
export interface ScannerTuning {
  range: number; // multiplier
  time: number; // multiplier on scan time (lower is faster)
  interference: number; // 0..1
  condition: number; // 0..1
}

export class Scanner {
  target?: ScanTarget;
  progress = 0; // 0..1
  quality = 0;
  readonly done = new Set<string>();
  tuning: ScannerTuning = { range: 1, time: 1, interference: 0, condition: 1 };
  // Looking up at open sky with nothing else in view scans the air (0.73.0):
  // the key reported for it, "" when there's no air scan here.
  skyKey = "";
  // How sure the last finished scan is, 0..1.
  confidence = 0;
  private fleeingName?: string;
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
      if (distance > candidate.range * this.tuning.range) continue;
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
    let best = this.pick(from, forward, candidates);
    this.fleeingName = undefined;
    if (best?.target.fleeing) {
      // It bolted: the scan starts over.
      this.fleeingName = best.target.name;
      this.target = undefined;
      this.progress = 0;
      return undefined;
    }
    if (!best && this.skyKey && forward.clone().normalize().y > 0.55)
      best = { target: { key: this.skyKey, name: "Atmosphere", kind: "Atmosphere", position: from.clone(), range: 1 }, score: 0, aim: 1 };
    if (!best) {
      this.target = undefined;
      this.progress = Math.max(0, this.progress - dt);
      return undefined;
    }
    if (this.target?.key !== best.target.key) this.progress *= 0.35;
    this.target = best.target;
    if (this.done.has(best.target.key)) return undefined;
    this.quality = THREE.MathUtils.clamp((best.aim - 0.6) / 0.4, 0.2, 1) * (moving ? 0.6 : 1);
    const slow = (1 + this.tuning.interference * 0.8) / (0.4 + 0.6 * this.tuning.condition);
    this.progress += (dt * (0.4 + 0.85 * this.quality)) / ((seconds[best.target.kind] ?? 1.6) * this.tuning.time * slow);
    if (this.progress < 1) return undefined;
    this.confidence = THREE.MathUtils.clamp(this.quality * (1 - this.tuning.interference * 0.6) * (0.5 + 0.5 * this.tuning.condition), 0, 1);
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
        const live = THREE.MathUtils.clamp(this.quality * (1 - this.tuning.interference * 0.6) * (0.5 + 0.5 * this.tuning.condition), 0, 1);
        ctx.fillStyle = live > 0.75 ? "#9be37a" : live > 0.45 ? "#ffd36e" : "#ff8a6a";
        ctx.fillText(`CONFIDENCE ${Math.round(live * 100)}%${this.tuning.interference > 0.2 ? " · INTERFERENCE" : ""}`, x, y + 34);
        ctx.fillStyle = "#8ff7ff";
      }
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
    } else if (holding && this.fleeingName) {
      ctx.fillStyle = "#ff8a6a";
      ctx.fillText(`${this.fleeingName.toUpperCase()} FLEEING -- SCAN LOST`, x, y);
      text = "SCAN target fleeing";
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
