-- @prop gear none
-- Elder Mu greets the Player at the sect gate, once.
local spoken = false
function on_tick()
  if spoken then return end
  local player = world.find("Player")
  if not player then return end
  local px, _, pz = world.position(player)
  local dx, dz = px - self.x, pz - self.z
  if dx * dx + dz * dz > 36 then return end
  spoken = true
  start(function()
    hud.announce("Elder Mu: Welcome, disciple. Qi is the river of the martial world.")
    wait(4)
    hud.announce("Elder Mu: Hold M and sit still to gather it. Then press B with a Breakthrough Pill.")
    wait(5)
    hud.announce("Elder Mu: Bandits in the valley have taken the road. Clear them, then face the guardian at the shrine.")
  end)
end

function on_start()
  if props.gear and props.gear ~= "" and props.gear ~= "none" then world.wear(props.gear) end
end
