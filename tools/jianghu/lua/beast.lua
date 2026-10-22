-- @prop kind deer
-- @prop loot none
-- Animals you can hunt: a deer gives raw venison and a hide; a wolf (it chases on its own) gives a pelt, qi and trouble.
-- A named beast (props.loot) drops its trophy as well, and every kill is reported by name for the quests.
function on_death(attacker)
  local player = world.find("Player")
  if not player then return end
  local kind = props.kind or "deer"
  if kind == "deer" then
    inventory.add(player, "Raw Venison", math.random(1, 2))
    inventory.add(player, "Deer Hide", 1)
    hud.announce("You skin the deer.")
  else
    inventory.add(player, "Wolf Pelt", 1)
    world.send(player, "kill", 12 * (realm_of(world.name(self.id)) ^ 1.4))
    if props.loot ~= "none" then
      inventory.add(player, props.loot, 1)
      hud.announce("It drops: " .. props.loot .. ".")
    end
    world.send(player, "slain", world.name(self.id) or "Wolf")
  end
end
