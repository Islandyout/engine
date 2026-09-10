#pragma once

#include <string_view>

#define ENGINE_VERSION_MAJOR 0
#define ENGINE_VERSION_MINOR 4
#define ENGINE_VERSION_PATCH 0
#define ENGINE_VERSION_STRING "0.4.0"

namespace engine {

inline constexpr int version_major = ENGINE_VERSION_MAJOR;
inline constexpr int version_minor = ENGINE_VERSION_MINOR;
inline constexpr int version_patch = ENGINE_VERSION_PATCH;
inline constexpr std::string_view version_string = ENGINE_VERSION_STRING;

} // namespace engine
