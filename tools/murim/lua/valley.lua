-- The valley itself (the scene builder places items.lua and talk.lua in front of this): the day and the weather, rides
-- between shrines, doors into the hall and the cave, the lake's fishing, and the introduction. Other scripts ask it things
-- with world.send(valley, name, value).
-- @prop intro 1
local sky = fx
local player
local day_hours = 9
local DAY_SECONDS = 720
local rain = 0
local weather_left = 45
local sky_clock = 2
local clock = 0
local inside = nil              -- the name of the interior the Player is in, or nil
local last_counts = {}
local ride = nil                -- a ride in progress: { x, y, z, left }

-- Doors: stand at one and press E to be at the other. A door is an entity; you arrive at its partner.
local DOORS = {
  { door = "Hall door", partner = "Hall exit", prompt = "enter the Great Hall", interior = "Great Hall", dx = 0, dz = 3 },
  { door = "Hall exit", partner = "Hall door", prompt = "leave the hall", interior = nil, dx = 0, dz = 3 },
  { door = "Cave mouth", partner = "Cave exit", prompt = "enter the Cave of Whispers", interior = "Cave of Whispers", dx = 0, dz = 3 },
  { door = "Cave exit", partner = "Cave mouth", prompt = "leave the cave", interior = nil, dx = -3, dz = 0 },
}

-- Fishing: stand at the shore and press E to cast; a bite comes after a few seconds; press E again within a breath.
local fishing = nil             -- nil, or { stage = "wait" | "bite", left = seconds }
local fish_cooldown = 0

local function me() player = player or world.find("Player") return player end
local function say_line(text) ui.set_text("Notification", text) end

local function set_lighting()
  if inside then
    sky.light(0.55, 0.05)
  else
    sky.time_of_day(day_hours)
  end
end

local function arrive(x, y, z, interior)
  world.set_position(me(), x, y, z)
  world.set_velocity(me(), 0, 0, 0)
  inside = interior
  audio.ambience("wind", interior and 0.05 or 0.4)
  sky_clock = 2
  set_lighting()
  world.send(me(), "inside", interior or "")
end

-- ---- Messages
function on_message(name, value)
  value = tostring(value)
  if name == "travel" then
    local pos, label = value:match("^([^|]+)|(.*)$")
    local x, y, z = pos:match("^([%-%d.]+),([%-%d.]+),([%-%d.]+)$")
    if x then
      ride = { x = tonumber(x), y = tonumber(y), z = tonumber(z), left = 0.8 }
      say_line("Riding\nTo " .. label)
      sound.play("cloth swish")
    end
  elseif name == "hours" then day_hours = tonumber(value) or day_hours
  elseif name == "rain" then rain = tonumber(value) or 0 sky.weather(rain, rain > 0 and 0.35 or 0.08, 1.5, 0.5)
  elseif name == "arrive" then
    local x, y, z, interior = value:match("^([%-%d.]+),([%-%d.]+),([%-%d.]+)|(.*)$")
    if x then arrive(tonumber(x), tonumber(y), tonumber(z), interior ~= "" and interior or nil) end
  end
end

-- ---- Ticks
local function door_tick()
  for _, d in ipairs(DOORS) do
    local dist = distance_to(d.door)
    if dist and dist < 2.4 then
      world.send(me(), "prompt", d.prompt)
      if tapped("interact") then
        local id = world.find(d.partner)
        if id then
          local x, y, z = world.position(id)
          arrive(x + d.dx, y + 1.1, z + d.dz, d.interior)
          sound.play("cloth swish")
          if d.interior == "Cave of Whispers" then world.send(world.find("Sect"), "codex", "cave") end
        end
      end
      return
    end
  end
end

