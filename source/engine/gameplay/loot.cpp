#include "engine/gameplay/loot.hpp"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <sstream>

namespace engine::gameplay {

namespace {
std::string lower(std::string_view text) {
    std::string out(text);
    std::transform(out.begin(), out.end(), out.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return out;
}

std::string trim(std::string_view text) {
    const auto first = text.find_first_not_of(" \t\r");
    if (first == std::string_view::npos)
        return {};
    const auto last = text.find_last_not_of(" \t\r");
    return std::string(text.substr(first, last - first + 1));
}

bool whole_number(const std::string &text, int &out) {
    if (text.empty() || text.size() > 6 || !std::all_of(text.begin(), text.end(), [](unsigned char c) { return std::isdigit(c); }))
        return false;
    out = std::stoi(text);
    return true;
}

float next_unit(std::uint32_t &rng) {
    rng ^= rng << 13;
    rng ^= rng >> 17;
    rng ^= rng << 5;
    return static_cast<float>(rng & 0xFFFFFF) / static_cast<float>(0x1000000);
}
} // namespace

bool parse_rarity(std::string_view name, Rarity &out) {
    static const char *const names[]{"common", "uncommon", "rare", "epic", "legendary"};
    const auto wanted = lower(name);
    for (int i = 0; i < 5; ++i)
        if (wanted == names[i]) {
            out = static_cast<Rarity>(i);
            return true;
        }
    return false;
}

const char *rarity_name(Rarity rarity) {
    static const char *const names[]{"Common", "Uncommon", "Rare", "Epic", "Legendary"};
    return names[static_cast<int>(rarity)];
}

std::string loot_label(const LootEntry &entry) {
    switch (entry.kind) {
    case LootKind::weapon:
        return entry.weapon.name;
    case LootKind::ammo:
        return "Ammo";
    case LootKind::health:
        return "Health";
    case LootKind::item:
        return entry.item;
    }
    return {};
}

LootParse parse_loot(std::string_view text) {
    LootParse result;
    std::istringstream lines{std::string(text)};
    std::string raw;
    int number = 0;
    while (std::getline(lines, raw)) {
        ++number;
        const auto fail = [&](const std::string &message) {
            result.entries.clear();
            result.error = "line " + std::to_string(number) + ": " + message;
            return result;
        };
        auto line = trim(raw.substr(0, raw.find('#')));
        if (line.empty())
            continue;
        // rarity=... may sit anywhere on the line.
        LootEntry entry;
        std::vector<std::string> words;
        {
            std::istringstream split(line);
            std::string word;
            while (split >> word) {
                if (word.rfind("rarity=", 0) == 0) {
                    if (!parse_rarity(word.substr(7), entry.rarity))
                        return fail("rarity must be Common, Uncommon, Rare, Epic or Legendary");
                    continue;
                }
                words.push_back(word);
            }
        }
        if (words.size() < 2)
            return fail("expected \"<chance> <kind> ...\"");
        char *end = nullptr;
        const float chance = std::strtof(words[0].c_str(), &end);
        if (end == words[0].c_str() || *end != '\0' || !(chance > 0) || chance > 1)
            return fail("the chance must be a number above 0 and at most 1");
        entry.chance = chance;
        const auto kind = lower(words[1]);
        if (kind == "ammo" || kind == "health") {
            entry.kind = kind == "ammo" ? LootKind::ammo : LootKind::health;
            if (words.size() != 3 || !whole_number(words[2], entry.amount) || entry.amount <= 0)
                return fail(kind + " needs an amount, a whole number above 0");
        } else if (kind == "item") {
            entry.kind = LootKind::item;
            if (words.size() < 3)
                return fail("item needs a name and maybe a count: \"item Coin 5\" or \"item Range Key\"");
            // The name may be several words; a whole number after it is the count.
            std::size_t name_end = words.size();
            if (words.size() >= 4) {
                int count = 0;
                if (whole_number(words.back(), count)) {
                    if (count <= 0)
                        return fail("an item count is a whole number above 0");
                    entry.amount = count;
                    name_end = words.size() - 1;
                }
            }
            for (std::size_t i = 2; i < name_end; ++i)
                entry.item += (i > 2 ? " " : "") + words[i];
            if (entry.item.size() > 40)
                return fail("an item name is at most 40 characters");
        } else if (kind == "weapon") {
            entry.kind = LootKind::weapon;
            std::string weapon_line;
            for (std::size_t i = 2; i < words.size(); ++i)
                weapon_line += (i > 2 ? " " : "") + words[i];
            auto parsed = parse_weapons(weapon_line);
            if (!parsed.error.empty())
                return fail("weapon: " + parsed.error.substr(parsed.error.find(':') + 2));
            if (parsed.weapons.size() != 1)
                return fail("weapon needs one loadout line");
            entry.weapon = parsed.weapons.front();
            entry.line = weapon_line;
        } else {
            return fail("kind must be weapon, ammo, health or item");
        }
        result.entries.push_back(std::move(entry));
    }
    return result;
}

std::vector<LootEntry> roll_loot(const std::vector<LootEntry> &table, std::uint32_t &rng) {
    if (rng == 0)
        rng = 0x9E3779B9U;
    std::vector<LootEntry> out;
    for (const auto &entry : table)
        if (entry.chance >= 1 || next_unit(rng) < entry.chance)
            out.push_back(entry);
    return out;
}

} // namespace engine::gameplay
