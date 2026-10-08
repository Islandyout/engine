import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DistrictMap,
  clampToRim,
  fitMap,
  imageFrame,
  minimapDiameter,
  minimapTransform,
  overlaps,
  parseMapLayout,
  parseMapMarker,
  placeLabel,
  toImage,
  toMinimap,
} from "../src/editor/minimap";

const close = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);

test("the minimap frame: forward is up, and the world is never mirrored", () => {
  // Facing north (+z): a point ahead is up; +x lies on the left (seen from
  // above with +z up the screen, as the camera sees the world).
  let p = toMinimap(0, 10, 0, 1);
  close(p.up, 10, "ahead");
  close(p.right, 0, "ahead, centred");
  p = toMinimap(5, 0, 0, 1);
  close(p.right, -5, "+x is to the left facing +z");
  // Facing +x: +z is on the right, -z on the left.
  p = toMinimap(0, 5, 1, 0);
  close(p.right, 5, "+z to the right facing +x");
  close(p.up, 0, "+z beside, not ahead");
  p = toMinimap(7, 0, 1, 0);
  close(p.up, 7, "ahead facing +x");
  // Turning keeps distances.
  const f = { x: Math.sin(0.7), z: Math.cos(0.7) };
  p = toMinimap(3, -4, f.x, f.z);
  close(Math.hypot(p.right, p.up), 5, "a rotation");
});

test("far markers hold on the rim, near ones stay put", () => {
  assert.deepEqual(clampToRim(3, 4, 10), { x: 3, y: 4, clamped: false });
  const far = clampToRim(30, 40, 10);
  assert.ok(far.clamped);
  close(far.x, 6, "rim x");
  close(far.y, 8, "rim y");
  assert.equal(clampToRim(0, 0, 10).clamped, false);
});

test("the minimap's size: small, medium (180 px at 1280 x 720) or large, smaller on small screens", () => {
  assert.equal(minimapDiameter(undefined, 1280, 720), 180);
  assert.equal(minimapDiameter("medium", 1920, 1080), 180);
  assert.equal(minimapDiameter("small", 1280, 720), 140);
  assert.equal(minimapDiameter("large", 1280, 720), 210);
  assert.equal(minimapDiameter("medium", 960, 540), 135);
  // A phone held upright: never under 88 px.
  assert.equal(minimapDiameter("medium", 390, 844), 88);
  assert.ok(minimapDiameter("large", 844, 390) < minimapDiameter("large", 1280, 720));
});

test("the layout image's transform puts every world point where toMinimap does", () => {
  const frame = imageFrame({ x0: -104, z0: 14, x1: 104, z1: 214 });
  const player = { x: 12, z: 80 };
  const scale = 1.5;
  for (const yaw of [0, 0.4, Math.PI / 2, 2.5, -1.2]) {
    const f = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const [a, b, c, d, e, g] = minimapTransform(frame, player.x, player.z, f.x, f.z, scale, 100, 90);
    for (const [x, z] of [
      [12, 80],
      [-40, 160],
      [88, 72],
      [0, 24],
    ]) {
      const { u, v } = toImage(frame, x!, z!);
      const m = toMinimap(x! - player.x, z! - player.z, f.x, f.z);
      close(a * u + c * v + e, 100 + m.right * scale, `x at yaw ${yaw}`);
      close(b * u + d * v + g, 90 - m.up * scale, `y at yaw ${yaw}`);
    }
  }
});

test("the full map keeps the image's aspect and centres it", () => {
  const frame = imageFrame({ x0: -104, z0: 14, x1: 104, z1: 214 });
  const fit = fitMap(frame, 0, 0, 1000, 500);
  close(fit.h, 500, "fills the height");
  close(fit.w / fit.h, frame.width / frame.height, "aspect");
  close(fit.x, (1000 - fit.w) / 2, "centred");
  // North (+z) is up: a point further north sits higher.
  const at = (x: number, z: number) => ({ x: fit.x + (frame.x1 - x) * fit.scale, y: fit.y + (frame.z1 - z) * fit.scale });
  assert.ok(at(0, 200).y < at(0, 20).y);
  // The bounds fill the box minus the margin.
  assert.ok(at(-104, 14).x <= fit.x + fit.w && at(104, 214).x >= fit.x);
});

