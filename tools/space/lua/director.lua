-- Pale Signal engine slice director: the run from Kestra Station on Tethys to
-- the signal on Vell -- objectives, scanning, fuel gathering, the field
-- journal, flight guidance, recovery after a lost ship, and the ending. See
-- docs/space/PALE_SIGNAL_SLICE.md. The placeholder below is replaced by the
-- level generator with the ruin, ice and signal coordinates.
{{CONFIG}}

local phase = "title"
local player
local scan = 0
local collected = 0
local ice_left = {}
local journal = {}
local journal_open = false
local banner_until = 0
local hint_until = 0
local lost_at = nil
local reached_space = false
local reached_orbit = false

local function banner(text, seconds)
  ui.set_text("Banner", text)
  ui.set_visible("Banner", true)
  banner_until = time.now + (seconds or 3)
end

local function hint(text, seconds)
  ui.set_text("Hint", text)
  ui.set_visible("Hint", true)
  hint_until = time.now + (seconds or 5)
end

local function objective(text, detail)
  ui.set_text("Objective", text)
  ui.set_text("Detail", detail or "")
end

local function log_journal(title, body)
  journal[#journal + 1] = title .. "\n" .. body
  local shown = {}
  for i = math.max(1, #journal - 4), #journal do shown[#shown + 1] = journal[i] end
  ui.set_text("JournalText", table.concat(shown, "\n\n"))
  hint("Field journal updated (J)", 4)
end

local function km(m)
  if m >= 10000 then return string.format("%.0f km", m / 1000) end
  if m >= 1000 then return string.format("%.1f km", m / 1000) end
  return string.format("%.0f m", m)
end

-- Great-circle distance between two latitude/longitude points (degrees) on
-- a sphere of radius r.
local function arc(lat1, lon1, lat2, lon2, r)
  local d = math.pi / 180
  local a = math.sin(lat1 * d) * math.sin(lat2 * d) + math.cos(lat1 * d) * math.cos(lat2 * d) * math.cos((lon1 - lon2) * d)
  return math.acos(math.max(-1, math.min(1, a))) * r
end

local function near(x, z, range)
  local px, _, pz = world.position(player)
  return px and math.sqrt((px - x) ^ 2 + (pz - z) ^ 2) < range
end

local function set_phase(name)
  phase = name
  if name == "exit" then
    objective("Step out onto Tethys", "Press E to leave the ship.")
  elseif name == "survey" then
    objective("Survey the Talari ruin", "North of the station. Hold F at the monolith.")
    ui.marker("goal", RUIN[1], 10, RUIN[3], "Ruin")
  elseif name == "fuel" then
    ui.clear_marker("goal")
    objective("Gather volatile ice: 0/2", "Glowing outcrops around the station. F to collect.")
    for i, ice in ipairs(ICE) do
      ui.marker("ice" .. i, ice.x, 2.4, ice.z, "Ice")
    end
  elseif name == "board" then
    for i = 1, #ICE do ui.clear_marker("ice" .. i) end
    objective("Return to your ship", "E to board.")
    ui.marker("goal", 0, 4, 0, "Ship")
  elseif name == "launch" then
    ui.clear_marker("goal")
    space.set_target(SIGNAL.body)
    objective("Lift off and climb out of the atmosphere", "SPACE lift · W/SHIFT throttle · pitch up with the arrows or I/K.")
  elseif name == "orbit" then
    objective("Make orbit", "Raise your periapsis above 25 km. N cycles NAV modes; prograde helps.")
  elseif name == "transfer" then
    objective("Cross to Vell", "NAV TARGET (press N until it shows) points you at the moon. Burn, then coast; 9/0 warps time.")
  elseif name == "descent" then
    objective("Land at the signal", "Follow the beam. Kill your speed early; under 7 m/s at touchdown.")
  end
end

function on_ui(name)
  if name == "Begin" and phase == "title" then
    ui.set_visible("TitlePanel", false)
    ui.set_visible("Title", false)
    ui.set_visible("TitleSub", false)
    ui.set_visible("Begin", false)
    ui.set_visible("Controls", false)
    ui.set_visible("Controls2", false)
    ui.set_visible("Controls3", false)
    space.set_controls(true)
    local s = space.state()
    if s and s.piloting then set_phase("exit") else set_phase("survey") end
    banner("TETHYS — KESTRA STATION", 4)
    log_journal("Landfall: Tethys", "Thin but breathable air, 14 C. The Talari built Kestra on older foundations than their own records admit.")
  end
end

local started = false
function on_tick(dt)
  if not started then
    started = true
    player = world.find("Player")
    space.set_fuel(START_FUEL)
    space.set_controls(false)
    for i, ice in ipairs(ICE) do ice_left[i] = world.find(ice.name) end
    ui.set_visible("EndPanel", false)
    ui.set_visible("EndTitle", false)
    ui.set_visible("EndText", false)
    ui.set_visible("Again", false)
    ui.set_visible("JournalPanel", false)
    ui.set_visible("JournalTitle", false)
    ui.set_visible("JournalText", false)
    ui.set_visible("ScanBar", false)
    ui.set_visible("Banner", false)
    ui.set_visible("Hint", false)
    objective("", "")
  end
  if banner_until > 0 and time.now > banner_until then ui.set_visible("Banner", false) banner_until = 0 end
  if hint_until > 0 and time.now > hint_until then ui.set_visible("Hint", false) hint_until = 0 end
  if input.pressed("p") and phase ~= "title" then game.pause() end
  if input.pressed("j") then
    journal_open = not journal_open
    ui.set_visible("JournalPanel", journal_open)
    ui.set_visible("JournalTitle", journal_open)
    ui.set_visible("JournalText", journal_open)
  end

  local s = space.state()
  if not s then return end
  for _, e in ipairs(space.events()) do
    if e == "rough_touchdown" then banner("ROUGH TOUCHDOWN", 2.5)
    elseif e == "touchdown" and phase ~= "title" then banner("TOUCHDOWN", 2)
    elseif e == "exited" and phase == "exit" then set_phase("survey")
    elseif e == "boarded" and phase == "board" then set_phase("launch")
    elseif e == "exit_blocked" then hint("Outside the surveyed area: you can't walk here.", 4)
    elseif e == "soi:" .. SIGNAL.body then
      banner("ENTERING " .. string.upper(SIGNAL.body) .. "'S INFLUENCE", 3)
      if phase == "transfer" or phase == "orbit" or phase == "launch" then set_phase("descent") end
    elseif e == "destroyed" then
      banner("SHIP LOST", 3)
      lost_at = time.now
    end
  end

  -- Recovery: back on the pad at Kestra, patched up.
  if lost_at and time.now > lost_at + 3 then
    lost_at = nil
    space.place_landed(SITE.body, SITE.latitude, SITE.longitude, 0)
    space.repair()
    space.set_fuel(math.max(s.fuel, 60))
    hint("Recovered to Kestra Station.", 4)
    if phase == "descent" or phase == "transfer" or phase == "orbit" then set_phase("launch") end
  end

  if phase == "survey" then
    local close = near(RUIN[1], RUIN[3], 7)
    if close and not s.piloting then
      if input.down("f") then
        scan = scan + dt / 1.6
        ui.set_visible("ScanBar", true)
        ui.set_value("ScanBar", math.min(scan, 1))
      end
      if scan >= 1 then
        ui.set_visible("ScanBar", false)
        banner("SCAN COMPLETE", 2.5)
        log_journal("Talari ruin: the monolith",
          "Talari glyphs over a lower layer in no known script. Dating puts the lower layer 40,000 years before the Talari arrived -- their histories say they found Tethys empty.")
        log_journal("A signal",
          "The monolith answers a carrier wave from Vell, Tethys' moon. The source is a point on the surface. Volatile ice will fuel the crossing.")
        set_phase("fuel")
      elseif not input.down("f") then
        hint("Hold F to scan", 1)
      end
    else
      scan = 0
      ui.set_visible("ScanBar", false)
    end
  elseif phase == "fuel" then
    for i, ice in ipairs(ICE) do
      local id = ice_left[i]
      if id and near(ice.x, ice.z, 3.2) then
        if input.pressed("f") then
          world.destroy(id)
          ice_left[i] = nil
          ui.clear_marker("ice" .. i)
          collected = collected + 1
          space.refuel(25)
          sound.play("pickup")
          banner("VOLATILES +25", 1.6)
          objective("Gather volatile ice: " .. collected .. "/2", "Glowing outcrops around the station. F to collect.")
          if collected >= 2 then
            log_journal("Fuel", "Enough volatile ice for the crossing to Vell and a landing.")
            set_phase("board")
          end
        else
          hint("F to collect", 1)
        end
      end
    end
  elseif phase == "launch" then
    if s.altitude > 21600 and not s.landed then
      reached_space = true
      banner("SPACE", 2.5)
      set_phase("orbit")
    end
  elseif phase == "orbit" then
    if s.orbit_closed and s.periapsis > 25000 then
      reached_orbit = true
      banner("STABLE ORBIT", 2.5)
      set_phase("transfer")
    end
  elseif phase == "transfer" then
    local vell = space.body(SIGNAL.body)
    if vell then ui.set_text("Detail", string.format("Vell: %s · NAV: %s", km(vell.altitude), s.assist)) end
  elseif phase == "descent" and s.body == SIGNAL.body then
    local vell = space.body(SIGNAL.body)
    local d = arc(s.latitude, s.longitude, SIGNAL.latitude, SIGNAL.longitude, vell and vell.radius or 18000)
    ui.set_text("Detail", string.format("Signal: %s across the surface · altitude %s", km(d), km(math.max(s.altitude, 0))))
    if s.landed then
      if d < 2500 then
        phase = "end"
        space.set_controls(false)
        log_journal("Vell: the signal",
          "A structure of the same lower layer as the Kestra monolith, intact, under the ice. It is still transmitting -- not to Tethys. Outward.")
        objective("", "")
        ui.set_visible("EndPanel", true)
        ui.set_visible("EndTitle", true)
        ui.set_visible("EndText", true)
        ui.set_visible("Again", true)
        ui.set_text("EndTitle", "THE SIGNAL IS OLDER THAN THE TALARI")
        ui.set_text("EndText", string.format("Surface to orbit to Vell in %d minutes, no loading screens.\nThe structure under the ice is still transmitting -- outward.", math.floor(time.now / 60)))
      else
        hint(string.format("Landed %s from the signal. Lift off and fly closer.", km(d)), 2)
      end
    end
  end

  -- Context hints for flight.
  if s.piloting and phase ~= "title" and phase ~= "end" then
    if s.fuel <= 0 and not s.landed then hint("Out of fuel. Glide: STABILIZED holds you level; land gently.", 2) end
    if s.heat > 70 then hint("Hull heating: slow down in the thick air.", 2) end
  end
end
