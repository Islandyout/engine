-- @prop kind deer
-- Animals you can hunt: a deer gives raw venison and a hide; a wolf (it chases on its own) gives a pelt, qi and trouble.
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
    world.send(player, "kill", 18)
    world.send(player, "slain", "Wolf")
  end
end
