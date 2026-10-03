-- HIGH HEAT director: events (circuit and sprints), race positions and
-- catch-up, the police pursuit system (heat, bust, evade), the HUD text,
-- and the title and results screens. See docs/racing/GAME_DESIGN.md.
-- The placeholder line below is replaced by the level generator with the city
-- grid, event routes and spawn points.
{{CONFIG}}

local phase = "title"
local event_index = 1
local event
local racers = {} -- { id, name, lap, cp, finished, place }
local race_start = 0
local finish_order = 0
local countdown_until = 0
local last_shown = ""
local banner_until = 0
local hint_until = 0
local results_won = false
local escape_time = 0

-- Pursuit state.
local heat = 0
local pursuing = false
local units = {} -- { id, spawned }
local bust = 0
local evade = 0
local pursuit_since = 0
local next_route = 0
local next_spot = 0
local next_heat = 0
local patrol_routes = {}

local player

local function car_position(id)
  local x, y, z = world.position(id)
  return x, y, z
end

local function speed_of(id)
  local s = vehicle.state(id)
  return s or 0
end

local function dist(ax, az, bx, bz)
  return math.sqrt((ax - bx) ^ 2 + (az - bz) ^ 2)
end

local function banner(text, seconds)
  ui.set_text("Banner", text)
  ui.set_visible("Banner", true)
  banner_until = time.now + (seconds or 2.5)
end

local function hint(text, seconds)
  ui.set_text("Hint", text)
  ui.set_visible("Hint", true)
  hint_until = time.now + (seconds or 4)
end

local function snap(v)
  local i = math.floor(v / GRID + 0.5)
  if i > GRID_HALF then i = GRID_HALF elseif i < -GRID_HALF then i = -GRID_HALF end
  return i * GRID
end

local function yaw_toward(ax, az, bx, bz)
  return math.atan(bx - ax, bz - az)
end

-- Something solid (a building) between two points?
local function blocked(ax, az, bx, bz)
  local dx, dz = bx - ax, bz - az
  local length = math.sqrt(dx * dx + dz * dz)
  if length < 1 then return false end
  local hit, d = world.raycast(ax, 1.0, az, dx, 0, dz, length)
  return hit ~= nil and hit ~= "ground" and d < length - 6
end

-- ---------------------------------------------------------------- pursuit --
local function heat_text()
  if heat <= 0 then return "" end
  return "HEAT " .. string.rep("*", heat) .. string.rep("-", 5 - heat)
end

local function cooldown()
  return 7 + heat * 3
end

local function far_spawn(px, pz)
  -- An intersection 150-320 m away the player can't see.
  local best
  for _ = 1, 24 do
    local x = (math.random(0, GRID_HALF * 2) - GRID_HALF) * GRID
    local z = (math.random(0, GRID_HALF * 2) - GRID_HALF) * GRID
    local d = dist(x, z, px, pz)
    if d > 150 and d < 320 and blocked(x, z, px, pz) then return x, z end
    if d > 150 and not best then best = { x, z } end
  end
  if best then return best[1], best[2] end
  return snap(px + 200), snap(pz)
end

local function grid_route(cx, cz, px, pz)
  local ax, az = snap(cx), snap(cz)
  local bx, bz = snap(px), snap(pz)
  local on_avenue = math.abs(cx - ax) < math.abs(cz - az)
  local corner = on_avenue and { ax, bz } or { bx, az }
  local start = on_avenue and { ax, az } or { ax, az }
  return string.format("%d,%d %d,%d %d,%d %.1f,%.1f", start[1], start[2], corner[1], corner[2], bx, bz, px, pz)
end

local function add_unit(prefab)
  local px, _, pz = car_position(player)
  local x, z = far_spawn(px, pz)
  local id = world.spawn(prefab, x, 0.9, z)
  if not id then return end
  vehicle.reset(id, x, 0.9, z, yaw_toward(x, z, px, pz))
  vehicle.set_mode(id, "pursuit")
  vehicle.set_target(id, player)
  table.insert(units, { id = id, spawned = true })
