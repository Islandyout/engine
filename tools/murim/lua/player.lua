-- @prop realm 1
-- @prop qi 0
-- The cultivator: qi, realms, breakthroughs, qi arts and the flying sword.
-- Hold N to meditate, B to break through (needs a Breakthrough Pill and
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
local VEIN_RADIUS = 7        -- metres from a spirit vein's stele inside which meditation is three times faster
local VEIN_BONUS = 3
local veins = {}             -- {x, z} of each Spirit Vein
local in_vein = false
local ELIXIR_QI = 60
local TRIBULATION = 12       -- seconds of lightning when entering Foundation or higher
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
local stage = 1              -- 1 early, 2 middle, 3 late, 4 peak within the realm (monotonic until the next realm)
local STAGES = { "Early", "Middle", "Late", "Peak" }
local tribulation = 0        -- seconds of heavenly lightning left
local next_strike = 0
local deviation = 0          -- seconds left of a qi deviation (meditation is slower)
local dead = false
local spawn = { 0, 0, 0 }
local hit_flip = 0
local clock = 0
local refresh_clock = 0
local QUESTS = {
  { "meet-elder", "Meet Elder Mu", "Speak with the elder inside the sect gate." },
  { "gather-qi", "Gather qi", "Stand still and hold N to meditate." },
  { "breakthrough", "Break through", "Fill your qi bar, then press B with a Breakthrough Pill." },
  { "bandits", "Clear the road", "Defeat the five bandits in the valley camp." },
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

-- The cultivation tree: passive perks bought with insight (one for each stage reached, two for each realm).
-- id, name, column, row, needs, cost, icon, detail, and what it adds (hp, dmg, crit, mana, med are fractions).
local PERKS = {
  { "iron_body",   "Iron Body",    0, 0, "",           1, "cross",  "Health +15%",              hp = 0.15 },
  { "diamond",     "Diamond Body", 0, 1, "iron_body",  2, "shield", "Health +30% more",         hp = 0.30 },
  { "keen_edge",   "Keen Edge",    1, 0, "",           1, "sword",  "Damage +10%",              dmg = 0.10 },
  { "sword_heart", "Sword Heart",  1, 1, "keen_edge",  2, "star",   "Critical chance +8%",      crit = 0.08 },
  { "deep_well",   "Deep Well",    2, 0, "",           1, "bolt",   "Mana +20%",                mana = 0.20 },
  { "flowing_qi",  "Flowing Qi",   2, 1, "deep_well",  2, "flame",  "Meditation 25% faster",    med = 0.25 },
}
local perks_learned = {}
local insight = 1

local function perk_total(field)
  local total = 0
  for _, perk in ipairs(PERKS) do
    if perks_learned[perk[1]] then total = total + (perk[field] or 0) end
  end
  return total
end

local function apply_realm(first)
  local r = REALMS[realm]
  melee.tune(r.damage * (1 + 0.05 * (stage - 1)) * (1 + perk_total("dmg")), r.speed, r.crit + perk_total("crit"), -1,
    r.health * (1 + perk_total("hp")), r.mana * (1 + perk_total("mana")))
  for move in r.unlock:gmatch("[%w_]+") do melee.unlock(move) end
  if not first then world.heal(self.id, r.health) end
end

local near_npc_name = nil     -- set each tick: the NPC within talking range

local function status_text()
  local r = REALMS[realm]
  local out = {}
  if channel > 0 then out[#out + 1] = string.format("Breaking through|%.1f|good|%d", channel, CHANNEL) end
  if not talking then
    local near = near_npc_name
    if near then out[#out + 1] = "Press E: talk to " .. near .. "|0|good" end
  end
  if tribulation > 0 then out[#out + 1] = string.format("Heavenly tribulation: keep moving|%.0f|bad|%d", tribulation, TRIBULATION) end
  if meditating then out[#out + 1] = in_vein and "Meditating at a spirit vein: x3|0|good" or "Meditating|0|good" end
  if flying then out[#out + 1] = "Flying sword|0|good" end
  if deviation > 0 then out[#out + 1] = string.format("Qi deviation|%.0f|bad|12", deviation) end
  if realm < #REALMS and qi >= r.need and channel <= 0 and tribulation <= 0 then
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

-- Talking: the Dialogue widget shows what the NPC says and numbered choices; keys 1 to 3 pick one (the widget's own
-- numbers). Merchant Lin sells for silver; Wen has a lost cart to find.
local TALK_RANGE = 3.6
local PRICES = { elixir = 20, pill = 120 }
local talking = nil              -- the NPC's name while a conversation is open
local cart_state = nil           -- nil not offered, "active", "found", "done"

local function silver() return inventory.count(self.id, "Silver") end

local function say(speaker, line, choices)
  local text = speaker .. ": " .. line
  for _, c in ipairs(choices) do text = text .. "\n> " .. c end
  ui.set_text("Dialogue", text)
end

local function close_talk()
  talking = nil
  ui.set_text("Dialogue", "")
end

local function merchant_root(note)
  say("Merchant Lin", note or ("Fine wares for a traveller. You have " .. silver() .. " silver."),
    { "Buy a Qi Elixir (" .. PRICES.elixir .. " silver)", "Buy a Breakthrough Pill (" .. PRICES.pill .. " silver)", "Leave" })
end

local function wen_root()
  if cart_state == nil then
    say("Wen", "Bandits took my cart on the road. It was last seen near the old watchtower. Could you look?", { "I will look for it.", "Not now." })
  elseif cart_state == "active" then
    say("Wen", "Any sign of my cart?", { "Still looking." })
  elseif cart_state == "found" then
    say("Wen", "My cart! Thank you. Take this, it is all I have.", { "Accept the reward" })
  else
    say("Wen", "The valley is safer with you in it.", { "Farewell." })
  end
end

local function choose(n)
  if talking == "Merchant Lin" then
    if n == 1 or n == 2 then
      local item, price = n == 1 and "Qi Elixir" or "Breakthrough Pill", n == 1 and PRICES.elixir or PRICES.pill
      if silver() < price then merchant_root("You cannot afford that. You have " .. silver() .. " silver.")
      elseif inventory.space(self.id, item) < 1 then merchant_root("You cannot carry any more of those.")
      else
        inventory.remove(self.id, "Silver", price)
        inventory.add(self.id, item, 1)
        sound.play("coin handle")
        merchant_root("Sold. You have " .. silver() .. " silver left.")
      end
    else close_talk() end
  elseif talking == "Wen" then
    if cart_state == nil and n == 1 then
      cart_state = "active"
      sound.play("book open")
      ui.set_text("Notification", "Side quest\nFind Wen's cart near the old watchtower.")
      wen_root()
    elseif cart_state == "found" and n == 1 then
      cart_state = "done"
      inventory.add(self.id, "Silver", 60)
      inventory.add(self.id, "Qi Elixir", 2)
      ui.set_text("Notification", "Side quest complete\n60 silver and 2 Qi Elixirs.")
      wen_root()
    else close_talk() end
  end
end

local function near_npc()
  for _, name in ipairs({ "Merchant Lin", "Wen" }) do
    local id = world.find(name)
    if id then
      local x, _, z = world.position(id)
      if (x - self.x) ^ 2 + (z - self.z) ^ 2 < TALK_RANGE ^ 2 then return name end
    end
  end
  return nil
end

local function talk_tick()
  -- The cart is found by walking up to it.
  if cart_state == "active" then
    local cart = world.find("Lost Cart")
    if cart then
      local x, _, z = world.position(cart)
      if (x - self.x) ^ 2 + (z - self.z) ^ 2 < 25 then
        cart_state = "found"
        ui.set_text("Notification", "Side quest\nYou found Wen's cart. Return to him.")
      end
    end
  end
  if talking then
    -- Walking away ends the conversation.
    local id = world.find(talking)
    local x, _, z = world.position(id)
    if (x - self.x) ^ 2 + (z - self.z) ^ 2 > (TALK_RANGE + 2.5) ^ 2 then close_talk() return end
    for n, key in ipairs({ "1", "2", "3" }) do
      if input.pressed(key) then choose(n) break end
    end
  elseif input.action_pressed("interact") then
    local name = near_npc()
    if name then
      talking = name
      if name == "Merchant Lin" then merchant_root() else wen_root() end
    end
  end
end

-- Sound: the engine's own music and ambience layers. Tension near a fight (or a tribulation), calm exploring music
-- otherwise, silence when dead; wind always, wildlife in the wild, a settled hum inside the sect and the village.
local audio_clock = 0
local mood = ""

local function audio_tick(dt)
  audio_clock = audio_clock + dt
  if audio_clock < 0.5 then return end
  audio_clock = 0
  local hostile = tribulation > 0
  if not hostile and not dead then
    for _, id in ipairs(world.overlap(self.x, self.y, self.z, 14)) do
      local n = world.name(id) or ""
      if (n:find("^Bandit") or n:find("^Iron")) and world.alive(id) then hostile = true break end
    end
  end
  local m = dead and "off" or hostile and "tension" or "explore"
  if m ~= mood then mood = m audio.music(m) end
  local settled = false
  for _, name in ipairs({ "Elder Mu", "Merchant Lin" }) do
    local id = world.find(name)
    if id then
      local x, _, z = world.position(id)
      if (x - self.x) ^ 2 + (z - self.z) ^ 2 < 22 * 22 then settled = true end
    end
  end
  audio.ambience("wind", math.min(0.8, 0.3 + math.max(0, self.y - 15) * 0.02))
  audio.ambience("wildlife", settled and 0.1 or 0.6)
  audio.ambience("settlement", settled and 0.8 or 0)
end

local function journal_text()
  local lines = { "Journal" }
  for _, q in ipairs(QUESTS) do lines[#lines + 1] = (quest_state[q[1]] or "todo") .. "|" .. q[2] .. "|" .. q[3] end
  if cart_state then
    lines[#lines + 1] = (cart_state == "done" and "done" or "active") .. "|Wen's cart|" .. (cart_state == "active" and "Find Wen's cart near the old watchtower." or cart_state == "found" and "You found it. Return to Wen." or "Returned to Wen.")
  end
  return table.concat(lines, "\n")
end

local function target_text()
  local t = melee.target()
  if not t or not world.alive(t) then return "", 0 end
  local name = world.name(t) or ""
  local subtitle
  if name:find("^Bandit") then
    subtitle = name:find("Brawler") and "Brawler · Mortal" or name:find("Swordsman") and "Swordsman · Mortal" or name:find("Spearman") and "Spearman · Mortal" or "Qi Adept · Mortal"
  elseif name:find("^Iron") then subtitle = "Qi Gathering"
  else return "", 0 end
  local tx, _, tz = world.position(t)
  if (tx - self.x) ^ 2 + (tz - self.z) ^ 2 > 22 * 22 then return "", 0 end
  local hp, max = world.health(t)
  return name .. "\n" .. subtitle, (hp or 0) / math.max(1, max or 1)
end

local function tree_text()
  local lines = { "Cultivation tree", insight .. " insight to spend  ·  stages and breakthroughs give more" }
  for _, perk in ipairs(PERKS) do
    local id, need = perk[1], perk[5]
    local state = perks_learned[id] and "learned" or ((need == "" or perks_learned[need]) and "available" or "locked")
    lines[#lines + 1] = string.format("node|%s|%s|%s|%d|%d|%s|%d|%s|%s", id, perk[2], state, perk[3], perk[4], need, perk[6], perk[7], perk[8])
  end
  return table.concat(lines, "\n")
end

local function learn(id)
  for _, perk in ipairs(PERKS) do
    if perk[1] == id and not perks_learned[id] and (perk[5] == "" or perks_learned[perk[5]]) then
      if insight < perk[6] then hud.announce("Not enough insight for " .. perk[2] .. ".") return end
      insight = insight - perk[6]
      perks_learned[id] = true
      apply_realm(true)
      ui.set_text("Skill tree", tree_text())
      hud.announce(perk[2] .. " learned: " .. perk[8])
      sound.play("bell")
      return
    end
  end
end

local function refresh()
  local r = REALMS[realm]
  set_text("Qi bar", string.format("%s · %s\nQi %d / %d\n#7fe0d4", r.name, STAGES[stage], math.floor(qi), r.need))
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
    set_text("Skill tree", tree_text())
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

-- Entering Foundation or higher, the heavens answer: for a few seconds a ring marks where lightning will strike (where
-- you stand) and a moment later it does. Step out of the ring.
local function begin_tribulation()
  channel = 0
  tribulation = TRIBULATION
  next_strike = 1.5
  ui.set_text("Notification", "Heavenly tribulation\nLightning gathers. Keep moving!")
  hud.announce("Heavenly tribulation! Keep moving and stay out of the red rings.")
  sound.play("force field")
  camera.shake(0.4, 0.6)
end

local function strike_at(x, y, z)
  local mark = world.find("Qi Mark")
  if mark then world.send(mark, "at", string.format("%.2f,%.2f,%.2f,1.4", x, y - 0.8, z)) end
  after(1.4, function()
    if dead or tribulation <= 0 then return end
    local burst = world.find("Qi Burst")
    if burst then world.send(burst, "at", string.format("%.2f,%.2f,%.2f", x, y, z)) end
    camera.shake(0.7, 0.4)
    sound.play("explosion")
    if (self.x - x) ^ 2 + (self.z - z) ^ 2 < 9 then world.damage(self.id, REALMS[realm].health * 0.22) end
  end)
end

local function succeed()
  channel = 0
  inventory.remove(self.id, "Breakthrough Pill", 1)
  realm = realm + 1
  stage = 1
  qi = 0
  tribulation = 0
  insight = insight + 2
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
  sound.play(move == "tiger_rush" and "blade draw" or "force field")
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

-- The valley on the engine's area map (M): the HUD's own Minimap widget stays the small map.
local function valley_map()
  local lines = { "bounds -120 -120 120 120" }
  local function add(l) lines[#lines + 1] = l end
  add("area -120 -120 120 120 #3d5a3a")
  add("area -22 58 22 98 #7d6a52 Azure Cloud Sect")
  add("area -16 -6 4 14 #6b4a3a Bandit camp")
  add("area -12 -92 12 -64 #6a6a78 Shrine")
  add("area -34 28 -14 48 #8a7a55 Willow Village")
  add("area 0 -118 28 -91 #55606e")
  add("area -73 -84 -43 -56 #55606e")
  add("area 53 -52 75 -28 #55606e")
  local road = {}
  for z = 80, -80, -8 do road[#road + 1] = string.format("%.1f %d", 9 * math.sin(z / 34), z) end
  add("path " .. table.concat(road, " "))
  add("label 14 -100 Heaven Peak")
  add("label 41 8 Lost Cart")
  add("title Azure Cloud Sect|VALLEY MAP")
  for _, l in ipairs({ "player You", "giver Elder or quest giver", "smith Merchant Lin", "vein Spirit vein: meditate here", "target Iron Fist Elder" }) do add("legend " .. l) end
  hud.map_layout(table.concat(lines, "\n"))
  hud.minimap(false)
  hud.map_marker("elder", "giver", 0, 70, "", "Elder Mu")
  hud.map_marker("shrine", "target", 0, -78, "", "Iron Fist Elder")
  hud.map_marker("shop", "smith", -24, 38, "", "Merchant Lin")
  for i, v in ipairs(veins) do hud.map_marker("vein" .. i, "vein", v[1], v[2], "#7fe0ff", "Spirit vein") end
end

function on_start()
  fx.aura, fx.bolt, fx.burst = world.find("Qi Aura"), world.find("Qi Bolt"), world.find("Qi Burst")
  for i = 1, 8 do
    local vein = world.find("Spirit Vein " .. i)
    if vein then
      local vx, vy, vz = world.position(vein)
      veins[#veins + 1] = { vx, vz }
      ui.marker("Spirit Vein " .. i, vx, vy + 3, vz)
    end
  end
  -- props.realm starts further along (for testing and demos).
  realm = math.max(1, math.min(#REALMS, math.floor(tonumber(props.realm) or 1)))
  qi = math.max(0, tonumber(props.qi) or 0)
  world.wear("214:#eee8d8 216:#eee8d8 218:#2f7f9a 215:#3a3a44 217:#2a2a30")
  inventory.add(self.id, "Azure Robe", 1)
  inventory.equip(self.id, "body", "Azure Robe")
  inventory.add(self.id, "Qi Elixir", 3)
  inventory.add(self.id, "Silver", 40)
  inventory.add(self.id, "Breakthrough Pill", 1)
  insight = insight + 2 * (realm - 1)
  apply_realm(true)
  spawn = { self.x, self.y + 0.5, self.z }
  hud.pause_menu(true)   -- Esc opens settings and the key list
  -- Markers for where to go: the elder, the camp and the shrine.
  for marker, entity in pairs({ ["Elder Mu"] = "Elder Mu", ["Bandit camp"] = "Bandit 1", ["Shrine"] = "Iron Fist Elder" }) do
    local id = world.find(entity)
    if id then
      local x, y, z = world.position(id)
      ui.marker(marker, x, y + 2.5, z)
    end
  end
  every(1, function()
    local elder = world.find("Elder Mu")
    if elder then
      local ex, _, ez = world.position(elder)
      if (ex - self.x) ^ 2 + (ez - self.z) ^ 2 < 36 then ui.clear_marker("Elder Mu") end
    end
  end)
  valley_map()
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
  tribulation = 0
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
  elseif name == "Skill tree" and tostring(value):sub(1, 5) == "node:" then
    learn(tostring(value):sub(6))
  elseif (name == "Character sheet" or name == "Quest log" or name == "Skill tree") and value == "close" then
    ui.close(name)
  end
end

function on_tick(dt)
  if dead then audio_tick(dt) return end
  clock = clock + dt
  near_npc_name = near_npc()
  talk_tick()
  audio_tick(dt)
  if deviation > 0 then deviation = math.max(0, deviation - dt) end
  local r = REALMS[realm]
  local vx, vz = self.vx, self.vz
  local still = (vx * vx + vz * vz) < 2.25   -- under 1.5 m/s (an idle fighter shuffles a little)

  -- Meditation: hold N while standing still.
  meditating = input.action_down("meditate") and still and not flying and channel == 0
  if meditating and qi < r.need then
    qi = math.min(r.need, qi + MEDITATE_QI * (1 + perk_total("med")) * (deviation > 0 and 0.4 or 1) * (in_vein and VEIN_BONUS or 1) * dt)
    if qi >= 20 then objective.complete("gather-qi") end
  end

  if input.action_pressed("controls") then hud.open_settings() end

  -- Spirit veins: near one, meditation is much faster.
  in_vein = false
  for _, v in ipairs(veins) do
    if (v[1] - self.x) ^ 2 + (v[2] - self.z) ^ 2 < VEIN_RADIUS * VEIN_RADIUS then in_vein = true break end
  end

  -- Stages within a realm: each quarter of the qi bar is a stage, and each is a little stronger.
  local reached = math.min(4, math.floor(qi / r.need * 4) + 1)
  if reached > stage then
    stage = reached
    insight = insight + 1
    apply_realm(true)
    ui.set_text("Notification", r.name .. "\n" .. STAGES[stage] .. " stage reached")
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
      if channel <= 0 then if realm >= 2 then begin_tribulation() else succeed() end end
    end
  end

  -- The tribulation's lightning.
  if tribulation > 0 then
    tribulation = tribulation - dt
    next_strike = next_strike - dt
    if next_strike <= 0 and tribulation > 1.6 then
      next_strike = 2.2
      strike_at(self.x, self.y, self.z)
    end
    if tribulation <= 0 and not dead then succeed() end
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

  -- The readouts only need to change a few times a second.
  refresh_clock = refresh_clock + dt
  if refresh_clock >= 0.1 then refresh_clock = 0 refresh() end
  qi_effects()
end
