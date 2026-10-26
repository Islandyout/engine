-- Eden Phase 1a: driven entirely by edenAgents.ts (TS), which polls
-- eden_entity_state/eden_exchanges/eden_conversations and broadcasts a new
-- target via editor_ui_event("eden_target_adam", "x,y,z,action") whenever
-- the brain (eden-tick, Supabase) decides something new. This script only
-- ever walks toward the last target it was given and plays that action's
-- clip on arrival -- it has no say in WHAT Adam does, only HOW he gets
-- there. The sandboxed Lua VM has no network access at all by design (see
-- source/engine/script/script.cpp's open_sandboxed_libs), so the decision
-- itself can only ever be made outside it.

-- "Man (casual)" (catalog id 249) carries its own clips (idle/talk/run/
-- walk/Wave/Death/HitRecieve) -- already a clothed, fully-animated model,
-- so there's no outfit to dress (unlike the clip-less UBC base bodies).

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
  return { x = tonumber(parts[1]), y = tonumber(parts[2]), z = tonumber(parts[3]), action = parts[4] }
end

function on_ui(name, value)
  if name ~= "eden_target_adam" then return end
  local t = parse_target(value)
  if not t then return end
  target = t
  waypoints = world.path(self.x, self.y, self.z, t.x, t.y, t.z)
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
    self.vx = (dx / dist) * WALK_SPEED
    self.vz = (dz / dist) * WALK_SPEED
    play("walk")
  end
end