end

local function unit_count()
  local n = 0
  for i = #units, 1, -1 do
    if world.alive(units[i].id) then n = n + 1 else table.remove(units, i) end
  end
  return n
end

local function reinforce()
  local wanted = math.min(6, heat + 1)
  local guard = 0
  while unit_count() < wanted and guard < 6 do
    add_unit(heat >= 3 and "Interceptor" or "Cruiser")
    guard = guard + 1
  end
end

local function start_pursuit(level, reason)
  local was = pursuing
  heat = math.max(heat, level)
  pursuing = true
  evade, bust = 0, 0
  if not was then
    pursuit_since = time.now
    next_heat = time.now + 45
    banner("PURSUIT", 2.5)
    if reason then hint(reason, 3) end
    sound.play("sfx:hit")
  end
  -- Patrols nearby join in.
  for _, name in ipairs(PATROLS) do
    local id = world.find(name)
    if id and world.alive(id) then
      local px, _, pz = car_position(player)
      local x, _, z = car_position(id)
      if dist(x, z, px, pz) < 260 then
        local known = false
        for _, u in ipairs(units) do if u.id == id then known = true end end
        if not known then
          vehicle.set_mode(id, "pursuit")
          vehicle.set_target(id, player)
          table.insert(units, { id = id, spawned = false })
        end
      end
    end
  end
  reinforce()
end

local function end_pursuit(message)
  pursuing = false
  heat = 0
  bust, evade = 0, 0
  for _, u in ipairs(units) do
    if world.alive(u.id) then
      if u.spawned then
        world.destroy(u.id)
      else
        vehicle.set_mode(u.id, "traffic")
        vehicle.set_target(u.id, nil)
        if patrol_routes[u.id] then vehicle.set_route(u.id, patrol_routes[u.id], true) end
      end
    end
  end
  units = {}
  ui.set_visible("PursuitBar", false)
  ui.set_text("Heat", "")
  if message then banner(message, 3) end
end

local function spot_check()
  if pursuing or phase == "title" or phase == "countdown" then return end
  if event and not event.police and (phase == "race") then return end
  local px, _, pz = car_position(player)
  local fast = speed_of(player) > 30.5
  for _, name in ipairs(PATROLS) do
    local id = world.find(name)
    if id and world.alive(id) then
      local x, _, z = car_position(id)
      local d = dist(x, z, px, pz)
      if d < 9 and speed_of(player) > 8 then
        start_pursuit(1, "You hit a police car")
        return
      end
      if fast and d < 45 and not blocked(x, z, px, pz) then
        start_pursuit(1, "Spotted speeding")
        return
      end
    end
  end
end

local function update_pursuit(dt)
  if not pursuing then return end
  local px, _, pz = car_position(player)
  local seen, close = false, false
  for _, u in ipairs(units) do
    if world.alive(u.id) then
      local x, _, z = car_position(u.id)
      local d = dist(x, z, px, pz)
      if d < 110 and not blocked(x, z, px, pz) then seen = true end
      if d < 9 then close = true end
      if time.now >= next_route and d > 60 then vehicle.set_route(u.id, grid_route(x, z, px, pz), false) end
    end
  end
  if time.now >= next_route then next_route = time.now + 1.5 end
  if unit_count() == 0 then seen = false end
  -- Bust: stopped and boxed in.
  if close and speed_of(player) < 3 then bust = bust + dt / 3 else bust = math.max(0, bust - dt / 2) end
  -- Evade: out of sight long enough.
  if seen then evade = 0 else evade = evade + dt end
  if bust > 0.02 then
    ui.set_text("PursuitLabel", "BUST")
    ui.set_value("PursuitBar", bust)
  else
    ui.set_text("PursuitLabel", seen and "PURSUIT" or "COOLDOWN")
    ui.set_value("PursuitBar", evade / cooldown())
  end
  ui.set_visible("PursuitBar", true)
  ui.set_text("Heat", heat_text())
  if seen and time.now >= next_heat and heat < 5 then
    heat = heat + 1
    next_heat = time.now + 45
    banner("HEAT LEVEL " .. heat, 2)
    reinforce()
  end
  if bust >= 1 then
    return "busted"
  elseif evade >= cooldown() then
    return "evaded"
  end
