-- LAST SIGNAL player: difficulty damage scaling, partial health regen
-- (back up to REGEN_CAP after a few seconds out of fire; med kits fill the
-- rest) and damage reports to the Director for its pacing.
local REGEN_CAP, REGEN_DELAY, REGEN_RATE = 60, 4.5, 18
local scale = 1
local last_hit = -100
local director

function on_message(name, value)
  if name == "difficulty" then scale = value end
end

function on_damaged(amount, attacker)
  -- attacker is nil for the scaling damage below (and other script damage).
  if attacker == nil then return end
  last_hit = time.now
  if scale < 1 then
    world.heal(self.id, amount * (1 - scale))
  elseif scale > 1 then
    world.damage(self.id, amount * (scale - 1))
  end
  director = director or world.find("Director")
  if director then world.send(director, "hurt", amount * scale) end
end

function on_tick(dt)
  if time.now - last_hit < REGEN_DELAY then return end
  local hp = world.health(self.id)
  if hp and hp < REGEN_CAP then world.heal(self.id, math.min(REGEN_CAP - hp, REGEN_RATE * dt)) end
end
