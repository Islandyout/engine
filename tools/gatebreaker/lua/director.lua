-- GATEBREAKER: the Director runs what happens where. On the first run: the
-- prologue panels, the Ledger awakening, the tutorial against the training
-- construct, then the Goblin Cave. After that (and on every later visit, the
-- save says which): the hub, and the Gates the Gate Board sends the hunter
-- into. A Gate is a line of rooms; walking into one seals the door behind
-- and spawns its enemies, killing them all opens the next door, and the last
-- room holds the boss. Every kill and the clear go to the Ledger, which
-- shows the rewards; then the hunter returns to the hub.
--
-- Shadows (M3): an elite or boss that falls leaves a mark for 8 s; holding G
-- over it binds it (elites always rise, bosses get 3 tries at odds SEN
-- improves). The Ledger keeps one shadow per role; the Director raises them
-- at each Gate's door, gathers them when a room seals, raises the fallen
-- when it's cleared, and passes on the hunter's ultimate and every Break.
-- @prop fast false
--
-- props.fast (tests): every tutorial step passes after a moment, a cleared
-- room sets the hunter just short of the next doorway (it still walks
-- through), and the first run's last window confirms itself.

local PROLOGUE = [[
14 6 40 > 0 5 70 | Seoul. Ten years after the first Gates opened in the sky. |  | 4
-1.6 1.8 49.4 > 0 1.6 52.6 | Han Seo-jin. E-rank. The weakest hunter in the city. |  | 4
0 1.2 60 > 0 1.6 69 | Then the Double Gate opened. | VWOOM | 3.5
1.2 1.65 54.2 > 0 1.55 52 | And something inside it answered him. | SHING | 3.5
]]
-- Each rank a test Gate grants: its ceremony panels and the window after.
local CEREMONY = {
  D = { [[
0 1.5 51 > 0 1.4 47 | The Association measures Han Seo-jin's mana again. |  | 3
2.2 1.7 45.2 > 0 1.5 47 | The reading climbs past E. | SHING | 3
-1.5 0.6 49 > 0 1.7 47 | D-rank. | BOOM | 2.5
]], "RANK UP: E -> D", "The weakest hunter in Seoul is gone.\nHan Seo-jin, D-rank Hunter. Harder Gates will open to you.\n\nPress Enter." },
  C = { [[
0 1.5 51 > 0 1.4 47 | The Association measures him a third time. |  | 3
2.2 1.7 45.2 > 0 1.5 47 | The crystal floods with light. | SHING | 3
-1.5 0.6 49 > 0 1.7 47 | C-rank. | BOOM | 2.5
]], "RANK UP: D -> C", "Most hunters never climb past D.\nHan Seo-jin, C-rank Hunter. At Lv.11 the Ice Fortress, the B-rank test, opens.\n\nPress Enter." },
  B = { [[
0 1.5 51 > 0 1.4 47 | Guild masters come to watch the reading. |  | 3
2.2 1.7 45.2 > 0 1.5 47 | The crystal cracks. | CRACK | 3
-1.5 0.6 49 > 0 1.7 47 | B-rank. | BOOM | 2.5
]], "RANK UP: C -> B", "The guilds know his name now.\nHan Seo-jin, B-rank Hunter. The Double Gate is still waiting.\n\nPress Enter." },
}

-- Half the height of each enemy kind: where it stands when spawned.
local HALF = {
  ["Goblin Grunt"] = 0.725, ["Goblin Archer"] = 0.725, ["Goblin Shieldbearer"] = 0.725, ["Goblin Shaman"] = 0.7,
  ["Hobgoblin"] = 0.925, ["Goblin Chieftain"] = 1.05, ["Hobgoblin Brute"] = 1.2, ["Goblin Warlord"] = 1.125,
  ["Drowned Goblin"] = 0.725, ["Ice Ghoul"] = 0.725, ["Armored Knight"] = 0.95, ["Cultist Caster"] = 0.9,
  ["Drowned Priest"] = 1.1, ["Frost Knight Commander"] = 1.15,
}
local G, A, S, SH, H = "Goblin Grunt", "Goblin Archer", "Goblin Shieldbearer", "Goblin Shaman", "Hobgoblin"
local DG, IG, K, C = "Drowned Goblin", "Ice Ghoul", "Armored Knight", "Cultist Caster"

