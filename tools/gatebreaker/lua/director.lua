-- GATEBREAKER M1: the E-rank Gate, start to finish. The Director walks the
-- player through the prologue panels, the Ledger awakening, the tutorial
-- against the training construct, three goblin rooms that seal and open,
-- the Goblin Chieftain, and the rewards.
-- @prop fast false
--
-- props.fast (tests): every tutorial step passes after a moment and the
-- rewards confirm themselves.

local PROLOGUE = [[
14 6 40 > 0 5 70 | Seoul. Ten years after the first Gates opened in the sky. |  | 4
-1.6 1.8 49.4 > 0 1.6 52.6 | Han Seo-jin. E-rank. The weakest hunter in the city. |  | 4
0 1.2 60 > 0 1.6 69 | Then the Double Gate opened. | VWOOM | 3.5
1.2 1.65 54.2 > 0 1.55 52 | And something inside it answered him. | SHING | 3.5
]]
local BOSS_INTRO = [[
3 2.2 -91 > 0 1.6 -104 | The Gate's master. | GRAAH | 2.6
]]

local ROOMS = {
  { z = -24, seal_in = "Seal 1", seal_out = "Seal 2", title = "ROOM 1", enemies = { "R1 Grunt A", "R1 Grunt B", "R1 Grunt C" },
    hint = "Goblins. Tab locks on to one; Left click strikes.\nLand four in a row, then Right click for a finisher." },
  { z = -48, seal_in = "Seal 2", seal_out = "Seal 3", title = "ROOM 2", enemies = { "R2 Grunt A", "R2 Archer A", "R2 Archer B", "R2 Grunt B" },
    hint = "Archers shoot from the back. Close the distance,\nor throw Shadow Fang (R) at them." },
  { z = -72, seal_in = "Seal 3", seal_out = "Seal 4", title = "ROOM 3", enemies = { "R3 Shieldbearer", "R3 Grunt A", "R3 Grunt B" },
    hint = "A shield-bearer. Light attacks bounce off its guard.\nBreak it with a Heavy (Right click), and fill its stagger bar." },
}

local LESSONS = {
  { "MOVE", "WASD moves. Walk up to the training construct.", "Walk to the construct" },
  { "ATTACK", "Left click strikes. Land 3 hits on the construct.", "Land 3 hits (Left click)" },
  { "HEAVY", "Right click is a Heavy: slower, but it breaks guards.\nLand a Heavy.", "Land a Heavy (Right click)" },
  { "DODGE", "Space dodges. The construct's weapon glints before it strikes:\ndodge through the blow.", "Dodge its swing (Space)" },
  { "PERFECT DODGE", "Dodge at the last instant and time slows.\nThen strike (Left click) to Shadow Step behind it.", "Perfect Dodge, then strike" },
  { "PARRY", "Hold Shift to block. Tap Shift just before a blow lands\nto Parry it and fill your ultimate gauge.", "Parry a swing (tap Shift)" },
}

local STATS = { "STR", "AGI", "VIT", "INT", "SEN" }

local state = "intro"
local t = 0            -- seconds in the current state
local hero, construct, boss
local lesson = 1
local progress = 0
local room = 0
local window_until = -1
local clock = 0
local stats = { 10, 10, 10, 10, 10 }
local points = 5
local phase2 = false
local rescued = 0

local function find(name) return world.find(name) end

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

local function seal(name, closed)
  local id = find(name)
  if not id then return end
  local x, _, z = world.position(id)
  world.set_position(id, x, closed and 1.75 or -40, z)
end

local function hero_z()
  local _, _, z = world.position(hero)
  return z or 0
end

local function skip_pressed()
  return input.pressed("Enter") or input.pressed("Space")
end

