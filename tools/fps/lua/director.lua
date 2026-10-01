-- LAST SIGNAL director: mission state machine, pacing (intensity), spawning,
-- HUD text, waypoints, stats and the title/pause/end screens.
-- The placeholder line below is replaced by the level generator with positions and tuning.
{{CONFIG}}

local phase = "title"
local difficulty = 2
local names = { "RECRUIT", "VETERAN", "ELITE" }
local damage_scale = { 0.6, 1.0, 1.35 }
local squad_bonus = { -1, 0, 1 }
local med_chance = { 0.5, 0.33, 0.2 }

local started_at = 0
local kills, headshots, damage_taken = 0, 0, 0
local intensity = 0
local generators_left = 3
local upload = 0
local next_wave = 0
local wave_count = 0
local valley_until = 0
local spawned = {}
local feed = {}
local banner_until = 0
local launcher_dropped = false

local function player() return world.find("Player") end

local function generators_alive(except)
  local n = 0
  for _, g in ipairs(GENERATORS) do
    local id = g ~= except and world.find(g)
    if id and world.alive(id) then n = n + 1 end
  end
  return n
end

local function dist2(ax, az, bx, bz) local dx, dz = ax - bx, az - bz return dx * dx + dz * dz end

local function player_pos()
  local p = player()
  if not p or not world.alive(p) then return nil end
  return world.position(p)
end

local function banner(text, seconds)
  ui.set_text("Banner", text)
  ui.set_visible("Banner", true)
  banner_until = time.now + (seconds or 3)
end

local function objective(text) ui.set_text("Objective", text) end

local function push_feed(line)
  table.insert(feed, 1, line)
  while #feed > 3 do table.remove(feed) end
  for i = 1, 3 do ui.set_text("Feed" .. i, feed[i] or "") end
end

local function alive_enemies()
  local n = 0
  for i = #spawned, 1, -1 do
    if world.alive(spawned[i]) then n = n + 1 else table.remove(spawned, i) end
  end
  return n + STARTING_ALIVE_BONUS
end

-- A spawn point the player can't currently see from close by.
local function pick_spawn(points)
  local px, py, pz = player_pos()
  local best, best_d = nil, -1
  for _, s in ipairs(points) do
    local d = px and dist2(px, pz, s[1], s[3]) or 1e9
    local visible = false
    if px and d < 25 * 25 then
      local dx, dy, dz = s[1] - px, s[2] + 1 - (py + 0.7), s[3] - pz
      local length = math.sqrt(dx * dx + dy * dy + dz * dz)
      local hit, hd = world.raycast(px, py + 0.7, pz, dx, dy, dz, length)
      visible = not hit or hd >= length - 0.5
    end
    if not visible and d > best_d then best, best_d = s, d end
  end
  return best or points[1]
end

local function spawn_squad(kinds, points)
  if alive_enemies() >= MAX_ALIVE then return 0 end
  local count = 0
  for i, kind in ipairs(kinds) do
    if alive_enemies() >= MAX_ALIVE then break end
    local s = pick_spawn(points)
    local id = world.spawn(kind, s[1] + (i - 1) * 1.2, s[2], s[3] + (i % 2) * 1.2)
    if id then table.insert(spawned, id) count = count + 1 end
  end
  return count
end

local function squad(base)
  local kinds = {}
  for _, k in ipairs(base) do table.insert(kinds, k) end
  local bonus = squad_bonus[difficulty]
  if bonus < 0 and #kinds > 1 then table.remove(kinds) end
  if bonus > 0 then table.insert(kinds, "Rifleman") end
  return kinds
end

local function clock()
  local t = math.max(0, time.now - started_at)
  return string.format("%02d:%02d", math.floor(t / 60), math.floor(t % 60))
end

local function update_stats()
  ui.set_text("Stats", "KILLS " .. kills .. "   " .. clock() .. "   " .. names[difficulty])
end

