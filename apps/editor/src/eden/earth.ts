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
  windMs: number; // wind speed, metres a second
  windDir: number; // the direction it blows toward, radians
  rainAmount: number; // 0 (dry) .. 1 (downpour); a drizzle or a deluge when it rains
  fog: number; // 0 clear .. 1 thick: morning mist after rain, low cloud in the cold months
  snowing: boolean; // precipitation, but cold enough to fall as snow
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
  const tempC = seasonal + daily + drift - (raining ? 3 : 0);
  // Wind changes over hours, is stronger in autumn and winter, and rises before and during rain.
  const gust = Math.floor(clock / (DAY / 6));
  const gustMix = (clock - gust * (DAY / 6)) / (DAY / 6);
  const windBase = [3.5, 2.5, 4.5, 5][season]!;
  const windMs = Math.max(0, windBase * (0.5 + 0.5 * ((hash(gust, climate.seed + 7) + 1) / 2) * (1 - gustMix) + 0.5 * ((hash(gust + 1, climate.seed + 7) + 1) / 2) * gustMix) + (raining ? 2 : 0));
  const windDir = Math.PI * (hash(Math.floor(clock / (2 * DAY)), climate.seed + 13) + 1);
  const rainAmount = raining ? 0.25 + 0.75 * ((hash(spell, climate.seed + 211) + 1) / 2) : 0;
  // Mist hangs about dawn after a wet night; the cold months bring low cloud.
  const wetNight = (hash(Math.floor((clock - DAY / 4) / (DAY / 8)), climate.seed + 101) + 1) / 2 < wet * 0.55;
  const dawn = Math.max(0, 1 - Math.abs(hour - 6.5) / 2.5);
  const fog = Math.min(1, (raining ? 0.25 : 0) + (wetNight ? 0.5 * dawn : 0.15 * dawn) + (season === 3 ? 0.15 : season === 2 ? 0.08 : 0));
  return { tempC, raining, season, seasonProgress: progress, dayOfYear, windMs, windDir, rainAmount, fog, snowing: raining && tempC < 1 };
}

// How fast plants grow back in each season, and more after rain: a multiple of the base regrowth.
export const GROWTH_BY_SEASON = [0.9, 1.5, 1.1, 0.04];
export function growthRate(weather: Weather): number {
  return GROWTH_BY_SEASON[weather.season]! * (weather.raining ? 1.3 : 1);
}

// The temperature a lightly clothed person feels comfortable at, and how cold the world must be before it matters.
export const COMFORT_C = 15;

// The sun's hours change with the year, as on earth: long summer days, short winter ones. The longest day is 15 hours and the shortest 9.
export function daylight(clock: number): { rise: number; set: number; hours: number } {
  const yearFrac = (clock % YEAR) / YEAR;
  const hours = 12 + 3 * Math.sin(2 * Math.PI * (yearFrac - 0.125));
  return { rise: 12 - hours / 2, set: 12 + hours / 2, hours };
}

// Dark enough to sleep: from an hour after sunset until half an hour before sunrise.
export function isDark(clock: number): boolean {
  const { rise, set } = daylight(clock);
  const h = hourOf(clock);
  return h >= set + 1 || h < rise - 0.5;
}

// The moon goes round every MOON_DAYS days (two moons to a season); 0 is new, 0.5 full.
export const MOON_DAYS = 8;
export const moonPhase = (clock: number) => ((clock / DAY) / MOON_DAYS) % 1;
// How much moonlight there is now, 0 (new moon, or day) to 1 (full moon at night).
export function moonLight(clock: number): number {
  if (!isDark(clock)) return 0;
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * moonPhase(clock));
}

// How active the river's fish are in each season, a multiple of their summer feeding.
export const FISH_BY_SEASON = [0.9, 1, 0.8, 0.3];

// The hour the sky should show: the sun rises at 6 and sets at 18 on screen whatever the season, so a short winter day is lit as a short day.
export function solarHour(clock: number): number {
  const { rise, set } = daylight(clock);
  const h = hourOf(clock);
  if (h >= rise && h <= set) return 6 + ((h - rise) / (set - rise)) * 12;
  const night = 24 - (set - rise);
  const since = h > set ? h - set : h + 24 - set;
  return (18 + (since / night) * 12) % 24;
}

export function moonName(clock: number): string {
  const p = moonPhase(clock);
  return p < 0.06 || p > 0.94 ? "new moon" : p < 0.44 ? "waxing moon" : p < 0.56 ? "full moon" : "waning moon";
}
