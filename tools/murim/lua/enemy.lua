-- @prop gear none
-- @prop qi 25
-- @prop drop 0
-- @prop pill 0
-- @prop silver 0
-- @prop arrows 0
-- @prop phases 0
-- @prop telegraph none
-- @prop summon Cave Shade
-- @prop loot none
-- @prop dungeon 0
-- A bandit, a beast or a guardian: qi and loot for the Player when defeated; afflictions (burn, poison, bleed, chill,
-- stun) from qi arts; a red ring before a heavy blow (props.telegraph lists the moves); calls its friends when hurt;
-- and, with props.phases, a boss that grows angrier and calls help at two thirds and one third of its health.
local afflictions = {}          -- name -> seconds left
local DPS = { burn = 4, poison = 3, bleed = 4 }
local dot_acc = 0
local last_move = ""
local phase = 0
local alert_left = 0
local telegraph = {}

function on_death(attacker)
  local player = world.find("Player")
  if not player then return end
  world.send(player, "kill", tonumber(props.qi) or 25)
  if (tonumber(props.silver) or 0) > 0 then inventory.add(player, "Silver", tonumber(props.silver)) end
  if (props.drop or 0) > 0 then inventory.add(player, "Qi Elixir", props.drop) end
  local arrows = tonumber(props.arrows) or 0
  if arrows > 0 or math.random() < 0.3 then inventory.add(player, "Arrow", math.max(arrows, math.random(2, 4))) end
  if math.random() < 0.15 then inventory.add(player, "Jade Dew Pill", 1) end
  if (props.pill or 0) > 0 then
    inventory.add(player, "Breakthrough Pill", props.pill)
    hud.announce("The guardian drops a Breakthrough Pill.")
  end
  for item in tostring(props.loot or ""):gmatch("[^|]+") do
    if item ~= "none" then
      inventory.add(player, item, 1)
      hud.announce("It drops: " .. item .. ".")
    end
  end
  if (tonumber(props.dungeon) or 0) > 0 then
    local sect = world.find("Sect")
    if sect then world.send(sect, "dungeon", "") end
  end
  world.send(player, "slain", world.name(self.id) or "")
end

local function mark_ring(secs)
  local mark = world.find("Qi Mark")
  if mark then world.send(mark, "at", string.format("%.2f,%.2f,%.2f,%.2f", self.x, self.y - 0.8, self.z, secs)) end
end

local function call_friends()
  for _, id in ipairs(world.overlap(self.x, self.y, self.z, 18)) do
    if id ~= self.id and world.alive(id) then
      local n = world.name(id) or ""
      if n:find("^Bandit") then world.send(id, "alert", "") end
    end
  end
end

function on_message(name, value)
  if name == "status" then
    local kind, secs = tostring(value):match("^(%a+)|([%d.]+)$")
    if kind then
      afflictions[kind] = tonumber(secs)
      if kind == "chill" then melee.tune(-1, 0.55) end
      if kind == "stun" then melee.set_ai(false) end
    end
  elseif name == "alert" and alert_left <= 0 then
    alert_left = 12
    melee.set_ai(true, 0.85)
    local player = world.find("Player")
    if player then melee.lock(player) end
  end
end

function on_damaged(amount, attacker)
  if alert_left <= 0 and (world.name(self.id) or ""):find("^Bandit") then
    alert_left = 12
    call_friends()
  end
  if (tonumber(props.phases) or 0) > 0 then
    local hp, max = world.health(self.id)
    if hp and max and max > 0 then
      local ratio = hp / max
      local want = ratio < 0.34 and 2 or ratio < 0.67 and 1 or 0
      if want > phase then
        phase = want
        melee.tune(1 + 0.3 * phase, 1 + 0.08 * phase, -1, -1)
        camera.shake(0.5, 0.5)
        hud.announce(phase == 1 and "The guardian's qi surges." or "The guardian's qi blazes. It will not fall easily.")
        for k = 1, 2 do
          local ang = k * math.pi + phase
          world.spawn(props.summon or "Cave Shade", self.x + math.cos(ang) * 3, self.y + 0.5, self.z + math.sin(ang) * 3)
        end
      end
    end
  end
end

function on_tick(dt)
  if alert_left > 0 then alert_left = alert_left - dt end
  -- Afflictions.
  for kind, left in pairs(afflictions) do
    left = left - dt
    if DPS[kind] then dot_acc = dot_acc + DPS[kind] * dt end
    if left <= 0 then
      afflictions[kind] = nil
      if kind == "chill" then melee.tune(-1, 1) end
      if kind == "stun" then melee.set_ai(true) end
    else
      afflictions[kind] = left
    end
  end
  if dot_acc >= 1 then
    local whole = math.floor(dot_acc)
    dot_acc = dot_acc - whole
    world.damage(self.id, whole)
  end
  -- A ring on the ground the moment a telegraphed blow begins.
  if next(telegraph) then
    local move = melee.move()
    if move ~= last_move then
      last_move = move
      if telegraph[move] then mark_ring(0.7) end
    end
  end
end

function on_start()
  -- Clothes give the mannequin a body: robes, trousers, gloves and boots.
  if props.gear and props.gear ~= "" and props.gear ~= "none" then world.wear(props.gear) end
  for name in tostring(props.telegraph or ""):gmatch("[%w_]+") do
    if name ~= "none" then telegraph[name] = true end
  end
end