-- Who can be bound: role (1 tank, 2 striker, 3 archer) and whether it is a
-- Gate master (3 tries at the odds) or an elite (always rises).
local BIND = {
  ["Goblin Shieldbearer"] = { 1 }, ["Hobgoblin Brute"] = { 1, true },
  ["Hobgoblin"] = { 2 }, ["Goblin Chieftain"] = { 2, true }, ["Goblin Warlord"] = { 2, true },
  ["Goblin Shaman"] = { 3 },
  ["Armored Knight"] = { 1 }, ["Cultist Caster"] = { 3 },
  ["Drowned Priest"] = { 2, true }, ["Frost Knight Commander"] = { 2, true },
}
local ROLE_NAME = { "tank", "striker", "archer" }
local BIND_TIME, BIND_RANGE, BIND_HOLD = 8, 2.4, 1.0

-- Each Gate: where it lies (x), its rooms (centre z, who stands where,
-- relative to the centre), its boss, who the boss calls in phase 2 (and
-- the window saying so), and what the room objective calls its enemies.
local GATES = {
  { ox = 0, name = "GOBLIN CAVE", rank = "E", boss = "Goblin Chieftain", boss_title = "GOBLIN CHIEFTAIN  ·  E-rank Gate master",
    blurb = "A shallow cave of goblins. Every Hunter's first Gate.",
    rooms = {
      { title = "ROOM 1", hint = "Goblins. Tab locks on to one; Left click strikes.\nLand four in a row, then Right click for a finisher.",
        foes = { { G, -3, -5 }, { G, 0, -6 }, { G, 3, -5 } } },
      { title = "ROOM 2", hint = "Archers shoot from the back. Close the distance,\nor throw Shadow Fang (R) at them.",
        foes = { { G, -2, -4 }, { A, -5, -7 }, { A, 5, -7 }, { G, 2, -4 } } },
      { title = "ROOM 3", hint = "A shield-bearer. Light attacks bounce off its guard.\nBreak it with a Heavy (Right click), and fill its stagger bar.",
        foes = { { S, 0, -4 }, { G, -3, -6 }, { G, 3, -6 } } },
    } },
  { ox = 120, name = "SUBWAY TUNNEL", rank = "E", boss = "Hobgoblin Brute", boss_title = "HOBGOBLIN BRUTE  ·  E-rank Gate master",
    blurb = "A Gate opened on a subway line. Hobgoblins nest in the dark.",
    rooms = {
      { title = "PLATFORM", hint = "A hobgoblin: slow, and it hits hard. Its overhead crush\nbreaks your guard. Dodge it (Space), then punish.",
        foes = { { G, -3, -4 }, { G, 3, -4 }, { G, 0, -3 }, { H, 0, -7 } } },
      { title = "TRACKS", hint = "A shaman (purple) mends the goblins around it.\nKill it first: Shadow Fang (R) reaches it from here.",
        foes = { { A, -5, -7 }, { A, 5, -7 }, { SH, 0, -8 }, { G, -2, -4 }, { G, 2, -4 } } },
      { title = "MAINTENANCE BAY", hint = "Two hobgoblins and a shield. Don't fight them all at once:\nkeep moving, and dodge through the big swings.",
        foes = { { H, -3, -6 }, { H, 3, -6 }, { S, 0, -3 } } },
    } },
  { ox = -120, name = "GOBLIN FORTRESS", rank = "D", boss = "Goblin Warlord", boss_title = "GOBLIN WARLORD  ·  D-rank test",
    summon = { G, "The Warlord calls its guard. Its red slams come faster now:\nwhen it flashes red, don't block. Dodge." },
    blurb = "The D-rank test. A fortress of goblins under a Warlord.\nClear it and the Association ranks you D.",
    rooms = {
      { title = "GATEHOUSE", hint = "A shield wall with archers behind it.\nBreak the shields with Heavies; Fang Whirl (E) hits all around you.",
        foes = { { S, -2, -4 }, { S, 2, -4 }, { G, -4, -6 }, { G, 4, -6 }, { A, 0, -8 } } },
      { title = "BARRACKS", hint = "Two shamans heal everything near them.\nGo for the shamans first.",
        foes = { { H, 0, -4 }, { SH, -5, -8 }, { SH, 5, -8 }, { A, -3, -7 }, { A, 3, -7 } } },
      { title = "WAR HALL", hint = "The Warlord's guard. Take them one at a time.",
        foes = { { H, -3, -5 }, { H, 3, -5 }, { S, 0, -3 }, { SH, 0, -8 } } },
    } },
  { ox = 240, name = "FLOODED TEMPLE", rank = "C", boss = "Drowned Priest", boss_title = "DROWNED PRIEST  ·  C-rank Gate master",
    summon = { DG, "The Priest drags the drowned up out of the water.\nIts tide bolts come faster now: stay close, and dodge the red slam." },
    foe = "temple's guard",
    blurb = "A temple sunk under black water. Knights still guard it.\nClear it as a D-rank hunter and the Association ranks you C.",
    rooms = {
      { title = "NAVE", hint = "Armored knights teach the PARRY. Their shields stop Light attacks:\ntap Shift just as a sword lands, then strike while the knight staggers.",
        foes = { { K, 0, -4 }, { DG, -3, -6 }, { DG, 3, -6 } } },
      { title = "DROWNED CLOISTER", hint = "Cultist casters (purple) curse you from the back.\nKill the casters first: Shadow Step Dash (Q) and Shadow Fang (R) reach them.",
        foes = { { C, -5, -8 }, { C, 5, -8 }, { DG, -2, -4 }, { DG, 2, -4 }, { DG, 0, -6 } } },
      { title = "SANCTUM STAIRS", hint = "Casters first, then the knights: Parry their quick cuts (tap Shift).\nTheir overhead swing breaks guards. Dodge that one.",
        foes = { { K, -3, -5 }, { K, 3, -5 }, { C, 0, -8 }, { DG, 0, -3 } } },
    } },
  { ox = -240, name = "ICE FORTRESS", rank = "B", boss = "Frost Knight Commander", boss_title = "FROST KNIGHT COMMANDER  ·  B-rank test",
    foe = "fortress guard",
    blurb = "The B-rank test. A fortress of ice held by frost knights.\nClear it and the Association ranks you B.",
    rooms = {
      { title = "OUTER GATE", hint = "Ice ghouls are fast and hunt in packs.\nLet them close in, then Fang Whirl (E) hits every one around you.",
        foes = { { IG, -3, -4 }, { IG, 0, -5 }, { IG, 3, -4 }, { IG, -5, -7 }, { IG, 5, -7 } } },
      { title = "RIME BARRACKS", hint = "Knights have stagger bars. Fill one with Heavies and finishers\nand it Breaks: it falls, takes extra damage, and your shadows strike.",
        foes = { { K, -2, -4 }, { K, 2, -4 }, { IG, -5, -7 }, { IG, 5, -7 }, { C, 0, -8 } } },
      { title = "HALL OF WINTER", hint = "The Commander's guard. Fang Whirl (E) the ghouls,\nthen Break the knights one at a time.",
        foes = { { K, -3, -5 }, { K, 3, -5 }, { IG, -4, -3 }, { IG, 4, -3 }, { IG, 0, -7 }, { C, 0, -9 } } },
    } },
}
local ROOM_Z = { -24, -48, -72 }

