-- GATEBREAKER M4: the district around the Hunter Association (built by
-- tools/gatebreaker/district.ts).
--
-- Gate sites: three cordoned open spaces where Gates tear open. Two are
-- open each day (the closed one rotates with the Ledger's day). Each open
-- site holds one of the Gates the hunter may enter (the Ledger lists them;
-- which site holds which rotates daily), shown as a rift in its rank's
-- colour. Walking into the rift, G enters that Gate the way the Gate Board
-- does (the Ledger, then the Director). The nearest open site carries an
-- on-screen marker while the hunter is out in the district.
--
-- The field: three "dungeon break" zones spill monsters into the streets.
-- Each holds a pack of the hunter's level band (Field <kind> prefabs) that
-- follows a hidden anchor up and down its street; the engine's follow leash
-- keeps it home (it only fights within 16 m of its anchor). A dead pack
-- comes back 90-120 s later, but only while the hunter is 40 m+ away, out
-- of combat and not looking its way, and never past 12 field enemies at
-- once. Fallen enemies are pooled (melee.revive, stashed out of sight) and
-- reused, so the session's entity budget holds. Every kill goes to the
-- Ledger like a Gate's ("kill", "prefab|x|z|field", or "|night"), loot
-- beams included. A field boss waits in one zone (on-screen marker) until
-- it's killed; it returns the next Ledger day.
--
-- Night: the clock's "time" message ("day" or "night"; day until told)
-- makes field enemies 30% stronger (health and damage) and their drops
-- better. Nothing is tinted: their telegraphs keep their colours.
--
-- Safety: the field never touches the Director's Gate states (no penalty,
-- grade or rewards window). Below a quarter of his health the Ledger pulls
-- the hunter back to the Association's square, healed; walking into the
-- square heals him too. Level-ups earned out here show once the fight is
-- over ("field_calm" to the Ledger).
--
-- The subway: Station A (by the Association) and Station B (Hangang
-- plaza). Standing at a station's entrance, G rides to the other one.
-- @prop fast false
--
-- props.fast (tests): packs and the boss appear without waiting for the
-- hunter to be away or looking elsewhere.

-- The district's extent (x, z), and the Association's square inside it.
local AREA = { x0 = -105, x1 = 105, z0 = 14, z1 = 215 }
local SQUARE = { x0 = -16, x1 = 16, z0 = 40, z1 = 64 }
local HUB_SPOT = { 0, 0.9, 47 }
-- Sites: their entities' positions are read at start (these are fallbacks).
local SITES = {
  { name = "Gate site 1", label = "the park", x = -32, y = 3.6, z = 160 },
  { name = "Gate site 2", label = "Hangang plaza", x = 28, y = 3.6, z = 156 },
  { name = "Gate site 3", label = "the east lot", x = 88, y = 3.6, z = 72 },
}
local SITE_R = 8.5 -- inside the cordon
local RIFT_R = 4.5 -- walked into the rift
-- A Gate's colour by rank (district.ts's GATE_RANK_COLOURS).
local RANK_COLOUR = { E = "#3fb8ff", D = "#3de07a", C = "#ffd23d", B = "#ff8a2b", A = "#ff3d5a", S = "#c04dff" }
-- Stations: where to stand (in front of the entrance), where you arrive.
local STATIONS = {
  { name = "Station A", title = "Association Station", x = -46, z = 41.5, ax = -46, az = 38.2 },
  { name = "Station B", title = "Hangang Station", x = 48, z = 177.5, ax = 48, az = 174.2 },
}
local STATION_R = 2.6

-- The field -------------------------------------------------------------------------
-- Zones: centre (read from "Field zone N" at start), the street its anchor
-- patrols (`along` x or z), and its pack's size.
local ZONES = {
  { name = "Field zone 1", label = "the west avenue", x = -64, z = 90, along = "z", size = 4 },
  { name = "Field zone 2", label = "the riverside", x = -56, z = 201, along = "x", size = 4 },
  { name = "Field zone 3", label = "Midtown east", x = 86, z = 120, along = "x", size = 3 },
}
local PATROL = { 0, -8, 0, 8 } -- the anchor's stops along its street, PATROL_T s apart
local PATROL_T = 20
local RESPAWN = { 90, 120 }  -- seconds a dead pack stays away (at least)
local FAR = 40               -- a pack or boss only appears this far from the hunter
local CALM_R = 22            -- no field enemy this close: out of combat
local MAX_ALIVE = 12         -- field enemies standing at once, boss included
local NIGHT = 1.3            -- night: health and damage
local STASH = { x = 40, z = -146 } -- the pool: on the ground slab south of the Gates, out of sight

