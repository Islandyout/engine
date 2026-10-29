-- You, in the garden: a hunter. The Creator watches from above until they choose to walk the world; the page then brings this body in beside
-- whoever they were watching ("Walk the world"), and the keyboard moves it: W A S D, Shift to run, Space to jump, J or the left mouse
-- button for the spear, K for a sweep, F to kick, X to roll, R to guard, G to loose an arrow. Watching again takes it away.

local HUNTER = "383 384 385 386 388 363:#2a2018" -- the kit's ranger outfit (hood, body, arms, legs, boots) and short hair
local ARROW_SPEED, ARROW_DAMAGE, ARROW_DROP, ARROW_GAP = 46, 26, 0.3, 0.9
local shot_cd, hurt_cd = 0, 0

function on_start()
  world.wear(HUNTER)
  hud.announce("You walk the world. W A S D move, J strikes, G looses an arrow.")
end

-- The page tells it who it is, and says which body to follow with the camera.
function on_message(name, value)
  if name == "eden_who" and type(value) == "string" then host.send("eden_body", value) end
end

function on_ui(name, value)
  if name == "eden_player_hurt" then
    local amount = tonumber(value) or 0
    if amount > 0 and hurt_cd <= 0 then
      world.damage(self.id, amount)
      hurt_cd = 0.8
      camera.shake(0.2, 0.2)
    end
  elseif name == "eden_player_heal" then
    local amount = tonumber(value) or 0
    if amount > 0 then world.heal(self.id, amount) end
  end
end

function on_tick(dt)
  hurt_cd = math.max(0, hurt_cd - dt)
  shot_cd = math.max(0, shot_cd - dt)
  if input.action_pressed("bow") and shot_cd <= 0 then
    local fx, fz, fy = camera.forward()
    local len = math.sqrt(fx * fx + fy * fy + fz * fz)
    if len > 0.01 and melee.shoot(fx / len, fy / len, fz / len, ARROW_SPEED, ARROW_DAMAGE, ARROW_DROP) then
      shot_cd = ARROW_GAP
      sound.play("sfx:bow:loose1.00")
    end
  end
end

-- Beaten: back on your feet at the garden, a little the worse.
function on_death()
  hud.announce("You are beaten. You wake in the garden.")
  melee.revive()
  world.set_position(self.id, 0, 4, 0)
end
