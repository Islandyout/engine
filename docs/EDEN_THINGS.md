# Eden: the things people can use, and the small things that make life good

A million hand-written lines would be worthless; a million *distinct moments* that come from a few hundred well-chosen parts is how life
actually feels. Every item below is a **part** (an object, a verb, a material, a quality, a context). The engine multiplies them.

## 1. How a million is reached (and counted, not claimed)

| Layer | Parts | Where |
|---|---|---|
| Small joys: trigger x context x noticed thing x detail x reaction | 25 triggers, ~8 things, ~6 details, ~6 reactions, ~1,000 contexts | `eden/joys.ts`, `countJoys()` (about 9.5 million today) |
| Object use: object x verb x material x condition x purpose | 150 objects, 25 verbs, 12 materials, 6 conditions, 8 purposes | planned, section 3 |
| Social moments: topic x tone x relation x memory | exists in `speech.ts` / `voiceContext.ts` | built |
| Skills: skill x level x tool x material | `identity.ts` | partly built |

Rule: a part is added once; the count rises by multiplication; `countJoys()` is a test (over 1,000,000).

## 2. Built so far: small joys (F124)

Warm sun, the smell of rain, a cool drink, a hot meal, sleeping well, firelight, dawn and dusk, stars, first snow, wind, a walk, finished work,
a shared joke, being alone in peace, washing, spring shoots, harvest, wild animals, sounds, touch, smells, play, being warm and dry after cold.
Each person notices them at their own rate (the curious and patient more), they lift mood a little and go in the journal, so the Minds tab
shows a life with ordinary good in it, not only needs and crises.

## 3. Objects to build next (categories; each is a part list, not a pile of code)

1. **Shelter and home** (~40): hearth, bed of bracken, skin blanket, door flap, window shutter, roof thatch, floor mat, storage pit, rain barrel, drying rack, bench, stool, lamp (tallow), peg, shelf, chest, curtain, swept floor, garden fence, doorstep.
2. **Food and kitchen** (~60): clay pot, spit, flat stone, grinding quern, basket, gourd, honey comb, smoke rack, salt lick, fermenting jar, oven pit, wooden spoon, bowl, knife, berry press, egg nest, milking pail, cheese cloth, herb bundle, drying string.
3. **Tools and craft** (~60): flint knife, axe, adze, awl, needle, loom, spindle, rope, net, snare, fish trap, hoe, digging stick, sickle, mortar, whetstone, potter's wheel, kiln, bellows, bow drill.
4. **Clothes and body** (~30): cloak, boots, hat, belt, bandage, comb, beads, dye, soap ash, bone needle, bag, sling, walking stick, torch, amulet.
5. **Land and farm** (~40): field, furrow, scarecrow, well, irrigation channel, orchard tree, beehive, pen, trough, haystack, compost, path, stepping stones, plank bridge, ford, boat, raft, fishing pole, signpost, boundary stone.
6. **Play and art** (~40): ball, knucklebones, flute, drum, rattle, swing, stilts, painted stone, carving, story stick, board game, kite, dance ground, cave painting, wreath.
7. **Memory and belief** (~30): grave marker, cairn, shrine, name post, story circle, seasons calendar notches, gift shelf, shared bowl, fire circle, lullaby.
8. **Animals as company** (~30): dog bed, horse tether, saddle blanket, hen coop, milking stool, bird perch, pet name, foal, shepherd's crook.

## 4. How each is implemented

An object is `{ kind, affordances, materials, conditions }` in `mind.ts` `AFFORDANCES` plus a prefab in `build_eden.ts`.
An interaction is **verb x object**: the verb is an intent kind (use, carry, give, mend, decorate, share, sit on, hide behind, lean on...).
Use changes: a need, an emotion, a skill (`practise`), the object's condition (wear, dirt, fullness), and writes a journal line from the
same part lists as joys. Objects wear and need mending (a reason to craft); owned objects carry a maker's name, so gifts and keepsakes
exist and a lost keepsake can be grieved. The Creator console already places any listed kind ("put a swing by the river").

## 5. Order of work

1. Home comforts (bed, blanket, hearth, rain barrel): they plug into sleep, warmth, illness recovery.
2. Cooking (pot, spit, oven): meat and grain become meals that taste and are shared (hooks into diet and customs).
3. Keepsakes and gifts (carvings, beads): hooks into `gift`, grief and stories.
4. Play objects (ball, flute, swing): children play, music at dusk gatherings.
5. Farm and water works (well, channel, hive, pen): hooks into the seasons.
6. Boats and bridges (open item from F118).
