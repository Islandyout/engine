-- Pale Signal director: the whole expedition on this engine. Six worlds,
-- the Talari of Tethys and two extinct or distant civilizations, a resource
-- and survival loop, nine landmarks and seven signal fragments that reveal
-- Nemesis. See docs/space/PALE_SIGNAL_SLICE.md. The placeholder below is
-- replaced by the level generator with the data tables (pale_data.ts).
{{CONFIG}}

-- ------------------------------------------------------------- state --
-- Everything that persists lives in S (saved with save.set).
local S
local function fresh()
  return {
    v = 1, step = "exit", rp = 0, play = 0, deaths = 0,
    res = { ore = 0, biomass = 0, volatiles = 0 },
    known = {}, landmarks = {}, frags = {}, visited = {}, completed = {},
    upg = { thrust = 0, fuel = 0, scan = 0, hull = 0, life = 0, heat = 0, rcs = 0 },
    journal = {}, atmo = {}, lessons = {}, ice = {}, spots = {},
    civ = {
      discovered = {}, evidence = {}, contacts = {}, artifacts = {}, investigations = {},
      lang = { talari = 0, ossuary = 0, hollow = 0 },
      rep = { concord = 0, meridian = 0, commons = 0, preservation = 0, hollow = 0 },
      first = false, legal = 0, offences = 0,
    },
    suit = { o2 = 1, integrity = 100, vitals = 100 },
    ship = nil, -- {body, lat, lon} of the last safe landing
    reserve = false, nemesis = false, ended = false,
  }
end
S = fresh()

local phase = "title"
local player
local menu = nil
local talking, talk_until = nil, 0
local banner_until, hint_until, last_banner = 0, 0, "Banner"
local near_harvest = ""
local confidence = 1
local helmet = true
local suit_light = "auto"
local visor_clock = 0
local prospect_mode = 0 -- 0 off, 1 volatiles, 2 ore, 3 biomass
local PROSPECT = { "volatiles", "ore", "biomass" }
local board_index = 1
local spawned = {}
local HERD_COUNT = 11 -- the home herds, "Herd 1".."Herd 11" (build_pale_signal.ts)
local spawned_prefab = {} -- by id, for the save (0.76.0)
local storm = { next = 240, until_t = 0, level = 0 }
local idle_since = 0
local autosave_at = 60
local lost_at = nil
local title_confirm = false
local base = nil
local started = false
local tick_accum = 0

