-- GATEBREAKER M2: the Ledger, Han Seo-jin's system. It keeps the hunter's
-- level, XP, stats, gold, fangs, dagger upgrades, rank, quests and the day,
-- saves them (save key "gb"), turns stats into combat numbers (melee.tune
-- on the hunter), and runs the windows: rewards, level-ups, the status
-- window (C), the Gate Board and the smith.
-- @prop fast false
--
-- props.fast (tests): reward and level-up windows confirm themselves and
-- points go into SEN.
--
-- Items (M3.5): kills drop gear and potions (a beam in the rarity's colour);
-- walking over one picks it up. I opens the bag: pick an item (1-9), Enter
-- wears it, X sells it. Gear shows on the hunter (world.wear) and adds to
-- his numbers; each Gate drops its own set. 1 and 2 drink potions. The
-- smith upgrades worn gear and sells potions.
--
-- Messages in: kill ("prefab|x|z"), gate_clear ("gate:grade:seconds:damage:par"),
-- gate_fail, hub (the hunter is back in the hub), board, smith, daily_done,
-- rest, penalty_done, bound (a shadow's prefab name), entered (the Gate the
-- Director just sent the hunter into). Out: Director
-- enter_gate (n), rewards_done (n, or "rankup:D" after a rank test), penalty, shadows ("sen,tank,striker,
-- archer"); Hub busy (true while a menu is open).

local STATS = { "STR", "AGI", "VIT", "INT", "SEN" }
-- Cumulative XP for Lv.2, 3, 4, 5, 6 ... 25, the cap. Past Lv.15 each level
-- costs 300 more than the last (Lv.16 +3100 ... Lv.25 +5800).
local LEVELS = { 150, 450, 900, 1500, 2300, 3300, 4500, 5900, 7500, 9300, 11300, 13500, 16000, 18800,
  21900, 25300, 29000, 33000, 37300, 41900, 46800, 52000, 57500, 63300 }
local MAX_LEVEL = #LEVELS + 1
local POINTS_PER_LEVEL = 3
local KILL = { -- xp, gold, fangs
  ["Goblin Grunt"] = { 12, 4, 1 },
  ["Goblin Archer"] = { 14, 5, 1 },
  ["Goblin Shieldbearer"] = { 30, 10, 2 },
  ["Hobgoblin"] = { 35, 12, 3 },
  ["Goblin Shaman"] = { 25, 8, 2 },
  ["Goblin Chieftain"] = { 120, 40, 8 },
  ["Hobgoblin Brute"] = { 180, 60, 8 },
  ["Goblin Warlord"] = { 300, 100, 8 },
  ["Drowned Goblin"] = { 20, 7, 1 },
  ["Ice Ghoul"] = { 24, 8, 1 },
  ["Armored Knight"] = { 60, 20, 3 },
  ["Cultist Caster"] = { 45, 15, 2 },
  ["Drowned Priest"] = { 500, 160, 10 },
  ["Frost Knight Commander"] = { 750, 240, 12 },
  ["Castle Imp"] = { 40, 14, 1 },
  ["Bloodstone Knight"] = { 110, 36, 4 },
  ["Blood Mage"] = { 90, 30, 3 },
  ["Crimson Castellan"] = { 1300, 400, 14 },
  ["Hollow"] = { 55, 18, 2 },
  ["Eclipse Warden"] = { 160, 50, 5 },
  ["Eclipse Herald"] = { 2200, 650, 18 },
}
local GATES = {
  { name = "Goblin Cave", rank = "E", xp = 100, gold = 80 },
  { name = "Subway Tunnel", rank = "E", xp = 150, gold = 140 },
  { name = "Goblin Fortress", rank = "D", xp = 300, gold = 300 },
  { name = "Flooded Temple", rank = "C", xp = 500, gold = 450 },
  { name = "Ice Fortress", rank = "B", xp = 800, gold = 700 },
  { name = "Bloodstone Citadel", rank = "A", xp = 1300, gold = 1100 },
  { name = "Eclipse Spire", rank = "S", xp = 2000, gold = 1600 },
}
-- Hunter ranks in order, and what each later Gate asks (GAME_DESIGN.md 5.5).
local RANKS = { E = 1, D = 2, C = 3, B = 4, A = 5, S = 6 }
local NEEDS = { [3] = { "E", 5 }, [4] = { "D", 8 }, [5] = { "C", 11 }, [6] = { "B", 15 }, [7] = { "A", 20 } }
-- Dagger +1..+5: gold, fangs. Each level is +8% damage.
local UPGRADES = { { 100, 6 }, { 200, 12 }, { 350, 20 }, { 500, 30 }, { 700, 40 } }
-- A shadow's role by the enemy it was (GAME_DESIGN.md 5.4); one of each.
local ROLE = {
  ["Goblin Shieldbearer"] = "sh1", ["Hobgoblin Brute"] = "sh1",
  ["Hobgoblin"] = "sh2", ["Goblin Chieftain"] = "sh2", ["Goblin Warlord"] = "sh2",
  ["Goblin Shaman"] = "sh3",
  ["Armored Knight"] = "sh1", ["Cultist Caster"] = "sh3",
  ["Drowned Priest"] = "sh2", ["Frost Knight Commander"] = "sh2",
  ["Bloodstone Knight"] = "sh1", ["Eclipse Warden"] = "sh1", ["Blood Mage"] = "sh3",
  ["Crimson Castellan"] = "sh2", ["Eclipse Herald"] = "sh2",
}
-- The clear grade's bonus on the Gate's own XP and gold.
local GRADE_BONUS = { S = 0.5, A = 0.25, B = 0.1, C = 0 }
local QUESTS = {
  "Clear the Goblin Cave (Gate Board)",
  "Upgrade your daggers at Smith Kang",
  "Clear the Subway Tunnel (Gate Board)",
  "Reach Lv.5 to take the D-rank test",
  "Pass the D-rank test: the Goblin Fortress",
  "Reach Lv.8 to enter the Flooded Temple (C-rank Gate)",
  "Clear the Flooded Temple to rank up to C",
  "Reach Lv.11 to take the B-rank test",
  "Pass the B-rank test: the Ice Fortress",
  "Reach Lv.15 to take the A-rank test",
  "Pass the A-rank test: the Bloodstone Citadel",
  "Reach Lv.20 to take the S-rank test",
  "Pass the S-rank test: the Eclipse Spire",
  "Rank S. The Double Gate is waiting.",
}

local s = {} -- the saved state
local hero
local clock = 0
local in_hub = false
local menu         -- nil, "board", "smith", "status"
local queue = {}   -- reward windows still to show: {title, body, kind}
local current      -- the one showing
local current_t = 0
local reward_gate = 0
local undo         -- stats before a level-up window's spending
local run = { xp = 0, gold = 0, fangs = 0, kills = 0 }
local close_at -- a passing window closes itself then

local function defaults()
  return { lv = 1, xp = 0, pts = 0, str = 10, agi = 10, vit = 10, int = 10, sen = 10,
    gold = 0, fang = 0, dag = 0, rank = "E", q = 1, day = 1, daily = 0, c1 = 0, c2 = 0, c3 = 0, c4 = 0, c5 = 0, c6 = 0, c7 = 0, sk = 0,
    sh1 = "", sh2 = "", sh3 = "", bag = "", eq = "/////", p1 = 2, p2 = 1, look = 0, wd = 0, pity = 0 }
end

local KEYS = { "lv", "xp", "pts", "str", "agi", "vit", "int", "sen", "gold", "fang", "dag", "rank", "q", "day", "daily", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "sk", "sh1", "sh2", "sh3",
  "bag", "eq", "p1", "p2", "look", "wd", "pity" }
local TEXT = { rank = true, sh1 = true, sh2 = true, sh3 = true, bag = true, eq = true }
local STAT_KEY = { "str", "agi", "vit", "int", "sen" }

local function load()
  s = defaults()
  local text = save.get("gb")
  if not text then return end
  for k, v in text:gmatch("(%w+)=([^;]*)") do
    if s[k] ~= nil then s[k] = TEXT[k] and v or (tonumber(v) or s[k]) end
  end
  -- A hunter already past a quest's level (an older save) moves on.
  if s.q == 6 and s.lv >= 8 then s.q = 7 end
  if s.q == 8 and s.lv >= 11 then s.q = 9 end
  if s.q == 10 and s.lv >= 15 then s.q = 11 end
  if s.q == 12 and s.lv >= 20 then s.q = 13 end
end

local function store()
  local parts = {}
  for _, k in ipairs(KEYS) do parts[#parts + 1] = k .. "=" .. tostring(s[k]) end
  save.set("gb", table.concat(parts, ";"))
end

-- Items ----------------------------------------------------------------------
-- An item is "slot-rarity-set-seed-plus": its stats follow from those, so
-- the save stays short. Potions are counted (p1, p2), not bagged.
local RARITY = { { "Common", "#d9d9d9", 1 }, { "Rare", "#4aa8ff", 1.6 }, { "Epic", "#b866ff", 2.4 }, { "Legendary", "#ffb020", 3.5 } }
local SLOT = {
  { name = "Body armor", stat = "health", base = 30, model = 214 },
  { name = "Bracers", stat = "damage", base = 0.04, model = 215 },
  { name = "Trousers", stat = "mana", base = 15, model = 216 },
  { name = "Boots", stat = "speed", base = 0.02, model = 217 },
  { name = "Ring", stat = "crit", base = 0.02 },
  { name = "Necklace", stat = "skill", base = 0.05 },
}
local STAT_KEYS = { "health", "damage", "mana", "speed", "crit", "skill" }
local BASE = {}
for _, slot in ipairs(SLOT) do BASE[slot.stat] = slot.base end
-- Each Gate's set: its colour on the hunter and its 2- and 4-piece bonus.
local SETS = {
  { name = "Cave Stalker", tint = "", two = { crit = 0.05 }, four = { damage = 0.12 } },
  { name = "Tunnel Runner", tint = "#8aa6d6", two = { speed = 0.05 }, four = { skill = 0.2 } },
  { name = "Fortress Guard", tint = "#d0786a", two = { health = 50 }, four = { health = 100, damage = 0.08 } },
  { name = "Tide Warden", tint = "#4fa3a0", two = { mana = 30 }, four = { skill = 0.25, crit = 0.05 } },
  { name = "Frost Bastion", tint = "#bfd8f0", two = { health = 80 }, four = { damage = 0.15, speed = 0.05 } },
  -- The A Gate's set hits hard and crits; the S Gate's feeds skills and speed.
  { name = "Bloodstone Reaver", tint = "#a0262e", two = { damage = 0.1 }, four = { crit = 0.1, health = 120 } },
  { name = "Eclipse Regalia", tint = "#6a4aa0", two = { skill = 0.15, mana = 40 }, four = { damage = 0.18, speed = 0.06 } },
}
-- Wardrobe looks over the gear's own colours (unlocked: wd bits).
local LOOKS = { { "Your gear's own", nil }, { "Shadow black", "#4a4560" }, { "Cave brown", "#b89a78" }, { "Tunnel steel", "#8aa6d6" }, { "Fortress red", "#d0786a" },
  { "Temple teal", "#4fa3a0" }, { "Frost white", "#bfd8f0" }, { "Bloodstone crimson", "#a0262e" }, { "Eclipse violet", "#6a4aa0" } }
local MAX_BAG, MAX_PLUS = 40, 10
local POTION_HEAL, POTION_MANA, POTION_PRICE = 0.4, 50, 30

local function parse(code)
  local a, b, c, d, e = (code or ""):match("^(%d)-(%d)-(%d)-(%d+)-(%d+)$")
  if not a then return nil end
  return { slot = tonumber(a), rarity = tonumber(b), set = tonumber(c), seed = tonumber(d), plus = tonumber(e) }
end
local function encode(it) return string.format("%d-%d-%d-%d-%d", it.slot, it.rarity, it.set, it.seed, it.plus) end

-- Its stats: the slot's main stat (by rarity, the Gate's tier and +level),
-- and one extra stat per rarity step, picked by its seed.
local function item_stats(it)
  local slot = SLOT[it.slot]
  local tier = 1 + 0.5 * (it.set - 1)
  local out = { [slot.stat] = slot.base * RARITY[it.rarity][3] * tier * (1 + 0.1 * it.plus) }
  local seed = it.seed
  for _ = 1, it.rarity - 1 do
    seed = (seed * 1103515245 + 12345) % 2147483648
    local key = STAT_KEYS[seed % #STAT_KEYS + 1]
    if key == slot.stat then key = STAT_KEYS[(seed + 1) % #STAT_KEYS + 1] end
    out[key] = (out[key] or 0) + BASE[key] * 0.5 * tier
  end
  return out
end

local function stat_text(key, v)
  if key == "health" or key == "mana" then return string.format("+%d %s", math.floor(v + 0.5), key) end
  local name = { damage = "damage", speed = "speed", crit = "crit", skill = "skill damage" }
  return string.format("+%d%% %s", math.floor(v * 100 + 0.5), name[key])
end

local function item_name(it)
  return RARITY[it.rarity][1] .. " " .. SETS[it.set].name .. " " .. SLOT[it.slot].name .. (it.plus > 0 and (" +" .. it.plus) or "")
end

local function describe(it)
  if not it then return "(none)" end
  local parts = {}
  local st = item_stats(it)
  for _, key in ipairs(STAT_KEYS) do
    if st[key] then parts[#parts + 1] = stat_text(key, st[key]) end
  end
  return item_name(it) .. "  (" .. table.concat(parts, ", ") .. ")"
end

local function sell_price(it) return math.floor(15 * RARITY[it.rarity][3] * (1 + 0.5 * (it.set - 1)) * (1 + 0.3 * it.plus)) end

local function bag_items()
  local list = {}
  for code in s.bag:gmatch("[^/]+") do
    local it = parse(code)
    if it then list[#list + 1] = it end
  end
  -- Sorted by slot, then the best first.
  table.sort(list, function(a, b)
    if a.slot ~= b.slot then return a.slot < b.slot end
    if a.rarity ~= b.rarity then return a.rarity > b.rarity end
    return a.plus > b.plus
  end)
  return list
end
local function set_bag(list)
  local parts = {}
  for _, it in ipairs(list) do parts[#parts + 1] = encode(it) end
  s.bag = table.concat(parts, "/")
end
local function equipped()
  local eq, i = {}, 0
  for code in (s.eq .. "/"):gmatch("([^/]*)/") do
    i = i + 1
    eq[i] = parse(code)
  end
  return eq
end
local function set_equipped(eq)
  local parts = {}
  for i = 1, #SLOT do parts[i] = eq[i] and encode(eq[i]) or "" end
  s.eq = table.concat(parts, "/")
end

-- What the worn gear adds, set bonuses included.
local function gear_totals()
  local total = { health = 0, damage = 0, mana = 0, speed = 0, crit = 0, skill = 0 }
  local pieces = {}
  for _, it in pairs(equipped()) do
    for key, v in pairs(item_stats(it)) do total[key] = total[key] + v end
    pieces[it.set] = (pieces[it.set] or 0) + 1
  end
  for set, n in pairs(pieces) do
    for key, v in pairs(n >= 2 and SETS[set].two or {}) do total[key] = total[key] + v end
    for key, v in pairs(n >= 4 and SETS[set].four or {}) do total[key] = total[key] + v end
  end
  return total, pieces
end

-- What the stats do, in numbers (GAME_DESIGN.md 5.3), gear included.
local function derived()
  local g = gear_totals()
  return {
    damage = (1 + 0.05 * (s.str - 10)) * (1 + 0.08 * s.dag) * (1 + g.damage),
    speed = math.min(1.5, 1 + 0.02 * (s.agi - 10) + g.speed),
    health = math.floor(220 + 15 * (s.vit - 10) + g.health),
    mana = math.floor(100 + 6 * (s.int - 10) + g.mana),
    skill = 1 + 0.06 * (s.int - 10) + g.skill,
    crit = math.min(0.75, 0.05 + 0.015 * (s.sen - 10) + g.crit),
  }
end

-- The gear the hunter wears, shown: body (Epic and up add the pauldron),
-- bracers, trousers and boots, in the wardrobe look or the set's colour.
local function wear()
  if not hero then return end
  local eq = equipped()
  local look = LOOKS[s.look + 1] and LOOKS[s.look + 1][2]
  local models = {}
  for i = 1, 4 do
    local it = eq[i]
    if it then
      local tint = look or SETS[it.set].tint
      local suffix = tint ~= "" and (":" .. tint) or ""
      models[#models + 1] = SLOT[i].model .. suffix
      if i == 1 and it.rarity >= 3 then models[#models + 1] = "218" .. suffix end
    end
  end
  world.send(hero, "wear", table.concat(models, " "))
end

local function apply()
  if not hero then return end
  local d = derived()
  world.send(hero, "tune", string.format("%.3f,%.3f,%.3f,%.3f,%d,%d", d.damage, d.speed, d.crit, d.skill, d.health, d.mana))
  wear()
  -- The Director spawns the shadows and shows the binding odds (SEN).
  world.send(world.find("Director"), "shadows", string.format("%d,%s,%s,%s", s.sen, s.sh1, s.sh2, s.sh3))
end

local function shadow_line()
  local function name(k) return s[k] ~= "" and s[k]:gsub("^Goblin ", "") or "none" end
  return "Shadows: tank " .. name("sh1") .. " · striker " .. name("sh2") .. " · archer " .. name("sh3")
end

local function next_level_xp()
  return LEVELS[math.min(s.lv, #LEVELS)]
end
-- "XP 1746/2300", or "XP MAX" at the level cap.
local function xp_text()
  return s.lv >= MAX_LEVEL and "MAX" or string.format("%d/%d", s.xp, next_level_xp())
end

local function hunter_line()
  ui.set_text("Hunter", string.format("Lv.%d  %s-rank  ·  XP %s  ·  %d G  ·  %d fangs%s%s  ·  potions [1] %d  [2] %d  ·  [C] status  [I] bag",
    s.lv, s.rank, xp_text(), s.gold, s.fang, s.dag > 0 and ("  ·  daggers +" .. s.dag) or "",
    s.pts > 0 and ("  ·  " .. s.pts .. " points!") or "", s.p1, s.p2))
end

-- The pick-up feed: three lines, newest on top, each in its rarity's colour.
local feed = {}
local function show_feed()
  for k = 1, 3 do
    local line = feed[k]
    ui.set_text("Feed " .. k, line and line.text or "")
    ui.set_color("Feed " .. k, line and line.color or "")
  end
end
local function push_feed(text, color)
  table.insert(feed, 1, { text = text, color = color, until_t = clock + 5 })
  while #feed > 3 do table.remove(feed) end
  show_feed()
end

local function hub_objective()
  if not in_hub then return end
  local quest = QUESTS[math.min(s.q, #QUESTS)]
  local daily = s.daily == 1 and "Daily: done. Rest at the door home to end the day."
    or "Daily Quest: the training drill on the mat (left, by the entrance)"
  ui.set_text("Objective", "Day " .. s.day .. "\nQuest: " .. quest .. "\n" .. daily)
end

local function refresh()
  hunter_line()
  hub_objective()
end

local function stats_line()
  local parts = {}
  for i, k in ipairs(STAT_KEY) do parts[#parts + 1] = "[" .. i .. "] " .. STATS[i] .. " " .. s[k] end
  return table.concat(parts, "   ")
end

local function status_body()
  local d = derived()
  return string.format(
    "Han Seo-jin   Lv.%d   %s-rank   XP %s\n" ..
    "[1] STR %d   damage x%.2f%s\n[2] AGI %d   attack and dodge speed x%.2f\n[3] VIT %d   max health %d\n" ..
    "[4] INT %d   mana %d, skill damage x%.2f\n[5] SEN %d   critical hit chance %d%%, boss binding odds\n\n%s\n\n%s",
    s.lv, s.rank, xp_text(),
    s.str, d.damage, s.dag > 0 and ("  (daggers +" .. s.dag .. ")") or "", s.agi, d.speed, s.vit, d.health,
    s.int, d.mana, d.skill, s.sen, math.floor(d.crit * 100 + 0.5), shadow_line(),
    s.pts > 0 and (s.pts .. " stat points: press 1-5 to spend one. C closes.") or "No stat points. C closes.")
end

local function set_menu(m)
  menu = m
  close_at = nil
  if hero then world.send(world.find("Hub"), "busy", m ~= nil) end
end

local function close_menu()
  if menu then hud.system_close() end
  set_menu(nil)
end

local function spend(i)
  if s.pts <= 0 then return false end
  local k = STAT_KEY[i]
  s[k] = s[k] + 1
  s.pts = s.pts - 1
  return true
end

-- Reward windows ------------------------------------------------------------
local function push(title, body, kind, move) queue[#queue + 1] = { title, body, kind or "info", move } end

local function level_up_window()
  return "Lv." .. (s.lv - 1) .. " -> Lv." .. s.lv .. ". You have " .. s.pts .. " stat points.\n" .. stats_line() ..
    "\n\nPress 1-5 to spend a point, Backspace to undo, Enter to confirm."
end

local function gain_xp(amount)
  s.xp = s.xp + amount
  while s.lv < MAX_LEVEL and s.xp >= next_level_xp() do
    s.lv = s.lv + 1
    s.pts = s.pts + POINTS_PER_LEVEL
    push("LEVEL UP", nil, "levelup")
    if s.lv == 2 and s.sk < 1 then
      s.sk = 1
      push("NEW SKILL: SHADOW STEP DASH", "[Q] Dash through your enemies as a shadow,\ncutting everything in your path. Costs 25 mana.\n\nPress Enter.", "skill", "shadow_dash")
    end
    if s.lv == 5 and s.q == 4 then
      s.q = 5
      push("QUEST: THE D-RANK TEST", "The Association will test you. The Goblin Fortress is open\non the Gate Board. Clear it and you are D-rank.\n\nPress Enter.")
    end
    if s.lv == 8 and s.q == 6 then
      s.q = 7
      push("QUEST: THE FLOODED TEMPLE", "A C-rank Gate is open on the Gate Board: the Flooded Temple.\nIts knights shield themselves; Parry their cuts (tap Shift).\nClear it and you are C-rank.\n\nPress Enter.")
    end
    if s.lv == 11 and s.q == 8 then
      s.q = 9
      push("QUEST: THE B-RANK TEST", "The Association will test you again. The Ice Fortress is open\non the Gate Board. Clear it and you are B-rank.\n\nPress Enter.")
    end
    if s.lv == 15 and s.q == 10 then
      s.q = 11
      push("QUEST: THE A-RANK TEST", "The Bloodstone Citadel is open on the Gate Board.\nIts knights don't flinch, and its master's red combo\ncan't be parried. Clear it and you are A-rank.\n\nPress Enter.")
    end
    if s.lv == 20 and s.q == 12 then
      s.q = 13
      push("QUEST: THE S-RANK TEST", "The Eclipse Spire is open on the Gate Board.\nNo hunter who went in has come out.\nClear it and you are S-rank.\n\nPress Enter.")
    end
  end
end

local function show_next()
  current = table.remove(queue, 1)
  current_t = 0
  if not current then
    world.send(world.find("Director"), "rewards_done", reward_gate)
    reward_gate = 0
    refresh()
    return
  end
  if current[3] == "levelup" then
    undo = { s.str, s.agi, s.vit, s.int, s.sen, s.pts }
    hud.system("LEVEL UP", level_up_window())
  else
    hud.system(current[1], current[2])
  end
  if current[3] == "skill" then
    if hero then world.send(hero, "unlock", current[4]) end
    hud.cue("discovery")
  elseif current[3] == "levelup" then
    hud.cue("good")
  end
end

local function tick_rewards(dt)
  current_t = current_t + dt
  local kind = current[3]
  if kind == "levelup" then
    local changed = false
    for i = 1, 5 do
      if input.pressed("Digit" .. i) and spend(i) then changed = true end
    end
    if input.pressed("Backspace") then
      s.str, s.agi, s.vit, s.int, s.sen, s.pts = table.unpack(undo)
      changed = true
    end
    if props.fast and current_t > 2 and s.pts > 0 then
      s.sen = s.sen + s.pts
      s.pts = 0
      changed = true
    end
    if changed then hud.system("LEVEL UP", level_up_window()) end
    if current_t > 0.3 and (input.pressed("Enter") or (props.fast and current_t > 4)) then
      apply()
      store()
      show_next()
    end
  elseif current_t > 0.3 and (input.pressed("Enter") or (props.fast and current_t > 3) or (kind == "info" and current_t > 8)) then
    show_next()
  end
end

-- Loot -------------------------------------------------------------------------
local ELITE = { ["Goblin Shieldbearer"] = true, ["Hobgoblin"] = true, ["Goblin Shaman"] = true, ["Armored Knight"] = true, ["Cultist Caster"] = true,
  ["Bloodstone Knight"] = true, ["Blood Mage"] = true, ["Eclipse Warden"] = true }
local BOSS = { ["Goblin Chieftain"] = true, ["Hobgoblin Brute"] = true, ["Goblin Warlord"] = true, ["Drowned Priest"] = true, ["Frost Knight Commander"] = true,
  ["Crimson Castellan"] = true, ["Eclipse Herald"] = true }
local run_gate = 1
local loot = {} -- { id, code, x, z } lying in the Gate

-- What a kill drops: nothing, a potion ("P1", "P2") or gear (always for a
-- Gate master). Odds of Legendary, Epic and Rare gear by who fell: players
-- quit loot games where the best tier never shows (GAME_DESIGN.md 13), so a
-- Gate master drops Epic or better a third of the time, and the fifth
-- master in a row without one always does (s.pity).
local ODDS = { grunt = { 0.02, 0.10, 0.28 }, elite = { 0.04, 0.15, 0.35 }, boss = { 0.12, 0.35, 1 } }
-- The A and S Gates pay for their danger: Epic and Legendary come more
-- often (a Gate master there drops Epic or better 58% of the time).
local ODDS_HIGH = { grunt = { 0.03, 0.14, 0.32 }, elite = { 0.06, 0.2, 0.38 }, boss = { 0.18, 0.4, 1 } }
local function roll_loot(prefab)
  local boss, elite = BOSS[prefab], ELITE[prefab]
  if math.random() > (boss and 1 or elite and 0.35 or 0.12) then
    if math.random() < 0.1 then return math.random() < 0.65 and "P1" or "P2" end
    return nil
  end
  local odds = (run_gate >= 6 and ODDS_HIGH or ODDS)[boss and "boss" or elite and "elite" or "grunt"]
  local r = math.random()
  local rarity = r < odds[1] and 4 or r < odds[1] + odds[2] and 3 or r < odds[1] + odds[2] + odds[3] and 2 or 1
  if boss then
    if rarity >= 3 then s.pity = 0
    elseif s.pity >= 4 then rarity, s.pity = 3, 0
    else s.pity = s.pity + 1 end
  end
  return encode({ slot = math.random(#SLOT), rarity = rarity, set = run_gate, seed = math.random(0, 99999), plus = 0 })
end

local function pick_up(code)
  if code == "P1" or code == "P2" then
    s[code:lower()] = s[code:lower()] + 1
    push_feed(code == "P1" and "+1 Health potion" or "+1 Mana potion", "#7dffa0")
  else
    local it = parse(code)
    if not it then return end
    local list = bag_items()
    if #list >= MAX_BAG then
      s.gold = s.gold + sell_price(it)
      push_feed("Bag full: " .. item_name(it) .. " sold for " .. sell_price(it) .. " G", RARITY[it.rarity][2])
    else
      list[#list + 1] = it
      set_bag(list)
      push_feed(item_name(it), RARITY[it.rarity][2])
    end
    if it.rarity >= 3 then hud.cue("discovery") end
    -- Wearing a set unlocks its colours in the wardrobe.
    s.wd = s.wd | (1 << (it.set + 1))
  end
  hunter_line()
  store()
end

local function drop(prefab, x, z)
  local code = roll_loot(prefab)
  if not code or not x then return end
  local kind = code:sub(1, 1) == "P" and "Potion" or RARITY[parse(code).rarity][1]
  local id = world.spawn("Loot " .. kind, x, 0.15, z)
  if id then loot[#loot + 1] = { id = id, code = code, x = x, z = z } end
end

-- Walking over loot picks it up.
local function tick_loot()
  if #loot == 0 or not hero then return end
  local hx, _, hz = world.position(hero)
  if not hx then return end
  for i = #loot, 1, -1 do
    local l = loot[i]
    if (hx - l.x) ^ 2 + (hz - l.z) ^ 2 < 1.5 * 1.5 then
      table.remove(loot, i)
      if world.alive(l.id) then world.destroy(l.id) end
      pick_up(l.code)
    end
  end
end

-- Leaving a Gate: the Ledger gathers what was left on the floor.
local function collect_all()
  for _, l in ipairs(loot) do
    if world.alive(l.id) then world.destroy(l.id) end
    pick_up(l.code)
  end
  loot = {}
end

-- Potions: 1 heals 40% of max health, 2 restores 50 mana; 8 s apart.
local potion_ready = 0
local function tick_potions()
  if not hero then return end
  local one, two = input.pressed("Digit1"), input.pressed("Digit2")
  if not one and not two then return end
  if clock < potion_ready then
    push_feed(string.format("Potions ready in %d s", math.ceil(potion_ready - clock)), "#c8c8c8")
    return
  end
  if one and s.p1 == 0 or two and s.p2 == 0 then
    push_feed("No " .. (one and "health" or "mana") .. " potions: Smith Kang sells them", "#c8c8c8")
    return
  end
  local hp, hp_max = world.health(hero)
  if one and hp and hp_max and hp >= hp_max then
    push_feed("Health already full: potion kept", "#c8c8c8")
    return
  end
  if one and s.p1 > 0 then
    local _, max = world.health(hero)
    world.heal(hero, math.floor((max or 220) * POTION_HEAL))
    s.p1 = s.p1 - 1
    potion_ready = clock + 8
    push_feed("Health potion: +" .. math.floor((max or 220) * POTION_HEAL) .. " health", "#7dffa0")
    hunter_line()
  elseif two and s.p2 > 0 then
    world.send(hero, "mana", POTION_MANA)
    s.p2 = s.p2 - 1
    potion_ready = clock + 8
    push_feed("Mana potion: +" .. POTION_MANA .. " mana", "#7dc8ff")
    hunter_line()
  end
end

-- The bag (I) ------------------------------------------------------------------
local bag_page, picked = 1, nil
local PER_PAGE = 9

local function bag_body(note)
  local eq = equipped()
  local _, pieces = gear_totals()
  local lines = {}
  if note then lines[#lines + 1] = note .. "\n" end
  lines[#lines + 1] = "WORN"
  for i, slot in ipairs(SLOT) do lines[#lines + 1] = "  " .. slot.name .. ": " .. describe(eq[i]) end
  local sets = {}
  for set, n in pairs(pieces) do
    if n >= 2 then sets[#sets + 1] = SETS[set].name .. " " .. n .. "/4" .. (n >= 4 and " (4-piece bonus)" or " (2-piece bonus)") end
  end
  if #sets > 0 then lines[#lines + 1] = "  Sets: " .. table.concat(sets, ", ") end
  local list = bag_items()
  local pages = math.max(1, math.ceil(#list / PER_PAGE))
  bag_page = math.min(bag_page, pages)
  lines[#lines + 1] = string.format("\nBAG  %d/%d   page %d/%d   ·   look: %s", #list, MAX_BAG, bag_page, pages, LOOKS[s.look + 1][1])
  for k = 1, PER_PAGE do
    local it = list[(bag_page - 1) * PER_PAGE + k]
    if it then lines[#lines + 1] = string.format("  [%d] %s%s", k, describe(it), picked == (bag_page - 1) * PER_PAGE + k and "   <" or "") end
  end
  if #list == 0 then lines[#lines + 1] = "  (empty: clear Gates for gear)" end
  if picked and list[picked] then
    local it = list[picked]
    local worn = eq[it.slot]
    lines[#lines + 1] = "\nNow wearing: " .. describe(worn)
    -- The verdict: what wearing it changes, stat by stat (upgrades carry over).
    local new, old = item_stats(it), worn and item_stats(worn) or {}
    if worn and worn.plus > it.plus then
      new = item_stats({ slot = it.slot, rarity = it.rarity, set = it.set, seed = it.seed, plus = worn.plus })
    end
    local delta = {}
    for _, key in ipairs(STAT_KEYS) do
      local d = (new[key] or 0) - (old[key] or 0)
      if math.abs(d) > 1e-6 then delta[#delta + 1] = (d > 0 and "" or "-") .. stat_text(key, math.abs(d)):sub(2) end
    end
    lines[#lines + 1] = "Wearing it: " .. (#delta > 0 and table.concat(delta, ", ") or "no change") ..
      ((worn and worn.plus > 0) and ("   (your +" .. worn.plus .. " carries over)") or "")
    lines[#lines + 1] = "Enter wears it   ·   X sells it for " .. sell_price(it) .. " G"
  else
    lines[#lines + 1] = "\n1-9 picks an item   ·   Left/Right pages   ·   S sells every Common   ·   W changes the look   ·   I closes"
  end
  return table.concat(lines, "\n")
end

local function tick_bag()
  local list = bag_items()
  for k = 1, PER_PAGE do
    if input.pressed("Digit" .. k) and list[(bag_page - 1) * PER_PAGE + k] then
      picked = (bag_page - 1) * PER_PAGE + k
      hud.system("BAG", bag_body())
    end
  end
  if input.pressed("ArrowRight") or input.pressed("ArrowLeft") then
    bag_page = math.max(1, bag_page + (input.pressed("ArrowRight") and 1 or -1))
    picked = nil
    hud.system("BAG", bag_body())
  elseif input.pressed("KeyW") then
    -- The next unlocked look (0 is always the gear's own).
    repeat s.look = (s.look + 1) % #LOOKS until s.look == 0 or (s.wd & (1 << s.look)) ~= 0
    wear()
    store()
    hud.system("BAG", bag_body())
  elseif input.pressed("KeyS") and not picked then
    local kept, gold, n = {}, 0, 0
    for _, it in ipairs(list) do
      if it.rarity == 1 then gold, n = gold + sell_price(it), n + 1 else kept[#kept + 1] = it end
    end
    s.gold = s.gold + gold
    set_bag(kept)
    store()
    hunter_line()
    hud.system("BAG", bag_body(n > 0 and ("Sold " .. n .. " Common items for " .. gold .. " G.") or "No Common items to sell."))
  elseif picked and list[picked] and input.pressed("Enter") then
    local it = table.remove(list, picked)
    local eq = equipped()
    local worn = eq[it.slot]
    -- Smith upgrades move to the better piece: an upgrade is never wasted.
    if worn and worn.plus > it.plus then it.plus, worn.plus = worn.plus, it.plus end
    if worn then list[#list + 1] = worn end
    eq[it.slot] = it
    set_equipped(eq)
    set_bag(list)
    picked = nil
    apply()
    store()
    hud.cue("good")
    hud.system("BAG", bag_body("Now wearing " .. item_name(it) .. "."))
  elseif picked and list[picked] and input.pressed("KeyX") then
    local it = table.remove(list, picked)
    s.gold = s.gold + sell_price(it)
    set_bag(list)
    picked = nil
    store()
    hunter_line()
    hud.system("BAG", bag_body("Sold " .. item_name(it) .. " for " .. sell_price(it) .. " G."))
  end
end

-- Menus ----------------------------------------------------------------------
-- Why a Gate is still locked (nil: it's open).
local function locked(n)
  if n == 2 and s.c1 == 0 then return "clear the Goblin Cave first" end
  local need = NEEDS[n]
  if not need then return nil end
  local rank_ok, lv_ok = RANKS[s.rank] >= RANKS[need[1]], s.lv >= need[2]
  if rank_ok and lv_ok then return nil end
  local parts = {}
  if not rank_ok then parts[#parts + 1] = "rank " .. need[1] end
  if not lv_ok then parts[#parts + 1] = "Lv." .. need[2] end
  return "needs " .. table.concat(parts, " and ")
end
local function gate_open(n) return locked(n) == nil end

local function board_body()
  local lines = { "The Association's open Gates. Press a number to enter.\n" }
  for n, g in ipairs(GATES) do
    local status
    if gate_open(n) then
      local cleared = s["c" .. n]
      status = cleared > 0 and ("cleared " .. cleared .. "x") or "not cleared"
    else
      status = "LOCKED: " .. locked(n)
    end
    lines[#lines + 1] = string.format("[%d] %s-rank  %s   (%s)   reward %d G", n, g.rank, g.name, status, g.gold)
  end
  lines[#lines + 1] = "\nBackspace closes."
  return table.concat(lines, "\n")
end

local function smith_body(note)
  local d = derived()
  local text = "Smith Kang: \"Goblin fangs make good steel. Bring me fangs and gold.\"\n\n" ..
    string.format("Twin daggers +%d   (damage x%.2f)\n", s.dag, d.damage)
  local up = UPGRADES[s.dag + 1]
  if up then
    text = text .. string.format("Next: +%d, +8%% damage   costs %d G and %d fangs (you have %d G, %d fangs)\n\nEnter upgrades. Backspace closes.",
      s.dag + 1, up[1], up[2], s.gold, s.fang)
  else
    text = text .. "\"That's as sharp as steel gets. Bring me something better.\"\n\nBackspace closes."
  end
  local eq = equipped()
  local gear = {}
  for i = 1, #SLOT do
    local it = eq[i]
    if it and it.plus < MAX_PLUS then
      gear[#gear + 1] = string.format("[%d] %s -> +%d: %d G, %d fangs", i, item_name(it), it.plus + 1,
        math.floor(60 * (it.plus + 1) * RARITY[it.rarity][3]), 2 * (it.plus + 1))
    end
  end
  text = text .. "\n\nWorn gear:\n" .. (#gear > 0 and table.concat(gear, "\n") or "(nothing to upgrade: wear gear from your bag, I)") ..
    string.format("\n\nP buys a health potion, M a mana potion: %d G each (you have %d and %d).", POTION_PRICE, s.p1, s.p2)
  if note then text = note .. "\n\n" .. text end
  return text
end

local function tick_menu()
  if input.pressed("Backspace") or (menu == "status" and input.pressed("KeyC")) then
    close_menu()
    return
  end
  if menu == "status" then
    for i = 1, 5 do
      if input.pressed("Digit" .. i) and spend(i) then
        apply()
        store()
        hud.system("STATUS", status_body())
        hunter_line()
      end
    end
  elseif menu == "board" then
    for n = 1, #GATES do
      if input.pressed("Digit" .. n) then
        if gate_open(n) then
          close_menu()
          in_hub = false
          run_gate = n
          world.send(world.find("Director"), "enter_gate", n)
        else
          hud.system("GATE BOARD", "That Gate is locked.\n\n" .. board_body())
        end
      end
    end
  elseif menu == "bag" then
    if input.pressed("KeyI") then close_menu() return end
    tick_bag()
  elseif menu == "smith" and (input.pressed("KeyP") or input.pressed("KeyM")) then
    local key = input.pressed("KeyP") and "p1" or "p2"
    if s.gold >= POTION_PRICE then
      s.gold = s.gold - POTION_PRICE
      s[key] = s[key] + 1
      store()
      hunter_line()
      hud.system("SMITH", smith_body("\"One " .. (key == "p1" and "health" or "mana") .. " potion. Don't drink it all at once.\""))
    else
      hud.system("SMITH", smith_body("\"Not enough gold.\""))
    end
  elseif menu == "smith" and not input.pressed("Enter") then
    local eq = equipped()
    for i = 1, #SLOT do
      local it = eq[i]
      if input.pressed("Digit" .. i) and it and it.plus < MAX_PLUS then
        local gold, fangs = math.floor(60 * (it.plus + 1) * RARITY[it.rarity][3]), 2 * (it.plus + 1)
        if s.gold >= gold and s.fang >= fangs then
          s.gold, s.fang = s.gold - gold, s.fang - fangs
          it.plus = it.plus + 1
          set_equipped(eq)
          apply()
          store()
          refresh()
          hud.cue("good")
          hud.system("SMITH", smith_body("CLANG. " .. item_name(it) .. "."))
        else
          hud.system("SMITH", smith_body("\"Not enough. Clear more Gates.\""))
        end
      end
    end
  elseif menu == "smith" and input.pressed("Enter") then
    local up = UPGRADES[s.dag + 1]
    if up and s.gold >= up[1] and s.fang >= up[2] then
      s.gold = s.gold - up[1]
      s.fang = s.fang - up[2]
      s.dag = s.dag + 1
      if s.q == 2 then s.q = 3 end
      apply()
      store()
      refresh()
      hud.cue("good")
      hud.system("SMITH", smith_body("CLANG. Your daggers are now +" .. s.dag .. "."))
    elseif up then
      hud.system("SMITH", smith_body("\"Not enough. Clear more Gates.\""))
    end
  end
end

-- Loaded on first use: another script may message the Ledger before its
-- own on_start has run.
local loaded = false
local function ready()
  if loaded then return end
  loaded = true
  hero = world.find("Han Seo-jin")
  load()
end

function on_start() ready() end

local applied = false
function on_message(name, value)
  ready()
  if name == "kill" then
    local prefab, x, z = tostring(value):match("^([^|]+)|?([^|]*)|?([^|]*)$")
    local k = KILL[prefab]
    if not k then return end
    drop(prefab, tonumber(x), tonumber(z))
    run.kills = run.kills + 1
    run.xp, run.gold, run.fangs = run.xp + k[1], run.gold + k[2], run.fangs + k[3]
    s.gold, s.fang = s.gold + k[2], s.fang + k[3]
    gain_xp(k[1])
    hunter_line()
  elseif name == "gate_clear" then
    collect_all()
    local gn, grade, secs, hurt, par = tostring(value):match("^(%d+):?(%a?):?(%d*):?(%d*):?(%d*)")
    local n = math.tointeger(tonumber(gn) or 1) or 1
    grade = GRADE_BONUS[grade] and grade or "C"
    local g = GATES[n]
    local first = s["c" .. n] == 0
    s["c" .. n] = s["c" .. n] + 1
    local bonus = GRADE_BONUS[grade]
    local xp, gold = math.floor(g.xp * (1 + bonus)), math.floor(g.gold * (1 + bonus))
    s.gold = s.gold + gold
    secs = tonumber(secs) or 0
    -- The S target: 3/4 of the Gate's par (the Director sends it).
    local s_secs = math.floor((tonumber(par) or 320) * 0.75)
    local body = string.format("%s cleared.   GRADE %s%s\nYou: %d:%02d, %s damage taken.   S: under %d:%02d, under half your health lost.\n\nXP +%d   Gold +%d   Fangs +%d   (%d kills)",
      g.name, grade, bonus > 0 and string.format("  (+%d%% Gate reward)", math.floor(bonus * 100)) or "",
      math.floor(secs / 60), math.floor(secs % 60), hurt ~= "" and hurt or "0", s_secs // 60, s_secs % 60,
      run.xp + xp, run.gold + gold, run.fangs, run.kills)
    -- The windows come in order: the clear, then what it earned.
    gain_xp(xp)
    table.insert(queue, 1, { "GATE CLEARED", body, "info" })
    if n == 1 and s.q == 1 then
      s.q = 2
      push("QUEST: SHARPER FANGS", "Smith Kang, at the Association, forges goblin fangs into steel.\nUpgrade your daggers (+8% damage each).\n\nPress Enter.")
    elseif n == 2 and first then
      if s.q <= 3 then s.q = s.lv >= 5 and 5 or 4 end
      if s.sk < 2 then
        s.sk = 2
        push("NEW SKILL: FANG WHIRL", "[E] Spin through everything around you with both daggers.\nCosts 35 mana.\n\nPress Enter.", "skill", "fang_whirl")
      end
      push("QUEST: THE D-RANK TEST", s.lv >= 5
        and "The Association will test you. The Goblin Fortress is open\non the Gate Board. Clear it and you are D-rank.\n\nPress Enter."
        or "Reach Lv.5 and the Association will test you:\nthe Goblin Fortress opens on the Gate Board.\n\nPress Enter.")
    end
    -- A rank test's first clear at the rank below: the rank-up ceremony.
    local ranked
    if n == 3 and s.rank == "E" then
      ranked, s.q = "D", s.lv >= 8 and 7 or 6
    elseif n == 4 and s.rank == "D" then
      ranked, s.q = "C", s.lv >= 11 and 9 or 8
    elseif n == 5 and s.rank == "C" then
      ranked, s.q = "B", s.lv >= 15 and 11 or 10
    elseif n == 6 and s.rank == "B" then
      ranked, s.q = "A", s.lv >= 20 and 13 or 12
    elseif n == 7 and s.rank == "A" then
      ranked, s.q = "S", 14
    end
    if ranked then s.rank = ranked end
    run = { xp = 0, gold = 0, fangs = 0, kills = 0 }
    store()
    reward_gate = ranked and ("rankup:" .. ranked) or n
    if not current then show_next() end
  elseif name == "bound" then
    local key = ROLE[value]
    if not key then return end
    s[key] = value
    s.wd = s.wd | 2 -- the Shadow black look
    store()
    apply()
  elseif name == "entered" then
    run_gate = math.tointeger(tonumber(value) or run_gate) or run_gate
    in_hub = false
  elseif name == "gate_fail" then
    collect_all()
    run = { xp = 0, gold = 0, fangs = 0, kills = 0 }
    store()
    -- Level-ups earned before the pull-out still show.
    if not current and #queue > 0 then show_next() end
  elseif name == "hub" then
    in_hub = true
    if hero then world.heal(hero, 9999) end
    refresh()
  elseif name == "board" then
    set_menu("board")
    hud.system("GATE BOARD", board_body())
  elseif name == "smith" then
    set_menu("smith")
    hud.system("SMITH", smith_body())
  elseif name == "daily_done" then
    s.daily = 1
    s.pts = s.pts + 1
    s.gold = s.gold + 50
    store()
    refresh()
    hud.system("DAILY QUEST COMPLETE", "Reward: +1 stat point, +50 G.\nPress C to spend the point.\n\nThe Ledger rewards the hunter who trains every day.")
    close_at = clock + 6
  elseif name == "rest" then
    if s.daily == 0 then
      in_hub = false
      world.send(world.find("Director"), "penalty")
      return
    end
    s.day = s.day + 1
    s.daily = 0
    store()
    if hero then world.heal(hero, 9999) end
    refresh()
    hud.system("A NEW DAY", "Day " .. s.day .. ". You rest; your health returns. The game is saved.\nA new Daily Quest is waiting on the training mat.")
    close_at = clock + 5
  elseif name == "penalty_done" then
    s.day = s.day + 1
    s.daily = 0
    store()
    refresh()
    hud.system("A NEW DAY", "Day " .. s.day .. ". You survived the penalty. Don't skip the drill.")
    close_at = clock + 5
  end
end

function on_tick(dt)
  ready()
  clock = clock + dt
  if not applied and hero and clock > 0.2 then
    applied = true
    apply()
    if s.sk >= 1 then world.send(hero, "unlock", "shadow_dash") end
    if s.sk >= 2 then world.send(hero, "unlock", "fang_whirl") end
    world.send(world.find("Hub"), "daily", s.daily == 1)
    hunter_line()
  end
  for k = #feed, 1, -1 do
    if clock > feed[k].until_t then
      table.remove(feed, k)
      show_feed()
    end
  end
  tick_loot()
  if close_at and clock >= close_at then
    close_at = nil
    if not current and not menu then hud.system_close() end
  end
  if current then
    tick_rewards(dt)
    return
  end
  if menu then
    -- Walking away closes a station's menu.
    if menu ~= "status" and menu ~= "bag" and hero then
      local x, _, z = world.position(hero)
      local station = menu == "board" and { -10, 58 } or { 10, 58.6 }
      if x and (x - station[1]) ^ 2 + (z - station[2]) ^ 2 > 4.5 * 4.5 then close_menu() return end
    end
    tick_menu()
  elseif input.pressed("KeyC") then
    set_menu("status")
    hud.system("STATUS", status_body())
  elseif input.pressed("KeyI") then
    bag_page, picked = 1, nil
    set_menu("bag")
    hud.system("BAG", bag_body())
  else
    tick_potions()
  end
end
