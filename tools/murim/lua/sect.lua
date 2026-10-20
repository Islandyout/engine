-- The sect's record of you (the scene builder places items.lua and talk.lua in front of this): rank and contribution,
-- the standing you have with the sect, the village and the bandits, the mission board, the codex, achievements, the
-- journal's tabs and the first-time tips. Other scripts tell it what happened with world.send(sect, name, value).
local player
local contribution = 0
local rep = { sect = 0, village = 0, bandits = 0 }
local kills, shrines_found = 0, 0
local realm = 1
local tab = 1
local journal_quests = ""       -- the Player script's goals, as Quest log lines
local side = {}                 -- side quests: wen -> state
local unlocked = {}             -- codex ids
local codex_order = {}
local done = {}                 -- achievement ids
local tips_seen = {}
local clock = 0
local stats = { slain = {}, fished = 0, hunted = 0, mined = 0, brewed = 0, forged = 0, dungeon = 0 }

local RANKS = { { "Outer Disciple", 0 }, { "Inner Disciple", 100 }, { "Core Disciple", 300 }, { "Elder's Student", 700 } }

local CODEX = {
  sect = { "The Azure Cloud Sect", "Founded on a cloud-high ridge, the sect teaches that qi is a river: gather it, guide it, and never dam it." },
  qi = { "Qi and realms", "Mortal, Qi Gathering, Foundation, Golden Core. Each realm is wider than the last, and each breakthrough asks for a pill, stillness and a little luck." },
  vein = { "Spirit veins", "Where the mountain's qi comes near the surface, a stele stands. Sit beside one and your qi comes three times as fast." },
  tribulation = { "Heavenly tribulation", "Past Qi Gathering, the sky tests the one who would rise. Watch the red rings; lightning does not repeat itself." },
  village = { "Willow Village", "Farmers, a merchant and a stable. They owe the sect their peace, and the sect owes them its rice." },
  elder = { "The Iron Fist Elder", "A guardian once of the sect, bound to the shrine by a vow he no longer remembers. His fists have not forgotten." },
  peak = { "Heaven Peak", "The tallest crag in the valley. Old texts say a shrine at its foot looks over three realms." },
  qinggong = { "Qinggong", "Lightness skill: from Foundation, a second step in the air; from Golden Core, a third. Walls hold a runner for a breath." },
  alchemy = { "Alchemy", "Herbs, a furnace and patience. A good pill is a promise the body keeps." },
  lake = { "Water Dragon Lake", "Silver carp swim where a dragon is said to have slept. The fishermen leave a little rice on the shore." },
  cave = { "The Cave of Whispers", "Shades gather where qi pools without a master. The cave's guardian wears a crown no one has claimed." },
  forge = { "Tempering", "Iron takes a spirit stone like a lesson: slowly, and once. Gear grows stronger each time it is tempered." },
  fox = { "Spirit foxes", "A fox raised near a spirit vein learns to find herbs. They do not like being asked twice." },
}

local ACHIEVEMENTS = {
  { "first_blood", "First blood", "Defeat an enemy." },
  { "bandit_bane", "Bandit bane", "Defeat 10 enemies." },
  { "gathered", "Gathered", "Reach Qi Gathering." },
  { "foundation", "Foundation", "Reach the Foundation realm." },
  { "golden", "Golden Core", "Reach the Golden Core realm." },
  { "alchemist", "Alchemist", "Brew something at the furnace." },
  { "smith", "Tempered", "Temper a piece of gear." },
  { "angler", "Angler", "Catch a fish." },
  { "hunter", "Hunter", "Bring down a deer." },
  { "pilgrim", "Pilgrim", "Find all four shrines." },
  { "core", "Core Disciple", "Reach the rank of Core Disciple." },
  { "slayer", "Guardian's end", "Defeat the Iron Fist Elder." },
  { "delver", "Delver", "Clear the Cave of Whispers." },
  { "stoneheart", "Stone heart", "Mine a spirit stone." },
}