-- --------------------------------------------------------- persistence --
local function encode(v)
  local t = type(v)
  if t == "number" then
    if v == math.floor(v) and math.abs(v) < 1e15 then return string.format("%d", v) end
    return string.format("%.6g", v)
  elseif t == "boolean" then return v and "T" or "F"
  elseif t == "string" then
    return '"' .. v:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub("\n", "\\n") .. '"'
  elseif t == "table" then
    local parts = {}
    for k, x in pairs(v) do
      local key = type(k) == "number" and ("#" .. k) or k
      parts[#parts + 1] = encode(key) .. "=" .. encode(x)
    end
    return "{" .. table.concat(parts, ",") .. "}"
  end
  return "N"
end

local function decode(text)
  local i = 1
  local value
  local function skip() while text:sub(i, i) == " " do i = i + 1 end end
  value = function()
    skip()
    local c = text:sub(i, i)
    if c == "{" then
      i = i + 1
      local out = {}
      skip()
      if text:sub(i, i) == "}" then i = i + 1 return out end
      while true do
        local k = value()
        if text:sub(i, i) ~= "=" then error("bad save") end
        i = i + 1
        local x = value()
        if type(k) == "string" and k:sub(1, 1) == "#" then k = tonumber(k:sub(2)) end
        out[k] = x
        local d = text:sub(i, i)
        i = i + 1
        if d == "}" then return out end
        if d ~= "," then error("bad save") end
      end
    elseif c == '"' then
      i = i + 1
      local buf = {}
      while true do
        local ch = text:sub(i, i)
        if ch == "" then error("bad save") end
        if ch == "\\" then
          local nx = text:sub(i + 1, i + 1)
          buf[#buf + 1] = nx == "n" and "\n" or nx
          i = i + 2
        elseif ch == '"' then
          i = i + 1
          return table.concat(buf)
        else
          buf[#buf + 1] = ch
          i = i + 1
        end
      end
    elseif c == "T" then i = i + 1 return true
    elseif c == "F" then i = i + 1 return false
    elseif c == "N" then i = i + 1 return nil
    else
      local s, e = text:find("^-?[%d%.eE%+%-]+", i)
      if not s then error("bad save") end
      i = e + 1
      return tonumber(text:sub(s, e))
    end
  end
  return value()
end

-- A hash of the save so a corrupted one is detected (the fresh-game guard).
local function hash(text)
  local h = 5381
  for k = 1, #text do h = (h * 33 + text:byte(k)) % 4294967296 end
  return h
end

local function save_now(reason)
  if phase == "title" or S.ended then return end
  local st = space.state()
  if st and st.landed and not st.destroyed then
    S.ship = { body = st.body, lat = st.latitude, lon = st.longitude }
  end
  S.fuel = st and st.fuel or S.fuel
  if st then S.parts = { engine = st.engine, rcs = st.rcs, gear = st.gear, scanner = st.scanner } end
  -- The hull exactly and the system clock (0.75.0).
  if st then S.hull, S.time = st.hull, st.time end
  -- Animals (0.76.0): the home herds where they grazed to, and any herds
  -- out in the wilds relative to the walker.
  if st and st.frame == "Tethys" and not st.away then
    S.herds = {}
    for i = 1, HERD_COUNT do
      local id = world.find("Herd " .. i)
      local x, y, z
      if id then x, y, z = world.position(id) end
      if x then S.herds[i] = { x = x, y = y, z = z } end
    end
  end
  S.fauna = nil
  local px, _, pz
  if player then px, _, pz = world.position(player) end
  if st and px and #spawned > 0 then
    S.fauna = { body = st.frame, list = {} }
    for _, id in ipairs(spawned) do
      local x, _, z = world.position(id)
      if x and spawned_prefab[id] then
        S.fauna.list[#S.fauna.list + 1] = { prefab = spawned_prefab[id], dx = x - px, dz = z - pz }
      end
    end
  end
  local text = encode(S)
  save.set("expedition", text)
  save.set("expedition_hash", tostring(hash(text)))
  autosave_at = time.now + 45
  if reason then log("saved: " .. reason) end
end

local function load_save()
  local text = save.get("expedition")
  if not text or text == "" then return nil end
  if tostring(hash(text)) ~= save.get("expedition_hash") then return nil end
  local ok, data = pcall(decode, text)
  if not ok or type(data) ~= "table" or data.v ~= 1 then return nil end
  return data
end

-- ------------------------------------------------------------ helpers --
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

local function clamp(v, a, b) return math.max(a, math.min(b, v)) end

local function dist2d(id, x, z)
  local px, _, pz = world.position(id)
  if not px then return 1e9 end
  return math.sqrt((px - x) ^ 2 + (pz - z) ^ 2)
end

local BANNERS = { info = "Banner", good = "BannerGood", warn = "BannerWarn", bad = "BannerBad", anomaly = "BannerAnomaly" }
local function banner(text, seconds, kind)
  ui.set_visible(last_banner, false)
  last_banner = BANNERS[kind or "info"] or "Banner"
  ui.set_text(last_banner, text)
  ui.set_visible(last_banner, true)
  banner_until = time.now + (seconds or 3)
  host.send("cue", kind or "info")
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

local function progress() idle_since = time.now end

local function log_journal(title, body, cat)
  S.journal[#S.journal + 1] = { c = cat or "note", t = title, b = body }
  hint("Field journal updated (J)", 3)
  progress()
end

-- The frame the walker or ship is in: "home" (Kestra Station), a site id,
-- or "" (open country).
local function current_site(st)
  st = st or space.state()
  if not st then return "home" end
  if not st.away then return "home" end
  for id, s in pairs(SITES) do
    if not s.home and s.name == st.site then return id end
  end
  return ""
end
local function site_active(site_id, st)
  local here = current_site(st)
  if SITES[site_id] and SITES[site_id].home then return here == "home" end
  return here == site_id
end

-- -------------------------------------------------------- language --
local function stage(lang)
  local p = S.civ.lang[lang] or 0
  if p < 15 then return "UNPARSED" elseif p < 35 then return "PATTERNED" elseif p < 60 then return "BASIC" elseif p < 85 then return "CONVERSATIONAL" end
  return "FLUENT"
end
local FUNCTION_WORDS = { the = 1, ["and"] = 1, is = 1, are = 1, our = 1, your = 1, we = 1, they = 1, ["not"] = 1, old = 1, sky = 1, river = 1, array = 1, history = 1 }
local function translated(text, lang)
  local p = S.civ.lang[lang] or 0
  if p >= 60 then return text end
  if p >= 35 then
    return (text:gsub("%f[%a](%a+)%f[%A]", function(w) if FUNCTION_WORDS[w:lower()] then return "[" .. w .. "]" end return w end))
  end
  if p >= 15 then
    local words, n = {}, 0
    for w in text:gmatch("%S+") do
      if n % 3 == 0 then words[#words + 1] = w end
      n = n + 1
    end
    return "Partial translation: " .. table.concat(words, " ") .. " ..."
  end
  if lang == "hollow" then return "[pressure-wave resonance -- the scanner resolves place, lineage and depth markers]" end
  return "[unparsed speech -- the scanner picks out repeated names, directions and gestures]"
end
local function learn(lang, amount)
  local before = stage(lang)
  S.civ.lang[lang] = clamp((S.civ.lang[lang] or 0) + amount, 0, 100)
  if stage(lang) ~= before then banner(string.upper(lang) .. " LANGUAGE: " .. stage(lang), 2.5, "good") end
end
local function rep(inst, delta)
  S.civ.rep[inst] = clamp((S.civ.rep[inst] or 0) + delta, -100, 100)
end

-- ---------------------------------------------------------- HUD --
local function refresh_meters()
  local count = 0
  for _ in pairs(S.known) do count = count + 1 end
  local frags = 0
  for _ in pairs(S.frags) do frags = frags + 1 end
  ui.set_text("Research", string.format("RESEARCH %d RP  ·  CATALOGUE %d  ·  SIGNAL %d/7", S.rp, count, frags))
  ui.set_text("Language", string.format("TALARI %d%% %s", math.floor(S.civ.lang.talari), stage("talari")))
  ui.set_text("Resources", string.format("ORE %d  ·  BIOMASS %d  ·  VOLATILES %d", S.res.ore, S.res.biomass, S.res.volatiles))
end

-- ---------------------------------------------------------- lessons --
local LESSONS = {
  { "air", "Verify an atmosphere" }, { "specimen", "Catalogue a specimen" }, { "harvest", "Harvest a catalogued specimen" },
  { "refine", "Refine volatiles into fuel" }, { "contact", "Talk to the Talari" }, { "orbit", "Reach orbit" },
  { "board", "Plan a route on the System Board" }, { "autopilot", "Arrive by NAV autopilot" }, { "landing", "Land gently away from home" },
  { "culture", "Open the culture record" }, { "fragment", "Recover a signal fragment" },
}
local function lesson(id)
  if S.lessons[id] then return end
  S.lessons[id] = true
  for _, l in ipairs(LESSONS) do
    if l[1] == id then hint("LESSON COMPLETE: " .. l[2] .. "  (F2: Survey Academy)", 4) end
  end
end

-- ------------------------------------------------------------ menus --
local MENU_BUTTONS = 6
local function show_menu_ui(open)
  for _, el in ipairs({ "MenuPanel", "MenuTitle", "MenuBody", "MenuClose" }) do ui.set_visible(el, open) end
  for k = 1, MENU_BUTTONS do ui.set_visible("MenuBtn" .. k, open and menu ~= nil and menu.buttons[k] ~= nil) end
end
local function render_menu()
  if not menu then return show_menu_ui(false) end
  if menu.build then menu.build(menu) end
  ui.set_text("MenuTitle", menu.title or "")
  ui.set_text("MenuBody", menu.body or "")
  for k = 1, MENU_BUTTONS do
    local b = menu.buttons[k]
    ui.set_text("MenuBtn" .. k, b and (k .. "  " .. b[1]) or "")
  end
  show_menu_ui(true)
end
local function open_menu(m)
  menu = m
  menu.buttons = menu.buttons or {}
  render_menu()
end
local function close_menu()
  menu = nil
  show_menu_ui(false)
end
local function press_menu(k)
  if not menu then return end
  local b = menu.buttons[k]
  if b and b[2] then b[2]() end
  if menu then render_menu() end
end

-- ------------------------------------------------------------ scanner --
local function apply_scanner()
  local l = S.upg.scan
  local st = space.state()
  local condition = st and st.scanner and st.scanner / 100 or 1
  host.send("scanner", string.format("%.2f %.2f %.2f", 1 + 0.35 * l, 1 / (1 + 0.15 * l), condition))
end

local function apply_upgrades()
  if not base then base = space.spec() end
  if not base then return end
  space.tune("thrust", base.thrust * (1 + 0.14 * S.upg.thrust))
  space.tune("fuel", base.fuel * (1 + 0.22 * S.upg.fuel))
  space.tune("hull", base.hull * (1 + 0.25 * S.upg.hull))
  space.tune("land_vertical", 7 * (1 + 0.2 * S.upg.hull))
  space.tune("land_slope", 0.5 * (1 + 0.1 * S.upg.hull))
  space.tune("heat", base.heat * (1 + 0.22 * S.upg.heat))
  space.tune("rcs", base.rcs * (1 + 0.3 * S.upg.rcs))
  apply_scanner()
end

-- --------------------------------------------------- the map and markers --
local function publish_sites()
  for id, s in pairs(SITES) do
    if S.civ.discovered[id] then host.send("map_site", string.format("%s|%s|%.3f|%.3f|%s|site", id, s.body, s.lat, s.lon, s.name)) end
  end
  for key, lm in pairs(LANDMARKS) do
    if S.landmarks[key] then host.send("map_site", string.format("%s|%s|%.3f|%.3f|%s ✓|landmark", key, lm.body, lm.lat, lm.lon, lm.name)) end
  end
end

local function discover_site(id, source)
  local s = SITES[id]
  if not s or S.civ.discovered[id] then return end
  S.civ.discovered[id] = true
  log_journal(s.name, s.desc .. (source == "radio" and " A coherent radio carrier provided the first bearing." or ""), "site")
  banner((s.kind == "settlement" and "CIVILIZATION LOGGED: " or "CULTURAL SITE LOGGED: ") .. string.upper(s.name), 3, "good")
  publish_sites()
  save_now("site")
end

-- ------------------------------------------------------------ objectives --
local function fragments()
  local n = 0
  for _ in pairs(S.frags) do n = n + 1 end
  return n
end

-- The nearest unfound fragment's landmark (the recommended NAV target).
local function next_fragment()
  local best, best_frag
  for key, lm in pairs(LANDMARKS) do
    if lm.frag > 0 and not S.frags[lm.frag] then
      if not best_frag or lm.frag < best_frag then best, best_frag = key, lm.frag end
    end
  end
  return best and LANDMARKS[best] or nil
end

local function recommended_body()
  if S.step == "nemesis" then return "Nemesis" end
  if S.step == "relay" then return "Vell" end
  local nf = next_fragment()
  return nf and nf.body or "Tethys"
end

local function set_waypoint_for_step()
  host.send("waypoint_clear", "goal")
  local target
  if S.step == "relay" then target = LANDMARKS["landmark:Under-Ice Relay"]
  elseif S.step == "fragments" then target = next_fragment()
  elseif S.step == "nemesis" then target = LANDMARKS["landmark:THE PALE SIGNAL"] end
  if target then host.send("waypoint", string.format("goal|%s|%.3f|%.3f|%s", target.body, target.lat, target.lon, target.name)) end
end

local function home_markers(show)
  for _, m in ipairs({ "goal", "quarter", "ice1", "ice2", "ice3", "ice4" }) do ui.clear_marker(m) end
  if not show then return end
  if S.step == "survey" then
    local ev = EVIDENCE.te_gate_layer
    if not S.civ.evidence.te_gate_layer then ui.marker("goal", ev.x, 10, ev.z, "Old Vey Gate") end
    if not S.civ.first then ui.marker("quarter", SITES.kestra.x, 3, SITES.kestra.z, "Kestra Reach") end
  elseif S.step == "fuel" then
    for i, ice in ipairs(ICE) do
      if not S.ice[i] then ui.marker("ice" .. i, ice.x, 2.4, ice.z, "Ice") end
    end
  end
end

local function set_step(name)
  S.step = name
  local st = space.state()
  local home = current_site(st) == "home"
  home_markers(home)
  if name == "exit" then
    objective("Step out onto Tethys", "Press E to leave the ship.")
  elseif name == "air" then
    objective("Verify the atmosphere", "Look straight up into open sky and hold F until AIR VERIFIED. Until then the suit runs on its O2 reserve.")
  elseif name == "survey" then
    objective("Survey Kestra", "Talk to a Talari in Kestra Reach (E) and scan the black foundation at Old Vey Gate (hold F).")
  elseif name == "fuel" then
    objective(string.format("Gather volatiles: %d/12", S.res.volatiles), "Scan or harvest volatile ice and Clathrate Pockets (R prospects), then refine at the ship (I).")
  elseif name == "launch" then
    space.set_target("Vell")
    objective("Make orbit", "Board (E), lift off (SPACE), climb out of the air and burn until your periapsis clears it.")
  elseif name == "relay" then
    space.set_target("Vell")
    objective("Follow the signal to Vell", "TAB opens the System Board: target Vell and engage the autopilot (G). Land near the Under-Ice Relay and scan it.")
  elseif name == "fragments" then
    local nf = next_fragment()
    objective(string.format("Recover the signal fragments: %d/7", fragments()), nf and ("Next: " .. nf.name .. " on " .. nf.body .. ". The System Board recommends a route.") or "")
  elseif name == "nemesis" then
    space.set_target("Nemesis")
    objective("Reach the source", "Nemesis is plotted. Fly to THE PALE SIGNAL and scan it. Check your fuel plan first.")
  end
  set_waypoint_for_step()
  progress()
  save_now("step")
end

-- ------------------------------------------------------------ catalogue --
local function body_species(body)
  local list = {}
  for id, sp in pairs(SPECIES) do if sp.body == body then list[#list + 1] = id end end
  return list
end

local function check_completion(body)
  if S.completed[body] then return end
  for _, id in ipairs(body_species(body)) do if not S.known[id] then return end end
  S.completed[body] = true
  S.rp = S.rp + 45
  banner(string.upper(body) .. " CATALOGUE COMPLETE  +45 RP", 3, "anomaly")
  log_journal(body .. " catalogue complete", "Every catalogued species on " .. body .. " has been surveyed.", "species")
end

local function gain(kind, amount)
  S.res[kind] = (S.res[kind] or 0) + amount
  refresh_meters()
  if S.step == "fuel" then set_step("fuel") end
end

local function investigations()
  for _, inv in ipairs(INVESTIGATIONS) do
    if not S.civ.investigations[inv.id] then
      local all = true
      for _, id in ipairs(inv.ids) do if not S.civ.evidence[id] then all = false end end
      if all then
        S.civ.investigations[inv.id] = true
        S.rp = S.rp + inv.rp
        log_journal(inv.title, inv.text, "anomaly")
        banner("HISTORICAL INVESTIGATION COMPLETE  +" .. inv.rp .. " RP", 3.5, "anomaly")
      end
    end
  end
end

local function finish()
  S.ended = true
  phase = "end"
  close_menu()
  space.set_controls(false)
  objective("", "")
  local species, evidence, worlds = 0, 0, 0
  for _ in pairs(S.known) do species = species + 1 end
  for _ in pairs(S.civ.evidence) do evidence = evidence + 1 end
  for _ in pairs(S.visited) do worlds = worlds + 1 end
  log_journal("THE PALE SIGNAL", LANDMARKS["landmark:THE PALE SIGNAL"].text, "anomaly")
  for _, el in ipairs({ "EndPanel", "EndTitle", "EndText", "Again" }) do ui.set_visible(el, true) end
  ui.set_text("EndTitle", "THE SIGNAL WAS NEVER A MESSAGE")
  ui.set_text("EndText", string.format(
    "It is a receiver, older than every civilization that inherited its relays -- Talari, Ossuary, the Clades. Still listening.\n\nPlay time %d min · worlds visited %d · species %d · evidence %d · fragments %d/7 · %d RP · recoveries %d",
    math.floor(S.play / 60), worlds, species, evidence, fragments(), S.rp, S.deaths))
  save.set("expedition", "")
  host.send("announce", "Expedition complete.")
end

local function reveal_nemesis()
  if S.nemesis then return end
  S.nemesis = true
  space.call("reveal", "Nemesis")
  log_journal("Seven voices", "All seven fragments resolve into one carrier. It points beyond Hollow, at a world no survey has charted: Nemesis. The receiver is there.", "anomaly")
  banner("NEMESIS PLOTTED", 4, "anomaly")
  set_step("nemesis")
end

local function on_landmark(key, lm)
  S.landmarks[key] = true
  S.rp = S.rp + lm.rp
  banner(string.upper(lm.name) .. "  +" .. lm.rp .. " RP", 3, "anomaly")
  log_journal(lm.name, lm.text, "landmark")
  if lm.frag > 0 and not S.frags[lm.frag] then
    S.frags[lm.frag] = true
    lesson("fragment")
    banner(string.format("SIGNAL FRAGMENT %d/7", fragments()), 3.5, "anomaly")
    if fragments() >= 7 then reveal_nemesis()
    elseif S.step == "relay" and lm.name == "Under-Ice Relay" then
      log_journal("Under-Ice Relay", "Same black material as Kestra's foundation, intact, under forty metres of ice. Still transmitting -- not to Tethys. Outward. Six more relays answer it.", "anomaly")
      set_step("fragments")
    elseif S.step == "fragments" then set_step("fragments") end
  end
  if lm.name == "THE PALE SIGNAL" then finish() end
  publish_sites()
  save_now("landmark")
end

-- Scans arrive from the engine's scanner as on_ui("scan", key).
local function on_scan(key)
  progress()
  local atmo = key:match("^atmosphere:(.+)$")
  if atmo then
    if S.atmo[atmo] then return end
    S.atmo[atmo] = true
    lesson("air")
    local info = BODY_INFO[atmo]
    if info and info.breathable then
      banner("AIR VERIFIED -- AMBIENT INTAKE", 3, "good")
      log_journal("Atmosphere: " .. atmo, "Thin but breathable, " .. info.temp .. ". Filtered ambient intake engaged; the O2 reserve is spared.", "note")
      if atmo == "Tethys" then
        -- Radio traffic resolves once the air is understood.
        log_journal("Uncatalogued radio traffic", "Weather reports, river schedules and many distinct voices. Tethys is inhabited. The nearest carrier comes from Kestra Reach.", "anomaly")
        discover_site("kestra", "radio")
        discover_site("kestra_pad", "radio")
      end
    else
      banner("ATMOSPHERE: NOT BREATHABLE", 3, "warn")
      log_journal("Atmosphere: " .. atmo, "Unsafe to breathe. The suit stays sealed on its O2 reserve.", "warn")
    end
    if S.step == "air" then set_step("survey") end
    return
  end
  local ice = key:match("^ice:(%d+)$")
  if ice then
    local n = tonumber(ice)
    if not S.ice[n] then
      S.ice[n] = true
      local id = ICE[n] and world.find(ICE[n].name)
      if id then world.destroy(id) end
      ui.clear_marker("ice" .. ice)
      sound.play("pickup")
      banner("VOLATILE ICE  +6 VOLATILES", 1.8, "good")
      gain("volatiles", 6)
    end
    return
  end
  local clade = key:match("^clade:(.+)$")
  if clade then return end
  local sp = SPECIES[key]
  if sp and not S.known[key] then
    S.known[key] = true
    S.rp = S.rp + sp.rp
    -- A clean, confident scan is worth a little more.
    if confidence >= 0.85 then S.rp = S.rp + 2 end
    lesson("specimen")
    host.send("catalogued", key)
    banner(string.upper(sp.name) .. "  +" .. sp.rp .. " RP  +" .. sp.y .. " " .. string.upper(sp.yield), 2.2, "good")
    log_journal(sp.name .. " (" .. sp.body .. ", " .. sp.cls .. ")", sp.text, "species")
    gain(sp.yield, sp.y)
    check_completion(sp.body)
  end
  local ev = EVIDENCE[key]
  if ev and not S.civ.evidence[key] then
    S.civ.evidence[key] = true
    S.rp = S.rp + ev.rp
    learn(ev.lang, ev.gain)
    if ev.protected then rep(ev.lang == "hollow" and "hollow" or "preservation", 1) end
    banner(string.upper(ev.name) .. "  +" .. ev.rp .. " RP", 2.2, "good")
    log_journal(ev.name .. " -- " .. ev.era, ev.text .. " Translation confidence: " .. stage(ev.lang) .. ".", "culture")
    if ev.movable then hint("Protected artifact: stand beside it and press E to decide what to do.", 6) end
    investigations()
    if S.step == "survey" and S.civ.evidence.te_gate_layer and S.civ.first then set_step("fuel") end
  end
  local lm = LANDMARKS[key]
  if lm and not S.landmarks[key] then on_landmark(key, lm) end
  refresh_meters()
  save_now("discovery")
end

-- ---------------------------------------------------------- the panels --
local function journal_menu(page, filter)
  page, filter = page or 1, filter or "all"
  local FILTERS = { "all", "species", "culture", "site", "landmark", "anomaly", "warn" }
  open_menu({
    build = function(m)
      local list = {}
      for k = #S.journal, 1, -1 do
        local e = S.journal[k]
        if filter == "all" or e.c == filter then list[#list + 1] = e end
      end
      local pages = math.max(1, math.ceil(#list / 4))
      page = clamp(page, 1, pages)
      local lines = {}
      for k = (page - 1) * 4 + 1, math.min(#list, page * 4) do
        local e = list[k]
        lines[#lines + 1] = "[" .. string.upper(e.c) .. "] " .. e.t .. "\n" .. e.b
      end
      m.title = string.format("FIELD JOURNAL  ·  %s  ·  page %d/%d", string.upper(filter), page, pages)
      m.body = #lines > 0 and table.concat(lines, "\n\n") or "Nothing recorded yet."
      m.buttons = {
        { "Newer", function() page = page - 1 end },
        { "Older", function() page = page + 1 end },
        { "Filter: " .. filter, function()
          for k, f in ipairs(FILTERS) do if f == filter then filter = FILTERS[k % #FILTERS + 1] break end end
          page = 1
        end },
      }
    end,
  })
end

local function upgrade_cost(u, l) return u.base + l * u.step end
local function upgrades_menu(page)
  page = page or 1
  open_menu({
    build = function(m)
      local lines = { string.format("Research points: %d", S.rp) }
      m.buttons = {}
      for k, u in ipairs(UPGRADES) do
        local l = S.upg[u.id]
        local label = l >= u.max and string.format("%s  MAX", u.name)
          or string.format("%s %d/%d -- " .. u.desc .. " (%d RP)", u.name, l, u.max, (l + 1) * u.per, upgrade_cost(u, l))
        lines[#lines + 1] = label
        local first = (page - 1) * 5 + 1
        if k >= first and k < first + 5 then
          m.buttons[#m.buttons + 1] = { u.name, function()
            local lv = S.upg[u.id]
            if lv >= u.max then return end
            local cost = upgrade_cost(u, lv)
            if S.rp < cost then return hint(string.format("%s needs %d RP -- scan and research more.", u.name, cost), 3) end
            S.rp = S.rp - cost
            S.upg[u.id] = lv + 1
            apply_upgrades()
            banner(string.upper(u.name) .. " " .. S.upg[u.id], 2, "good")
            refresh_meters()
            save_now("upgrade")
          end }
        end
      end
      m.buttons[6] = { page == 1 and "More upgrades" or "Back", function() page = page == 1 and 2 or 1 end }
      m.title = "SHIP UPGRADES"
      m.body = table.concat(lines, "\n")
    end,
  })
end

local function near_ship(st)
  st = st or space.state()
  if not st then return false end
  if st.piloting then return st.landed end
  local ship = world.find("Ship")
  local sx, _, sz = world.position(ship)
  return st.landed and sx and dist2d(player, sx, sz) < 14
end

local function ship_menu()
  open_menu({
    build = function(m)
      local st = space.state()
      local ok = near_ship(st)
      m.title = "SHIP SERVICES"
      m.body = string.format(
        "Fuel %d/%d · hull %d/%d · emergency reserve %s\nEngine %d%% · RCS %d%% · gear %d%% · scanner %d%%\nOre %d · biomass %d · volatiles %d\n\n%s",
        math.floor(st.fuel), math.floor(st.fuel_max), math.floor(st.hull), math.floor(st.hull_max), S.reserve and "used" or "ready (B, under 35%)",
        math.floor(st.engine or 100), math.floor(st.rcs or 100), math.floor(st.gear or 100), math.floor(st.scanner or 100),
        S.res.ore, S.res.biomass, S.res.volatiles,
        ok and "Landed at the ship: services available." or "Land and stand beside the ship (or sit in it) to use services.")
      local function need(kind, n)
        if not ok then hint("Land at the ship first.", 3) return false end
        if (S.res[kind] or 0) < n then hint(string.format("Needs %d %s.", n, kind), 3) return false end
        S.res[kind] = S.res[kind] - n
        refresh_meters()
        return true
      end
      m.buttons = {
        { "Refine 6 volatiles -> 12 fuel", function()
          if need("volatiles", 6) then space.refuel(12) lesson("refine") banner("REFINED  +12 FUEL", 2, "good")
            if S.step == "fuel" then set_step("launch") end end end },
        { "Analyse 12 biomass -> 8 RP", function() if need("biomass", 12) then S.rp = S.rp + 8 banner("BIOLOGICAL ANALYSIS  +8 RP", 2, "good") end end },
        { "Assay 20 ore -> 6 RP", function() if need("ore", 20) then S.rp = S.rp + 6 banner("ORE ASSAY  +6 RP", 2, "good") end end },
        { "Analyse 18 volatiles -> 6 RP", function() if need("volatiles", 18) then S.rp = S.rp + 6 banner("VOLATILE ANALYSIS  +6 RP", 2, "good") end end },
        { "Repair hull: 6 ore -> +20", function() if need("ore", 6) then space.repair(20) banner("HULL REPAIRED", 2, "good") end end },
        { "Service parts: 8 ore -> +25", function()
          if need("ore", 8) then for _, p in ipairs({ "engine", "rcs", "gear", "scanner" }) do space.call("part", p, 25) end
            apply_scanner() banner("COMPONENTS SERVICED", 2, "good") end end },
      }
    end,
  })
end

local INSTITUTIONS = { "concord", "commons", "meridian", "preservation", "hollow" }
local function culture_menu(page)
  page = page or 1
  lesson("culture")
  open_menu({
    build = function(m)
      local lines = {}
      if page == 1 then
        lines[#lines + 1] = string.format("Languages: Talari %d%% %s · Ossuary %d%% %s · Clade resonance %d%% %s",
          math.floor(S.civ.lang.talari), stage("talari"), math.floor(S.civ.lang.ossuary), stage("ossuary"), math.floor(S.civ.lang.hollow), stage("hollow"))
        local reps = {}
        for _, inst in ipairs(INSTITUTIONS) do reps[#reps + 1] = string.format("%s %+d", inst, S.civ.rep[inst] or 0) end
        lines[#lines + 1] = "Reputation: " .. table.concat(reps, " · ")
        local contacts = 0
        for _ in pairs(S.civ.contacts) do contacts = contacts + 1 end
        lines[#lines + 1] = string.format("Contacts: %d of %d · legal landings %d · landing offences %d", contacts, #NPCS + #CLADES, S.civ.legal, S.civ.offences)
        lines[#lines + 1] = ""
        for _, inv in ipairs(INVESTIGATIONS) do
          local have = 0
          for _, id in ipairs(inv.ids) do if S.civ.evidence[id] then have = have + 1 end end
          lines[#lines + 1] = string.format("%s %s  %d/%d", S.civ.investigations[inv.id] and "✓" or "·", inv.title, have, #inv.ids)
        end
        lines[#lines + 1] = ""
        local sites = {}
        for id, s in pairs(SITES) do if S.civ.discovered[id] then sites[#sites + 1] = s.name end end
        table.sort(sites)
        lines[#lines + 1] = "Known places: " .. (#sites > 0 and table.concat(sites, ", ") or "none yet")
      else
        local eras = {}
        for id, ev in pairs(EVIDENCE) do
          if S.civ.evidence[id] then
            eras[ev.era] = eras[ev.era] or {}
            table.insert(eras[ev.era], ev.name .. (ev.movable and (S.civ.artifacts[id] and (" (" .. S.civ.artifacts[id] .. ")") or " (undecided)") or ""))
          end
        end
        local names = {}
        for era in pairs(eras) do names[#names + 1] = era end
        table.sort(names)
        for _, era in ipairs(names) do lines[#lines + 1] = string.upper(era) .. ": " .. table.concat(eras[era], "; ") end
        if #names == 0 then lines[#lines + 1] = "No evidence recorded yet. Scan inscriptions, murals, archives and resonators." end
      end
      m.title = page == 1 and "CULTURE RECORD" or "CULTURE RECORD  ·  EVIDENCE BY ERA"
      m.body = table.concat(lines, "\n")
      m.buttons = { { page == 1 and "Evidence by era" or "Overview", function() page = page == 1 and 2 or 1 end } }
    end,
  })
end

local STATUS = { [0] = "OK", [1] = "MARGINAL", [2] = "INSUFFICIENT" }
local function board_bodies()
  local list = {}
  local r = space.call("bodies")
  if r and r.text then for name in r.text:gmatch("[^\n]+") do list[#list + 1] = name end end
  return list
end
local function board_menu()
  lesson("board")
  open_menu({
    build = function(m)
      local st = space.state()
      local names = board_bodies()
      board_index = clamp(board_index, 1, math.max(1, #names))
      local recommended = recommended_body()
      local lines = {}
      for k, name in ipairs(names) do
        local b = space.body(name)
        local plan = space.call("plan", name)
        local closing = space.call("body", name)
        local info = BODY_INFO[name] or {}
        lines[#lines + 1] = string.format("%s%s %-8s %9s  %+6.0f m/s  %s%s",
          k == board_index and "> " or "  ", st and st.target == name and "[T]" or "   ", name,
          b and km(math.max(0, b.altitude)) or "?", plan and plan[2] or 0,
          plan and (STATUS[plan[5]] or "?") or "?", name == recommended and "  ★ recommended" or "")
        if k == board_index and plan then
          lines[#lines + 1] = string.format("      plan: Δv %.0f m/s · fuel %.0f of %.0f · %s %s · %s", plan[3], plan[4], st.fuel,
            info.temp or "", info.hazard and info.hazard ~= "none" and ("hazard: " .. info.hazard) or "", info.desc or "")
        end
        local _ = closing
      end
      m.title = "SYSTEM BOARD  ·  " .. (st and st.body or "")
      m.body = table.concat(lines, "\n") .. "\n\nThe recommended target is the expedition's next goal. OK leaves a quarter of the tank spare."
      m.buttons = {
        { "Previous body", function() board_index = board_index - 1 end },
        { "Next body", function() board_index = board_index + 1 end },
        { "Set as NAV target", function()
          local name = names[board_index]
          if name then space.set_target(name) banner("NAV TARGET: " .. string.upper(name), 2) end end },
        { "Engage autopilot (G)", function()
          local name = names[board_index]
          if name then space.set_target(name) end
          if space.call("autopilot", "", 1) then banner("NAV AUTOPILOT ENGAGED", 2, "good") close_menu()
          else hint("Autopilot: lift off first, with a target set.", 3) end end },
        { "System map (M)", function() host.send("map", "system") close_menu() end },
      }
    end,
  })
end

local academy_page = 1
local function academy_menu()
  open_menu({
    build = function(m)
      if academy_page > #ACADEMY then
        local lines = {}
        for _, l in ipairs(LESSONS) do lines[#lines + 1] = (S.lessons[l[1]] and "✓ " or "· ") .. l[2] end
        m.title = "SURVEY ACADEMY  ·  PLAYABLE COURSE"
        m.body = "Lessons complete as you do them:\n\n" .. table.concat(lines, "\n")
      else
        local p = ACADEMY[academy_page]
        m.title = string.format("SURVEY ACADEMY  ·  %s  (%d/%d)", p[1], academy_page, #ACADEMY)
        m.body = p[2]
      end
      m.buttons = {
        { "Previous page", function() academy_page = (academy_page - 2) % (#ACADEMY + 1) + 1 end },
        { "Next page", function() academy_page = academy_page % (#ACADEMY + 1) + 1 end },
        { "Course progress", function() academy_page = #ACADEMY + 1 end },
      }
    end,
  })
end

local function controls_menu()
  open_menu({
    title = "CONTROLS",
    body = "ON FOOT  WASD move · mouse look (drag) · Shift sprint · E interact (talk, use, harvest, board) · hold F scan; look up into open sky to sample the air · H helmet · L suit light · R prospect for fuel / ore / biomass\n\n"
      .. "FLIGHT  W/S throttle · Shift full · X cut · click, then the mouse steers (F10 to change) · arrows or IJKL pitch and yaw (A/D yaw) · Q/E roll · Space/C lift and sink · T stabilized/manual · N NAV mode · G autopilot to target · B emergency reserve · 9/0 time warp\n\n"
      .. "PANELS  J journal · U upgrades · I ship services · Y culture record · TAB system board · M map · F1 controls · F2 Survey Academy · F10 settings · P pause · Esc close · 1-6 choose",
  })
end

-- What standing does to a price: -100 .. +100 standing is 1.6x .. 0.6x.
local function price_factor(standing)
  return math.max(0.6, math.min(1.6, 1 - standing / 100 * 0.4 - (standing < 0 and -standing / 100 * 0.2 or 0)))
end

local INSTITUTION = { commons = "Commons", concord = "Concord", meridian = "Meridian", hollow = "Hollow clades", preservation = "Preservation" }
local function has(list, x)
  for _, v in ipairs(list or {}) do if v == x then return true end end
  return false
end

-- A station's services, priced by the standing of the institution that runs
-- it (0.76.0; the Commons alone before).
local function workshop_menu(kind)
  local station = STATIONS[kind]
  local inst = station.inst or "commons"
  open_menu({
    build = function(m)
      local standing = S.civ.rep[inst] or 0
      m.title = station.name
      m.body = string.format("Ore %d · biomass %d · volatiles %d\n%s standing %+d", S.res.ore, S.res.biomass, S.res.volatiles, INSTITUTION[inst] or inst, standing)
      m.buttons = {}
      local trades = has(station.services, "trade") or has(station.services, "repair")
      if trades and standing < -40 then
        m.body = m.body .. "\n\nThe keepers turn away. Nobody here will trade with you until the " .. (INSTITUTION[inst] or inst) .. "' trust is earned back."
        return
      end
      local cost = function(base) return math.max(1, math.floor(base * price_factor(standing) + 0.5)) end
      if standing ~= 0 then
        m.body = m.body .. string.format("\nPrices %s (%+d%%)", standing > 0 and "eased for a friend" or "raised for a stranger", math.floor((price_factor(standing) - 1) * 100 + 0.5))
      end
      if has(station.services, "repair") then
        local ore, bio = cost(8), cost(4)
        m.buttons[#m.buttons + 1] = { string.format("Full service: %d ore + %d biomass", ore, bio), function()
          if S.res.ore < ore or S.res.biomass < bio then return hint(string.format("The workshop needs %d ore and %d biomass.", ore, bio), 3) end
          S.res.ore, S.res.biomass = S.res.ore - ore, S.res.biomass - bio
          space.repair(32)
          for _, p in ipairs({ "engine", "rcs", "gear" }) do space.call("part", p, 18) end
          rep(inst, 2)
          banner("LOCAL WORKSHOP REPAIRS COMPLETE", 2.5, "good")
          refresh_meters()
        end }
      end
      if has(station.services, "trade") then
        local bio = cost(6)
        m.buttons[#m.buttons + 1] = { string.format("Trade %d biomass -> 8 volatiles", bio), function()
          if S.res.biomass < bio then return hint(string.format("Needs %d biomass.", bio), 3) end
          S.res.biomass, S.res.volatiles = S.res.biomass - bio, S.res.volatiles + 8
          rep(inst, 1)
          banner("TRADE COMPLETE  +8 VOLATILES", 2, "good")
          refresh_meters()
          if S.step == "fuel" then set_step("fuel") end
        end }
        local ore = cost(10)
        m.buttons[#m.buttons + 1] = { string.format("Trade %d ore -> 6 biomass", ore), function()
          if S.res.ore < ore then return hint(string.format("Needs %d ore.", ore), 3) end
          S.res.ore, S.res.biomass = S.res.ore - ore, S.res.biomass + 6
          rep(inst, 1)
          banner("TRADE COMPLETE  +6 BIOMASS", 2, "good")
          refresh_meters()
        end }
      end
      if has(station.services, "archive") then
        -- Friends get the archivists' time sooner (72 s at best, 192 s at worst).
        local wait = math.floor(120 * price_factor(standing) + 0.5)
        m.buttons[#m.buttons + 1] = { string.format("Bilingual archive session (every %d s)", wait), function()
          if standing < -10 then return hint("Meridian archive access restricted.", 3) end
          if (S.archive_at or 0) > S.play then return hint("The archivists are busy. Come back later.", 3) end
          S.archive_at = S.play + wait
          learn("talari", 5)
          S.rp = S.rp + 4
          banner("ARCHIVE SESSION  +5 LANGUAGE  +4 RP", 2.5, "good")
          refresh_meters()
        end }
      end
    end,
  })
end

local function artifact_menu(id)
  local ev = EVIDENCE[id]
  open_menu({
    title = "PROTECTED ARTIFACT: " .. string.upper(ev.name),
    body = ev.text .. "\n\nThe scanner flags living cultural ownership. You can document it where it lies, or take it for analysis. Either choice is recorded.",
    buttons = {
      { "Document in situ (+5 RP)", function()
        S.civ.artifacts[id] = "left"
        rep("preservation", 6)
        rep("commons", 3)
        S.rp = S.rp + 5
        banner("ARTIFACT DOCUMENTED IN SITU  +5 RP", 2.5, "good")
        log_journal("Artifact left in situ: " .. ev.name, "Fully documented and left where it was found. Preservation staff later acknowledge the record.", "culture")
        close_menu()
        save_now("ethics")
      end },
      { "Take it (+20 RP)", function()
        S.civ.artifacts[id] = "taken"
        rep("preservation", -20)
        rep("commons", -12)
        S.rp = S.rp + 20
        local e = world.find(ev.name)
        if e then world.destroy(e) end
        banner("PROTECTED ARTIFACT REMOVED -- REPUTATION DAMAGED", 3, "bad")
        log_journal("Artifact removed: " .. ev.name, "You removed a protected burial object after the scanner identified living cultural ownership. The sample is useful. The social meaning of the act is worse.", "warn")
        close_menu()
        save_now("ethics")
      end },
    },
  })
end

-- ------------------------------------------------------------ talking --
local function show_talk(who, lang)
  talking = who
  talk_until = time.now + 10
  for _, el in ipairs({ "TalkPanel", "TalkName", "TalkLine" }) do ui.set_visible(el, who ~= nil) end
  if who then
    ui.set_text("TalkName", who.name .. "  ·  " .. who.role .. "  ·  " .. string.upper(stage(lang)))
    ui.set_text("TalkLine", translated(who.line, lang))
  end
end

local function talk(npc)
  local first = not S.civ.contacts[npc.id]
  S.civ.contacts[npc.id] = (S.civ.contacts[npc.id] or 0) + 1
  local lang = npc.inst == "hollow" and "hollow" or "talari"
  if first then
    learn(lang, 5)
    rep(npc.inst, 2)
    S.rp = S.rp + 3
  end
  if lang == "talari" and not S.civ.first then
    S.civ.first = true
    learn("talari", 8)
    rep("concord", 3)
    lesson("contact")
    log_journal("First contact -- Kestra Reach", "Communication begins with names, pointing, repeated phrases and patient correction rather than instant translation.", "anomaly")
    banner("FIRST CONTACT -- TALARI LANGUAGE MODEL STARTED", 3, "anomaly")
    -- The Concord shares public routes once contact is made.
    for id, s in pairs(SITES) do if s.public then discover_site(id, "radio") end end
    log_journal("Tethys public navigation exchange", "The Concord network provides public bearings for Darsa Delta and Meridian Spur. Archaeological and protected sites are not included.", "site")
    if S.step == "survey" and S.civ.evidence.te_gate_layer then set_step("fuel") end
  end
  show_talk(npc, lang)
  refresh_meters()
end

-- ------------------------------------------------------- interaction --
-- The nearest thing E would act on, by priority: people, stations,
-- artifacts, a catalogued specimen to harvest, then the ship.
local function interaction(st)
  if st.piloting then return nil end
  local here = current_site(st)
  local best
  local function consider(kind, label, d, reach, data, priority)
    if d < reach and (not best or priority < best.priority or (priority == best.priority and d < best.d)) then
      best = { kind = kind, label = label, d = d, data = data, priority = priority }
    end
  end
  for _, npc in ipairs(NPCS) do
    if (npc.site == "kestra" and here == "home") or npc.site == here then
      local id = world.find(npc.name)
      if id then
        local x, _, z = world.position(id)
        consider("npc", "Talk to " .. npc.name, dist2d(player, x, z), 3.5, npc, 1)
      end
    end
  end
  if here == "hollow_enclave" then
    for _, c in ipairs(CLADES) do
      local id = world.find(c.name)
      if id then
        local x, _, z = world.position(id)
        consider("npc", "Listen to the " .. c.name, dist2d(player, x, z), 4, c, 1)
      end
    end
  end
  for kind, s in pairs(STATIONS) do
    if s.site == here then consider("station", "Use the " .. s.name, dist2d(player, s.x, s.z), 4, kind, 2) end
  end
  for id, ev in pairs(EVIDENCE) do
    if ev.movable and S.civ.evidence[id] and not S.civ.artifacts[id] and site_active(ev.site, st) then
      consider("artifact", "Decide: " .. ev.name, dist2d(player, ev.x, ev.z), 4, id, 3)
    end
  end
  if near_harvest ~= "" and SPECIES[near_harvest] then
    consider("harvest", "Harvest " .. SPECIES[near_harvest].name, 1, 2, near_harvest, 4)
  end
  local ship = world.find("Ship")
  local sx, _, sz = world.position(ship)
  if sx and st.landed then consider("ship", "Board the ship", dist2d(player, sx, sz), 10, nil, 5) end
  return best
end

local function interact(st)
  local it = interaction(st)
  if not it then return end
  progress()
  if it.kind == "npc" then talk(it.data)
  elseif it.kind == "station" then workshop_menu(it.data)
  elseif it.kind == "artifact" then artifact_menu(it.data)
  elseif it.kind == "harvest" then host.send("harvest", it.data)
  elseif it.kind == "ship" then space.board() end
end

-- ------------------------------------------------------------ the world --
local function despawn()
  for _, id in ipairs(spawned) do if world.alive(id) then world.destroy(id) end end
  spawned, spawned_prefab = {}, {}
end

-- Wildlife for whatever world the frame is on (away from home and sites).
-- `behind` (0.76.0, after a reframe while walking): the herds come in out of
-- sight -- well back and to the sides of the way the walker is heading --
-- instead of appearing in view.
local function release_fauna(body, behind)
  despawn()
  local kinds = FAUNA[body]
  if not kinds or not player then return end
  local px, py, pz = world.position(player)
  if not px then
    local ship = world.find("Ship")
    px, py, pz = world.position(ship)
  end
  if not px then return end
  -- A reload on the same world brings back the herds that were there,
  -- where they stood relative to the walker (0.76.0).
  local kept = S.fauna
  S.fauna = nil
  if kept and kept.body == body and not behind then
    for _, f in ipairs(kept.list or {}) do
      local id = world.spawn(f.prefab, px + f.dx, py + 3, pz + f.dz)
      if id then
        spawned[#spawned + 1] = id
        spawned_prefab[id] = f.prefab
      end
    end
    if #spawned > 0 then return end
  end
  local heading
  if behind then
    local vx, _, vz = world.velocity(player)
    if vx and vx * vx + vz * vz > 0.25 then heading = math.atan(vz, vx) end
  end
  for h = 1, 2 do
    local prefab = kinds[(h - 1) % #kinds + 1]
    local a = math.random() * math.pi * 2
    local r = 70 + math.random() * 80
    if behind then
      r = 160 + math.random() * 80
      if heading then a = heading + math.pi + (h == 1 and -1 or 1) * (0.5 + math.random() * 0.7) end
    end
    local cx, cz = px + math.cos(a) * r, pz + math.sin(a) * r
    for _ = 1, (prefab == "Drifter" and 2 or 4) do
      local id = world.spawn(prefab, cx + (math.random() - 0.5) * 12, py + 3, cz + (math.random() - 0.5) * 12)
      if id then
        spawned[#spawned + 1] = id
        spawned_prefab[id] = prefab
      end
    end
  end
end

local function frame_changed(st)
  local info = BODY_INFO[st.frame] or {}
  host.send("dust", (info.dust or "#d8cfb8") .. " " .. (info.dustDensity or 0.4))
  host.send("soft", info.soft and "1" or "0")
  host.send("sky_scan", "atmosphere:" .. st.frame)
  local here = current_site(st)
  home_markers(here == "home")
  if here == "" then release_fauna(st.frame) else despawn() end
  if here ~= "" and here ~= "home" then discover_site(here, "field") end
  if not S.visited[st.frame] then
    S.visited[st.frame] = true
    log_journal("Landfall: " .. st.frame, (info.desc or "") .. " Surface " .. (info.temp or "?") .. ".", "note")
  end
end

-- Landing near a settlement (Tethys, and the Third Mooring on Hollow): on
-- its field it's welcome; elsewhere engine wash over houses is an offence.
-- On Ossuary's archaeology sites, setting down on the ruins themselves
-- damages them.
local FIELDS = { home = { 0, 0, 20 }, darsa_delta = { -216, -90, 20 }, meridian_spur = { 252, 54, 20 }, hollow_enclave = { -160, 60, 20 } }
local HERITAGE = { ossuary_archive = { 0, 0, 110 }, ossuary_transit = { 0, 0, 110 } }
local function landing_law(st)
  local here = current_site(st)
  local h = HERITAGE[here]
  if h then
    if math.sqrt((st.x - h[1]) ^ 2 + (st.z - h[2]) ^ 2) < h[3] then
      S.civ.offences = S.civ.offences + 1
      rep("preservation", -6)
      banner("LANDING ON A HERITAGE SITE -- SET DOWN CLEAR OF THE RUINS", 3, "bad")
      log_journal("Heritage damage", "The ship came down inside the archive's footprint. Engine wash and the gear's weight disturbed fallen masonry the Preservation Office had mapped stone by stone.", "warn")
    end
    return
  end
  local f = FIELDS[here]
  if not f then return end
  local d = math.sqrt((st.x - f[1]) ^ 2 + (st.z - f[2]) ^ 2)
  if d <= f[3] then
    S.civ.legal = S.civ.legal + 1
    if S.civ.legal == 2 then
      rep("concord", 4)
      banner("LANDING CONTROL -- FIELD ENTRY ACCEPTED", 2.5, "good")
      log_journal("Legal landfall", "The ship touched down on the marked field outside the inhabited zone. Local traffic continued around the vessel instead of scattering.", "site")
    end
  elseif d < 450 then
    S.civ.offences = S.civ.offences + 1
    rep("concord", -7)
    rep("commons", -3)
    banner("UNAUTHORIZED SETTLEMENT LANDING -- USE THE MARKED FIELD", 3, "bad")
    log_journal("Landing violation", "Engine wash crossed an inhabited zone. " .. (here == "hollow_enclave" and "Mooring" or "Concord") .. " control logged the landing as unsafe. Public landing fields exist for a reason.", "warn")
  end
end

-- Tethys storms: rain, fog, crosswind, scanner interference.
local function weather(st, dt)
  local tethys = st.frame == "Tethys" or st.body == "Tethys"
  if not tethys then
    if storm.level > 0 then
      storm.level = 0
      host.send("weather", "0 0 0 0")
      space.call("wind", "", 0, 0, 0)
      host.send("audio", "rain 0")
    end
    return
  end
  local target = 0
  if S.play > storm.next and storm.until_t == 0 then
    storm.until_t = S.play + 100
    hint("Weather: a storm is crossing Kestra. Rain lowers scanner confidence.", 5)
  end
  if storm.until_t > 0 then
    target = 1
    if S.play > storm.until_t then
      storm.until_t = 0
      storm.told = false
      storm.next = S.play + 360 + math.random() * 240
    end
  end
  storm.level = storm.level + (target - storm.level) * math.min(1, dt * 0.08)
  local l = storm.level
  if l < 0.01 and target == 0 then return end
  local wind = l * 14
  -- Shelter (0.75.0): under a roof the rain stops; in the lee of a wall,
  -- a building or the ground upwind the crosswind does.
  local roof, lee = false, false
  if not st.piloting and player and l > 0.2 then
    storm.check = (storm.check or 0) - dt
    if storm.check <= 0 then
      storm.check = 0.25
      local x, y, z = world.position(player)
      if x then
        local hit = world.raycast(x, y + 1.2, z, 0, 1, 0, 25)
        roof = hit ~= nil and hit ~= "ground" and hit ~= player
        local ux, uz = -0.928, -0.371 -- upwind (the storm blows toward +x, +z)
        local h2 = world.raycast(x + ux * 0.6, y + 0.4, z + uz * 0.6, ux, 0, uz, 6)
        lee = h2 ~= nil and h2 ~= player
      end
      storm.roof, storm.lee = roof, lee
    else
      roof, lee = storm.roof, storm.lee
    end
  end
  local sheltered = roof or lee
  if sheltered and not storm.told then
    storm.told = true
    hint(roof and "Sheltered: under cover the rain can't reach the suit or the scanner." or "Sheltered: out of the wind behind cover.", 3)
  end
  local rain = roof and l * 0.12 or l
  host.send("weather", string.format("%.2f %.2f %.1f %.1f", rain, l * 0.6, wind, wind * 0.4))
  space.call("wind", "", wind, 0, wind * 0.4)
  host.send("audio", string.format("rain %.2f", roof and l * 0.45 or l))
  -- The crosswind leans on a walker in the open.
  if not st.piloting and player and l > 0.2 and not sheltered then
    local x, y, z = world.position(player)
    if x then world.set_position(player, x + wind * 0.004, y, z + wind * 0.0016) end
  end
end

-- Ambience by context: wind (the view scales it by air), settlement murmur
-- near people, wildlife in the wild, the signal hum near structures.
-- Music (0.75.0): the generative score's mood follows what you're doing.
local music_mood, music_clock = "", 0
local function music(st, dt)
  local mood
  local hour = ((st.time - 3498) / 969 * 24 + 12) % 24
  if S.ended then mood = "space"
  elseif st.frame == "Nemesis" or st.body == "Nemesis" then mood = "signal"
  elseif st.piloting and not st.landed then mood = (st.altitude or 0) > 25000 and "space" or "flight"
  elseif storm.level > 0.5 and st.frame == "Tethys" then mood = "tension"
  elseif st.frame == "Tethys" and (hour < 6 or hour > 19.5) then mood = "night"
  else mood = "explore" end
  music_clock = music_clock - dt
  if mood ~= music_mood or music_clock <= 0 then
    music_mood, music_clock = mood, 5
    host.send("music", mood)
  end
end

-- Sliding doors (0.76.0): a hall's door slides aside while the walker or
-- one of the town's people is near it, and closes behind them. Closed
-- positions are read in the frame the site is in, so they're forgotten when
-- the frame changes.
local PEOPLE = { Talari = true, ["Stall Keeper"] = true, Neighbour = true }
for _, n in ipairs(NPCS) do PEOPLE[n.name] = true end
local door_state = { frame = nil, at = {}, open = {}, check = 0 }
local function doors(st, dt)
  local here = current_site(st)
  local frame = (st.frame or "") .. ":" .. here
  if door_state.frame ~= frame then door_state = { frame = frame, at = {}, open = {}, check = 0 } end
  door_state.check = door_state.check - dt
  if door_state.check > 0 then return end
  door_state.check = 0.15
  for _, d in ipairs(DOORS) do
    if d.site == here then
      local id = world.find(d.name)
      if id then
        local at = door_state.at[d.name]
        if not at then
          local x, y, z = world.position(id)
          if x then at = { x = x, y = y, z = z }; door_state.at[d.name] = at end
        end
        if at then
          local near = false
          for _, other in ipairs(world.overlap(at.x, at.y, at.z, 3.2)) do
            if other == player or PEOPLE[world.name(other) or ""] then near = true break end
          end
          local open = door_state.open[d.name] or 0
          open = math.max(0, math.min(1, open + (near and 1 or -1) * 0.3))
          if open ~= door_state.open[d.name] then
            door_state.open[d.name] = open
            world.set_position(id, at.x + d.dx * open, at.y, at.z + d.dz * open)
          end
        end
      end
    end
  end
end

local function ambience(st)
  local here = current_site(st)
  local settlement = 0
  if here == "home" and player then
    local d = dist2d(player, SITES.kestra.x, SITES.kestra.z)
    settlement = clamp(1 - d / 260, 0, 1)
  elseif here == "darsa_delta" or here == "meridian_spur" or here == "hollow_enclave" then settlement = 0.8 end
  host.send("audio", string.format("settlement %.2f", settlement))
  host.send("audio", string.format("wind %.2f", st.piloting and 0.2 or 0.7))
  local alive = (st.frame == "Tethys" or st.frame == "Hollow") and settlement < 0.5 and not st.piloting
  host.send("audio", string.format("wildlife %.2f", alive and 0.6 or 0))
  local hum = 0
  local body = BODY_INFO[st.frame] and st.frame
  if body then
    local b = space.body(body)
    for _, lm in pairs(LANDMARKS) do
      if lm.body == body and b then
        local d = arc(st.latitude, st.longitude, lm.lat, lm.lon, b.radius)
        hum = math.max(hum, clamp(1 - d / 2500, 0, 1))
      end
    end
  end
  host.send("audio", string.format("signal %.2f", hum))
end

-- -------------------------------------------------------- the suit --
local function suit(st, dt)
  local info = BODY_INFO[st.frame] or {}
  local verified = S.atmo[st.frame]
  local ambient = info.breathable and verified
  local life = 1 + 0.3 * S.upg.life
  local s = S.suit
  if ambient then
    s.o2 = math.min(1, s.o2 + dt * 0.2)
    ui.set_text("O2Label", helmet and "AIR: AMBIENT INTAKE" or "AIR: HELMET OFF")
  else
    s.o2 = s.o2 - dt / (180 * life)
    ui.set_text("O2Label", string.format("SUIT O2 RESERVE %d%%", math.max(0, math.floor(s.o2 * 100))))
  end
  -- Hazards wear the suit.
  local rate = (info.rate or 0) * 0.4 / life
  if storm.level > 0.5 and st.frame == "Tethys" then rate = rate + 0.05 end
  if rate > 0 then
    s.integrity = math.max(0, s.integrity - rate * dt)
    if s.integrity < 35 then hint(string.upper(info.hazard or "") .. " EXPOSURE: suit integrity " .. math.floor(s.integrity) .. "%. Return to the ship.", 1) end
  end
  if s.integrity <= 0 then s.vitals = s.vitals - 4 * dt end
  if s.o2 <= 0 then
    s.o2 = 0
    s.vitals = s.vitals - 6 * dt
  end
  if s.integrity > 0 and s.o2 > 0 then s.vitals = math.min(100, s.vitals + dt * 0.5) end
  ui.set_text("SuitLabel", string.format("SUIT INTEGRITY %d%%%s", math.floor(s.integrity), info.hazard ~= "none" and info.hazard and (" · " .. string.upper(info.hazard)) or ""))
  ui.set_text("VitalsLabel", string.format("VITALS %d%%", math.floor(s.vitals)))
  -- The visor (0.75.0): frost in the cold, shimmer in the heat, cracks as
  -- the suit fails.
  visor_clock = visor_clock - dt
  if visor_clock <= 0 then
    visor_clock = 0.2
    local cold = info.hazard == "cryo" and 0.35 + 0.5 * (1 - s.integrity / 100) or 0
    local hot = info.hazard == "thermal" and 0.3 + 0.5 * (1 - s.integrity / 100) or 0
    host.send("visor", string.format("%d %.2f %.2f %.2f", (helmet and not st.piloting) and 1 or 0, s.integrity / 100, cold, hot))
  end
  ui.set_value("O2Bar", math.max(0, s.o2))
  ui.set_value("SuitBar", s.integrity / 100)
  ui.set_value("VitalsBar", math.max(0, s.vitals) / 100)
  -- Return margin: can you still walk back on what's left?
  local ship = world.find("Ship")
  local sx, _, sz = world.position(ship)
  if sx and not ambient then
    local d = dist2d(player, sx, sz)
    local need = d / 4.2
    local have = s.o2 * 180 * life
    local margin = have > 0 and (have - need) / have or -1
    ui.set_text("ReturnLabel", string.format("RETURN %s · margin %d%%", km(d), math.floor(margin * 100)))
    if margin < 0.2 and d > 30 then hint("POINT OF NO RETURN: head back to the ship now.", 1) end
  else
    ui.set_text("ReturnLabel", "")
  end
  if s.vitals <= 0 then
    -- Down: the suit's recovery tether pulls you back aboard.
    s.vitals, s.o2, s.integrity = 40, 1, 60
    S.deaths = S.deaths + 1
    for k, v in pairs(S.res) do S.res[k] = math.floor(v * 0.75) end
    space.board()
    banner("SUIT FAILURE -- RECOVERED TO SHIP", 3, "bad")
    log_journal("Suit failure", "Vitals failed on " .. st.frame .. ". The recovery tether pulled you back aboard; a quarter of the carried samples were lost.", "warn")
    refresh_meters()
  end
end

-- ------------------------------------------------------------- begin --
local HUD = { "Research", "Language", "Resources", "O2Label", "O2Bar", "SuitLabel", "SuitBar", "VitalsLabel", "VitalsBar", "ReturnLabel", "ShipStatus" }
local function hide_title()
  for _, el in ipairs({ "TitlePanel", "Title", "TitleSub", "Begin", "NewGame", "Controls", "Controls2", "Controls3" }) do ui.set_visible(el, false) end
  for _, el in ipairs(HUD) do ui.set_visible(el, true) end
end

local function begin(from_save)
  hide_title()
  phase = "play"
  space.set_controls(true)
  apply_upgrades()
  local st = space.state()
  if from_save then
    -- The clock first: the planets (and the town's day) where they were.
    if S.time then
      space.call("time", "", S.time)
      world.set_clock(((S.time - 3498) / 969 * 24 + 12) % 24)
      space.call("settle")
    end
    if S.ship and S.ship.body then space.place_landed(S.ship.body, S.ship.lat, S.ship.lon, 0) end
    if S.fuel then space.set_fuel(S.fuel) end
    if S.hull then space.call("hull", "", S.hull) end
    if S.herds and (not S.ship or S.ship.body == "Tethys") then
      for i, p in pairs(S.herds) do
        local id = world.find("Herd " .. i)
        if id then world.set_position(id, p.x, p.y, p.z) end
      end
    end
    for spot in pairs(S.spots or {}) do host.send("harvest_spot", spot) end
    if S.parts then for p, v in pairs(S.parts) do space.call("part", p, v - 100) end end
    if S.reserve then space.call("reserve") end
    if S.nemesis then space.call("reveal", "Nemesis") end
    for k in pairs(S.known) do host.send("catalogued", k) end
    for i in pairs(S.ice) do
      local id = ICE[i] and world.find(ICE[i].name)
      if id then world.destroy(id) end
    end
    for id, choice in pairs(S.civ.artifacts) do
      if choice == "taken" then
        local e = world.find(EVIDENCE[id].name)
        if e then world.destroy(e) end
      end
    end
    banner("EXPEDITION RESUMED", 3)
    set_step(S.step == "exit" and "air" or S.step)
  else
    banner("TETHYS -- KESTRA STATION", 4)
    log_journal("Landfall: Tethys", "Second world of the star Aster. Thin air, 14 C. The suit holds its seal until the atmosphere is verified.", "note")
    S.visited.Tethys = true
    st = space.state()
    if st and st.piloting then set_step("exit") else set_step("air") end
  end
  publish_sites()
  refresh_meters()
  apply_scanner()
  host.send("sky_scan", "atmosphere:Tethys")
  host.send("announce", "Expedition started. Press F1 for controls.")
end

function on_ui(name, value)
  if name == "scan_confidence" then confidence = tonumber(value) or 1
  elseif name == "scan" then on_scan(value)
  elseif name == "near_harvest" then near_harvest = value or ""
  elseif name == "harvest_spot" then
    -- Remembered so it stays harvested after a reload (a few hundred).
    S.spots = S.spots or {}
    local n = 0
    for _ in pairs(S.spots) do n = n + 1 end
    if n < 400 then S.spots[value] = true end
  elseif name == "harvested" then
    local sp = SPECIES[value]
    if sp then
      local amount = math.max(2, math.floor(sp.y * 0.6))
      gain(sp.yield, amount)
      lesson("harvest")
      banner(string.format("HARVESTED %s  +%d %s", string.upper(sp.name), amount, string.upper(sp.yield)), 1.8, "good")
      progress()
    end
  elseif name == "Begin" and phase == "title" then
    local saved = load_save()
    if saved then
      S = saved
      begin(true)
    else
      begin(false)
    end
  elseif name == "NewGame" and phase == "title" then
    if load_save() and not title_confirm then
      title_confirm = true
      ui.set_text("NewGame", "CONFIRM: ERASE SAVE")
      return
    end
    save.set("expedition", "")
    S = fresh()
    begin(false)
  elseif name == "SettingsBtn" then host.send("settings", "")
  elseif name == "MenuClose" then close_menu()
  elseif name:sub(1, 7) == "MenuBtn" then press_menu(tonumber(name:sub(8)) or 0)
  end
end

-- -------------------------------------------------------------- tick --
function on_tick(dt)
  if not started then
    started = true
    player = world.find("Player")
    space.set_fuel(START_FUEL)
    space.set_controls(false)
    space.call("board_key", "", 0)
    for _, el in ipairs({ "EndPanel", "EndTitle", "EndText", "Again", "Banner", "BannerGood", "BannerWarn", "BannerBad", "BannerAnomaly", "Hint", "Prompt" }) do ui.set_visible(el, false) end
    show_menu_ui(false)
    show_talk(nil)
    objective("", "")
    for _, el in ipairs(HUD) do ui.set_visible(el, false) end
    host.send("music", "title")
    if load_save() then
      ui.set_text("Begin", "CONTINUE")
    else
      ui.set_visible("NewGame", false)
    end
    refresh_meters()
  end
  if banner_until > 0 and time.now > banner_until then ui.set_visible(last_banner, false) banner_until = 0 end
  if hint_until > 0 and time.now > hint_until then ui.set_visible("Hint", false) hint_until = 0 end
  if talking and time.now > talk_until then show_talk(nil) end
  if phase ~= "play" then return end
  S.play = S.play + dt

  -- Panels and keys.
  if input.pressed("p") then game.pause() end
  if input.pressed("escape") then close_menu() end
  if menu then for k = 1, MENU_BUTTONS do if input.pressed(tostring(k)) then press_menu(k) end end end
  local toggles = { j = journal_menu, u = upgrades_menu, i = ship_menu, y = culture_menu, tab = board_menu, f2 = academy_menu, f1 = controls_menu }
  for key, fn in pairs(toggles) do
    if input.pressed(key) then
      if menu and menu.key == key then close_menu() else fn() if menu then menu.key = key end end
    end
  end
  if input.pressed("m") then host.send("map", "toggle") end

  local st = space.state()
  if not st then return end
  for _, e in ipairs(space.events()) do
    if e == "rough_touchdown" then banner("ROUGH TOUCHDOWN -- GEAR DAMAGED", 2.5, "bad")
    elseif e == "touchdown" then
      banner("TOUCHDOWN", 2)
      if st.body ~= "Tethys" or current_site(st) ~= "home" then lesson("landing") end
      landing_law(st)
      save_now("touchdown")
    elseif e == "liftoff" then progress()
    elseif e == "exited" then
      if S.step == "exit" then set_step(S.atmo.Tethys and "survey" or "air") end
      S.suit.o2 = math.max(S.suit.o2, 0.2)
    elseif e == "boarded" then
      S.suit.o2, S.suit.integrity = 1, math.min(100, S.suit.integrity + 25)
      ui.set_text("ReturnLabel", "")
    elseif e == "frame:home" or e:sub(1, 6) == "frame:" or e:sub(1, 5) == "site:" then
      local fs = space.state()
      frame_changed(fs)
      if e:sub(1, 6) == "frame:" and e ~= "frame:home" and fs.piloting then hint("Landed on " .. e:sub(7) .. ": step out with E to explore and scan (F).", 4) end
    elseif e == "reframe" then
      -- Walked far across the wilds: the frame moved under the walker; bring
      -- the local wildlife along if it's been left behind.
      local fs = space.state()
      local px, pz
      if player then px, _, pz = world.position(player) end
      local near = false
      for _, id in ipairs(spawned) do
        local x, _, z = world.position(id)
        if x and px and math.sqrt((x - px) ^ 2 + (z - pz) ^ 2) < 350 then near = true break end
      end
      if not near and current_site(fs) == "" then release_fauna(fs.frame, true) end
    elseif e == "autopilot_arrived" then
      banner("ARRIVED -- AUTOPILOT DISENGAGED", 2.5, "good")
      lesson("autopilot")
    elseif e == "autopilot_off" then hint("Manual control: autopilot disengaged.", 2)
    elseif e:sub(1, 4) == "soi:" then
      banner("ENTERING " .. string.upper(e:sub(5)) .. "'S INFLUENCE", 2.5)
    elseif e == "destroyed" then
      banner("SHIP LOST", 3, "bad")
      lost_at = time.now
    end
  end

  -- Recovery: back at the last safe landing, patched up.
  if lost_at and time.now > lost_at + 3 then
    lost_at = nil
    local at = S.ship or { body = SITE.body, lat = SITE.latitude, lon = SITE.longitude }
    space.place_landed(at.body, at.lat, at.lon, 0)
    space.repair()
    space.set_fuel(math.max(st.fuel, 40))
    S.deaths = S.deaths + 1
    hint("Recovered to the last safe landing.", 4)
  end

  -- Keys that act in the world.
  if input.pressed("b") then
    if space.call("reserve") then
      S.reserve = true
      banner("EMERGENCY RESERVE RELEASED", 2.5, "warn")
    elseif not S.reserve then hint("The reserve unlocks below 35% fuel.", 2) end
  end
  if input.pressed("g") then
    if space.call("autopilot", "", st.autopilot and 0 or 1) then
      banner(st.autopilot and "AUTOPILOT OFF" or "NAV AUTOPILOT ENGAGED", 2, "good")
    else hint("Autopilot: set a target on the System Board (TAB) and lift off first.", 3) end
  end
  if input.pressed("h") and not st.piloting then
    local info = BODY_INFO[st.frame] or {}
    if info.breathable and S.atmo[st.frame] then
      helmet = not helmet
      banner(helmet and "HELMET SEALED" or "HELMET OFF -- AMBIENT AIR", 2)
    else
      hint("Interlock: the helmet stays sealed in unverified or unsafe air.", 3)
    end
  end
  -- The suit light (0.75.0): automatic in the dark, or forced on or off.
  if input.pressed("l") and not st.piloting then
    suit_light = suit_light == "auto" and "on" or suit_light == "on" and "off" or "auto"
    host.send("suitlight", suit_light)
    banner("SUIT LIGHT " .. string.upper(suit_light), 1.5)
  end
  if input.pressed("r") and not st.piloting then
    prospect_mode = (prospect_mode + 1) % 4
    if prospect_mode == 0 then
      host.send("prospect", "")
      hint("Prospecting off.", 2)
    else
      local kind = PROSPECT[prospect_mode]
      local keys = {}
      for id, sp in pairs(SPECIES) do
        if sp.yield == kind and sp.body == st.frame and (S.known[id] or S.upg.scan >= 1) then keys[#keys + 1] = id end
      end
      host.send("prospect", string.format("%s|%d|%s", string.upper(kind), math.floor(300 * (1 + 0.35 * S.upg.scan)), table.concat(keys, ",")))
      hint(#keys > 0 and ("Prospecting: " .. kind .. ". The nearest deposit is marked.") or ("No known " .. kind .. " here. Catalogue one first, or fit Survey Optics."), 3)
    end
  end

  -- On foot: the interaction prompt and E.
  if not st.piloting then
    local it = interaction(st)
    ui.set_text("Prompt", it and ("E  " .. it.label) or "")
    ui.set_visible("Prompt", it ~= nil)
    if input.pressed("e") and not menu then interact(st) end
  else
    ui.set_visible("Prompt", false)
  end

  -- Slower updates: four times a second.
  tick_accum = tick_accum + dt
  if tick_accum < 0.25 then return end
  local step_dt = tick_accum
  tick_accum = 0
  -- Kestra's solar time: Tethys' solar day is about 969 s, noon at t = 3498.
  world.set_clock(((st.time - 3498) / 969 * 24 + 12) % 24)
  if not st.piloting then
    suit(st, step_dt)
  else
    S.suit.o2 = 1
    ui.set_text("O2Label", "SHIP LIFE SUPPORT")
    ui.set_value("O2Bar", 1)
    ui.set_text("SuitLabel", string.format("SUIT INTEGRITY %d%%", math.floor(S.suit.integrity)))
    ui.set_text("VitalsLabel", string.format("VITALS %d%%", math.floor(S.suit.vitals)))
  end
  ui.set_text("ShipStatus", string.format("FUEL %d%% · HULL %d%% · ENG %d · RCS %d · GEAR %d%s",
    math.floor(st.fuel / math.max(st.fuel_max, 1) * 100), math.floor(st.hull / math.max(st.hull_max, 1) * 100),
    math.floor(st.engine or 100), math.floor(st.rcs or 100), math.floor(st.gear or 100),
    st.autopilot and ("  · AUTOPILOT " .. string.upper(st.autopilot_phase or "")) or ""))
  weather(st, step_dt)
  ambience(st)
  doors(st, step_dt)
  music(st, step_dt)
  if menu and menu.build and (menu.key == "tab" or menu.key == "i") then render_menu() end

  -- Objectives that complete by state.
  if S.step == "launch" and st.piloting and not st.landed and st.orbit_closed and st.periapsis > 9000 * 2.4 then
    lesson("orbit")
    banner("ORBIT ACHIEVED", 2.5, "good")
    set_step("relay")
  end
  if S.step == "launch" and st.piloting and not st.landed and st.altitude > 25000 then set_step("relay") end
  if S.step == "fuel" and S.res.volatiles >= 12 then
    hint("Enough volatiles: refine them at the ship (I).", 3)
  end
  if st.piloting and not st.landed then
    local fraction = st.fuel / math.max(st.fuel_max, 1)
    if fraction < 0.15 and not S.reserve then hint("FUEL LOW: B releases the emergency reserve. Land and refine volatiles.", 2)
    elseif st.fuel <= 0 then hint("Out of fuel. STABILIZED holds you level; land gently.", 2) end
    if st.heat > 70 then hint("Hull heating: slow down in the thick air.", 2) end
    if st.target ~= "" and st.target then
      local b = space.body(st.target)
      if b then ui.set_text("Detail", string.format("%s: %s away%s", st.target, km(math.max(0, b.altitude)), st.autopilot and ("  ·  autopilot " .. (st.autopilot_phase or "")) or "")) end
    end
  end
  -- Landed with fuel nearly gone and volatiles aboard: the refinery runs.
  if st.landed and st.fuel / math.max(st.fuel_max, 1) < 0.12 and S.res.volatiles >= 6 then
    S.res.volatiles = S.res.volatiles - 6
    space.refuel(12)
    banner("AUTO-REFINE: FUEL SAFETY  +12 FUEL", 2.5, "warn")
    refresh_meters()
  end
  -- Sites discovered by flying or walking near them.
  for id, s in pairs(SITES) do
    if not S.civ.discovered[id] then
      if s.home and not st.away and player then
        if dist2d(player, s.x, s.z) < 140 then discover_site(id, "field") end
      elseif not s.home and st.body == s.body then
        local b = space.body(s.body)
        if b and arc(st.latitude, st.longitude, s.lat, s.lon, b.radius) < 2500 and st.altitude < 4000 then discover_site(id, "field") end
      end
    end
  end
  -- Pacing: a field note after a long quiet stretch.
  if time.now - idle_since > 150 then
    idle_since = time.now
    local notes = {
      air = "Field note: the suit can sample air. Look straight up at open sky and hold F.",
      survey = "Field note: the Talari quarter is east of the pad; Old Vey Gate is south-west. Markers show both.",
      fuel = "Field note: R prospects for volatiles. Glowing ice outcrops around the station are quick fuel.",
      launch = "Field note: lift with SPACE, pitch up, full throttle. Orbit needs your periapsis above the air.",
      relay = "Field note: TAB, target Vell, then G. The autopilot coasts under time warp.",
      fragments = "Field note: the System Board marks the recommended world. Upgrades (U) help: tanks first.",
      nemesis = "Field note: Nemesis is far. Fill the tanks and check the route plan reads OK.",
    }
    if notes[S.step] then hint(notes[S.step], 6) end
  end
  if time.now > autosave_at then save_now("autosave") end
end
