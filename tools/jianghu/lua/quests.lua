-- Quests, people and the things you can touch (the scene builder places items.lua, talk.lua and the data tables in front of this).
-- A quest is a list of named steps (tools/jianghu/quests.ts); each step finishes when its condition is met. Only the quest you are
-- tracking shows a waypoint, and Enter cycles which one (or none). Strong people can be talked to, challenged to a duel to first yield,
-- or left alone.
QUEST_DATA = --@QUESTS@
NPC_DATA = --@NPCS@
THING_DATA = --@THINGS@

local by_id = {}
for _, q in ipairs(QUEST_DATA) do by_id[q.id] = q end

local realm = 1
local state = {}               -- quest id -> { status = "active" | "done", step = step id, n = kills, seen = { thing = true }, flags = {}, med = seconds }
local heard = {}               -- quest id -> true once the giver has told it (even if declined)
local tracked = nil            -- the quest id whose waypoint shows
local dueling = {}             -- person -> true while a duel with them is on
local session = nil            -- the conversation open: { who, kind, q, step, line }
local clock, check = 0, 0
local names = {}
for name in pairs(NPC_DATA) do names[#names + 1] = name end
for name in pairs(THING_DATA) do names[#names + 1] = name end
table.sort(names)

local function me() return player_id() end
local function silver() return inventory.count(me(), "Silver") end

-- ---- Saving
local function persist()
  local rows = {}
  for id, st in pairs(state) do
    local seen, flags = {}, {}
    for k in pairs(st.seen) do seen[#seen + 1] = k end
    for k in pairs(st.flags) do flags[#flags + 1] = k end
    table.sort(seen) table.sort(flags)
    rows[#rows + 1] = table.concat({ id, st.status, st.step or "", tostring(st.n), table.concat(seen, "+"), table.concat(flags, "+"), tostring(st.med) }, ",")
  end
  table.sort(rows)
  local told = {}
  for id in pairs(heard) do told[#told + 1] = id end
  table.sort(told)
  save.set("jianghu-quests", table.concat(rows, ";") .. "|" .. table.concat(told, ",") .. "|" .. (tracked or ""))
end

local function load()
  local text = save.get("jianghu-quests")
  if not text or text == "" then return end
  local rows, told, track = text:match("^(.*)|(.*)|(.*)$")
  if not rows then return end
  for row in rows:gmatch("[^;]+") do
    local id, status, step, n, seen, flags, med = row:match("^([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*)$")
    if id and by_id[id] then
      local st = { status = status, step = step ~= "" and step or nil, n = tonumber(n) or 0, seen = {}, flags = {}, med = tonumber(med) or 0 }
      for k in seen:gmatch("[^+]+") do st.seen[k] = true end
      for k in flags:gmatch("[^+]+") do st.flags[k] = true end
      state[id] = st
    end
  end
  for id in told:gmatch("[^,]+") do heard[id] = true end
  tracked = track ~= "" and track or nil
end

-- ---- Finding things
local function step_of(q, id)
  for i, s in ipairs(q.steps) do if s.id == id then return s, i end end
end
local function current(q)
  local st = state[q.id]
  if not st or st.status ~= "active" then return nil end
  return step_of(q, st.step)
end
local function available(q)
  if state[q.id] then return false end
  for _, need in ipairs(q.requires or {}) do if not (state[need] and state[need].status == "done") then return false end end
  return true
end
local function active_ids()
  local list = {}
  for _, q in ipairs(QUEST_DATA) do if state[q.id] and state[q.id].status == "active" then list[#list + 1] = q.id end end
  return list
end

-- ---- The journal, the objective and the one waypoint
local function progress_text(step, st)
  if step.kill then return string.format(" (%d/%d)", math.min(st.n, step.kill.n), step.kill.n) end
  if step.interact then
    local got = 0
    for _, t in ipairs(step.interact) do if st.seen[t] then got = got + 1 end end
    return string.format(" (%d/%d)", got, #step.interact)
  end
  if step.meditate then return string.format(" (%d/%d s)", math.min(math.floor(st.med), step.meditate), step.meditate) end
  return ""
end

local function journal()
  local lines = { "Journal" }
  local function add(q, kind, detail) lines[#lines + 1] = kind .. "|" .. q.name .. "|" .. detail end
  for _, id in ipairs(active_ids()) do
    local q, st = by_id[id], state[id]
    local step = current(q)
    local detail = step and (step.text .. progress_text(step, st)) or ""
    if step and step.have and inventory.count(me(), step.have.item) < step.have.n and step.recover then detail = detail .. " " .. step.recover end
    add(q, id == tracked and "active" or "todo", (id == tracked and "[tracked] " or "") .. detail)
  end
  for _, q in ipairs(QUEST_DATA) do
    if heard[q.id] and available(q) then add(q, "todo", "Speak to " .. q.giver .. ". " .. q.summary) end
  end
  for _, q in ipairs(QUEST_DATA) do
    if state[q.id] and state[q.id].status == "done" then add(q, "done", q.summary) end
  end
  if #lines == 1 then lines[2] = "todo|Nothing yet|Walk up to someone and press E." end
  ui.set_text("Quest log", table.concat(lines, "\n"))
end

local last_marker = ""
local function show_tracking()
  local q = tracked and by_id[tracked]
  local step = q and current(q)
  if not step then
    ui.set_text("Objective", "No quest tracked\nWalk up to someone and press E.")
    ui.set_value("Objective", 0)
    if last_marker ~= "" then ui.clear_marker("Quest") last_marker = "" end
    return
  end
  local st = state[q.id]
  ui.set_text("Objective", q.name .. "\n" .. step.text .. progress_text(step, st))
  local total = #q.steps
  local _, index = step_of(q, step.id)
  ui.set_value("Objective", (index - 1) / total)
  if step.where then
    local x, z = step.where[1], step.where[2]
    local key = string.format("%d,%d", x, z)
    local _, _, gx, gy = world.raycast(x, 400, z, 0, -1, 0, 800)
    local y = gy or (select(2, world.position(me())) or 0)
    ui.marker("Quest", x, y + 5, z, q.name)
    last_marker = key
  elseif last_marker ~= "" then
    ui.clear_marker("Quest")
    last_marker = ""
  end
end

local function track(id)
  tracked = id
  show_tracking()
  journal()
  persist()
end

-- ---- Moving a quest along
local begin_step, finish_step, complete_quest

function begin_step(q, id)
  local st = state[q.id]
  st.step, st.n, st.seen, st.med = id, 0, {}, 0
  local step = step_of(q, id)
  if step and step.interact then st.seen = {} end
  persist()
  show_tracking()
  journal()
end

function complete_quest(q)
  local st = state[q.id]
  st.status, st.step = "done", nil
  local r = q.reward or {}
  local parts = {}
  if r.silver then inventory.add(me(), "Silver", r.silver) parts[#parts + 1] = r.silver .. " silver" end
  if r.qi then world.send(me(), "qi", r.qi) parts[#parts + 1] = r.qi .. " qi" end
  for _, item in ipairs(r.items or {}) do inventory.add(me(), item, 1) end
  if r.items and #r.items > 0 then
    local counts, order = {}, {}
    for _, item in ipairs(r.items) do if not counts[item] then counts[item] = 0 order[#order + 1] = item end counts[item] = counts[item] + 1 end
    for _, item in ipairs(order) do parts[#parts + 1] = (counts[item] > 1 and (counts[item] .. " ") or "") .. item end
  end
  if r.manual then world.send(me(), "manual", r.manual) end
  if r.insight then world.send(me(), "insight", r.insight) end
  ui.set_text("Notification", "Quest complete\n" .. q.name .. (#parts > 0 and (": " .. table.concat(parts, ", ")) or ""))
  sound.play("book open")
  if tracked == q.id then
    local rest = active_ids()
    tracked = rest[1]
  end
  persist()
  show_tracking()
  journal()
end

function finish_step(q, choice)
  local st = state[q.id]
  local step, index = step_of(q, st.step)
  if not step then return end
  if choice and choice.flag then st.flags[choice.flag] = true end
  local nextid = (choice and choice.next) or step.next
  if not nextid then
    local following = q.steps[index + 1]
    nextid = following and following.id
  end
  if nextid then begin_step(q, nextid) else complete_quest(q) end
end

local function accept(q)
  state[q.id] = { status = "active", step = q.steps[1].id, n = 0, seen = {}, flags = {}, med = 0 }
  heard[q.id] = true
  ui.set_text("Notification", "Quest started\n" .. q.name)
  sound.play("book open")
  track(q.id)
end

-- ---- Events from the Player and the fighters
local function each_active(fn)
  for _, id in ipairs(active_ids()) do
    local q = by_id[id]
    local step = current(q)
    if step then fn(q, step, state[id]) end
  end
end

function on_message(name, value)
  if name == "lang" then set_language(value) return end
  value = tostring(value)
  if name == "realm" then realm = tonumber(value) or realm
  elseif name == "slain" then
    each_active(function(q, step, st)
      if step.kill and value:find(step.kill.name) then
        st.n = st.n + 1
        if st.n >= step.kill.n then finish_step(q) else persist() show_tracking() journal() end
      end
    end)
  elseif name == "duel_won" then
    dueling[value] = nil
    each_active(function(q, step) if step.duel == value then finish_step(q) end end)
  elseif name == "med" then
    local dt = tonumber(value) or 0
    each_active(function(q, step, st)
      if step.meditate then
        st.med = st.med + dt
        if st.med >= step.meditate then finish_step(q) end
      end
    end)
  end
end

-- ---- Talking
local function lines_of(session) return session.lines end

local function render()
  local s = session
  if not s then return end
  if s.page <= #s.lines then
    say(s.who, s.lines[s.page], { s.page < #s.lines and "Go on." or (#s.choices > 0 and "..." or "Farewell.") })
    s.paging = true
  else
    local texts = {}
    for _, c in ipairs(s.choices) do texts[#texts + 1] = c.text end
    say(s.who, s.closing or "", texts)
    s.paging = false
  end
end

local function open(who, lines, choices, onpick, closing)
  session = { who = who, lines = lines, choices = choices, page = 1, onpick = onpick, closing = closing }
  start_talk(who)
  render()
end

local function who_has_offer(who)
  for _, q in ipairs(QUEST_DATA) do
    if q.giver == who and available(q) then return q end
  end
end

local function talk_to(who)
  local data = NPC_DATA[who]
  -- 1. A quest step that asks for this person.
  local found
  each_active(function(q, step, st) if not found and step.talk and step.talk.npc == who then found = { q, step } end end)
  if found then
    local q, step = found[1], found[2]
    local choices = {}
    for _, c in ipairs(step.talk.choices or {}) do choices[#choices + 1] = c end
    if #choices == 0 then choices = { { text = "Thank you." } } end
    open(who, step.talk.lines, choices, function(choice) finish_step(q, choice) end, "")
    return
  end
  -- 2. A duel they are waiting for.
  local duel
  each_active(function(q, step) if not duel and step.duel == who then duel = q end end)
  if duel and not dueling[who] then
    open(who, { "Ready? To first yield. Nobody dies." }, { { text = "Begin." }, { text = "Not yet." } }, function(choice)
      if choice.text == "Begin." then
        dueling[who] = true
        local id = world.find(who)
        if id then world.send(id, "challenge", "") end
      end
    end, "")
    return
  end
  -- 3. A quest they have to give.
  local offer = who_has_offer(who)
  if offer then
    heard[offer.id] = true
    open(who, offer.offer.lines, { { text = offer.offer.accept, yes = true }, { text = offer.offer.decline } }, function(choice)
      if choice.yes then accept(offer) else persist() journal() end
    end, "")
    return
  end
  -- 4. Shops and small talk.
  if data and data.shop then
    world.send(world.find("Economy"), "open", data.shop)
    return
  end
  open(who, { data and data.chatter or "..." }, {}, function() end, "")
end

-- A notice board offers what is posted on it.
local function read_board(board)
  local list = {}
  for _, q in ipairs(QUEST_DATA) do if q.board == board and available(q) then list[#list + 1] = q end end
  if #list == 0 then open(board, { "Nothing new is posted." }, {}, function() end, "") return end
  local q = list[1]
  heard[q.id] = true
  open(board, { q.name .. ": " .. q.summary }, { { text = "Take the job.", yes = true }, { text = "Leave it." } }, function(choice)
    if choice.yes then accept(q) end
  end, "")
end

local function touch(thing)
  local data = THING_DATA[thing]
  if data.action == "waystone" then
    world.send(world.find("World"), "waystone", thing)
    return
  elseif data.action == "board" then
    read_board(thing)
    return
  end
  local taken = false
  each_active(function(q, step, st)
    if step.interact then
      for _, t in ipairs(step.interact) do
        if t == thing and not st.seen[t] then
          st.seen[t] = true
          taken = true
          ui.set_text("Notification", (data.note and data.note ~= "") and (thing .. "\n" .. data.note) or thing)
          local all = true
          for _, need in ipairs(step.interact) do if not st.seen[need] then all = false end end
          if all then
            for _, item in ipairs(data.give or {}) do inventory.add(me(), item, 1) end
            finish_step(q)
          else
            persist() show_tracking() journal()
          end
        end
      end
    end
  end)
  if not taken then ui.set_text("Notification", thing .. "\n" .. ((data.note and data.note ~= "") and data.note or "Nothing more to find here.")) end
end

local function choose(n)
  local s = session
  if not s then return end
  if s.page <= #s.lines then
    s.page = s.page + 1
    if s.page > #s.lines and #s.choices == 0 then end_talk() session = nil return end
    render()
    return
  end
  local choice = s.choices[n]
  if not choice then return end
  local pick = s.onpick
  end_talk()
  session = nil
  pick(choice)
end

-- ---- The tick
local function prompt_for(name)
  local data = NPC_DATA[name] or THING_DATA[name]
  if not data then return "talk" end
  if THING_DATA[name] then return THING_DATA[name].prompt end
  local suffix = ""
  local mark = false
  each_active(function(q, step) if (step.talk and step.talk.npc == name) or step.duel == name then mark = true end end)
  if mark or who_has_offer(name) then suffix = " (quest)" end
  return (data.shop and ("trade with " .. name) or ("talk to " .. name)) .. suffix
end

function on_tick(dt)
  tap_tick(dt)
  clock = clock + dt
  check = check + dt
  local p = me()
  if not p then return end
  if talking then
    local n = talk_poll()
    if not talking then session = nil end
    if n then choose(n) end
    return
  end
  -- Enter cycles which quest shows a waypoint: each active quest in turn, then none.
  if tapped("track") then
    local list = active_ids()
    local at = 0
    for i, id in ipairs(list) do if id == tracked then at = i end end
    if at >= #list then
      track(nil)
      ui.set_text("Notification", "Waypoint off\nNo quest is tracked.")
    else
      track(list[at + 1])
      ui.set_text("Notification", "Tracking\n" .. by_id[list[at + 1]].name)
    end
  end
  -- Conditions that watch the world: standing somewhere, carrying something.
  if check >= 0.25 then
    check = 0
    local x, _, z = world.position(p)
    each_active(function(q, step, st)
      if step.reach and (x - step.reach[1]) ^ 2 + (z - step.reach[2]) ^ 2 <= step.reach[3] ^ 2 then finish_step(q)
      elseif step.have and inventory.count(p, step.have.item) >= step.have.n then finish_step(q) end
    end)
  end
  if clock >= 1 then
    clock = 0
    journal()
  end
  -- What E would do here, and doing it.
  local near = nearest_within(names, 3.6)
  if near then
    world.send(p, "prompt", prompt_for(near))
    if tapped("interact") then
      if THING_DATA[near] then touch(near) else talk_to(near) end
    end
  end
end

function on_start()
  load()
  after(0.6, function()
    if not tracked then
      local list = active_ids()
      tracked = list[1]
    end
    show_tracking()
    journal()
    if next(state) == nil and not heard.letter then
      -- A new road: the first person to speak to is at the south gate.
      ui.set_text("Notification", "Jianghu Road\nSpeak to Gatekeeper Jun (E) at the south gate.")
    end
  end)
end
