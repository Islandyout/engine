#pragma once

#include "engine/gameplay/weapons.hpp"

#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace engine::gameplay {

// Loot: what a pickup gives, how rare it is, and the tables that enemies
// (LootDrop) and crates (Container) roll when they drop or open.
//
// A loot table is text, one entry per line, each rolled on its own:
//
//   <chance 0..1> <kind> <what> [rarity=<rarity>]
//   0.6  ammo 30                       30 rounds for the gun in hand
//   0.3  health 25                     25 health
//   0.15 weapon smg: model=smg held=smg-3 mag=32 rarity=Rare
//   0.1  weapon sword: melee=sword
//   1    item Key                      one Key
//   0.5  item Coin 5                   five Coins
//
// `#` starts a comment; blank lines are ignored. A weapon entry is a
// Weapons loadout line (parse_weapons), checked when the table is parsed.
enum class LootKind { weapon, ammo, health, item };
enum class Rarity { common, uncommon, rare, epic, legendary };

struct LootEntry final {
    float chance{1};
    LootKind kind{LootKind::item};
    int amount{1};      // rounds, health, or how many items
    std::string item;   // an item's name
    WeaponDef weapon;   // a weapon entry's weapon
    std::string line;   // a weapon entry's loadout line, as written
    Rarity rarity{Rarity::common};
};

struct LootParse final {
    std::vector<LootEntry> entries;
    std::string error; // "line N: ..." on failure, entries then empty
};

[[nodiscard]] LootParse parse_loot(std::string_view text);

// Rarity names: Common, Uncommon, Rare, Epic, Legendary (any case).
[[nodiscard]] bool parse_rarity(std::string_view name, Rarity &out);
[[nodiscard]] const char *rarity_name(Rarity rarity);

// The entries that come up this time: each rolls against its chance with
// the xorshift32 state `rng` (never 0).
[[nodiscard]] std::vector<LootEntry> roll_loot(const std::vector<LootEntry> &table, std::uint32_t &rng);

// What a pickup is called on screen: a weapon's name, "Ammo", "Health" or
// the item's name.
[[nodiscard]] std::string loot_label(const LootEntry &entry);

} // namespace engine::gameplay
