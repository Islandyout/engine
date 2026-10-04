// Ambience layers (0.73.0): wind, rain, a settlement's murmur, wildlife
// calls and the Pale Signal hum, each a synthesized loop whose level the
// game sets by context (host.send("audio", "<layer> <0..1>")) and the view
// sets from the air (wind needs air to carry). Plus short UI and discovery
// cues. Everything goes to the mixer's ambient/ui buses.
export type AmbienceLayer = "wind" | "rain" | "settlement" | "wildlife" | "signal";
export const ambienceLayers: readonly AmbienceLayer[] = ["wind", "rain", "settlement", "wildlife", "signal"];

function noiseBuffer(context: BaseAudioContext, seconds: number, smooth: number) {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = last * smooth + (Math.random() * 2 - 1) * (1 - smooth);
    data[i] = last;
  }
  return buffer;
}

export class Ambience {
  private readonly gains = new Map<AmbienceLayer, GainNode>();
  private readonly levels = new Map<AmbienceLayer, number>();
  private readonly sources: AudioScheduledSourceNode[] = [];
  private chirpAt = 0;
  constructor(
    private readonly context: BaseAudioContext,
    private readonly output: AudioNode,
  ) {
    const loop = (buffer: AudioBuffer, filter: BiquadFilterType, frequency: number, q: number, layer: AmbienceLayer) => {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const shape = context.createBiquadFilter();
      shape.type = filter;
      shape.frequency.value = frequency;
      shape.Q.value = q;
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(shape).connect(gain).connect(output);
      source.start();
      this.sources.push(source);
      this.gains.set(layer, gain);
      return { shape, gain };
    };
    const wind = loop(noiseBuffer(context, 3, 0.985), "lowpass", 500, 0.6, "wind");
    // A slow gust on the wind's filter.
    const gust = context.createOscillator();
    gust.frequency.value = 0.08;
    const gustDepth = context.createGain();
    gustDepth.gain.value = 260;
    gust.connect(gustDepth).connect(wind.shape.frequency);
    gust.start();
    this.sources.push(gust);
    loop(noiseBuffer(context, 2, 0.2), "highpass", 2500, 0.4, "rain");
    loop(noiseBuffer(context, 3, 0.9), "bandpass", 420, 1.4, "settlement");
    // The signal: two close sines beating, through a gain.
    const signal = context.createGain();
    signal.gain.value = 0;
    for (const f of [110, 111.6, 220.4]) {
      const o = context.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = context.createGain();
      g.gain.value = f > 200 ? 0.15 : 0.35;
      o.connect(g).connect(signal);
      o.start();
      this.sources.push(o);
    }
    signal.connect(output);
    this.gains.set("signal", signal);
    const wildlife = context.createGain();
    wildlife.gain.value = 0;
    wildlife.connect(output);
    this.gains.set("wildlife", wildlife);
  }

  set(layer: AmbienceLayer, level: number) {
    this.levels.set(layer, Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0)));
  }

  // Per frame: ease every layer toward its level; `air` scales the wind.
  update(air: number) {
    const t = this.context.currentTime;
    const peak: Record<AmbienceLayer, number> = { wind: 0.35, rain: 0.22, settlement: 0.18, wildlife: 0.5, signal: 0.08 };
    for (const layer of ambienceLayers) {
      const level = (this.levels.get(layer) ?? 0) * (layer === "wind" ? Math.max(air, 0.05) : 1);
      this.gains.get(layer)!.gain.setTargetAtTime(level * peak[layer], t, 0.6);
    }
    // Wildlife: an occasional two-note call.
    if ((this.levels.get("wildlife") ?? 0) > 0.05 && t > this.chirpAt) {
      this.chirpAt = t + 2 + Math.random() * 6;
      const base = 900 + Math.random() * 1400;
      for (const [offset, f] of [[0, base], [0.14, base * 1.25]] as const) {
        const o = this.context.createOscillator();
        o.type = "triangle";
        o.frequency.setValueAtTime(f, t + offset);
        o.frequency.exponentialRampToValueAtTime(f * 0.8, t + offset + 0.12);
        const g = this.context.createGain();
        g.gain.setValueAtTime(0.0001, t + offset);
        g.gain.exponentialRampToValueAtTime(0.08, t + offset + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.13);
        o.connect(g).connect(this.gains.get("wildlife")!);
        o.start(t + offset);
        o.stop(t + offset + 0.15);
      }
    }
  }

  stop() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    }
    this.sources.length = 0;
  }
}

// Short cues: a toast blip by category, a discovery sting, a touchdown thump.
export function playCue(context: BaseAudioContext, output: AudioNode, cue: string) {
  const t = context.currentTime;
  const note = (f: number, at: number, length: number, type: OscillatorType = "sine", peak = 0.12) => {
    const o = context.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t + at);
    const g = context.createGain();
    g.gain.setValueAtTime(0.0001, t + at);
    g.gain.exponentialRampToValueAtTime(peak, t + at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + length);
    o.connect(g).connect(output);
    o.start(t + at);
    o.stop(t + at + length + 0.05);
  };
  if (cue === "good") [660, 880].forEach((f, i) => note(f, i * 0.07, 0.18));
  else if (cue === "warn") [520, 440].forEach((f, i) => note(f, i * 0.1, 0.2, "triangle"));
  else if (cue === "bad") [300, 220].forEach((f, i) => note(f, i * 0.12, 0.28, "sawtooth", 0.06));
  else if (cue === "anomaly") [440, 554, 659, 880].forEach((f, i) => note(f, i * 0.11, 0.9, "sine", 0.07));
  else if (cue === "discovery") [523, 659, 784, 1046].forEach((f, i) => note(f, i * 0.09, 0.5, "triangle", 0.09));
  else if (cue === "thump") note(70, 0, 0.35, "sine", 0.4);
  else note(760, 0, 0.12);
}
