-- Who fights at what strength (the scene builder places this in front of the scripts that need it, with the table filled in).
-- Realm 1 to 7, the same ladder the Player climbs: a fighter of the Player's own realm is an even fight; two realms above
-- is a different kind of danger. Strength is fixed by who they are and where they stand, and nothing scales to the Player.
BEST = --@BESTIARY@
PEACEFUL = --@PEACEFUL@

-- The realm a named fighter stands at: its entry, else its name's first matching word, else 1.
function realm_of(name)
  name = tostring(name or "")
  if BEST[name] then return BEST[name] end
  for pattern, realm in pairs(BEST_BY_WORD) do
    if name:find(pattern) then return realm end
  end
  return 1
end
BEST_BY_WORD = {}

-- What a fight against `them` is for someone of realm `mine`: a short label, the colour word, and a danger from 0 to 4.
function threat_of(them, mine)
  local d = them - mine
  if d <= -2 then return "Trivial", "grey", 0
  elseif d == -1 then return "Easy", "green", 0
  elseif d == 0 then return "Even", "yellow", 1
  elseif d == 1 then return "Hard", "orange", 2
  elseif d == 2 then return "Deadly", "red", 3
  else return "Hopeless", "black", 4 end
end
