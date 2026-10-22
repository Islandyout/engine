-- The valley's items: what each is called, how rare, what it does, what it costs and sells for. Shared by the
-- scripts that need it (this file is placed in front of them by the scene builder).
-- tier: 0 common, 1 uncommon, 2 rare, 3 epic, 4 legendary. buy/sell are silver; use marks a consumable.
ITEMS = {
  ["Qi Elixir"]         = { tier = 1, icon = "potion", desc = "Restores 60 qi. Key H.", buy = 20, sell = 8, use = true },
  ["Jade Dew Pill"]     = { tier = 1, icon = "pill",   desc = "Heals 60 and cures poison, bleeding and burns. Key Z.", buy = 14, sell = 6, use = true },
  ["Breakthrough Pill"] = { tier = 3, icon = "pill",   desc = "Needed to break through a realm.", buy = 120, sell = 50 },
  ["Spirit Herb"]       = { tier = 0, icon = "gem",    desc = "Glows faintly. Brewed into pills and elixirs.", sell = 3 },
  ["Spirit Stone"]      = { tier = 2, icon = "gem",    desc = "Dense qi in crystal. Used to temper gear and brew rare pills.", buy = 90, sell = 40 },
  ["Iron Ore"]          = { tier = 0, icon = "gem",    desc = "Raw metal for the anvil.", sell = 6 },
  ["Arrow"]             = { tier = 0, icon = "bullet", desc = "For the bow stance.", buy = 1, sell = 1 },
  ["Silver Carp"]       = { tier = 0, icon = "gem",    desc = "Fresh from the lake. Eat to heal 25.", sell = 8, use = true },
  ["Venison"]           = { tier = 0, icon = "gem",    desc = "Cooked meat. Eat to heal 35.", sell = 10, use = true },
  ["Raw Venison"]       = { tier = 0, icon = "gem",    desc = "Cook it at the furnace.", sell = 4 },
  ["Deer Hide"]         = { tier = 0, icon = "robe",   desc = "A good hide. Sells well.", sell = 12 },
  ["Wolf Pelt"]         = { tier = 1, icon = "robe",   desc = "Thick grey fur.", sell = 25 },
  ["Fire Talisman"]     = { tier = 1, icon = "scroll", desc = "Bursts into flame around you, burning nearby foes. Key 9.", buy = 35, sell = 12, use = true },
  ["Ward Talisman"]     = { tier = 1, icon = "scroll", desc = "A shield of qi that soaks the next 60 damage for 20 s.", buy = 40, sell = 14, use = true },
  ["Array Flag"]        = { tier = 2, icon = "scroll", desc = "Plant a qi-gathering formation: meditation is doubled inside it for two minutes.", buy = 80, sell = 25, use = true },
  ["Azure Robe"]        = { tier = 1, icon = "robe",   desc = "Armor 10.", sell = 20 },
  ["Azure Robe +1"]     = { tier = 1, icon = "robe",   desc = "Armor 14.", sell = 45 },
  ["Azure Robe +2"]     = { tier = 2, icon = "robe",   desc = "Armor 18, health 20.", sell = 90 },
  ["Azure Robe +3"]     = { tier = 3, icon = "robe",   desc = "Armor 24, health 40.", sell = 160 },
  ["Iron Gloves"]       = { tier = 1, icon = "sword",  desc = "Damage +10.", buy = 150, sell = 50 },
  ["Iron Gloves +1"]    = { tier = 1, icon = "sword",  desc = "Damage +14.", sell = 80 },
  ["Iron Gloves +2"]    = { tier = 2, icon = "sword",  desc = "Damage +20.", sell = 130 },
  ["Tiger Gloves"]      = { tier = 2, icon = "sword",  desc = "Damage +18. Worn by Sect Core disciples.", buy = 320, sell = 110 },
  ["Jade Circlet"]      = { tier = 2, icon = "gem",    desc = "Health +30.", buy = 260, sell = 90 },
  ["Dragon Crown"]      = { tier = 4, icon = "gem",    desc = "Health +60, damage +10. From the cave's guardian.", sell = 400 },
  ["Cloud Silk Robe"]   = { tier = 3, icon = "robe",   desc = "Armor 20, health 30.", sell = 220 },
  ["Jade Charm"]        = { tier = 2, icon = "gem",    desc = "Health +25.", sell = 70 },
  ["Alpha Pelt"]        = { tier = 2, icon = "robe",   desc = "Gray Mane's pelt. Hunter Bo will want to see it.", sell = 60 },
  ["Black Wind Token"]  = { tier = 2, icon = "star",   desc = "A black knot on red cord. It opens doors at the Black Wind Gang.", sell = 0 },
  ["Barge Key"]         = { tier = 1, icon = "gem",    desc = "A brass key stamped with Port Jade's mark.", sell = 0 },
  ["Jade Bamboo Sword"] = { tier = 4, icon = "sword",  desc = "Damage +25%. Cut from the still grove: it never makes a sound until it strikes.", sell = 600 },
  ["Silver Pier Sash"]  = { tier = 3, icon = "robe",   desc = "Speed +6%, health +30. Wei's master wore it.", sell = 240 },
  ["Silver"]            = { tier = 0, icon = "coin",   desc = "Coin of the valley.", sell = 0 },
  ["Sect Token"]        = { tier = 2, icon = "star",   desc = "Proof of rank in the Azure Cloud Sect.", sell = 0 },
}

-- Gear that can be tempered at the anvil: item -> the next version and what it costs.
GEAR_UP = {
  ["Azure Robe"]     = { to = "Azure Robe +1", ore = 3, stone = 0, silver = 40 },
  ["Azure Robe +1"]  = { to = "Azure Robe +2", ore = 5, stone = 1, silver = 90 },
  ["Azure Robe +2"]  = { to = "Azure Robe +3", ore = 8, stone = 2, silver = 180 },
  ["Iron Gloves"]    = { to = "Iron Gloves +1", ore = 4, stone = 0, silver = 50 },
  ["Iron Gloves +1"] = { to = "Iron Gloves +2", ore = 7, stone = 1, silver = 120 },
}
GEAR_SLOT = {
  ["Azure Robe"] = "body", ["Azure Robe +1"] = "body", ["Azure Robe +2"] = "body", ["Azure Robe +3"] = "body", ["Cloud Silk Robe"] = "body",
  ["Iron Gloves"] = "hands", ["Iron Gloves +1"] = "hands", ["Iron Gloves +2"] = "hands", ["Tiger Gloves"] = "hands",
  ["Jade Circlet"] = "head", ["Dragon Crown"] = "head", ["Jade Bamboo Sword"] = "weapon", ["Silver Pier Sash"] = "waist",
}

-- The Inventory widget's notes: one "Name|tier|description|use" line for every item.
function inventory_notes()
  local lines = {}
  for name, item in pairs(ITEMS) do
    lines[#lines + 1] = string.format("%s|%d|%s|%s", name, item.tier, item.desc, item.use and "use" or "")
  end
  table.sort(lines)
  return table.concat(lines, "\n")
end