end

-- ------------------------------------------------------------------ races --
local function set_hud_visible(on)
  for _, name in ipairs({ "Pos", "Lap", "Time" }) do ui.set_visible(name, on) end
end

local function place_car(id, slot)
  vehicle.reset(id, slot[1], 0.9, slot[2], slot[3])
end

local function park_rivals()
  for i, name in ipairs(ALL_RIVALS) do
    local id = world.find(name)
    if id then
      local spot = PARKING[i]
      vehicle.set_mode(id, "off")
      vehicle.reset(id, spot[1], 0.9, spot[2], 0)
      vehicle.freeze(id, true)
    end
  end
end

local function show_marker()
  local e = EVENTS[event_index]
  if e then ui.marker("event", e.marker[1], 2, e.marker[2], e.name) end
end

local function enter_roam(message)
  phase = "roam"
  event = nil
  racers = {}
  set_hud_visible(false)
  ui.set_visible("Countdown", false)
  park_rivals()
  vehicle.freeze(player, false)
  show_marker()
  local e = EVENTS[event_index]
  ui.set_text("Objective", e and ("Drive to the marker: " .. e.name) or "Free roam")
  if message then banner(message, 3) end
end

local function start_event(index)
  event = EVENTS[index]
  phase = "countdown"
  ui.clear_marker("event")
  ui.set_visible("Hint", false)
  hint_until = 0
  if pursuing then end_pursuit() end
  racers = { { id = player, name = "You", lap = 1, cp = 1, finished = false } }
  place_car(player, event.grid[1])
  vehicle.freeze(player, true)
  for i, name in ipairs(event.rivals) do
    local id = world.find(name)
    if id then
      place_car(id, event.grid[i + 1])
      vehicle.set_route(id, event.route, event.laps > 1)
      vehicle.set_mode(id, "race")
      vehicle.set_speed_scale(id, 1)
      vehicle.set_nitro(id, 1)
      vehicle.freeze(id, true)
      table.insert(racers, { id = id, name = name, lap = 1, cp = 1, finished = false })
    end
  end
  vehicle.set_nitro(player, 1)
  finish_order = 0
  countdown_until = time.now + 3.2
  last_shown = ""
  ui.set_visible("Countdown", true)
  ui.set_text("Objective", event.name .. (event.laps > 1 and ("  -  " .. event.laps .. " laps") or "  -  sprint"))
  banner(string.upper(event.name), 3)
  set_hud_visible(true)
  ui.marker("cp", event.checkpoints[1][1], 2, event.checkpoints[1][2], "")
end