local function fishing_tick(dt)
  fish_cooldown = math.max(0, fish_cooldown - dt)
  local shore = distance_to("Lake shore")
  if not shore or shore > 3.2 then
    if fishing then fishing = nil say_line("Fishing\nYou step away from the water.") end
    return
  end
  if not fishing then
    if fish_cooldown <= 0 then
      world.send(me(), "prompt", "cast a line")
      if tapped("interact") then
        fishing = { stage = "wait", left = 2 + math.random() * 5 }
        say_line("Fishing\nThe line is out. Wait for a bite.")
        sound.play("cloth swish")
      end
    end
    return
  end
  fishing.left = fishing.left - dt
  if fishing.stage == "wait" then
    world.send(me(), "prompt", "wait for a bite...")
    if fishing.left <= 0 then
      fishing = { stage = "bite", left = 1.2 }
      say_line("Fishing\nA bite! Press E now.")
      sound.play("bell")
    end
    if tapped("interact") then fishing = nil say_line("Fishing\nYou reeled in too early.") fish_cooldown = 1 end
  else
    world.send(me(), "prompt", "reel in!")
    if tapped("interact") then
      local rare = math.random() < 0.08
      local item = rare and "Spirit Stone" or "Silver Carp"
      if inventory.space(me(), item) > 0 then
        inventory.add(me(), item, 1)
        say_line("Caught\n" .. (rare and "A spirit stone glints in the carp's mouth." or "A silver carp."))
        world.send(world.find("Sect"), "fished", "")
        sound.play("coin handle")
      else
        say_line("Fishing\nYou cannot carry more.")
      end
      fishing = nil
      fish_cooldown = 1.5
    elseif fishing.left <= 0 then
      fishing = nil
      fish_cooldown = 1.5
      say_line("Fishing\nIt got away.")
    end
  end
end

-- Things that happen when an item turns up in the bag: a spirit stone from the rock, venison from a kill.
local function watch_bag()
  for _, name in ipairs({ "Spirit Stone", "Raw Venison" }) do
    local n = inventory.count(me(), name)
    local before = last_counts[name]
    if before and n > before then
      if name == "Spirit Stone" then world.send(world.find("Sect"), "mined", "") end
      if name == "Raw Venison" then world.send(world.find("Sect"), "hunted", "") end
    end
    last_counts[name] = n
  end
end

function on_start()
  me()
  local text = save.get("azure-cloud-sect-valley")
  if text and text ~= "" then
    local h = text:match("hours=([%d.]+)")
    if h then day_hours = tonumber(h) end
  elseif (tonumber(props.intro) or 1) > 0 then
    -- A new game opens on a few shots of the valley (Space or Enter skips them).
    after(1.5, function()
      hud.panels("0 38 108 > 0 8 74 | The Azure Cloud Sect keeps its hall above the clouds. | | 4.5\n"
        .. "-12 22 32 > -24 4 38 | Willow Village lives in its shadow. Farmers, a merchant, a stable. | | 4.5\n"
        .. "-6 18 -16 > -6 3 4 | Below, a bandit camp has closed the road. | | 4\n"
        .. "0 34 -52 > 0 10 -78 | And at the foot of Heaven Peak, a shrine, and the guardian who will not let you pass. | | 5")
    end)
  end
  audio.ambience("wind", 0.4)
  -- Started inside a room (a test, a saved game): the lighting and sound follow.
  after(0.3, function()
    local x, y, z = world.position(me())
    if y > 20 then
      inside = z > 60 and "Cave of Whispers" or "Great Hall"
      world.send(me(), "inside", inside)
      audio.ambience("wind", 0.05)
      set_lighting()
    else
      sky.time_of_day(day_hours)
    end
  end)
end

function on_tick(dt)
  tap_tick(dt)
  clock = clock + dt
  if not me() then return end
  day_hours = (day_hours + dt * 24 / DAY_SECONDS) % 24
  world.set_clock(day_hours)
  weather_left = weather_left - dt
  if weather_left <= 0 then
    weather_left = 60 + math.random() * 90
    if not inside then
      rain = math.random() < 0.3 and 0.35 + math.random() * 0.3 or 0
      sky.weather(rain, rain > 0 and 0.35 or 0.08, 1.5, 0.5)
      audio.ambience("rain", rain)
    end
  end
  sky_clock = sky_clock + dt
  if sky_clock >= 2 then sky_clock = 0 set_lighting() end
  -- A ride: a short beat, then you are there (the clock moves on a little).
  if ride then
    ride.left = ride.left - dt
    if ride.left <= 0 then
      day_hours = (day_hours + 0.25) % 24
      arrive(ride.x, ride.y, ride.z, nil)
      ride = nil
    end
  end
  if not talking and not ride then
    door_tick()
    fishing_tick(dt)
  end
  if clock >= 1 then
    clock = 0
    watch_bag()
    world.send(me(), "hours", string.format("%.2f", day_hours))
    save.set("azure-cloud-sect-valley", string.format("hours=%.2f", day_hours))
  end
end