local LESSONS = {
  { "MOVE", "WASD moves. Walk up to the training construct.", "Walk to the construct" },
  { "ATTACK", "Left click strikes. Land 3 hits on the construct.", "Land 3 hits (Left click)" },
  { "HEAVY", "Right click is a Heavy: slower, but it breaks guards.\nLand a Heavy.", "Land a Heavy (Right click)" },
  { "DODGE", "Space dodges. The construct's weapon glints before it strikes:\ndodge through the blow.", "Dodge its swing (Space)" },
  { "PERFECT DODGE", "Dodge at the last instant and time slows.\nThen strike (Left click) to Shadow Step behind it.", "Perfect Dodge, then strike" },
  { "PARRY", "Hold Shift to block. Tap Shift just before a blow lands\nto Parry it and fill your ultimate gauge.", "Parry a swing (tap Shift)" },
}

local HUB_SPOT = { 0, 0.9, 47 }

local state = "intro"
local t = 0            -- seconds in the current state
local hero, construct, boss
local first_run = false
local lesson = 1
local progress = 0
local gate = 1         -- the Gate being run
local room = 0
local window_until = -1
local clock = 0
local phase2 = false
local spawned = {}     -- { id, prefab, room, counted }
local penalty_next = 0
local sen = 10
local bound = { "", "", "" }  -- the Ledger's shadows by role
local risen = {}       -- role -> the shadow's id in this Gate
local bodies = {}      -- { x, z, prefab, t, tries, mark }
local holding = 0      -- seconds G has been held over a body
local run_start, hurt, last_hp = 0, 0, nil
local new_rank = "D"   -- the rank the ceremony announces