test("map labels go where they fit: below, above, beside, or not at all", () => {
  const taken = [{ x: 90, y: 90, w: 20, h: 20 }]; // the icon at (100, 100)
  assert.deepEqual(placeLabel(taken, 100, 100, 12, 40, 10), { x: 100, y: 117 });
  // The space below is taken now: the next label for the same icon goes above.
  assert.deepEqual(placeLabel(taken, 100, 100, 12, 40, 10), { x: 100, y: 83 });
  assert.deepEqual(placeLabel(taken, 100, 100, 12, 40, 10), { x: 132, y: 100 });
  assert.deepEqual(placeLabel(taken, 100, 100, 12, 40, 10), { x: 68, y: 100 });
  assert.equal(placeLabel(taken, 100, 100, 12, 40, 10), undefined, "crowded out");
  // Something just below and above, but not to the lower right: a corner.
  const corner = [
    { x: 90, y: 90, w: 20, h: 20 },
    { x: 80, y: 112, w: 18, h: 10 },
    { x: 80, y: 78, w: 40, h: 10 },
    { x: 112, y: 95, w: 40, h: 10 },
    { x: 48, y: 95, w: 40, h: 10 },
  ];
  assert.deepEqual(placeLabel(corner, 100, 100, 12, 40, 10), { x: 120, y: 117 });
  assert.ok(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }));
  assert.ok(!overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), "touching is not overlapping");
});

test("hud.map_layout and hud.map_marker text", () => {
  const layout = parseMapLayout(
    ["bounds 10 0 -10 20", "area -5 0 5 10 #224466 The park", "road -10 8 10 12", "building 1 1 3 4", "tree 2 2", "poi station 4 5 Hangang Station", "label 0 19 Han river", "nonsense 1 2", "area 1 2 3 4 notacolour"].join("\n"),
  )!;
  assert.deepEqual(layout.bounds, { x0: -10, z0: 0, x1: 10, z1: 20 });
  assert.equal(layout.areas.length, 1);
  assert.equal(layout.areas[0]!.label, "The park");
  assert.equal(layout.roads.length, 1);
  assert.equal(layout.buildings.length, 1);
  assert.deepEqual(layout.trees, [{ x: 2, z: 2 }]);
  assert.deepEqual(layout.pois, [{ kind: "station", x: 4, z: 5, label: "Hangang Station" }]);
  assert.deepEqual(layout.labels, [{ x: 0, z: 19, text: "Han river" }]);
  assert.equal(parseMapLayout("area 0 0 1 1 #ffffff"), undefined, "no bounds, no map");
  assert.deepEqual(parseMapMarker("site1|gate|-32.00|160.00|#5fd16a|Gate: the park (D)"), {
    id: "site1",
    kind: "gate",
    x: -32,
    z: 160,
    color: "#5fd16a",
    label: "Gate: the park (D)",
  });
  assert.equal(parseMapMarker("quest|target|1|2|red|x")!.color, "", "colours are #rrggbb");
  assert.equal(parseMapMarker("quest|target||2||"), undefined);
});

test("the map opens only with a layout, inside its bounds, and not over a cutscene", () => {
  const map = new DistrictMap();
  assert.equal(map.canOpen, false);
  assert.equal(map.touchKey("KeyM", true), false, "no layout: M goes to the game");
  map.host("map_layout", "bounds -10 -10 10 10");
  const ctx = {} as CanvasRenderingContext2D;
  const view = (x: number, panels = false) => ({
    player: { position: { x, y: 0, z: 0 }, getWorldDirection: (v: { set: (...n: number[]) => unknown }) => v.set(0, 0, 1) },
    camera: { getWorldDirection: (v: { set: (...n: number[]) => unknown }) => v.set(0, 0, 1) },
    project: () => undefined,
    minimap: false,
    panels,
    window: false,
  });
  map.draw(ctx, 1280, 720, view(50) as never, 0);
  assert.equal(map.canOpen, false, "outside the bounds (in a Gate)");
  map.draw(ctx, 1280, 720, view(0, true) as never, 0);
  assert.equal(map.canOpen, false, "a cutscene is playing");
  map.draw(ctx, 1280, 720, view(0) as never, 0);
  assert.equal(map.canOpen, true);
  assert.equal(map.touchKey("KeyM", true), true);
  assert.equal(map.open, true);
  assert.equal(map.touchKey("KeyW", true), true, "the game gets nothing while it is open");
  assert.equal(map.touchKey("KeyM", true), true);
  assert.equal(map.open, false);
  map.host("map_layout", "");
  assert.equal(map.canOpen, false, "an empty layout removes the map");
});
