#pragma once

#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace engine::gameplay {

// Melee combat (0.78.0): martial-arts moves authored as text, one per line,
//
//   jab: clip=jab input=light dur=0.55 hit=0.10-0.16 cancel=0.2 dmg=6 reach=0.9
//   cross: clip=cross input=light after=jab dur=0.62 hit=0.15-0.22 dmg=8
//   rising_dragon: clip=rising_strike input=special seq=b launch=10 cost=35
//
// and the per-fighter state machine that turns button presses into moves:
// an input buffer, combo chains (a move listed in another's `after` can be
// started from that move's cancel point on), direction sequences for
// specials, air and sprint variants, dodges with invulnerable frames, a
// held block with a parry window and a guard meter, energy, hit-stun,
// launches, knockdowns and getting up. Hit detection and movement live with
// the caller (they need the world); this part is pure and unit tested.

// The buttons a fighter presses.
enum class MeleeButton : int { light, heavy, kick, special, dodge };
constexpr int melee_button_count = 5;

struct MoveDef final {
    std::string name;
    std::string clip;          // the animation clip the editor plays over the move
    MeleeButton input{MeleeButton::light};
    std::vector<std::string> after; // moves this one chains from ("start": also from neutral)
    bool from_neutral{true};   // startable with no move playing
    std::string sequence;      // direction tokens before the press, e.g. "bf" (b back, f forward, l, r)
    bool air{false};           // only while airborne
    bool sprint{false};        // only while sprinting (a dash attack)
    float duration{0.6F};      // seconds; the clip is stretched to fit
    float hit_start{0.2F};     // the active window, seconds into the move
    float hit_end{0.3F};
    float cancel{0.35F};       // from here a buffered next move starts
    float damage{8.0F};
    float reach{1.0F};         // hit sphere centre, metres ahead of the fighter
    float radius{0.6F};        // hit sphere radius
    float height{0.6F};        // hit sphere centre, fraction of the fighter's height
    float aoe{0.0F};           // > 0: hits everything this close around the fighter instead
    float knockback{1.5F};     // m/s pushed away
    float launch{0.0F};        // m/s thrown upward
    float stun{0.35F};         // seconds of hit-stun dealt
    float hitstop{0.06F};      // seconds both fighters freeze on contact
    float lunge{0.3F};         // metres travelled forward by hit_end (from the clip's root motion)
    bool free_direction{false}; // travels along the stick, not the facing (dodges)
    float energy{0.0F};        // energy cost
    float gain{5.0F};          // energy gained on a landed hit
    float cooldown{0.0F};
    float iframe_start{-1.0F}; // invulnerable window (dodges), seconds; -1 none
    float iframe_end{-1.0F};
    bool armor{false};         // not interrupted by hits while it plays
    bool unblockable{false};
    bool knockdown{false};     // a landed hit floors the target
    bool finisher{false};      // the editor slows time and frames it
    int hits{1};               // hits spread over the active window
    float projectile{0.0F};    // > 0: fires an energy projectile at this speed at hit_start
    float track{50.0F};        // degrees the fighter turns toward its target as the move starts
    std::string limb{"hand_r"}; // the striking limb (trails, impact point)
};

struct MoveParse final {
    std::vector<MoveDef> moves;
    std::string error; // "line N: ..." on failure, moves then empty
};

// Parses a move list. `#` starts a comment; blank lines are ignored. Keys:
// clip, input (light|heavy|kick|special|dodge), after (names joined by |),
// seq, air, sprint, dur, hit (a-b), cancel, dmg, reach, radius, height,
// aoe, knock, launch, stun, stop, lunge, free, cost, gain, cooldown,
// iframes (a-b), armor, unblockable, knockdown, finisher, hits, projectile,
// track, limb. `after` names must be defined somewhere in the list.
[[nodiscard]] MoveParse parse_moves(std::string_view text);

// Unarmed martial arts: a four-punch chain, a three-kick chain, power and
// launcher heavies, air attacks, a dash attack, roll/slide dodges and four
// specials. Hit frames and lunges come from the clips themselves (see
// tools/models/import_combat_clips.mjs).
extern const char *const default_moves_text;
// Sword fighting: light and heavy chains, a dash cut, a rising cut, a slam.
extern const char *const sword_moves_text;

struct FighterSettings final {
    float energy_max{100.0F};
    float guard_max{60.0F};     // block damage soaked before the guard breaks
    float guard_regen{25.0F};   // per second while not blocking
    float parry_window{0.15F};  // seconds after raising the block that a hit is parried
    float buffer{0.3F};         // seconds a press waits for the current move's cancel point
    float down_time{0.6F};      // seconds lying down after a knockdown
    float getup_time{0.9F};     // seconds getting up (invulnerable)
};

enum class FighterMode : int { idle, move, block, stun, airborne, down, getup, dead };
enum class StunKind : int { none, light, heavy, launched, knockdown, guard_break, parried };

struct FighterInput final {
    bool pressed[melee_button_count]{}; // this tick's new presses
    bool block{};                       // held
    float move_x{};                     // stick relative to the facing: +x right
    float move_y{};                     //   +y forward
    bool airborne{};
    bool sprinting{};
};

struct FighterState final {
    FighterMode mode{FighterMode::idle};
    int move{-1};          // index into the move list while mode == move
    int previous{-1};      // the move just finished (chains still read it during its cancel time)
    float time{0};         // seconds into the move / stun / down / getup
    StunKind stun_kind{StunKind::none};
    float stun_left{0};
    float hitstop{0};
    int buffered{-1};      // a MeleeButton waiting to start, or -1
    float buffer_left{0};
    std::string buffered_sequence; // the direction history when it was pressed
    int combo{0};          // hits landed in the current string
    float combo_left{0};   // the string ends when this runs out
    float energy{0};
    float guard{60.0F};
    float block_time{0};   // seconds the block has been held
    int hits_done{0};      // hits dealt so far in the current move's window
    std::vector<float> cooldowns;
    std::string history;   // recent direction tokens, newest last
    std::vector<float> history_age;
    char stick{0};         // the current direction token (0 neutral)
};