local G, A, S, SH, H = "Goblin Grunt", "Goblin Archer", "Goblin Shieldbearer", "Goblin Shaman", "Hobgoblin"
local DG, IG, K, C = "Drowned Goblin", "Ice Ghoul", "Armored Knight", "Cultist Caster"
-- What the breaks spill by the hunter's level: a pack's kinds in order (a
-- pack of 3 takes the first three), and the field boss.
local BANDS = {
  { lv = 1, pack = { G, A, G, S }, boss = "Goblin Chieftain" },
  { lv = 5, pack = { H, G, SH, A }, boss = "Hobgoblin Brute" },
  { lv = 8, pack = { K, DG, C, DG }, boss = "Goblin Warlord" },
  { lv = 11, pack = { K, IG, C, IG }, boss = "Drowned Priest" },
}
-- Half each kind's height: where it stands when placed.
local HALF = {
  ["Goblin Grunt"] = 0.725, ["Goblin Archer"] = 0.725, ["Goblin Shieldbearer"] = 0.725, ["Goblin Shaman"] = 0.7,
  ["Hobgoblin"] = 0.925, ["Goblin Chieftain"] = 1.05, ["Hobgoblin Brute"] = 1.2, ["Goblin Warlord"] = 1.125,
  ["Drowned Goblin"] = 0.725, ["Ice Ghoul"] = 0.725, ["Armored Knight"] = 0.95, ["Cultist Caster"] = 0.9,
  ["Drowned Priest"] = 1.1, ["Frost Knight Commander"] = 1.15,
}

local hero, ledger_id
local clock = 0
local day, lv, day_check = 1, 1, 0
local night = false
local active = false       -- the hunter is out in the district
local gates, gates_text = {}, "" -- the Gates the hunter may enter: { n, rank, name }
local rifts = {}           -- site -> { id, rank }
local rift_pool = {}       -- rank -> ids put away
local pool = {}            -- "Field <kind>" -> ids put away
local base_hp = {}         -- id -> its prefab's own maximum health
local stash_slot, stash_n = {}, 0
local boss                 -- { id, kind, zone, awake, cfg, again } while it stands
local boss_day = 0         -- the Ledger day the boss last fell (save "gbw")
local boss_bar = false
local hurt_at, last_hp = -100, nil
local calm_at = 0
local in_square = false
local marked, marked_label -- the site the marker is on, or false
local shown, shown_colour = "", ""
local note_until = 0
local cooldown = 0

local function prompt(text, colour)
  colour = colour or ""
  if text ~= shown then
    shown = text
    ui.set_text("World prompt", text)
  end
  if colour ~= shown_colour then
    shown_colour = colour
    ui.set_color("World prompt", colour)
  end
end

-- A line that stays up a few seconds (arrivals, the boss falling...).
local function note(text, seconds, colour)
  prompt(text, colour)
  note_until = clock + (seconds or 3)
end

local function ledger(name, value)
  ledger_id = ledger_id or world.find("Ledger")
  if ledger_id then world.send(ledger_id, name, value) end
end

local function inside(r, x, z)
  return x and x > r.x0 and x < r.x1 and z > r.z0 and z < r.z1
end

