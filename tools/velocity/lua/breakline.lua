-- Breakline (GAME_DESIGN.md 6, "Boss: Breakline"): the director sends the
-- phase as its health crosses 70% and 35%, once each.
--
-- Phase 1: a two-hit chain and a telegraphed shoulder charge.
-- Phase 2: adds the ground-slam ring (red: dodge out or roll through).
-- Phase 3: faster, and after each slam a short impact field soaks damage
--          for three seconds (sparks around it); wait it out, then punish.

local phase = 1
local field_until = -1
local clock = 0
local slamming = false

function on_start()
  particles.set_emitting(false)
end

function on_message(name, value)
  if name == "phase" then
    phase = value
    if phase >= 2 then melee.unlock("ring") end
    if phase >= 3 then melee.tune(-1, 1.15, -1, -1) end
  elseif name == "tune" and type(value) == "string" then
    local d, h = value:match("^([%d.]+),([%d.]+)$")
    if d then melee.tune(tonumber(d), -1, -1, -1, tonumber(h)) end
  end
end

function on_damaged(amount)
  -- The field: what lands while it's up is given back.
  if clock < field_until then world.heal(self.id, amount) end
end

function on_tick(dt)
  clock = clock + dt
  local move = melee.move()
  if move == "ring" then
    slamming = true
  elseif slamming then
    slamming = false
    if phase >= 3 then
      field_until = clock + 3
      particles.set_emitting(true)
    end
  end
  if field_until > 0 and clock >= field_until then
    field_until = -1
    particles.set_emitting(false)
  end
end
