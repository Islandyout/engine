# Velocity — Original Speedster Game

## Direction

A small, third-person 3D superhero sandbox built inside Islandyout/engine. The hero is original; no DC characters or story are required. Keep the first version compact and playable rather than turning it into a large open-world project.

## First playable: one city block

- A compact city block with streets, sidewalks, simple buildings, ramps, and a few obstacles.
- One controllable speedster with a camera that follows smoothly.
- Responsive acceleration and braking: normal movement is controllable, while holding Sprint builds speed and momentum.
- Jumping and forgiving landings.
- A visible speed readout and red/orange lightning trail or speed particles that intensify with velocity.
- A few collectible energy orbs or rescue markers to give the player something simple to do.
- A quick restart/reset so the player can immediately try the route again.

## Controls (initial proposal)

- WASD: move relative to camera
- Mouse: look around
- Shift: build/hold super-speed
- Space: jump
- R: reset to the start

Use the engine's existing Player, Collider, physics, camera, particles, input, and scene systems wherever they already work. Add only the smallest missing gameplay code. Do not create a new engine or rewrite existing systems.

## Build order

1. Audit the current main branch and editor/runtime capabilities before implementation.
2. Make a small scene and verify ordinary movement, camera, ground collision, and jumping.
3. Add acceleration, top speed, braking, and stable turning at high speed.
4. Add speed effects and a readable speed HUD.
5. Add a short route and collectible/rescue targets.
6. Build the editor/site output and test the actual playable game; fix failures before calling it done.

## Acceptance criteria

- The game is available from the engine's Games library and its published page.
- The player can move, jump, accelerate, brake, and reset.
- High speed is visibly and noticeably different from ordinary movement.
- Buildings/obstacles collide rather than being purely decorative.
- The route has at least one simple objective.
- Existing engine tests/builds still pass.
- A PR and playable build link are provided; do not claim features or tests that were not verified.

## Deliberately out of scope for the first version

A huge open world, detailed story, complex combat, destructible buildings, traffic simulation, multiplayer, advanced ragdolls, and sophisticated missions. Add these only after the small speedster sandbox is fun and reliable.
