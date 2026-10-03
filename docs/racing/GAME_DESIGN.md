# HIGH HEAT — game design document

An open-city street racer with police pursuits, in the spirit of *Need for Speed: Most Wanted* (2005), built only from data on this engine: one generated scene file and one Lua director. The engine work it drove (arcade car dynamics, AI drivers, `ModelInstances`, the driving HUD) is documented in [F70](../IMPLEMENTATION_STATUS.md).

- **Play it**: `high-heat.html` next to the editor (`build/site/high-heat.html` after `tools/build_editor.sh`, `/engine/high-heat.html` deployed).
- **Source**: `tools/racing/build_high_heat.ts` generates `examples/racing/high-heat.json`; the game logic is `tools/racing/lua/director.lua`. Rerun with `npm run racing --prefix apps/editor`.

## 1. Research basis

| Source | Takeaway used here |
|---|---|
| *NFS: Most Wanted* pursuit system ([StrategyWiki](https://strategywiki.org/wiki/Need_for_Speed:_Most_Wanted/Pursuit_system), [Wikipedia](https://en.wikipedia.org/wiki/Need_for_Speed:_Most_Wanted_(2005_video_game))) | Pursuits escalate through **heat levels**. A **bust meter** fills while you're stopped and boxed in. Breaking line of sight starts a **cooldown** you must fill to escape, and being seen again resets it. |
| Arcade handling discussions ([gamedev.net](https://gamedev.net/forums/topic/712162-how-do-i-implement-arcade-drift-using-a-physics-engine), the *'90s Arcade Racer* diary on [Destructoid](https://destructoid.com/90s-arcade-racer-recreating-physics-from-the-ground-up)) | Good arcade physics is a "believable illusion": grip-limited lateral slip, a handbrake that loosens the rear, drifts that keep forward drive, and steering that never asks for more grip than the tyres have unless you mean it. |
| *Pure*'s racing AI ([Game Developer](https://www.gamedeveloper.com/design/the-pure-advantage-advanced-racing-game-ai)) and the rubber-banding debate ([Game Developer](https://www.gamedeveloper.com/design/rubber-banding-as-a-design-requirement)) | Rivals drive a racing line, brake for corners they can see coming, and carry skill levels. Catch-up is subtle (±6%), because obvious rubber-banding reads as cheating. |

## 2. Pillars

1. **Speed you can feel**: a speed-scaled FOV, a camera that trails and pulls back, engine note and tyre squeal, skid marks and smoke, and nitro flames.
2. **Drive the line**: grip-limited handling rewards braking before corners; the handbrake throws the car into a drift that refills nitro.
3. **The city fights back**: police notice speeding, call reinforcements, ram and box you in; escaping means breaking line of sight and staying hidden.
4. **Three events, one escalating night**: a circuit, a sprint with police around, and a showdown that ends in a pursuit you have to escape.

## 3. Handling (engine::gameplay::step_car)

| Car | Top speed | 0-100 km/h | Grip | Nitro |
|---|---|---|---|---|
| Player (Sports) | 62 m/s (223 km/h), 74 with nitro | ~2.6 s | 1.3 g | 4 s tank, refilled by drifting |
| Rivals | 56–60 m/s by skill | similar | 1.25 g | AI uses it on straights |
| Blacklist #1 | 63 m/s | quicker | 1.3 g | yes |
| Cruiser / Interceptor | 52 / 64 m/s | | 1.2 g | Interceptors only |
| Traffic | ~13 m/s cruise | | | |

Steering lock shrinks with speed and is capped by grip, so full lock at speed corners on the limit. The handbrake drops rear grip to 45% and overshoots the yaw rate, which starts a drift. Counter-steer and throttle hold it, and releasing the handbrake restores partial grip.

## 4. City

- **Bayview**: a 768 × 768 m grid. Nine avenues and nine streets every 96 m, built from 16 m road tiles, with crossings at every intersection.
- **Blocks**: 64 blocks of 80 m.
  - Downtown blocks (within 150 m of the center) get towers and offices.
  - The rest get offices, apartments, shophouses and retail.
  - All buildings are solid footprints.
- **Streetlamps** line the avenues. The city is walled at ±400 m.
- **Look**: a golden-hour procedural sky with a low sun, light haze, and the yellow-green Most Wanted grade (warm temperature, lifted contrast, bloom, vignette).
- **One-entity cost**: road tiles, buildings and lamps are three `ModelInstances` entities (about 1,100 instances). They are drawn instanced in 64 m chunks and frustum culled.

## 5. Events

1. **Downtown Circuit**: 2 laps of a 1 km loop against three rivals. No police.
2. **Harbor Sprint**: point to point across the city (1.5 km) against three rivals. Patrol cars are out, and speeding past one starts a pursuit.
3. **Most Wanted Showdown**: a 2.1 km sprint against the Blacklist #1 rival. A heat 3 pursuit is called in at the halfway point. Crossing the line isn't the end: you must evade the police to win.

Each event starts when you drive into its marker. A 3-2-1 countdown holds the cars, the HUD shows position, lap and time, and the results screen follows. Losing a race lets you retry it. **R** resets the car to the last checkpoint.

## 6. Police and heat

| | Heat 1 | Heat 2 | Heat 3 | Heat 4 | Heat 5 |
|---|---|---|---|---|---|
| Units chasing | 2 | 3 | 4 | 5 | 6 |
| Unit | Cruisers | Cruisers | + Interceptors | Interceptors | Interceptors |
| Aggression | follow | box in | ram | ram | ram |
| Evade cooldown | 10 s | 13 s | 16 s | 19 s | 22 s |

- **Detection**: a patrol (traffic-mode) cruiser spots the player within 45 m with line of sight while the player is over 110 km/h, or when hit by the player.
- **Escalation**: heat rises every 45 s of continuous pursuit and on ramming a unit.
- **Bust**: the bust meter fills over 3 s while the player is below 3 m/s with a unit within 9 m, and drains otherwise. Full means **BUSTED**.
- **Evade**: no unit within 110 m with line of sight starts the cooldown meter; any unit seeing the player resets it. Full means **EVADED**: units return to patrol and reinforcements leave.
- **Routing**: units chase directly with line of sight. Otherwise the director gives them a grid route (via the nearest intersections) toward the player every 1.5 s.

## 7. HUD

- **Engine**: speedometer, rev arc, gear and nitro bar (bottom right); a heading-up minimap with roads, racers (yellow), police (flashing red/blue), traffic and event markers (bottom left); waypoints.
- **Script UI**: event title and objective, position, lap and time, countdown, heat level, a bust (red) or evade (green) bar, the results panel, and the title screen.
- **Controls**: W/↑ throttle, S/↓ brake and reverse, A/D steer, Space handbrake, Shift nitro, R reset, P pause. A gamepad works through the default action bindings.

## 8. Test plan

- `tests/car_tests.cpp`: launch, top speed, brakes, reverse, coasting, steering direction, grip, handbrake drift, nitro, pure pursuit, and holding a circle.
- `tests/editor_bridge_tests.cpp`:
  - the player car on W/D;
  - an AI racer lapping a route;
  - a pursuit car closing in;
  - `vehicle.state`, `reset` and `freeze`.
- `tests/browser/high_heat.cjs`: title, then event 1 start (countdown, cars frozen, then racing with the HUD), then a scripted finish to the results screen.
- `apps/editor/tests/highHeat.test.ts`: the committed scene matches the generator.