local function progress(r)
  local cps = event.checkpoints
  local nx, nz = cps[math.min(r.cp, #cps)][1], cps[math.min(r.cp, #cps)][2]
  local x, _, z = car_position(r.id)
  return (r.lap - 1) * #cps * 1000 + r.cp * 1000 - dist(x, z, nx, nz)
end

local function ordinal(n)
  return n .. (n == 1 and "st" or n == 2 and "nd" or n == 3 and "rd" or "th")
end

local function clock(t)
  return string.format("%d:%05.2f", math.floor(t / 60), t % 60)
end

local function show_results(won, title, text)
  phase = "results"
  set_hud_visible(false)
  ui.clear_marker("cp")
  for _, r in ipairs(racers) do if r.id ~= player then vehicle.set_mode(r.id, "off") end end
  ui.set_text("ResultTitle", title)
  ui.set_text("ResultText", text)
  ui.set_text("Continue", won and "CONTINUE" or "RETRY")
  for _, n in ipairs({ "ResultPanel", "ResultTitle", "ResultText", "Continue" }) do ui.set_visible(n, true) end
  input.lock_mouse(false)
  results_won = won
end

local function finish_event(place, elapsed)
  local won = place == 1
  if won and event.escape and pursuing then
    phase = "escape"
    set_hud_visible(false)
    ui.clear_marker("cp")
    ui.set_text("Objective", "You won the race. Now lose the cops!")
    banner("LOSE THE COPS", 3)
    escape_time = elapsed
    return
  end
  if won then
    local key = "best_" .. event_index
    local best = tonumber(save.get(key) or "")
    if not best or elapsed < best then save.set(key, string.format("%.2f", elapsed)) end
  end
  show_results(won, won and "1ST PLACE" or (string.upper(ordinal(place)) .. " PLACE"),
    "Time " .. clock(elapsed) .. (won and "" or "   -   win to move on"))
end

local function update_race(dt)
  local cps = event.checkpoints
  for _, r in ipairs(racers) do
    if not r.finished and world.alive(r.id) then
      local x, _, z = car_position(r.id)
      local c = cps[r.cp]
      if dist(x, z, c[1], c[2]) < CHECKPOINT_RADIUS then
        r.cp = r.cp + 1
        if r.cp > #cps then
          if r.lap < event.laps then
            r.lap = r.lap + 1
            r.cp = 1
            if r.id == player then banner(r.lap == event.laps and "FINAL LAP" or ("LAP " .. r.lap), 2) end
          else
            r.finished = true
            finish_order = finish_order + 1
            r.place = finish_order
          end
        end
        if r.id == player and not r.finished then
          local n = cps[r.cp]
          ui.marker("cp", n[1], 2, n[2], "")
          if event.pursuit_at and r.cp == event.pursuit_at and r.lap == event.laps then
            start_pursuit(event.pursuit_heat or 3, "The police were waiting for you")
          end
        end
      end
    end
  end
  -- Positions and subtle catch-up.
  local me
  for _, r in ipairs(racers) do r.score = r.finished and (1e9 - r.place) or progress(r) end
  table.sort(racers, function(a, b) return a.score > b.score end)
  for i, r in ipairs(racers) do
    if r.id == player then me = i end
  end
  local player_score
  for _, r in ipairs(racers) do if r.id == player then player_score = r.score end end
  for _, r in ipairs(racers) do
    if r.id ~= player and not r.finished then
      local gap = r.score - player_score
      local scale = gap > 2500 and 0.94 or (gap < -2500 and 1.06 or 1.0)
      vehicle.set_speed_scale(r.id, scale)
    end
  end
  local elapsed = time.now - race_start
  ui.set_text("Pos", "POS " .. me .. "/" .. #racers)
  local mine
  for _, r in ipairs(racers) do if r.id == player then mine = r end end
  ui.set_text("Lap", event.laps > 1 and ("LAP " .. math.min(mine.lap, event.laps) .. "/" .. event.laps) or ("CHECKPOINT " .. math.min(mine.cp, #cps) .. "/" .. #cps))
  ui.set_text("Time", clock(elapsed))
  if mine.finished then finish_event(mine.place, elapsed) end
end

local function reset_player()
  if phase == "race" and event then
    local mine
    for _, r in ipairs(racers) do if r.id == player then mine = r end end
    local cps = event.checkpoints
    local prev = cps[math.max(1, mine.cp - 1)]
    local next_cp = cps[math.min(mine.cp, #cps)]
    if mine.cp == 1 then prev = event.grid[1] end
    vehicle.reset(player, prev[1], 0.9, prev[2], yaw_toward(prev[1], prev[2], next_cp[1], next_cp[2]))
  else
    local x, _, z = car_position(player)
    local sx, sz = snap(x), snap(z)
    vehicle.reset(player, sx, 0.9, sz, 0)
  end
end

-- --------------------------------------------------------------- callbacks --
function on_start()
  player = world.find("Player")
  for _, name in ipairs(PATROLS) do
    local id = world.find(name)
    if id then patrol_routes[id] = PATROL_ROUTES[name] end
  end
  -- The title is itself a pause, so the pause menu stays hidden until DRIVE.
  for _, n in ipairs({ "ResultPanel", "ResultTitle", "ResultText", "Continue", "Banner", "Countdown", "PursuitBar", "Hint", "Pos", "Lap", "Time", "PausePanel", "Resume", "Restart" }) do
    ui.set_visible(n, false)
  end
  ui.set_text("Heat", "")
  ui.set_text("Objective", "")
  local bests = {}
  for i, e in ipairs(EVENTS) do
    local b = tonumber(save.get("best_" .. i) or "")
    if b then table.insert(bests, e.name .. " " .. clock(b)) end
  end
  ui.set_text("TitleBest", #bests > 0 and table.concat(bests, "   ") or "")
  park_rivals()
  vehicle.freeze(player, true)
  game.pause()
end

function on_ui(name)
  if name == "Start" and phase == "title" then
    for _, n in ipairs({ "TitlePanel", "Title", "TitleSub", "Start", "Controls", "Controls2", "TitleBest" }) do ui.set_visible(n, false) end
    for _, n in ipairs({ "PausePanel", "Resume", "Restart" }) do ui.set_visible(n, true) end
    game.resume()
    input.lock_mouse(true)
    enter_roam("WELCOME TO BAYVIEW")
    hint("Follow the marker on the minimap to your first race", 5)
  elseif name == "Continue" and phase == "results" then
    for _, n in ipairs({ "ResultPanel", "ResultTitle", "ResultText", "Continue" }) do ui.set_visible(n, false) end
    if results_won then
      event_index = event_index + 1
      if event_index > #EVENTS then
        phase = "complete"
        ui.set_text("Objective", "You are the most wanted. Free roam.")
        banner("BAYVIEW IS YOURS", 4)
        event_index = #EVENTS + 1
        phase = "roam"
        set_hud_visible(false)
        park_rivals()
        vehicle.freeze(player, false)
        return
      end
      enter_roam("NEXT: " .. string.upper(EVENTS[event_index].name))
    else
      start_event(event_index)
    end
  end
end

local spot_timer = 0
function on_tick(dt)
  if banner_until > 0 and time.now > banner_until then ui.set_visible("Banner", false) banner_until = 0 end
  if hint_until > 0 and time.now > hint_until then ui.set_visible("Hint", false) hint_until = 0 end
  if phase == "title" or not player then return end
  if input.pressed("p") then game.pause() end
  if input.pressed("r") and phase ~= "countdown" and phase ~= "results" then reset_player() end
  spot_timer = spot_timer + dt
  if spot_timer > 0.25 then spot_timer = 0 spot_check() end
  local outcome = update_pursuit(dt)
  if outcome == "busted" then
    end_pursuit()
    if phase == "race" or phase == "escape" or phase == "countdown" then
      show_results(false, "BUSTED", "The police caught you.")
    else
      banner("BUSTED", 3)
      reset_player()
    end
    return
  elseif outcome == "evaded" then
    end_pursuit("EVADED")
    if phase == "escape" then
      local key = "best_" .. event_index
      local best = tonumber(save.get(key) or "")
      if not best or escape_time < best then save.set(key, string.format("%.2f", escape_time)) end
      show_results(true, "1ST PLACE - EVADED", "Time " .. clock(escape_time) .. "   -   you lost the police")
    end
  end
  if phase == "roam" then
    local e = EVENTS[event_index]
    if e and not pursuing then
      local x, _, z = car_position(player)
      if dist(x, z, e.marker[1], e.marker[2]) < 18 then start_event(event_index) end
    end
  elseif phase == "countdown" then
    local left = countdown_until - time.now
    local text = left > 2.2 and "3" or left > 1.2 and "2" or left > 0.2 and "1" or "GO!"
    if text ~= last_shown then
      last_shown = text
      ui.set_text("Countdown", text)
      sound.play(text == "GO!" and "sfx:hit:kill" or "sfx:hit")
    end
    if left <= 0.2 then
      phase = "race"
      race_start = time.now
      for _, r in ipairs(racers) do vehicle.freeze(r.id, false) end
    end
  elseif phase == "race" then
    if time.now - race_start > 1 then ui.set_visible("Countdown", false) end
    update_race(dt)
  end
end
