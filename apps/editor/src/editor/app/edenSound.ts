// What Eden sounds like beyond the engine's own wind, rain and bird layers (set from the script): crickets in the warm dark, a river's babble, a
// fire's crackle, the murmur of voices (pitched for a child, a woman, a man, an old one, one syllable to a few letters), a wolf's howl.
// All of it is made on the spot with the Web Audio API, so there is nothing to download. It starts on the first key or click (a browser
// does not let a page make sound before that) and can be switched off (N), which is remembered.
export interface SoundState {
  dark: boolean;
  season: number; // 0 spring .. 3 winter
  raining: boolean;
  listener: { x: number; z: number };
  waterDistance: number;
  fireDistance: number;
  wolfNear: boolean;
}

const KEY = "eden-sound";

function noise(context: AudioContext, seconds: number, smooth: number) {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = last * smooth + (Math.random() * 2 - 1) * (1 - smooth);
    data[i] = last;
  }
  return buffer;
}

export class EdenSound {
  private context?: AudioContext;
  private master?: GainNode;
  private crickets?: GainNode;
  private water?: GainNode;
  private fire?: GainNode;
  private enabled = true;
  private lastHowl = 0;
  private fireTimer = 0;

  constructor() {
    try {
      this.enabled = localStorage.getItem(KEY) !== "off";
    } catch {
      /* private window: sound stays on */
    }
    const start = () => this.start();
    window.addEventListener("pointerdown", start, { once: true });
    window.addEventListener("keydown", start, { once: true });
  }

  get on() {
    return this.enabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(KEY, this.enabled ? "on" : "off");
    } catch {
      /* not remembered */
    }
    if (this.master) this.master.gain.value = this.enabled ? 0.5 : 0;
    return this.enabled;
  }

  private start() {
    if (this.context) return;
    try {
      const context = new AudioContext();
      this.context = context;
      const master = (this.master = context.createGain());
      master.gain.value = this.enabled ? 0.5 : 0;
      master.connect(context.destination);
      // Crickets: three high tones chirping in bursts.
      const crickets = (this.crickets = context.createGain());
      crickets.gain.value = 0;
      crickets.connect(master);
      for (const [f, rate] of [[4200, 27], [4620, 31], [5040, 24]] as const) {
        const tone = context.createOscillator();
        tone.frequency.value = f;
        const chirp = context.createGain();
        chirp.gain.value = 0;
        const lfo = context.createOscillator();
        lfo.type = "square";
        lfo.frequency.value = rate;
        const depth = context.createGain();
        depth.gain.value = 0.5;
        lfo.connect(depth).connect(chirp.gain);
        const gate = context.createOscillator();
        gate.frequency.value = 0.6 + Math.random() * 0.4;
        const gateDepth = context.createGain();
        gateDepth.gain.value = 0.3;
        gate.connect(gateDepth).connect(crickets.gain);
        tone.connect(chirp).connect(crickets);
        for (const o of [tone, lfo, gate]) o.start();
      }
      // Water: a band of noise.
      const water = (this.water = context.createGain());
      water.gain.value = 0;
      const babble = context.createBufferSource();
      babble.buffer = noise(context, 3, 0.7);
      babble.loop = true;
      const band = context.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 900;
      band.Q.value = 0.8;
      babble.connect(band).connect(water).connect(master);
      babble.start();
      // Fire: noise whose level is jittered by a timer.
      const fire = (this.fire = context.createGain());
      fire.gain.value = 0;
      const crackle = context.createBufferSource();
      crackle.buffer = noise(context, 2, 0.1);
      crackle.loop = true;
      const high = context.createBiquadFilter();
      high.type = "highpass";
      high.frequency.value = 2500;
      crackle.connect(high).connect(fire).connect(master);
      crackle.start();
    } catch {
      this.context = undefined; // no sound is not an error
    }
  }

  /** Call about once a second. */
  update(state: SoundState) {
    const context = this.context;
    if (!context || !this.enabled) return;
    if (context.state === "suspended") void context.resume();
    const at = context.currentTime + 0.5;
    this.crickets?.gain.linearRampToValueAtTime(state.dark && state.season < 3 && !state.raining ? 0.035 : 0, at);
    this.water?.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, (20 - state.waterDistance) / 20)) * 0.09, at);
    const fireLevel = Math.max(0, Math.min(1, (14 - state.fireDistance) / 14)) * 0.08;
    // The crackle: a fresh random level every moment.
    this.fire?.gain.linearRampToValueAtTime(fireLevel * (0.3 + Math.random() * 1.2), at);
    this.fireTimer += 1;
    if (state.wolfNear && state.dark && context.currentTime - this.lastHowl > 40 && Math.random() < 0.25) this.howl();
  }

  /** Someone speaks: a few soft syllables, pitched for who they are, quieter the farther they are. */
  speak(listener: { x: number; z: number }, at: { x: number; z: number }, sex: "m" | "f", age: number, text: string) {
    const context = this.context;
    if (!context || !this.enabled || !this.master) return;
    const d = Math.hypot(at.x - listener.x, at.z - listener.z);
    if (d > 28) return;
    const volume = 0.1 * (1 - d / 28);
    const base = age < 4 ? 330 : age < 14 ? 260 : sex === "f" ? 205 : 118;
    const syllables = Math.max(2, Math.min(10, Math.round(text.length / 5)));
    const t0 = context.currentTime + 0.02;
    for (let i = 0; i < syllables; i++) {
      const t = t0 + i * 0.13 + Math.random() * 0.03;
      const osc = context.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(base * (0.92 + Math.random() * 0.2) * (i === syllables - 1 && text.endsWith("?") ? 1.2 : 1), t);
      const formant = context.createBiquadFilter();
      formant.type = "bandpass";
      formant.frequency.value = 500 + Math.random() * 1800;
      formant.Q.value = 3;
      const env = context.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(volume, t + 0.025);
      env.gain.exponentialRampToValueAtTime(0.0005, t + 0.11);
      osc.connect(formant).connect(env).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.13);
    }
  }

  private howl() {
    const context = this.context;
    if (!context || !this.master) return;
    this.lastHowl = context.currentTime;
    const t = context.currentTime + 0.05;
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(520, t + 1.1);
    osc.frequency.linearRampToValueAtTime(390, t + 2.8);
    const vibrato = context.createOscillator();
    vibrato.frequency.value = 5.5;
    const depth = context.createGain();
    depth.gain.value = 9;
    vibrato.connect(depth).connect(osc.frequency);
    const env = context.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.05, t + 0.6);
    env.gain.linearRampToValueAtTime(0, t + 2.9);
    osc.connect(env).connect(this.master);
    osc.start(t);
    vibrato.start(t);
    osc.stop(t + 3);
    vibrato.stop(t + 3);
  }
}
