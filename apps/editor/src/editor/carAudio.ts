// Car sounds (0.70.0), synthesized: an engine note that follows the revs and
// throttle, tyre screech that follows the slide, and a two-tone siren.
// Each voice runs continuously into the node it's given until stop().

// A rough, harmonic-rich engine: two detuned saws an octave apart and a
// sub, through a low-pass that opens with the throttle.
export class EngineVoice {
  private readonly oscillators: OscillatorNode[];
  private readonly filter: BiquadFilterNode;
  private readonly gain: GainNode;

  constructor(private readonly context: BaseAudioContext, output: AudioNode) {
    this.filter = context.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.Q.value = 4;
    this.gain = context.createGain();
    this.gain.gain.value = 0;
    this.filter.connect(this.gain).connect(output);
    this.oscillators = (["sawtooth", "sawtooth", "square"] as OscillatorType[]).map((type, i) => {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.detune.value = i === 1 ? 9 : 0;
      const level = context.createGain();
      level.gain.value = [0.5, 0.35, 0.25][i]!;
      oscillator.connect(level).connect(this.filter);
      oscillator.start();
      return oscillator;
    });
  }

  // rpm 0..1 within the gear, throttle 0..1, boosting adds a whine.
  update(rpm: number, gear: number, throttle: number, boosting: boolean) {
    const t = this.context.currentTime;
    const base = 38 + rpm * 150 + Math.max(0, gear) * 4;
    const [a, b, sub] = this.oscillators;
    a!.frequency.setTargetAtTime(base, t, 0.04);
    b!.frequency.setTargetAtTime(base * 2, t, 0.04);
    sub!.frequency.setTargetAtTime(base * 0.5, t, 0.04);
    this.filter.frequency.setTargetAtTime(500 + rpm * 2200 * (0.45 + 0.55 * throttle) + (boosting ? 900 : 0), t, 0.05);
    this.gain.gain.setTargetAtTime(0.05 + 0.1 * throttle + 0.04 * rpm, t, 0.05);
  }

  stop() {
    for (const oscillator of this.oscillators) oscillator.stop();
    this.gain.disconnect();
  }
}

// Looped noise through a resonant band-pass: the squeal of a sliding tyre.
export class TireVoice {
  private readonly source: AudioBufferSourceNode;
  private readonly gain: GainNode;
  private readonly filter: BiquadFilterNode;

  constructor(private readonly context: BaseAudioContext, output: AudioNode) {
    const length = context.sampleRate;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 777;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    this.source = context.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;
    this.filter = context.createBiquadFilter();
    this.filter.type = "bandpass";
    this.filter.frequency.value = 1700;
    this.filter.Q.value = 6;
    this.gain = context.createGain();
    this.gain.gain.value = 0;
    this.source.connect(this.filter).connect(this.gain).connect(output);
    this.source.start();
  }

  // amount 0..1 (how hard the tyres are sliding).
  update(amount: number) {
    const t = this.context.currentTime;
    this.gain.gain.setTargetAtTime(Math.min(1, amount) * 0.22, t, 0.06);
    this.filter.frequency.setTargetAtTime(1500 + amount * 700, t, 0.1);
  }

  stop() {
    this.source.stop();
    this.gain.disconnect();
  }
}

// A wailing two-tone siren.
export class SirenVoice {
  private readonly oscillator: OscillatorNode;
  private readonly gain: GainNode;
  private phase = Math.random() * 2;

  constructor(private readonly context: BaseAudioContext, output: AudioNode) {
    this.oscillator = context.createOscillator();
    this.oscillator.type = "triangle";
    this.gain = context.createGain();
    this.gain.gain.value = 0.18;
    this.oscillator.connect(this.gain).connect(output);
    this.oscillator.start();
  }

  update(dt: number) {
    this.phase = (this.phase + dt) % 1.4;
    // Hi-lo: alternate two pitches, gliding between them.
    const high = this.phase < 0.7;
    this.oscillator.frequency.setTargetAtTime(high ? 960 : 720, this.context.currentTime, 0.05);
  }

  stop() {
    this.oscillator.stop();
    this.gain.disconnect();
  }
}
