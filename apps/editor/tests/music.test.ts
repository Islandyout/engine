import assert from "node:assert/strict";
import { test } from "node:test";
import { moodMotif, motifNotes, musicMoods } from "../src/editor/music";

test("every mood has a composed motif, transposed onto its chord", () => {
  for (const mood of musicMoods) {
    if (mood === "off") continue;
    const motif = moodMotif(mood);
    assert.ok(motif && motif.length >= 4, `${mood} has a phrase`);
    const beats = motif.reduce((sum, [, b]) => sum + b, 0);
    assert.ok(beats >= 8 && beats <= 24, `${mood}'s phrase is a few bars`);
  }
  const notes = motifNotes(
    [
      [0, 1],
      [null, 1],
      [2, 2],
    ],
    3,
  );
  assert.deepEqual(notes, [
    { degree: 3, beats: 1 },
    { degree: null, beats: 1 },
    { degree: 5, beats: 2 },
  ]);
});
