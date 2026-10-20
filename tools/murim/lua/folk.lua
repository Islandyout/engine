-- The people and shrines of the valley (the scene builder places items.lua and talk.lua in front of this): every
-- conversation that is not a shop. Instructor Hua teaches scroll arts and qi affinities, Wen has a lost cart, shrines save
-- and send you between each other, Stablemaster Gu rides you there and keeps a spirit fox, Disciple Lan joins your side.
-- The merchant, the furnace and the anvil open the Shop window instead.
local realm = 1
local arts = {}                 -- move -> true, once learned
local affinity = ""
local cart = nil                -- Wen's side quest: nil, "active", "found", "done"
local found = {}                -- shrine entity name -> true once visited
local node, sub = "root", 1
local travel_at = 1
local fox_owned = false
local lan_following = false
local clock = 0

local ARTS = {
  { move = "sword_qi",      name = "Sword Qi",      price = 80,  key = "5", info = "a crescent of sword light", realm = 2 },
  { move = "thunder_lance", name = "Thunder Lance", price = 140, key = "6", info = "a fast bolt that staggers", realm = 2 },
  { move = "flame_palm",    name = "Flame Palm",    price = 100, key = "7", info = "a fireball that sets foes alight", realm = 2 },
  { move = "guardian",      name = "Spirit Guardian", price = 260, key = "0", info = "calls a spirit warrior for 25 s", realm = 3 },
}
local AFFINITIES = {
  { id = "flame", name = "Flame", info = "your arts burn" },
  { id = "frost", name = "Frost", info = "your arts chill and slow" },
  { id = "thunder", name = "Thunder", info = "your arts stun" },
}
-- Where you can pray or ride to: the entity, what it is called, and where you stand when you arrive.
local SHRINES = {
  { entity = "Meditation altar", label = "the Sect altar" },
  { entity = "Wayside shrine", label = "the Wayside shrine" },
  { entity = "Village shrine", label = "Willow Village" },
  { entity = "Peak shrine", label = "Heaven Peak" },
}
local TALKERS = { "Instructor Hua", "Wen", "Stablemaster Gu", "Disciple Lan", "Wayside shrine", "Meditation altar", "Village shrine", "Peak shrine" }
local USERS = { ["Merchant Lin"] = "merchant", ["Alchemy furnace"] = "alchemy", Anvil = "forge" }
local PROMPT = { ["Merchant Lin"] = "trade with Merchant Lin", ["Alchemy furnace"] = "use the alchemy furnace", Anvil = "use the anvil",
  ["Wayside shrine"] = "pray at the wayside shrine", ["Meditation altar"] = "pray at the Sect altar", ["Village shrine"] = "pray at the village shrine", ["Peak shrine"] = "pray at the peak shrine" }