-- The Ledger's day and level from its save ("lv=N;...;day=N;..."), and
-- the day the field boss last fell (the World's own save).
local function read_save()
  local text = save.get("gb")
  day = text and tonumber(text:match("day=(%d+)")) or 1
  lv = text and tonumber(text:match("^lv=(%d+)") or text:match(";lv=(%d+)")) or 1
end

local function band()
  local b = BANDS[1]
  for _, x in ipairs(BANDS) do
    if lv >= x.lv then b = x end
  end
  return b
end

-- Damage and health scale: up the level band, and again at night.
local function scale()
  local b = band()
  return math.min(1.6, 1 + 0.06 * (lv - b.lv)) * (night and NIGHT or 1)
end

-- Gate sites -------------------------------------------------------------------------
-- Today's closed site: day 1 closes site 3, day 2 site 1, day 3 site 2...
local function is_open(i)
  return i ~= (day + 1) % 3 + 1
end

-- The Gate open site i holds today (nil: closed, or none to enter).
local function site_gate(i)
  if not is_open(i) or #gates == 0 then return nil end
  local k = 0
  for j = 1, i - 1 do
    if is_open(j) then k = k + 1 end
  end
  return gates[(day + k - 1) % #gates + 1]
end

-- Where pooled things wait: each its own spot on the ground, out of sight.
local function stash_at(id)
  local k = stash_slot[id]
  if not k then
    stash_n = stash_n + 1
    k = stash_n
    stash_slot[id] = k
  end
  return STASH.x + (k % 12) * 2.5, STASH.z - math.floor(k / 12) * 2.5
end

-- Each open site's rift, in its Gate's rank colour (reused, never respawned).
local function place_rifts()
  for i, s in ipairs(SITES) do
    local g = site_gate(i)
    local r = rifts[i]
    if r and (not g or r.rank ~= g.rank) then
      rift_pool[r.rank] = rift_pool[r.rank] or {}
      table.insert(rift_pool[r.rank], r.id)
      local x, z = stash_at(r.id)
      world.set_position(r.id, x, -30, z)
      rifts[i] = nil
    end
    if g and not rifts[i] then
      local list = rift_pool[g.rank]
      local id = list and table.remove(list)
      if id then
        world.set_position(id, s.x, 2.7, s.z)
      else
        id = world.spawn("Gate rift " .. g.rank, s.x, 2.7, s.z)
      end
      if id then rifts[i] = { id = id, rank = g.rank } end
    end
  end
end

local function set_marker(i)
  local g = i and site_gate(i)
  local label = i and (g and (g.rank .. "-rank Gate: " .. g.name) or ("Gate site: " .. SITES[i].label)) or ""
  if i == marked and label == marked_label then return end
  if i then
    local s = SITES[i]
    ui.marker("gate_site", s.x, s.y, s.z, label)
  else
    ui.clear_marker("gate_site")
  end
  marked, marked_label = i, label
end

local function pressed()
  return input.action_pressed("interact") or input.pressed("KeyG")
end

-- The field --------------------------------------------------------------------------
local function standing(m) return m and not m.down end

local function alive_count()
  local n = 0
  for _, z in ipairs(ZONES) do
    for _, m in ipairs(z.members) do
      if standing(m) then n = n + 1 end
    end
  end
  if standing(boss) then n = n + 1 end
  return n
end

-- Fighting: hurt lately, or a field enemy close by.
local function in_combat(hx, hz)
  if clock - hurt_at < 8 then return true end
  local near = function(m)
    if not standing(m) then return false end
    local x, _, z = world.position(m.id)
    return x and (x - hx) ^ 2 + (z - hz) ^ 2 < CALM_R * CALM_R
  end
  for _, z in ipairs(ZONES) do
    for _, m in ipairs(z.members) do
      if near(m) then return true end
    end
  end
  return near(boss)
end

-- Whether the camera could see (x, z): inside its forward cone (60 degrees
-- each side) and not behind anything solid.
local function in_view(x, z, hx, hy, hz)
  local dx, dz = x - hx, z - hz
  local d = math.sqrt(dx * dx + dz * dz)
  if d < 1 then return true end
  local fx, fz = 0, -1
  if camera.forward then fx, fz = camera.forward() end
  if (dx * fx + dz * fz) / d < 0.5 then return false end
  local ux, uz = dx / d, dz / d
  local hit, distance = world.raycast(hx + ux * 1.2, hy + 0.8, hz + uz * 1.2, ux, 0, uz, d)
  local wall = hit and hit ~= "ground" and not world.health(hit)
  return not (wall and distance < d - 4)
end

-- A pack or the boss may appear at (x, z): the hunter is far, calm and
-- looking elsewhere (or off in a Gate).
local function may_appear(x, z)
  if props.fast then return true end
  if not active then return true end
  local hx, hy, hz = world.position(hero)
  if not hx then return false end
  if (x - hx) ^ 2 + (z - hz) ^ 2 < FAR * FAR then return false end
  if in_combat(hx, hz) then return false end
  return not in_view(x, z, hx, hy, hz)
end

-- A field enemy of `kind` at (x, z): one from the pool, or a new one.
local function take(kind, x, z)
  local y = HALF[kind] or 0.8
  local list = pool["Field " .. kind]
  while list and #list > 0 do
    local id = table.remove(list)
    if world.alive(id) then
      world.set_position(id, x, y, z)
      world.set_velocity(id, 0, 0, 0)
      return id
    end
  end
  return world.spawn("Field " .. kind, x, y, z)
end

-- Its anchor and today's numbers ("field"); a new one's script starts a
-- tick after it's spawned, so this is sent twice, a second apart.
local function configure(m, anchor, ai)
  local _, max = world.health(m.id)
  if not max or not anchor then return end
  base_hp[m.id] = base_hp[m.id] or max
  local s = scale()
  world.send(m.id, "field", string.format("%d,%.3f,%.1f,%d", anchor, s, math.max(1, base_hp[m.id] * s), ai and 1 or 0))
  if m.again then
    m.again, m.cfg = false, clock + 1
  else
    m.cfg = nil
  end
end

local function kill_text(m)
  local x, _, z = world.position(m.id)
  local at = x and string.format("%.2f|%.2f", x, z) or "|"
  return m.kind .. "|" .. at .. "|" .. (night and "night" or "field")
end

local function spawn_pack(z)
  local b = band()
  z.members = {}
  for k = 1, z.size do
    local kind = b.pack[(k - 1) % #b.pack + 1]
    local a = k / z.size * math.pi * 2
    local id = take(kind, z.ax + math.cos(a) * 2.6, z.az + math.sin(a) * 2.6)
    if id then z.members[#z.members + 1] = { id = id, kind = kind, cfg = clock + 0.05, again = true } end
  end
  z.respawn_at = nil
end

-- A pack's members: configured once they can hear it, reported to the
-- Ledger when they fall, and put back in the pool once their fall has
-- played (before the engine would remove them).
local function tick_members(z)
  for i = #z.members, 1, -1 do
    local m = z.members[i]
    if not world.alive(m.id) then
      table.remove(z.members, i)
    elseif m.down then
      if clock - m.down >= 3.2 then
        world.send(m.id, "stash")
        local x, sz = stash_at(m.id)
        world.set_position(m.id, x, HALF[m.kind] or 0.8, sz)
        world.set_velocity(m.id, 0, 0, 0)
        local key = "Field " .. m.kind
        pool[key] = pool[key] or {}
        table.insert(pool[key], m.id)
        table.remove(z.members, i)
      end
    else
      local hp = world.health(m.id)
      if hp and hp <= 0 then
        m.down = clock
        ledger("kill", kill_text(m))
      elseif m.cfg and clock >= m.cfg then
        configure(m, z.anchor, true)
      end
    end
  end
end

-- The zone's anchor walks its street while nobody is fighting there.
local function patrol(z, hx, hz)
  if clock < z.patrol_at then return end
  z.patrol_at = clock + PATROL_T
  if hx and (hx - z.x) ^ 2 + (hz - z.z) ^ 2 < 30 * 30 then return end
  z.stop = z.stop % #PATROL + 1
  local off = PATROL[z.stop]
  z.ax = z.x + (z.along == "x" and off or 0)
  z.az = z.z + (z.along == "z" and off or 0)
  world.set_position(z.anchor, z.ax, 0.9, z.az)
end

local function tick_zone(z, hx, hz)
  tick_members(z)
  if #z.members == 0 then
    if not z.respawn_at then
      z.respawn_at = clock + math.random(RESPAWN[1], RESPAWN[2])
    end
    if clock >= z.respawn_at and alive_count() + z.size <= MAX_ALIVE and may_appear(z.x, z.z) then
      spawn_pack(z)
    end
  end
  patrol(z, hx, hz)
end

-- The field boss ---------------------------------------------------------------------
local function boss_zone() return ZONES[day % #ZONES + 1] end

local function show_bar(on)
  if on == boss_bar then return end
  boss_bar = on
  if on then
    hud.boss("Field " .. boss.kind, boss.kind:upper() .. "  ·  Field boss, " .. boss.zone.label)
  else
    hud.boss("", "")
  end
end

local function boss_marker(on)
  if on and boss then
    ui.marker("field_boss", boss.zone.x, 2.5, boss.zone.z, "Field boss: " .. boss.kind)
  else
    ui.clear_marker("field_boss")
  end
end

local function tick_boss(hx, hz)
  if boss and not world.alive(boss.id) then
    boss = nil
    show_bar(false)
    boss_marker(false)
  end
  if not boss then
    local z = boss_zone()
    if boss_day ~= day and z.anchor and alive_count() < MAX_ALIVE and may_appear(z.x, z.z) then
      local kind = band().boss
      local id = world.spawn("Field " .. kind, z.x, HALF[kind] or 1, z.z)
      if id then
        boss = { id = id, kind = kind, zone = z, cfg = clock + 0.05, again = true }
        if active then boss_marker(true) end
      end
    end
    return
  end
  local hp, max = world.health(boss.id)
  if hp and hp <= 0 then
    -- It falls for good (the engine removes it); back next Ledger day.
    ledger("kill", kill_text(boss))
    boss_day = day
    save.set("gbw", "boss=" .. day)
    show_bar(false)
    boss_marker(false)
    hud.cue("discovery")
    note("FIELD BOSS DOWN: " .. boss.kind .. ". Another breaks out tomorrow.", 6, "#ffd23d")
    boss = nil
    return
  end
  if boss.cfg and clock >= boss.cfg then configure(boss, boss.zone.anchor, false) end
  local bx, _, bz = world.position(boss.id)
  local d = (hx and bx) and math.sqrt((hx - bx) ^ 2 + (hz - bz) ^ 2) or 999
  -- It wakes when the hunter comes close or hurts it; once he's gone (its
  -- leash takes it home) it heals.
  if not boss.awake and active and (d < 13 or (hp and max and hp < max)) then
    boss.awake = true
    world.send(boss.id, "wake")
  end
  if boss.awake and d >= FAR and hp and max and hp < max then world.heal(boss.id, max) end
  show_bar(active and boss.awake == true and d < 30)
end

-- Every standing field enemy takes the hour's numbers again (dusk, dawn).
local function retune()
  for _, z in ipairs(ZONES) do
    for _, m in ipairs(z.members) do
      if standing(m) then m.cfg, m.again = clock, false end
    end
  end
  if boss then boss.cfg, boss.again = clock, false end
end

-- The hunter's district ------------------------------------------------------------
local function refresh_gates()
  ledger("open_gates")
end

local function leave_district()
  active = false
  marked = nil
  set_marker(false)
  boss_marker(false)
  show_bar(false)
  prompt("")
end

local function enter_district()
  active = true
  refresh_gates()
  if boss then boss_marker(true) end
end

-- What the prompt says about a field zone the hunter is near.
local function zone_line(hx, hz)
  for _, z in ipairs(ZONES) do
    if (hx - z.x) ^ 2 + (hz - z.z) ^ 2 < 30 * 30 then
      if boss and boss.zone == z then
        return "FIELD BOSS: " .. boss.kind .. " guards the break on " .. z.label .. (night and "  ·  night: stronger, richer" or "")
      elseif #z.members > 0 then
        return "DUNGEON BREAK: " .. z.label .. (night and "  ·  night: stronger, richer" or "")
      end
      return "The break on " .. z.label .. " is quiet. More spill out once you're gone."
    end
  end
  return ""
end

function on_start()
  hero = world.find("Han Seo-jin")
  for _, s in ipairs(SITES) do
    local id = world.find(s.name)
    if id then
      local x, y, z = world.position(id)
      if x then s.x, s.y, s.z = x, y, z end
    end
  end
  for _, z in ipairs(ZONES) do
    local id = world.find(z.name)
    if id then
      local x, _, zz = world.position(id)
      if x then z.x, z.z = x, zz end
    end
    z.anchor = world.find(z.name .. " anchor")
    z.ax, z.az = z.x, z.z
    if z.anchor then world.set_position(z.anchor, z.x, 0.9, z.z) end
    z.members = {}
    z.respawn_at = 0
    z.stop = 1
    z.patrol_at = PATROL_T
  end
  local text = save.get("gbw")
  boss_day = text and tonumber(text:match("boss=(%d+)")) or 0
  marked = nil
  ui.clear_marker("gate_site")
  ui.clear_marker("field_boss")
  read_save()
end

function on_message(name, value)
  if name == "time" then
    -- From the clock: "day" or "night".
    local was = night
    night = value == "night"
    if night ~= was then
      retune()
      if active then
        note(night and "Night falls. The dungeon breaks grow stronger, and richer." or "Day breaks. The dungeon breaks calm down.", 4)
      end
    end
  elseif name == "open_gates" and type(value) == "string" then
    -- The Ledger: "n:rank:name,..." for every Gate the hunter may enter.
    if value == gates_text then return end
    gates_text = value
    gates = {}
    for n, rank, gate_name in value:gmatch("(%d+):(%a+):([^,]+)") do
      gates[#gates + 1] = { n = math.tointeger(tonumber(n)), rank = rank, name = gate_name }
    end
    place_rifts()
    marked = nil
  end
end

function on_tick(dt)
  if not hero then return end
  clock = clock + dt
  cooldown = math.max(0, cooldown - dt)
  if clock >= day_check then
    day_check = clock + 3
    local was = day
    read_save()
    refresh_gates()
    if day ~= was then
      place_rifts()
      marked = nil
    end
  end

  local x, _, z = world.position(hero)
  local hp, max = world.health(hero)
  if hp and last_hp and hp < last_hp then hurt_at = clock end
  last_hp = hp
  local here_now = inside(AREA, x, z)
  if here_now and not active then enter_district() elseif not here_now and active then leave_district() end

  for _, zone in ipairs(ZONES) do tick_zone(zone, x, z) end
  tick_boss(x, z)
  if not active then return end

  -- Safety: too hurt out here, the Ledger pulls him back to the square.
  local square = inside(SQUARE, x, z)
  if hp and max and hp < max * 0.25 and not square then
    world.heal(hero, max)
    world.set_position(hero, HUB_SPOT[1], HUB_SPOT[2], HUB_SPOT[3])
    world.set_velocity(hero, 0, 0, 0)
    last_hp = max
    hud.cue("bad")
    note("THE LEDGER PULLS YOU OUT. You wake in the Association's square, healed.", 5, "#ff8a8a")
    return
  end
  -- The Association's square: the medics patch him up.
  if square and not in_square and hp and max and hp < max then
    world.heal(hero, max)
    last_hp = max
    note("The Association's medics patch you up.", 3)
  end
  in_square = square
  -- Level-ups earned out here wait for a calm moment.
  if clock >= calm_at then
    calm_at = clock + 2
    if not in_combat(x, z) then ledger("field_calm") end
  end

  -- The nearest open Gate site, and whether the hunter stands in one.
  local best, best_d, here, here_d
  for i, s in ipairs(SITES) do
    if is_open(i) then
      local d = math.sqrt((x - s.x) ^ 2 + (z - s.z) ^ 2)
      if not best_d or d < best_d then best, best_d = i, d end
      if d < SITE_R then here, here_d = i, d end
    end
  end
  -- (No marker while standing in the site itself.)
  if here then set_marker(false) else set_marker(best or false) end

  -- What G does here: ride the subway, or walk into a site's Gate.
  local station, other
  for i, st in ipairs(STATIONS) do
    if (x - st.x) ^ 2 + (z - st.z) ^ 2 < STATION_R * STATION_R then
      station, other = st, STATIONS[3 - i]
    end
  end
  if station then
    prompt("[G] Subway to " .. other.title)
    if cooldown == 0 and pressed() then
      world.set_position(hero, other.ax, 0.9, other.az)
      world.set_velocity(hero, 0, 0, 0)
      cooldown = 1
      note(other.title, 2.5)
    end
  elseif here then
    local g = site_gate(here)
    if not g then
      prompt("The rift here is still forming.")
    elseif here_d < RIFT_R then
      prompt("[G] Enter: " .. g.name .. " (" .. g.rank .. ")", RANK_COLOUR[g.rank])
      if cooldown == 0 and pressed() then
        cooldown = 1
        ledger("site_gate", g.n)
      end
    else
      prompt(g.rank .. "-rank Gate: " .. g.name .. ". Walk into the rift.", RANK_COLOUR[g.rank])
    end
  elseif clock < note_until then
    -- A note stays up a moment.
    return
  else
    prompt(zone_line(x, z))
  end
end
