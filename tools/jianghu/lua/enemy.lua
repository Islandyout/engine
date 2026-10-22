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
-- @prop realm 0
-- @prop peaceful 0
-- @prop duel 0
-- @prop reward none
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
-- A fighter's realm sets how hard it hits and how fast it moves (the Player's own ladder: an equal is an even fight).
local REALM_DAMAGE = { 1.0, 1.25, 1.6, 2.1, 2.7, 3.5, 5.0 }
local REALM_SPEED = { 1.0, 1.05, 1.1, 1.18, 1.25, 1.32, 1.4 }
local my_realm = 1
local base_damage = 1
local yielded = false

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
      if BEST[n] and not PEACEFUL[n] then world.send(id, "alert", "") end
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
  elseif name == "challenge" then
    -- "Fight me" said to a duelist: it takes up the duel.
    props.peaceful = 0
    melee.set_ai(true, 0.7)
    local player = world.find("Player")
    if player then melee.lock(player) end
  elseif name == "alert" and alert_left <= 0 then
    alert_left = 12
    melee.set_ai(true, 0.85)
    local player = world.find("Player")
    if player then melee.lock(player) end
  end
end

function on_damaged(amount, attacker)
  -- A duel is to first yield, not to the death: at a quarter of its health the duelist stops, heals a little and pays up.
  if (tonumber(props.duel) or 0) > 0 and not yielded then
    local hp, max = world.health(self.id)
    if hp and max and hp <= max * 0.25 then
      yielded = true
      melee.set_ai(false)
      world.heal(self.id, max * 0.3 - hp)
      local player = world.find("Player")
      hud.announce((world.name(self.id) or "The duelist") .. " yields. \"Enough. You have earned this.\"")
      if player then
        world.send(player, "duel_won", world.name(self.id) or "")
        if props.reward ~= "none" then
          for item in tostring(props.reward):gmatch("[^|]+") do inventory.add(player, item, 1) hud.announce("You receive: " .. item .. ".") end
        end
        world.send(player, "kill", (tonumber(props.qi) or 25))
      end
      return
    end
  end
  -- Someone who stood peacefully fights back once struck.
  if (tonumber(props.peaceful) or 0) > 0 and not yielded then
    props.peaceful = 0
    melee.set_ai(true, 0.7)
    local player = world.find("Player")
    if player then melee.lock(player) end
  end
  if alert_left <= 0 and not PEACEFUL[world.name(self.id) or ""] and (tonumber(props.phases) or 0) == 0 then
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
        melee.tune(base_damage * (1 + 0.3 * phase), REALM_SPEED[my_realm] * (1 + 0.08 * phase), -1, -1)
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
  local given = tonumber(props.realm) or 0
  my_realm = math.max(1, math.min(7, given > 0 and given or realm_of(world.name(self.id))))
  base_damage = REALM_DAMAGE[my_realm]
  melee.tune(base_damage, REALM_SPEED[my_realm], -1, -1)
  if (tonumber(props.peaceful) or 0) > 0 then melee.set_ai(false) end
  -- Clothes give the mannequin a body: robes, trousers, gloves and boots.
  if props.gear and props.gear ~= "" and props.gear ~= "none" then world.wear(props.gear) end
  for name in tostring(props.telegraph or ""):gmatch("[%w_]+") do
    if name ~= "none" then telegraph[name] = true end
  end
end
