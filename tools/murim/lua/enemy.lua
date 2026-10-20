-- @prop gear none
-- @prop qi 25
-- @prop drop 0
-- @prop pill 0
-- @prop silver 0
-- A bandit or the shrine guardian: qi for the Player when defeated, and sometimes an elixir.
function on_death(attacker)
  local player = world.find("Player")
  if not player then return end
  world.send(player, "kill", tonumber(props.qi) or 25)
  if (tonumber(props.silver) or 0) > 0 then inventory.add(player, "Silver", tonumber(props.silver)) end
  if (props.drop or 0) > 0 then inventory.add(player, "Qi Elixir", props.drop) end
  if (props.pill or 0) > 0 then
    inventory.add(player, "Breakthrough Pill", props.pill)
    hud.announce("The guardian drops a Breakthrough Pill.")
  end
end

function on_start()
  -- Clothes give the mannequin a body: robes, trousers, gloves and boots.
  if props.gear and props.gear ~= "" and props.gear ~= "none" then world.wear(props.gear) end
end
