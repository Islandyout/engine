-- Eden Phase 3: a logic-only entity (no mesh of its own, see build_eden.ts's
-- "Creator" entity) that fulfils "let there be..." requests. It never
-- decides WHAT to spawn -- the Creator panel (edenAgents.ts) already
-- resolved a prefab name client-side, fuzzy-matched against Eden's own
-- named prefabs, before this ever fires. This script exists only because
-- world.spawn is Lua-only -- nothing TS-side can call it directly.

local placed = {} -- id -> entity, for what the people have built

function on_ui(name, value)
  -- The mind's clock: light the scene for the hour (sun, moon, sky and fog).
  if name == "eden_time" then
    local hours = tonumber(value)
    if hours then fx.time_of_day(hours) end
    return
  end
  -- The people build things: "id,prefab,x,z" puts one on the ground there, "id" takes it away again (a fire gone out).
  if name == "eden_place" then
    local id, prefab, x, z = string.match(value, "^([^,]+),([^,]+),([^,]+),([^,]+)$")
    x, z = tonumber(x), tonumber(z)
    if not (id and prefab and x and z) then return end
    local _, _, _, hy = world.raycast(x, 60, z, 0, -1, 0, 120)
    placed[id] = world.spawn(prefab, x, hy or 0, z)
    return
  end
  if name == "eden_remove" then
    local e = placed[value]
    if e then world.destroy(e) end
    placed[value] = nil
    return
  end
  -- The weather: "rain,fog" (0-1) for the sky and the sound of it.
  if name == "eden_weather" then
    local rain, fog = string.match(value, "^([^,]+),([^,]+)$")
    if rain then fx.weather(tonumber(rain) or 0, tonumber(fog) or 0, 1.5, 0.5) end
    return
  end
  if name ~= "eden_create" then return end
  local parts = {}
  for p in string.gmatch(value, "[^,]+") do parts[#parts + 1] = p end
  if #parts < 4 then return end
  local prefab = parts[1]
  local x, y, z = tonumber(parts[2]), tonumber(parts[3]), tonumber(parts[4])
  if not (x and y and z) then return end
  world.spawn(prefab, x, y, z)
end
