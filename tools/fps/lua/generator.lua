-- LAST SIGNAL generator: a destructible objective. Sparks when hit; on death
-- it explodes, leaves a burning wreck and tells the Director.
function on_damaged(amount)
  particles.burst(8)
end

function on_death(attacker)
  sound.play_at("sfx:explosion", self.x, self.y, self.z)
  camera.shake(0.6, 0.8)
  world.spawn("Generator Wreck", self.x, self.y - 0.5, self.z)
  local director = world.find("Director")
  if director then world.send(director, "generator", self.name) end
end
