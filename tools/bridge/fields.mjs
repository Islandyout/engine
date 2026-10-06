// The editor runtime's readout fields (0.77.0), in one place. Run
// `node tools/bridge/gen_fields.mjs` after changing this: it writes the C++
// enums (apps/editor/runtime/bridge_fields.hpp) and the TypeScript constants
// (apps/editor/src/editor/bridgeFields.ts), so both sides name a field the
// same way instead of passing bare numbers. The numbers are the wire format;
// never renumber an existing field.

// editor_space_value(field)
export const spaceFields = [
  ["piloting", 0, "1 while the player flies the ship"],
  ["shipX", 1, "ship position in the site frame"],
  ["shipY", 2],
  ["shipZ", 3],
  ["attitudeX", 4, "ship attitude quaternion in the site frame"],
  ["attitudeY", 5],
  ["attitudeZ", 6],
  ["attitudeW", 7],
  ["altitude", 8, "metres above the reference body's surface"],
  ["speed", 9, "speed relative to the reference body (m/s)"],
  ["verticalSpeed", 10],
  ["groundSpeed", 11],
  ["throttle", 12, "0..1"],
  ["fuel", 13, "0..1 of the tank"],
  ["hull", 14, "0..1"],
  ["heat", 15],
  ["airDensity", 16],
  ["warp", 17, "time warp factor"],
  ["assist", 18, "0 manual, 1 stabilized, 2 prograde, 3 retrograde, 4 target"],
  ["landed", 19],
  ["periapsis", 20],
  ["apoapsis", 21],
  ["orbitClosed", 22],
  ["referenceBody", 23, "body index, -1 the star"],
  ["gForce", 24],
  ["engineOn", 25],
  ["bellyThrust", 26],
  ["systemTime", 27, "seconds"],
  ["destroyed", 28],
  ["targetBody", 29],
  ["targetDistance", 30, "to the target's surface (m)"],
  ["siteDistance", 31, "from the site origin (m)"],
  ["orbitPeriod", 32],
  ["eccentricity", 33],
  ["referenceRadius", 34],
  ["hasSpaceSystem", 35],
  ["bodyCount", 36],
  ["away", 37, "1 when the frame follows the ship or walker away from the authored site"],
  ["frameGeneration", 38, "changes whenever the frame moves"],
  ["frameBody", 39],
  ["activeSite", 40, "-1 home, -2 the wilds, else the Site number"],
  ["autopilot", 41],
  ["engineCondition", 42],
  ["rcsCondition", 43],
  ["gearCondition", 44],
  ["scannerCondition", 45],
  ["windSpeed", 46],
  ["groundSlope", 47, "degrees under the ship"],
  ["landSink", 48, "the gear's limits: sink m/s"],
  ["landSlope", 49, "slope degrees"],
  ["landDrift", 50, "drift m/s"],
  ["waterBelow", 51],
  ["reframeShiftX", 52, "the walker's shift in the latest on-foot re-anchor"],
  ["reframeShiftY", 53],
  ["reframeShiftZ", 54],
  ["frameLatitude", 55, "degrees, body-fixed"],
  ["frameLongitude", 56],
  ["reframeYaw", 57, "the turn about the vertical in that re-anchor (radians)"],
];

// editor_value(index, field)
export const entityFields = [
  ["x", 0, "position"],
  ["y", 1],
  ["z", 2],
  ["health", 3, "current / max, -1 without Health"],
  ["headingYaw", 4, "radians"],
  ["aiState", 5, "AIState order (Idle, Walking, ...), -1 without an AI"],
];

// editor_fighter_value(index, field) (0.78.0)
export const fighterFields = [
  ["has", 0, "1 with a Melee fighter"],
  ["mode", 1, "0 idle, 1 move, 2 block, 3 stun, 4 airborne, 5 down, 6 getup, 7 dead"],
  ["move", 2, "the move playing, -1 none"],
  ["progress", 3, "0..1 through the move"],
  ["yaw", 4, "facing, radians (sin, 0, cos)"],
  ["energy", 5, "0..1"],
  ["combo", 6, "hits in the current string"],
  ["hitstop", 7, "seconds frozen"],
  ["stunKind", 8, "0 none, 1 light, 2 heavy, 3 launched, 4 knockdown, 5 guard_break, 6 parried"],
  ["lockTarget", 9, "the Player's locked-on entity index, -1 none"],
  ["guard", 10, "0..1"],
  ["invulnerable", 11],
  ["time", 12, "seconds into the move / stun / down / getup"],
  ["target", 13, "the entity it faces and fights, -1 none"],
  ["active", 14, "1 while the move's blow is live"],
  ["team", 15],
  ["stunLeft", 16, "seconds of hit-stun left"],
];

// editor_melee_event(index, field) (0.78.0)
export const meleeEventFields = [
  ["kind", 0, "0 start, 1 hit, 2 blocked, 3 parried, 4 dodged, 5 guard_break, 6 fire, 7 land, 8 ko"],
  ["attacker", 1],
  ["target", 2],
  ["x", 3, "where it landed"],
  ["y", 4],
  ["z", 5],
  ["value", 6, "damage; start: the move's seconds; fire: speed"],
  ["move", 7],
  ["flags", 8, "1 finisher, 2 launch, 4 knockdown, 8 heavy, 16 killed"],
];
