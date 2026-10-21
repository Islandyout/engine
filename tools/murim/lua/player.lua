-- @prop realm 1
-- @prop silver 0
-- @prop qi 0
-- The cultivator (the scene builder places items.lua in front of this): qi, realms, breakthroughs, stages, the cultivation
-- and meridian trees, qi arts, stances, afflictions, qinggong, the flying sword and the saved game. Conversations, shops, the
-- sect's records and the world itself live in their own scripts and talk to this one with messages.
-- Hold N to meditate, B to break through (needs a Breakthrough Pill and enough qi), H drinks a Qi Elixir, V rides the sword.

local REALMS = {
  { name = "Mortal",       need = 100, damage = 1.0,  speed = 1.0,  crit = 0.05, health = 100, mana = 60,  unlock = "" },
  { name = "Qi Gathering", need = 250, damage = 1.25, speed = 1.05, crit = 0.08, health = 150, mana = 100, unlock = "qi_palm" },
  { name = "Foundation",   need = 500, damage = 1.6,  speed = 1.1,  crit = 0.12, health = 220, mana = 150, unlock = "wind_palm" },
  { name = "Golden Core",  need = 999, damage = 2.1,  speed = 1.18, crit = 0.18, health = 320, mana = 220, unlock = "tiger_rush nine_dragons" },
}
local FLY_REALM, FLY_SPEED, FLY_QI = 3, 13, 3
local MEDITATE_QI, ELIXIR_QI = 9, 60
local VEIN_RADIUS, VEIN_BONUS = 7, 3
local TRIBULATION, CHANNEL = 12, 3
local STAGES = { "Early", "Middle", "Late", "Peak" }
local QI_ARTS = { qi_palm = true, wind_palm = true, tiger_rush = true, nine_dragons = true, sword_qi = true, thunder_lance = true, flame_palm = true }

local sky = fx               -- the engine's fx table; `fx` below is this script's own effect entity ids
local fx = {}

-- A key press counts once even when a slow frame runs several ticks (each would see the same press).
local clock_total, last_press = 0, {}
local function tapped(action)
  if input.action_pressed(action) and clock_total - (last_press[action] or -1) > 0.3 then
    last_press[action] = clock_total
    return true
  end
  return false
end

-- ---- State
local realm, stage, qi, insight = 1, 1, 0, 1
local flying, meditating, dead, in_vein = false, false, false, false
local channel, tribulation, next_strike, deviation = 0, 0, 0, 0
local veins = {}
local spawn = { 0, 0, 0 }
local shown = {}
local casting, last_move = false, ""
local air_jumps, wall_t, grapple_cd, grapple = 0, 0, 0, nil
local clock, refresh_clock, audio_clock, hit_flip = 0, 0, 0, 0
local mood = ""
local day_hours = 9
local inside = ""
local prompt_text, prompt_left = "", 0
local held_mana, talking_now = nil, false
local ward, formation = nil, nil                -- a Ward Talisman's soak; a planted array flag
local perks_learned, meridians_learned = {}, {}
local arts_learned, affinity, robe = {}, "", 1
local hair, cut, creating = 1, 1, false
local partner, dual_time = false, 0
local guardian_cd, fire_cd = 0, 0
local stance, bow_dry, bow_move = "fists", false, ""
local effects, dot_acc = {}, 0
local save_game
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
local function send(entity, name, value)
  local id = world.find(entity)
  if id then world.send(id, name, value or "") end
end
local function hostile(name) return name:find("^Bandit") or name:find("^Iron") or name:find("Shade") or name:find("Wolf") or name:find("Guardian") end

-- ---- The two trees: passive perks bought with insight (one for each stage reached, two for each realm and rank).
-- id, name, column, row, needs, cost, icon, detail; effects: hp, dmg, crit, mana, med, speed (fractions); xor: the branch it shuts.
local PERKS = {
  { "iron_body",   "Iron Body",    0, 0, "",          1, "cross",  "Health +15%",            hp = 0.15 },
  { "diamond",     "Diamond Body", 0, 1, "iron_body", 2, "shield", "Health +30% more",       hp = 0.30 },
  { "keen_edge",   "Keen Edge",    1, 0, "",          1, "sword",  "Damage +10%",            dmg = 0.10 },
  { "sword_heart", "Sword Heart",  1, 1, "keen_edge", 2, "star",   "Critical chance +8%",    crit = 0.08 },
  { "deep_well",   "Deep Well",    2, 0, "",          1, "bolt",   "Mana +20%",              mana = 0.20 },
  { "flowing_qi",  "Flowing Qi",   2, 1, "deep_well", 2, "flame",  "Meditation 25% faster",  med = 0.25 },
}
local MERIDIANS = {
  { "lung",    "Lung",       0, 0, "",        2, "flame",  "Meditation 20% faster",                   med = 0.20 },
  { "heart",   "Heart",      1, 0, "",        2, "star",   "Critical chance +6%",                     crit = 0.06 },
  { "kidney",  "Kidney",     2, 0, "",        2, "cross",  "Health +12%",                             hp = 0.12 },
  { "du",      "Du Mai",     0, 1, "lung",    3, "bolt",   "Meditation +30%; closes the Ren Mai",     med = 0.30, xor = "ren" },
  { "ren",     "Ren Mai",    1, 1, "heart",   3, "sword",  "Damage +12%; closes the Du Mai",          dmg = 0.12, xor = "du" },
  { "chong",   "Chong Mai",  2, 1, "kidney",  3, "shield", "Health +20%, mana +15%",                  hp = 0.20, mana = 0.15 },
  { "cycle",   "Great Cycle", 1, 2, "ren",    4, "gem",    "Speed +8%, the flying sword costs half",  speed = 0.08, fly = 0.5 },
}
local function total_of(field)
  local t = 0
  for _, list in ipairs({ { PERKS, perks_learned }, { MERIDIANS, meridians_learned } }) do
    for _, perk in ipairs(list[1]) do if list[2][perk[1]] then t = t + (perk[field] or 0) end end
  end
  return t
