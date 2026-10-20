-- @prop mode aura
-- Qi effects, one emitter per entity (props.mode): "aura" glows around the Player while
-- gathering or casting, "bolt" is the visible core and trail of a Qi Palm, "burst" flashes
-- where a qi art lands, "burn" keeps a struck fighter alight for a few seconds.

local mode = props.mode or "aura"
local ttl = 0        -- bolt: seconds left in flight
local dx, dz = 0, 0  -- bolt: direction * speed
local owner = nil
local target = nil   -- burn: who is burning
local burn_left = 0

local function park()
  self.y = -200
  particles.set_emitting(false)
end

function on_start()
  owner = world.find("Player")
  park()
end

local function hostile(id)
  local name = world.name(id) or ""
  return name:find("^Bandit") or name:find("^Iron Fist")
end

local function hit_at(x, y, z)
  -- The flash, and a fire on whoever stands in it.
  local burst = world.find("Qi Burst")
  if burst then world.send(burst, "at", string.format("%.2f,%.2f,%.2f", x, y, z)) end
  local burn = world.find("Qi Burn")
  for _, id in ipairs(world.overlap(x, y, z, 1.6)) do
    if hostile(id) and burn then world.send(burn, "burn", tostring(id)) break end
  end
  camera.shake(0.3, 0.2)
  sound.play("metal-hit")
end

function on_message(name, value)
  if mode == "aura" and name == "cast" then
    particles.set_emitting(value == 1)
  elseif mode == "bolt" and name == "fire" then
    local x, y, z, vx, vz = value:match("^([%-%d.]+),([%-%d.]+),([%-%d.]+),([%-%d.]+),([%-%d.]+)$")
    if x then
      self.x, self.y, self.z = tonumber(x), tonumber(y), tonumber(z)
      dx, dz = tonumber(vx), tonumber(vz)
      ttl = 1.6
      particles.set_emitting(true)
    end
  elseif mode == "burst" and name == "at" then
    local x, y, z = value:match("^([%-%d.]+),([%-%d.]+),([%-%d.]+)$")
    if x then
      self.x, self.y, self.z = tonumber(x), tonumber(y), tonumber(z)
      particles.burst(60)
    end
  elseif mode == "burn" and name == "burn" then
    target = tonumber(value)
    burn_left = 4
    particles.set_emitting(true)
  end
end

function on_tick(dt)
  if mode == "aura" and owner and world.alive(owner) then
    local x, y, z = world.position(owner)
    self.x, self.y, self.z = x, y + 0.2, z
  elseif mode == "bolt" and ttl > 0 then
    ttl = ttl - dt
    self.x, self.z = self.x + dx * dt, self.z + dz * dt
    for _, id in ipairs(world.overlap(self.x, self.y, self.z, 0.8)) do
      if hostile(id) then
        hit_at(self.x, self.y, self.z)
        ttl = 0
        break
      end
    end
    if ttl <= 0 then park() end
  elseif mode == "burn" and burn_left > 0 then
    burn_left = burn_left - dt
    if target and world.alive(target) then
      local x, y, z = world.position(target)
      self.x, self.y, self.z = x, y + 0.2, z
    else
      burn_left = 0
    end
    if burn_left <= 0 then park() end
  end
end
