#include "engine/gameplay/loot.hpp"

#include <iostream>
#include <stdexcept>
#include <string>

namespace {
void check(bool pass, const char *message) {
    if (!pass)
        throw std::runtime_error{message};
}
using namespace engine::gameplay;
} // namespace

int main() {
    try {
        {
            const auto table = parse_loot("# a goblin's pockets\n"
                                          "0.6 ammo 30\n"
                                          "0.3 health 25  # a snack\n"
                                          "\n"
                                          "0.15 weapon smg: model=smg held=smg-3 mag=32 rarity=Rare\n"
                                          "0.1 weapon sword: melee=sword\n"
                                          "1 item Key\n"
                                          "0.5 item Coin 5 rarity=legendary\n");
            check(table.error.empty() && table.entries.size() == 6, "a table parses");
            const auto &e = table.entries;
            check(e[0].kind == LootKind::ammo && e[0].amount == 30 && e[0].chance == 0.6F, "ammo");
            check(e[1].kind == LootKind::health && e[1].amount == 25, "health");
            check(e[2].kind == LootKind::weapon && e[2].weapon.name == "smg" && e[2].weapon.held == "smg-3" &&
                      e[2].weapon.magazine == 32 && e[2].rarity == Rarity::rare && e[2].line == "smg: model=smg held=smg-3 mag=32",
                  "a gun, its rarity kept off its loadout line");
            check(e[3].weapon.is_melee() && e[3].weapon.melee == "sword", "a melee weapon");
            check(e[4].kind == LootKind::item && e[4].item == "Key" && e[4].amount == 1, "one key");
            check(e[5].item == "Coin" && e[5].amount == 5 && e[5].rarity == Rarity::legendary, "five coins, any-case rarity");
            check(loot_label(e[2]) == "smg" && loot_label(e[0]) == "Ammo" && loot_label(e[5]) == "Coin", "labels");
            check(std::string(rarity_name(Rarity::epic)) == "Epic", "rarity names");
        }
        {
            // Every mistake names its line.
            check(parse_loot("1.5 ammo 3").error == "line 1: the chance must be a number above 0 and at most 1", "chance > 1");
            check(parse_loot("0 ammo 3").error.find("chance") != std::string::npos, "chance 0");
            check(parse_loot("\n0.5 gold 3").error.rfind("line 2: kind must be", 0) == 0, "unknown kind");
            check(parse_loot("0.5 ammo").error.find("needs an amount") != std::string::npos, "ammo without amount");
            check(parse_loot("0.5 health -4").error.find("needs an amount") != std::string::npos, "negative health");
            check(parse_loot("0.5 item").error.find("needs a name") != std::string::npos, "item without name");
            {
                const auto spaced = parse_loot("1 item Range Key rarity=Epic\n1 item Gold Coin 3").entries;
                check(spaced.size() == 2 && spaced[0].item == "Range Key" && spaced[0].amount == 1 &&
                          spaced[0].rarity == Rarity::epic,
                      "a name of several words");
                check(spaced.size() == 2 && spaced[1].item == "Gold Coin" && spaced[1].amount == 3, "several words, then a count");
                check(!parse_loot("1 item Gem 0").error.empty(), "a count of 0");
            }
            check(parse_loot("0.5 weapon a: bogus=1").error.find("unknown key") != std::string::npos, "a bad weapon line");
            check(parse_loot("0.5 ammo 3 rarity=shiny").error.find("rarity must be") != std::string::npos, "a bad rarity");
            check(parse_loot("").entries.empty() && parse_loot("").error.empty(), "an empty table is fine");
        }
        {
            // Rolling: chance 1 always comes up; others about as often as
            // their chance; the same seed rolls the same.
            const auto table = parse_loot("1 item Key\n0.25 ammo 10").entries;
            std::uint32_t rng = 12345;
            int ammo = 0, keys = 0;
            for (int i = 0; i < 4000; ++i)
                for (const auto &entry : roll_loot(table, rng)) {
                    keys += entry.kind == LootKind::item;
                    ammo += entry.kind == LootKind::ammo;
                }
            check(keys == 4000, "a sure entry always drops");
            check(ammo > 850 && ammo < 1150, "a 25% entry drops about a quarter of the time");
            std::uint32_t a = 7, b = 7;
            for (int i = 0; i < 20; ++i)
                check(roll_loot(table, a).size() == roll_loot(table, b).size(), "the same seed, the same loot");
        }
    } catch (const std::exception &error) {
        std::cerr << "loot test failed: " << error.what() << '\n';
        return 1;
    }
    std::cout << "loot tests passed\n";
    return 0;
}
