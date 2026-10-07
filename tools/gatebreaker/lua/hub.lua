-- GATEBREAKER M2: the hub, the Hunter Association's square. Near a station
-- the Prompt line says what G does there; G opens the Ledger's Gate Board
-- or smith menu, starts the Daily Quest drill on the training mat, or goes
-- home to rest (which ends the day and saves).
-- @prop fast false
--
-- props.fast (tests): the drill passes two seconds after it starts.
--
-- The drill: land 20 hits, dodge the construct's swing 5 times and land a
-- Heavy within 150 seconds. Done, the Ledger gives a stat point.

local STATIONS = {
  { x = -10, z = 57, r = 2.8, id = "board", text = "[G] Gate Board: choose a Gate" },
  { x = 10, z = 57.6, r = 2.8, id = "smith", text = "[G] Smith Kang: upgrade your daggers" },
  { x = -9, z = 45.6, r = 3.2, id = "mat", text = "[G] Daily Quest: start the training drill" },
  { x = 10, z = 41.8, r = 2.4, id = "home", text = "[G] Go home: rest, save, end the day" },
}
local HEAVIES = { cross_cut = true, rising_slash = true, twin_pierce = true, crescent = true, execution = true }
local GOAL = { hits = 20, dodges = 5, heavy = 1 }
local TIME = 150

local hero, construct
local busy = false
local shown
local drill        -- nil, or {t, hits, dodges, heavy}
local daily_done = false

local function prompt(text)
  if text ~= shown then
    shown = text
    ui.set_text("Prompt", text)
  end
end

local function in_hub(x, z)
  return x and x > -17 and x < 17 and z > 38 and z < 66
end

local function stop_drill()
  drill = nil
  if construct then world.send(construct, "swing_off") end
end

local function drill_text()
  local left = math.max(0, TIME - drill.t)
  return string.format("DAILY DRILL   hits %d/%d   dodges %d/%d   Heavy %d/%d   %d:%02d",
    math.min(drill.hits, GOAL.hits), GOAL.hits, math.min(drill.dodges, GOAL.dodges), GOAL.dodges,
    math.min(drill.heavy, GOAL.heavy), GOAL.heavy, math.floor(left / 60), math.floor(left % 60))
end

function on_start()
  hero = world.find("Han Seo-jin")
  construct = world.find("Hub Construct")
end

function on_message(name, value)
  if name == "busy" then
    busy = value == true
  elseif name == "daily" then
    daily_done = value == true
  elseif name == "hero_hit" and drill and type(value) == "string" then
    local move, outcome = value:match("^(.-):(.*)$")
    if outcome == "hit" then drill.hits = drill.hits + 1 end
    if HEAVIES[move] and outcome ~= "dodged" then drill.heavy = drill.heavy + 1 end
  elseif name == "construct" and drill and value == "dodged" then
    drill.dodges = drill.dodges + 1
  end
end

function on_tick(dt)
  if not hero then return end
  local x, _, z = world.position(hero)
  if not in_hub(x, z) then
    if drill then stop_drill() end
    prompt("")
    return
  end
  if drill and drill.spar then
    -- Sparring: no goals; it ends when the hunter steps off the mat.
    if (x + 9) ^ 2 + (z - 45) ^ 2 > 5 * 5 then stop_drill() end
    prompt(drill and "SPARRING: step off the mat to stop" or "")
    return
  end
  if drill then
    drill.t = drill.t + dt
    if props.fast and drill.t > 2 then drill.hits, drill.dodges, drill.heavy = GOAL.hits, GOAL.dodges, GOAL.heavy end
    if drill.hits >= GOAL.hits and drill.dodges >= GOAL.dodges and drill.heavy >= GOAL.heavy then
      stop_drill()
      daily_done = true
      world.send(world.find("Ledger"), "daily_done")
    elseif drill.t > TIME then
      stop_drill()
      hud.system("DRILL FAILED", "Out of time. Step back on the mat and press G to try again.")
      hud.cue("bad")
    else
      prompt(drill_text())
    end
    return
  end
  if busy then
    prompt("")
    return
  end
  local near
  for _, st in ipairs(STATIONS) do
    if (x - st.x) ^ 2 + (z - st.z) ^ 2 < st.r * st.r then near = st end
  end
  if not near then
    prompt("")
    return
  end
  local text = near.text
  if near.id == "mat" and daily_done then text = "Daily Quest done. [G] Spar with the construct" end
  prompt(text)
  if input.action_pressed("interact") or input.pressed("KeyG") then
    if near.id == "board" or near.id == "smith" then
      world.send(world.find("Ledger"), near.id)
    elseif near.id == "home" then
      world.send(world.find("Ledger"), "rest")
      daily_done = false
    elseif near.id == "mat" then
      if daily_done then
        drill = { t = 0, hits = 0, dodges = 0, heavy = 0, spar = true }
      else
        drill = { t = 0, hits = 0, dodges = 0, heavy = 0 }
        hud.system("DAILY QUEST: TRAINING DRILL", "Land 20 hits, dodge the construct's swing 5 times (Space)\nand land a Heavy (Right click). You have 2:30.")
      end
      world.send(construct, "swing_on")
    end
  end
end