local MISSIONS = {
  { id = "road", name = "Clear the road", text = "Defeat 4 bandits.", kind = "kill", match = "Bandit", n = 4, silver = 40, contrib = 25, rep = { sect = 6 } },
  { id = "herbs", name = "Herb run", text = "Bring 5 spirit herbs.", kind = "bring", item = "Spirit Herb", n = 5, silver = 30, contrib = 15, rep = { sect = 4 } },
  { id = "ore", name = "Ore for the forge", text = "Bring 4 iron ore.", kind = "bring", item = "Iron Ore", n = 4, silver = 35, contrib = 15, rep = { sect = 4 } },
  { id = "fish", name = "Fresh fish", text = "Bring 3 silver carp to the village.", kind = "bring", item = "Silver Carp", n = 3, silver = 30, contrib = 10, rep = { village = 8 } },
  { id = "venison", name = "Venison for the village", text = "Bring 2 venison.", kind = "bring", item = "Venison", n = 2, silver = 40, contrib = 10, rep = { village = 10 } },
  { id = "shades", name = "Shade hunt", text = "Defeat 3 shades in the cave.", kind = "kill", match = "Shade", n = 3, silver = 90, contrib = 40, rep = { sect = 8 } },
  { id = "wolves", name = "Wolf trouble", text = "Defeat 3 wolves.", kind = "kill", match = "Wolf", n = 3, silver = 60, contrib = 25, rep = { village = 8 } },
  { id = "temper", name = "Tempering", text = "Temper a piece of gear at an anvil.", kind = "event", event = "forged", n = 1, silver = 50, contrib = 20, rep = { sect = 4 } },
}
local offer = { 1, 2, 3 }       -- indexes into MISSIONS on the board
local active = {}               -- mission id -> progress count
local completed = 0

local TIPS = {
  start = { "Tip", "Hold N while standing still to gather qi. K opens your arts, J the journal." },
  fight = { "Tip", "Hold R to block; raise it just as a blow lands to parry. T locks on, X dodges." },
  stance = { "Tip", "Y changes stance: sword, spear, glaive and bow each have their own moves." },
  herb = { "Tip", "Hold E at a glowing herb to pick it. The furnace brews them into pills." },
  shrine = { "Tip", "Pray at a shrine to rest and set where you return; shrines you have found are fast-travel points." },
  arts = { "Tip", "Instructor Hua teaches scroll arts for silver, and a qi affinity that changes how they land." },
  realm = { "Tip", "A full qi bar and a Breakthrough Pill let you press B to break through. Stay still and unhurt." },
  fish = { "Tip", "Stand at the lake's edge and press E to cast a line; press E again when the float dips." },
}

local function me() player = player or world.find("Player") return player end
local function rank_of()
  local name, nxt = RANKS[1][1], nil
  for i, r in ipairs(RANKS) do if contribution >= r[2] then name, nxt = r[1], RANKS[i + 1] end end
  return name, nxt
end
local function tip(id)
  if tips_seen[id] or not TIPS[id] then return end
  tips_seen[id] = true
  ui.set_text("Tip", TIPS[id][1] .. "\n" .. TIPS[id][2])
end

local persist
local function award(id)
  if done[id] then return end
  for _, a in ipairs(ACHIEVEMENTS) do
    if a[1] == id then
      done[id] = true
      ui.set_text("Notification", "Achievement\n" .. a[2] .. ": " .. a[3])
      sound.play("bell")
      persist()
    end
  end
end

