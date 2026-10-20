-- Conversation plumbing shared by the scripts that talk to the Player (the scene builder places it in front of them):
-- the Dialogue widget shows what is said and numbered choices; keys 1 to 3 pick one. While a conversation is open the
-- Player script sets its mana aside (the number keys are skill keys too).
TALK_RANGE = 3.6
talking = nil            -- the name of whoever is being talked to
local talk_player

function player_id() talk_player = talk_player or world.find("Player") return talk_player end

-- A tap counts once even when a slow frame runs several ticks.
local last_tap, tap_clock = {}, 0
function tap_tick(dt) tap_clock = tap_clock + dt end
function tapped(action)
  if input.action_pressed(action) and tap_clock - (last_tap[action] or -1) > 0.3 then
    last_tap[action] = tap_clock
    return true
  end
  return false
end

function say(speaker, line, choices)
  local text = speaker .. ": " .. line
  for _, c in ipairs(choices or {}) do text = text .. "\n> " .. c end
  ui.set_text("Dialogue", text)
end

function end_talk()
  if talking then
    talking = nil
    ui.set_text("Dialogue", "")
    local p = player_id()
    if p then world.send(p, "talk", 0) end
  end
end

function start_talk(name)
  talking = name
  local p = player_id()
  if p then world.send(p, "talk", 1) end
end

-- The distance from the Player to a named entity, or nil.
function distance_to(name)
  local p, id = player_id(), world.find(name)
  if not p or not id then return nil end
  local px, _, pz = world.position(p)
  local x, _, z = world.position(id)
  return math.sqrt((px - x) ^ 2 + (pz - z) ^ 2)
end

-- The nearest of these names within talking range, or nil.
function nearest_within(names, range)
  local best, best_d = nil, (range or TALK_RANGE)
  for _, name in ipairs(names) do
    local d = distance_to(name)
    if d and d < best_d then best, best_d = name, d end
  end
  return best
end

-- Walking away ends a conversation; E ends it too. Returns the key (1 to 3) the Player picked, if any.
function talk_poll()
  if not talking then return nil end
  local d = distance_to(talking)
  if not d or d > TALK_RANGE + 2.5 then end_talk() return nil end
  if tapped("interact") then end_talk() return nil end
  for n, key in ipairs({ "1", "2", "3" }) do
    if input.pressed(key) and tap_clock - (last_tap.pick or -1) > 0.3 then
      last_tap.pick = tap_clock
      return n
    end
  end
  return nil
end
