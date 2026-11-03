-- A made thing the page keeps track of (a pot, a boat, a bridge, a hut on the horizon): it only tells the page which body it is
-- ("eden_body"), so the page can move it (a boat that is being rowed), turn it (a bridge laid across the water) or size it.
function on_message(name, value)
  if name == "eden_who" and type(value) == "string" then host.send("eden_body", value) end
end
