-- @prop kind none
-- Small things in the air that follow wherever you are looking: snow falling, fireflies in the warm dark, butterflies by day. The page says
-- where, what hour it is and how it is outside ("eden_ambient": "x,z,groundY,hour,tempC,rain,snowing"), and each one decides if it shows.
function on_ui(name, value)
  if name ~= "eden_ambient" then return end
  local x, z, ground, hour, temp, rain, snowing = string.match(value, "^([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+)$")
  x, z, ground, hour, temp, rain, snowing = tonumber(x), tonumber(z), tonumber(ground), tonumber(hour), tonumber(temp), tonumber(rain), tonumber(snowing)
  if not (x and z and ground and hour) then return end
  local on = false
  if props.kind == "snow" then
    world.set_position(self.id, x, ground + 12, z)
    on = snowing == 1
  elseif props.kind == "fireflies" then
    world.set_position(self.id, x, ground + 1.4, z)
    on = (hour >= 20 or hour < 5.5) and temp > 8 and rain < 0.1
  elseif props.kind == "butterflies" then
    world.set_position(self.id, x, ground + 1.2, z)
    on = hour >= 8 and hour < 18 and temp > 12 and rain < 0.1
  end
  particles.set_emitting(on)
end
