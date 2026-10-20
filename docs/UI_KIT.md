# The UI kit

Ready-made game UI. There are 35 widgets in six styles, so a game doesn't start from plain text.

- **What a widget is**: a `UI` component with `kind: "Widget"`, a `widget` name and a `style`.
- **The code**: `apps/editor/src/editor/uiKit.ts`.
- **Adding one**: **Project › UI templates…** in the editor. Each widget is previewed in all six styles.
  - A click on a preview adds that widget in that style.
  - **Whole group** adds every widget of a group in one style.

## Styles

| Style | After | Look |
| --- | --- | --- |
| Modern | Apex Legends, Valorant | slanted dark plates, white bars, a red accent |
| Battle Royale | Fortnite | heavy italic type with a dark outline, blue bubbles, green health, blue shield |
| Tactical | The Division, Call of Duty | thin lines, corner brackets, an orange accent, segmented bars |
| Fantasy | Elden Ring, Zelda | serif type, gold rules and diamonds, red / blue / green bars |
| Sci-fi | Destiny, Halo | cut corners, a cyan glow, wide-set type |
| Minimal | Journey, Inside | white type with soft shadows, almost no chrome |

## Widgets

The "References" column names games whose version of the widget this one follows. Six or more references are listed per system, as the brief asked.

### Combat HUD

| Widget | What it shows | References |
| --- | --- | --- |
| Health | Health (with a damage trail), shield, stamina | Apex Legends (shield over health), Fortnite (number + bars), Valorant, The Division 2 (armour segments), Elden Ring (HP/FP/stamina stack), Halo (shield) |
| Ammo | Magazine / reserve, a pip per round, reload progress | Apex Legends, Call of Duty, Fortnite, Destiny 2, Halo Infinite, Valorant |
| Crosshair | A gap that follows the spread, red over an enemy, hit and kill markers | Call of Duty, Fortnite, Apex Legends, Valorant, Destiny 2, Halo |
| Damage numbers | Numbers that pop off a hit; critical hits are bigger | Borderlands, Destiny 2, Fortnite, The Division 2, Diablo IV, Warframe |
| Kill feed | Killer, a skull, the victim | Apex Legends, Valorant, Call of Duty, Battlefield, Counter-Strike, Overwatch |
| Boss bar | Name, health with a trail, stagger | Elden Ring, Dark Souls, Monster Hunter, God of War, Sekiro (posture), Destiny 2 |

### Navigation

| Widget | What it shows | References |
| --- | --- | --- |
| Minimap | A map that turns with you: enemies, loot, waypoints | GTA V, Call of Duty, Apex Legends, Fortnite, The Division 2, Halo (motion tracker) |
| Compass | A heading strip with waypoint bearings and distances | Skyrim, Breath of the Wild, Apex Legends, PUBG, Far Cry, Battlefield |
| Objective | The current goal, a detail line, progress | Assassin's Creed, The Division 2, Destiny 2, Horizon, God of War, Fortnite (quests) |
| Waypoints | Markers in the world with distance, held at the screen edge when off screen | Apex Legends (ping), Destiny 2, Mass Effect, Halo, The Division 2, Fortnite |

### Interaction & loot

| Widget | What it shows | References |
| --- | --- | --- |
| Interact prompt | A key cap, the verb and the name; a ring while holding; "Needs Key" when locked | Fortnite, Apex Legends, The Last of Us, Resident Evil, Zelda, Destiny 2 |
| Pickup feed | What you just picked up, in its rarity colour | Fortnite, Apex Legends, Borderlands, Destiny 2, Diablo, The Division 2 |
| Loot card | A weapon on the ground: rarity, damage, fire rate, magazine | Borderlands, Fortnite, Apex Legends, Destiny 2, The Division 2, Diablo IV |
| Inventory | A grid of weapons and items with counts | Diablo, Resident Evil 4, Fortnite, The Division 2, Breath of the Wild, Minecraft |
| Hotbar | Weapon slots 1–9, the current one lit; click to switch | Fortnite, Minecraft, Valheim, Rust, Apex Legends (two slots), Call of Duty |
| Weapon wheel | A radial picker | GTA V, Red Dead Redemption 2, DOOM Eternal, Ratchet & Clank, Apex Legends (ping and inventory wheels), Horizon |

### Menus & dialogue

