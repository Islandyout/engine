-- LAST SIGNAL enemy: reports headshots and deaths (with a drop position) to
-- the Director, which keeps score and spawns the loot.
local director

local function tell(name, value)
  director = director or world.find("Director")
  if director then world.send(director, name, value) end
end

function on_damaged(amount, attacker, headshot)
  if headshot then tell("headshot", 1) end
end

function on_death(attacker)
  tell("died", self.name)
  tell("drop", string.format("%.2f,%.2f,%.2f", self.x, self.y - 0.6, self.z))
end
