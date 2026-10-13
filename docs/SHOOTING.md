# Third-person shooting (0.87.0)

A Player with a `ThirdPerson` CharacterController and `Weapons` plays like a modern third-person shooter: the camera sits over the shoulder, the character holds the current gun in both hands, the crosshair is in the middle of the screen, and shots land where it points. Try it with the **Combat range** template (New → Combat range).

## Controls

| Action | Mouse and keyboard | Gamepad | Touch |
|---|---|---|---|
| Look | mouse (click the view to capture it; Esc releases) | right stick | drag on the right half |
| Aim | right button | left trigger | Aim button |
| Fire | left button | right trigger | Fire button |
| Reload | R | right shoulder | Reload button |
| Switch gun | 1–9, Q, wheel | d-pad up | — |
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
- **The crosshair** is the first-person one: its gap follows the real spread, it shows hit markers (white, yellow for a headshot, red for a kill), and it turns red over a hostile.

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

The Player has a pistol, SMG, rifle, shotgun and sniper rifle.

`tests/browser/combat_range.cjs` plays it with a scripted gamepad:

- both hands reach every gun, for the player and the staff;
- aiming pulls the camera in, and the assist snaps onto a target;
- shots through the crosshair hit and kill;
- every loadout gun is held;
- the shoulder swaps;
- a dagger-and-pistol fighter shoots only when aimed;
- with the setting off, there is no assist.

## Limits

- Strafing plays the walk and run clips with the body turned to the aim; there are no sideways or backward walk clips for the gun yet.
- AI fighters don't use guns; the gun-and-blade fighter is the Player only.
- Aim assist works on the third-person shooter; first-person aim isn't assisted yet.
- In first person, guns are still the procedural viewmodels.
