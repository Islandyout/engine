// Synthesized game sounds (0.61.0): gunshots, dry fire, reloads, impacts,
// explosions and hit markers built from noise and oscillators at play time,
// so the engine ships combat audio without sample files. Every call
// schedules nodes on the given context and returns immediately; nodes stop
// themselves.

export type GunSound = "rifle" | "pistol" | "shotgun" | "smg" | "sniper" | "launcher";

interface GunVoice {
  body: number; // lowpass cutoff of the main blast, Hz
  decay: number; // seconds
  thump: number; // starting frequency of the low thump, Hz
  crack: number; // level of the supersonic crack
  level: number;
}

const voices: Record<GunSound, GunVoice> = {
  pistol: { body: 2400, decay: 0.16, thump: 150, crack: 0.5, level: 0.8 },
  rifle: { body: 1800, decay: 0.22, thump: 120, crack: 0.8, level: 0.9 },
  smg: { body: 2800, decay: 0.12, thump: 160, crack: 0.45, level: 0.7 },
  shotgun: { body: 950, decay: 0.38, thump: 90, crack: 0.6, level: 1.0 },
  sniper: { body: 1300, decay: 0.55, thump: 80, crack: 1.0, level: 1.0 },
  launcher: { body: 500, decay: 0.45, thump: 70, crack: 0.2, level: 0.9 },
};

export class Sfx {
  private readonly noise: AudioBuffer;

  constructor(
    private readonly context: BaseAudioContext,
    private readonly output: AudioNode,
  ) {
    const length = Math.floor(context.sampleRate * 1.5);
    this.noise = context.createBuffer(1, length, context.sampleRate);
    const data = this.noise.getChannelData(0);
    let seed = 22222;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x7fffffff) * 2 - 1;
    }
  }

  // A noise burst through a filter with an attack/decay envelope.
  private burst(
    when: number,
    filter: BiquadFilterType,
    frequency: number,
    peak: number,
    decay: number,
    q = 0.7,
    destination: AudioNode = this.output,
  ) {
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    const shaping = this.context.createBiquadFilter();
    shaping.type = filter;
    shaping.frequency.value = frequency;
    shaping.Q.value = q;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    source.connect(shaping).connect(gain).connect(destination);
    source.start(when, Math.random() * 0.5);
    source.stop(when + decay + 0.05);
  }

  // A pitched tone gliding from `from` to `to` Hz.
  private tone(when: number, type: OscillatorType, from: number, to: number, peak: number, decay: number) {
    const oscillator = this.context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, when);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(to, 1), when + decay);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    oscillator.connect(gain).connect(this.output);
    oscillator.start(when);
    oscillator.stop(when + decay + 0.05);
  }

  private get now() {
    return this.context.currentTime;
  }

  gunshot(model: string, volume = 1) {
    const voice = voices[(model in voices ? model : "rifle") as GunSound];
    const level = voice.level * volume;
    const t = this.now;
    this.burst(t, "highpass", 2500, voice.crack * level * 0.6, 0.05);
    this.burst(t, "lowpass", voice.body * (0.9 + Math.random() * 0.2), level, voice.decay);
    this.tone(t, "sine", voice.thump, voice.thump * 0.35, level * 0.9, voice.decay * 0.8);
    // A quiet room tail.
    this.burst(t + 0.02, "lowpass", 700, level * 0.18, voice.decay * 3);
  }

  dryFire(volume = 1) {
    const t = this.now;
    this.tone(t, "square", 1900, 1400, 0.12 * volume, 0.03);
    this.burst(t, "bandpass", 4000, 0.15 * volume, 0.03, 4);
  }

  // Magazine out, magazine in and a bolt/slide, spread over the reload.
  reload(seconds: number, volume = 1) {
    const t = this.now;
    const click = (at: number, pitch: number, level: number) => {
      this.burst(t + at, "bandpass", pitch, level * volume, 0.05, 3);
      this.tone(t + at, "square", pitch * 0.5, pitch * 0.35, level * 0.25 * volume, 0.03);
    };
    click(seconds * 0.15, 2600, 0.35);
    click(seconds * 0.55, 1800, 0.45);
    click(seconds * 0.85, 3200, 0.4);
  }

  // One shell (per-shell reloads).
  shell(volume = 1) {
    const t = this.now;
    this.burst(t, "bandpass", 2200, 0.3 * volume, 0.06, 3);
  }

  equip(volume = 1) {
    const t = this.now;
    this.burst(t, "bandpass", 1500, 0.12 * volume, 0.12, 1);
    this.burst(t + 0.08, "bandpass", 3000, 0.2 * volume, 0.04, 4);
  }

  impact(flesh: boolean, volume = 1) {
    const t = this.now;
    if (flesh) {
      this.burst(t, "lowpass", 600, 0.5 * volume, 0.12);
    } else {
      this.burst(t, "bandpass", 3200 + Math.random() * 1500, 0.35 * volume, 0.07, 2);
      this.tone(t, "triangle", 2600 + Math.random() * 800, 1800, 0.04 * volume, 0.08);
    }
  }

  explosion(volume = 1) {
    const t = this.now;
    this.burst(t, "lowpass", 900, 1.0 * volume, 0.35);
    this.burst(t, "lowpass", 300, 1.0 * volume, 1.6);
    this.tone(t, "sine", 70, 25, 0.9 * volume, 1.1);
  }

  hitmarker(kill: boolean, volume = 1) {
    const t = this.now;
    this.tone(t, "sine", 1700, 1650, 0.25 * volume, 0.05);
    if (kill) this.tone(t + 0.06, "sine", 2300, 2250, 0.25 * volume, 0.08);
  }

  hurt(volume = 1) {
    const t = this.now;
    this.burst(t, "lowpass", 400, 0.5 * volume, 0.2);
    this.tone(t, "sine", 110, 60, 0.4 * volume, 0.25);
  }
}
