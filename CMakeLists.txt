cmake_minimum_required(VERSION 3.25)

project(GameEngine
    VERSION 0.22.0
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
    source/engine/input/actions.cpp
    source/engine/input/input.cpp
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

add_library(engine_world STATIC
    source/engine/world/world.cpp
    source/engine/world/fixed_systems.cpp
)
add_library(GameEngine::World ALIAS engine_world)
target_link_libraries(engine_world PUBLIC GameEngine::Runtime)
target_compile_features(engine_world PUBLIC cxx_std_20)
engine_set_project_warnings(engine_world)

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

    add_executable(engine_world_tests tests/world_tests.cpp)
    target_link_libraries(engine_world_tests PRIVATE GameEngine::World)
    engine_set_project_warnings(engine_world_tests)
    add_test(NAME engine_world_tests COMMAND engine_world_tests)

    add_executable(engine_core_tests
        tests/core_tests.cpp
    )

    target_link_libraries(engine_core_tests PRIVATE GameEngine::Core)
    engine_set_project_warnings(engine_core_tests)

    add_test(NAME engine_core_tests COMMAND engine_core_tests)

    add_executable(engine_input_tests tests/input_tests.cpp)
    target_link_libraries(engine_input_tests PRIVATE GameEngine::Core)
    engine_set_project_warnings(engine_input_tests)
    add_test(NAME engine_input_tests COMMAND engine_input_tests)

    add_executable(engine_action_tests tests/action_tests.cpp)
    target_link_libraries(engine_action_tests PRIVATE GameEngine::Core)
    engine_set_project_warnings(engine_action_tests)
    add_test(NAME engine_action_tests COMMAND engine_action_tests)

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

add_library(engine_graphics STATIC source/engine/graphics/box_view.cpp source/engine/graphics/mesh_asset.cpp)
add_library(GameEngine::Graphics ALIAS engine_graphics)
target_link_libraries(engine_graphics PUBLIC GameEngine::Core)
engine_set_project_warnings(engine_graphics)

add_library(engine_scene STATIC source/engine/scene/scene_document.cpp)
add_library(GameEngine::Scene ALIAS engine_scene)
target_link_libraries(engine_scene PUBLIC GameEngine::Core)
engine_set_project_warnings(engine_scene)

add_library(engine_physics STATIC source/engine/physics/physics.cpp)
add_library(GameEngine::Physics ALIAS engine_physics)
target_link_libraries(engine_physics PUBLIC GameEngine::World GameEngine::Graphics)
engine_set_project_warnings(engine_physics)

add_executable(engine_playground apps/native_playground/main.cpp)
target_link_libraries(engine_playground PRIVATE GameEngine::World GameEngine::Graphics GameEngine::Scene GameEngine::Physics)
if(ENGINE_ENABLE_SDL3)
    target_link_libraries(engine_playground PRIVATE GameEngine::SdlPlatform)
    target_compile_definitions(engine_playground PRIVATE ENGINE_HAS_SDL3=1)
endif()
engine_set_project_warnings(engine_playground)
add_custom_command(TARGET engine_playground POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_FILE_DIR:engine_playground>/assets"
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/assets/cooked/bench.gea"
        "$<TARGET_FILE_DIR:engine_playground>/assets/bench.gea")

if(ENGINE_BUILD_TESTS)
    add_executable(engine_playground_tests tests/playground_tests.cpp)
    target_link_libraries(engine_playground_tests PRIVATE GameEngine::World GameEngine::Graphics GameEngine::Scene GameEngine::Physics)
    engine_set_project_warnings(engine_playground_tests)
    add_test(NAME engine_playground_tests COMMAND engine_playground_tests)
    add_executable(engine_physics_tests tests/physics_tests.cpp)
    target_link_libraries(engine_physics_tests PRIVATE GameEngine::World GameEngine::Graphics GameEngine::Physics)
    engine_set_project_warnings(engine_physics_tests)
    add_test(NAME engine_physics_tests COMMAND engine_physics_tests)
    add_executable(engine_asset_tests tests/asset_tests.cpp)
    target_link_libraries(engine_asset_tests PRIVATE GameEngine::Graphics)
    engine_set_project_warnings(engine_asset_tests)
    add_test(NAME engine_asset_tests COMMAND engine_asset_tests "${CMAKE_CURRENT_SOURCE_DIR}/assets/cooked/bench.gea")
    add_executable(engine_scene_tests tests/scene_document_tests.cpp)
    target_link_libraries(engine_scene_tests PRIVATE GameEngine::Scene)
    engine_set_project_warnings(engine_scene_tests)
    add_test(NAME engine_scene_tests COMMAND engine_scene_tests)
    add_test(NAME engine_playground_headless COMMAND engine_playground --headless)
    add_test(NAME engine_playground_scene_headless
        COMMAND engine_playground --headless --scene "${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures/editor_scene.json")
    add_test(NAME engine_playground_save_scene_headless
        COMMAND engine_playground --headless --save-scene "${CMAKE_CURRENT_BINARY_DIR}/saved-scene.json")
    if(ENGINE_ENABLE_SDL3)
        add_test(NAME engine_playground_sdl COMMAND engine_playground --smoke)
        set_tests_properties(engine_playground_sdl PROPERTIES ENVIRONMENT "SDL_VIDEODRIVER=dummy")
    endif()
endif()

if(ENGINE_BUILD_TESTS)
    add_executable(engine_editor_bridge_tests tests/editor_bridge_tests.cpp apps/editor/runtime/bridge.cpp)
    target_link_libraries(engine_editor_bridge_tests PRIVATE GameEngine::World GameEngine::Physics)
    engine_set_project_warnings(engine_editor_bridge_tests)
    add_test(NAME engine_editor_bridge_tests COMMAND engine_editor_bridge_tests)
endif()
