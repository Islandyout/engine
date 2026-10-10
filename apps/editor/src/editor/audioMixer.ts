// Audio mixing (0.64.0): buses (sfx, music, ambient, ui) into a master with
// a compressor, a shared reverb send, and positional sources -- an HRTF
// panner placed in the world, optionally muffled when something solid is in
// the way. The listener follows the camera every frame.

export type Bus = "sfx" | "music" | "ambient" | "ui";

export interface MixerSettings {
  master: number;
  sfx: number;
  music: number;
  ambient: number;
  ui: number;
  reverb: number; // 0..1 wet level of the shared room reverb
  occlusion: boolean; // muffle sounds behind solid geometry
}

export const defaultMixerSettings: MixerSettings = {
  master: 1,
  sfx: 1,
  music: 0.7,
  ambient: 0.8,
  ui: 1,
  reverb: 0.18,
  occlusion: true,
};

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface SourceOptions {
  refDistance?: number; // full volume within this distance
  maxDistance?: number;
  occluded?: boolean;
  volume?: number;
}

// A decaying stereo noise burst: a cheap, convincing small-room impulse.
export function impulseResponse(context: BaseAudioContext, seconds = 1.6, decay = 3): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  let seed = 1234567;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = ((seed / 0x7fffffff) * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

export class AudioMixer {
  readonly master: GainNode;
  readonly buses: Record<Bus, GainNode>;
  private readonly reverbSend: GainNode;
  private settings: MixerSettings = { ...defaultMixerSettings };
  // The player's own volumes (their settings) over the scene's mix: master,
  // music, and effects (sounds, ambience and interface cues).
  private player = { master: 1, music: 1, effects: 1 };

  constructor(private readonly context: BaseAudioContext) {
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.ratio.value = 4;
    this.master = context.createGain();
    this.master.connect(compressor).connect(context.destination);
    const bus = () => {
      const gain = context.createGain();
      gain.connect(this.master);
      return gain;
    };
    this.buses = { sfx: bus(), music: bus(), ambient: bus(), ui: bus() };
    const convolver = context.createConvolver();
    convolver.buffer = impulseResponse(context);
    this.reverbSend = context.createGain();
    this.reverbSend.connect(convolver).connect(this.master);
    this.apply(defaultMixerSettings);
  }

  apply(settings: MixerSettings) {
    this.settings = { ...settings };
    const player = this.player;
    this.master.gain.value = settings.master * player.master;
    this.buses.sfx.gain.value = settings.sfx * player.effects;
    this.buses.music.gain.value = settings.music * player.music;
    this.buses.ambient.gain.value = settings.ambient * player.effects;
    this.buses.ui.gain.value = settings.ui * player.effects;
    this.reverbSend.gain.value = settings.reverb;
  }

  setPlayerVolumes(master: number, music: number, effects: number) {
    this.player = { master, music, effects };
    this.apply(this.settings);
  }

  get occlusion() {
    return this.settings.occlusion;
  }

  setBusVolume(bus: Bus | "master", volume: number) {
    const v = Math.max(0, Math.min(2, volume));
    if (bus === "master") this.settings.master = v;
    else this.settings[bus] = v;
    this.apply(this.settings);
  }

  updateListener(position: Position, forward: Position, up: Position) {
    const listener = this.context.listener;
    const t = this.context.currentTime;
    if (listener.positionX) {
      listener.positionX.setValueAtTime(position.x, t);
      listener.positionY.setValueAtTime(position.y, t);
      listener.positionZ.setValueAtTime(position.z, t);
      listener.forwardX.setValueAtTime(forward.x, t);
      listener.forwardY.setValueAtTime(forward.y, t);
      listener.forwardZ.setValueAtTime(forward.z, t);
      listener.upX.setValueAtTime(up.x, t);
      listener.upY.setValueAtTime(up.y, t);
      listener.upZ.setValueAtTime(up.z, t);
    } else {
      listener.setPosition(position.x, position.y, position.z);
      listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  // The node a sound connects into: straight to the bus (2D) or through a
  // panner at `position`. Spatial sources also feed the reverb.
  source(bus: Bus, position?: Position, options: SourceOptions = {}): { input: GainNode; panner?: PannerNode } {
    const input = this.context.createGain();
    input.gain.value = options.volume ?? 1;
    if (!position) {
      input.connect(this.buses[bus]);
      return { input };
    }
    const panner = this.context.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = options.refDistance ?? 2;
    panner.maxDistance = options.maxDistance ?? 200;
    panner.rolloffFactor = 1;
    this.place(panner, position);
    let tail: AudioNode = input;
    if (options.occluded) {
      const muffle = this.context.createBiquadFilter();
      muffle.type = "lowpass";
      muffle.frequency.value = 900;
      const quieter = this.context.createGain();
      quieter.gain.value = 0.55;
      tail = tail.connect(muffle).connect(quieter);
    }
    tail.connect(panner);
    panner.connect(this.buses[bus]);
    const send = this.context.createGain();
    send.gain.value = 0.6;
    panner.connect(send).connect(this.reverbSend);
    return { input, panner };
  }

  place(panner: PannerNode, position: Position) {
    const t = this.context.currentTime;
    if (panner.positionX) {
      panner.positionX.setValueAtTime(position.x, t);
      panner.positionY.setValueAtTime(position.y, t);
      panner.positionZ.setValueAtTime(position.z, t);
    } else panner.setPosition(position.x, position.y, position.z);
  }
}

// Footstep timing: one step per stride, where stride length grows with
// speed; airborne or slow movement resets the stride.
export class FootstepTracker {
  private travelled = 0;

  // Returns true when a footstep should play this frame.
  step(dt: number, speed: number, grounded: boolean): boolean {
    if (!grounded || speed < 0.8) {
      this.travelled = Math.min(this.travelled, 0.5);
      return false;
    }
    const stride = 1.1 + speed * 0.12;
    this.travelled += speed * dt;
    if (this.travelled >= stride) {
      this.travelled -= stride;
      return true;
    }
    return false;
  }
}
