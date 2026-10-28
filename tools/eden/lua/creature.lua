-- A wild animal in the garden. The page tells it which creature it is ("eden_who": the id the minds know it by); if you kill it, the page is
-- told so the people's world loses it too, and you get meat for it.
local who = nil

function on_message(name, value)
  if name == "eden_who" and type(value) == "string" then
    who = value
    host.send("eden_body", who)
  end
  -- What the page says this body is doing ("graze", "walk@0.8"...): the mind's own picture of the animal, played as its clip.
  if name == "eden_clip" and type(value) == "string" then self.animate = value end
end

function on_death(attacker)
  if who then host.send("eden_slain", who) end
  world.destroy(self.id)
end
