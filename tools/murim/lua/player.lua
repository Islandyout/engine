-- @prop realm 1
-- @prop qi 0
-- The cultivator: qi, realms, breakthroughs, qi arts and the flying sword.
-- Hold M to meditate, B to break through (needs a Breakthrough Pill and
-- enough qi), H drinks a Qi Elixir, V rides the flying sword.

local REALMS = {
  { name = "Mortal",       need = 100, damage = 1.0,  speed = 1.0,  crit = 0.05, health = 100, mana = 60,  unlock = "" },
  { name = "Qi Gathering", need = 250, damage = 1.25, speed = 1.05, crit = 0.08, health = 150, mana = 100, unlock = "qi_palm" },
  { name = "Foundation",   need = 500, damage = 1.6,  speed = 1.1,  crit = 0.12, health = 220, mana = 150, unlock = "wind_palm" },
  { name = "Golden Core",  need = 999, damage = 2.1,  speed = 1.18, crit = 0.18, health = 320, mana = 220, unlock = "tiger_rush nine_dragons" },
}
local FLY_REALM = 3          -- Foundation and above can ride the sword
local FLY_SPEED = 13
local FLY_QI = 3             -- qi per second
local MEDITATE_QI = 9        -- qi per second while meditating
local ELIXIR_QI = 60
local CHANNEL = 3            -- seconds a breakthrough takes

local realm = 1
local qi = 0
local flying = false
local channel = 0            -- seconds left of a breakthrough, 0 when not attempting
local meditating = false
local shown = {}

local function set_text(name, text)
  if shown[name] ~= text then shown[name] = text; ui.set_text(name, text) end
end
local function set_value(name, v)
  v = math.floor(v * 100 + 0.5) / 100
  if shown[name] ~= v then shown[name] = v; ui.set_value(name, v) end
end

local function apply_realm(first)
  local r = REALMS[realm]
  melee.tune(r.damage, r.speed, r.crit, -1, r.health, r.mana)
  for move in r.unlock:gmatch("[%w_]+") do melee.unlock(move) end
  if not first then world.heal(self.id, r.health) end
end

local function refresh()
  local r = REALMS[realm]
  local mana, mana_max = melee.mana()
  set_text("Realm", r.name)
  set_text("QiText", string.format("Qi %d / %d", math.floor(qi), r.need))
  set_value("Qi", math.min(1, qi / r.need))
  set_value("Mana", mana_max > 0 and mana / mana_max or 0)
  local pills = inventory.count(self.id, "Breakthrough Pill")
  local hint = ""
  if channel > 0 then hint = "Breaking through... do not be hurt!"
  elseif flying then hint = "Flying sword: move to fly, Space up, Ctrl down, V to land"
  elseif realm < #REALMS and qi >= r.need then hint = pills > 0 and "Qi is full. Press B to break through." or "Qi is full, but you need a Breakthrough Pill."
  end
  set_text("Hint", hint)
end

local function land()
  if not flying then return end
  flying = false
  physics.set_gravity_scale(1)
end

local function fail_breakthrough()
  channel = 0
  qi = qi * 0.7
  hud.announce("Qi deviation! The breakthrough failed and part of your qi scatters.")
  camera.shake(0.5, 0.5)
end

local function succeed()
  channel = 0
  inventory.remove(self.id, "Breakthrough Pill", 1)
  realm = realm + 1
  qi = 0
  apply_realm(false)
  hud.announce("Breakthrough! You are now in the " .. REALMS[realm].name .. " realm.")
  camera.shake(0.6, 0.8)
  objective.complete("breakthrough")
  if realm >= FLY_REALM then hud.announce("You can ride the flying sword: press V.") end
end

function on_start()
  -- props.realm starts further along (for testing and demos).
  realm = math.max(1, math.min(#REALMS, math.floor(tonumber(props.realm) or 1)))
  qi = math.max(0, tonumber(props.qi) or 0)
  world.wear("214:#6fc3dd 218:#f0e8d0")
  inventory.add(self.id, "Azure Robe", 1)
  inventory.equip(self.id, "body", "Azure Robe")
  inventory.add(self.id, "Qi Elixir", 3)
  inventory.add(self.id, "Breakthrough Pill", 1)
  apply_realm(true)
  refresh()
end

function on_message(name, value)
  if name == "kill" then
    qi = math.min(REALMS[realm].need, qi + (tonumber(value) or 20))
  elseif name == "qi" then
    qi = math.min(REALMS[realm].need, qi + (tonumber(value) or 0))
  end
end

function on_damaged()
  if channel > 0 then fail_breakthrough() end
end

function on_tick(dt)
  local r = REALMS[realm]
  local vx, vz = self.vx, self.vz
  local still = (vx * vx + vz * vz) < 2.25   -- under 1.5 m/s (an idle fighter shuffles a little)

  -- Meditation: hold M while standing still.
  meditating = input.action_down("meditate") and still and not flying and channel == 0
  if meditating and qi < r.need then
    qi = math.min(r.need, qi + MEDITATE_QI * dt)
    if qi >= 20 then objective.complete("gather-qi") end
  end

  -- Qi Elixir.
  if input.action_pressed("elixir") and inventory.count(self.id, "Qi Elixir") > 0 and qi < r.need then
    inventory.remove(self.id, "Qi Elixir", 1)
    qi = math.min(r.need, qi + ELIXIR_QI)
  end

  -- Breakthrough: needs full qi and a pill, then a few quiet seconds.
  if input.action_pressed("breakthrough") and channel == 0 and realm < #REALMS and qi >= r.need
     and inventory.count(self.id, "Breakthrough Pill") > 0 and not flying then
    channel = CHANNEL
    hud.announce("You circulate your qi, aiming for the " .. REALMS[realm + 1].name .. " realm...")
  end
  if channel > 0 then
    if not still then fail_breakthrough()
    else
      channel = channel - dt
      if channel <= 0 then succeed() end
    end
  end

  -- The flying sword.
  if input.action_pressed("fly") then
    if flying then land()
    elseif realm >= FLY_REALM and qi > 5 then
      flying = true
      physics.set_gravity_scale(0)
      world.set_velocity(self.id, vx, 3, vz)
    else
      hud.announce(realm < FLY_REALM and "Only a Foundation cultivator can ride a flying sword." or "Not enough qi to fly.")
    end
  end
  if flying then
    qi = qi - FLY_QI * dt
    if qi <= 0 then qi = 0; land() hud.announce("Your qi ran dry. The sword falls.")
    else
      local fx, fz = camera.forward()
      local forward = input.action("move_y")
      local strafe = input.action("move_x")
      local up = 0
      if input.action_down("jump") then up = 1 elseif input.action_down("crouch") then up = -1 end
      world.set_velocity(self.id,
        (fx * forward + fz * strafe) * FLY_SPEED,
        up * 7,
        (fz * forward - fx * strafe) * FLY_SPEED)
    end
  end

  refresh()
end
