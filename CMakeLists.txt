cmake_minimum_required(VERSION 3.25)

project(GameEngine
    VERSION 0.2.0
    DESCRIPTION "AI-operable high-performance game engine"
    LANGUAGES CXX
)

option(ENGINE_BUILD_TESTS "Build engine tests" ON)
option(ENGINE_WARNINGS_AS_ERRORS "Treat compiler warnings as errors" ON)
option(ENGINE_ENABLE_SDL3 "Build the SDL3 desktop platform" ON)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")
include(GameEngineWarnings)

if(ENGINE_ENABLE_SDL3)
    include(Dependencies)
    engine_fetch_sdl3()
endif()

add_library(engine_core STATIC
    source/engine/core/fixed_step_clock.cpp
    source/engine/core/log.cpp
    source/engine/core/uuid.cpp
)

add_library(GameEngine::Core ALIAS engine_core)

target_include_directories(engine_core
    PUBLIC
        "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>"
)

target_compile_features(engine_core PUBLIC cxx_std_20)
engine_set_project_warnings(engine_core)

add_library(engine_platform STATIC
    source/engine/platform/headless_platform.cpp
)

add_library(GameEngine::Platform ALIAS engine_platform)

target_include_directories(engine_platform
    PUBLIC
        "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>"
)

target_compile_features(engine_platform PUBLIC cxx_std_20)
target_link_libraries(engine_platform PUBLIC GameEngine::Core)
engine_set_project_warnings(engine_platform)

if(ENGINE_ENABLE_SDL3)
    add_library(engine_platform_sdl STATIC
        source/engine/platform/sdl_platform.cpp
    )

    add_library(GameEngine::SdlPlatform ALIAS engine_platform_sdl)

    target_include_directories(engine_platform_sdl
        PUBLIC
            "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>"
    )

    target_compile_features(engine_platform_sdl PUBLIC cxx_std_20)
    target_link_libraries(engine_platform_sdl PUBLIC GameEngine::Platform SDL3::SDL3)
    engine_set_project_warnings(engine_platform_sdl)
endif()

add_library(engine_runtime STATIC
    source/engine/runtime/application.cpp
)

add_library(GameEngine::Runtime ALIAS engine_runtime)

target_include_directories(engine_runtime
    PUBLIC
        "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>"
)

target_compile_features(engine_runtime PUBLIC cxx_std_20)
target_link_libraries(engine_runtime PUBLIC GameEngine::Core GameEngine::Platform)
engine_set_project_warnings(engine_runtime)

add_executable(engine_host
    apps/engine_host/main.cpp
)

target_link_libraries(engine_host PRIVATE GameEngine::Runtime)
if(ENGINE_ENABLE_SDL3)
    target_link_libraries(engine_host PRIVATE GameEngine::SdlPlatform)
    target_compile_definitions(engine_host PRIVATE ENGINE_HAS_SDL3=1)
endif()
engine_set_project_warnings(engine_host)

if(ENGINE_BUILD_TESTS)
    enable_testing()

    add_executable(engine_core_tests
        tests/core_tests.cpp
    )

    target_link_libraries(engine_core_tests PRIVATE GameEngine::Core)
    engine_set_project_warnings(engine_core_tests)

    add_test(NAME engine_core_tests COMMAND engine_core_tests)

    add_executable(engine_runtime_tests
        tests/runtime_tests.cpp
    )

    target_link_libraries(engine_runtime_tests PRIVATE GameEngine::Runtime)
    engine_set_project_warnings(engine_runtime_tests)

    add_test(NAME engine_runtime_tests COMMAND engine_runtime_tests)

    if(ENGINE_ENABLE_SDL3)
        add_executable(engine_sdl_platform_tests
            tests/sdl_platform_tests.cpp
        )

        target_link_libraries(engine_sdl_platform_tests PRIVATE GameEngine::SdlPlatform)
        engine_set_project_warnings(engine_sdl_platform_tests)

        add_test(NAME engine_sdl_platform_tests COMMAND engine_sdl_platform_tests)
        set_tests_properties(engine_sdl_platform_tests PROPERTIES
            ENVIRONMENT "SDL_VIDEODRIVER=dummy"
        )
    endif()
endif()
