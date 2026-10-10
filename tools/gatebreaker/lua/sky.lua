-- GATEBREAKER M4: the Sky, the district's clock (GAME_DESIGN.md section 13,
-- "Day and night"). A full day takes 24 real minutes, a game hour a minute:
-- day is 06:00-22:00 (16 minutes; Smith Kang's forge is open), night
-- 22:00-06:00 (8 minutes), with about an hour of dawn and of dusk blending
-- between them (apps/editor/src/editor/timeOfDay.ts lights each hour).
--
-- Out in the city it lights the scene for the hour (fx.time_of_day); inside
-- a Gate the Gate's own light stays (the Director says which: "outdoors").
-- It tells the World, the Ledger, the Director and the Hub "time" = "day" or
-- "night" at the start and whenever that changes, and the Ledger and the
-- Hub the "hour" (a number) every game minute; the HUD shows the clock,
-- "Day 3 · 21:40".
--
-- One day: the Ledger counts the days (its save) and the clock follows it.
-- The clock wraps at midnight without changing the day; a new Ledger day
-- (resting at home, or a penalty survived) brings the morning, 06:00. The
-- hour is saved with the day it belongs to ("gbsky"). A new game starts at
-- 04:30, the end of the night the Double Gate opened; a hunter saved before
-- the clock existed starts at 09:00.
--
-- Esc opens the settings as a pause menu (hud.pause_menu).

local DAY_START, NIGHT_START = 6, 22
local NEW_GAME, OLD_SAVE, MORNING = 4.5, 9, 6
local RATE = 1 / 60 -- game hours per real second
local TOLD = { "World", "Ledger", "Director", "Hub" }
local HOURLY = { "Ledger", "Hub" }
local DAY_COLOR, NIGHT_COLOR = "#f2e6c8", "#a8b4ff"

local hours = NEW_GAME
local day = 1
local outdoors = true
local phase -- "day" or "night", once told
local minute_shown
local clock = 0
local save_at, day_check = 10, 0
local started = false

local function ledger_day()
  local text = save.get("gb")
  return text and tonumber(text:match("day=(%d+)")) or 1, text ~= nil
end

local function store()
  save.set("gbsky", string.format("day=%d;h=%.3f", day, hours))
end

local function send_all(names, name, value)
  for _, entity in ipairs(names) do
    local id = world.find(entity)
    if id then world.send(id, name, value) end
  end
end

-- Where the clock starts: the saved hour if it belongs to the Ledger's
-- day, the morning after a rest, or a fresh start.
local function start()
  if started then return end
  started = true
  local lday, has_ledger = ledger_day()
  local text = save.get("gbsky")
  local sday = text and tonumber(text:match("day=(%d+)"))
  local saved = text and tonumber(text:match("h=([%d.]+)"))
  day = lday
  if not has_ledger then
    hours = NEW_GAME
  elseif sday == lday and saved then
    hours = saved % 24
  elseif sday and sday < lday then
    hours = MORNING
  else
    hours = OLD_SAVE
  end
  hud.pause_menu(true)
end

local function light()
  if outdoors then fx.time_of_day(hours) else fx.time_of_day(-1) end
end

function on_start()
  start()
end

function on_message(name, value)
  start()
  if name == "outdoors" then
    outdoors = value == true
    light()
  end
end

function on_tick(dt)
  start()
  clock = clock + dt
  hours = (hours + dt * RATE) % 24
  if clock >= day_check then
    day_check = clock + 0.5
    local lday = ledger_day()
    if lday ~= day then
      -- A new day began at home: the morning (or a reset save: its day).
      if lday > day then hours = MORNING end
      day = lday
      minute_shown = nil
      store()
    end
  end
  local now = (hours >= NIGHT_START or hours < DAY_START) and "night" or "day"
  if now ~= phase then
    phase = now
    send_all(TOLD, "time", now)
    ui.set_color("Clock", now == "night" and NIGHT_COLOR or DAY_COLOR)
  end
  local minute = math.floor(hours * 60)
  if minute ~= minute_shown then
    minute_shown = minute
    ui.set_text("Clock", string.format("Day %d · %02d:%02d", day, minute // 60, minute % 60))
    send_all(HOURLY, "hour", hours)
    if outdoors then fx.time_of_day(hours) end
  end
  if clock >= save_at then
    save_at = clock + 10
    store()
  end
end
