// Where a gun is held, found from its shape: the gun lies along +x (muzzle
// at +x), y up. Returns points in the gun's own units:
//   grip    - where the firing hand closes (the pistol grip's upper half);
//   offhand - where the support hand goes (a foregrip or the handguard
//             ahead of the magazine; for a handgun, under the grip);
//   muzzle  - the end of the barrel.
// Used by import_weapons.mjs, which stores them as nodes in the weapon's GLB.
//
// The method: slice the gun along its length, take the lowest point in
// each slice, and find the parts that hang below the receiver (grip,
// magazine, foregrip, stock). A pistol grip is the one that slants back
// (its bottom behind its top) and isn't the butt of a stock; anything
// ahead of it is a magazine or foregrip.

const BINS = 64;

// `gripAt` (0 back end to 1 muzzle) overrides where the grip is, for a gun
// whose grip the shape misleads (one reaching the back end, with no stock).
export function gunPoints(vertices, { handgun = false, gripAt } = {}) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of vertices) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const L = maxX - minX,
    H = maxY - minY;
  const bin = (x) => Math.min(BINS - 1, Math.max(0, Math.floor(((x - minX) / L) * BINS)));
  const low = new Array(BINS).fill(Infinity);
  const high = new Array(BINS).fill(-Infinity);
  for (const [x, y] of vertices) {
    const b = bin(x);
    low[b] = Math.min(low[b], y);
    high[b] = Math.max(high[b], y);
  }
  // Fill empty slices from their neighbours.
  for (let b = 0; b < BINS; b++)
    if (!Number.isFinite(low[b])) {
      low[b] = low[b - 1] ?? maxY;
      high[b] = high[b - 1] ?? maxY;
    }
  // The receiver's underside: the most common low line in the gun's back
  // two thirds, among the slices that don't hang down (the upper half).
  const lows = low.slice(0, Math.floor(BINS * 0.7)).filter((y) => y > minY + H * 0.45);
  lows.sort((a, b) => a - b);
  const receiver = lows.length ? lows[Math.floor(lows.length * 0.25)] : minY + H * 0.55;
  // Hanging parts: runs of slices reaching well below the receiver.
  const drop = H * 0.12;
  const segments = [];
  for (let b = 0; b < BINS; b++) {
    if (low[b] > receiver - drop) continue;
    const last = segments[segments.length - 1];
    if (last && last.to === b - 1) last.to = b;
    else segments.push({ from: b, to: b });
  }
  const x0 = (b) => minX + (b / BINS) * L;
  for (const s of segments) {
    s.bottom = Math.min(...low.slice(s.from, s.to + 1));
    const depth = receiver - s.bottom;
    // Slant: where the part's lowest third sits against its top third.
    const upper = [],
      lower = [];
    for (const [x, y] of vertices) {
      if (x < x0(s.from) || x > x0(s.to + 1) || y > receiver) continue;
      if (y > receiver - depth / 3) upper.push(x);
      else if (y < s.bottom + depth / 3) lower.push(x);
    }
    const mean = (a) => a.reduce((t, v) => t + v, 0) / Math.max(1, a.length);
    s.slant = (mean(lower) - mean(upper)) / L;
    s.top = mean(upper);
    s.depth = depth;
    s.butt = s.from <= 2; // touches the back end: a stock
  }
  // The grip: slanting back, not a stock's butt; the rearmost such part.
  const atBin = gripAt === undefined ? undefined : Math.floor(gripAt * BINS);
  const grip =
    atBin !== undefined
      ? segments.find((s) => s.from <= atBin && atBin <= s.to)
      : (segments.find((s) => !s.butt && s.slant < -0.004) ?? segments.find((s) => !s.butt) ?? segments[0]);
  const gripDepth = grip ? receiver - grip.bottom : H * 0.5;
  // The hand closes a third of the way down the grip, on its centre line.
  const gy = receiver - gripDepth * 0.3;
  const gripX = (() => {
    if (!grip) return minX + L * 0.25;
    const xs = vertices.filter(([x, y]) => x >= x0(grip.from) && x <= x0(grip.to + 1) && Math.abs(y - gy) < gripDepth * 0.12).map(([x]) => x);
    return xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : (x0(grip.from) + x0(grip.to + 1)) / 2;
  })();
  // The support hand: on a handgun, cupping the grip from below; on a long
  // gun, a vertical foregrip if there is one, else the handguard ahead of
  // the magazine (or of the grip, without one).
  let offhand;
  if (handgun) offhand = [gripX + L * 0.02, receiver - gripDepth * 0.75];
  else {
    // Ahead of the grip: the magazine (the deepest part in the front two
    // thirds; trigger guards are shallow) and perhaps a vertical foregrip
    // further forward (not a bipod's thin, full-height leg).
    const ahead = segments.filter((s) => grip && s.from > grip.to && s.depth > gripDepth * 0.35);
    const magazine = ahead.filter((s) => s.from < BINS * 0.7).sort((a, b) => b.depth - a.depth)[0];
    const foregrip = ahead.find((s) => s !== magazine && s.from >= BINS * 0.55 && Math.abs(s.slant) < 0.01 && s.to - s.from >= 2 && s.to - s.from <= 6 && s.depth < H * 0.8);
    const muzzleBin = BINS - 1;
    const magEnd = magazine ? magazine.to : (grip?.to ?? BINS * 0.3);
    if (foregrip) offhand = [(x0(foregrip.from) + x0(foregrip.to + 1)) / 2, receiver - (receiver - foregrip.bottom) * 0.4];
    else if (magazine && muzzleBin - magEnd < BINS * 0.15) {
      // A short gun with no handguard to speak of: hold the magazine well.
      offhand = [(x0(magazine.from) + x0(magazine.to + 1)) / 2, receiver - magazine.depth * 0.2];
    } else {
      // The handguard: a hand's width ahead of the magazine, at least a
      // forearm's reach from the grip, and short of the muzzle.
      const gripBin = grip ? (grip.from + grip.to) / 2 : BINS * 0.25;
      const b = Math.round(Math.min(muzzleBin - BINS * 0.15, Math.max(magEnd + BINS * 0.07, gripBin + BINS * 0.28)));
      // Its underside, ignoring anything hanging there (a bipod).
      const lows = low.slice(Math.max(0, b - 2), b + 3).filter((y) => y > receiver - drop);
      const under = lows.length ? Math.min(...lows) : receiver;
      offhand = [x0(b + 0.5), under + H * 0.02];
    }
  }
  // The support hand holds the gun from below: never above the barrel line.
  offhand[1] = Math.min(offhand[1], receiver + H * 0.12);
  // Muzzle: the front end, at the barrel's height.
  const front = vertices.filter(([x]) => x > maxX - L * 0.02).map(([, y]) => y);
  const muzzle = [maxX, front.length ? (Math.min(...front) + Math.max(...front)) / 2 : maxY - H * 0.2];
  return { grip: [gripX, gy], offhand, muzzle, length: L, height: H, receiver, segments };
}
