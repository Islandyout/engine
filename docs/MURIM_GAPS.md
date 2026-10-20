# Azure Cloud Sect: what a game like this needs

An all-encompassing list, built from the reference screens in `tools/ui_refs` (action RPG HUDs, menus, maps) and from what wuxia and cultivation action games do. **Have** means in the slice and checked; **Added** means built in the pass that wrote this list; **Gap** means still missing; **Partly** means some of the row is built. Each gap is listed with the engine work it would take.

## Combat

| Feature | State | Notes |
| --- | --- | --- |
| Light/heavy strings, kicks, specials | Have | Engine Melee component |
| Block, parry, dodge, lock-on, stagger and poise | Have | Engine |
| Qi arts on skill keys 1-3 and an ultimate | Have | Realm-gated |
| Projectile looks (orb, crescent, arrow, fireball, lightning, shuriken) | Added | Move key `shape=`; drawn unlit and additive (`projectileView.ts`) |
| Scroll arts bought from a teacher (Sword Qi, Thunder Lance, Flame Palm) on keys 5-7 | Added | Instructor Hua |
| Healing pill on a key | Added | Z |
| Qinggong air jumps | Added | One at Foundation, two at Golden Core |
| Hit flash, hit-stop, shake, knockback | Have | |
| Status effects on enemies (burn) | Have | Only burn; no poison, freeze, bleed, stun-by-element |
| Status effects on the player | Added | Needs enemy attacks that apply them (poison darts, curses) |
| Weapon types and stances (sword, spear, fist, staff) with their own move lists | Added | Move lists swap per weapon; needs an equip hook and clips for each |
| Bows and thrown weapons | Added | Projectile path exists; needs an aim mode and a draw animation |
| Aerial combos, wall runs, grapple | Added | Needs clips and controller states |
| Enemy telegraphs (a glow before an unblockable) and boss phases | Added | Per-move telegraph VFX and a phase script |
| Counter and deflect projectiles | Added | Needs a parry window that reverses a Projectile |
| Group tactics (flanking, calling for help) | Added | AI work |
| Mounted combat, companions and summons | Added | `melee.follow` exists for allies; no pets or horses yet |

## Cultivation

| Feature | State | Notes |
| --- | --- | --- |
| Realms, stages, tribulation, breakthrough with risk | Have | |
| Meditation, spirit veins | Have | |
| Perk tree bought with insight | Have | K |
| Alchemy: herbs to pills and elixirs | Added | Furnace in the sect, 16 herbs in the valley |
| Progress saved at shrines and altars | Added | `save.set` |
| Meridians or a dantian screen with real choices | Added | A second tree and a UI for it |
| Elements and affinities (fire, lightning, wind) tied to arts | Added | Arts exist; no affinity system |
| Formations, talismans, spirit beasts | Added | |
| Sect rank, contribution points, a mission board | Added | Needs a board widget and rotating missions |
| Companions and dual cultivation | Partly | Companions (Lan, the fox) done; dual cultivation not built |

## World

| Feature | State | Notes |
| --- | --- | --- |
| Valley, sect, camp, shrine, village, peaks, road | Have | |
| Buildings that make sense: tents, farmhouses, a watchtower, a hut, a shrine, a cart, a stall | Added | New kit pieces; the old versions were boxes and roofs stacked with no walls |
| Day and night | Added | A day lasts twelve minutes |
| Weather | Added | Short rain, fog |
| Water: a river, a lake, fishing | Added | Needs a water surface (engine has none for a scene yet) |
| Caves and interiors (the hall, a cellar, a cave) | Added | Needs enterable interiors or a loading hop |
| Fast travel between shrines | Added | The map and shrines exist; a travel list is not wired |
| Hunting and mining | Added | Resource nodes and animal AI |
| More regions and a dungeon (a secret realm) | Added | Content |
| Ambient NPCs with routines | Added | Walkers, farmers, sect disciples sparring |
| Destructible props | Added | |

## Quests and story

| Feature | State | Notes |
| --- | --- | --- |
| Main goals, a side quest, tracked objectives | Have | |
| Branching dialogue | Have, basic | Three choices a node |
| Bounty board and repeatable missions | Added | |
| Reputation and factions | Added | |
| Cutscenes and a proper intro | Added | Camera paths and letterboxing |
| Codex and lore pages | Added | A book widget |

## Economy and items

| Feature | State | Notes |
| --- | --- | --- |
| Silver, a shop, drops | Have | |
| Selling items and a buy-back list | Added | Shop is dialogue-driven; a shop grid would be better |
| Item rarity tiers and stats | Added | Gear has three slots, no tiers |
| Forging and upgrading gear | Added | Needs a crafting panel |
| Containers and loot tables | Have | |
| Weight limit | Have | Inventory component |

## UI (compared with the reference sheets)

| Feature | State | Notes |
| --- | --- | --- |
| Fighter bars, qi bar, skill bar, status pills, target frame | Have | |
| Compass, minimap, quest marker, damage numbers, boss bar | Have | |
| Full map with its own legend | Have | M |
| Skill tree | Have | K |
| Icon inventory with detail | Have, partly | Icons by item name; no detail pane or drag-and-drop |
| Consumable quick slots | Added | Keys exist; no on-screen row of items with counts |
| Shop and crafting windows | Added | Done as dialogue |
| Tutorial hints and a first-time guide | Added | A Hint widget exists but is unused |
| Gamepad button prompts | Added | Keyboard labels only |
| Achievements, codex, journal tabs | Added | |
| Accessibility: text size, colour-blind markers, subtitles | Added | |

## Systems and tech

| Feature | State | Notes |
| --- | --- | --- |
| Frame governor, static batching | Have | 60 fps is the target; unmeasured on a GPU |
| Save and load | Added | One slot, in `save.set` |
| Settings and key list | Have | Esc |
| Music and ambience by place and danger | Have | Synthesized; no recorded score |
| Localisation | Gap | Strings are in the scripts |
| Multiple characters or a character creator | Gap | One body, tinted gear |
| Better NPC bodies and clothing (robes, hair, faces) | Gap | The mannequin plus gear parts looks thin; needs a robed character model |
