-- A wild animal in the garden. The page tells it which creature it is ("eden_who": the id the minds know it by); if you kill it, the page is
-- told so the people's world loses it too, and you get meat for it.
local who = nil

function on_message(name, value)
  if name == "eden_who" and type(value) == "string" then who = value end
end

function on_death(attacker)
  if who then host.send("eden_slain", who) end
  world.destroy(self.id)
end
