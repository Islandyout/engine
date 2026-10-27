-- Eden Phase 1a: see adam.lua's own doc comment -- identical pattern, just
-- Eve's own event name/outfit. Driven entirely by edenAgents.ts (TS) via
-- editor_ui_event("eden_target_eve", "x,y,z,action"); never decides
-- anything itself (the sandboxed Lua VM has no network access at all).

-- "Woman (casual)" (catalog id 251) carries its own clips (idle/run/sit/
-- walk/Clapping/Death) -- already a clothed, fully-animated model, so
-- there's no outfit to dress (unlike the clip-less UBC base bodies).

local target = nil -- {x, y, z, action}
local waypoints = nil
local wpIndex = 1
local arrived = true
local playedAction = nil
local WALK_SPEED = 1.6

local function parse_target(value)
  local parts = {}
  for p in string.gmatch(value, "[^,]+") do parts[#parts + 1] = p end
  if #parts < 4 then return nil end
  return { x = tonumber(parts[1]), y = tonumber(parts[2]), z = tonumber(parts[3]), action = parts[4], speed = tonumber(parts[5]) }
end

function on_ui(name, value)
  if name ~= "eden_target_eve" then return end
  local t = parse_target(value)
  if not t then return end
  target = t
  waypoints = world.path(self.x, self.y, self.z, t.x, t.y, t.z)
  -- No route found (the path grid does not cover open terrain): walk straight at the target and let physics steer round what is in the way.
  if not waypoints or #waypoints == 0 then waypoints = { { x = t.x, y = t.y, z = t.z } } end
  wpIndex = 1
  arrived = false
end

local function play(action)
  if playedAction ~= action then
    self.animate = action
    playedAction = action
  end
end

function on_tick(dt)
  if not target then return end
  if arrived then
    self.vx, self.vz = 0, 0
    play(target.action)
    return
  end
  if not waypoints or #waypoints == 0 then
    arrived = true
    return
  end
  local wp = waypoints[wpIndex]
  local dx, dz = wp.x - self.x, wp.z - self.z
  local dist = math.sqrt(dx * dx + dz * dz)
  if dist < 0.3 then
    wpIndex = wpIndex + 1
    if wpIndex > #waypoints then
      arrived = true
      self.vx, self.vz = 0, 0
      play(target.action)
      return
    end
  else
    self.vx = (dx / dist) * (target.speed or WALK_SPEED)
    self.vz = (dz / dist) * (target.speed or WALK_SPEED)
    play((target.speed or WALK_SPEED) > 3 and "run" or "walk")
  end
end
