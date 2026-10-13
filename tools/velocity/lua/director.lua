-- VELOCITY's director (tools/velocity/build_velocity.ts): the campaign and
-- the street incidents in Meridian Ward (GAME_DESIGN.md 7 and 8).
--
-- An activity (a story mission or an incident) is a list of steps. Each
-- step has an objective (the tracker), an optional hint and marker,
-- `enter` (spawns what the step needs) and `done` (checked every tick).
-- Finishing the last step grants the reward once and saves. Knocked out
-- (below 12% health), Velocity is healed and put back at the step's
-- checkpoint, and the step starts over: what it spawned is removed and
-- spawned again, so nothing is left half-beaten.
--
-- Free roam: the next story mission waits at its start marker (walk in and
-- press G); incidents show on the map and start the same way. A finished
-- incident rests a minute before it can be replayed. Incidents never gate
-- the story.
--
-- Mastery (GAME_DESIGN.md 9): each of Missions 1-3 opens a tier of two
-- sidegrades, picked (and changed for free) at Ward Dispatch. After the
-- finale, Dispatch also switches Heroic on and off (enemies hit harder and
-- last longer).
--
-- The save (save key "velocity.save"): "1|m0,m1|merit|swift,steady" -- the
-- format version, the missions done, the merit earned and the picks
-- (mastery and "heroic"). Anything else reads as a new game.
-- @prop fast false
--
-- props.fast (tests): enemies spawn nearly beaten, the rig waits for
-- Velocity, and timed incidents allow ten times as long.

local MAP = [[__MAP__]]
local START = { x = 0, y = 0.9, z = -96 }
local CONTACT = { x = 5, z = -90 }
local BARRIER_Z = -36
local INCIDENT = { x = 0, z = -4 }
local CIVILIAN = { x = -4, z = -9 } -- Mission 0's civilian, by the crossing
local SAVE_KEY = "velocity.save"
local KO = 0.12 -- knocked out below this fraction of health
local USE_R = 3.2 -- close enough to use (G)
local START_R = 6 -- close enough to start an activity
local REST = 60 -- seconds an incident rests after it's done

local hero
local progress = {} -- progress.m0 = true once Mission 0 is done
local merit = 0
local act -- the running activity: { kind, id, def, step, actors }
local checkpoint = START
local prompt_text, hint_text = "", ""
local clock = 0
local rested = {} -- incident id -> clock time it can run again
local picks = {} -- picks.swift = true ...; picks.heroic = true for Heroic
local menu_open = false
local fights = 0 -- enemies spawned by the running activity

-- Mastery: tier -> its two choices (id, name, what it does). A tier opens
-- with the mission that grants it.
local TIERS = {
  { opens = "m1", { "swift", "Swift", "attacks and dodges 10% quicker" }, { "heavy", "Heavy Hands", "+15% damage" } },
  { opens = "m2", { "steady", "Steady", "+25% max health" }, { "edge", "Edge", "12% critical hits" } },
  { opens = "m3", { "battery", "Battery", "start each fight with half an energy bar" }, { "wind", "Second Wind", "recover 25% health when a fight ends" } },
}

-- -- Save ----------------------------------------------------------------------
local function load_save()
  local text = save.get(SAVE_KEY)
  if not text then return end
  local version, done, m, p = text:match("^(%d+)|([%w_,]*)|?(%d*)|?([%w_,]*)$")
  if version ~= "1" then return end
  for id in done:gmatch("[%w_]+") do progress[id] = true end
  merit = tonumber(m) or 0
  for id in p:gmatch("[%w_]+") do picks[id] = true end
end