local shown_prompt
local function prompt(text)
  if text ~= shown_prompt then
    shown_prompt = text
    ui.set_text("Prompt", text)
  end
end

local function find(name) return world.find(name) end
local function ledger(name, value) world.send(find("Ledger"), name, value) end

-- A Ledger window; it closes itself after `seconds` (nil or <= 0: stays).
local function say(title, body, seconds)
  hud.system(title, body)
  window_until = (seconds and seconds > 0) and (clock + seconds) or -1
end

local shown_objective
local function objective(text)
  if text ~= shown_objective then
    shown_objective = text
    ui.set_text("Objective", text)
  end
end

local function seal(n, k, closed)
  local id = find("G" .. n .. " Seal " .. k)
  if not id then return end
  local x, _, z = world.position(id)
  world.set_position(id, x, closed and 1.75 or -40, z)
end

local function teleport(x, y, z)
  world.set_position(hero, x, y, z)
  world.set_velocity(hero, 0, 0, 0)
end

-- props.fast: the hunter, set just short of the doorway at z.
local function skip_to(z)
  if not props.fast then return end
  local _, y = world.position(hero)
  teleport(GATES[gate].ox, y or 0.9, z)
end

local function hero_z()
  local _, _, z = world.position(hero)
  return z or 0
end

local function skip_pressed()
  return input.pressed("Enter") or input.pressed("Space")
end

local function dead(id)
  if not world.alive(id) then return true end
  local hp = world.health(id)
  return not hp or hp <= 0
end

