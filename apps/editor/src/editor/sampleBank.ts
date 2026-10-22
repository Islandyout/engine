// Recorded impact and footstep samples (Kenney's Impact Sounds, CC0) layered over the synthesized combat voices in sfx.ts: the
// synthesis keeps the low thump and the tail, the recording supplies the body and the click that make a blow sound real.
// Files load once, lazily; until they have, the synthesized voice plays alone.
const groups: Record<string, string[]> = {
  punchLight: [0, 1, 2, 3, 4].map((i) => `impactPunch_medium_00${i}`),
  punchHeavy: [0, 1, 2, 3, 4].map((i) => `impactPunch_heavy_00${i}`),
  block: [0, 1, 2, 3].map((i) => `impactPlate_medium_00${i}`),
  bell: [0, 1, 2].map((i) => `impactBell_heavy_00${i}`),
  fall: [0, 1, 2, 3, 4].map((i) => `impactSoft_heavy_00${i}`),
  stepGrass: [0, 1, 2, 3, 4].map((i) => `footstep_grass_00${i}`),
  stepHard: [0, 1, 2, 3, 4].map((i) => `footstep_concrete_00${i}`),
  wood: [0, 1, 2].map((i) => `impactWood_medium_00${i}`),
};

export class SampleBank {
  private readonly buffers = new Map<string, AudioBuffer[]>();
  private loading: Promise<void> | undefined;

  constructor(
    private readonly context: BaseAudioContext,
    private readonly base = "./audio/impacts/",
  ) {}

  // Starts loading every group (once). Failures leave that group silent: the synthesized voice still plays.
  load(): Promise<void> {
    this.loading ??= Promise.all(
      Object.entries(groups).map(async ([group, files]) => {
        const decoded = await Promise.all(
          files.map(async (file) => {
            try {
              const response = await fetch(`${this.base}${file}.ogg`);
              if (!response.ok) return undefined;
              return await this.context.decodeAudioData(await response.arrayBuffer());
            } catch {
              return undefined;
            }
          }),
        );
        this.buffers.set(group, decoded.filter((b): b is AudioBuffer => !!b));
      }),
    ).then(() => undefined);
    return this.loading;
  }

  // One of the group's samples, picked at random (never the same twice running), through `output`.
  private last = new Map<string, number>();
  play(group: string, output: AudioNode, volume = 1, when = this.context.currentTime, rate = 1) {
    const list = this.buffers.get(group);
    if (!list?.length) return false;
    let pick = Math.floor(Math.random() * list.length);
    if (list.length > 1 && pick === this.last.get(group)) pick = (pick + 1) % list.length;
    this.last.set(group, pick);
    const source = this.context.createBufferSource();
    source.buffer = list[pick]!;
    source.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    const gain = this.context.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(output);
    source.start(when);
    return true;
  }

  get ready() {
    return [...this.buffers.values()].some((list) => list.length > 0);
  }
}
