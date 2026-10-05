# Make your first game in five minutes

This walks through the browser editor from an empty page to something you can play. Everything here also works on the published editor site.

## 1. Start from a template

Press **New** in the toolbar and pick a starting point:

| Template | What you get |
|---|---|
| Third-person starter | A character you walk with WASD, a follow camera you orbit with the mouse, ground, sky and a few crates |
| First-person starter | Mouse-look movement, a gun, and three targets that take damage |
| Racing starter | A car you drive with WASD, a chase camera and a ring of barriers |
| Space starter | A star system with a planet and a moon, a ship on a pad, and a walker |
| Empty scene | Nothing; build it all yourself |

Press **Play** (or the play button) to try it, and **Stop** to come back to editing. Nothing you do while playing changes the scene.

## 2. Change things

- Click something in the viewport or the **Hierarchy** to select it. Drag the arrows to move it; **Rotate** and **Scale** are next to **Move**.
- The **Inspector** on the right shows the selected entity's components. Hover a component's title or a field's name for what it does.
- **Add component** at the bottom of the Inspector gives the entity new abilities: a Light, a Sound, Particles, Health, an AI brain, a Script.
- **Add from catalog** (in the Project panel) places one of the bundled models.

## 3. Make it do something with a script

Add a **Script** component to a crate and type:

```lua
function on_tick(dt)
  local px, _, pz = world.position(world.find("Player"))
  if px and math.abs(px - self.x) < 1.5 and math.abs(pz - self.z) < 1.5 then
    sound.play("Glass Break")
    hud.announce("Found it!")
    world.destroy(self.id)
  end
end
```

Press Play and walk into the crate. **API reference** under the Script field lists every function, with a search box. The full list is also in [SCRIPT_API.md](SCRIPT_API.md).

## 4. Check your work

The **Problems** panel (below the Hierarchy) lists mistakes the game would otherwise ignore: a follow camera aimed at a name nobody has, a Routine stop at hour 25, a model that isn't in the catalog. Click a problem to select the entity. **Check** runs it on demand; Play runs it too and tells you in the console.

## 5. Keep it

- **Save** downloads `scene.json` and keeps a copy in this browser.
- **Games → Save current scene to My games** adds it to your library. To ship it with the engine, put it in `games/my-games/<name>/` with a `game.json` (see [games/README.md](../games/README.md)).

## Where to next

- [COMPONENTS.md](COMPONENTS.md): every component and field.
- [SCRIPT_API.md](SCRIPT_API.md): every script callback and function.
- The bundled games (**Games** in the toolbar) are full examples: Last Signal (first-person), High Heat (racing) and Pale Signal (space exploration).
