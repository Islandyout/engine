-- The valley's economy (the scene builder places items.lua in front of this): the merchant's shop with buying, selling and
-- buy-back, the alchemy furnace, the anvil that tempers gear, and the quick-slot row. Windows are the Shop window widget;
-- a click arrives as on_ui("Shop window", "pick:<id>" | "tab:<n>" | "page:<±1>" | "close").
local player
local mode = nil            -- "merchant", "alchemy" or "forge"
local tab, page = 1, 1
local buyback = {}          -- { name, n, price } the player sold, newest first
local discount = 0          -- from reputation (Sect sends it)
local note = nil            -- a line shown in place of the subtitle for a moment
local note_left = 0
local clock = 0
local PER_PAGE = 6

-- What the merchant sells: name, price override (otherwise the item's own buy price), and the reputation it needs.
local STOCK = {
  { "Qi Elixir" }, { "Jade Dew Pill" }, { "Arrow", 2, count = 10 }, { "Fire Talisman" }, { "Ward Talisman" },
  { "Breakthrough Pill" }, { "Array Flag" }, { "Iron Gloves" }, { "Jade Circlet" }, { "Tiger Gloves", rep = 20 }, { "Spirit Stone", rep = 10 },
}
local RECIPES = {
  { id = "elixir", out = "Qi Elixir", needs = { ["Spirit Herb"] = 3 } },
  { id = "dew", out = "Jade Dew Pill", needs = { ["Spirit Herb"] = 2 } },
  { id = "pill", out = "Breakthrough Pill", needs = { ["Spirit Herb"] = 8, ["Spirit Stone"] = 1, Silver = 40 } },
  { id = "fire", out = "Fire Talisman", needs = { ["Spirit Herb"] = 2, Silver = 10 } },
  { id = "ward", out = "Ward Talisman", needs = { ["Spirit Herb"] = 3, Silver = 10 } },
  { id = "flag", out = "Array Flag", needs = { ["Spirit Herb"] = 4, ["Spirit Stone"] = 1 } },
  { id = "venison", out = "Venison", needs = { ["Raw Venison"] = 1 } },
}
local rep_good = 0          -- the sect's regard for you, sent by the Sect script

local function me() player = player or world.find("Player") return player end
local function silver() return inventory.count(me(), "Silver") end
local function price_of(name, override) return math.max(1, math.floor((override or ITEMS[name].buy or 1) * (1 - discount) + 0.5)) end
local function say(text) note = text note_left = 3 end

local function needs_text(needs)
  local parts = {}
  for name, n in pairs(needs) do parts[#parts + 1] = n .. " " .. (name == "Silver" and "silver" or name) end
  table.sort(parts)
  return table.concat(parts, ", ")
end
local function has_all(needs)
  for name, n in pairs(needs) do if inventory.count(me(), name) < n then return false end end
  return true
end

local function rows_buy()
  local rows = {}
  for _, entry in ipairs(STOCK) do
    local name, item = entry[1], ITEMS[entry[1]]
    local count = entry.count or 1
    local price = price_of(name, entry[2] and entry[2] * count or nil) * (entry[2] and 1 or count)
    local state = "ok"
    if entry.rep and rep_good < entry.rep then state = "locked" end
    rows[#rows + 1] = { id = name, name = name .. (count > 1 and (" x" .. count) or ""), icon = item.icon, right = state == "locked" and ("needs standing " .. entry.rep) or (price .. " silver"), state = state, detail = item.desc, price = price, count = count }
  end
  return rows
end

local function rows_sell()
  local rows = {}
  local names = {}
  for name in pairs(inventory.list(me())) do names[#names + 1] = name end
  table.sort(names)
  for _, name in ipairs(names) do
    local item = ITEMS[name]
    local have = inventory.count(me(), name)
    if item and (item.sell or 0) > 0 and have > 0 and inventory.equipped(me(), GEAR_SLOT[name] or "none") ~= name then
      rows[#rows + 1] = { id = name, name = name .. (have > 1 and (" x" .. have) or ""), icon = item.icon, right = item.sell .. " silver", state = "ok", detail = item.desc }
    end
  end
  return rows
end

local function rows_back()
  local rows = {}
  for i, b in ipairs(buyback) do
    rows[#rows + 1] = { id = tostring(i), name = b.name .. (b.n > 1 and (" x" .. b.n) or ""), icon = ITEMS[b.name].icon, right = b.price .. " silver", state = "ok", detail = "Buy back what you sold." }
  end
  return rows
end

local function rows_alchemy()
  local rows = {}
  for _, r in ipairs(RECIPES) do
    rows[#rows + 1] = { id = r.id, name = r.out, icon = ITEMS[r.out].icon, right = needs_text(r.needs), state = has_all(r.needs) and "ok" or "locked", detail = ITEMS[r.out].desc }
  end
  return rows
end

local function rows_forge()
  local rows = {}
  for name, up in pairs(GEAR_UP) do
    if inventory.count(me(), name) > 0 then
      local needs = { ["Iron Ore"] = up.ore, Silver = up.silver }
      if up.stone > 0 then needs["Spirit Stone"] = up.stone end
      rows[#rows + 1] = { id = name, name = name .. " > " .. up.to, icon = ITEMS[up.to].icon, right = needs_text(needs), state = has_all(needs) and "ok" or "locked", detail = ITEMS[up.to].desc }
    end
  end
  table.sort(rows, function(a, b) return a.id < b.id end)
  return rows
end

local function rows_now()
  if mode == "merchant" then return tab == 1 and rows_buy() or tab == 2 and rows_sell() or rows_back() end
  if mode == "alchemy" then return rows_alchemy() end
  return rows_forge()
end

local TITLES = { merchant = "Merchant Lin", alchemy = "Alchemy furnace", forge = "Anvil" }

local function show()
  if not mode then return end
  local rows = rows_now()
  local pages = math.max(1, math.ceil(#rows / PER_PAGE))
  page = math.max(1, math.min(page, pages))
  local lines = { TITLES[mode], note or (silver() .. " silver") }
  if mode == "merchant" then lines[#lines + 1] = string.format("tabs|%d|Buy|Sell|Buy back", tab) end
  for i = (page - 1) * PER_PAGE + 1, math.min(#rows, page * PER_PAGE) do
    local r = rows[i]
    lines[#lines + 1] = string.format("row|%s|%s|%s|%s|%s|%s", r.id, r.name, r.icon, r.right, r.state, r.detail)
  end
  if pages > 1 then lines[#lines + 1] = string.format("page|%d|%d", page, pages) end
  ui.set_text("Shop window", table.concat(lines, "\n"))
end

local function open(kind)
  mode, tab, page, note = kind, 1, 1, nil
  ui.open("Shop window")
  show()
end

local function close()
  mode = nil
  ui.close("Shop window")
end

local function add_item(name, n)
  return inventory.add(me(), name, n)
end

local function pick(id)
  if mode == "merchant" then
    if tab == 1 then
      for _, r in ipairs(rows_buy()) do
        if r.id == id then
          if silver() < r.price then say("You cannot afford that.")
          elseif inventory.space(me(), id) < r.count then say("You cannot carry more.")
          else
            inventory.remove(me(), "Silver", r.price)
            add_item(id, r.count)
            sound.play("coin handle")
            say("Bought " .. id .. ".")
          end
        end
      end
    elseif tab == 2 then
      local have = inventory.count(me(), id)
      local item = ITEMS[id]
      if item and have > 0 then
        local n = math.min(have, id == "Arrow" and 10 or 1)
        inventory.remove(me(), id, n)
        inventory.add(me(), "Silver", item.sell * n)
        table.insert(buyback, 1, { name = id, n = n, price = item.sell * n * 2 })
        if #buyback > 8 then table.remove(buyback) end
        sound.play("coin handle")
        say("Sold " .. id .. " for " .. item.sell * n .. ".")
      end
    else
      local b = buyback[tonumber(id)]
      if b then
        if silver() < b.price then say("You cannot afford that.")
        else
          inventory.remove(me(), "Silver", b.price)
          add_item(b.name, b.n)
          table.remove(buyback, tonumber(id))
          sound.play("coin handle")
          say("Bought back " .. b.name .. ".")
        end
      end
    end
  elseif mode == "alchemy" then
    for _, r in ipairs(RECIPES) do
      if r.id == id then
        if not has_all(r.needs) then say("You lack the ingredients.")
        elseif inventory.space(me(), r.out) < 1 then say("You cannot carry more.")
        else
          for name, n in pairs(r.needs) do inventory.remove(me(), name, n) end
          add_item(r.out, 1)
          sound.play("force field")
          say("The furnace glows: " .. r.out .. ".")
          world.send(world.find("Sect"), "brewed", r.out)
        end
      end
    end
  elseif mode == "forge" then
    local up = GEAR_UP[id]
    if up and inventory.count(me(), id) > 0 then
      local needs = { ["Iron Ore"] = up.ore, Silver = up.silver }
      if up.stone > 0 then needs["Spirit Stone"] = up.stone end
      if not has_all(needs) then say("You lack the materials.")
      else
        local slot = GEAR_SLOT[id]
        local worn = slot and inventory.equipped(me(), slot) == id
        if worn then inventory.unequip(me(), slot) end
        for name, n in pairs(needs) do inventory.remove(me(), name, n) end
        inventory.remove(me(), id, 1)
        add_item(up.to, 1)
        if worn then inventory.equip(me(), slot, up.to) end
        sound.play("metal hit")
        say(id .. " becomes " .. up.to .. ".")
        world.send(world.find("Sect"), "forged", up.to)
      end
    end
  end
  show()
end

function on_message(name, value)
  if name == "lang" then set_language(value) return end
  if name == "open" then open(tostring(value))
  elseif name == "discount" then discount = tonumber(value) or 0
  elseif name == "standing" then rep_good = tonumber(value) or 0 end
end

function on_ui(name, value)
  if name ~= "Shop window" then return end
  value = tostring(value)
  if value == "close" then close()
  elseif value:sub(1, 5) == "pick:" then pick(value:sub(6))
  elseif value:sub(1, 4) == "tab:" then tab = tonumber(value:sub(5)) or 1 page = 1 show()
  elseif value:sub(1, 5) == "page:" then page = page + (tonumber(value:sub(6)) or 0) show() end
end

function on_start()
  me()
  ui.set_text("Inventory", inventory_notes())
end

function on_tick(dt)
  clock = clock + dt
  if note_left > 0 then
    note_left = note_left - dt
    if note_left <= 0 then note = nil if mode then show() end end
  end
  -- The quick-slot row: consumables on keys with their counts.
  if clock >= 0.4 and me() then
    clock = 0
    local function row(key, icon, name, label) return string.format("%s|%s|%d|%s", key, icon, inventory.count(player, name), label) end
    ui.set_text("Quick slots", table.concat({
      row("H", "potion", "Qi Elixir", "Qi Elixir"),
      row("Z", "pill", "Jade Dew Pill", "Jade Dew"),
      row("8", "scroll", "Fire Talisman", "Fire Talisman"),
      row("9", "scroll", "Ward Talisman", "Ward Talisman"),
      row("Y", "bullet", "Arrow", "Arrows"),
    }, "\n"))
  end
end
