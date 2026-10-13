-- Velocity's own script (tools/velocity/build_velocity.ts): the speed
-- effects, the speed readout, and what the director asks of the fighter
-- ("unlock" a move, "revive" after a knockout).

local FAST = 13       -- m/s: sparks stream off him above this
local streaming = false
local shown = -1
local clock = 0

function on_start()
  particles.set_emitting(false)
end

function on_message(name, value)
  if name == "unlock" and type(value) == "string" then
    for move in value:gmatch("[%w_]+") do melee.unlock(move) end
  elseif name == "mastery" and type(value) == "string" then
    -- Damage, speed (the fighter's clock), crit chance, max health.
    local d, sp, c, h = value:match("^([%d.]+),([%d.]+),([%d.]+),([%d.]+)$")
    if d then melee.tune(tonumber(d), tonumber(sp), tonumber(c), -1, tonumber(h)) end
  elseif name == "energy" then
    local _, _, energy = melee.state()
    melee.set_energy(math.max(energy or 0, value))
  elseif name == "revive" then
    melee.lock()
    melee.revive()
  end
end

function on_tick(dt)
  clock = clock + dt
  if clock < 0.1 then return end
  clock = 0
  local speed = math.sqrt(self.vx * self.vx + self.vz * self.vz)
  local fast = speed > FAST
  if fast ~= streaming then
    streaming = fast
    particles.set_emitting(fast)
  end
  -- The readout changes only when the shown number does.
  local kmh = math.floor(speed * 3.6 / 5 + 0.5) * 5
  if kmh ~= shown then
    shown = kmh
    ui.set_text("Speed", kmh > 0 and string.format("%d km/h", kmh) or "")
  end
end
