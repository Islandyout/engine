-- Pale Signal engine slice director: the run from Kestra Station on Tethys to
-- the relay under Vell's ice. Scanning (species, evidence, landmarks) earns
-- research points that buy ship upgrades; talking to the Talari and
-- scanning their evidence grows a language model that translates their
-- speech; the suit's oxygen runs down on airless worlds. See
-- docs/space/PALE_SIGNAL_SLICE.md. The placeholder below is replaced by the
-- level generator with the site, species, people, evidence and landmarks.
{{CONFIG}}

local phase = "title"
local player
local rp = 0
local language = 0
local catalogued = {}
local catalogue_count = 0
local collected = 0
local journal = {}
local journal_open = false
local upgrades_open = false
local talking = nil
local talk_until = 0
local talked = {}
local talk_count = 0
local banner_until = 0
local hint_until = 0
local lost_at = nil
local o2 = 1
local levels = { thrust = 0, fuel = 0, hull = 0, heat = 0, life = 0, rcs = 0 }
local base = nil
local UPGRADE = {
  thrust = { name = "Thrust Vectoring", max = 5, cost = function(l) return 30 + l * 38 end, desc = function(l) return string.format("main engine +%d%%", (l + 1) * 14) end },
  fuel = { name = "Propellant Tanks", max = 5, cost = function(l) return 26 + l * 32 end, desc = function(l) return string.format("fuel capacity +%d%%", (l + 1) * 22) end },
  hull = { name = "Hull Reinforcement", max = 4, cost = function(l) return 40 + l * 44 end, desc = function(l) return string.format("hull +%d%%, softer landings", (l + 1) * 25) end },
  heat = { name = "Ablative Shielding", max = 3, cost = function(l) return 44 + l * 52 end, desc = function(l) return string.format("heat tolerance +%d%%", (l + 1) * 22) end },
  life = { name = "Life Support", max = 4, cost = function(l) return 28 + l * 30 end, desc = function(l) return string.format("suit oxygen +%d%%", (l + 1) * 30) end },
  rcs = { name = "Reaction Control", max = 3, cost = function(l) return 22 + l * 26 end, desc = function(l) return string.format("turn authority +%d%%", (l + 1) * 30) end },
}
local UPGRADE_ORDER = { "thrust", "fuel", "hull", "heat", "life", "rcs" }

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
  hint("Field journal updated (J)", 3)
end

local function km(m)
  if m >= 10000 then return string.format("%.0f km", m / 1000) end
  if m >= 1000 then return string.format("%.1f km", m / 1000) end
  return string.format("%.0f m", m)
end

local function arc(lat1, lon1, lat2, lon2, r)
  local d = math.pi / 180
  local a = math.sin(lat1 * d) * math.sin(lat2 * d) + math.cos(lat1 * d) * math.cos(lat2 * d) * math.cos((lon1 - lon2) * d)
  return math.acos(math.max(-1, math.min(1, a))) * r
end

local function near_entity(id, range)
  if not id then return false end
  local px, _, pz = world.position(player)
  local x, _, z = world.position(id)
  return px and x and math.sqrt((px - x) ^ 2 + (pz - z) ^ 2) < range
end

-- The prototype's language model: unparsed, then patterned (every third
-- word), then basic (function words bracketed), then fluent.
local function stage()
  if language < 15 then return "UNPARSED" elseif language < 35 then return "PATTERNED" elseif language < 60 then return "BASIC" elseif language < 85 then return "CONVERSATIONAL" end
  return "FLUENT"
