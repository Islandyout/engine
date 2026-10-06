// The built-in Melee move lists (0.78.0), mirrored from
// engine::gameplay::default_moves_text / sword_moves_text (melee.cpp; a test
// keeps the two in step). A Custom-style Melee component starts from the
// martial-arts list.
export const martialArtsMoves = [
  "# Punches (light): jab, cross, hook, uppercut",
  "jab: clip=jab input=light dur=0.55 hit=0.10-0.16 cancel=0.2 dmg=6 reach=0.9 lunge=0.25 stun=0.3 limb=hand_l",
  "cross: clip=cross input=light after=jab dur=0.62 hit=0.15-0.22 cancel=0.26 dmg=8 reach=1.0 lunge=0.3 stun=0.35 limb=hand_r",
  "hook: clip=hook input=light after=cross dur=0.72 hit=0.15-0.23 cancel=0.32 dmg=10 reach=1.0 lunge=0.35 knock=2.5 stun=0.4 limb=hand_r",
  "uppercut: clip=uppercut input=light after=hook dur=0.78 hit=0.18-0.28 cancel=0.45 dmg=13 reach=0.9 lunge=0.3 launch=7.5 knock=1 stun=0.6 stop=0.1 limb=hand_r",
  "# Kicks: front kick, roundhouse, side kick (alternating legs)",
  "front_kick: clip=front_kick_r input=kick dur=0.8 hit=0.33-0.44 cancel=0.5 dmg=10 reach=1.25 height=0.55 lunge=0.4 knock=3.5 stun=0.4 limb=foot_r",
  "roundhouse: clip=roundhouse_l input=kick after=front_kick|jab|cross dur=0.9 hit=0.38-0.48 cancel=0.6 dmg=14 reach=1.3 height=0.8 lunge=0.35 knock=4.5 stun=0.5 stop=0.09 limb=foot_l",
  "side_kick: clip=side_kick_r input=kick after=roundhouse|hook dur=0.92 hit=0.30-0.40 cancel=0.62 dmg=16 reach=1.45 height=0.65 lunge=0.35 knock=8 stun=0.7 stop=0.11 knockdown finisher limb=foot_r",
  "# Heavies",
  "power_hook: clip=hook input=heavy dur=0.95 hit=0.22-0.32 cancel=0.55 dmg=15 reach=1.05 lunge=0.5 knock=4.5 stun=0.55 stop=0.1 armor limb=hand_r",
  "launcher: clip=uppercut input=heavy after=jab|cross dur=0.85 hit=0.2-0.3 cancel=0.5 dmg=11 reach=0.95 lunge=0.35 launch=8.5 stun=0.7 stop=0.1 limb=hand_r",
  "knee_strike: clip=knee input=heavy after=hook|power_hook dur=0.8 hit=0.36-0.46 cancel=0.6 dmg=14 reach=0.75 lunge=0.6 knock=2 stun=0.7 stop=0.1 limb=calf_r",
  "# In the air (after a jump, or chasing a launched target)",
  "air_punch: clip=cross input=light air after=air_punch|air_kick|start dur=0.45 hit=0.10-0.18 cancel=0.2 dmg=6 reach=1.0 launch=3.5 stun=0.4 lunge=0 limb=hand_r",
  "air_kick: clip=roundhouse_r input=kick air after=air_punch|start dur=0.6 hit=0.25-0.36 cancel=0.4 dmg=9 reach=1.2 launch=3 knock=2 stun=0.5 lunge=0 limb=foot_r",
  "# Running",
  "dash_attack: clip=shoulder_dash input=light sprint dur=0.75 hit=0.08-0.35 cancel=0.5 dmg=10 reach=0.9 lunge=2.4 knock=7 stun=0.6 stop=0.08 limb=upperarm_l",
  "# Dodges (invulnerable while rolling)",
  "roll: clip=roll input=dodge dur=0.6 hit=0-0 cancel=0.45 dmg=0 lunge=3.2 free iframes=0.03-0.38 track=0 limb=pelvis",
  "slide: clip=slide input=dodge sprint dur=0.7 hit=0-0 cancel=0.55 dmg=0 lunge=4.2 free iframes=0-0.45 track=0 limb=pelvis",
  "# Specials (energy, built by landing hits): neutral, forward, back, back-forward",
  "energy_blast: clip=energy_throw input=special dur=0.8 hit=0.26-0.3 cancel=0.55 dmg=18 projectile=18 knock=5 stun=0.6 cost=25 cooldown=0.6 lunge=0 limb=hand_r",
  "flying_strike: clip=dash_strike input=special seq=f dur=1.0 hit=0.15-0.45 cancel=0.75 dmg=20 reach=1.1 lunge=4 knock=6 stun=0.7 stop=0.1 cost=35 armor limb=hand_r",
  "rising_dragon: clip=rising_strike input=special seq=b dur=0.7 hit=0.1-0.3 cancel=0.55 dmg=18 reach=1.0 launch=10 stun=0.9 stop=0.12 cost=35 iframes=0-0.15 lunge=0.3 limb=hand_r",
  "meteor_smash: clip=ground_pound input=special seq=bf dur=1.1 hit=0.3-0.42 cancel=0.9 dmg=35 aoe=3 knock=9 launch=4 stun=1 stop=0.16 cost=70 armor knockdown unblockable finisher lunge=0.2 limb=hand_r",
].join("\n") + "\n";

