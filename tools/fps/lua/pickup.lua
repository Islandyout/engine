-- LAST SIGNAL pickup ({{KIND}}): collected by walking over it; despawns
-- after a while so the yard doesn't fill up.
local KIND = "{{KIND}}"
local LIFETIME = 45
local born
local player, director

function on_start()
  born = time.now
end

local function collect()
  if KIND == "ammo" then
    world.give_ammo(player, 60, 1)
    world.give_ammo(player, 6, 3)
    return "+ Ammo"
  elseif KIND == "med" then
    local hp, max = world.health(player)
    if not hp or hp >= max then return nil end
    world.heal(player, 45)
    return "+ Health"
  elseif KIND == "launcher" then
    world.give_ammo(player, 3, 4)
    return "+ Launcher rounds"
  end
end

function on_tick(dt)
  if time.now - born > LIFETIME then
    world.destroy(self.id)
    return
  end
  player = player or world.find("Player")
  if not player or not world.alive(player) then return end
  local x, y, z = world.position(player)
  local dx, dz = x - self.x, z - self.z
  if dx * dx + dz * dz > 1.7 * 1.7 or math.abs(y - self.y) > 2.2 then return end
  local text = collect()
  if not text then return end
  sound.play("coin")
  director = director or world.find("Director")
  if director then world.send(director, "pickup", text) end
  world.destroy(self.id)
end
