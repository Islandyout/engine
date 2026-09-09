#include "engine/core/uuid.hpp"

#include <random>

namespace engine {
namespace {

constexpr char hex_digits[] = "0123456789abcdef";

[[nodiscard]] constexpr int hex_value(const char value) noexcept {
    if (value >= '0' && value <= '9') {
        return value - '0';
    }
    if (value >= 'a' && value <= 'f') {
        return value - 'a' + 10;
    }
    if (value >= 'A' && value <= 'F') {
        return value - 'A' + 10;
    }
    return -1;
}

} // namespace

Uuid Uuid::random_v4() {
    thread_local std::mt19937_64 generator{std::random_device{}()};
    std::uniform_int_distribution<unsigned int> distribution{0, 255};

    Bytes bytes{};
    for (auto& byte : bytes) {
        byte = static_cast<u8>(distribution(generator));
    }

    bytes[6] = static_cast<u8>((bytes[6] & 0x0fU) | 0x40U);
    bytes[8] = static_cast<u8>((bytes[8] & 0x3fU) | 0x80U);
    return Uuid{bytes};
}

std::optional<Uuid> Uuid::parse(const std::string_view text) noexcept {
    if (text.size() != 36 || text[8] != '-' || text[13] != '-' ||
        text[18] != '-' || text[23] != '-') {
        return std::nullopt;
    }

    Bytes bytes{};
    usize byte_index = 0;
    for (usize index = 0; index < text.size();) {
        if (text[index] == '-') {
            ++index;
            continue;
        }

        if (index + 1 >= text.size() || byte_index >= bytes.size()) {
            return std::nullopt;
        }

        const int high = hex_value(text[index]);
        const int low = hex_value(text[index + 1]);
        if (high < 0 || low < 0) {
            return std::nullopt;
        }

        bytes[byte_index++] = static_cast<u8>((high << 4) | low);
        index += 2;
    }

    if (byte_index != bytes.size()) {
        return std::nullopt;
    }
    return Uuid{bytes};
}

std::string Uuid::to_string() const {
    std::string result(36, '-');
    usize output = 0;
    for (usize index = 0; index < bytes_.size(); ++index) {
        if (output == 8 || output == 13 || output == 18 || output == 23) {
            ++output;
        }
        result[output++] = hex_digits[(bytes_[index] >> 4U) & 0x0fU];
        result[output++] = hex_digits[bytes_[index] & 0x0fU];
    }
    return result;
}

} // namespace engine