-- Folk's own saved state: shrines found, the side quest, the fox and Lan.
local function persist()
  local list = {}
  for entity in pairs(found) do list[#list + 1] = entity end
  save.set("azure-cloud-sect-folk", string.format("found=%s;cart=%s;fox=%s;lan=%s", table.concat(list, ","), cart or "", fox_owned and "1" or "0", lan_following and "1" or "0"))
end

local function silver() return inventory.count(player_id(), "Silver") end
local function silver_note() return " You have " .. silver() .. " silver." end
local function is_shrine(name) return name:find("shrine") or name:find("altar") end

local function discovered()
  local list = {}
  for _, s in ipairs(SHRINES) do if found[s.entity] then list[#list + 1] = s end end
  return list
end

-- The conversation each name opens, and what its choices do.
local render, choose

function render(note)
  local name = talking
  if name == "Instructor Hua" then
    if node == "root" then
      say(name, note or "A scroll holds an art; the rest is practice. What would you like?", { "Scroll arts", "Qi affinity", "My standing in the sect" })
    elseif node == "arts" then
      if realm < 2 then say(name, "Qi arts need a body that holds qi. Come back as a Qi Gathering cultivator.", {}) return end
      local choices = {}
      local first = sub == 1 and 1 or 3
      for i = first, math.min(first + 1, #ARTS) do
        local a = ARTS[i]
        choices[#choices + 1] = arts[a.move] and (a.name .. ": learned, key " .. a.key)
          or (realm < a.realm and (a.name .. ": needs " .. (a.realm == 3 and "Foundation" or "Qi Gathering")) or (a.name .. " (" .. a.price .. "): " .. a.info))
      end
      choices[#choices + 1] = sub == 1 and "More arts..." or "Back to the first scrolls"
      say(name, note or ("Choose a scroll." .. silver_note()), choices)
    elseif node == "affinity" then
      local choices = {}
      for _, a in ipairs(AFFINITIES) do choices[#choices + 1] = a.name .. (affinity == a.id and " (yours)" or ": " .. a.info) end
      say(name, note or (affinity == "" and "Your qi leans one way. Name it." or "Your qi can lean another way, for 100 silver."), choices)
    elseif node == "standing" then
      say(name, note or "Walk the road and the sect will see it.", {})
    end
  elseif name == "Wen" then
    if cart == nil then say(name, "Bandits took my cart on the road. It was last seen near the old watchtower. Could you look?", { "I will look for it.", "Not now." })
    elseif cart == "active" then say(name, "Any sign of my cart?", { "Still looking." })
    elseif cart == "found" then say(name, "My cart! Thank you. Take this, it is all I have.", { "Accept the reward" })
    else say(name, "The valley is safer with you in it.", { "Farewell." }) end
  elseif name == "Stablemaster Gu" then
    if node == "root" then
      say(name, note or "A good horse covers the valley before the tea cools.", { "Ride to a shrine (10 silver)", fox_owned and "Send the spirit fox away" or "Adopt a spirit fox (150 silver)", "Leave" })
    elseif node == "travel" then
      local list = discovered()
      local dest = list[travel_at]
      say(name, note or (dest and ("To " .. dest.label .. ".") or "You have not found a shrine to ride to."), dest and { "Ride there (10 silver)", "Another place", "Back" } or { "Back" })
    end
  elseif name == "Disciple Lan" then
    say(name, note or (lan_following and "Lead on, senior." or "I could walk with you, if you like."), { lan_following and "Wait here." or "Walk with me.", "Spar with me", "Never mind" })
  elseif is_shrine(name) then
    if node == "root" then
      say(name, note or "A quiet place. Pray here to rest and make it your place of return, or ride on to another shrine.", { "Pray and rest", "Travel to another shrine", "Change robes" })
    elseif node == "travel" then
      local list = discovered()
      local dest = list[travel_at]
      say(name, note or (dest and ("To " .. dest.label .. ".") or "No other shrine is known to you."), dest and { "Go there", "Another place", "Back" } or { "Back" })
    end
  end
end

local function travel_to(dest, price)
  if price and silver() < price then render("You need " .. price .. " silver.") return end
  if price then inventory.remove(player_id(), "Silver", price) end
  local id = world.find(dest.entity)
  if not id then return end
  local x, y, z = world.position(id)
  end_talk()
  world.send(world.find("Valley"), "travel", string.format("%.2f,%.2f,%.2f|%s", x + 2.5, y + 1.2, z + 2.5, dest.label))
end

function choose(n)
  local name = talking
  local p = player_id()
  if name == "Instructor Hua" then
    if node == "root" then
      if n == 1 then node, sub = "arts", 1 render()
      elseif n == 2 then node = "affinity" render()
      else node = "standing" world.send(world.find("Sect"), "standing", "") render("Ask the mission board in the Great Hall.") end
    elseif node == "arts" then
      if realm < 2 then end_talk() return end
      if n == 3 then sub = 3 - sub render() return end
      local a = ARTS[(sub == 1 and 0 or 2) + n]
      if not a then render() return end
      if arts[a.move] then render("You already know " .. a.name .. ": press " .. a.key .. ".")
      elseif realm < a.realm then render("You are not ready for it.")
      elseif silver() < a.price then render("The scroll costs " .. a.price .. " silver." .. silver_note())
      else
        inventory.remove(p, "Silver", a.price)
        arts[a.move] = true
        world.send(p, "learn_art", a.move)
        sound.play("book open")
        render("Well studied. Press " .. a.key .. " in a fight.")
      end
    elseif node == "affinity" then
      local a = AFFINITIES[n]
      if not a then return end
      if affinity == a.id then render("It already is.")
      elseif affinity ~= "" and silver() < 100 then render("Changing it costs 100 silver.")
      else
        if affinity ~= "" then inventory.remove(p, "Silver", 100) end
        affinity = a.id
        world.send(p, "affinity", a.id)
        sound.play("force field")
        render("Your qi is " .. a.name .. " now: " .. a.info .. ".")
      end
    end
  elseif name == "Wen" then
    if cart == nil and n == 1 then
      cart = "active"
      sound.play("book open")
      ui.set_text("Notification", "Side quest\nFind Wen's cart near the old watchtower.")
      world.send(world.find("Sect"), "side", "wen|active")
      persist()
      render()
    elseif cart == "found" and n == 1 then
      cart = "done"
      inventory.add(p, "Silver", 60)
      inventory.add(p, "Qi Elixir", 2)
      ui.set_text("Notification", "Side quest complete\n60 silver and 2 Qi Elixirs.")
      world.send(world.find("Sect"), "side", "wen|done")
      persist()
      render()
    else end_talk() end
  elseif name == "Stablemaster Gu" then
    if node == "root" then
      if n == 1 then node, travel_at = "travel", 1 render()
      elseif n == 2 then
        if fox_owned then
          fox_owned = false
          world.send(world.find("Spirit Fox"), "dismiss", "")
          persist()
          render("The fox trots off to the woods.")
        elseif silver() < 150 then render("A fox costs 150 silver." .. silver_note())
        else
          inventory.remove(p, "Silver", 150)
          fox_owned = true
          world.send(world.find("Spirit Fox"), "adopt", "")
          persist()
          sound.play("force field")
          render("She will follow you and sniff out herbs.")
        end
      else end_talk() end
    elseif node == "travel" then
      local list = discovered()
      if n == 1 and list[travel_at] then travel_to(list[travel_at], 10)
      elseif n == 2 and #list > 0 then travel_at = travel_at % #list + 1 render()
      else node = "root" render() end
    end
  elseif name == "Disciple Lan" then
    if n == 1 then
      lan_following = not lan_following
      persist()
      world.send(world.find("Disciple Lan"), lan_following and "follow" or "wait", "")
      render()
    elseif n == 2 then
      end_talk()
      world.send(world.find("Disciple Lan"), "spar", "")
    else end_talk() end
  elseif is_shrine(name) then
    if node == "root" then
      if n == 1 then
        local sx, sy, sz = world.position(world.find(name))
        world.send(p, "rest", string.format("%.2f,%.2f,%.2f", sx + 2.2, sy + 1.2, sz + 2.2))
        render("Rested. This is now where you return.")
      elseif n == 2 then node, travel_at = "travel", 1 render()
      else world.send(p, "robe", "next") render("The robes change.") end
    elseif node == "travel" then
      local list = discovered()
      if n == 1 and list[travel_at] then travel_to(list[travel_at], nil)
      elseif n == 2 and #list > 0 then travel_at = travel_at % #list + 1 render()
      else node = "root" render() end
    end
  end
end

function on_message(name, value)
  if name == "realm" then realm = tonumber(value) or realm
  elseif name == "arts" then for move in tostring(value):gmatch("[^,]+") do arts[move] = true end
  elseif name == "affinity" then affinity = tostring(value)
  elseif name == "fox" then fox_owned = value == "1"
  elseif name == "cart" then cart = value ~= "" and tostring(value) or nil
  elseif name == "found" then for entity in tostring(value):gmatch("[^,]+") do found[entity] = true end end
end

function on_tick(dt)
  tap_tick(dt)
  clock = clock + dt
  local p = player_id()
  if not p then return end
  -- The cart is found by walking up to it.
  if cart == "active" then
    local d = distance_to("Lost Cart")
    if d and d < 5 then
      cart = "found"
      ui.set_text("Notification", "Side quest\nYou found Wen's cart. Return to him.")
      world.send(world.find("Sect"), "side", "wen|found")
      persist()
    end
  end
  -- Shrines you have been near can be travelled to.
  if clock >= 1 then
    clock = 0
    local fresh = {}
    for _, s in ipairs(SHRINES) do
      local d = distance_to(s.entity)
      if d and d < 12 and not found[s.entity] then
        found[s.entity] = true
        fresh[#fresh + 1] = s.entity
        if s.entity ~= "Meditation altar" then ui.set_text("Notification", "Shrine found\n" .. s.label) end
      end
    end
    if #fresh > 0 then world.send(world.find("Sect"), "shrines", tostring(#discovered())) persist() end
  end
  if talking then
    local n = talk_poll()
    if n then choose(n) end
    return
  end
  -- What E would do here (the Player script shows it), and doing it.
  local near = nearest_within(TALKERS)
  local user = nearest_within({ "Merchant Lin", "Alchemy furnace", "Anvil" })
  local target = near or user
  local label
  if target then
    label = PROMPT[target] or ("talk to " .. target)
    world.send(p, "prompt", label)
  end
  if target and tapped("interact") then
    if USERS[target] then world.send(world.find("Economy"), "open", USERS[target])
    else
      start_talk(target)
      node, sub = "root", 1
      if target == "Wen" or target == "Disciple Lan" then node = "root" end
      render()
    end
  end
end

function on_start()
  local text = save.get("azure-cloud-sect-folk")
  if not text or text == "" then return end
  local f = {}
  for k, v in text:gmatch("(%w+)=([^;]*)") do f[k] = v end
  for entity in (f.found or ""):gmatch("[^,]+") do found[entity] = true end
  cart = f.cart ~= "" and f.cart or nil
  fox_owned = f.fox == "1"
  lan_following = f.lan == "1"
  after(0.5, function()
    if fox_owned then world.send(world.find("Spirit Fox"), "adopt", "") end
    if lan_following then world.send(world.find("Disciple Lan"), "follow", "") end
    if cart then world.send(world.find("Sect"), "side", "wen|" .. cart) end
  end)
end
