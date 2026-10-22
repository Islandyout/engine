-- The regions of the map (the scene builder places bestiary.lua in front of this and fills in the table): entering one says
-- its name and how dangerous it is for you, so strength can be read before it is felt. A region you have not been to is
-- announced in full the first time and briefly afterwards.
REGIONS = --@REGIONS@
MAPDATA = --@MAP@
local TIER_WORD = { "green", "yellow", "orange", "red", "black" }
local TIER_NAME = { "Safe", "Frontier", "Wild", "Deadly", "Forbidden" }
local REALM_NAMES = { "Mortal", "Qi Gathering", "Foundation", "Golden Core", "Nascent Soul", "Spirit Severing", "Void Ascendant" }
local player
local realm = 1
local current = nil            -- the region the Player is in
local visited = {}
local clock = 0

local function me() player = player or world.find("Player") return player end

-- The innermost region containing the point (the smallest circle wins, so a shrine inside a valley is its own place).
local function region_at(x, z)
  local best, best_r = nil, math.huge
  for _, r in ipairs(REGIONS) do
    for _, c in ipairs(r.circles) do
      local d = math.sqrt((x - c[1]) ^ 2 + (z - c[2]) ^ 2)
      if d < c[3] and c[3] < best_r then best, best_r = r, c[3] end
    end
  end
  return best
end

local function persist()
  local list = {}
  for id in pairs(visited) do list[#list + 1] = id end
  table.sort(list)
  save.set("jianghu-road-regions", "visited=" .. table.concat(list, ","))
end

-- The world map (M) and the minimap: regions you have been to are drawn in their colour with their name; the rest are mist.
-- Roads are always on it (they are how you find your way); hubs are marked once their region is known.
local TIER_COLOUR = { "#4f7a3c", "#6f7a3a", "#8a6a34", "#8a3a2c", "#3a2c3a" }
local function draw_map()
  local lines = { "bounds -500 -500 500 500", "north -z", "area -500 -500 500 500 #24302a" }
  -- Biggest first, so a small region sits on top of the one round it.
  local order = {}
  for _, r in ipairs(REGIONS) do order[#order + 1] = r end
  table.sort(order, function(a, b) return a.circles[1][3] > b.circles[1][3] end)
  for _, r in ipairs(order) do
    local c = r.circles[1]
    local known = visited[r.id]
    lines[#lines + 1] = string.format("area %.0f %.0f %.0f %.0f %s%s", c[1] - c[3] * 0.8, c[2] - c[3] * 0.8, c[1] + c[3] * 0.8, c[2] + c[3] * 0.8,
      known and TIER_COLOUR[r.tier] or "#2e3833", known and (" " .. r.name) or "")
  end
  for _, r in ipairs(order) do
    local c = r.circles[1]
    lines[#lines + 1] = string.format("label %.0f %.0f %s", c[1], c[2] + c[3] * 0.55, visited[r.id] and r.name or "?")
  end
  for _, road in ipairs(MAPDATA.roads) do
    local pts = {}
    for _, p in ipairs(road) do pts[#pts + 1] = string.format("%.0f %.0f", p[1], p[2]) end
    lines[#lines + 1] = "path " .. table.concat(pts, " ")
  end
  lines[#lines + 1] = "title Jianghu Road|WORLD MAP"
  for _, l in ipairs({ "player You", "home Waystone: rest and travel", "giver Quest giver", "target Strong opponent" }) do lines[#lines + 1] = "legend " .. l end
  hud.map_layout(table.concat(lines, "\n"))
  hud.minimap(false)
  for _, h in ipairs(MAPDATA.hubs) do
    local r = region_at(h.x, h.z)
    if r and visited[r.id] then hud.map_marker("hub_" .. h.name, "gate", h.x, h.z, "", h.name) end
  end
end

local function announce(r)
  local first = not visited[r.id]
  visited[r.id] = true
  if first then persist() draw_map() end
  local lo, hi = r.lo, r.hi
  local span = lo == hi and ("Realm " .. lo) or ("Realms " .. lo .. " to " .. hi)
  local _, word, danger = threat_of(hi, realm)
  local note
  if danger >= 4 then note = "Far beyond you. Turn back or be very careful."
  elseif danger == 3 then note = "Dangerous for you now."
  elseif danger == 2 then note = "A hard road for you."
  elseif realm - lo >= 2 then note = "Little here can hurt you now."
  else note = "A fair place for you." end
  ui.set_text("Notification", string.format("%s\n%s: %s. %s", r.name, TIER_NAME[r.tier], span, note))
  if first then hud.announce(r.name .. ". " .. r.text) end
  world.send(me(), "region", r.id .. "|" .. r.name .. "|" .. r.tier)
end

function on_message(name, value)
  if name == "lang" then set_language(value) return end
  if name == "realm" then realm = tonumber(value) or realm end
end

function on_start()
  local list = tostring(save.get("jianghu-road-regions") or ""):match("visited=(.*)$")
  if list then for id in list:gmatch("[^,]+") do visited[id] = true end end
  draw_map()
end

function on_tick(dt)
  clock = clock + dt
  if clock < 0.5 or not me() then return end
  clock = 0
  local x, y, z = world.position(me())
  if not x then return end
  local r = region_at(x, z)
  if r ~= current then
    current = r
    if r then announce(r) end
  end
end
