# Native Aether asset path (0.7.0)

![Native textured bench](images/native-bench.png)

The native playground now displays the supplied Aether bench on its player entity.
WASD moves that model; camera, creation/removal of crates and reset work as before.
The model uses real triangle geometry, UVs, two material colors and a generated Aether
plank albedo. The source model, texture, cooked bytes and provenance ship in the repo.

## Build and use

Build as before. CMake copies assets/bench.gea beside engine_playground. Keep that
assets directory next to the executable when moving the build. The Windows/Linux
Actions artifacts include it. An explicit `--asset path/to/file.gea` overrides the default.
Missing or malformed assets fail with a diagnostic and nonzero exit; no fake fallback model.

```
python3 tools/cook_static_mesh.py assets/source/bench.glb assets/source/planks.rgba assets/cooked/bench.gea
python3 tests/cooker_tests.py
engine_playground --asset assets/cooked/bench.gea --snapshot frame.ppm
```

To regenerate the albedo using the identified extracted archive:

```
node tools/generate_aether_albedo.mjs /path/to/extracted/aether assets/source/planks.rgba
```

Runtime loading has no JSON, Python, Node, SDL or third-party importer dependency.
The Python cooker is an offline development tool; CI checks its output matches the
checked-in fixture. Native CTest covers the binary reader and textured draw behavior.

## Contracts

The initial GLB subset is intentionally explicit: one identity mesh node, one scene,
embedded buffer, triangle primitives, float position/normal/UV accessors, unsigned 16/32-bit
indices, opaque baseColorFactor materials. The cooker validates accessor ranges and rejects
required extensions, sparse data, transformed hierarchies, skins, animation and embedded
textures. Supporting those assets means adding implementations and fixtures, not ignoring data.
Material named wood receives the supplied albedo; other materials retain their flat colors.

GEA1 is little endian: four magic bytes, u32 expanded vertex count, u32 square texture size,
then vertices (8 IEEE float32 values: position3, normal3, uv2; RGB8 and one texture flag),
then RGBA8 texels. There is no native struct packing in the reader. Vertex count is a positive
multiple of three, capped at 300000; texture edge is 1..256. Exact payload length, finite
bounded coordinates/normals/UVs and flags are validated before an asset is returned.

The CPU rasterizer uses the existing depth buffer, orthographic barycentric UV interpolation,
nearest/repeat albedo sampling and simple face lighting. This is a visible asset integration,
not full PBR. The renderer consumes decoded data, so a future GPU backend can use the same
asset without involving the window platform in import parsing.

Tests: source-to-cooked repeatability; malformed/truncated GLB and accessor bounds; unsupported
features; cooked header/length/count/NaN/material errors; material assignment; visible mesh;
repeatable textured pixels; texture changes affecting output. Previous camera/world/SDL tests
remain enabled. See the pull request for exact platform verification results.