local function spawn(prefab, x, z, tag)
  local id = world.spawn(prefab, x, HALF[prefab] or 0.8, z)
  if id then spawned[#spawned + 1] = { id = id, prefab = prefab, room = tag, counted = false } end
  return id
end

-- Counts the newly fallen (each kill once, to the Ledger outside the
-- penalty) and returns how many of `tag` still stand.
local function standing(tag)
  local n = 0
  for _, e in ipairs(spawned) do
    if dead(e.id) then
      if not e.counted then
        e.counted = true
        if state ~= "penalty" then
          local x, _, z = world.position(e.id)
          ledger("kill", x and string.format("%s|%.2f|%.2f", e.prefab, x, z) or e.prefab)
          -- A shadow you already have doesn't ask again.
          if BIND[e.prefab] and x and bound[BIND[e.prefab][1]] ~= e.prefab then
            bodies[#bodies + 1] = { x = x, z = z, prefab = e.prefab, t = clock, tries = 0, mark = world.spawn("Shadow Mark", x, 0.2, z) }
          end
        end
      end
    elseif e.room == tag then
      n = n + 1
    end
  end
  return n
end

local function clear_spawned()
  for _, e in ipairs(spawned) do
    if world.alive(e.id) then world.destroy(e.id) end
  end
  spawned = {}
end

-- Shadows ------------------------------------------------------------------------
local SLOT = { { 1.6, 1.4 }, { -1.6, 1.4 }, { 0, 2.4 } }
local function beside_hero(role)
  local x, y, z = world.position(hero)
  return (x or 0) + SLOT[role][1], z and (z + SLOT[role][2]) or 0
end

local function raise(role)
  if bound[role] == "" then return end
  local old = risen[role]
  if old and world.alive(old) then world.destroy(old) end
  local x, z = beside_hero(role)
  risen[role] = world.spawn("Shadow " .. bound[role], x, (HALF[bound[role]] or 0.8) + 0.05, z)
end

-- Every shadow at its slot (a room is sealing: none is left outside).
local function gather()
  for role, id in pairs(risen) do
    if world.alive(id) and not dead(id) then
      local x, z = beside_hero(role)
      world.set_position(id, x, (HALF[bound[role]] or 0.8) + 0.05, z)
    end
  end
end

-- The fallen rise again (a room is clear).
local function raise_fallen()
  for role = 1, 3 do
    local id = risen[role]
    if bound[role] ~= "" and (not id or dead(id)) then raise(role) end
  end
end

local function clear_shadows()
  for _, id in pairs(risen) do
    if world.alive(id) then world.destroy(id) end
  end
  risen = {}
  for _, b in ipairs(bodies) do
    if b.mark and world.alive(b.mark) then world.destroy(b.mark) end
  end
  bodies = {}
  prompt("")
  holding = 0
end

local function each_shadow(name, value)
  for _, id in pairs(risen) do
    if world.alive(id) and not dead(id) then world.send(id, name, value) end
  end
end

local function odds(b)
  if not BIND[b.prefab][2] then return 1 end
  return math.min(0.9, 0.5 + 0.02 * (sen - 10))
end

local function drop_body(i)
  local b = table.remove(bodies, i)
  if b and b.mark and world.alive(b.mark) then world.destroy(b.mark) end
end

-- Hold G over a fresh body to bind it.
local function tick_bind(dt)
  for i = #bodies, 1, -1 do
    if clock - bodies[i].t > BIND_TIME then drop_body(i) end
  end
  local hx, _, hz = world.position(hero)
  local near, ni
  for i, b in ipairs(bodies) do
    if hx and (hx - b.x) ^ 2 + (hz - b.z) ^ 2 < BIND_RANGE * BIND_RANGE then near, ni = b, i end
  end
  -- Tests: the first body nearby rises by itself.
  if near and props.fast then holding = BIND_HOLD end
  if not near then
    holding = 0
    prompt("")
    return
  end
  local role = BIND[near.prefab][1]
  local chance = math.floor(odds(near) * 100 + 0.5)
  if input.down("KeyG") or props.fast then
    holding = holding + dt
  else
    holding = 0
  end
  local swap = bound[role] ~= "" and bound[role] ~= near.prefab and ("  (replaces your " .. bound[role]:gsub("^Goblin ", "") .. ")") or ""
  if holding < BIND_HOLD then
    local bar = string.rep("|", math.floor(holding / BIND_HOLD * 10)) .. string.rep(".", 10 - math.floor(holding / BIND_HOLD * 10))
    -- A Gate master's odds are per try: show the three-try total too.
    local odds_text = BIND[near.prefab][2]
      and string.format("%d%% a try, %d tries left", chance, 3 - near.tries)
      or "always rises"
    prompt(string.format("[Hold G] ARISE  %s  ·  %s  ·  %s%s%s", near.prefab, ROLE_NAME[role], odds_text, swap,
      holding > 0 and ("\n" .. bar) or ""))
    return
  end
  holding = 0
  near.tries = near.tries + 1
  if math.random() < odds(near) then
    drop_body(ni)
    bound[role] = near.prefab
    ledger("bound", near.prefab)
    raise(role)
    hud.cue("discovery")
    say("ARISE", near.prefab .. " rises as your " .. ROLE_NAME[role] .. ".\nShadows follow you and fight on their own. They join your ultimate (F)\nand strike every enemy you Break.", 5)
    prompt("")
  elseif near.tries >= 3 then
    drop_body(ni)
    hud.cue("bad")
    say("THE SHADOW FADES", "It resisted three times. Its shadow is gone.\nMore SEN (C) raises the odds.", 4)
    prompt("")
  else
    hud.cue("bad")
    prompt(string.format("It resists. %d tries left. [Hold G] again", 3 - near.tries))
  end
end

-- The clear grade (GAME_DESIGN.md 5.5): time and damage taken.
local function grade()
  local secs = clock - run_start
  local _, max = world.health(hero)
  local share = hurt / (max or 220)
  local g = "C"
  if share < 0.5 and secs < 240 then g = "S"
  elseif share < 1 and secs < 360 then g = "A"
  elseif share < 2 then g = "B" end
  return string.format("%d:%s:%d:%d", gate, g, math.floor(secs), math.floor(hurt))
end

local function to_hub()
  clear_spawned()
  clear_shadows()
  hud.boss("", "")
  for k = 1, 4 do seal(gate, k, true) end
  teleport(HUB_SPOT[1], HUB_SPOT[2], HUB_SPOT[3])
  audio.music("night")
  state = "hub"
  t = 0
  ledger("hub")
end

-- The prologue's stand-ins leave the plaza once it has played.
local function clear_prologue()
  for _, name in ipairs({ "Prologue Seo-jin", "Prologue goblin -1.6", "Prologue goblin 1.4", "Prologue goblin 0" }) do
    local id = find(name)
    if id then world.destroy(id) end
  end
end

-- Tutorial ---------------------------------------------------------------------
local function start_lesson(n)
  lesson = n
  progress = 0
  t = 0
  local l = LESSONS[n]
  say(l[1], l[2], 5)
  objective("Tutorial " .. n .. "/" .. #LESSONS .. ": " .. l[3] .. "   (G skips the tutorial)")
  if n == 4 then world.send(construct, "swing_on") end
end

local function lesson_done()
  if lesson < #LESSONS then
    start_lesson(lesson + 1)
    return
  end
  -- The construct crumbles, so lock-on (Tab) finds the goblins, not it.
  world.destroy(construct)
  construct = nil
  seal(1, 1, false)
  say("TUTORIAL COMPLETE", "The training construct crumbles. The Gate's first door opens.\nGo north.", 4)
  objective("Enter the Gate (north)")
  skip_to(-6)
  state = "advance"
  room = 1
  t = 0
end

-- Gates ------------------------------------------------------------------------
local function enter_gate(n)
  gate = n
  local g = GATES[n]
  clear_spawned()
  phase2 = false
  for k = 2, 4 do seal(n, k, true) end
  seal(n, 1, false)
  teleport(g.ox, 0.9, 6)
  clear_shadows()
  for role = 1, 3 do raise(role) end
  run_start, hurt, last_hp = clock, 0, nil
  say(g.name .. "  ·  " .. g.rank .. "-RANK GATE", g.blurb .. "\n\nGo north. The doors seal behind you until a room is clear.", 5)
  objective("Enter the Gate (north)")
  audio.music("tension")
  state = "advance"
  room = 1
  t = 0
end

local function start_penalty()
  gate = 1
  clear_spawned()
  clear_shadows()
  seal(1, 4, true)
  teleport(0, 0.9, -96)
  audio.music("tension")
  state = "penalty"
  t = 0
  penalty_next = 0
  say("PENALTY QUEST", "You skipped the Daily Quest. The Ledger does not forgive.\nSurvive for 60 seconds.", 5)
  objective("PENALTY QUEST: survive")
end

function on_start()
  hero = find("Han Seo-jin")
  construct = find("Training Construct")
  first_run = save.get("gb") == nil
  objective("")
  if first_run then
    hud.panels(PROLOGUE)
    audio.music("tension")
    return
  end
  -- A returning hunter starts in the hub; the tutorial is behind them.
  clear_prologue()
  world.destroy(construct)
  construct = nil
  to_hub()
  say("THE LEDGER", "Welcome back, Han Seo-jin.", 3)
end

function on_message(name, value)
  if state == "tutorial" then
    if name == "hero_hit" and type(value) == "string" then
      local move, outcome = value:match("^(.-):(.*)$")
      if lesson == 2 and outcome == "hit" then
        progress = progress + 1
        objective("Tutorial 2/6: Land 3 hits (" .. progress .. "/3)   (G skips the tutorial)")
        if progress >= 3 then lesson_done() end
      elseif lesson == 3 and outcome ~= "dodged" and (move == "cross_cut" or move == "rising_slash" or move == "twin_pierce" or move == "crescent" or move == "execution") then
        lesson_done()
      elseif lesson == 5 and move == "shadow_step" then
        lesson_done()
      end
    elseif name == "construct" then
      if lesson == 4 and value == "dodged" then lesson_done()
      elseif lesson == 6 and value == "parried" then lesson_done() end
    end
  elseif name == "phase2" and not phase2 and state == "boss" then
    phase2 = true
    local g = GATES[gate]
    if value == true and g.summon then
      local x = g.ox
      spawn(g.summon[1], x - 5, -96, "boss")
      spawn(g.summon[1], x + 5, -96, "boss")
      say("PHASE 2", g.summon[2], 4)
    else
      say("PHASE 2", "The " .. g.boss .. " roars. Its red slams come faster now:\nwhen it flashes red, don't block. Dodge.", 4)
    end
  elseif name == "shadows" and type(value) == "string" then
    local v = {}
    for part in (value .. ","):gmatch("([^,]*),") do v[#v + 1] = part end
    sen = tonumber(v[1]) or sen
    bound = { v[2] or "", v[3] or "", v[4] or "" }
  elseif name == "ult" then
    each_shadow("ult")
  elseif name == "broken" then
    each_shadow("strike", value)
  elseif name == "enter_gate" and state == "hub" then
    enter_gate(math.tointeger(tonumber(value) or 1) or 1)
  elseif name == "penalty" and state == "hub" then
    start_penalty()
  elseif name == "rewards_done" and state == "cleared" then
    if first_run and gate == 1 then
      say("E-RANK GATE: CLEARED", "Han Seo-jin has cleared his first Gate.\n" ..
        "The Gate closes behind you. Somewhere, the Double Gate is still open.\n\nPress Enter to return to the Hunter Association.")
      objective("E-rank Gate cleared. Try Shadow Step Dash (Q).")
      state = "outro"
    elseif type(value) == "string" and value:sub(1, 6) == "rankup" then
      -- "rankup:C" names the rank just earned ("rankup" alone: D).
      new_rank = CEREMONY[value:sub(8)] and value:sub(8) or "D"
      to_hub()
      hud.panels(CEREMONY[new_rank][1])
      state = "ceremony"
    else
      say("THE GATE CLOSES", "Returning to the Hunter Association.", 3)
      state = "returning"
    end
    t = 0
  end
end

function on_tick(dt)
  clock = clock + dt
  t = t + dt
  if window_until >= 0 and clock >= window_until then
    hud.system_close()
    window_until = -1
  end
  local fighting = state == "advance" or state == "fight" or state == "boss_intro" or state == "boss" or state == "penalty" or state == "tutorial"
  local in_gate = state == "advance" or state == "fight" or state == "boss_intro" or state == "boss" or state == "cleared"
  if hero and in_gate then
    local hp = world.health(hero)
    if hp and last_hp and hp < last_hp then hurt = hurt + (last_hp - hp) end
    last_hp = hp
    tick_bind(dt)
  end
  if hero and fighting then
    local hp, max = world.health(hero)
    if hp and max and hp < max * 0.25 then
      world.heal(hero, max)
      last_hp = max
      if first_run and gate == 1 or state == "penalty" or state == "tutorial" then
        -- The Ledger won't let its hunter die in their first Gate.
        say("THE LEDGER REFUSES", "You will not die here. Health restored.\nRead the tells: glint means dodge, red means never block.", 4)
      else
        say("THE LEDGER PULLS YOU OUT", "Your health fell too low; the Ledger dragged you out of the Gate.\nThe XP from your kills stays. Grow stronger: spend points (C), upgrade your daggers.", 6)
        ledger("gate_fail")
        to_hub()
        return
      end
    end
  end

  if state == "intro" then
    if t > 15.5 or skip_pressed() then
      clear_prologue()
      state = "awaken"
      t = 0
      say("THE LEDGER HAS OPENED", "Han Seo-jin. Your debt to the Gates will be repaid in strength.\nEvery Gate you clear, you grow.\n\nPress Enter.")
    end
  elseif state == "awaken" then
    if t > 0.3 and (input.pressed("Enter") or t > 8 or (props.fast and t > 2)) then
      hud.system_close()
      state = "tutorial"
      start_lesson(1)
    end
  elseif state == "tutorial" then
    if input.pressed("KeyG") then
      lesson = #LESSONS
      lesson_done()
      return
    end
    if props.fast and t > 1.2 then lesson_done() return end
    if lesson == 1 then
      local hx, _, hz = world.position(hero)
      local cx, _, cz = world.position(construct)
      if hx and cx and (hx - cx) ^ 2 + (hz - cz) ^ 2 < 3.2 * 3.2 then lesson_done() end
    end
  elseif state == "advance" then
    local g = GATES[gate]
    local r = g.rooms[room]
    if r and hero_z() < ROOM_Z[room] + 7 then
      seal(gate, room, true)
      gather()
      for _, f in ipairs(r.foes) do spawn(f[1], g.ox + f[2], ROOM_Z[room] + f[3], room) end
      say(r.title, r.hint, 5)
      state = "fight"
      t = 0
    elseif not r and hero_z() < -91 then
      seal(gate, 4, true)
      gather()
      hud.panels(string.format("%g 2.2 -91 > %g 1.6 -104 | The Gate's master. | GRAAH | 2.6\n", g.ox + 3, g.ox))
      boss = spawn(g.boss, g.ox, -105, "boss")
      state = "boss_intro"
      t = 0
    end
  elseif state == "fight" then
    local g = GATES[gate]
    local r = g.rooms[room]
    local left = standing(room)
    objective(r.title .. ": defeat the " .. (g.foe or "goblins") .. " (" .. left .. " left)")
    if left == 0 and t > 1 then
      seal(gate, room + 1, false)
      raise_fallen()
      say("CLEARED", room < #g.rooms and "The next door opens." or "The way to the Gate's master opens.", 3)
      objective(room < #g.rooms and "Go north" or "Face the Gate's master (north)")
      skip_to(ROOM_Z[room] - 8)
      room = room + 1
      state = "advance"
      t = 0
    end
  elseif state == "boss_intro" then
    if t > 2.8 or (t > 0.4 and skip_pressed()) then
      local g = GATES[gate]
      world.send(boss, "wake")
      hud.boss(g.boss, g.boss_title)
      objective("Defeat the " .. g.boss)
      state = "boss"
      t = 0
    end
  elseif state == "boss" then
    standing("boss")
    if dead(boss) then
      hud.boss("", "")
      objective("Gate cleared")
      audio.music("title")
      state = "cleared"
      t = 0
      ledger("gate_clear", grade())
    end
  elseif state == "outro" then
    if t > 0.3 and (input.pressed("Enter") or (props.fast and t > 3)) then
      first_run = false
      to_hub()
      say("THE HUNTER ASSOCIATION", "Your base between Gates.\n" ..
        "Gate Board (left): choose your next Gate.   Smith Kang (right): upgrade your daggers.\n" ..
        "Training mat: the Daily Quest, a stat point a day.   Your door (back right): rest and save.\n" ..
        "C opens your status. Walk up to a station and press G.", 12)
    end
  elseif state == "returning" then
    if t > 3 then to_hub() end
  elseif state == "ceremony" then
    if t > 9 or (t > 1 and skip_pressed()) then
      say(CEREMONY[new_rank][2], CEREMONY[new_rank][3])
      state = "ranked"
      t = 0
    end
  elseif state == "ranked" then
    if t > 0.3 and (input.pressed("Enter") or (props.fast and t > 3)) then
      hud.system_close()
      state = "hub"
      ledger("hub")
    end
  elseif state == "penalty" then
    local left = math.max(0, 60 - t)
    objective(string.format("PENALTY QUEST: survive %d:%02d", math.floor(left / 60), math.floor(left % 60)))
    standing("penalty")
    if t >= penalty_next and t < 50 then
      penalty_next = t + 15
      for _, x in ipairs({ -6, 0, 6 }) do spawn(G, x, -108, "penalty") end
    end
    if t >= 60 or (props.fast and t > 3) then
      to_hub()
      ledger("penalty_done")
    end
  end
end
