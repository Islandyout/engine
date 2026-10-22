-- The world itself (the scene builder places items.lua and talk.lua in front of this, and fills in WAYSTONES): the day and the
-- weather, the waystones that you find on the roads and ride between, and the first look in the mirror on a new road.
-- @prop intro 1
WAYSTONES = --@WAYSTONES@
local sky = fx
local player
local day_hours = 8
local DAY_SECONDS = 720
local rain, weather_left, sky_clock, clock = 0, 45, 2, 0
local found = {}               -- waystone entity -> true once you have been near it
local ride = nil               -- a ride in progress: { x, y, z, left }
local node, at = "root", 1
local menu_for = nil           -- the waystone whose menu is open

local function me() player = player or world.find("Player") return player end

local function persist()
  local list = {}
  for name in pairs(found) do list[#list + 1] = name end
  table.sort(list)
  save.set("jianghu-world", string.format("hours=%.2f;found=%s", day_hours, table.concat(list, ",")))
end

local function discovered()
  local list = {}
  for _, w in ipairs(WAYSTONES) do if found[w.entity] and w.entity ~= menu_for then list[#list + 1] = w end end
  return list
end

local function render(note)
  local list = discovered()
  if node == "root" then
    say(menu_for, note or "A stone older than the road. Touch it and the way is known.", { "Rest here and remember this place", "Travel to another waystone", "Leave" })
  else
    local dest = list[at]
    say(menu_for, note or (dest and ("To " .. dest.label .. " (10 silver).") or "You know no other waystone yet."), dest and { "Go there", "Another place", "Back" } or { "Back" })
  end
end

local function set_lighting()
  sky.time_of_day(day_hours)
end

local function choose(n)
  local list = discovered()
  if node == "root" then
    if n == 1 then
      local id = world.find(menu_for)
      local x, y, z = world.position(id)
      world.send(me(), "rest", string.format("%.2f,%.2f,%.2f", x + 2.2, y + 1.2, z + 2.2))
      persist()
      render("Rested. This is where you will return.")
    elseif n == 2 then node, at = "travel", 1 render()
    else end_talk() end
  else
    local dest = list[at]
    if n == 1 and dest then
      if inventory.count(me(), "Silver") < 10 then render("You need 10 silver.") return end
      inventory.remove(me(), "Silver", 10)
      local id = world.find(dest.entity)
      local x, y, z = world.position(id)
      end_talk()
      ride = { x = x + 2.2, y = y + 1.2, z = z + 2.2, left = 0.8 }
      ui.set_text("Notification", "Travelling\nTo " .. dest.label)
    elseif n == 2 and #list > 0 then at = at % #list + 1 render()
    else node = "root" render() end
  end
end

function on_message(name, value)
  if name == "lang" then set_language(value) return end
  value = tostring(value)
  if name == "waystone" then
    menu_for, node, at = value, "root", 1
    start_talk(value)
    render()
  elseif name == "arrive" then
    -- The Player came back from a fall or a defeat; nothing to do but keep the light right.
    sky_clock = 2
  end
end

function on_start()
  local text = save.get("jianghu-world")
  if text and text ~= "" then
    local h = text:match("hours=([%d.]+)")
    if h then day_hours = tonumber(h) end
    for name in (text:match("found=(.*)$") or ""):gmatch("[^,]+") do found[name] = true end
  elseif (tonumber(props.intro) or 1) > 0 then
    -- A new road starts with a look in the mirror.
    after(2, function() world.send(me(), "mirror", "1") end)
  end
  audio.ambience("wind", 0.35)
  sky.time_of_day(day_hours)
end

function on_tick(dt)
  tap_tick(dt)
  clock = clock + dt
  if not me() then return end
  day_hours = (day_hours + dt * 24 / DAY_SECONDS) % 24
  world.set_clock(day_hours)
  weather_left = weather_left - dt
  if weather_left <= 0 then
    weather_left = 60 + math.random() * 90
    rain = math.random() < 0.3 and 0.35 + math.random() * 0.3 or 0
    sky.weather(rain, rain > 0 and 0.35 or 0.08, 1.5, 0.5)
    audio.ambience("rain", rain)
  end
  sky_clock = sky_clock + dt
  if sky_clock >= 2 then sky_clock = 0 set_lighting() end
  if ride then
    ride.left = ride.left - dt
    if ride.left <= 0 then
      day_hours = (day_hours + 0.25) % 24
      world.set_position(me(), ride.x, ride.y, ride.z)
      world.set_velocity(me(), 0, 0, 0)
      ride = nil
      set_lighting()
    end
  end
  if talking and menu_for then
    local n = talk_poll()
    if not talking then menu_for = nil end
    if n then choose(n) end
  end
  if clock >= 1 then
    clock = 0
    world.send(me(), "hours", string.format("%.2f", day_hours))
    -- Waystones you have been near can be ridden to.
    for _, w in ipairs(WAYSTONES) do
      if not found[w.entity] then
        local d = distance_to(w.entity)
        if d and d < 14 then
          found[w.entity] = true
          ui.set_text("Notification", "Waystone found\n" .. w.label)
          persist()
        end
      end
    end
    save.set("jianghu-world", string.format("hours=%.2f;found=%s", day_hours, (function() local l = {} for k in pairs(found) do l[#l + 1] = k end table.sort(l) return table.concat(l, ",") end)()))
  end
end