local function set_phase(next_phase)
  phase = next_phase
  if phase == "approach" then
    objective("Reach the outpost")
    ui.marker("goal", GATE[1], GATE[2] + 1.5, GATE[3], "Outpost")
    banner("INSERTION", 3)
  elseif phase == "sabotage" then
    ui.clear_marker("goal")
    generators_left = generators_alive()
    objective("Destroy the generators  " .. (#GENERATORS - generators_left) .. "/" .. #GENERATORS)
    for _, g in ipairs(GENERATORS) do
      local id = world.find(g)
      if id then
        local x, y, z = world.position(id)
        ui.marker(g, x, y + 1.6, z)
      end
    end
    banner("DESTROY THE GENERATORS", 3)
    sound.play("sfx:hit:kill")
  elseif phase == "uplink" then
    objective("Upload the signal: hold the uplink")
    ui.marker("goal", UPLINK[1], UPLINK[2] + 2.5, UPLINK[3], "Uplink")
    ui.set_visible("Upload", true)
    ui.set_value("Upload", 0)
    banner("HOLD THE UPLINK", 3)
    next_wave = time.now + 6
  elseif phase == "extract" then
    ui.set_visible("Upload", false)
    objective("Get to the extraction zone")
    ui.marker("goal", LZ[1], LZ[2] + 1, LZ[3], "Extraction")
    local gate = world.find("North Gate")
    if gate then world.destroy(gate) end
    banner("UPLOAD COMPLETE - EXTRACT", 4)
    sound.play("sfx:explosion")
    spawn_squad(squad({ "Rusher", "Rusher", "Rifleman" }), LZ_SPAWNS)
    next_wave = time.now + 14
  end
end

local function finish(won)
  if phase == "won" or phase == "failed" then return end
  phase = won and "won" or "failed"
  ui.clear_marker("goal")
  for _, g in ipairs(GENERATORS) do ui.clear_marker(g) end
  ui.set_visible("Upload", false)
  ui.set_visible("Banner", false)
  input.lock_mouse(false)
  local t = math.max(0, time.now - started_at)
  local lines = "Time " .. clock() .. "   Kills " .. kills .. "   Headshots " .. headshots ..
    "   Damage taken " .. math.floor(damage_taken)
  local best_line = names[difficulty]
  if won then
    local key = "best_" .. difficulty
    local best = tonumber(save.get(key) or "")
    if not best or t < best then
      save.set(key, string.format("%.1f", t))
      best_line = "New best time on " .. names[difficulty] .. "!"
    else
      best_line = string.format("Best on %s: %02d:%02d", names[difficulty], math.floor(best / 60), math.floor(best % 60))
    end
  end
  ui.set_text("EndTitle", won and "MISSION COMPLETE" or "MISSION FAILED")
  ui.set_text("EndStats", lines)
  ui.set_text("EndBest", best_line)
  for _, name in ipairs({ "EndPanel", "EndTitle", "EndStats", "EndBest", "Restart" }) do ui.set_visible(name, true) end
  objective(won and "Extraction successful" or "Signal lost")
end

local function best_text()
  local parts = {}
  for i = 1, 3 do
    local b = tonumber(save.get("best_" .. i) or "")
    if b then table.insert(parts, string.format("%s %02d:%02d", names[i], math.floor(b / 60), math.floor(b % 60))) end
  end
  return #parts > 0 and ("Best times: " .. table.concat(parts, "   ")) or "No completed runs yet"
end

function on_start()
  -- The title screen is itself a pause, so the pause menu stays hidden until Deploy.
  for _, name in ipairs({ "EndPanel", "EndTitle", "EndStats", "EndBest", "Restart", "Upload", "Banner", "PausePanel", "PauseText", "Resume", "PauseRestart" }) do
    ui.set_visible(name, false)
  end
  ui.set_text("TitleBest", best_text())
  ui.set_value("Difficulty", 0.5)
  ui.set_text("DifficultyLabel", "Difficulty: " .. names[difficulty])
  objective("")
  game.pause()
end

function on_ui(name, value)
  if name == "Difficulty" and phase == "title" then
    difficulty = math.floor(value * 2 + 0.5) + 1
    ui.set_text("DifficultyLabel", "Difficulty: " .. names[difficulty])
  elseif name == "Deploy" and phase == "title" then
    for _, n in ipairs({ "TitlePanel", "TitleText", "TitleBest", "Briefing", "Briefing2", "Difficulty", "DifficultyLabel", "Deploy", "Controls", "Controls2" }) do
      ui.set_visible(n, false)
    end
    local p = player()
    if p then world.send(p, "difficulty", damage_scale[difficulty]) end
    for _, n in ipairs({ "PausePanel", "PauseText", "Resume", "PauseRestart" }) do ui.set_visible(n, true) end
    started_at = time.now
    set_phase("approach")
    game.resume()
    input.lock_mouse(true)
  end
end

function on_message(name, value, sender)
  if name == "died" then
    kills = kills + 1
    push_feed(value .. " down")
    intensity = math.max(0, intensity - 0.1)
    update_stats()
  elseif name == "drop" then
    local x, y, z = value:match("([^,]+),([^,]+),([^,]+)")
    x, y, z = tonumber(x), tonumber(y), tonumber(z)
    if x then
      world.spawn("Ammo Crate", x, y, z)
      local heavy = sender and world.name(sender) == "Heavy"
      if heavy or math.random() < med_chance[difficulty] then world.spawn("Med Kit", x + 0.7, y, z + 0.4) end
      if heavy and not launcher_dropped then
        launcher_dropped = true
        world.spawn("Launcher Rounds", x - 0.7, y, z - 0.4)
      end
    end
  elseif name == "headshot" then
    headshots = headshots + 1
  elseif name == "hurt" then
    local amount = tonumber(value) or 0
    damage_taken = damage_taken + amount
    intensity = math.min(1.5, intensity + amount / 100)
  elseif name == "generator" then
    generators_left = generators_alive(value)
    ui.clear_marker(value)
    push_feed(value .. " destroyed")
    local done = #GENERATORS - generators_left
    objective("Destroy the generators  " .. done .. "/" .. #GENERATORS)
    if generators_left <= 0 then
      set_phase("uplink")
    else
      banner(done .. "/" .. #GENERATORS .. " GENERATORS DOWN", 2.5)
      local base = generators_left == 1 and { "Rifleman", "Heavy", "Rusher" } or { "Rifleman", "Rusher" }
      -- The director holds reinforcements back while the player is nearly dead.
      after(intensity > 0.8 and 8 or 3, function() spawn_squad(squad(base), YARD_SPAWNS) end)
    end
  elseif name == "pickup" then
    push_feed(value)
  end
end

function on_tick(dt)
  intensity = math.max(0, intensity - 0.15 * dt)
  if banner_until > 0 and time.now > banner_until then
    ui.set_visible("Banner", false)
    banner_until = 0
  end
  if phase == "title" or phase == "won" or phase == "failed" then return end
  if input.pressed("p") then game.pause() end
  update_stats()
  local px, py, pz = player_pos()
  if not px then
    finish(false)
    return
  end
  if phase == "approach" then
    if px > COMPOUND[1] and px < COMPOUND[3] and pz > COMPOUND[2] and pz < COMPOUND[4] then set_phase("sabotage") end
  elseif phase == "uplink" then
    local inside = dist2(px, pz, UPLINK[1], UPLINK[3]) < UPLINK_RADIUS * UPLINK_RADIUS
    if inside then
      local before = upload
      upload = math.min(100, upload + dt * 100 / UPLINK_SECONDS)
      ui.set_value("Upload", upload / 100)
      objective(string.format("Uploading signal  %d%%", math.floor(upload)))
      -- A breather after every quarter.
      if math.floor(before / 25) < math.floor(upload / 25) and upload < 100 then
        valley_until = time.now + 6
        banner(math.floor(upload / 25) * 25 .. "% UPLOADED", 2)
      end
    else
      objective(string.format("Upload paused at %d%% - return to the uplink", math.floor(upload)))
    end
    if upload >= 100 then
      set_phase("extract")
    elseif time.now >= next_wave and time.now >= valley_until then
      if intensity > 0.8 and time.now < next_wave + 8 then return end
      wave_count = wave_count + 1
      local base = wave_count % 3 == 0 and { "Heavy", "Rusher", "Rifleman" } or { "Rusher", "Rifleman", "Rifleman" }
      spawn_squad(squad(base), UPLINK_SPAWNS)
      next_wave = time.now + (intensity < 0.3 and 14 or 18)
    end
  elseif phase == "extract" then
    if dist2(px, pz, LZ[1], LZ[3]) < LZ_RADIUS * LZ_RADIUS then
      finish(true)
    elseif time.now >= next_wave then
      spawn_squad(squad({ "Rusher", "Rifleman" }), LZ_SPAWNS)
      next_wave = time.now + 16
    end
  end
end