| Widget | What it shows | References |
| --- | --- | --- |
| Pause menu | Resume, Restart, Settings, Quit | Call of Duty, Apex Legends, Elden Ring, Destiny 2, Fortnite, Halo |
| Main menu | A title, Play, Settings, Quit | Elden Ring, Destiny 2, Halo Infinite, Hades, Valorant, Celeste |
| Settings | Volume, look sensitivity, invert look, aim assist, camera shake | Fortnite, Apex Legends, Call of Duty, The Last of Us Part II (accessibility), Valorant, Destiny 2 |
| Dialogue | A speaker nameplate, a typed-out line, choices | Mass Effect, The Witcher 3, Persona 5, Hades, Disco Elysium, Zelda |
| Notification | A banner that slides in when its text changes | Elden Ring (area names), Destiny 2, Fortnite, Xbox achievements, Assassin's Creed, Halo |

### Action RPG widgets (0.94.0)

Eight widgets for games with abilities, status and a journal. Most are **script-fed**: a script sets the widget's text (and value) with `ui.set_text(name, text)` and `ui.set_value(name, 0..1)`, where `name` is the widget entity's name. A widget with empty text draws nothing.

| Widget | What it shows | Text format | References |
| --- | --- | --- | --- |
| Skill bar | Keyed ability slots: lit when ready, a cooldown sweep, red when short of mana, a lock when locked. The keys written on the slots are the scene's `skill1`..`skill3` and `ultimate` bindings. | none (the Player's fighter data) | Genshin Impact, Ghost of Tsushima, Elden Ring |
| Resource bar | A labelled bar: qi, focus, rage, stamina | `Label`, then `readout`, then an optional `#rrggbb`; value 0..1 | Sekiro (posture), Hades (magick), Genshin (energy) |
| Status effects | Buff and debuff pills with timers, listed top down | one `Name\|seconds\|good or bad\|total` a line | Elden Ring, Monster Hunter, Diablo |
| Target frame | The enemy you face: name, a subtitle, health with a damage trail, poise | `Name`, `Subtitle`, `poise 0..1`; value: health | Sekiro, Dark Souls, The Witcher 3 |
| Damage direction | An arc towards what just hit you, fading in a second | the bearing in degrees: 0 ahead, 90 on your right | Call of Duty, Ghost of Tsushima |
| Death screen | A vignette, a title, a line and a button; the button sends `on_ui("<name>", "respawn")` | `Title`, `Line`, `Button label` | Dark Souls (YOU DIED), Hades |
| Character sheet | Stats and progress bars; X sends `on_ui("<name>", "close")` | `Title`, `Subtitle`, then `# Section`, `Label\|Value` or `bar\|Label\|0..1\|readout` lines | Skyrim, The Witcher 3, Diablo |
| Quest log | The journal: the active goal highlighted, finished ones ticked | `Title`, then `state\|Title\|Detail` (state `active`, `done` or `todo`) | The Witcher 3, Skyrim, Genshin |
| Skill tree | Passive perks linked by what they need; learned, available (click to learn) and locked | `Title`, a subtitle, then `node\|id\|Name\|state\|col\|row\|requires\|cost\|icon\|Detail` lines (state `learned`, `available` or `locked`); a click sends `node:<id>` | Path of Exile, Skyrim, Elden Ring |

- Give the sheets `visibleWhen: toggle` and a `toggleKey` (`KeyC`, `KeyJ`) so a key opens them.
- `on_ui("objective", "start:<id>")` and `"complete:<id>"` tell a script what the Objectives did, so a quest log can mirror them.
- With a Skill bar in the scene the combat view no longer draws its own skill slots; a scene with Fighter bars and no Skill bar keeps them.
- A button inside a widget sends `event:<name>` and the script hears `on_ui(<widget name>, <name>)`.
- `melee.revive()` brings the Player back after a death. The Player now stays down until a script revives it (everyone else is still removed after a few seconds).

## What the research says (and how the kit follows it)

