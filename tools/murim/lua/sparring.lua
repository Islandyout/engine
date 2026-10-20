-- @prop gear none
-- A sect disciple at practice: it fights its sparring partner and cannot be hurt; when the Player comes near it stops and
-- stands easy, and carries on once they leave.
local resting = false
local clock = 0

function on_damaged()
  world.heal(self.id, 9999)
end

function on_start()
  if props.gear and props.gear ~= "" and props.gear ~= "none" then world.wear(props.gear) end
end

function on_tick(dt)
  clock = clock + dt
  if clock < 0.5 then return end
  clock = 0
  local player = world.find("Player")
  if not player then return end
  local px, _, pz = world.position(player)
  local near = (px - self.x) ^ 2 + (pz - self.z) ^ 2 < 7 * 7
  if near and not resting then resting = true melee.set_ai(false)
  elseif not near and resting then resting = false melee.set_ai(true) end
end