export const swordMoves = [
  "# Sword: light chain, heavy chain, a kick, dash and specials",
  "slash_a: clip=sword_light_a input=light dur=0.6 hit=0.12-0.2 cancel=0.26 dmg=9 reach=1.5 radius=0.8 lunge=0.3 stun=0.35 limb=hand_r",
  "slash_b: clip=sword_light_b input=light after=slash_a dur=0.65 hit=0.11-0.19 cancel=0.28 dmg=10 reach=1.5 radius=0.8 lunge=0.3 stun=0.4 limb=hand_r",
  "slash_c: clip=sword_light_c input=light after=slash_b dur=1.0 hit=0.26-0.36 cancel=0.55 dmg=15 reach=1.6 radius=0.9 lunge=0.9 knock=4 stun=0.6 stop=0.1 limb=hand_r",
  "cleave_a: clip=sword_heavy_a input=heavy dur=1.15 hit=0.27-0.37 cancel=0.49 dmg=18 reach=1.6 radius=0.9 lunge=0.9 knock=5 stun=0.6 stop=0.11 armor limb=hand_r",
  "cleave_b: clip=sword_heavy_b input=heavy after=cleave_a|slash_b dur=0.9 hit=0.17-0.27 cancel=0.35 dmg=16 reach=1.5 radius=0.9 lunge=0.2 launch=7 stun=0.7 stop=0.1 limb=hand_r",
  "cleave_c: clip=sword_heavy_c input=heavy after=cleave_b|slash_c dur=0.95 hit=0.3-0.4 cancel=0.52 dmg=24 reach=1.6 radius=1.0 lunge=0.3 knock=9 stun=0.9 stop=0.14 knockdown finisher limb=hand_r",
  "kick: clip=front_kick_r input=kick after=slash_a|slash_b|start dur=0.8 hit=0.33-0.44 cancel=0.5 dmg=8 reach=1.25 height=0.55 lunge=0.4 knock=5 stun=0.5 limb=foot_r",
  "dash_cut: clip=dash_strike input=light sprint dur=1.0 hit=0.15-0.45 cancel=0.75 dmg=16 reach=1.4 radius=0.9 lunge=3.5 knock=6 stun=0.7 stop=0.1 limb=hand_r",
  "roll: clip=roll input=dodge dur=0.6 hit=0-0 cancel=0.45 dmg=0 lunge=3.2 free iframes=0.03-0.38 track=0 limb=pelvis",
  "rising_cut: clip=rising_strike input=special seq=b dur=0.7 hit=0.1-0.3 cancel=0.55 dmg=20 reach=1.4 launch=10 stun=0.9 stop=0.12 cost=30 iframes=0-0.15 lunge=0.3 limb=hand_r",
  "piercing_dash: clip=dash_strike input=special seq=f dur=1.0 hit=0.15-0.45 cancel=0.75 dmg=24 reach=1.4 lunge=5 knock=7 stun=0.8 stop=0.12 cost=35 armor unblockable limb=hand_r",
  "slam: clip=ground_pound input=special seq=bf dur=1.1 hit=0.3-0.42 cancel=0.9 dmg=38 aoe=3.2 knock=9 launch=4 stun=1 stop=0.16 cost=60 armor knockdown finisher lunge=0.2 limb=hand_r",
].join("\n") + "\n";
