-- @prop loot none
-- A crate, barrel or jar: it breaks when struck and may hold something (props.loot: "Item:chance Item:chance").
function on_death(attacker)
  local player = world.find("Player")
  if player then
    for item, chance in tostring(props.loot or ""):gmatch("([%w ]+):([%d.]+)") do
      if item ~= "none" and math.random() < tonumber(chance) then
        inventory.add(player, item, 1)
        hud.announce("You find a " .. item .. ".")
      end
    end
  end
  sound.play("metal hit")
  after(0.05, function() world.destroy(self.id) end)
end