// What happened during one update_fighter() call.
struct FighterTick final {
    int started{-1};      // a move started this tick
    bool hit{false};      // a hit of the active window is due this tick (hits_done counts it)
    bool fire{false};     // a projectile move releases this tick
    bool ended{false};    // the move finished
    bool got_up{false};   // back on its feet after a knockdown
    bool block_raised{false};
};

[[nodiscard]] FighterState make_fighter_state(const std::vector<MoveDef> &moves, const FighterSettings &settings);

// The direction token for a stick (relative to the facing), or 0 when
// neutral: f, b, l or r.
[[nodiscard]] char stick_token(float move_x, float move_y);

// Whether `move` can start now: chained from the current/previous move or
// from neutral, air/sprint conditions, energy, cooldown and sequence.
[[nodiscard]] bool can_start(const FighterState &state, const std::vector<MoveDef> &moves, int move,
                             const FighterInput &input, std::string_view sequence);

// The move a press of `button` starts now, or -1: sequence moves first
// (longest sequence wins), then chains from the current move, then neutral
// moves.
[[nodiscard]] int choose_move(const FighterState &state, const std::vector<MoveDef> &moves, MeleeButton button,
                              const FighterInput &input, std::string_view sequence);

// Advances one fixed tick. Frozen while in hit-stop. Handles stun,
// knockdown/getup, buffering, chains, block and energy/guard/cooldowns.
FighterTick update_fighter(FighterState &state, const std::vector<MoveDef> &moves, const FighterSettings &settings,
                           const FighterInput &input, float dt);

// Starts `move` by name's index regardless of its button (scripts: melee.perform):
// from idle or block, or once the current move reaches its cancel point.
// False when the fighter can't act yet or lacks the energy/cooldown.
bool force_move(FighterState &state, const std::vector<MoveDef> &moves, int move);

// Invulnerable right now: a dodge's i-frames, getting up, or down/dead.
[[nodiscard]] bool invulnerable(const FighterState &state, const std::vector<MoveDef> &moves);

// Forward speed (m/s) of the current move's lunge at its current time: the
// lunge distance spread over [0, hit_end] (the whole move for dodges) on a
// smooth bell, so it starts and stops gently like the clip's root motion.
[[nodiscard]] float lunge_speed(const FighterState &state, const std::vector<MoveDef> &moves);

enum class HitOutcome : int { hit, blocked, parried, dodged, guard_break };

struct HitResult final {
    HitOutcome outcome{HitOutcome::hit};
    float damage{0};
    float stun{0};
    StunKind kind{StunKind::none};
    float knockback{0};
    float launch{0};
    float hitstop{0};
    float guard_damage{0}; // guard drained by a blocked hit
};

// The outcome of `move` meeting a defender: dodged through i-frames;
// parried (block raised within the parry window, from the front); blocked
// (chip damage, guard drained; a broken guard staggers); or a clean hit,
// with damage scaled down the longer the attacker's combo runs and the
// defender kept airborne if it already is. A defender without a
// FighterState (a soldier, a dummy) is always hit cleanly.
[[nodiscard]] HitResult resolve_hit(const MoveDef &move, int attacker_combo, const FighterState *defender,
                                    const std::vector<MoveDef> *defender_moves, const FighterSettings *settings,
                                    bool from_front, bool defender_airborne);

// Puts the defender into the stun/launch/knockdown the result calls for
// (armored moves keep playing through a hit), or drains its guard.
void take_hit(FighterState &defender, const std::vector<MoveDef> &moves, const FighterSettings &settings,
              const HitResult &result);

// The attacker's side of a landed (or blocked/parried) hit: combo count,
// energy gain and hit-stop; a parried attacker staggers.
void land_hit(FighterState &attacker, const MoveDef &move, const FighterSettings &settings, const HitResult &result);

// Lands a knocked-down or launched fighter that touched the ground.
void touch_ground(FighterState &state);

// ---- AI (a melee brain) ----------------------------------------------------

struct BrainSettings final {
    float aggression{0.5F}; // 0..1: how often it presses the attack
    float skill{0.5F};      // 0..1: how often it blocks, parries and dodges, and how long its strings run
    float reaction{0.25F};  // seconds before it reacts to a threat
};

struct BrainState final {
    float think{0};        // seconds until the next decision
    float strafe{1};       // circling direction
    float strafe_left{0};
    float hold_block{0};
    float react_left{0};
    int chain_left{0};     // presses left in the current string
    MeleeButton chain_button{MeleeButton::light};
    float press_gap{0};
    std::uint32_t rng{0x2545F491U};
};

// What a fighter's brain can see.
struct BrainView final {
    bool has_target{false};
    float distance{0};          // metres between bodies' centres, horizontally
    float bearing{0};           // radians from the facing to the target (+ right)
    bool target_attacking{false}; // the target is winding up a move that hasn't hit yet
    float target_reach{1.0F};
    bool target_down{false};
    bool target_airborne{false};
    float reach{1.0F};          // this fighter's own typical reach
    bool wait_turn{false};      // another fighter is on the target: circle, don't start a string
};

// Decides this tick's buttons and stick (relative to the facing).
[[nodiscard]] FighterInput think(BrainState &brain, const BrainSettings &settings, const BrainView &view,
                                 const FighterState &self, float dt);

} // namespace engine::gameplay