local function start_lesson(n)
  lesson = n
  progress = 0
  t = 0
  local l = LESSONS[n]
  say(l[1], l[2], 5)
  objective("Tutorial " .. n .. "/" .. #LESSONS .. ": " .. l[3])
  if n == 4 then world.send(construct, "swing_on") end
end

local function lesson_done()
  if lesson < #LESSONS then
    start_lesson(lesson + 1)
    return
  end
  -- The construct crumbles, so lock-on (Tab) finds the goblins, not it.
  world.destroy(construct)
  seal("Seal 1", false)
  say("TUTORIAL COMPLETE", "The training construct crumbles. The Gate's first door opens.\nGo north.", 4)
  objective("Enter the Gate (north)")
  state = "advance"
  room = 1
  t = 0
end

local function remaining(list)
  local n = 0
  for _, name in ipairs(list) do
    local id = find(name)
    if id and world.alive(id) then
      local hp = world.health(id)
      if hp and hp > 0 then n = n + 1 end
    end
  end
  return n
end

local function stats_text()
  local parts = {}
  for i, name in ipairs(STATS) do parts[#parts + 1] = "[" .. i .. "] " .. name .. " " .. stats[i] end
  return table.concat(parts, "   ")
end

function on_start()
  hero = find("Han Seo-jin")
  construct = find("Training Construct")
  boss = find("Goblin Chieftain")
  objective("")
  hud.panels(PROLOGUE)
  audio.music("tension")
end

function on_message(name, value)
  if state == "tutorial" then
    if name == "hero_hit" and type(value) == "string" then
      local move, outcome = value:match("^(.-):(.*)$")
      if lesson == 2 and outcome == "hit" then
        progress = progress + 1
        objective("Tutorial 2/6: Land 3 hits (" .. progress .. "/3)")
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
  elseif name == "phase2" and not phase2 then
    phase2 = true
    say("PHASE 2", "The Chieftain roars. Its red slams come faster now:\nwhen it flashes red, don't block. Dodge.", 4)
  end
end

function on_tick(dt)
  clock = clock + dt
  t = t + dt
  if window_until >= 0 and clock >= window_until then
    hud.system_close()
    window_until = -1
  end
  -- The Ledger won't let its hunter die in an E-rank Gate.
  if hero and state ~= "intro" then
    local hp, max = world.health(hero)
    if hp and max and hp < max * 0.25 then
      world.heal(hero, max)
      rescued = rescued + 1
      say("THE LEDGER REFUSES", "You will not die in an E-rank Gate. Health restored.\nRead the tells: glint means dodge, red means never block.", 4)
    end
  end

  if state == "intro" then
    if t > 15.5 or skip_pressed() then
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
    local r = ROOMS[room]
    if r and hero_z() < r.z + 7 then
      seal(r.seal_in, true)
      for _, name in ipairs(r.enemies) do
        local id = find(name)
        if id then world.send(id, "wake") end
      end
      say(r.title, r.hint, 5)
      state = "fight"
      t = 0
    elseif not r and hero_z() < -91 then
      seal("Seal 4", true)
      hud.panels(BOSS_INTRO)
      state = "boss_intro"
      t = 0
    end
  elseif state == "fight" then
    local r = ROOMS[room]
    local left = remaining(r.enemies)
    objective(r.title .. ": defeat the goblins (" .. left .. " left)")
    if left == 0 and t > 1 then
      seal(r.seal_out, false)
      say("CLEARED", room < #ROOMS and "The next door opens." or "The way to the Gate's master opens.", 3)
      objective(room < #ROOMS and "Go north" or "Face the Gate's master (north)")
      room = room + 1
      state = "advance"
      t = 0
    end
  elseif state == "boss_intro" then
    if t > 2.8 or (t > 0.4 and skip_pressed()) then
      world.send(boss, "wake")
      hud.boss("Goblin Chieftain", "GOBLIN CHIEFTAIN  ·  E-rank Gate master")
      objective("Defeat the Goblin Chieftain")
      state = "boss"
      t = 0
    end
  elseif state == "boss" then
    local hp = boss and world.alive(boss) and world.health(boss)
    if not hp or hp <= 0 then
      hud.boss("", "")
      say("GATE CLEARED", "The Goblin Chieftain falls. The E-rank Gate begins to close.", 4)
      objective("Gate cleared")
      audio.music("title")
      state = "cleared"
      t = 0
    end
  elseif state == "cleared" then
    if t > 4 then
      state = "levelup"
      t = 0
      say("LEVEL UP", "Lv.1 -> Lv.2. You have " .. points .. " stat points.\n" .. stats_text() .. "\n\nPress 1-5 to spend a point, Backspace to undo, Enter to confirm.")
    end
  elseif state == "levelup" then
    local changed = false
    for i = 1, 5 do
      if points > 0 and input.pressed("Digit" .. i) then
        stats[i] = stats[i] + 1
        points = points - 1
        changed = true
      end
    end
    if input.pressed("Backspace") then
      stats = { 10, 10, 10, 10, 10 }
      points = 5
      changed = true
    end
    if props.fast and t > 0.5 and points > 0 then
      stats[5] = stats[5] + points
      points = 0
      changed = true
    end
    if changed then
      say("LEVEL UP", "Lv.1 -> Lv.2. " .. points .. " stat points left.\n" .. stats_text() .. "\n\nPress 1-5 to spend a point, Backspace to undo, Enter to confirm.")
    end
    if points == 0 and (input.pressed("Enter") or (props.fast and t > 1)) then
      world.send(hero, "unlock")
      say("NEW SKILL: SHADOW STEP DASH", "[Q] Dash through your enemies as a shadow,\ncutting everything in your path. Costs 25 mana.\n\nPress Enter.")
      state = "skill"
      t = 0
    end
  elseif state == "skill" then
    if t > 0.3 and (input.pressed("Enter") or (props.fast and t > 1)) then
      say("E-RANK GATE: CLEARED", "Han Seo-jin   Lv.2   " .. stats_text():gsub("%[%d%] ", "") ..
        "\nThe Gate closes behind you. Somewhere, the Double Gate is still open.\n\nTo be continued.")
      objective("E-rank Gate cleared. Try Shadow Step Dash (Q).")
      state = "done"
      t = 0
    end
  end
end
