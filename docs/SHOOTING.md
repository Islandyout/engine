# Third-person shooting (0.87.0; loot and melee slots 0.88.0)

A Player with a `ThirdPerson` CharacterController and `Weapons` plays like a modern third-person shooter: the camera sits over the shoulder, the character holds the current gun in both hands, the crosshair is in the middle of the screen, and shots land where it points. Try it with the **Combat range** template (New → Combat range).

## Controls

| Action | Mouse and keyboard | Gamepad | Touch |
|---|---|---|---|
| Look | mouse (click the view to capture it; Esc releases) | right stick | drag on the right half |
| Aim | right button | left trigger | Aim button |
| Fire | left button | right trigger | Fire button |
| Reload | R | right shoulder | Reload button |
| Switch weapon (guns and melee) | 1–9, Q, wheel | d-pad up | — |
| Pick up, open | E (hold E for a crate with a hold time) | Y | E key |
| Swap shoulder | V | d-pad left | — |
| Run | Shift | left shoulder | Sprint button |

The bindings are the default `InputActions` (fire, aim, reload, next_weapon); a game can rebind them.

## What you see

- **The camera** is beside and behind the head, so the character never covers the crosshair. Aiming pulls it in and narrows the view by the weapon's `zoom`. It stays in front of walls behind or beside the character. V swaps it to the other shoulder.
- **The body** faces where you aim while the gun is raised (aiming, or for a moment after a shot), and walks the way it is going otherwise. The spine turns toward the aim, so the chest follows the gun.
- **The gun** is in the hands:
  - a long gun has its stock in the shoulder pocket and the support hand on its foregrip or handguard;
  - a pistol or revolver is held at arm's length in front of the eyes, the other hand cupping the grip;
  - at the ready it points low ahead of the body; sprinting carries it across the chest (a pistol drops to the side).
  - A reload tips the gun and takes the support hand to the magazine; each shot kicks the muzzle up.
- **The crosshair, ammo and health** are UI kit widgets ([UI_KIT.md](UI_KIT.md)), in Modern unless the scene has its own widgets.
  - The crosshair's gap follows the real spread.
  - It shows hit markers (red for a kill) and turns red over a hostile.

## How a gun is held

Each imported gun carries its own sockets, the way engines attach weapons: `tools/models/import_weapons.mjs` bakes it at real size with the origin at the firing grip and two child nodes, `offhand` and `muzzle`, found from the gun's shape (`tools/models/gun_points.mjs`).

`apps/editor/src/editor/gunHold.ts` poses the character every frame, after its animation:

