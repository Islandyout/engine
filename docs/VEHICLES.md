# Vehicles you can get into

A car with a `Vehicle` component (Driving model **Arcade**) can be entered by the Player on foot with **E**, driven with the usual keys, and left with **E** again. No script is needed.

## Setting it up

Recipes > **Vehicle: enterable car** adds a car with a body, a `Collider` and the settings below. By hand: a `Vehicle` with a `RigidBody` and a `Collider`.

| Setting (`Vehicle`) | Meaning |
| --- | --- |
| `enterable` | The Player can get in. On by default; turn it off for scenery cars. |
| `enterRadius` | How many metres beyond the car's edge (and the walker's) E still works. Default 2. |

- A car with a `Driver` (AI) or a `Player` already is never enterable.
- **Needs a Collider.** An enterable car without one fails Play with the car's name and the reason; add the Collider or turn `enterable` off. The Inspector shows the same hint ("Needs RigidBody and Collider").
- The key is the **interact** action (E by default, rebindable). A pickup or crate in reach takes the key first. In a scene with a Star System, E belongs to the spaceship.

## What happens

1. Walking up to the car shows the **Interact prompt** widget: `E: Enter <car name>` (the HUD text mirror says the same).
2. E moves the Player marker to the car. The walker is hidden and rides inside the car as a kinematic trigger; the camera and the HUD follow the car.
3. E again puts the walker beside the car (the side with room is chosen; its collider and body type are restored) and it is drawn again.
4. If both sides are blocked, the Player stays seated and the prompt says **No room to get out**.

## Scripts

| Call | Does |
| --- | --- |
| `vehicle.enter(id)` | seats the Player in that car from anywhere; `false, reason` if it can't (not an Arcade Vehicle, `enterable` off, already driven, the Player is already in a car) |
| `vehicle.exit()` | puts the Player out; `false, reason` if there is no room or it isn't in a car |
| `vehicle.driver(id)` | the id of whoever is in the car, or `nil` |

Scripts hear `on_ui("vehicle", "enter:<car name>")`, `"exit:<car name>"` and `"blocked:<car name>"`:

```lua
function on_ui(name, value)
  if name == "vehicle" and value == "enter:Taxi" then
    ui.set_text("Hint", "Mind the traffic")
  end
end
```
