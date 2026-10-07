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
-- Messages in: kill (prefab name), gate_clear (gate 1-3), gate_fail,
-- hub (the hunter is back in the hub), board, smith, daily_done, rest,
-- penalty_done. Out: Director enter_gate (n), rewards_done (n), penalty;
-- Hub busy (true while a menu is open).

local STATS = { "STR", "AGI", "VIT", "INT", "SEN" }
-- Cumulative XP for Lv.2, 3, 4, 5, 6 ...
local LEVELS = { 150, 450, 900, 1500, 2300, 3300 }
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
}
local GATES = {
  { name = "Goblin Cave", rank = "E", xp = 100, gold = 80 },
  { name = "Subway Tunnel", rank = "E", xp = 150, gold = 140 },
  { name = "Goblin Fortress", rank = "D", xp = 300, gold = 300 },
}
-- Dagger +1..+5: gold, fangs. Each level is +8% damage.
local UPGRADES = { { 100, 6 }, { 200, 12 }, { 350, 20 }, { 500, 30 }, { 700, 40 } }
local QUESTS = {
  "Clear the Goblin Cave (Gate Board)",
  "Upgrade your daggers at Smith Kang",
  "Clear the Subway Tunnel (Gate Board)",
  "Reach Lv.5 to take the D-rank test",
  "Pass the D-rank test: the Goblin Fortress",
  "Rank D. Keep clearing Gates and growing.",
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
    gold = 0, fang = 0, dag = 0, rank = "E", q = 1, day = 1, daily = 0, c1 = 0, c2 = 0, c3 = 0, sk = 0 }
end

local KEYS = { "lv", "xp", "pts", "str", "agi", "vit", "int", "sen", "gold", "fang", "dag", "rank", "q", "day", "daily", "c1", "c2", "c3", "sk" }
local STAT_KEY = { "str", "agi", "vit", "int", "sen" }

local function load()
  s = defaults()
  local text = save.get("gb")
  if not text then return end
  for k, v in text:gmatch("(%w+)=([^;]*)") do
    if s[k] ~= nil then s[k] = (k == "rank") and v or (tonumber(v) or s[k]) end
  end
end

local function store()
  local parts = {}
  for _, k in ipairs(KEYS) do parts[#parts + 1] = k .. "=" .. tostring(s[k]) end
  save.set("gb", table.concat(parts, ";"))
end

-- What the stats do, in numbers (GAME_DESIGN.md 5.3).
local function derived()
  return {
    damage = (1 + 0.05 * (s.str - 10)) * (1 + 0.08 * s.dag),
    speed = math.min(1.4, 1 + 0.02 * (s.agi - 10)),
    health = 220 + 15 * (s.vit - 10),
    mana = 100 + 6 * (s.int - 10),
    skill = 1 + 0.06 * (s.int - 10),
    crit = math.min(0.6, 0.05 + 0.015 * (s.sen - 10)),
  }
end

local function apply()
  if not hero then return end
  local d = derived()
  world.send(hero, "tune", string.format("%.3f,%.3f,%.3f,%.3f,%d,%d", d.damage, d.speed, d.crit, d.skill, d.health, d.mana))
end

local function next_level_xp()
  return LEVELS[s.lv] or (LEVELS[#LEVELS] + 1000 * (s.lv - #LEVELS))
end

local function hunter_line()
  ui.set_text("Hunter", string.format("Lv.%d  %s-rank  ·  XP %d/%d  ·  %d G  ·  %d fangs%s  ·  [C] status",
    s.lv, s.rank, s.xp, next_level_xp(), s.gold, s.fang, s.dag > 0 and ("  ·  daggers +" .. s.dag) or "",
    s.pts > 0 and ("  ·  " .. s.pts .. " points!") or ""))
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
    "Han Seo-jin   Lv.%d   %s-rank   XP %d / %d\n" ..
    "[1] STR %d   damage x%.2f%s\n[2] AGI %d   attack and dodge speed x%.2f\n[3] VIT %d   max health %d\n" ..
    "[4] INT %d   mana %d, skill damage x%.2f\n[5] SEN %d   critical hit chance %d%%\n\n%s",
    s.lv, s.rank, s.xp, next_level_xp(),
    s.str, d.damage, s.dag > 0 and ("  (daggers +" .. s.dag .. ")") or "", s.agi, d.speed, s.vit, d.health,
    s.int, d.mana, d.skill, s.sen, math.floor(d.crit * 100 + 0.5),
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
  while s.xp >= next_level_xp() do
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

-- Menus ----------------------------------------------------------------------
local function gate_open(n)
  if n == 1 then return true end
  if n == 2 then return s.c1 > 0 end
  return s.lv >= 5
end

local function board_body()
  local lines = { "The Association's open Gates. Press a number to enter.\n" }
  for n, g in ipairs(GATES) do
    local status
    if gate_open(n) then
      local cleared = s["c" .. n]
      status = cleared > 0 and ("cleared " .. cleared .. "x") or "not cleared"
    else
      status = n == 2 and "LOCKED: clear the Goblin Cave first" or "LOCKED: reach Lv.5"
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
    for n = 1, 3 do
      if input.pressed("Digit" .. n) then
        if gate_open(n) then
          close_menu()
          in_hub = false
          world.send(world.find("Director"), "enter_gate", n)
        else
          hud.system("GATE BOARD", "That Gate is locked.\n\n" .. board_body())
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
    local k = KILL[value]
    if not k then return end
    run.kills = run.kills + 1
    run.xp, run.gold, run.fangs = run.xp + k[1], run.gold + k[2], run.fangs + k[3]
    s.gold, s.fang = s.gold + k[2], s.fang + k[3]
    gain_xp(k[1])
    hunter_line()
  elseif name == "gate_clear" then
    local n = math.tointeger(tonumber(value) or 1) or 1
    local g = GATES[n]
    local first = s["c" .. n] == 0
    s["c" .. n] = s["c" .. n] + 1
    s.gold = s.gold + g.gold
    local body = string.format("%s cleared.\n\nXP +%d   Gold +%d   Fangs +%d   (%d kills)",
      g.name, run.xp + g.xp, run.gold + g.gold, run.fangs, run.kills)
    -- The windows come in order: the clear, then what it earned.
    gain_xp(g.xp)
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
    elseif n == 3 and s.rank == "E" then
      s.rank = "D"
      s.q = 6
    end
    run = { xp = 0, gold = 0, fangs = 0, kills = 0 }
    store()
    reward_gate = (n == 3 and s.q == 6 and first) and "rankup" or n
    if not current then show_next() end
  elseif name == "gate_fail" then
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
    if menu ~= "status" and hero then
      local x, _, z = world.position(hero)
      local station = menu == "board" and { -10, 58 } or { 10, 58.6 }
      if x and (x - station[1]) ^ 2 + (z - station[2]) ^ 2 > 4.5 * 4.5 then close_menu() return end
    end
    tick_menu()
  elseif input.pressed("KeyC") then
    set_menu("status")
    hud.system("STATUS", status_body())
  end
end