1. the spine turns toward the aim;
2. the gun is placed (shoulder pocket, arm's length, ready or sprint);
3. two-bone IK puts the firing hand on the grip;
4. the gun is then attached to wherever that hand ended up, so it never floats;
5. IK puts the support hand on the `offhand` socket.

It works on the mannequin rig (`upperarm_r`, `hand_r`...) and on the pedestrians' (`UpperArm.R`, `Wrist.R`...), so soldiers and people with `Weapons` hold their guns too. A soldier raises its gun in combat.

A loadout line names the gun with `held=` (any kit/weapons gun: `pistol-1`...`pistol-6`, `revolver-1`...`5`, `smg-1`...`5`, `rifle-1`...`5`, `carbine-1`...`4`, `bullpup-1`...`3`, `shotgun-1`...`4`, `shotgun-sawed-off`, `shotgun-short-stock`, `sniper-1`...`6`). Without one, the `model=` picks a default (rifle-2, pistol-1, shotgun-1, smg-2, sniper-1). A `held=` that isn't a gun in the kit is reported in the console and nothing is drawn.

## Shots from the muzzle to the crosshair

The camera is off to the side, so a shot fired straight from the camera's ray would leave from the wrong place, and one fired along the body's facing would miss what the crosshair is on. Instead, each frame the editor sends the crosshair ray and the muzzle (`editor_set_aim`). The weapons system traces the ray to find what the crosshair is on, then fires from the muzzle to that point. If a wall stands between the body and the muzzle, it fires from the eyes instead.

## Aim assist

`engine::gameplay::aim_assist` (`include/engine/gameplay/aim_assist.hpp`, native tests in `tests/aim_assist_tests.cpp`) gives three kinds of help:

- **slowdown**: looking turns slower while the crosshair is near a hostile;
- **pull**: while you turn or move, the view drifts toward the hostile nearest the crosshair (never while the stick is still);
- **snap**: pressing aim brings the view most of the way onto a hostile near the crosshair.

| Device | Help |
|---|---|
| Gamepad, touch | slowdown, pull and snap |
| Mouse | a lighter slowdown only |

Only hostile targets count: a soldier or fighter on another team than the Player's. They must also be in line of sight from the camera and within `assistRange`. A bystander with Health is never a target. The help reaches a few degrees past the target's body, scaled by `aimAssist`.

| Weapons field | Default | Meaning |
|---|---|---|
| `aimAssist` | 0.6 | 0 off .. 1 full |
| `assistRange` | 60 | metres |

Players can turn it off: Settings → Controls → **Aim assist**. With it off the crosshair still turns red over a hostile.

## A gun and a blade (dagger and pistol)

A Player with both `Melee` and `Weapons` is a fighter with a gun in the free hand. For example, `Melee.leftHand` is the dagger and `Weapons` is a pistol.

- **Unaimed**, the fire button strikes (it shares the left mouse button with light) and the gun stays quiet.
- **Aim** raises the gun one-handed, turns the fighter to the aim, and makes the fire button shoot. While aimed, no strike, heavy or block goes off on the buttons they share with aim.

## Guns and melee in one loadout (0.88.0)

`Weapons.loadout` holds up to nine slots, one per number key. A slot can be a melee weapon:

```text
pistol: model=pistol held=pistol-1 mag=12 reserve=-1
rifle:  model=rifle held=carbine-2 mode=auto rpm=700 mag=30 reserve=120
blade:  melee=sword
fists:  melee=fists
hybrid: model=pistol held=revolver-1 offhand=dagger
```

- **`melee=<name>`** makes a slot a melee weapon, from `kit/weapons` (sword, sword-2, sword-golden, claymore, sword-big, dagger, knife, spear, scythe, axe, axe-small, axe-double, hammer-small, hammer-double, bow, bow-golden, bow-evil) or `fists`.
  - A melee slot never fires or reloads; the Player fights with it.
  - A Player gets a `Melee` fighter automatically when its loadout has a melee slot.
  - The moveset follows the blade: martial arts for fists, a dagger or a knife, the sword set otherwise.
- **`offhand=<name>`** on a gun is the dagger-and-pistol fighter below: unaimed the fire button strikes, aimed it shoots.
- **A plain gun slot** in a loadout with melee slots just shoots.
- **Switching**: 1–9, Q, the mouse wheel or d-pad up go through guns and blades alike. The UI kit's Hotbar and Weapon wheel switch on a click.

## Loot: pickups, enemy drops and crates (0.88.0)

There are three components, all using one line format, the **loot line**:

```text
<chance 0..1> weapon <loadout line>     # 1 weapon smg: model=smg held=smg-3 rarity=Rare
<chance> ammo <rounds>                  # 0.5 ammo 30
<chance> health <points>                # 0.25 health 25
<chance> item <name> [count]            # 0.1 item Coin 5   ·   1 item Range Key
```

- Add `rarity=Common|Uncommon|Rare|Epic|Legendary` anywhere on a line; `#` starts a comment.
- Every line of a table rolls on its own, so a table can drop several things, or nothing. A chance of 1 always drops.

| Component | What it is | Fields |
| --- | --- | --- |
| **Pickup** | Loot lying in the world, turning over a ring under a beam of its rarity colour. | `kind` (Weapon, Ammo, Health, Item), `weapon` (a loadout line), `item`, `amount`, `rarity`, `press` (needs E; weapons always do), `respawn` (seconds, 0 = once) |
| **LootDrop** | What an enemy drops when it dies. | `dropWeapon` (its current gun, as a pickup), `table` (loot lines) |
| **Container** | A crate or chest. | `table`, `hold` (seconds to hold E, 0 = a press), `key` (an item name it needs and uses up) |

**Picking up**:

- Ammo, health and items are taken by walking over them.
- A weapon (or anything with `press`) shows the interact prompt and a loot card (damage, fire rate, magazine); E takes it.
- A weapon joins the loadout as the next slot. With nine slots full, it replaces the one in hand, which drops.
- Ammo goes to the gun in hand (or the first gun when a blade is out).
- Items count up in the Player's inventory, which scripts read with `world.items`, `world.give_item` and `world.take_item`.

**Opening**:

- A container shows "Open" with a ring that fills while E is held.
- A locked one says what it needs ("Needs Range Key").
- Opened, its lid swings back (a model with a `lid`/`top` node), or it breaks apart, and its table spills out as pickups.

**Example**: the Combat range has a supply crate, a chest locked until you carry the Range Key, pickups, and targets that drop ammo, health and coins.

## Melee loadouts and their blocks

| Loadout | Guard | Block |
|---|---|---|
| Bare hands | boxing guard | knife-hand block (forearm up) |
| Dagger | boxing guard, blade along the forearm | the same forearm block, blade out |
| Sword | sword guard | sword block |
| Sword and shield | sword guard | shield raised (the UAL shield guard) |

A block raised just as a blow lands is a parry (see [COMBAT.md](COMBAT.md)).

## The Combat range template

- **Three lanes** of hostile targets (soldiers that hold still until shot), with cover and a backstop.
- **Two staff members** on the pedestrian rig, holding a carbine and a revolver.
- **A wall of all forty guns.**
- **A sparring ring** where sword and shield, sword, dagger and bare-hands fighters fight each other.

- **The loot corner**, left of the firing line: a supply crate (hold E), the Armory Chest that needs the Range Key, a shotgun, ammo and a medkit. Targets drop ammo, health and coins.
- **UI kit widgets** in the Modern style: minimap, compass, kill feed, damage numbers, hotbar and a pause menu.

The Player has a pistol, SMG, rifle, shotgun and sniper rifle.

`tests/browser/combat_range.cjs` plays it with a scripted gamepad:

- both hands reach every gun, for the player and the staff;
- aiming pulls the camera in, and the assist snaps onto a target;
- shots through the crosshair hit and kill;
- every loadout gun is held;
- the shoulder swaps;
- a dagger-and-pistol fighter shoots only when aimed;
- with the setting off, there is no assist.

`tests/browser/loot_ui.cjs` covers the rest:

- picking a gun up with E, into slot 6;
- the hotbar switching weapons;
- the pause menu;
- holding E to open the crate;
- the locked chest;
- the UI templates picker.

## Limits

- Strafing plays the walk and run clips with the body turned to the aim; there are no sideways or backward walk clips for the gun yet.
- AI fighters don't use guns; the gun-and-blade fighter is the Player only.
- Aim assist works on the third-person shooter; first-person aim isn't assisted yet.
- In first person, guns are still the procedural viewmodels.