- **Minimap placement**: fast games put it on the left, where it gets more attention; round maps suit a compass metaphor ([Game Developer](https://www.gamedeveloper.com/disciplines/-where-should-we-place-the-mini-map-)).
  - The kit's minimap is top left.
  - The Fantasy, Sci-fi and Minimal styles have round maps.
- **The compass carries the waypoints**, kept legible and uncluttered.
  - Waypoints fade toward the strip's ends.
  - Only `ui.marker` waypoints are shown.
- **Weapon wheel**: equal distance to every option. Hold to open on a pad; in many games the world pauses or slows while it is open ([UX Collective](https://uxdesign.cc/the-evolution-of-accessibility-weapons-wheel-f8fed0fed78e), [300Mind](https://300mind.studio/blog/radial-menus-in-game-design/), [UX Collective on Apex Legends](https://uxdesign.cc/the-power-of-the-radial-menu-a-love-letter-to-apex-legends-from-a-ux-designer-and-perpetual-noob-1bec9b05e805)).
  - The kit's wheel shows in Pause by default (the world stops).
  - To open it during play instead: set its `visibleWhen` to `play` and call `ui.set_visible` from a script, for example while a key is held.
- **Health and shield bars**: Fortnite's own tools treat them as separate bars that can sit on a nameplate or in the HUD, designed per game ([Epic, UEFN](https://dev.epicgames.com/documentation/en-us/uefn/making-custom-health-and-shield-bars-in-unreal-editor-for-fortnite)).
- **Rarity colours**: popularised by Diablo, now a common code: grey, green, blue, purple, gold ([Indie Klem on WoW's UI](https://indieklem.substack.com/p/12-what-you-can-learn-from-the-ui)). Ground loot gets a beam in its colour ([GWToolbox loot beacons](https://www.gwtoolbox.com/docs/loot_beacons/)).
- **A HUD that comes and goes only as needed** (Elden Ring) is liked for the room it gives. Destiny 2's HUD, in an eye-tracking study, was preferred because it teaches its systems in context ([Forge Press](https://forgepress.org/four-lessons-open-world-games-need-to-learn-from-elden-ring/), [SIGDOC 2020](https://sigdoc.acm.org/conference/2020/wp-json/wp/v2/posts/420)).
  - The kit's widgets draw nothing when they have nothing to say: no prompt without a target, no boss bar without a boss.
- **Dialogue text** should follow the subtitle guidance:
  - name the speaker;
  - write in mixed case;
  - use a backing plate;
  - keep lines short;
  - put readability before art direction.

  Sources: [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/?p=111), [Xbox Accessibility Guideline 104](https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/104), [Game Developer on subtitles](https://www.gamedeveloper.com/audio/how-to-do-subtitles-well-basics-and-good-practices).

  In the kit, every style keeps dialogue in mixed case on a plate, with a nameplate.

## Using a widget

| Field | Use |
| --- | --- |
| `widget`, `style` | which one, and how it looks |
| `anchor`, `offsetX/Y` | where (each widget's catalog place is the default) |
| `width`, `height` | 0 uses the widget's size times `fontSize / 16` |
| `fontSize` | scales the whole widget (16 = 1×) |
| `visibleWhen` | `always` (shows sample data while editing), `play`, or `pause` |
| `text` | the authored content for Objective (title, then detail), Boss bar (a name), Main and Pause menu (a title), Dialogue (`Speaker: line`, then `> choice` lines) and Notification (title, then body). Scripts change it with `ui.set_text`. |
| `value` | Objective progress, a Boss bar's health while editing |

The rest is live from the game:

- the Player's health, gun, loadout and items (`world.items`);
- the camera's heading;
- `ui.marker` waypoints;
- enemies (AI soldiers and fighters on another team);
- loot and the interact target;
- hits and kills;
- a GATEBREAKER boss.

### Clicks

| Widget | What a click does |
| --- | --- |
| Pause menu | Resume, Restart, Settings (the player settings) and Quit |
| Main menu | **Play** hides the menu and sends `on_ui(name, "play")` |
| Hotbar, Inventory and Weapon wheel | switch weapon |
| Settings | the sliders and toggles change the player's settings (saved, as in the settings panel) |
| Dialogue | a choice sends `on_ui(name, "choice:N")`; a line without choices sends `"next"` |

### Nothing is drawn by itself (0.89)

Only widgets draw HUD. A component never draws one: `Health`, `Weapons`, `Melee`, `Pickup`, `Vehicle` and `Spaceship` expose data, and the widgets show it. No widget, no HUD.

- **Templates and Recipes add the widgets as entities.** They appear in the Hierarchy (named `HUD <widget>`), so you can restyle, move or delete them.
- **Older scenes migrate on load.** The widgets the old implicit HUD used to draw are added once, in the scene's style, and the log says which. Widgets you already have are never replaced or duplicated.
- **Fighter bars** (health, mana, energy, guard), **World health bar** (floating bars over entities with Health), **Hint** (help text while the mouse is free), **Vehicle instruments** and **Flight instruments** are widgets like the others. The last three are switches for views the game draws itself (one per scene is enough), shown as placeholders while editing.
- **`source`** says whose data a widget shows: empty is the Player, an entity name, or `@target` (whatever is under the crosshair). Health and Fighter bars use it.
- **A pickup chooses its own UI.** `Pickup.onPickup` takes one `<UI entity name>: <text> | <seconds>` per line; `{name}` and `{amount}` are filled in. The named element is shown with that text (for the seconds, if given). Nothing is added or replaced.

## Wiring a UI element without a script (0.91.0)

Every UI element has **When clicked**, **Visible in** and **Key that shows/hides it** in the Inspector. Scripts are optional.

### When clicked

One action per line (or several separated by `;`). A line can start with `<event> ->` to answer only that event; no prefix answers every event. `#` starts a comment.

| Action | Does |
| --- | --- |
| `show NAME`, `hide NAME`, `toggle NAME` | open or close another UI element (a "toggle" screen, or any element) |
| `pause`, `resume`, `restart`, `quit`, `settings` | the game and player settings |
| `give ITEM [n]`, `take ITEM [n]` | add to / remove from the Player's items (the Inventory's limits apply) |
| `equip SLOT ITEM`, `unequip SLOT` | wear / take off (head, body, hands) |
| `select N` | draw weapon slot N |
| `objective start ID`, `objective complete ID` | drive the Objectives |
| `text NAME: TEXT` | change another element's text |
| `script VALUE` | call `on_ui(name, "VALUE")` in every script |

Events: a Button sends `click`; the Main menu `play`; the Pause menu `resume`, `restart`, `quit`, `settings`; Dialogue `choice:N` and `next`; Hotbar / Weapon wheel / Inventory `slot:N`; the Inventory also `equip:<slot>:<item>` and `unequip:<slot>`. A trailing `*` matches a prefix (`choice:*`).

```text
play -> hide Main menu; objective start find-key
choice:0 -> give Key
click -> toggle Bag
```

A new element's **Button action** is `none`: only its When-clicked lines run. The Inspector lists the events an element sends, and **Add script hook** writes an `on_ui` stub for it if you do want a script.

### Screens that open with a key

Set **Visible in** to `toggle` and **Key** to a key code (`KeyI`, `Tab`, `KeyO`). The element is hidden in Play until the key (or `show`, or `ui.open("Name")` from a script) opens it, and the mouse is released while a screen is open. In the editor it is drawn so you can lay it out. Recipes > `Screen: Inventory`, `Screen: Settings` and `Screen: Main menu` set this up.

### Objectives

An **Objectives** component (Recipes > `Objectives`) holds one objective per line:

```text
id | Title | Detail | goal | on complete
```

| Goal | Done when |
| --- | --- |
| `collect ITEM n` | the Player carries n of ITEM |
| `kill NAME n` / `kill any n` | n entities (whose name starts with NAME) are defeated |
| `reach ENTITY [metres]` | the Player is within the distance (default 3) of the named entity |
| `interact ENTITY` | the Player picks up or opens the named entity |
| `script` | a script calls `objective.complete(id)` or `objective.progress(id, n)` |

The first line starts with Play; finishing one runs its **on complete** actions (the same language as When clicked) and starts the next line, unless an action already started another. The **Objective** widget shows the running objective's title, detail and progress. Scripts hear `on_ui("objective", "start:<id>")` and `"complete:<id>"`, and can drive it with `objective.start / complete / progress`.

### Worn items do something

`Inventory.stats` gives items effects, one per line:

```text
Helmet: slot=head armor=30
Gloves: slot=hands damage=15
Boots: slot=body speed=10
Charm: health=25
```

`armor` is % less damage taken (up to 90), `damage` % more damage dealt (guns and melee), `speed` % faster (negative slows), `health` more maximum health. `slot=` limits where an item can be worn. The **Inventory** widget shows weight and kinds against the limits, the three worn slots (click to take off) and each item (click a wearable to put it on).
