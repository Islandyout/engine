-- @prop gear none
-- A person who was not in the garden at the start: a child born there, or someone the Creator brought in. The same body as adam.lua and
-- eve.lua, but it learns its own name from creator.lua ("eden_who"), then answers "eden_target_<name>" and "eden_snap_<name>" like they do,
-- and tells the page which body it is ("eden_body") so the page can read where it stands. The sandboxed Lua VM has no network access at all by design (see
-- source/engine/script/script.cpp's open_sandboxed_libs), so the decision
-- itself can only ever be made outside it.

-- "Man (casual)" (catalog id 249) carries its own clips (idle/talk/run/
-- walk/Wave/Death/HitRecieve) -- already a clothed, fully-animated model,
-- so there's no outfit to dress (unlike the clip-less UBC base bodies).

local who = nil -- the person this body is, told by creator.lua
local target = nil -- {x, y, z, action}
local waypoints = nil
local wpIndex = 1
local arrived = true
local playedAction = nil
local gesture_left = 0 -- seconds of a gesture (a wave, a flinch) still playing, which walking must not cut short
local WALK_SPEED = 1.6
local dead = false

local function parse_target(value)
  local parts = {}
  for p in string.gmatch(value, "[^,]+") do parts[#parts + 1] = p end
  if #parts < 4 then return nil end
  return { x = tonumber(parts[1]), y = tonumber(parts[2]), z = tonumber(parts[3]), action = parts[4], speed = tonumber(parts[5]), viaX = tonumber(parts[6]), viaZ = tonumber(parts[7]), carrying = parts[8] == "1" }
end

function on_message(name, value)
  if name == "eden_who" and type(value) == "string" then
    who = value
    host.send("eden_body", who)
  end
end

function on_ui(name, value)
  if not who then return end
  if name == "eden_gesture_" .. who then
    self.animate = value
    playedAction = value
    gesture_left = 1.6
    return
  end
  -- Put down where the mind says they are (fast time, a move by the Creator, a loaded world): no walking there.
  if name == "eden_snap_" .. who then
    local x, y, z = string.match(value, "^([^,]+),([^,]+),([^,]+)$")
    x, y, z = tonumber(x), tonumber(y), tonumber(z)
    if x and y and z then
      self.x, self.y, self.z = x, y + 0.3, z
      self.vx, self.vz = 0, 0
      target, waypoints, arrived = nil, nil, true
    end
    return
  end
  if name == "eden_die_" .. who then
    dead = true
    target, waypoints, arrived = nil, nil, true
    self.vx, self.vz = 0, 0
    self.animate = "Death"
    return
  end
  if dead then return end
  if name ~= "eden_target_" .. who then return end
  local t = parse_target(value)
  if not t then return end
  target = t
  waypoints = world.path(self.x, self.y, self.z, t.x, t.y, t.z)
  -- No route found (the path grid does not cover open terrain): walk straight at the target and let physics steer round what is in the way.
  if not waypoints or #waypoints == 0 then waypoints = { { x = t.x, y = t.y, z = t.z } } end
  -- A lake is in the way: round its bank first (the page worked out the point).
  if t.viaX and t.viaZ then waypoints = { { x = t.viaX, y = t.y, z = t.viaZ }, { x = t.x, y = t.y, z = t.z } } end
  wpIndex = 1
  arrived = false
end

local function play(action)
  if gesture_left > 0 then return end
  if playedAction ~= action then
    self.animate = action
    playedAction = action
  end
end

function on_tick(dt)
  if gesture_left > 0 then
    gesture_left = gesture_left - dt
    if gesture_left <= 0 then playedAction = nil end
  end
  if dead or not target then return end
  if arrived then
    self.vx, self.vz = 0, 0
    play(target.action)
    return
  end
  if not waypoints or #waypoints == 0 then
    -- Unreachable (world.path found nothing, or start == target): stand
    -- and play the action anyway rather than getting stuck on nothing.
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
    play((target.speed or WALK_SPEED) > 3 and "run" or (target.carrying and "carry_walk" or "walk"))
  end
end

-- Dressed from the kit's pieces (the build sets props.gear: clothes, hair and beard for this person).
function on_start()
  if props.gear and props.gear ~= "" and props.gear ~= "none" then world.wear(props.gear) end
end
