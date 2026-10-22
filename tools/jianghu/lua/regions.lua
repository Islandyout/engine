-- The regions of the map (the scene builder places bestiary.lua in front of this and fills in the table): entering one says
-- its name and how dangerous it is for you, so strength can be read before it is felt. A region you have not been to is
-- announced in full the first time and briefly afterwards.
REGIONS = --@REGIONS@
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

local function announce(r)
  local first = not visited[r.id]
  visited[r.id] = true
  if first then persist() end
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
