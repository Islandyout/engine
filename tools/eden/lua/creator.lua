-- Eden Phase 3: a logic-only entity (no mesh of its own, see build_eden.ts's
-- "Creator" entity) that fulfils "let there be..." requests. It never
-- decides WHAT to spawn -- the Creator panel (edenAgents.ts) already
-- resolved a prefab name client-side, fuzzy-matched against Eden's own
-- named prefabs, before this ever fires. This script exists only because
-- world.spawn is Lua-only -- nothing TS-side can call it directly.

function on_ui(name, value)
  -- The mind's clock: light the scene for the hour (sun, moon, sky and fog).
  if name == "eden_time" then
    local hours = tonumber(value)
    if hours then fx.time_of_day(hours) end
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
