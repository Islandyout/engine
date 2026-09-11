# Aether archive evaluation and first integration

Source: user-provided `aether-complete.zip`, SHA-256
`c70cac7397eed5ee9941d88bc1afa4740b68aecc26a61042fab5a71ac211dd72`.
Reviewed 2026-09-11. The archive has 298 entries, 51 JavaScript source modules,
11 scene specifications, 11 browser probe suites, and 133 GLB assets.

## Integration decisions

| Area | Decision | Reason / acceptance gate |
| --- | --- | --- |
| Seeded random generation | Adapted now to engine-owned C++ | Exact unsigned output matches Aether; used by Field Lab signal placement |
| ECS and scheduler | Keep existing F5 implementation | Reproduced stale-write/reset defects and registration-dependent ties in Aether |
| Input and engine loop | Keep F3/F4 and existing runtime | Avoid two input owners or fixed-step accumulators |
| Math, camera and primitive geometry | Candidate for native visual playground | Define matrix/depth conventions and test degenerate inputs before porting |
| WebGPU renderer and WGSL | Reference for rendering techniques | Browser GPU objects cannot become a native SDL/Vulkan backend by copying files |
| Generated GLB kit | Candidate for asset milestone | Header/JSON checks passed; native loader, geometry and material checks still needed |
| Fox model | Keep out of this import | Separate model/animation credits in assets/CREDITS.md must travel with any future adoption |
| glTF loader | Reference and test-fixture candidate | JavaScript loader depends on browser APIs and supports a subset; not a native importer |
| Transform hierarchy | Defer to scene workflow | Parent cycle rejection and stale-parent contracts required |
| Physics, vehicles, animation | Evaluate in their respective milestones | No claim that archive descriptions prove production readiness |
| Editor and GameSpec | Reference for later scene tools | Embedded new Function script execution is not a format for untrusted scenes |
| Audio | Later native audio milestone | WebAudio implementation needs a platform adapter |
| Planets, terrain LOD and streaming | Future work | Outside the native visual playground |

## Reproduced findings

Run `node tools/aether-review.mjs /path/to/extracted/archive` to reproduce the
focused CPU probes. They are diagnostic observations of the supplied source,
not tests that make the native Game Engine depend on Aether JavaScript.

- Destroy an entity, create its replacement, then call World.add with the stale
  entity: the replacement component is overwritten. SparseSet.set uses the index
  without checking the generation, and World.add does not require a live handle.
- World.clear resets nextIndex; create then reissues a previous live handle.
- Equal-order systems sort only by order. Registering b,a versus a,b changes execution.
- Aether makeRNG yields exact reference streams for seeds 0, 1, 42 and UINT32_MAX.

`node tools/validate.mjs games/*.json` in the extracted archive passed all 11 specs.
It reported one material warning and two informational notes. Independent checks
confirmed GLB v2 magic, total byte length and parseable JSON chunks for all 133 GLBs.
This is not full glTF validation or proof of rendered output.

The archive's 11 browser/WebGPU probe suites have not been run in this review.
Renderer, physics, animation and editor claims remain unverified here. No broad
archive import or native graphics/physics completion is implied.

## What is integrated

`engine/core/seeded_random.hpp` adapts only Mulberry32. State is local to each object;
u32 arithmetic wraps by definition. next_unit returns a double in [0,1). This is
repeatable content generation, not cryptography or a statistically unbiased sampler.
Attribution and the supplied MIT notice are retained in `third_party/aether/LICENSE`;
the browser build also distributes that notice as AETHER-LICENSE.txt.

Field Lab's New seeded field button resets the world and changes signal positions.
Reset and Record preserve the seed; replay uses the same seeded layout. A new field
clears the incompatible recording. Guided run returns to the original seed 1 layout.
The state fingerprint includes the seed. Placement jitter uses modulo reduction for
visual variation, not unbiased sampling. It stays inside disjoint cells and field bounds.

Native tests cover reference values, zero/max seeds, repeatability and unit fractions.
WASM tests cover seeded reset/replay, changed fields, recording invalidation and guided
reset. Desktop/mobile browser tests exercise a generated field before recording replay.

## Agreed delivery sequence

1. This bounded Aether evaluation and seeded-generation integration.
2. Native visual playground: desktop camera, simple objects, existing input/world
   control, entity creation/removal, screenshots and tests. No physics, planets or full editor.
3. Assets: a real model and textures, including credits and loader validation.
4. Physics: collision, gravity and a controllable character.
5. Scene workflow: save/load and basic property editing.
6. Playable slice: one small environment demonstrating the intended game experience.

Every milestone must have something visible or usable and automated verification.
Keep any ECS performance evaluation bounded and measurement-driven; it must not
become an indefinite prerequisite for visible progress. Audio, networking and large-world
systems follow concrete game requirements. No completion date for the full engine is implied.
