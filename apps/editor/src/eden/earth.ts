// The earth Eden's people live on: a day, the seasons of a year, temperature, rain, and what grows when. Pure functions of the clock and a
// climate, so the same garden has the same weather every time it is run, and the minds and the scene can both ask "what is it like now".
//
// Scale: a day is 24 sim minutes (so 60 times faster than life). Ratios are kept true to life rather than raw times: a person gets
// thirsty in about a day, is in danger from thirst in about three days, from cold within hours of real exposure, and from hunger in weeks
// (see the constants in mind.ts). A year is 16 days, four to a season, so a watcher at 3x sees a whole year in about 2 real hours.

export const DAY = 1440;
export const YEAR_DAYS = 16;
export const YEAR = YEAR_DAYS * DAY;
export const hourOf = (clock: number) => ((clock / DAY) * 24) % 24;

export type Season = 0 | 1 | 2 | 3; // spring, summer, autumn, winter
export const SEASON_NAMES = ["spring", "summer", "autumn", "winter"] as const;

export interface Climate {
  meanC: number; // yearly average temperature
  seasonalAmpC: number; // how far summer and winter swing from it
  dailyAmpC: number; // how far afternoon and small hours swing from the day's average
  rainy: number; // 0..1: how often it rains (the season changes it)
  seed: number;
}

// Eden: a mild temperate garden. Cool wet winters that want a fire and a roof, warm summers.
export const EDEN_CLIMATE: Climate = { meanC: 14, seasonalAmpC: 9, dailyAmpC: 5, rainy: 0.3, seed: 7 };

export interface Weather {
  tempC: number;
  raining: boolean;
  season: Season;
  seasonProgress: number; // 0 at the start of the season, 1 at its end
  dayOfYear: number;
}

// A repeatable value in [-1, 1] for an integer and a seed.
function hash(n: number, seed: number): number {
  let h = (Math.imul(n | 0, 0x45d9f3b) ^ Math.imul(seed | 0, 0x119de1f3)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

// How wet each season is, as a multiple of the climate's own rainfall.
const RAIN_BY_SEASON = [1.2, 0.6, 1.3, 1.0];

export function seasonAt(clock: number): { season: Season; progress: number; dayOfYear: number } {
  const yearFrac = (clock % YEAR) / YEAR;
  const season = Math.min(3, Math.floor(yearFrac * 4)) as Season;
  return { season, progress: yearFrac * 4 - season, dayOfYear: Math.floor(clock / DAY) % YEAR_DAYS };
}

export function weatherAt(clock: number, climate: Climate): Weather {
  const { season, progress, dayOfYear } = seasonAt(clock);
  const yearFrac = (clock % YEAR) / YEAR;
  // Coldest in the middle of winter (yearFrac 0.875), warmest in the middle of summer (0.375).
  const seasonal = climate.meanC + climate.seasonalAmpC * Math.sin(2 * Math.PI * (yearFrac - 0.125));
  const hour = hourOf(clock);
  const daily = climate.dailyAmpC * Math.sin((2 * Math.PI * (hour - 9)) / 24); // warmest at 15:00
  // Weather systems: a few degrees of drift that changes over a couple of days, smoothly.
  const span = 2 * DAY;
  const block = Math.floor(clock / span);
  const mix = (clock - block * span) / span;
  const drift = 3 * (hash(block, climate.seed) * (1 - mix) + hash(block + 1, climate.seed) * mix);
  // Rain falls in spells of about three hours.
  const spell = Math.floor(clock / (DAY / 8));
  const wet = Math.max(0, Math.min(0.9, climate.rainy * RAIN_BY_SEASON[season]!));
  const raining = (hash(spell, climate.seed + 101) + 1) / 2 < wet * 0.55;
  return { tempC: seasonal + daily + drift - (raining ? 3 : 0), raining, season, seasonProgress: progress, dayOfYear };
}

// How fast plants grow back in each season, and more after rain: a multiple of the base regrowth.
export const GROWTH_BY_SEASON = [0.9, 1.5, 1.1, 0.04];
export function growthRate(weather: Weather): number {
  return GROWTH_BY_SEASON[weather.season]! * (weather.raining ? 1.3 : 1);
}

// The temperature a lightly clothed person feels comfortable at, and how cold the world must be before it matters.
export const COMFORT_C = 15;
