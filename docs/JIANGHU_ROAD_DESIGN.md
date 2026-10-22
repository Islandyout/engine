# Jianghu Road: design

A new game on the same engine, designed from the ground up rather than grown out of the Azure Cloud Sect valley. You are a nobody
with a sword and a letter, walking into a world of sects, outlaws and masters. It is a single-player jianghu: a large map to cross,
strong and weak people met by chance, hidden things worth finding, and quests that are short, clear and always finishable. The model
is Albion Online's open world and the wuxia and xianxia games around it, without the other players.

Why a new game and not another region of the valley: the valley was a tutorial-sized slice built around one road (sect, camp, shrine).
An open world needs a different spine: a map with a danger ladder, places that matter on their own, a way to travel, and quests that
live in those places. The valley's people, arts and systems are reused where they fit; its layout is not.

## The pitch in five lines

1. **Walk out of the safe middle into the world.** A walled city of Cloudgate sits at the centre of a 1 km map. Every road out gets
   more dangerous, and the best things are at the edges.
2. **Meet people, not spawns.** Hermits, duellists, hunters, smugglers, sect envoys, a hungry tiger. Most strong people are not
   hostile; you can talk, duel to first yield, learn from them, or leave them alone.
3. **Grow by being taught.** Seven realms. Qi from meditation and fights; new arts and passives from masters, manuals and hidden
   places. Nothing is locked behind a timer.
4. **Quests are small, hand-made and cannot be lost.** Each has a place, a person and a twist, a recommended realm and a recovery for
   every way it can go wrong.
5. **The end is a choice.** The last manual is at the Nine-Dragon Summit; what you do with it is the ending.

## What the research said

Sources are player reviews, forum threads and developers' own talks; they are opinions and anecdotes, not measurements.

### What players praise