local function write_save()
  local done = {}
  for id in pairs(progress) do done[#done + 1] = id end
  table.sort(done)
  local chosen = {}
  for id in pairs(picks) do chosen[#chosen + 1] = id end
  table.sort(chosen)
  save.set(SAVE_KEY, "1|" .. table.concat(done, ",") .. "|" .. merit .. "|" .. table.concat(chosen, ","))
end

-- -- Helpers ---------------------------------------------------------------------
local function hero_at()
  local x, y, z = world.position(hero)
  return x or START.x, y or START.y, z or START.z
end

local function near(x, z, r)
  local hx, _, hz = hero_at()
  return (hx - x) ^ 2 + (hz - z) ^ 2 <= r * r
end

local function defeated(id)
  if not id or not world.alive(id) then return true end
  local hp = world.health(id)
  return not hp or hp <= 0
end

local function all_defeated(list)
  for _, id in ipairs(list) do
    if not defeated(id) then return false end
  end
  return true
end

local function left(list)
  local n = 0
  for _, id in ipairs(list) do
    if not defeated(id) then n = n + 1 end
  end
  return n
end

local function interact()
  return input.action_pressed("interact") or input.pressed("KeyG")
end

-- Text that only changes when it changes (no per-tick rebuilding).
local function set_prompt(text)
  if text ~= prompt_text then
    prompt_text = text
    ui.set_text("Prompt", text)
  end
end

local function set_hint(text)
  if text ~= hint_text then
    hint_text = text
    ui.set_text("Hint", text)
  end
end

local function spawn(prefab, x, z, y)
  local id = world.spawn(prefab, x, y or 0.9, z)
  if id and act then act.actors[#act.actors + 1] = id end
  return id
end

-- Enemies: Heroic's numbers, and nearly beaten under props.fast. A spawn
-- lands at the end of the tick, so both wait a moment.
local function enemy(prefab, x, z)
  local id = spawn(prefab, x, z)
  if not id then return nil end
  fights = fights + 1
  if fights == 1 and picks.battery then world.send(hero, "energy", 50) end
  if picks.heroic or props.fast then
    after(0.1, function()
      if not world.alive(id) then return end
      if picks.heroic then world.send(id, "tune", "1.3,1.3") end
      local hp = world.health(id)
      if props.fast and hp and hp > 3 then world.damage(id, hp - 3) end
    end)
  end
  return id
end

local function clear_actors()
  if not act then return end
  for _, id in ipairs(act.actors) do
    if world.alive(id) then world.destroy(id) end
  end
  act.actors = {}
end

local function marker(x, z, label)
  if x then
    ui.marker("objective", x, 1.5, z, label)
    hud.map_marker("objective", "target", x, z, "#ffcf7a", label)
  else
    ui.clear_marker("objective")
    hud.clear_map_marker("objective")
  end
end

-- A step that uses something at (x, z): the prompt near it, done on G.
local function use_tick(s, x, z, text)
  local close = x and near(x, z, USE_R)
  set_prompt(close and ("G  " .. text) or "")
  if close and interact() then s.used = true end
end

-- A step that fights `list`: the tracker counts down.
local function fight_objective(text, list)
  return string.format("%s (%d left)", text, left(list))
end

-- -- The rig: an AI van on a route, kept just ahead of Velocity -------------------
local function rig_pace(id, keep)
  if not id or not world.alive(id) then return 999 end
  local x, _, z = world.position(id)
  local hx, _, hz = hero_at()
  local d = math.sqrt((hx - x) ^ 2 + (hz - z) ^ 2)
  -- Never out of reach: slows when Velocity falls behind, so a missed
  -- interception is a catch-up, not a restart.
  local scale = d > keep * 2 and 0.35 or d > keep and 0.7 or 1
  -- props.fast (the tests, which walk): it waits for Velocity, crawling
  -- while Velocity is more than 12 m off.
  if props.fast then scale = d > 12 and 0.05 or 0.4 end
  vehicle.set_speed_scale(id, scale)
  return d
end

local function start_rig(s, x, z, route)
  s.rig = spawn("Runaway Rig", x, z, 1.5)
  local id = s.rig
  -- It exists from the end of this tick.
  if id then
    after(0.1, function()
      if not world.alive(id) then return end
      vehicle.set_route(id, route, false)
      vehicle.set_mode(id, "race")
    end)
  end
end

-- -- Story missions (GAME_DESIGN.md 7) ---------------------------------------------
local MISSIONS = {}

-- Mission 0: First Response (the tutorial). Starts by itself on a new game.
MISSIONS.m0 = {
  title = "FIRST RESPONSE",
  reward = "Kinetic Burst unlocked: U (costs energy, built by landing hits)",
  unlock = "energy_blast",
  merit = 0,
  steps = {
    {
      objective = "Sprint to Market Row",
      hint = "Hold Shift to sprint (it works in every direction)",
      marker = { INCIDENT.x, INCIDENT.z, "Market Row" },
      checkpoint = START,
      tick = function()
        local _, _, z = hero_at()
        if z < BARRIER_Z and z > BARRIER_Z - 16 then
          set_hint("Space to jump the barrier, or take the sidewalk")
        elseif z >= BARRIER_Z then
          set_hint("Hold Shift to sprint")
        end
      end,
      done = function() return near(INCIDENT.x, INCIDENT.z, 20) end,
    },
    {
      objective = "Stop the Street Enforcer",
      hint = "LMB/J light combo · RMB/K heavy · X dodge · R block (tap to parry)",
      checkpoint = { x = 0, y = 0.9, z = -26 },
      enter = function(s)
        s.enemy = enemy("Street Enforcer", INCIDENT.x + 3, INCIDENT.z + 7)
        s.civilian = spawn("Civilian", CIVILIAN.x, CIVILIAN.z)
        audio.music("tension")
      end,
      done = function(s) return defeated(s.enemy) end,
    },
    {
      objective = "Help the civilian",
      checkpoint = { x = 0, y = 0.9, z = -26 },
      enter = function(s, prev)
        -- The civilian from the fight carries over (spawned again after a knockout).
        s.civilian = prev and prev.civilian
        if not (s.civilian and world.alive(s.civilian)) then s.civilian = spawn("Civilian", CIVILIAN.x, CIVILIAN.z) end
        s.marker = { CIVILIAN.x, CIVILIAN.z, "Civilian" }
        audio.music("explore")
      end,
      tick = function(s)
        local x, _, z = world.position(s.civilian)
        use_tick(s, x, z, "Help the civilian")
      end,
      done = function(s) return s.used end,
    },
  },
}

-- Mission 1: Streetlight. A robbery on Market Row: two enforcers, then a
-- Shield Heavy; then the device they dropped.
local M1 = { x = 32, z = 2 }
MISSIONS.m1 = {
  title = "STREETLIGHT",
  start = { M1.x, M1.z - 10, "Streetlight" },
  reward = "Kinetic Lunge unlocked (forward + U). Mastery opens at Ward Dispatch",
  unlock = "flying_strike",
  merit = 2,
  steps = {
    {
      objective = "Stop the robbery",
      hint = "Tab locks on (Tab again to switch) · R blocks; tap it as a blow lands to parry",
      checkpoint = { x = M1.x, y = 0.9, z = M1.z - 14 },
      enter = function(s)
        s.enemies = { enemy("Street Enforcer", M1.x - 3, M1.z + 4), enemy("Street Enforcer", M1.x + 3, M1.z + 5) }
        audio.music("tension")
      end,
      tick = function(s) ui.set_text("Objective", fight_objective("Stop the robbery", s.enemies)) end,
      done = function(s) return all_defeated(s.enemies) end,
    },
    {
      objective = "Beat the Shield Heavy",
      hint = "It guards its front: circle it, kick or heavy it. Dodge the red slam (X)",
      checkpoint = { x = M1.x, y = 0.9, z = M1.z - 14 },
      enter = function(s)
        s.heavy = enemy("Shield Heavy", M1.x, M1.z + 8)
        hud.boss("Shield Heavy", "Shield Heavy")
      end,
      done = function(s) return defeated(s.heavy) end,
      leave = function() hud.boss("", "") end,
    },
    {
      objective = "Inspect the dropped device",
      checkpoint = { x = M1.x, y = 0.9, z = M1.z - 14 },
      enter = function(s)
        s.device = spawn("Cell Device", M1.x + 1, M1.z + 6, 0.55)
        s.marker = { M1.x + 1, M1.z + 6, "Device" }
        audio.music("explore")
      end,
      tick = function(s) use_tick(s, M1.x + 1, M1.z + 6, "Inspect the device") end,
      done = function(s) return s.used end,
    },
  },
}

-- Mission 2: No Brakes. A rogue delivery van with stolen kinetic cells
-- (it starts north of Mission 0's barrier): catch it twice on the move up
-- Central Avenue, then it runs into the roadblock on West Avenue, where
-- Velocity disables the cells.
local RIG_ROUTE = "0,0 0,40 0,64 -30,64 -64,64 -64,30 -64,8"
local ROADBLOCK = { x = -64, z = 4 }
MISSIONS.m2 = {
  title = "NO BRAKES",
  start = { 6, -22, "No Brakes" },
  reward = "Mastery tier 2 opens at Ward Dispatch",
  merit = 2,
  steps = {
    {
      objective = "Catch the runaway rig (0/2)",
      hint = "Sprint alongside it: get close and stay with it",
      checkpoint = { x = 6, y = 0.9, z = -24 },
      enter = function(s)
        start_rig(s, 0, -10, RIG_ROUTE)
        s.catches, s.cool = 0, 0
        audio.music("tension")
      end,
      tick = function(s, dt)
        local d = rig_pace(s.rig, 25)
        s.cool = math.max(0, s.cool - dt)
        if d < 7 and s.cool <= 0 then
          s.catches = s.catches + 1
          s.cool = 4
          hud.cue("good")
          ui.set_text("Objective", string.format("Catch the runaway rig (%d/2)", s.catches))
        end
        if s.rig and world.alive(s.rig) then
          local x, _, z = world.position(s.rig)
          marker(x, z, "Rig")
        end
      end,
      done = function(s) return s.catches >= 2 end,
    },
    {
      objective = "Disable the cell rig at the roadblock",
      checkpoint = { x = ROADBLOCK.x, y = 0.9, z = ROADBLOCK.z + 20 },
      enter = function(s, prev)
        -- The rig drives on down its route to the roadblock (after a
        -- knockout, a new one starts just short of it).
        s.rig = prev and prev.rig
        if not (s.rig and world.alive(s.rig)) then start_rig(s, ROADBLOCK.x, ROADBLOCK.z + 40, "-64,8") end
        vehicle.set_speed_scale(s.rig, 1)
        for x = -70, -58, 4 do spawn("Roadblock", x, ROADBLOCK.z + 6, 0.52) end
        s.marker = { ROADBLOCK.x, ROADBLOCK.z + 10, "Roadblock" }
      end,
      tick = function(s)
        if not (s.rig and world.alive(s.rig)) then return end
        local x, _, z = world.position(s.rig)
        if not s.stopped and z < ROADBLOCK.z + 14 then
          s.stopped = true
          vehicle.set_mode(s.rig, "off")
          vehicle.freeze(s.rig, true)
        end
        if s.stopped then use_tick(s, x, z, "Disable the kinetic cells") end
      end,
      done = function(s) return s.used end,
    },
  },
}

-- Mission 3: Aftershock. The scaffolding at Construction Rise came down
-- after a device overload: three people to get out, in any order, each
-- with a threat nearby.
local RISE = { { x = 86, z = 40, y = 2.6 + 0.9 }, { x = 80, z = 14 }, { x = 98, z = 50 } }
MISSIONS.m3 = {
  title = "AFTERSHOCK",
  start = { 66, 30, "Aftershock" },
  reward = "Rising Strike (back + U) and Meteor Smash (back, forward + U) unlocked. Mastery tier 3 at Dispatch",
  unlock = "rising_dragon meteor_smash",
  merit = 3,
  steps = {
    {
      objective = "Rescue the workers (0/3)",
      hint = "Any order. Deal with the threat near each one, then G",
      checkpoint = { x = 66, y = 0.9, z = 30 },
      enter = function(s)
        s.people, s.saved, s.threats = {}, {}, {}
        for i, p in ipairs(RISE) do
          s.people[i] = spawn("Civilian", p.x, p.z, p.y)
        end
        s.threats = { enemy("Street Enforcer", 84, 30), enemy("Rusher", 78, 20), enemy("Suppressor", 96, 44) }
        s.count = 0
        audio.music("tension")
      end,
      tick = function(s)
        local text = ""
        for i, id in ipairs(s.people) do
          if not s.saved[i] and world.alive(id) then
            local x, _, z = world.position(id)
            if near(x, z, USE_R) then
              text = "G  Get them out"
              if interact() then
                s.saved[i] = true
                s.count = s.count + 1
                hud.cue("good")
                ui.set_text("Objective", string.format("Rescue the workers (%d/3)", s.count))
                local id_now = id
                after(1.5, function() if world.alive(id_now) then world.set_position(id_now, 66, 0.9, 6 + i * 2) end end)
              end
            end
          end
        end
        set_prompt(text)
        -- The marker leads to the nearest one still trapped.
        local best, bx, bz
        local hx, _, hz = hero_at()
        for i, id in ipairs(s.people) do
          if not s.saved[i] and world.alive(id) then
            local x, _, z = world.position(id)
            local d = (hx - x) ^ 2 + (hz - z) ^ 2
            if not best or d < best then best, bx, bz = d, x, z end
          end
        end
        if bx then marker(bx, bz, "Worker") end
      end,
      done = function(s) return s.count >= 3 end,
    },
  },
}

-- Mission 4: Breakline. The finale at Meridian Junction, in three phases
-- (70% and 35%, each announced once).
local JUNCTION = { x = 0, z = 128 }
MISSIONS.m4 = {
  title = "BREAKLINE",
  start = { 0, 100, "Breakline" },
  reward = "Meridian Ward is safe. Heroic mode is open at Ward Dispatch",
  merit = 5,
  steps = {
    {
      objective = "Find Breakline at Meridian Junction",
      marker = { JUNCTION.x, JUNCTION.z, "Junction" },
      checkpoint = { x = 0, y = 0.9, z = 100 },
      done = function() return near(JUNCTION.x, JUNCTION.z, 16) end,
    },
    {
      objective = "Defeat Breakline",
      hint = "Watch the shoulder: the charge is red, dodge it (X), then punish",
      checkpoint = { x = 0, y = 0.9, z = 112 },
      enter = function(s)
        s.boss = enemy("Breakline", JUNCTION.x, JUNCTION.z + 4)
        s.phase = 1
        hud.boss("Breakline", "BREAKLINE")
        audio.music("tension")
      end,
      tick = function(s)
        if defeated(s.boss) then return end
        local hp, max = world.health(s.boss)
        local f = hp / max
        if s.phase < 2 and f < 0.7 then
          s.phase = 2
          world.send(s.boss, "phase", 2)
          hud.announce("Breakline: \"Fast. Let's see you outrun this.\" The slam ring is red: get clear or roll through it")
          set_hint("Phase 2: the slam ring. Get clear, then strike while it recovers")
        end
        if s.phase < 3 and f < 0.35 then
          s.phase = 3
          world.send(s.boss, "phase", 3)
          hud.announce("Breakline overloads. After each slam an impact field soaks hits for three seconds: wait, then strike")
          set_hint("Phase 3: after a slam, wait out the field (sparks), then punish")
        end
      end,
      done = function(s) return defeated(s.boss) end,
      leave = function() hud.boss("", "") end,
    },
  },
}

local STORY = { "m0", "m1", "m2", "m3", "m4" }

-- -- Street incidents (GAME_DESIGN.md 8): short, repeatable, never required ----------
local INCIDENTS = {}

INCIDENTS.robbery = {
  title = "ROBBERY IN PROGRESS",
  start = { -32, -2, "Robbery" },
  reward = "Merit +1",
  merit = 1,
  steps = {
    {
      objective = "Stop the robbers",
      checkpoint = { x = -32, y = 0.9, z = -10 },
      enter = function(s)
        s.enemies = { enemy("Street Enforcer", -35, 4), enemy("Street Enforcer", -29, 5), enemy("Rusher", -32, 10) }
      end,
      tick = function(s) ui.set_text("Objective", fight_objective("Stop the robbers", s.enemies)) end,
      done = function(s) return all_defeated(s.enemies) end,
    },
  },
}

INCIDENTS.medical = {
  title = "MEDICAL DASH",
  start = { -32, -32, "Medical Dash" },
  reward = "Merit +1",
  merit = 1,
  steps = {
    {
      objective = "Grab the first-aid kit",
      checkpoint = { x = -32, y = 0.9, z = -32 },
      enter = function(s)
        s.kit = spawn("Aid Kit", -30, -30, 0.2)
        s.marker = { -30, -30, "Aid kit" }
      end,
      tick = function(s) use_tick(s, -30, -30, "Take the kit") end,
      done = function(s) return s.used end,
      leave = function(s) if s.kit and world.alive(s.kit) then world.destroy(s.kit) end end,
    },
    {
      objective = "Get the kit to the Transit Plaza",
      checkpoint = { x = -32, y = 0.9, z = -32 },
      enter = function(s)
        s.limit = props.fast and 400 or 40
        s.t = 0
        s.patient = spawn("Civilian", 30, 96)
        s.marker = { 30, 96, "Patient" }
      end,
      tick = function(s, dt)
        s.t = s.t + dt
        local left_s = math.max(0, math.ceil(s.limit - s.t))
        ui.set_text("Objective", string.format("Get the kit to the Transit Plaza (%d s)", left_s))
        if s.t > s.limit then s.failed = true end
        use_tick(s, 30, 96, "Hand over the kit")
      end,
      done = function(s) return s.used end,
    },
  },
}

INCIDENTS.rig = {
  title = "RUNAWAY RIG",
  start = { 64, -50, "Runaway Rig" },
  reward = "Merit +1",
  merit = 1,
  steps = {
    {
      objective = "Catch the runaway rig",
      hint = "Get close and stay with it",
      checkpoint = { x = 64, y = 0.9, z = -50 },
      enter = function(s) start_rig(s, 64, -40, "64,-30 64,60 64,110") end,
      tick = function(s)
        local d = rig_pace(s.rig, 25)
        if d < 7 then s.caught = true end
        if s.rig and world.alive(s.rig) then
          local x, _, z = world.position(s.rig)
          marker(x, z, "Rig")
        end
      end,
      done = function(s) return s.caught end,
    },
  },
}

INCIDENTS.devices = {
  title = "DEVICE SHUTDOWN",
  start = { 32, 66, "Device Shutdown" },
  reward = "Merit +1",
  merit = 1,
  steps = {
    {
      objective = "Shut down the devices (0/3)",
      hint = "Any order. The Suppressors fire from range: close in or break their line of sight",
      checkpoint = { x = 32, y = 0.9, z = 66 },
      enter = function(s)
        s.spots = { { 14, 86 }, { 46, 100 }, { 26, 112 } }
        s.off, s.count = {}, 0
        s.devices = {}
        for i, p in ipairs(s.spots) do s.devices[i] = spawn("Cell Device", p[1], p[2], 0.55) end
        enemy("Suppressor", 30, 104)
        enemy("Suppressor", 44, 84)
      end,
      tick = function(s)
        local text = ""
        for i, p in ipairs(s.spots) do
          if not s.off[i] and near(p[1], p[2], USE_R) then
            text = "G  Shut it down"
            if interact() then
              s.off[i] = true
              s.count = s.count + 1
              if world.alive(s.devices[i]) then world.destroy(s.devices[i]) end
              hud.cue("good")
              ui.set_text("Objective", string.format("Shut down the devices (%d/3)", s.count))
            end
          end
        end
        set_prompt(text)
      end,
      done = function(s) return s.count >= 3 end,
    },
  },
}

-- Roofline Relay: five gates through Construction Rise and back, timed.
-- Medals by time; any finish counts.
local GATES = { { 66, 20 }, { 86, 22 }, { 86, 40, 2.6 }, { 64, 52 }, { 32, 64 } }
INCIDENTS.relay = {
  title = "ROOFLINE RELAY",
  start = { 54, 4, "Roofline Relay" },
  reward = "Merit +1",
  merit = 1,
  steps = {
    {
      objective = "Run the relay: gate 1/5",
      hint = "Through the gates in order. Up the ramp, across the deck",
      checkpoint = { x = 54, y = 0.9, z = 4 },
      enter = function(s)
        s.next, s.t = 1, 0
        s.gate = spawn("Relay Gate", GATES[1][1], GATES[1][2], 1.7)
        s.marker = { GATES[1][1], GATES[1][2], "Gate 1" }
      end,
      tick = function(s, dt)
        s.t = s.t + dt
        local g = GATES[s.next]
        if g and near(g[1], g[2], 2.6) then
          hud.cue("good")
          s.next = s.next + 1
          if s.gate and world.alive(s.gate) then world.destroy(s.gate) end
          local n = GATES[s.next]
          if n then
            s.gate = spawn("Relay Gate", n[1], n[2], (n[3] or 0) + 1.7)
            marker(n[1], n[2], "Gate " .. s.next)
            ui.set_text("Objective", string.format("Run the relay: gate %d/5", s.next))
          end
        end
        set_hint(string.format("%.1f s", s.t))
      end,
      done = function(s) return s.next > #GATES end,
      leave = function(s)
        local medal = s.t < 25 and "Gold" or s.t < 35 and "Silver" or "Bronze"
        hud.announce(string.format("Relay: %.1f s. %s medal.", s.t, medal))
      end,
    },
  },
}

local INCIDENT_ORDER = { "robbery", "medical", "rig", "devices", "relay" }

-- -- Running an activity -----------------------------------------------------------
local function next_story()
  for _, id in ipairs(STORY) do
    if not progress[id] then return id end
  end
end

local function begin_step(index, prev)
  local def = act.def.steps[index]
  act.step = { index = index }
  checkpoint = def.checkpoint or checkpoint
  ui.set_text("Objective", def.objective)
  set_hint(def.hint or "")
  set_prompt("")
  if def.enter then def.enter(act.step, prev) end
  local m = act.step.marker or def.marker
  if m then marker(m[1], m[2], m[3]) else marker() end
end

-- Free roam: the next story mission's marker, and the incidents on the map.
local function show_free_roam()
  ui.set_text("Mission", "FREE ROAM")
  local story = next_story()
  if story then
    local s = MISSIONS[story].start
    ui.set_text("Objective", "Next: " .. MISSIONS[story].title)
    marker(s[1], s[2], s[3])
  else
    ui.set_text("Objective", "The ward is yours. Incidents are on the map (M)")
    marker()
  end
  for _, id in ipairs(INCIDENT_ORDER) do
    local s = INCIDENTS[id].start
    if progress.m0 then hud.map_marker("incident_" .. id, "giver", s[1], s[2], "#ff8a5c", s[3]) end
  end
  set_hint(merit > 0 and string.format("Merit %d", merit) or "")
  set_prompt("")
  checkpoint = START
  audio.music("explore")
end

local function start_activity(kind, id)
  local def = kind == "story" and MISSIONS[id] or INCIDENTS[id]
  act = { kind = kind, id = id, def = def, actors = {} }
  fights = 0
  ui.set_text("Mission", def.title)
  if kind == "incident" then hud.clear_map_marker("incident_" .. id) end
  begin_step(1)
end

local function leave_step()
  local def = act.def.steps[act.step.index]
  if def.leave then def.leave(act.step) end
end

local function finish()
  local def, id = act.def, act.id
  leave_step()
  if act.kind == "story" then
    -- Idempotent: a mission's reward is granted once, however it ends.
    if not progress[id] then
      progress[id] = true
      merit = merit + (def.merit or 0)
      if def.unlock then world.send(hero, "unlock", def.unlock) end
      write_save()
      hud.announce("MISSION COMPLETE: " .. def.title .. ". " .. def.reward)
      hud.cue("discovery")
    end
  else
    merit = merit + (def.merit or 0)
    rested[id] = clock + REST
    write_save()
    hud.announce("INCIDENT CLEARED: " .. def.title .. ". " .. def.reward)
    hud.cue("discovery")
  end
  if picks.wind and fights > 0 then
    local _, max = world.health(hero)
    if max then world.heal(hero, max * 0.25) end
  end
  -- Those helped get away; enemies are already down.
  local leaving = act.actors
  after(3, function()
    for _, a in ipairs(leaving) do
      if world.alive(a) then world.destroy(a) end
    end
  end)
  act = nil
  show_free_roam()
end

-- A timed incident that runs out: nothing lost, it can be tried again.
local function abandon(reason)
  leave_step()
  clear_actors()
  local id = act.id
  act = nil
  hud.announce(reason)
  hud.cue("bad")
  rested[id] = clock + 5
  show_free_roam()
end

local function advance()
  local index = act.step.index
  if index >= #act.def.steps then
    finish()
  else
    local prev = act.step
    leave_step()
    begin_step(index + 1, prev)
  end
end

-- Knocked out: healed, back at the checkpoint, the step starts over.
local function knockout(reason)
  local _, max = world.health(hero)
  world.send(hero, "revive")
  world.heal(hero, max or 999)
  world.set_velocity(hero, 0, 0, 0)
  world.set_position(hero, checkpoint.x, checkpoint.y, checkpoint.z)
  hud.announce(reason or "Knocked down. Back on your feet at the last checkpoint.")
  hud.cue("bad")
  if act then
    fights = 0
    leave_step()
    clear_actors()
    begin_step(act.step.index)
  end
end

-- -- Mastery and Dispatch ------------------------------------------------------------
local function apply_mastery()
  world.send(hero, "mastery", string.format("%s,%s,%s,%s",
    picks.heavy and 1.15 or 1, picks.swift and 1.1 or 1, picks.edge and 0.12 or 0, picks.steady and 300 or 240))
end

local function menu_text()
  local lines = {}
  local open_any = false
  for t, tier in ipairs(TIERS) do
    if progress[tier.opens] then
      open_any = true
      local a, b = tier[1], tier[2]
      local function row(key, c)
        return string.format("%d  %s%s: %s", key, picks[c[1]] and "[x] " or "[ ] ", c[2], c[3])
      end
      lines[#lines + 1] = "Tier " .. t
      lines[#lines + 1] = row(t * 2 - 1, a)
      lines[#lines + 1] = row(t * 2, b)
    end
  end
  if not open_any then lines[#lines + 1] = "Finish Streetlight to open mastery." end
  if progress.m4 then lines[#lines + 1] = "H  Heroic: " .. (picks.heroic and "ON" or "off") end
  lines[#lines + 1] = "G  Close   (changes are free)"
  return table.concat(lines, "\n")
end

local function menu_tick()
  local choice
  for k = 1, 6 do
    if input.pressed("Digit" .. k) then choice = k end
  end
  if choice then
    local tier = TIERS[math.ceil(choice / 2)]
    if tier and progress[tier.opens] then
      local pick, other = tier[(choice - 1) % 2 + 1], tier[choice % 2 + 1]
      picks[pick[1]] = true
      picks[other[1]] = nil
      apply_mastery()
      write_save()
      hud.cue("good")
      hud.system("WARD DISPATCH", menu_text())
    end
  end
  if progress.m4 and input.pressed("KeyH") then
    picks.heroic = not picks.heroic or nil
    write_save()
    hud.cue("good")
    hud.system("WARD DISPATCH", menu_text())
  end
  if interact() or not near(CONTACT.x, CONTACT.z, USE_R + 2) then
    menu_open = false
    hud.system_close()
  end
end

-- Free roam: walk up to a start marker and press G.
local function free_roam_tick()
  if menu_open then
    menu_tick()
    return
  end
  local text = ""
  if progress.m0 and near(CONTACT.x, CONTACT.z, USE_R) then
    text = "G  Ward Dispatch: mastery"
    if interact() then
      menu_open = true
      hud.system("WARD DISPATCH", menu_text())
      set_prompt("")
      return
    end
  end
  local story = next_story()
  if story and story ~= "m0" then
    local s = MISSIONS[story].start
    if near(s[1], s[2], START_R) then
      text = "G  Start: " .. MISSIONS[story].title
      if interact() then start_activity("story", story) return end
    end
  end
  if progress.m0 then
    for _, id in ipairs(INCIDENT_ORDER) do
      local s = INCIDENTS[id].start
      if near(s[1], s[2], START_R) then
        if clock < (rested[id] or 0) then
          text = INCIDENTS[id].title .. ": quiet for now"
        else
          text = "G  Respond: " .. INCIDENTS[id].title
          if interact() then start_activity("incident", id) return end
        end
      end
    end
  end
  set_prompt(text)
end

-- -- Callbacks ---------------------------------------------------------------------
function on_start()
  hero = world.find("Velocity")
  hud.pause_menu(true)
  hud.map_layout(MAP)
  hud.map_marker("dispatch", "home", CONTACT.x, CONTACT.z, "#9fe6ff", "Ward Dispatch")
  load_save()
  for _, id in ipairs(STORY) do
    if progress[id] then
      if MISSIONS[id].unlock then world.send(hero, "unlock", MISSIONS[id].unlock) end
    end
  end
  apply_mastery()
  if not progress.m0 then start_activity("story", "m0") else show_free_roam() end
end

function on_tick(dt)
  clock = clock + dt
  if not hero then return end
  local hp, max = world.health(hero)
  if hp and max and hp < max * KO then
    knockout()
    return
  end
  if not act then
    free_roam_tick()
    return
  end
  if input.action_pressed("restart") then
    knockout("Back to the checkpoint.")
    return
  end
  local def = act.def.steps[act.step.index]
  if def.tick then def.tick(act.step, dt) end
  if act.step.failed then
    abandon("Out of time. The incident is still open: try again.")
    return
  end
  if def.done(act.step) then advance() end
end