end

-- ---- Afflictions from enemy blows: poison, bleeding and burning drain health; a curse weakens your blows; chill slows them.
local AFFLICTIONS = {
  poison = { label = "Poison", dps = 2.5, cure = true }, bleed = { label = "Bleeding", dps = 3.5, cure = true },
  burn = { label = "Burning", dps = 4, cure = true }, curse = { label = "Cursed", cure = true }, chill = { label = "Chilled", cure = true },
}
local function effect_mod(name, on, off) return effects[name] and on or off end

local function apply_realm(first)
  local r = REALMS[realm]
  melee.tune(r.damage * (1 + 0.05 * (stage - 1)) * (1 + total_of("dmg")) * effect_mod("curse", 0.75, 1),
    r.speed * (1 + total_of("speed")) * effect_mod("chill", 0.8, 1), r.crit + total_of("crit"), -1,
    r.health * (1 + total_of("hp")), r.mana * (1 + total_of("mana")))
  for move in r.unlock:gmatch("[%w_]+") do melee.unlock(move) end
  if not first then world.heal(self.id, r.health) end
  send("Folk", "realm", realm)
  send("Sect", "realm", realm)
end

local function afflict(name, secs)
  if not AFFLICTIONS[name] then return end
  local had = effects[name]
  effects[name] = { left = secs, max = math.max(secs, had and had.max or 0) }
  if not had and (name == "curse" or name == "chill") then apply_realm(true) end
end
local function cure(all)
  local changed = false
  for name, def in pairs(AFFLICTIONS) do
    if effects[name] and (all or def.cure) then
      effects[name] = nil
      if name == "curse" or name == "chill" then changed = true end
    end
  end
  if changed then apply_realm(true) end
end

-- ---- Stances: the moves of each (names come from the scene builder) and the weapon slot that holds its weapon.
local STANCES = --@STANCES@
local STANCE_ORDER = { "fists", "blade", "spear", "glaive", "bow" }
local STANCE_LABEL = { fists = "Fists", blade = "Sword", spear = "Spear", glaive = "Glaive", bow = "Bow" }
local BOW_SHOTS = { "bw_shot", "bw_power" }
local function set_stance(name)
  for key, moves in pairs(STANCES) do
    for _, m in ipairs(moves) do if key == name then melee.unlock(m) else melee.relock(m) end end
  end
  stance, bow_dry = name, false
  for i, key in ipairs(STANCE_ORDER) do if key == name then inventory.select(self.id, i) end end
  if name == "bow" and inventory.count(self.id, "Arrow") == 0 then
    bow_dry = true
    for _, m in ipairs(BOW_SHOTS) do melee.relock(m) end
  end
end

-- ---- Scroll arts: key, and the move each performs. Folk teaches them; learn_art unlocks one.
local ART_KEYS = { art1 = "sword_qi", art2 = "thunder_lance", art3 = "flame_palm" }
local ROBES = {
  { "Azure",   "214:#eee8d8 216:#eee8d8 218:#2f7f9a 215:#3a3a44 217:#2a2a30" },
  { "Crimson", "214:#b23a3a 216:#3a2a2a 218:#e0b050 215:#2a2a2a 217:#2a2a2a" },
  { "Jade",    "214:#5a9a78 216:#e8e4d0 218:#d8c070 215:#3a3a3a 217:#2a2a2a" },
  { "Ink",     "214:#2a2a34 216:#1e1e26 218:#c9a24a 215:#16161c 217:#16161c" },
  { "Saffron", "214:#d89a3a 216:#f0e6c8 218:#8f2d2d 215:#3a3a3a 217:#2a2a2a" },
}
local HAIRS = { { "Parted", "363:#1c1618" }, { "Long", "361:#1c1618" }, { "Buns", "362:#1c1618" }, { "Scholar's cap", "358:#2a2a34" }, { "Shaven", "364:#1c1618" } }
local CUTS = { { "Tunic", "" }, { "Long robe", "354:%s 355:%s" } }
local function dress()
  local spec = ROBES[robe][2]
  local top = spec:match("214:(#%x+)") or "#eeeeee"
  local tint = spec:match("218:(#%x+)") or spec:match("216:(#%x+)") or top
  spec = spec .. " " .. HAIRS[hair][2] .. " " .. CUTS[cut][2]:format(tint, top)
  world.wear(spec)
end

-- The mirror: robe colour, hair, cut and language, changed live while the Dialogue panel is up. E ends it.
local function mirror_text()
  ui.set_text("Dialogue", "Mirror: E when you are happy with how you look.\n> Robe: " .. ROBES[robe][1] .. "\n> Hair: " .. HAIRS[hair][1]
    .. "\n> Cut: " .. CUTS[cut][1] .. "\n> Language: " .. (LANG == "zh" and "中文" or "English"))
end

