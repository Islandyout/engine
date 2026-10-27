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
  -- The people build things: "id,prefab,x,y,z" puts one there (the host knows the ground's height), "id" takes it away again (a fire gone out).
  if name == "eden_place" then
    -- "id,prefab,x,y,z" or "id,prefab,x,y,z,who" (a person's body: it is told its name)
    local id, prefab, x, y, z, who = string.match(value, "^([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),?(.*)$")
    x, y, z = tonumber(x), tonumber(y), tonumber(z)
    if not (id and prefab and x and y and z) then return end
    local e = world.spawn(prefab, x, y, z)
    placed[id] = e
    if e and who and who ~= "" then world.send(e, "eden_who", who) end
    return
  end
  -- Tell a body who it is again (a script that had not started when the first message came never heard it): "id".
  if name == "eden_tell" then
    local e = placed[value]
    if e then world.send(e, "eden_who", value) end
    return
  end
  -- A creature that has moved: "id,x,y,z".
  if name == "eden_move" then
    local id, x, y, z = string.match(value, "^([^,]+),([^,]+),([^,]+),([^,]+)$")
    x, y, z = tonumber(x), tonumber(y), tonumber(z)
    local e = id and placed[id]
    if e and x and y and z then world.set_position(e, x, y, z) end
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
    local rain, fog, wx, wz = string.match(value, "^([^,]+),([^,]+),([^,]+),([^,]+)$")
    if rain then fx.weather(tonumber(rain) or 0, tonumber(fog) or 0, tonumber(wx) or 1.5, tonumber(wz) or 0.5) end
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
