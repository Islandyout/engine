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
local fx = {}
local QI_ARTS = { qi_palm = true, wind_palm = true, tiger_rush = true, nine_dragons = true }
local casting = false
local last_move = ""
local deviation = 0          -- seconds left of a qi deviation (meditation is slower)
local dead = false
local spawn = { 0, 0, 0 }
local hit_flip = 0
local clock = 0
local QUESTS = {
  { "meet-elder", "Meet Elder Mu", "Speak with the elder inside the sect gate." },
  { "gather-qi", "Gather qi", "Stand still and hold M to meditate." },
  { "breakthrough", "Break through", "Fill your qi bar, then press B with a Breakthrough Pill." },
  { "bandits", "Clear the road", "Defeat the four bandits in the valley camp." },
  { "guardian", "Face the guardian", "Climb to the shrine and defeat the Iron Fist Elder." },
}
local quest_state = { ["meet-elder"] = "active" }

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

local function status_text()
  local r = REALMS[realm]
  local out = {}
  if channel > 0 then out[#out + 1] = string.format("Breaking through|%.1f|good|%d", channel, CHANNEL) end
  if meditating then out[#out + 1] = "Meditating|0|good" end
  if flying then out[#out + 1] = "Flying sword|0|good" end
  if deviation > 0 then out[#out + 1] = string.format("Qi deviation|%.0f|bad|12", deviation) end
  if realm < #REALMS and qi >= r.need and channel <= 0 then
    out[#out + 1] = inventory.count(self.id, "Breakthrough Pill") > 0 and "Qi is full: press B|0|good" or "Qi is full: needs a Breakthrough Pill|0|neutral"
  end
  return table.concat(out, "\n")
end

local function sheet_text()
  local r = REALMS[realm]
  local lines = {
    "Cultivator", r.name .. " realm",
    "# Cultivation",
    string.format("bar|Qi|%.2f|%d / %d", math.min(1, qi / r.need), math.floor(qi), r.need),
    string.format("Next realm|%s", REALMS[realm + 1] and REALMS[realm + 1].name or "Peak"),
    "# Combat",
    string.format("Damage|x%.2f", r.damage),
    string.format("Speed|%+d%%", math.floor((r.speed - 1) * 100 + 0.5)),
    string.format("Critical chance|%d%%", math.floor(r.crit * 100 + 0.5)),
    string.format("Health|%d", r.health),
    string.format("Mana|%d", r.mana),
    "# Carried",
    string.format("Qi Elixirs|%d", inventory.count(self.id, "Qi Elixir")),
    string.format("Breakthrough Pills|%d", inventory.count(self.id, "Breakthrough Pill")),
    "Body|" .. (inventory.equipped(self.id, "body") ~= "" and inventory.equipped(self.id, "body") or "none"),
  }
  return table.concat(lines, "\n")
end

local function journal_text()
  local lines = { "Journal" }
  for _, q in ipairs(QUESTS) do lines[#lines + 1] = (quest_state[q[1]] or "todo") .. "|" .. q[2] .. "|" .. q[3] end
  return table.concat(lines, "\n")
end

local function target_text()
  local t = melee.target()
  if not t or not world.alive(t) then return "", 0 end
  local name = world.name(t) or ""
  local subtitle
  if name:find("^Bandit") then subtitle = "Mortal"
  elseif name:find("^Iron") then subtitle = "Qi Gathering"
  else return "", 0 end
  local tx, _, tz = world.position(t)
  if (tx - self.x) ^ 2 + (tz - self.z) ^ 2 > 22 * 22 then return "", 0 end
  local hp, max = world.health(t)
  return name .. "\n" .. subtitle, (hp or 0) / math.max(1, max or 1)
end

local function refresh()
  local r = REALMS[realm]
  set_text("Qi bar", string.format("%s\nQi %d / %d\n#7fe0d4", r.name, math.floor(qi), r.need))
  set_value("Qi bar", math.min(1, qi / r.need))
  set_text("Status", status_text())
  local target, health = target_text()
  set_text("Target", target)
  set_value("Target", health)
  -- The panels are only rebuilt a couple of times a second.
  if clock >= 0.5 then
    clock = 0
    set_text("Character sheet", sheet_text())
    set_text("Quest log", journal_text())
  end
end

local function land()
  if not flying then return end
  flying = false
  physics.set_gravity_scale(1)
end

local function fail_breakthrough()
  channel = 0
  qi = qi * 0.7
  deviation = 12
  ui.set_text("Notification", "Qi deviation\nThe breakthrough failed and your qi scatters.")
  hud.announce("Qi deviation! The breakthrough failed and part of your qi scatters.")
  camera.shake(0.5, 0.5)
end

local function succeed()
  channel = 0
  inventory.remove(self.id, "Breakthrough Pill", 1)
  realm = realm + 1
  qi = 0
  apply_realm(false)
  ui.set_text("Notification", "Breakthrough!\nYou have entered the " .. REALMS[realm].name .. " realm.")
  hud.announce("Breakthrough! You are now in the " .. REALMS[realm].name .. " realm.")
  camera.shake(0.6, 0.8)
  sound.play("bell")
  objective.complete("breakthrough")
  if realm >= FLY_REALM then hud.announce("You can ride the flying sword: press V.") end
  quest_state["breakthrough"] = "done"
end

-- Qi effects: a glow while meditating or casting, the Qi Palm's core and trail, and a flash for the area arts.
local function aim()
  local target = melee.target()
  if target and world.alive(target) then
    local tx, _, tz = world.position(target)
    local dx, dz = tx - self.x, tz - self.z
    local d = math.sqrt(dx * dx + dz * dz)
    if d > 0.01 then return dx / d, dz / d end
  end
  return camera.forward()
end

local function qi_effects()
  local move = melee.move()
  local art = QI_ARTS[move] == true
  local active = art or meditating
  if active ~= casting then
    casting = active
    if fx.aura then world.send(fx.aura, "cast", active and 1 or 0) end
  end
  if move == last_move then return end
  last_move = move
  if not art then return end
  sound.play("force-field")
  if move == "qi_palm" and fx.bolt then
    after(0.28, function()
      local fx_, fz_ = aim()
      world.send(fx.bolt, "fire", string.format("%.2f,%.2f,%.2f,%.2f,%.2f",
        self.x + fx_ * 0.9, self.y + 0.3, self.z + fz_ * 0.9, fx_ * 22, fz_ * 22))
    end)
  elseif (move == "wind_palm" or move == "nine_dragons") and fx.burst then
    after(0.4, function()
      world.send(fx.burst, "at", string.format("%.2f,%.2f,%.2f", self.x, self.y - 0.6, self.z))
      camera.shake(move == "nine_dragons" and 0.7 or 0.4, 0.4)
    end)
  end
end

function on_start()
  fx.aura, fx.bolt, fx.burst = world.find("Qi Aura"), world.find("Qi Bolt"), world.find("Qi Burst")
  -- props.realm starts further along (for testing and demos).
  realm = math.max(1, math.min(#REALMS, math.floor(tonumber(props.realm) or 1)))
  qi = math.max(0, tonumber(props.qi) or 0)
  world.wear("214:#6fc3dd 218:#f0e8d0")
  inventory.add(self.id, "Azure Robe", 1)
  inventory.equip(self.id, "body", "Azure Robe")
  inventory.add(self.id, "Qi Elixir", 3)
  inventory.add(self.id, "Breakthrough Pill", 1)
  apply_realm(true)
  spawn = { self.x, self.y + 0.5, self.z }
  hud.pause_menu(true)   -- Esc opens settings and the key list
  -- Markers for where to go: the elder, the camp and the shrine.
  for marker, entity in pairs({ ["Elder Mu"] = "Elder Mu", ["Bandit camp"] = "Bandit 1", ["Shrine"] = "Iron Fist Elder" }) do
    local id = world.find(entity)
    if id then
      local x, y, z = world.position(id)
      ui.marker(marker, x, y + 2.5, z, marker)
    end
  end
  every(1, function()
    local elder = world.find("Elder Mu")
    if elder then
      local ex, _, ez = world.position(elder)
      if (ex - self.x) ^ 2 + (ez - self.z) ^ 2 < 36 then ui.clear_marker("Elder Mu") end
    end
  end)
  refresh()
end

function on_message(name, value)
  if name == "kill" then
    qi = math.min(REALMS[realm].need, qi + (tonumber(value) or 20))
  elseif name == "qi" then
    qi = math.min(REALMS[realm].need, qi + (tonumber(value) or 0))
  end
end

function on_damaged(amount, attacker)
  if channel > 0 then fail_breakthrough() end
  -- An arc on the side the blow came from, relative to where the camera looks.
  if attacker and world.alive(attacker) then
    local ax, _, az = world.position(attacker)
    local fx_, fz_ = camera.forward()
    local dx, dz = ax - self.x, az - self.z
    local forward = dx * fx_ + dz * fz_
    local right = -dx * fz_ + dz * fx_
    hit_flip = 1 - hit_flip   -- a tiny change so a repeat from the same side still counts as new text
    ui.set_text("Damage direction", string.format("%.2f", math.deg(math.atan(right, forward)) + hit_flip * 0.01))
  end
end

function on_death()
  dead = true
  land()
  channel = 0
  meditating = false
  ui.set_text("Death screen", "YOU HAVE FALLEN\nYour qi scatters on the wind.\nRise again")
end

local function respawn()
  dead = false
  ui.set_text("Death screen", "")
  melee.revive()
  world.set_position(self.id, spawn[1], spawn[2], spawn[3])
  world.set_velocity(self.id, 0, 0, 0)
  qi = qi * 0.5
  deviation = 0
end

function on_ui(name, value)
  if name == "objective" then
    local kind, id = tostring(value):match("^(%a+):(.+)$")
    if kind == "start" then quest_state[id] = "active"
    elseif kind == "complete" then quest_state[id] = "done" end
  elseif name == "Death screen" and value == "respawn" then
    respawn()
  elseif (name == "Character sheet" or name == "Quest log") and value == "close" then
    ui.close(name)
  end
end

function on_tick(dt)
  if dead then return end
  clock = clock + dt
  if deviation > 0 then deviation = math.max(0, deviation - dt) end
  local r = REALMS[realm]
  local vx, vz = self.vx, self.vz
  local still = (vx * vx + vz * vz) < 2.25   -- under 1.5 m/s (an idle fighter shuffles a little)

  -- Meditation: hold M while standing still.
  meditating = input.action_down("meditate") and still and not flying and channel == 0
  if meditating and qi < r.need then
    qi = math.min(r.need, qi + MEDITATE_QI * (deviation > 0 and 0.4 or 1) * dt)
    if qi >= 20 then objective.complete("gather-qi") end
  end

  if input.action_pressed("controls") then hud.open_settings() end

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
  qi_effects()
end
