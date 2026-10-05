// Generative music (0.75.0): a small adaptive score synthesized in Web Audio
// -- a pad, a bass drone and bell arpeggios over a slow chord progression,
// in a reverb -- with one mood per context (title, exploring by day or
// night, flight, open space, the signal, a storm). Moods crossfade; nothing
// is a recording, so there's nothing to download and it never loops the
// same way twice. Scripts pick the mood with host.send("music", mood).

export const musicMoods = ["off", "title", "explore", "night", "flight", "space", "signal", "tension"] as const;
export type MusicMood = (typeof musicMoods)[number];

interface MoodSpec {
  root: number; // MIDI note of the tonic
  scale: number[]; // semitones
  chords: number[][]; // scale degrees per chord
  beat: number; // seconds per arpeggio step
  bars: number; // steps per chord
  arp: number; // chance of a bell on each step
  pad: number; // pad level
  bass: number;
  bright: number; // pad filter cutoff (Hz)
  tremolo?: number; // Hz, for unease
  // A composed phrase (0.76.0): [scale degree, beats] pairs (degree null is
  // a rest), played as a lead voice every `motifEvery` chords over the
  // chord it starts on, so each mood has a tune you can recognise.
  motif?: Array<[number | null, number]>;
  motifEvery?: number;
}

const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const WHOLE = [0, 2, 4, 6, 8, 10];

