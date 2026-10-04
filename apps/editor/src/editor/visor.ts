// The suit's visor (0.75.0), drawn under the HUD while walking with the
// helmet on: the curved glass's dark rim and a highlight, rain beading and
// running on it in a storm, frost creeping in from the edges in the cold,
// a heat shimmer at the edges in the heat, and cracks as the suit's
// integrity falls. Scripts describe it with host.send("visor", ...).

export interface VisorState {
  helmet: boolean;
  integrity: number; // 0..1
  frost: number; // 0..1
  heat: number; // 0..1
}

export function parseVisor(text: string): VisorState {
  const [helmet = 1, integrity = 1, frost = 0, heat = 0] = text.split(/\s+/).map(Number);
  const unit = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  return { helmet: helmet !== 0, integrity: Number.isFinite(integrity) ? unit(integrity) : 1, frost: unit(frost), heat: unit(heat) };
}

interface Drop {
  x: number;
  y: number;
  r: number;
  speed: number;
  life: number;
}

export class Visor {
  state: VisorState = { helmet: true, integrity: 1, frost: 0, heat: 0 };
  private drops: Drop[] = [];
  private cracks: Array<Array<[number, number]>> = [];
  private crackSeed = 0;
  private time = 0;

  // Rain on the glass (0..1) and whether the walker is out in it.
  update(dt: number, rain: number) {
    this.time += dt;
    if (!this.state.helmet) {
      this.drops.length = 0;
      return;
    }
    // New beads land in proportion to the rain; heavy ones run down.
    const spawn = rain * 40 * dt;
    for (let i = 0; i < Math.floor(spawn) + (Math.random() < spawn % 1 ? 1 : 0) && this.drops.length < 90; i++)
      this.drops.push({ x: Math.random(), y: Math.random() * 0.9, r: 1.5 + Math.random() * 3.5, speed: 0, life: 4 + Math.random() * 5 });
    for (const d of this.drops) {
      d.life -= dt;
      if (d.r > 3.6) d.speed = Math.min(0.25, d.speed + dt * 0.12);
      d.y += d.speed * dt;
    }
    this.drops = this.drops.filter((d) => d.life > 0 && d.y < 1.05);
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const s = this.state;
    if (!s.helmet) return;
    ctx.save();
    // The glass: a dark rim where the visor curves away, a cool tint.
    const r = Math.hypot(width, height) / 2;
    const rim = ctx.createRadialGradient(width / 2, height / 2, r * 0.62, width / 2, height / 2, r);
    rim.addColorStop(0, "rgba(10,18,26,0)");
    rim.addColorStop(0.75, "rgba(10,18,26,0.28)");
    rim.addColorStop(1, "rgba(4,8,12,0.75)");
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, width, height);
    // A soft reflection arc, top left.
    ctx.strokeStyle = "rgba(220,240,255,0.07)";
    ctx.lineWidth = Math.max(6, width * 0.012);
    ctx.beginPath();
    ctx.arc(width * 0.52, height * 0.95, Math.max(width, height) * 0.82, Math.PI * 1.18, Math.PI * 1.36);
    ctx.stroke();
    // Frost from the edges.
    if (s.frost > 0.02) {
      const frost = ctx.createRadialGradient(width / 2, height / 2, r * (0.95 - s.frost * 0.45), width / 2, height / 2, r);
      frost.addColorStop(0, "rgba(220,235,250,0)");
      frost.addColorStop(1, `rgba(225,240,252,${0.55 * s.frost})`);
      ctx.fillStyle = frost;
      ctx.fillRect(0, 0, width, height);
    }
    // Heat shimmer: an orange glow at the edges, pulsing.
    if (s.heat > 0.02) {
      const pulse = 0.8 + 0.2 * Math.sin(this.time * 3.1);
      const heat = ctx.createRadialGradient(width / 2, height / 2, r * (0.9 - s.heat * 0.35), width / 2, height / 2, r);
      heat.addColorStop(0, "rgba(255,120,40,0)");
      heat.addColorStop(1, `rgba(255,110,30,${0.4 * s.heat * pulse})`);
      ctx.fillStyle = heat;
      ctx.fillRect(0, 0, width, height);
    }
    // Rain beads: a dark lens with a bright catchlight.
    for (const d of this.drops) {
      const x = d.x * width, y = d.y * height;
      ctx.fillStyle = "rgba(30,45,55,0.22)";
      ctx.beginPath();
      ctx.arc(x, y, d.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(235,248,255,0.5)";
      ctx.beginPath();
      ctx.arc(x - d.r * 0.3, y - d.r * 0.35, d.r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      if (d.speed > 0) {
        ctx.strokeStyle = "rgba(200,225,240,0.12)";
        ctx.lineWidth = d.r * 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y - d.r);
        ctx.lineTo(x, y - d.r - d.speed * height * 0.6);
        ctx.stroke();
      }
    }
    // Cracks below half integrity, more as it falls.
    const want = s.integrity < 0.5 ? Math.ceil((0.5 - s.integrity) * 10) : 0;
    if (want !== this.cracks.length) this.buildCracks(want, width, height);
    if (this.cracks.length) {
      ctx.strokeStyle = "rgba(235,245,255,0.55)";
      ctx.lineWidth = 1.2;
      for (const crack of this.cracks) {
        ctx.beginPath();
        crack.forEach(([x, y], i) => (i ? ctx.lineTo(x * width, y * height) : ctx.moveTo(x * width, y * height)));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private buildCracks(count: number, _width: number, _height: number) {
    let seed = 9137 + this.crackSeed;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    this.cracks = [];
    // From one impact point near a lower corner, branching out.
    const ox = 0.12 + random() * 0.1, oy = 0.78 + random() * 0.1;
    for (let i = 0; i < count; i++) {
      const path: Array<[number, number]> = [[ox, oy]];
      let a = random() * Math.PI * 2, x = ox, y = oy;
      const steps = 4 + Math.floor(random() * 5);
      for (let k = 0; k < steps; k++) {
        a += (random() - 0.5) * 0.9;
        const len = 0.02 + random() * 0.05;
        x += Math.cos(a) * len;
        y += Math.sin(a) * len * 1.6;
        path.push([x, y]);
      }
      this.cracks.push(path);
    }
  }
}