end
local function translated(text)
  if language >= 60 then return text end
  if language >= 35 then
    return (text:gsub("%f[%a](%a+)%f[%A]", function(w)
      local l = w:lower()
      if l == "the" or l == "and" or l == "is" or l == "are" or l == "our" or l == "your" or l == "we" or l == "they" or l == "not" or l == "old" or l == "sky" then return "[" .. w .. "]" end
      return w
    end))
  end
  if language >= 15 then
    local words, i = {}, 0
    for w in text:gmatch("%S+") do
      if i % 3 == 0 then words[#words + 1] = w end
      i = i + 1
    end
    return "Partial: " .. table.concat(words, " ") .. " ..."
  end
  return "[unparsed speech -- the scanner picks out repeated names, directions and gestures]"
end

local function refresh_meters()
  ui.set_text("Research", string.format("RESEARCH %d RP  ·  CATALOGUE %d", rp, catalogue_count))
  ui.set_text("Language", string.format("TALARI LANGUAGE %d%%  %s", math.floor(language), stage()))
end

local function learn(amount)
  local before = stage()
  language = math.min(100, language + amount)
  if stage() ~= before then banner("LANGUAGE MODEL: " .. stage(), 2.5) end
  refresh_meters()
end

local function refresh_upgrades()
  for _, id in ipairs(UPGRADE_ORDER) do
    local u, l = UPGRADE[id], levels[id]
    local label
    if l >= u.max then label = u.name .. "  MAX"
    else label = string.format("%s %d/%d  -- %s  (%d RP)", u.name, l, u.max, u.desc(l), u.cost(l)) end
    ui.set_text("Up_" .. id, label)
  end
end

local function apply_upgrades()
  if not base then base = space.spec() end
  space.tune("thrust", base.thrust * (1 + 0.14 * levels.thrust))
  space.tune("fuel", base.fuel * (1 + 0.22 * levels.fuel))
  space.tune("hull", base.hull * (1 + 0.25 * levels.hull))
  space.tune("land_vertical", 7 * (1 + 0.2 * levels.hull))
  space.tune("heat", base.heat * (1 + 0.22 * levels.heat))
  space.tune("rcs", base.rcs * (1 + 0.3 * levels.rcs))
end

local function show_upgrades(open)
  upgrades_open = open
  ui.set_visible("UpgradePanel", open)
  ui.set_visible("UpgradeTitle", open)
  for _, id in ipairs(UPGRADE_ORDER) do ui.set_visible("Up_" .. id, open) end
  if open then refresh_upgrades() end
end

local function show_talk(npc)
  talking = npc
  talk_until = time.now + 9
  ui.set_visible("TalkPanel", npc ~= nil)
  ui.set_visible("TalkName", npc ~= nil)
  ui.set_visible("TalkLine", npc ~= nil)
  if npc then
    ui.set_text("TalkName", npc.name .. "  ·  " .. npc.role)
    ui.set_text("TalkLine", translated(npc.line))
  end
end

local function set_phase(name)
  phase = name
  -- Kestra's markers only make sense while the frame is at Kestra.
  local st = space.state()
  local home = not (st and st.away)
  if name == "exit" then
    objective("Step out onto Tethys", "Press E to leave the ship.")
  elseif name == "survey" then
    objective("Survey Kestra", "Scan the Black Foundation at the ruin (hold F) · talk to the Talari (E)")
    if home then
      ui.marker("goal", RUIN[1], 10, RUIN[3], "Ruin")
      ui.marker("quarter", 190, 3, 40, "Kestra")
    end
  elseif name == "fuel" then
    ui.clear_marker("goal")
    ui.clear_marker("quarter")
    objective("Gather volatile ice: " .. collected .. "/2", "Glowing outcrops around the station: scan one to collect it (+25 fuel).")
    for i, ice in ipairs(ICE) do
      if home and world.find(ice.name) then ui.marker("ice" .. i, ice.x, 2.4, ice.z, "Ice") end
    end
  elseif name == "launch" then
    for i = 1, #ICE do ui.clear_marker("ice" .. i) end
    space.set_target(SIGNAL.body)
    objective("Follow the signal to Vell", "Board (E), lift off (SPACE), climb out of the air and make orbit. Optional: the Kneeling Array, a short hop away.")
  elseif name == "descent" then
    objective("Land near the Under-Ice Relay", "Follow its beam. Under 7 m/s at touchdown. Then step out -- Vell has no air.")
  elseif name == "relay" then
    objective("Scan the Under-Ice Relay", "Walk to the structure and hold F. Watch your oxygen.")
  end
end

local function finish()
  phase = "end"
  space.set_controls(false)
  log_journal("Under-Ice Relay",
    "Same black material as Kestra's foundation, intact, under forty metres of ice. It is still transmitting -- not to Tethys. Outward.")
  objective("", "")
  ui.set_visible("EndPanel", true)
  ui.set_visible("EndTitle", true)
  ui.set_visible("EndText", true)
  ui.set_visible("Again", true)
  ui.set_text("EndTitle", "THE SIGNAL IS OLDER THAN THE TALARI")
  ui.set_text("EndText", string.format("%d species catalogued · %d RP · Talari language %d%%\nThe relay is still transmitting -- outward.", catalogue_count, rp, math.floor(language)))
end

-- Scans arrive from the engine's scanner as on_ui("scan", key).
local function on_scan(key)
  local ice = key:match("^ice:(%d+)$")
  if ice then
    local name = ICE[tonumber(ice)] and ICE[tonumber(ice)].name
    local id = name and world.find(name)
    if id then world.destroy(id) end
    ui.clear_marker("ice" .. ice)
    collected = collected + 1
    space.refuel(25)
    sound.play("pickup")
    banner("VOLATILES +25 FUEL", 1.8)
    if phase == "fuel" then
      objective("Gather volatile ice: " .. collected .. "/2", "Glowing outcrops around the station: scan one to collect it (+25 fuel).")
      if collected >= 2 then
        log_journal("Fuel", "Enough volatile ice for the crossing to Vell and a landing.")
        set_phase("launch")
      end
    end
    return
  end
  local sp = SPECIES[key]
  if sp and not catalogued[key] then
    catalogued[key] = true
    catalogue_count = catalogue_count + 1
    rp = rp + sp.rp
    banner(string.upper(sp.name) .. "  +" .. sp.rp .. " RP", 2)
    log_journal(sp.name .. " (" .. sp.body .. ", " .. sp.cls .. ")", sp.text)
  end
  local ev = EVIDENCE[key]
  if ev and not catalogued[key] then
    catalogued[key] = true
    rp = rp + ev.rp
    learn(ev.gain)
    banner(string.upper(ev.name) .. "  +" .. ev.rp .. " RP", 2.2)
    log_journal(ev.name .. " -- " .. ev.era, ev.text)
  end
  if key == "te_gate_layer" and not catalogued[key] then
    catalogued[key] = true
    rp = rp + 12
    learn(6)
    banner("BLACK FOUNDATION  +12 RP", 2.5)
    log_journal("The Black Foundation",
      "Talari glyphs over a lower layer in no known script, dated 40,000 years before the Talari arrived -- their histories say they found Tethys empty. It answers a carrier wave from Vell.")
  end
  local lm = LANDMARKS[key]
  if lm and not catalogued[key] then
    catalogued[key] = true
    rp = rp + lm.rp
    banner(string.upper(lm.name) .. "  +" .. lm.rp .. " RP", 3)
    log_journal(lm.name, lm.text)
    if lm.name == "Under-Ice Relay" then finish() end
  end
  refresh_meters()
  if phase == "survey" and catalogued.te_gate_layer and next(talked) then set_phase("fuel") end
end

function on_ui(name, value)
  if name == "scan" then
    on_scan(value)
  elseif name == "Begin" and phase == "title" then
    for _, el in ipairs({ "TitlePanel", "Title", "TitleSub", "Begin", "Controls", "Controls2", "Controls3" }) do ui.set_visible(el, false) end
    space.set_controls(true)
    local s = space.state()
    if s and s.piloting then set_phase("exit") else set_phase("survey") end
    banner("TETHYS -- KESTRA STATION", 4)
    log_journal("Landfall: Tethys", "Thin but breathable air, 14 C. The Talari built Kestra on older foundations than their own records admit.")
  elseif name:sub(1, 3) == "Up_" then
    local id = name:sub(4)
    local u, l = UPGRADE[id], levels[id]
    if u and l < u.max then
      local cost = u.cost(l)
      if rp >= cost then
        rp = rp - cost
        levels[id] = l + 1
        apply_upgrades()
        banner(string.upper(u.name) .. " " .. levels[id], 2)
        refresh_meters()
      else
        hint(string.format("%s needs %d RP -- scan more.", u.name, cost), 3)
      end
      refresh_upgrades()
    end
  end
end

local started = false
function on_tick(dt)
  if not started then
    started = true
    player = world.find("Player")
    space.set_fuel(START_FUEL)
    space.set_controls(false)
    for _, el in ipairs({ "EndPanel", "EndTitle", "EndText", "Again", "JournalPanel", "JournalTitle", "JournalText", "Banner", "Hint" }) do ui.set_visible(el, false) end
    show_upgrades(false)
    show_talk(nil)
    objective("", "")
    refresh_meters()
  end
  if banner_until > 0 and time.now > banner_until then ui.set_visible("Banner", false) banner_until = 0 end
  if hint_until > 0 and time.now > hint_until then ui.set_visible("Hint", false) hint_until = 0 end
  if talking and time.now > talk_until then show_talk(nil) end
  if input.pressed("p") and phase ~= "title" then game.pause() end
  if input.pressed("j") then
    journal_open = not journal_open
    ui.set_visible("JournalPanel", journal_open)
    ui.set_visible("JournalTitle", journal_open)
    ui.set_visible("JournalText", journal_open)
  end
  if input.pressed("u") and phase ~= "title" then show_upgrades(not upgrades_open) end

  local s = space.state()
  if not s then return end
  for _, e in ipairs(space.events()) do
    if e == "rough_touchdown" then banner("ROUGH TOUCHDOWN", 2.5)
    elseif e == "touchdown" and phase ~= "title" then banner("TOUCHDOWN", 2)
    elseif e == "exited" and phase == "exit" then set_phase("survey")
    elseif e == "boarded" then o2 = 1
    elseif e == "exit_blocked" then hint("Outside the walkable area.", 4)
    elseif e == "frame:home" then
      -- Back at Kestra: its markers again.
      if phase == "survey" or phase == "fuel" then set_phase(phase) end
    elseif e:sub(1, 6) == "frame:" then
      -- Kestra's markers are elsewhere on the planet now.
      for _, m in ipairs({ "goal", "quarter", "ice1", "ice2", "ice3" }) do ui.clear_marker(m) end
      hint("Landed on " .. e:sub(7) .. ": step out with E to explore and scan (F).", 4)
    elseif e == "soi:" .. SIGNAL.body then
      banner("ENTERING " .. string.upper(SIGNAL.body) .. "'S INFLUENCE", 3)
      if phase == "launch" then set_phase("descent") end
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
    if phase == "descent" or phase == "relay" then set_phase("launch") end
  end

  -- On foot: talking, and the suit's oxygen where there's no air.
  if not s.piloting and phase ~= "title" then
    if input.pressed("e") then
      for _, npc in ipairs(NPCS) do
        local id = world.find(npc.name)
        if id and near_entity(id, 3.5) then
          if not talked[npc.id] then
            talked[npc.id] = true
            talk_count = talk_count + 1
            rp = rp + 3
            if talk_count == 1 then
              learn(8)
              log_journal("First contact -- Kestra", "Communication begins with names, pointing, repeated phrases and patient correction rather than instant translation.")
            else
              learn(5)
            end
          end
          show_talk(npc)
          if phase == "survey" and catalogued.te_gate_layer then set_phase("fuel") end
          break
        end
      end
    end
    local breathable = BREATHABLE[s.frame]
    if breathable then
      o2 = math.min(1, o2 + dt * 0.2)
      ui.set_text("O2Label", "AIR: AMBIENT INTAKE")
    else
      o2 = o2 - dt / (90 * (1 + 0.3 * levels.life))
      ui.set_text("O2Label", string.format("SUIT O2 %d%%", math.max(0, math.floor(o2 * 100))))
      if o2 < 0.25 then hint("Oxygen low: return to the ship (E to board).", 1) end
      if o2 <= 0 then
        o2 = 1
        space.board()
        banner("SUIT FAILURE -- RECOVERED TO SHIP", 3)
        log_journal("Suit failure", "Oxygen ran out on " .. s.frame .. ". The suit's recovery tether pulled you back aboard.")
      end
    end
    ui.set_value("O2Bar", math.max(o2, 0))
    if phase == "descent" and s.frame == SIGNAL.body then set_phase("relay") end
  else
    o2 = 1
    ui.set_text("O2Label", s.piloting and "SHIP LIFE SUPPORT" or "")
    ui.set_value("O2Bar", 1)
  end

  if phase == "descent" and s.body == SIGNAL.body then
    local vell = space.body(SIGNAL.body)
    local d = arc(s.latitude, s.longitude, SIGNAL.latitude, SIGNAL.longitude, vell and vell.radius or 18000)
    ui.set_text("Detail", string.format("Relay: %s across the surface · altitude %s. Land within 1 km and step out.", km(d), km(math.max(s.altitude, 0))))
  end

  if s.piloting and phase ~= "title" and phase ~= "end" then
    if s.fuel <= 0 and not s.landed then hint("Out of fuel. STABILIZED holds you level; land gently.", 2) end
    if s.heat > 70 then hint("Hull heating: slow down in the thick air.", 2) end
  end
end
