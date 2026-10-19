# Engine upgrade: design decisions

Status: draft, decisions confirmed by the project owner on 2026-10-19. One upgrade branch, delivered as one PR.

## Principles

1. **The human editor comes first.** Claude must be able to drive it, but every feature is designed for a person using the Inspector, Hierarchy and UI templates.
2. **Components own data and behaviour. UI-kit widgets own every pixel.** No component draws a HUD, a prompt or a hint.
3. **Nothing implicit.** If no widget exists, nothing is drawn. Templates, and an explicit "Add HUD..." action, insert widgets as visible, editable entities in the Hierarchy.
4. **Modular.** A feature built on top of another reads the other's data; it never replaces the other's UI.
5. **Fail loudly.** A scene that needs something it doesn't have says what and why (Problems panel).

## Decisions

| Topic | Decision |
| --- | --- |
| HUD ownership | Only UI-kit widgets draw HUD. Health, Weapons, Melee, Pickup, Vehicle, Spaceship expose data only. |
| Real widgets to add (new or promoted) | Fighter bars (Health, Mana, Energy, Guard, Combo, Lock-on marker); World health bar (any entity with Health); Vehicle and flight instruments (Speedometer, Nitro, Altitude, Fuel, Hull); Hint (replaces hard-coded "Click to aim", controls text). |
| Default rule | No implicit drawing at all. Remove `drawDefaultWidget` and the automatic fighter, gun, loot, health-bar and hint drawing in `main.ts` and `combatView.ts`. |
| Pickup and UI | A pickup may trigger UI relative to the item, chosen by the author per item or per rule; it never replaces an existing widget. |
| Inventory | New `Inventory` component: slots (guns, melee, items), what is equipped. `Weapons` and `Melee` keep combat tuning only. Pickups add to `Inventory`. |
| Equipping | One equipped item. Equipping shows the model in the right hand/mode immediately; model, animation set and HUD follow the equipped item. |
| Games | GATEBREAKER and VELOCITY removed (F89). City Template stays as the living-worlds example. |
| Delivery | One upgrade branch, one PR. |

## Known inconsistencies to fix (audit, so far)

- `main.ts` draws the gun Crosshair/Ammo/Health and the loot prompt/feed/card when the scene has no matching widget (`drawDefaultWidget`).
- `combatView.drawHud` always draws HP/MANA/ULTIMATE/GUARD bars for a Player fighter.
- Enemy health bars float automatically for every entity with `Health`.
- Hard-coded "Click to aim with the mouse" and controls text.
- Picking up a gun changes the HUD to the gun HUD.
- A melee weapon picked up while the Melee slot is selected is not shown until the weapon slot is selected (hand attachment is decided at build time in `main.ts`, from `Melee.rightHand/leftHand` and from `Weapons` slots by separate paths).
- Two sources of truth for what is in the hands: `Melee.rightHand/leftHand` and `Weapons` slots.
- `main.ts` is about 6,900 lines holding rendering, HUD, input and component wiring.

## Open questions

Tracked with the project owner; this file is updated as they are answered.
