import assert from "node:assert/strict";
import { test } from "node:test";
import { SampleBank } from "../src/editor/sampleBank";

function fakeContext() {
  const started: { buffer: unknown; rate: number }[] = [];
  const node = () => ({ connect: (n: unknown) => n });
  const context = {
    currentTime: 0,
    decodeAudioData: async (data: ArrayBuffer) => ({ id: data.byteLength }) as unknown as AudioBuffer,
    createGain: () => ({ gain: { value: 1 }, connect: (n: unknown) => n }),
    createBufferSource: () => {
      const source = { buffer: null as unknown, playbackRate: { value: 1 }, connect: (n: unknown) => n, start() { started.push({ buffer: source.buffer, rate: source.playbackRate.value }); } };
      return source;
    },
  } as unknown as BaseAudioContext;
  void node;
  return { context, started };
}

test("samples load in the background; until then nothing plays, and afterwards no sample repeats back to back", async () => {
  const { context, started } = fakeContext();
  const fetched: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    fetched.push(url);
    return { ok: !url.includes("impactBell"), arrayBuffer: async () => new ArrayBuffer(fetched.length) };
  }) as unknown as typeof fetch;
  try {
    const bank = new SampleBank(context, "./x/");
    const output = {} as AudioNode;
    assert.equal(bank.play("punchHeavy", output), false, "silent before loading");
    await bank.load();
    assert.ok(bank.ready);
    assert.ok(fetched.every((u) => u.startsWith("./x/") && u.endsWith(".ogg")));
    assert.equal(bank.play("bell", output), false, "a group whose files are missing stays silent");
    let last: unknown;
    for (let i = 0; i < 30; i++) {
      assert.equal(bank.play("punchHeavy", output), true);
      const buffer = started.at(-1)!.buffer;
      assert.notEqual(buffer, last, "never the same sample twice running");
      last = buffer;
      assert.ok(started.at(-1)!.rate > 0.9 && started.at(-1)!.rate < 1.1, "a little pitch variation");
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});
