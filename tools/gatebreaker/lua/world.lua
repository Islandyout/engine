-- GATEBREAKER M4: the district around the Hunter Association (built by
-- tools/gatebreaker/district.ts).
--
-- Gate sites: three cordoned open spaces where Gates tear open. Two are
-- open each day (the closed one rotates with the Ledger's day), and the
-- nearest open one carries an on-screen marker while the hunter is out in
-- the district. Standing in one, G opens the Gate Board.
--
-- The subway: Station A (by the Association) and Station B (Hangang
-- plaza). Standing at a station's entrance, G rides to the other one.

-- The district's extent (x, z), the hub inside it.
local AREA = { x0 = -105, x1 = 105, z0 = 14, z1 = 215 }
-- Sites: their entities' positions are read at start (these are fallbacks).
local SITES = {
  { name = "Gate site 1", label = "Gate: the park", x = -32, y = 3.6, z = 160 },
  { name = "Gate site 2", label = "Gate: Hangang plaza", x = 28, y = 3.6, z = 156 },
  { name = "Gate site 3", label = "Gate: the east lot", x = 88, y = 3.6, z = 72 },
}
local SITE_R = 8.5 -- inside the cordon
-- Stations: where to stand (in front of the entrance), where you arrive.
local STATIONS = {
  { name = "Station A", title = "Association Station", x = -46, z = 41.5, ax = -46, az = 38.2 },
  { name = "Station B", title = "Hangang Station", x = 48, z = 177.5, ax = 48, az = 174.2 },
}
local STATION_R = 2.6

local hero
local day, day_check = 1, 0
local marked       -- the site index the marker is on, or false
local shown = ""
local note_until = 0
local cooldown = 0

local function prompt(text)
  if text ~= shown then
    shown = text
    ui.set_text("World prompt", text)
  end
end

local function in_district(x, z)
  return x and x > AREA.x0 and x < AREA.x1 and z > AREA.z0 and z < AREA.z1
end

-- Today's closed site: day 1 closes site 3, day 2 site 1, day 3 site 2...
local function is_open(i)
  return i ~= (day + 1) % 3 + 1
end

-- The open sites on the map (hud.map_marker), in the colour of the hunter's
-- rank (or a site's own `rank`): the Gate Board there lists Gates up to it.
local RANK_COLORS = { E = "#a9b4c4", D = "#5fd16a", C = "#4aa8ff", B = "#b866ff", A = "#ffb020", S = "#ff4545" }
local rank, mapped = "E", ""
local function map_sites()
  if mapped == day .. rank then return end
  mapped = day .. rank
  for i, s in ipairs(SITES) do
    local r = s.rank or rank
    if is_open(i) then
      hud.map_marker("site" .. i, "gate", s.x, s.z, RANK_COLORS[r] or "", s.label .. " (" .. r .. ")")
    else
      hud.clear_map_marker("site" .. i)
    end
  end
end

-- The Ledger's day and rank from its save ("day=N;rank=E;..."), checked
-- every few seconds.
local function read_day()
  local text = save.get("gb")
  local n = text and tonumber(text:match("day=(%d+)"))
  day = n or 1
  rank = text and text:match("rank=(%a)") or "E"
  map_sites()
end

local function set_marker(i)
  if i == marked then return end
  if i then
    local s = SITES[i]
    ui.marker("gate_site", s.x, s.y, s.z, s.label)
  else
    ui.clear_marker("gate_site")
  end
  marked = i
end

local function pressed()
  return input.action_pressed("interact") or input.pressed("KeyG")
end

function on_start()
  hero = world.find("Han Seo-jin")
  for _, s in ipairs(SITES) do
    local id = world.find(s.name)
    if id then
      local x, y, z = world.position(id)
      if x then s.x, s.y, s.z = x, y, z end
    end
  end
  marked = false
  ui.clear_marker("gate_site")
  read_day()
end

function on_tick(dt)
  if not hero then return end
  local now = time.now or 0
  cooldown = math.max(0, cooldown - dt)
  if now >= day_check then
    day_check = now + 3
    read_day()
  end
  local x, _, z = world.position(hero)
  if not in_district(x, z) then
    -- In a Gate (or the prologue): the district keeps quiet.
    set_marker(false)
    prompt("")
    return
  end

  -- The nearest open Gate site, and whether the hunter stands in one.
  local best, best_d, here
  for i, s in ipairs(SITES) do
    if is_open(i) then
      local d = math.sqrt((x - s.x) ^ 2 + (z - s.z) ^ 2)
      if not best_d or d < best_d then best, best_d = i, d end
      if d < SITE_R then here = i end
    end
  end
  -- (No marker while standing in the site itself.)
  if here then set_marker(false) else set_marker(best or false) end

  -- What G does here: ride the subway, or open the Gate Board at a site.
  local station, other
  for i, st in ipairs(STATIONS) do
    if (x - st.x) ^ 2 + (z - st.z) ^ 2 < STATION_R * STATION_R then
      station, other = st, STATIONS[3 - i]
    end
  end
  if station then
    prompt("[G] Subway to " .. other.title)
    if cooldown == 0 and pressed() then
      world.set_position(hero, other.ax, 0.9, other.az)
      world.set_velocity(hero, 0, 0, 0)
      cooldown = 1
      note_until = now + 2.5
      shown = ""
      prompt(other.title)
    end
  elseif here then
    prompt("A Gate is open here.  [G] Gate Board: choose a Gate")
    if cooldown == 0 and pressed() then
      cooldown = 0.5
      world.send(world.find("Ledger"), "board")
    end
  elseif now < note_until then
    -- Just arrived: the station's name stays up a moment.
    return
  else
    prompt("")
  end
end
