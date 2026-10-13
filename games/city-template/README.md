# City Template

A small working town to start a game from: 3 × 3 blocks round a downtown, with a park, homes and an industrial edge. Open **City Template** from the editor's Games library and press Play.

## What's in it

- **Roads**: 16 junctions, each with traffic lights. A car that gets one green tends to get the next (a green wave).
- **Blocks**: buildings front their streets, with parking or gardens in the courtyards behind.
- **Streets**: trees, lamps, hydrants, bins and bus stops, placed by the rules real streets use.
- **Traffic**: 14 cars loop the blocks in the right-hand lane and stop at red lights.
- **People**: 36 people walk the sidewalks. They cross at the crosswalks when the walk light is on, and five of them walk dogs.
- **The park**: groves and clearings, benches, two foxes and a deer that keep their distance.

## Controls

| Action | Keys |
|---|---|
| Move | W A S D |
| Look | mouse (drag) |
| Sprint | Shift |
| Jump | Space |

## Building on it

To regenerate the town after changing `tools/city/`, run `cd apps/editor && npm run city`.

To add the town to your own scene generator, call `buildCity(scene, options)`. It returns the roads, junctions, blocks and a spawn point. The rules, numbers and research are in [docs/world/CITY_TEMPLATE.md](../../docs/world/CITY_TEMPLATE.md).