local function status_text()
  local r = REALMS[realm]
  local out = {}
  if channel > 0 then out[#out + 1] = string.format("Breaking through|%.1f|good|%d", channel, CHANNEL) end
  if not talking_now and prompt_left > 0 then out[#out + 1] = "Press E: " .. prompt_text .. "|0|good" end
  if tribulation > 0 then out[#out + 1] = string.format("Heavenly tribulation: keep moving|%.0f|bad|%d", tribulation, TRIBULATION) end
  if meditating then out[#out + 1] = (in_vein and "Meditating at a spirit vein: x3|0|good") or (formation and "Meditating in an array: x2|0|good") or (partner and "Dual cultivation with Lan: x1.8|0|good") or "Meditating|0|good" end
  if flying then out[#out + 1] = "Flying sword|0|good" end
  for name, e in pairs(effects) do out[#out + 1] = string.format("%s|%.0f|bad|%.0f", AFFLICTIONS[name].label, e.left, e.max) end
  if ward then out[#out + 1] = string.format("Ward: %d|%.0f|good|20", ward.absorb, ward.left) end
  if formation then out[#out + 1] = string.format("Qi array|%.0f|good|120", formation.left) end
  if stance ~= "fists" then out[#out + 1] = string.format("%s stance|0|good", STANCE_LABEL[stance]) end
  if deviation > 0 then out[#out + 1] = string.format("Qi deviation|%.0f|bad|12", deviation) end
  if realm < #REALMS and qi >= r.need and channel <= 0 and tribulation <= 0 then
    out[#out + 1] = inventory.count(self.id, "Breakthrough Pill") > 0 and "Qi is full: press B|0|good" or "Qi is full: needs a Breakthrough Pill|0|neutral"
  end
  return table.concat(out, "\n")
end

local function sheet_text()
  local r = REALMS[realm]
  local lines = {
    "Cultivator", r.name .. " realm" .. (affinity ~= "" and (" · " .. affinity:gsub("^%l", string.upper) .. " qi") or ""),
    "# Cultivation",
    string.format("bar|Qi|%.2f|%d / %d", math.min(1, qi / r.need), math.floor(qi), r.need),
    string.format("Next realm|%s", REALMS[realm + 1] and REALMS[realm + 1].name or "Peak"),
    string.format("Insight|%d", insight),
    string.format("Time|%02d:%02d", math.floor(day_hours), math.floor(day_hours % 1 * 60)),
    "# Combat",
    string.format("Damage|x%.2f", r.damage * (1 + total_of("dmg"))),
    string.format("Speed|%+d%%", math.floor((r.speed * (1 + total_of("speed")) - 1) * 100 + 0.5)),
    string.format("Critical chance|%d%%", math.floor((r.crit + total_of("crit")) * 100 + 0.5)),
    string.format("Health|%d", math.floor(r.health * (1 + total_of("hp")))),
    string.format("Mana|%d", math.floor(r.mana * (1 + total_of("mana")))),
    "# Carried",
    string.format("Qi Elixirs|%d", inventory.count(self.id, "Qi Elixir")),
    string.format("Breakthrough Pills|%d", inventory.count(self.id, "Breakthrough Pill")),
    string.format("Jade Dew Pills|%d", inventory.count(self.id, "Jade Dew Pill")),
    string.format("Spirit Herbs|%d", inventory.count(self.id, "Spirit Herb")),
    "Body|" .. (inventory.equipped(self.id, "body") ~= "" and inventory.equipped(self.id, "body") or "none"),
    "Hands|" .. (inventory.equipped(self.id, "hands") ~= "" and inventory.equipped(self.id, "hands") or "none"),
    "Head|" .. (inventory.equipped(self.id, "head") ~= "" and inventory.equipped(self.id, "head") or "none"),
  }
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
  elseif name:find("Shade") then subtitle = "Shade · Qi Gathering"
  elseif name:find("Cave Guardian") then subtitle = "Guardian · Foundation"
  elseif name:find("Wolf") then subtitle = "Beast"
  else return "", 0 end
  local tx, _, tz = world.position(t)
  if (tx - self.x) ^ 2 + (tz - self.z) ^ 2 > 22 * 22 then return "", 0 end
  local hp, max = world.health(t)
  return name .. "\n" .. subtitle, (hp or 0) / math.max(1, max or 1)
end

local function tree_text(title, list, learned)
  local lines = { title, insight .. " insight to spend  ·  stages, breakthroughs and ranks give more" }
  for _, perk in ipairs(list) do
    local id, need, xor = perk[1], perk[5], perk.xor
    local state = learned[id] and "learned" or (((need == "" or learned[need]) and not (xor and learned[xor])) and "available" or "locked")
    lines[#lines + 1] = string.format("node|%s|%s|%s|%d|%d|%s|%d|%s|%s", id, perk[2], state, perk[3], perk[4], need, perk[6], perk[7], perk[8])
  end
  return table.concat(lines, "\n")
end

local function learn(list, learned, id)
  for _, perk in ipairs(list) do
    if perk[1] == id and not learned[id] and (perk[5] == "" or learned[perk[5]]) and not (perk.xor and learned[perk.xor]) then
      if insight < perk[6] then hud.announce("Not enough insight for " .. perk[2] .. ".") return end
      insight = insight - perk[6]
      learned[id] = true
      apply_realm(true)
      hud.announce(perk[2] .. " learned: " .. perk[8])
      if save_game then save_game() end
      sound.play("bell")
      return
    end
  end
end

local function journal_lines()
  local lines = {}
  for _, q in ipairs(QUESTS) do lines[#lines + 1] = (quest_state[q[1]] or "todo") .. "|" .. q[2] .. "|" .. q[3] end
  return table.concat(lines, "\n")
end

local function refresh()
  local r = REALMS[realm]
  set_text("Qi bar", string.format("%s · %s\nQi %d / %d\n#7fe0d4", r.name, STAGES[stage], math.floor(qi), r.need))
  set_value("Qi bar", math.min(1, qi / r.need))
  set_text("Status", status_text())
  local target, health = target_text()
  set_text("Target", target)
  set_value("Target", health)
  if clock >= 0.5 then
    clock = 0
    set_text("Character sheet", sheet_text())
    set_text("Skill tree", tree_text("Cultivation tree", PERKS, perks_learned))
    set_text("Meridians", tree_text("Meridians", MERIDIANS, meridians_learned))
    send("Sect", "journal", journal_lines())
  end
end

-- ---- Using things
local function use_item(name)
  if inventory.count(self.id, name) < 1 or dead then return end
  local r = REALMS[realm]
  local eat = { ["Silver Carp"] = 25, Venison = 35 }
  if name == "Qi Elixir" then
    if qi >= r.need then hud.announce("Your qi is already full.") return end
    inventory.remove(self.id, name, 1)
    qi = math.min(r.need, qi + ELIXIR_QI)
  elseif name == "Jade Dew Pill" then
    inventory.remove(self.id, name, 1)
    world.heal(self.id, 60)
    cure(false)
    sound.play("force field")
  elseif eat[name] then
    inventory.remove(self.id, name, 1)
    world.heal(self.id, eat[name])
    sound.play("coin handle")
  elseif name == "Fire Talisman" then
    if fire_cd > 0 then return end
    inventory.remove(self.id, name, 1)
    fire_cd = 1.5
    local burst = world.find("Qi Burst")
    if burst then world.send(burst, "at", string.format("%.2f,%.2f,%.2f", self.x, self.y - 0.6, self.z)) end
    sound.play("explosion")
    camera.shake(0.4, 0.3)
    for _, id in ipairs(world.overlap(self.x, self.y, self.z, 5.5)) do
      local n = world.name(id) or ""
      if hostile(n) and world.alive(id) then
        world.damage(id, 30)
        world.send(id, "status", "burn|5")
      end
    end
  elseif name == "Ward Talisman" then
    inventory.remove(self.id, name, 1)
    ward = { absorb = 60, left = 20 }
    sound.play("force field")
  elseif name == "Array Flag" then
    inventory.remove(self.id, name, 1)
    formation = { x = self.x, z = self.z, left = 120 }
    send("Qi Array", "at", string.format("%.2f,%.2f,%.2f,120", self.x, self.y - 0.8, self.z))
    sound.play("bell")
    send("Sect", "codex", "qi")
  end
end

-- ---- Effects
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

local function begin_tribulation()
  channel = 0
  tribulation = TRIBULATION
  next_strike = 1.5
  ui.set_text("Notification", "Heavenly tribulation\nLightning gathers. Keep moving!")
  hud.announce("Heavenly tribulation! Keep moving and stay out of the red rings.")
  sound.play("force field")
  camera.shake(0.4, 0.6)
  send("Sect", "codex", "tribulation")
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
  realm, stage, qi, tribulation = realm + 1, 1, 0, 0
  insight = insight + 2
  apply_realm(false)
  ui.set_text("Notification", "Breakthrough!\nYou have entered the " .. REALMS[realm].name .. " realm.")
  hud.announce("Breakthrough! You are now in the " .. REALMS[realm].name .. " realm.")
  camera.shake(0.6, 0.8)
  sound.play("bell")
  objective.complete("breakthrough")
  if realm >= FLY_REALM then hud.announce("You can ride the flying sword: press V.") end
  quest_state["breakthrough"] = "done"
  save_game()
end

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
      world.send(fx.bolt, "fire", string.format("%.2f,%.2f,%.2f,%.2f,%.2f", self.x + fx_ * 0.9, self.y + 0.3, self.z + fz_ * 0.9, fx_ * 22, fz_ * 22))
    end)
  elseif (move == "wind_palm" or move == "nine_dragons") and fx.burst then
    after(0.4, function()
      world.send(fx.burst, "at", string.format("%.2f,%.2f,%.2f", self.x, self.y - 0.6, self.z))
      camera.shake(move == "nine_dragons" and 0.7 or 0.4, 0.4)
    end)
  end
end

-- ---- The valley on the engine's area map (M): the HUD's own Minimap widget stays the small map.
local function valley_map()
  local lines = { "bounds -120 -120 120 120" }
  local function add(l) lines[#lines + 1] = l end
  add("area -120 -120 120 120 #3d5a3a")
  add("area -22 58 22 98 #7d6a52 Azure Cloud Sect")
  add("area -16 -6 4 14 #6b4a3a Bandit camp")
  add("area -12 -92 12 -64 #6a6a78 Shrine")
  add("area -34 28 -14 48 #8a7a55 Willow Village")
  add("area -76 6 -48 34 #3f7aa8 Water Dragon Lake")
  add("area 0 -118 28 -91 #55606e")
  add("area -73 -84 -43 -56 #55606e")
  add("area 53 -52 75 -28 #55606e")
  local road = {}
  for z = 80, -80, -8 do road[#road + 1] = string.format("%.1f %d", 9 * math.sin(z / 34), z) end
  add("path " .. table.concat(road, " "))
  add("label 14 -100 Heaven Peak")
  add("label 41 8 Lost Cart")
  add("title Azure Cloud Sect|VALLEY MAP")
  for _, l in ipairs({ "player You", "giver Elder or quest giver", "smith Merchant Lin", "mat Furnace, anvil, stable", "board Mission board", "home Shrine: rest, return, travel", "vein Spirit vein: meditate here", "target Iron Fist Elder" }) do add("legend " .. l) end
  hud.map_layout(table.concat(lines, "\n"))
  hud.minimap(false)
  hud.map_marker("elder", "giver", 3.5, 77, "", "Elder Mu")
  hud.map_marker("shrine", "target", 0, -78, "", "Iron Fist Elder")
  hud.map_marker("shop", "smith", -24, 38, "", "Merchant Lin")
  hud.map_marker("hua", "giver", 8, 85, "", "Instructor Hua")
  hud.map_marker("furnace", "mat", 13, 80, "", "Alchemy furnace")
  hud.map_marker("anvil", "mat", 15, 87, "", "Anvil")
  hud.map_marker("board", "board", 0, 64, "", "Mission board")
  hud.map_marker("stable", "mat", -30, 44, "", "Stablemaster Gu")
  hud.map_marker("altar", "home", -6, 82, "", "Sect altar")
  hud.map_marker("shrine1", "home", 17, 54, "", "Wayside shrine")
  hud.map_marker("shrine2", "home", -18, 36, "", "Village shrine")
  hud.map_marker("shrine3", "home", 0, -90, "", "Peak shrine")
  hud.map_marker("cave", "gate", 56, -42, "", "Cave of Whispers")
  hud.map_marker("lake", "station", -60, 20, "", "Fishing")
  for i, v in ipairs(veins) do hud.map_marker("vein" .. i, "vein", v[1], v[2], "#7fe0ff", "Spirit vein") end
end

-- ---- Progress is saved at shrines and altars and when something is learned.
local CARRIED = { "Silver", "Qi Elixir", "Jade Dew Pill", "Breakthrough Pill", "Spirit Herb", "Spirit Stone", "Iron Ore", "Arrow", "Fire Talisman", "Ward Talisman", "Array Flag", "Silver Carp", "Venison", "Raw Venison", "Deer Hide", "Wolf Pelt",
  "Azure Robe", "Azure Robe +1", "Azure Robe +2", "Azure Robe +3", "Iron Gloves", "Iron Gloves +1", "Iron Gloves +2", "Tiger Gloves", "Jade Circlet", "Dragon Crown", "Cloud Silk Robe" }
local WORN = { "body", "hands", "head" }
local function keys_of(t) local out = {} for k in pairs(t) do out[#out + 1] = k end return table.concat(out, ",") end

save_game = function()
  local counts, worn = {}, {}
  for _, name in ipairs(CARRIED) do local n = inventory.count(self.id, name) if n > 0 then counts[#counts + 1] = name .. "=" .. n end end
  for _, slot in ipairs(WORN) do local w = inventory.equipped(self.id, slot) if w ~= "" then worn[#worn + 1] = slot .. "=" .. w end end
  save.set("azure-cloud-sect", string.format("realm=%d;stage=%d;qi=%.1f;insight=%d;spawn=%.2f,%.2f,%.2f;perks=%s;mer=%s;arts=%s;aff=%s;robe=%d;hair=%d;cut=%d;carried=%s;worn=%s",
    realm, stage, qi, insight, spawn[1], spawn[2], spawn[3], keys_of(perks_learned), keys_of(meridians_learned), keys_of(arts_learned), affinity, robe, hair, cut, table.concat(counts, ";"), table.concat(worn, ";")))
end

local function load_game()
  local text = save.get("azure-cloud-sect")
  if not text or text == "" then return false end
  local f = {}
  for k, v in text:gmatch("(%w+)=([^;]*)") do f[k] = v end
  realm = math.max(1, math.min(#REALMS, tonumber(f.realm) or 1))
  stage = math.max(1, math.min(4, tonumber(f.stage) or 1))
  qi = tonumber(f.qi) or 0
  insight = tonumber(f.insight) or insight
  for id in (f.perks or ""):gmatch("[^,]+") do perks_learned[id] = true end
  for id in (f.mer or ""):gmatch("[^,]+") do meridians_learned[id] = true end
  for move in (f.arts or ""):gmatch("[^,]+") do arts_learned[move] = true if move ~= "guardian" then melee.unlock(move) end end
  affinity = f.aff or ""
  robe = math.max(1, math.min(#ROBES, tonumber(f.robe) or 1))
  hair = math.max(1, math.min(#HAIRS, tonumber(f.hair) or 1))
  cut = math.max(1, math.min(#CUTS, tonumber(f.cut) or 1))
  return true, f
end

-- The bag as saved (counts, with the gear that was worn). Items are written "Name=count" separated by ";", which the key=value
-- reader above cannot split, so they are read here from the raw text.
local function load_bag()
  local text = save.get("azure-cloud-sect") or ""
  local carried = text:match("carried=(.-);worn=") or text:match("carried=(.*)$") or ""
  local have = {}
  for name, n in carried:gmatch("([%w +]+)=(%d+)") do have[name] = tonumber(n) end
  for _, slot in ipairs(WORN) do inventory.unequip(self.id, slot) end
  for _, name in ipairs(CARRIED) do
    local want, now = have[name] or 0, inventory.count(self.id, name)
    if want > now then inventory.add(self.id, name, want - now) elseif want < now then inventory.remove(self.id, name, now - want) end
  end
  for slot, item in (text:match("worn=(.*)$") or ""):gmatch("(%a+)=([%w +]+)") do inventory.equip(self.id, slot, item) end
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
  inventory.add(self.id, "Azure Robe", 1)
  inventory.equip(self.id, "body", "Azure Robe")
  inventory.add(self.id, "Qi Elixir", 3)
  inventory.add(self.id, "Silver", 40 + math.floor(tonumber(props.silver) or 0))
  inventory.add(self.id, "Jade Dew Pill", 2)
  inventory.add(self.id, "Breakthrough Pill", 1)
  inventory.add(self.id, "Arrow", 12)
  insight = insight + 2 * (realm - 1)
  spawn = { self.x, self.y + 0.5, self.z }
  local loaded = false
  if (tonumber(props.realm) or 1) == 1 and (tonumber(props.silver) or 0) == 0 then
    local ok, f = load_game()
    if ok then
      loaded = true
      load_bag()
      local x, y, z = (f.spawn or ""):match("([%-%d.]+),([%-%d.]+),([%-%d.]+)")
      if x then
        spawn = { tonumber(x), tonumber(y), tonumber(z) }
        world.set_position(self.id, spawn[1], spawn[2], spawn[3])
      end
      hud.announce("Progress loaded. Pray at a shrine to save again.")
    end
  end
  dress()
  apply_realm(true)
  inventory.select(self.id, 1)
  hud.pause_menu(true)   -- Esc opens settings and the key list
  for marker, entity in pairs({ ["Elder Mu"] = "Elder Mu", ["Bandit camp"] = "Bandit Brawler", ["Shrine"] = "Iron Fist Elder" }) do
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
  after(0.4, function()
    local list = {}
    for move in pairs(arts_learned) do list[#list + 1] = move end
    send("Folk", "arts", table.concat(list, ","))
    send("Folk", "affinity", affinity)
    send("Folk", "realm", realm)
    send("Sect", "realm", realm)
  end)
  refresh()
end

-- ---- Messages from the other scripts
function on_message(name, value)
  value = tostring(value)
  if name == "kill" then qi = math.min(REALMS[realm].need, qi + (tonumber(value) or 20))
  elseif name == "qi" then qi = math.min(REALMS[realm].need, qi + (tonumber(value) or 0))
  elseif name == "slain" then send("Sect", "slain", value)
  elseif name == "partner" then partner = value == "1"
  elseif name == "insight" then insight = insight + (tonumber(value) or 1)
  elseif name == "hours" then day_hours = tonumber(value) or day_hours
  elseif name == "inside" then
    inside = value
    ui.set_visible("Waypoints", value == "")   -- the valley's markers mean nothing inside a room
  elseif name == "prompt" then prompt_text, prompt_left = value, 0.45
  elseif name == "talk" then
    -- The number keys pick a reply and are also the skill keys, so mana is set aside while talking (a skill needs mana).
    if value == "1" and not held_mana then
      local mana = melee.mana(0)
      held_mana = mana
      melee.mana(-mana)
      talking_now = true
    elseif value == "0" then
      if held_mana then melee.mana(held_mana) held_mana = nil end
      talking_now = false
    end
  elseif name == "learn_art" then
    arts_learned[value] = true
    if value ~= "guardian" then melee.unlock(value) end
    ui.set_text("Notification", "Art learned\n" .. value:gsub("_", " "))
    save_game()
  elseif name == "affinity" then affinity = value save_game()
  elseif name == "rest" then
    local x, y, z = value:match("^([%-%d.]+),([%-%d.]+),([%-%d.]+)$")
    if x then spawn = { tonumber(x), tonumber(y), tonumber(z) } end
    world.heal(self.id, 999)
    if held_mana then held_mana = 999 else melee.mana(999) end
    cure(true)
    save_game()
    hud.announce("You rest. Health and mana restored; you will return here.")
    sound.play("bell")
  elseif name == "mirror" then
    if value == "1" and not creating then
      creating = true
      if not held_mana then held_mana = melee.mana(0) melee.mana(-held_mana) end
      talking_now = true
      mirror_text()
    end
  elseif name == "robe" then
    robe = robe % #ROBES + 1
    dress()
    hud.announce(ROBES[robe][1] .. " robes")
    save_game()
  end
end

-- ---- Hits and deaths
-- What an enemy's blow can leave on you: [name pattern] = { affliction, seconds, chance }.
local INFLICT = {
  { "Qi Adept", "poison", 8, 0.55 }, { "Spearman", "bleed", 5, 0.45 }, { "Iron Fist", "curse", 9, 0.5 },
  { "Wolf", "bleed", 5, 0.5 }, { "Shade", "chill", 6, 0.5 }, { "Cave Guardian", "burn", 5, 0.5 },
}

function on_damaged(amount, attacker)
  if channel > 0 then fail_breakthrough() end
  if ward and amount then
    local soak = math.min(amount, ward.absorb)
    world.heal(self.id, soak)
    ward.absorb = ward.absorb - soak
    if ward.absorb <= 0 then ward = nil end
  end
  if attacker and world.alive(attacker) then
    local who = world.name(attacker) or ""
    for _, rule in ipairs(INFLICT) do
      if who:find(rule[1]) and math.random() < rule[4] then afflict(rule[2], rule[3]) hud.announce(AFFLICTIONS[rule[2]].label .. "!") break end
    end
    -- An arc on the side the blow came from, relative to where the camera looks.
    local ax, _, az = world.position(attacker)
    local fx_, fz_ = camera.forward()
    local dx, dz = ax - self.x, az - self.z
    local forward = dx * fx_ + dz * fz_
    local right = -dx * fz_ + dz * fx_
    hit_flip = 1 - hit_flip   -- a tiny change so a repeat from the same side still counts as new text
    ui.set_text("Damage direction", string.format("%.2f", math.deg(math.atan(right, forward)) + hit_flip * 0.01))
  end
end

-- Your arts take on your affinity: flame burns, frost chills, thunder stuns.
local AFFINE = { flame = "burn|5", frost = "chill|4", thunder = "stun|1.2" }
function on_melee_hit(target, move, damage, outcome)
  if outcome ~= "hit" or affinity == "" or not QI_ARTS[move] then return end
  if world.alive(target) then world.send(target, "status", AFFINE[affinity]) end
end

function on_death()
  dead = true
  if held_mana then melee.mana(held_mana) held_mana = nil end
  talking_now = false
  tribulation = 0
  land()
  channel = 0
  meditating = false
  ui.set_text("Dialogue", "")
  ui.set_text("Death screen", "YOU HAVE FALLEN\nYour qi scatters on the wind.\nRise again")
end

local function respawn()
  dead = false
  ui.set_text("Death screen", "")
  melee.revive()
  cure(true)
  world.set_position(self.id, spawn[1], spawn[2], spawn[3])
  world.set_velocity(self.id, 0, 0, 0)
  qi = qi * 0.5
  deviation = 0
  send("Valley", "arrive", string.format("%.2f,%.2f,%.2f|", spawn[1], spawn[2], spawn[3]))
end

function on_ui(name, value)
  value = tostring(value)
  if name == "objective" then
    local kind, id = value:match("^(%a+):(.+)$")
    if kind == "start" then quest_state[id] = "active"
    elseif kind == "complete" then quest_state[id] = "done" end
  elseif name == "Death screen" and value == "respawn" then respawn()
  elseif name == "Skill tree" and value:sub(1, 5) == "node:" then learn(PERKS, perks_learned, value:sub(6))
  elseif name == "Meridians" and value:sub(1, 5) == "node:" then learn(MERIDIANS, meridians_learned, value:sub(6))
  elseif name == "Inventory" and value:sub(1, 4) == "use:" then use_item(value:sub(5))
  elseif (name == "Character sheet" or name == "Skill tree" or name == "Meridians") and value == "close" then ui.close(name) end
end

-- ---- Sound: the engine's own music and ambience layers. Tension near a fight (or a tribulation), calm exploring music
-- otherwise, silence when dead; wind always, wildlife in the wild, a settled hum inside the sect and the village.
local function audio_tick(dt)
  audio_clock = audio_clock + dt
  if audio_clock < 0.5 then return end
  audio_clock = 0
  local fight = tribulation > 0
  if not fight and not dead then
    for _, id in ipairs(world.overlap(self.x, self.y, self.z, 14)) do
      local n = world.name(id) or ""
      if hostile(n) and world.alive(id) then fight = true break end
    end
  end
  local m = dead and "off" or fight and "tension" or (day_hours >= 20 or day_hours < 5) and "night" or "explore"
  if m ~= mood then mood = m audio.music(m) end
  local settled = false
  for _, name in ipairs({ "Elder Mu", "Merchant Lin" }) do
    local id = world.find(name)
    if id then
      local x, _, z = world.position(id)
      if (x - self.x) ^ 2 + (z - self.z) ^ 2 < 22 * 22 then settled = true end
    end
  end
  if inside == "" then
    audio.ambience("wind", math.min(0.8, 0.3 + math.max(0, self.y - 15) * 0.02))
    audio.ambience("wildlife", settled and 0.1 or 0.6)
    audio.ambience("settlement", settled and 0.8 or 0)
  else
    audio.ambience("settlement", inside == "Great Hall" and 0.5 or 0)
    audio.ambience("wildlife", 0)
  end
end

-- ---- Each tick
function on_tick(dt)
  clock_total = clock_total + dt
  prompt_left = prompt_left - dt
  if dead then audio_tick(dt) return end
  clock = clock + dt
  if creating then
    local changed = false
    for n, key in ipairs({ "1", "2", "3", "4" }) do
      if input.pressed(key) and clock_total - (last_press["m" .. key] or -1) > 0.3 then
        last_press["m" .. key] = clock_total
        changed = true
        if n == 1 then robe = robe % #ROBES + 1
        elseif n == 2 then hair = hair % #HAIRS + 1
        elseif n == 3 then cut = cut % #CUTS + 1
        else
          set_language(LANG == "zh" and "en" or "zh")
          shown = {}
          for _, system in ipairs({ "Sect", "Valley", "Folk", "Economy" }) do local id = world.find(system) if id then world.send(id, "lang", LANG) end end
        end
      end
    end
    if changed then dress() mirror_text() end
    if tapped("interact") then
      creating = false
      ui.set_text("Dialogue", "")
      if held_mana then melee.mana(held_mana) held_mana = nil end
      talking_now = false
      save_game()
    end
  end
  fire_cd, guardian_cd = math.max(0, fire_cd - dt), math.max(0, guardian_cd - dt)
  audio_tick(dt)
  if deviation > 0 then deviation = math.max(0, deviation - dt) end
  local r = REALMS[realm]
  local vx, vz = self.vx, self.vz
  local vy = self.vy or 0
  local still = (vx * vx + vz * vz) < 2.25   -- under 1.5 m/s (an idle fighter shuffles a little)

  -- Meditation: hold N while standing still. A spirit vein triples it; a planted array doubles it.
  meditating = input.action_down("meditate") and still and not flying and channel == 0
  in_vein = false
  for _, v in ipairs(veins) do
    if (v[1] - self.x) ^ 2 + (v[2] - self.z) ^ 2 < VEIN_RADIUS * VEIN_RADIUS then in_vein = true break end
  end
  local array = false
  if formation then
    formation.left = formation.left - dt
    if formation.left <= 0 then formation = nil
    elseif (formation.x - self.x) ^ 2 + (formation.z - self.z) ^ 2 < 36 then array = true end
  end
  if meditating and qi < r.need then
    qi = math.min(r.need, qi + MEDITATE_QI * (1 + total_of("med")) * (deviation > 0 and 0.4 or 1) * (in_vein and VEIN_BONUS or array and 2 or 1) * (partner and 1.8 or 1) * dt)
    if partner then
      dual_time = dual_time + dt
      if dual_time >= 40 then dual_time = 0 insight = insight + 1 hud.announce("Dual cultivation: your bond with Lan deepens. Insight +1") end
    end
    if qi >= 20 then objective.complete("gather-qi") end
    send("Sect", "codex", "qi")
  end
  if ward then ward.left = ward.left - dt if ward.left <= 0 then ward = nil end end

  if input.action_pressed("controls") then hud.open_settings() end

  -- Stages within a realm: each quarter of the qi bar is a stage, and each is a little stronger.
  local reached = math.min(4, math.floor(qi / r.need * 4) + 1)
  if reached > stage then
    stage = reached
    insight = insight + 1
    apply_realm(true)
    ui.set_text("Notification", r.name .. "\n" .. STAGES[stage] .. " stage reached")
  end

  -- Things you carry, on keys: Qi Elixir (H), Jade Dew Pill (Z), talismans (8 and 9).
  if tapped("elixir") then use_item("Qi Elixir") end
  if tapped("heal") then use_item("Jade Dew Pill") end
  if tapped("talisman1") then use_item("Fire Talisman") end
  if tapped("talisman2") then use_item("Ward Talisman") end

  -- Scroll arts, once learned: keys 5, 6, 7; the Spirit Guardian on 0.
  if not flying and channel == 0 and not talking_now then
    for action, move in pairs(ART_KEYS) do
      if arts_learned[move] and input.action_pressed(action) then melee.perform(move) end
    end
    if arts_learned.guardian and tapped("art4") and guardian_cd <= 0 and melee.mana(0) >= 40 then
      melee.mana(-40)
      guardian_cd = 40
      local fx_, fz_ = camera.forward()
      world.spawn("Spirit Guardian", self.x + fx_ * 2, self.y + 0.6, self.z + fz_ * 2)
      sound.play("force field")
      hud.announce("A spirit guardian answers your call.")
    end
  end

  -- Qinggong: from Foundation, a second jump in the air; from Golden Core, a third.
  local airborne = math.abs(vy) > 0.6
  if not airborne then air_jumps = 0
  elseif input.action_pressed("jump") and not flying and air_jumps < realm - 2 then
    air_jumps = air_jumps + 1
    world.set_velocity(self.id, vx, 6.2, vz)
    sound.play("cloth swish")
    send("Sect", "codex", "qinggong")
  end

  -- Wall run: airborne and moving into a wall, run up it for a moment (from Qi Gathering; it costs qi).
  if not airborne or flying or realm < 2 then wall_t = 0
  else
    local sp = math.sqrt(vx * vx + vz * vz)
    if sp > 2 and wall_t < 1.3 and qi > 3 then
      local dx, dz = vx / sp, vz / sp
      local hit = world.raycast(self.x + dx * 0.4, self.y, self.z + dz * 0.4, dx, 0, dz, 0.7)
      if hit and math.abs(hit.ny or 0) < 0.35 then
        wall_t = wall_t + dt
        qi = math.max(0, qi - 4 * dt)
        world.set_velocity(self.id, vx * 0.15, 3.6, vz * 0.15)
        send("Sect", "codex", "qinggong")
      end
    end
  end

  -- Cloud rope: a grapple to whatever the camera points at (28 m); it pulls you there. Costs qi, recharges in 3 s.
  grapple_cd = math.max(0, grapple_cd - dt)
  if input.action_pressed("grapple") and grapple_cd <= 0 and qi >= 12 and realm >= 2 and not flying and not talking_now then
    local fx_, fz_ = camera.forward()
    local hit = world.raycast(self.x, self.y + 1.2, self.z, fx_, 0.2, fz_, 28)
    if hit then
      local dx, dy, dz = hit.x - self.x, hit.y - self.y, hit.z - self.z
      local d = math.max(0.1, math.sqrt(dx * dx + dy * dy + dz * dz))
      qi = qi - 12
      grapple_cd = 3
      grapple = { x = hit.x - dx / d * 1.3, y = hit.y - dy / d * 1.3 + 0.4, z = hit.z - dz / d * 1.3, left = 0.5 }
      sound.play("cloth swish")
      camera.shake(0.15, 0.2)
    else
      hud.announce("Nothing in reach to grapple.")
    end
  end
  if grapple then
    grapple.left = grapple.left - dt
    local dx, dy, dz = grapple.x - self.x, grapple.y - self.y, grapple.z - self.z
    local d = math.sqrt(dx * dx + dy * dy + dz * dz)
    if grapple.left <= 0 or d < 1.2 then
      grapple = nil
      world.set_velocity(self.id, vx * 0.3, math.max(vy, 1), vz * 0.3)
    else
      world.set_velocity(self.id, dx / d * 24, dy / d * 24 + 2, dz / d * 24)
    end
  end

  -- Afflictions tick: poison, bleeding and burning cost health; every one wears off.
  for name, e in pairs(effects) do
    e.left = e.left - dt
    local def = AFFLICTIONS[name]
    if def.dps then dot_acc = dot_acc + def.dps * dt end
    if e.left <= 0 then
      effects[name] = nil
      if name == "curse" or name == "chill" then apply_realm(true) end
    end
  end
  if dot_acc >= 1 then
    local whole = math.floor(dot_acc)
    dot_acc = dot_acc - whole
    world.damage(self.id, whole)
  end

  -- Stances (Y): the next weapon, its own moves on the same buttons. A bow spends an arrow a shot.
  if tapped("stance") and channel == 0 and not flying and not talking_now then
    local at = 1
    for i, key in ipairs(STANCE_ORDER) do if key == stance then at = i end end
    local nextkey = STANCE_ORDER[at % #STANCE_ORDER + 1]
    set_stance(nextkey)
    hud.announce(STANCE_LABEL[nextkey] .. " stance")
    sound.play("blade draw")
  end
  if stance == "bow" then
    local have = inventory.count(self.id, "Arrow")
    if have == 0 and not bow_dry then
      bow_dry = true
      for _, m in ipairs(BOW_SHOTS) do melee.relock(m) end
      hud.announce("Out of arrows.")
    elseif have > 0 and bow_dry then
      bow_dry = false
      for _, m in ipairs(BOW_SHOTS) do melee.unlock(m) end
    end
    local now = melee.move()
    if (now == "bw_shot" or now == "bw_power") and now ~= bow_move then inventory.remove(self.id, "Arrow", 1) end
    bow_move = now
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
  if tapped("fly") then
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
    qi = qi - FLY_QI * (1 - total_of("fly")) * dt
    if qi <= 0 then qi = 0; land() hud.announce("Your qi ran dry. The sword falls.")
    else
      local fx_, fz_ = camera.forward()
      local forward = input.action("move_y")
      local strafe = input.action("move_x")
      local up = 0
      if input.action_down("jump") then up = 1 elseif input.action_down("crouch") then up = -1 end
      world.set_velocity(self.id, (fx_ * forward + fz_ * strafe) * FLY_SPEED, up * 7, (fz_ * forward - fx_ * strafe) * FLY_SPEED)
    end
  end

  -- The readouts only need to change a few times a second.
  refresh_clock = refresh_clock + dt
  if refresh_clock >= 0.1 then refresh_clock = 0 refresh() end
  qi_effects()
end