local function codex(id)
  if unlocked[id] or not CODEX[id] then return end
  unlocked[id] = true
  codex_order[#codex_order + 1] = id
  ui.set_text("Notification", "Codex\n" .. CODEX[id][1])
  persist()
end

local function discount_standing()
  local d = 0
  if rep.village >= 20 then d = 0.1 elseif rep.village >= 8 then d = 0.05 end
  if rep.sect >= 30 then d = d + 0.05 end
  world.send(world.find("Economy"), "discount", tostring(d))
  world.send(world.find("Economy"), "standing", tostring(rep.sect))
end

local function add_contribution(n)
  local before = rank_of()
  contribution = contribution + n
  local after_rank = rank_of()
  if after_rank ~= before then
    ui.set_text("Notification", "New rank\n" .. after_rank)
    world.send(me(), "insight", "2")
    sound.play("bell")
    if after_rank == "Core Disciple" then award("core") end
  end
end

local function add_rep(r)
  for k, v in pairs(r or {}) do rep[k] = rep[k] + v end
  discount_standing()
end

function persist()
  local c, a, o = {}, {}, {}
  for id in pairs(unlocked) do c[#c + 1] = id end
  for id in pairs(done) do a[#a + 1] = id end
  for _, i in ipairs(offer) do o[#o + 1] = i end
  local act = {}
  for id, n in pairs(active) do act[#act + 1] = id .. ":" .. n end
  save.set("azure-cloud-sect-sect", string.format("contrib=%d;rs=%d;rv=%d;rb=%d;kills=%d;codex=%s;done=%s;offer=%s;active=%s;done_m=%d;tips=%s",
    contribution, rep.sect, rep.village, rep.bandits, kills, table.concat(c, ","), table.concat(a, ","), table.concat(o, ","), table.concat(act, ","), completed,
    (function() local t = {} for id in pairs(tips_seen) do t[#t + 1] = id end return table.concat(t, ",") end)()))
end

local function load_state()
  local text = save.get("azure-cloud-sect-sect")
  if not text or text == "" then return end
  local f = {}
  for k, v in text:gmatch("(%w+)=([^;]*)") do f[k] = v end
  contribution = tonumber(f.contrib) or 0
  rep.sect, rep.village, rep.bandits = tonumber(f.rs) or 0, tonumber(f.rv) or 0, tonumber(f.rb) or 0
  kills = tonumber(f.kills) or 0
  completed = tonumber(f.done_m) or 0
  for id in (f.codex or ""):gmatch("[^,]+") do unlocked[id] = true codex_order[#codex_order + 1] = id end
  for id in (f.done or ""):gmatch("[^,]+") do done[id] = true end
  for id in (f.tips or ""):gmatch("[^,]+") do tips_seen[id] = true end
  local o = {}
  for i in (f.offer or ""):gmatch("%d+") do o[#o + 1] = tonumber(i) end
  if #o == 3 then offer = o end
  for id, n in (f.active or ""):gmatch("(%w+):(%d+)") do active[id] = tonumber(n) end
end

-- ---- The mission board
local function mission(i) return MISSIONS[offer[i]] end
local function progress_of(m)
  if m.kind == "bring" then return math.min(m.n, inventory.count(me(), m.item)) end
  return math.min(m.n, active[m.id] or 0)
end
local function board_choices()
  local choices = {}
  for i = 1, 3 do
    local m = mission(i)
    if active[m.id] ~= nil then
      choices[i] = progress_of(m) >= m.n and (m.name .. ": hand in (" .. m.silver .. " silver)") or (m.name .. ": " .. progress_of(m) .. "/" .. m.n)
    else
      choices[i] = m.name .. ": " .. m.text
    end
  end
  return choices
end
local function board_render(note)
  local name, nxt = rank_of()
  say("Mission board", note or (name .. ", " .. contribution .. " contribution" .. (nxt and (" (next rank at " .. nxt[2] .. ")") or "") .. "."), board_choices())
end
local function replace_offer(slot)
  local shown = {}
  for _, i in ipairs(offer) do shown[i] = true end
  local pool = {}
  for i, m in ipairs(MISSIONS) do if not shown[i] and active[m.id] == nil then pool[#pool + 1] = i end end
  if #pool > 0 then offer[slot] = pool[math.random(#pool)] end
end
local function board_choose(n)
  local m = mission(n)
  if not m then return end
  if active[m.id] == nil then
    local count = 0
    for _ in pairs(active) do count = count + 1 end
    if count >= 2 then board_render("You may hold two missions at once.") return end
    active[m.id] = 0
    sound.play("book open")
    persist()
    board_render("Accepted: " .. m.name .. ".")
  elseif progress_of(m) >= m.n then
    if m.kind == "bring" then inventory.remove(me(), m.item, m.n) end
    inventory.add(me(), "Silver", m.silver)
    active[m.id] = nil
    completed = completed + 1
    add_contribution(m.contrib)
    add_rep(m.rep)
    ui.set_text("Notification", "Mission complete\n" .. m.name .. ": " .. m.silver .. " silver, " .. m.contrib .. " contribution.")
    replace_offer(n)
    sound.play("coin handle")
    persist()
    board_render("Well done.")
  else
    board_render(m.text .. " (" .. progress_of(m) .. "/" .. m.n .. ")")
  end
end

-- ---- The journal
local function journal_text()
  local head = "Journal\ntabs|" .. tab .. "|Quests|Missions|Codex|Achievements"
  local lines = {}
  if tab == 1 then
    lines[#lines + 1] = journal_quests
    local w = side.wen
    if w then
      local text = ({ active = "Find Wen's cart by the old watchtower.", found = "Return to Wen with his cart.", done = "Returned Wen's cart." })[w] or ""
      lines[#lines + 1] = (w == "done" and "done" or "active") .. "|Wen's cart|" .. text
    end
  elseif tab == 2 then
    local name, nxt = rank_of()
    lines[#lines + 1] = "done|" .. name .. " · " .. contribution .. " contribution" .. (nxt and (" (next rank at " .. nxt[2] .. ")") or "") .. "|"
    lines[#lines + 1] = string.format("done|Standing: sect %d · village %d · bandits %d|", rep.sect, rep.village, rep.bandits)
    for id in pairs(active) do
      for _, m in ipairs(MISSIONS) do
        if m.id == id then lines[#lines + 1] = string.format("active|%s (%d/%d)|%s", m.name, progress_of(m), m.n, m.text) end
      end
    end
    if next(active) == nil then lines[#lines + 1] = "todo|No mission taken|Ask the board in the Great Hall." end
  elseif tab == 3 then
    local last = codex_order[#codex_order]
    for _, id in ipairs(codex_order) do
      local c = CODEX[id]
      lines[#lines + 1] = (id == last and "active|" or "done|") .. c[1] .. "|" .. c[2]
    end
    if #codex_order == 0 then lines[1] = "todo|Nothing recorded yet|Explore the valley." end
  else
    local count = 0
    for _, a in ipairs(ACHIEVEMENTS) do
      if done[a[1]] then count = count + 1 end
      lines[#lines + 1] = (done[a[1]] and "done|" or "todo|") .. a[2] .. "|" .. a[3]
    end
    head = "Journal  " .. count .. "/" .. #ACHIEVEMENTS .. "\ntabs|4|Quests|Missions|Codex|Achievements"
  end
  return head .. "\n" .. table.concat(lines, "\n")
end

local function refresh_journal() ui.set_text("Quest log", journal_text()) end

-- ---- Events
local function on_slain(name)
  kills = kills + 1
  stats.slain[name] = (stats.slain[name] or 0) + 1
  award("first_blood")
  if kills >= 10 then award("bandit_bane") end
  if name:find("Iron Fist") then award("slayer") codex("elder") end
  if name:find("Bandit") then rep.bandits = rep.bandits + 1 end
  for _, m in ipairs(MISSIONS) do
    if active[m.id] ~= nil and m.kind == "kill" and name:find(m.match) then active[m.id] = active[m.id] + 1 end
  end
  persist()
end

function on_message(name, value)
  value = tostring(value)
  if name == "journal" then journal_quests = value
  elseif name == "slain" then on_slain(value)
  elseif name == "side" then local k, v = value:match("^(%w+)|(%w+)$") if k then side[k] = v end
  elseif name == "shrines" then
    shrines_found = tonumber(value) or 0
    if shrines_found >= 4 then award("pilgrim") end
  elseif name == "realm" then
    realm = tonumber(value) or realm
    if realm >= 2 then award("gathered") end
    if realm >= 3 then award("foundation") end
    if realm >= 4 then award("golden") end
  elseif name == "codex" then codex(value)
  elseif name == "award" then award(value)
  elseif name == "tip" then tip(value)
  elseif name == "brewed" then stats.brewed = stats.brewed + 1 award("alchemist") codex("alchemy")
  elseif name == "forged" then
    stats.forged = stats.forged + 1
    award("smith") codex("forge")
    for _, m in ipairs(MISSIONS) do if active[m.id] ~= nil and m.kind == "event" and m.event == "forged" then active[m.id] = (active[m.id] or 0) + 1 end end
  elseif name == "fished" then stats.fished = stats.fished + 1 award("angler") codex("lake")
  elseif name == "hunted" then stats.hunted = stats.hunted + 1 award("hunter")
  elseif name == "mined" then stats.mined = stats.mined + 1 award("stoneheart")
  elseif name == "dungeon" then award("delver")
  elseif name == "standing" then
    local r = rank_of()
    ui.set_text("Notification", "Standing\n" .. r .. ", " .. contribution .. " contribution")
  end
end

function on_ui(name, value)
  if name ~= "Quest log" then return end
  value = tostring(value)
  if value == "close" then ui.close("Quest log")
  elseif value:sub(1, 4) == "tab:" then tab = tonumber(value:sub(5)) or 1 refresh_journal() end
end

local NEAR_BOARD = { "Mission board" }

function on_start()
  me()
  load_state()
  discount_standing()
  tip("start")
  refresh_journal()
end

function on_tick(dt)
  tap_tick(dt)
  clock = clock + dt
  local p = me()
  if not p then return end
  if clock >= 0.5 then
    clock = 0
    refresh_journal()
    -- Tips and codex entries that depend on where you are.
    local function near(name, r) local d = distance_to(name) return d and d < r end
    if near("Village shrine", 22) then codex("village") end
    if near("Peak shrine", 14) then codex("peak") end
    if near("Iron Fist Elder", 25) then codex("elder") end
    if near("Merchant Lin", 10) then tip("shrine") end
    if near("Instructor Hua", 8) then tip("arts") end
    if near("Bandit Brawler", 24) then tip("fight") end
    if near("Spirit herb 1", 10) or near("Spirit herb 2", 10) or near("Spirit herb 3", 10) then tip("herb") end
    if near("Lake shore", 12) then tip("fish") codex("lake") end
    if near("Cave mouth", 30) then codex("cave") end
    if near("Spirit Vein 1", 8) or near("Spirit Vein 2", 8) or near("Spirit Vein 3", 8) or near("Spirit Vein 4", 8) then codex("vein") end
  end
  -- The board.
  if talking == "Mission board" then
    local n = talk_poll()
    if n then board_choose(n) end
  elseif not talking and nearest_within(NEAR_BOARD) then
    world.send(p, "prompt", "read the mission board")
    if tapped("interact") then
      start_talk("Mission board")
      board_render()
    end
  end
end
