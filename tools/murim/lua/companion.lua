-- @prop kind fox
-- Followers. "fox": a spirit fox that trots after you once adopted and points out herbs; "lan": Disciple Lan, a fighter at
-- your side when asked; "guardian": a spirit warrior called by the Spirit Guardian art, gone after 25 seconds.
local player
local active = false
local home
local clock = 0
local life = 25
local scent_id
local cool = 0

local function me() player = player or world.find("Player") return player end

function on_start()
  home = { self.x, self.y, self.z }
  if props.kind == "guardian" then
    active = true
    after(0.2, function() if me() then melee.follow(me(), 1) end end)
  end
end

function on_message(name, value)
  if name == "adopt" or name == "follow" then
    active = true
    if props.kind == "lan" and me() then melee.follow(me(), 0) end
  elseif name == "dismiss" or name == "wait" then
    active = false
    if props.kind == "lan" then melee.follow() end
    ui.clear_marker("Herb scent")
  elseif name == "spar" and props.kind == "lan" then
    hud.announce("Disciple Lan: A good lesson! Keep your guard higher.")
    if me() then world.send(me(), "qi", 15) end
  end
end

function on_death()
  if props.kind == "lan" then
    after(8, function() melee.revive() if me() then local x, y, z = world.position(me()) world.set_position(self.id, x + 2, y + 1, z) end end)
  end
end

function on_tick(dt)
  if props.kind == "guardian" then
    life = life - dt
    if life <= 0 then world.destroy(self.id) end
    return
  end
  if props.kind == "lan" then return end
  -- The fox.
  if not active or not me() then return end
  local px, _, pz = world.position(me())
  local dx, dz = px - self.x, pz - self.z
  local d = math.sqrt(dx * dx + dz * dz)
  if d > 40 then world.set_position(self.id, px + 2, self.y + 1, pz + 2) return end
  if d > 3.4 then
    local speed = d > 10 and 7.5 or 4.5
    world.set_velocity(self.id, dx / d * speed, self.vy or 0, dz / d * speed)
  else
    world.set_velocity(self.id, 0, self.vy or 0, 0)
  end
  clock = clock + dt
  if clock >= 1.5 then
    clock = 0
    -- It smells herbs: a marker on the nearest one within sixteen metres.
    local best, best_d, bx, by, bz = nil, 16, 0, 0, 0
    for i = 1, 16 do
      local id = world.find("Spirit herb " .. i)
      if id and world.alive(id) then
        local x, y, z = world.position(id)
        local dist = math.sqrt((x - px) ^ 2 + (z - pz) ^ 2)
        if dist < best_d then best, best_d, bx, by, bz = i, dist, x, y, z end
      end
    end
    if best then ui.marker("Herb scent", bx, by + 1.5, bz, "Herb") else ui.clear_marker("Herb scent") end
  end
end