const moods: Record<Exclude<MusicMood, "off">, MoodSpec> = {
  title: {
    root: 50,
    scale: AEOLIAN,
    chords: [
      [0, 2, 4],
      [5, 0, 2],
      [3, 5, 0],
      [4, 6, 1],
    ],
    beat: 0.75,
    bars: 8,
    arp: 0.45,
    pad: 0.22,
    bass: 0.12,
    bright: 1400,
    motif: [
      [4, 2],
      [3, 1],
      [2, 1],
      [0, 3],
      [null, 1],
      [2, 1],
      [4, 1],
      [5, 2],
      [4, 4],
    ],
    motifEvery: 2,
  },
  explore: {
    root: 50,
    scale: DORIAN,
    chords: [
      [0, 2, 4],
      [3, 5, 0],
      [4, 6, 1],
      [0, 2, 4],
      [6, 1, 3],
    ],
    beat: 0.5,
    bars: 8,
    arp: 0.35,
    pad: 0.16,
    bass: 0.1,
    bright: 1800,
    motif: [
      [0, 1],
      [2, 1],
      [4, 2],
      [3, 1],
      [2, 1],
      [1, 2],
      [null, 1],
      [2, 1],
      [4, 1],
      [6, 1],
      [7, 4],
    ],
    motifEvery: 3,
  },
  night: {
    root: 45,
    scale: AEOLIAN,
    chords: [
      [0, 2, 4],
      [5, 0, 2],
      [0, 2, 4],
      [6, 1, 3],
    ],
    beat: 0.9,
    bars: 6,
    arp: 0.25,
    pad: 0.15,
    bass: 0.09,
    bright: 900,
    motif: [
      [4, 3],
      [2, 1],
      [3, 2],
      [1, 2],
      [0, 6],
    ],
    motifEvery: 3,
  },
  flight: {
    root: 52,
    scale: LYDIAN,
    chords: [
      [0, 2, 4],
      [1, 3, 5],
      [0, 2, 4],
      [4, 6, 1],
    ],
    beat: 0.25,
    bars: 16,
    arp: 0.7,
    pad: 0.13,
    bass: 0.12,
    bright: 2600,
    motif: [
      [0, 1],
      [4, 1],
      [7, 2],
      [6, 1],
      [4, 1],
      [5, 2],
      [4, 1],
      [2, 1],
      [4, 4],
    ],
    motifEvery: 2,
  },
  space: {
    root: 43,
    scale: LYDIAN,
    chords: [
      [0, 4, 1],
      [3, 0, 4],
      [5, 2, 6],
    ],
    beat: 1.2,
    bars: 6,
    arp: 0.3,
    pad: 0.18,
    bass: 0.07,
    bright: 1100,
    motif: [
      [7, 4],
      [4, 2],
      [5, 2],
      [1, 8],
    ],
    motifEvery: 2,
  },
  signal: {
    root: 46,
    scale: WHOLE,
    chords: [
      [0, 2, 4],
      [1, 3, 5],
      [0, 3, 5],
    ],
    beat: 0.6,
    bars: 8,
    arp: 0.4,
    pad: 0.2,
    bass: 0.12,
    bright: 1000,
    tremolo: 5.5,
    motif: [
      [0, 2],
      [3, 2],
      [1, 2],
      [4, 2],
      [2, 4],
    ],
    motifEvery: 3,
  },
  tension: {
    root: 48,
    scale: AEOLIAN,
    chords: [
      [0, 2, 4],
      [1, 3, 5],
      [0, 2, 4],
      [5, 0, 2],
    ],
    beat: 0.33,
    bars: 12,
    arp: 0.5,
    pad: 0.14,
    bass: 0.15,
    bright: 1300,
    motif: [
      [0, 1],
      [1, 1],
      [0, 1],
      [-1, 1],
      [0, 2],
      [null, 2],
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 3],
    ],
    motifEvery: 2,
  },
};

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export class Music {
  private readonly master: GainNode;
  private readonly reverb: ConvolverNode;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private mood: MusicMood = "off";
  private next = 0; // context time of the next step
  private step = 0;
  private chord = 0;
  private pad?: { stop(at: number): void };
  private seed = 1;
  private motifUntil = 0;

  constructor(
    private readonly context: BaseAudioContext,
    output: AudioNode,
  ) {
    this.master = context.createGain();
    this.master.gain.value = 0;
    this.dry = context.createGain();
    this.dry.gain.value = 0.7;
    this.wet = context.createGain();
    this.wet.gain.value = 0.55;
    this.reverb = context.createConvolver();
    this.reverb.buffer = impulse(context, 3.2);
    this.master.connect(this.dry).connect(output);
    this.master.connect(this.reverb).connect(this.wet).connect(output);
  }

  get current() {
    return this.mood;
  }

  setMood(mood: string) {
    const next = (musicMoods as readonly string[]).includes(mood) ? (mood as MusicMood) : "off";
    if (next === this.mood) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    // Fade out, switch, fade in.
    this.master.gain.linearRampToValueAtTime(0, now + 1.5);
    this.pad?.stop(now + 1.5);
    this.pad = undefined;
    this.mood = next;
    this.step = 0;
    this.chord = 0;
    this.next = now + 1.6;
    if (next !== "off") this.master.gain.linearRampToValueAtTime(0.9, now + 4.5);
  }

  // Schedules the next half second of notes; call every frame.
  update() {
    if (this.mood === "off") return;
    const spec = moods[this.mood];
    const now = this.context.currentTime;
    if (this.next < now) this.next = now + 0.05;
    while (this.next < now + 0.5) {
      if (this.step % spec.bars === 0) {
        this.playChord(spec, this.next);
        // The mood's phrase, every few chords, in place of the bells.
        if (spec.motif && this.chord % (spec.motifEvery ?? 3) === 1) this.motifUntil = this.playMotif(spec, this.next);
      }
      if (this.next >= this.motifUntil && this.random() < spec.arp) this.bell(spec, this.next);
      this.next += spec.beat * (0.92 + this.random() * 0.16);
      this.step++;
    }
  }

  dispose() {
    this.pad?.stop(this.context.currentTime);
    this.master.disconnect();
  }

  private random() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private note(spec: MoodSpec, degree: number, octave: number) {
    const n = spec.scale.length;
    const d = ((degree % n) + n) % n;
    return spec.root + spec.scale[d]! + 12 * (octave + Math.floor(degree / n));
  }

  private playChord(spec: MoodSpec, at: number) {
    const chord = spec.chords[this.chord % spec.chords.length]!;
    this.chord += this.random() < 0.8 ? 1 : 2;
    const length = spec.beat * spec.bars * 1.05;
    this.pad?.stop(at + 1.2);
    const c = this.context;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = spec.bright;
    filter.Q.value = 0.4;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(spec.pad, at + Math.min(2.5, length * 0.4));
    filter.connect(gain).connect(this.master);
    let tremolo: OscillatorNode | undefined;
    if (spec.tremolo) {
      tremolo = c.createOscillator();
      tremolo.frequency.value = spec.tremolo;
      const depth = c.createGain();
      depth.gain.value = spec.pad * 0.4;
      tremolo.connect(depth).connect(gain.gain);
      tremolo.start(at);
    }
    const oscillators: OscillatorNode[] = [];
    for (const degree of chord)
      for (const detune of [-6, 6]) {
        const o = c.createOscillator();
        o.type = "triangle";
        o.frequency.value = hz(this.note(spec, degree, 0));
        o.detune.value = detune;
        o.connect(filter);
        o.start(at);
        oscillators.push(o);
      }
    // The bass under the chord's root.
    const bass = c.createOscillator();
    bass.type = "sine";
    bass.frequency.value = hz(this.note(spec, chord[0]!, -1));
    const bassGain = c.createGain();
    bassGain.gain.setValueAtTime(0, at);
    bassGain.gain.linearRampToValueAtTime(spec.bass, at + 1.5);
    bass.connect(bassGain).connect(this.master);
    bass.start(at);
    oscillators.push(bass);
    this.pad = {
      stop: (when: number) => {
        for (const g of [gain, bassGain]) {
          g.gain.cancelScheduledValues(when);
          g.gain.setTargetAtTime(0, when, 0.6);
        }
        for (const o of oscillators) o.stop(when + 3);
        tremolo?.stop(when + 3);
      },
    };
  }

  // Plays the mood's motif from `at` over the chord just started; returns
  // when it ends.
  private playMotif(spec: MoodSpec, at: number) {
    const c = this.context;
    const chord = spec.chords[(this.chord + spec.chords.length - 1) % spec.chords.length]!;
    let t = at;
    for (const { degree, beats } of motifNotes(spec.motif!, chord[0]!)) {
      const length = beats * spec.beat;
      if (degree !== null) {
        const g = c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.06, t + 0.04);
        g.gain.setTargetAtTime(0.035, t + 0.1, 0.3);
        g.gain.setTargetAtTime(0, t + length * 0.9, 0.12);
        g.connect(this.master);
        for (const [type, detune] of [
          ["sine", 0],
          ["triangle", 4],
        ] as const) {
          const o = c.createOscillator();
          o.type = type;
          o.frequency.value = hz(this.note(spec, degree, 1));
          o.detune.value = detune;
          o.connect(g);
          o.start(t);
          o.stop(t + length + 0.6);
        }
      }
      t += length;
    }
    return t;
  }

  private bell(spec: MoodSpec, at: number) {
    const chord = spec.chords[(this.chord + spec.chords.length - 1) % spec.chords.length]!;
    const degree = chord[Math.floor(this.random() * chord.length)]! + (this.random() < 0.3 ? 1 : 0);
    const c = this.context;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = hz(this.note(spec, degree, 1 + (this.random() < 0.35 ? 1 : 0)));
    const g = c.createGain();
    const level = 0.05 + this.random() * 0.05;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, at + 2.4);
    o.connect(g).connect(this.master);
    o.start(at);
    o.stop(at + 2.5);
  }
}

// A motif's notes over a chord whose root is scale degree `root`.
export function motifNotes(motif: ReadonlyArray<[number | null, number]>, root: number) {
  return motif.map(([degree, beats]) => ({ degree: degree === null ? null : degree + root, beats }));
}

export function moodMotif(mood: Exclude<MusicMood, "off">) {
  return moods[mood].motif;
}

// A decaying stereo noise tail: the reverb's room.
function impulse(context: BaseAudioContext, seconds: number) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6);
  }
  return buffer;
}