| Finding | Where it comes from | What we do |
| --- | --- | --- |
| **Danger you can read.** Albion colours its zones green, yellow, red and black; the best resources and relics sit in the dangerous ones, so every trip is a bet. | [Gaming Trend's Albion review](https://gamingtrend.com/reviews/risk-vs-reward-albion-online-review/), [the zone guide](https://www.keengamer.com/articles/guides/albion-online-everything-you-need-to-know/section/3-albion-online-zone-colors-pvp-rules-and-risk-levels/) | Five danger tiers with colours; the region's name and tier appear on entering; the best loot sits furthest out. No PvP, so the risk is the enemies. |
| **Fixed strength keeps progress meaningful.** Gothic does not scale enemies to you: many places are open from the start and not meant for you yet. Elden Ring players argue that scaling "diminishes the feeling of accomplishment". Oblivion's scaling is the standard bad example (bandits in the best armour). | [Gothic remake guide](https://space4games.com/en/games-en/gothic-1-remake-tips-guide/), [Elden Ring thread](https://steamcommunity.com/app/1245620/discussions/0/797840128955503427/), [Oblivion thread](https://steamcommunity.com/app/2623190/discussions/0/604154603520471089/) | Enemy strength is fixed by place and by who they are. Nothing scales to the player. Skyrim's lesson is kept: a camp gets bigger and a boss stronger, but ordinary bandits stay ordinary. |
| **Something happens every 30 to 40 seconds.** Dragon's Dogma wants "nothing to something" in that time while travelling; the surprise comes from layered systems, not pure randomness. | [Game8 on Dragon's Dogma 2](https://game8.co/articles/featured/how-dragons-dogma-2-gets-the-open-world-genre-right), [TechRadar](https://www.techradar.com/gaming/dragons-dogma-2-review) | Fixed spawn points, but who stands there depends on region, time of day and a roll. Wanderers move between roads and camps. |
| **Landmarks pull you on.** Breath of the Wild's triangle rule: big shapes are landmarks, medium ones hide what is behind them, small ones set the pace. Towers were moved so they invite side trips. | [Game Developer: five lessons from BotW](https://www.gamedeveloper.com/design/5-design-lessons-learned-from-i-the-legend-of-zelda-breath-of-the-wild-i-) | Every region has a silhouette visible from the last one (a pagoda on a ridge, smoke, a lit shrine). Hills hide camps; nothing is marked until seen. |
| **Quest content sets the size of the world, and quests are hand-made.** Witcher 3's designers rejected procedural contracts, kept dialogue short (about fifteen lines), and made side quests that are not chores. | [Kotaku on Witcher 3](https://kotaku.com/how-the-witcher-3s-developers-ensured-their-open-world-1735034176), [Game Developer on side quests](https://www.gamedeveloper.com/design/designing-side-quests-study-these-7-games-and-some-chris-avellone-pointers-) | Every quest is written by hand with a place, a person and a twist. No generated "kill ten" quests. The map has only as much as the quests and places need. |
| **Wuxia is lineage, reputation and teachers.** Power comes from masters and manuals, not just levels; who taught you decides who owes you and who hunts you; nobody is a god. | [Wuxia genre guide](https://www.bladerpg.com/en/what-is-a-wuxia-game/), [Age of Wushu on Wikipedia](https://en.wikipedia.org/wiki/Age_of_Wushu) | New arts are learned from masters and found manuals, each from a person or a place. Standing with the sect, the village and the outlaws changes what people offer. |
| **Cultivation is a choice of timing.** Breakthroughs gated by materials, a trial and the right moment are praised; pure luck and failure chances are the grind complaint. | [Tale of Immortal breakthrough guide](https://taleofimmortal.com/guides/breakthrough), [forum thread](https://forums.somethingawful.com/showthread.php?threadid=4033075) | A breakthrough needs a pill, full qi and a quiet place. It can be prepared for and it does not fail by dice. |

### What players complained about, and the fix

| Complaint | Where it comes from | Our rule |
| --- | --- | --- |
| **Bloat: too many systems and too many trinkets.** Where Winds Meet is "bloated", with "seemingly every videogame idea ever", rewards that are "more trinket than treasure", and systems introduced haphazardly. | [GamesRadar](https://www.gamesradar.com/games/open-world/where-winds-meet-review/), [Cog Connected](https://cogconnected.com/review/where-winds-meet-review/) | Fewer, better things. Each place offers one memorable thing. A reward is an art, an item that changes how you fight, or a way to a new place. Systems are taught one at a time. |
| **Repetition: the 150th hour is the first 15 minutes.** | [Steam review summary](https://steamcommunity.com/app/3564740/reviews/), [Gaming Trend on Albion's dungeons](https://gamingtrend.com/reviews/risk-vs-reward-albion-online-review/) | Every camp, cave and shrine has its own layout, enemy mix and rule (a boss that heals from braziers, a cave with no light). No two POIs of one kind play the same. |
| **Story and quests buried under side content; main plot vague.** | [Cog Connected](https://cogconnected.com/review/where-winds-meet-review/), [MMORPG.com](https://www.mmorpg.com/reviews/where-winds-meet-final-review-2000136775) | A clear main line with an ending. The journal always names the next main step. Side quests are labelled and never block it. |
| **Running between characters with long dialogue (levelling is "mind-numbingly boring").** | [Wccftech on Swords of Legends Online](https://wccftech.com/review/sword-of-legends-online-review/) | Quest givers are near the work. Dialogue is a few lines. Travel has fast-travel stones once a place has been visited. |
| **No tutorial, poorly explained systems, vague UI.** | [Albion reviews](https://forums.mmorpg.com/discussion/461644/albion-online-fresh-review), [Swords of Legends review](https://wccftech.com/review/sword-of-legends-online-review/) | Each new system is introduced by a person, in the place where it matters, once. The journal has a page for every system. |
| **Slow grind, safe areas nerfed, time and energy gates.** | [Albion reviews](https://www.mmobomb.com/review/albion-online), [Where Winds Meet Steam threads](https://steamcommunity.com/app/3564740/discussions/0/684111558794806347/) | No energy gates and no timers on progress. There are several ways to grow (meditation, fights, manuals, elixirs, quests), and a safe place to train at every tier. |
| **Quest bugs: broken daily quests, scripted events that never fire, soft-locks.** | [Wccftech](https://wccftech.com/review/sword-of-legends-online-review/), [Xbox Play on soft-locking](https://xboxplay.games/progression-systems/how-to-avoid-softlocking-quests-72365) | Quests are state machines checked by a test (below). |
| **Dying to something far too strong with no warning.** | [Gothic remake review](https://www.well-played.com.au/gothic-1-remake-review/), [RPG Codex on danger colours](https://rpgcodex.net/forums/threads/proper-map-design-in-open-world-crpgs.139301/) | Strong people announce themselves: a pressure on the screen edge and a line of text when a stronger cultivator is near, before they notice you. Most strong people are not hostile. |

## The rules we build to

1. **The map is made of tiers.** Tier 1 (green) is safe to learn in; tier 5 (black) kills a careless Golden Core. Tiers are fixed in space. Between tiers there is always a pass, a road or a river you can see.
2. **You never need to fight what you cannot beat.** Every quest is rated for a realm (recommended, not required). No quest asks for more than three enemies of its own realm at once. Anything stronger is optional, sits off the quest's path, and is announced.
3. **A quest cannot be lost.** States are named and reachable from any earlier state; a lost or sold item can be got again; a dead or missing quest giver leaves a notice board entry; a quest that was skipped can be offered later.
4. **Each place has one thing worth the trip, and the furthest places have the best.** Rewards come in three kinds: something that changes play (an art, an item with an effect), something you learn (a clue to another place), something to look at (a view, a ruin). The best POIs give all three.
5. **People are people.** Names, a job, a want, a short list of lines. Strong people can be met, talked to, challenged to a duel (to first yield, not to death) and sometimes taught by.
6. **Power grows without end, but each step is earned.** Seven realms. The last ones are reached through hidden manuals and the hardest places, not through waiting.

## The map

One 1000 m by 1000 m heightfield, north is -z. Danger rises with distance from Cloudgate and with height. Each region has its own
silhouette, so you always see where you are going and what you are walking away from.

| Region | Where | Tier | Realm of what lives there | What it is |
| --- | --- | --- | --- | --- |
| **Cloudgate** | centre | 1, green | 1 to 2 | The walled city: market, inn, notice board, the Azure Cloud Sect's hall, a forge, an alchemist. Nothing hostile inside the wall. |
| **Willow Plain** | around the city, 150 m | 1 | 1 to 2 | Farms, a stream, wolves at dusk, a few bandits on the roads, a training ground for beginners. |
| **Whispering Bamboo Forest** | east | 2, yellow | 2 to 3 | Hunters, a hermit master, a Black Wind lookout, a hidden grove. |
| **Jade Lake Marches** | west | 2 to 3 | 2 to 4 | Port Jade, smugglers, a duelling pier, a wreck with a secret. |
| **Heaven Peak** | north | 3, orange | 3 to 4 | The shrine road and its guardian, mountain monks, the way up to the summit. |
| **Crimson Maple Gorge** | north-west | 4, red | 4 to 6 | The Blood Lotus Sect: rivals and duellists who hunt for a fight. |
| **Frostfang Ridge** | far north | 4 | 4 to 5 | The Black Wind Gang's fortress, ice caves, the sword tomb. |
| **Sunken Valley of Bones** | south-east | 5, black | 5 to 7 | An old battlefield; the dead and the strongest wanderers. |
| **Nine-Dragon Summit** | top of Heaven Peak | 5 | 5 to 7 | The ruined hall and the last manual. |

## Realms

| # | Name | Qi to reach the next | Unlocks |
| --- | --- | --- | --- |
| 1 | Mortal | 100 | Meditation, fists |
| 2 | Qi Gathering | 250 | First qi art, wall run, grapple |
| 3 | Foundation | 500 | Sword flight, second art |
| 4 | Golden Core | 2000 | Third and fourth arts |
| 5 | Nascent Soul | 4000 | The first art grows (a sky-splitting palm); spirit sight (strong people shown from afar) |
| 6 | Spirit Severing | 8000 | The second art grows (a heaven seal) |
| 7 | Void Ascendant | none | Everything; the ending's choice |

## Quest rules (and the checks that enforce them)

Quests are data (`tools/jianghu/quests.ts`), each a list of named steps. A test (`apps/editor/tests/jianghuQuests.test.ts`) fails the
build if:

- a step cannot be reached from the quest's first step, or a quest has no way to finish;
- a step needs an item that nothing in the world or the quest gives (and has no recovery that gives it again);
- a quest names a person, place or item that does not exist in the scene;
- a quest's recommended realm is below the realm of an enemy it makes you fight by more than one, or it asks for more than three
  fights in a row against its own realm;
- a quest has more than fifteen lines of dialogue.

Quest kinds, each used more than once so no quest becomes "the same task for 150 hours": investigate (clues, no fight needed),
deliver or escort with a choice, duel to yield, hunt a named beast, defend a place for a fixed time, find (a place, a person, a
manual), and a favour that changes what a faction offers.

## What is built

See `docs/changelog/F101.md` for what has landed and what is next.
