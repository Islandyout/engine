#pragma once

#include "engine/core/types.hpp"

#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace engine {

// A bounded native reader for the BTAI editor's "format 1" scene documents
// (apps/editor/src/scene/SceneSerializer.ts). This lets a scene exported by
// the browser editor be opened by the native playground.
//
// Only the components the native playground can visualize are fully
// shape-validated and captured here: Transform, Renderable, and Name. Every
// other component name the editor defines (Rotation, Scale, Velocity,
// Acceleration, RigidBody, Collider, Health, AIState, Pedestrian, Vehicle,
// AnimationState) is accepted as an opaque JSON object so editor scenes
// using them still load; their fields are not further checked or
// interpreted here, which is a narrower check than the editor's own
// per-component validation. A "Parent" reference is validated the same way
// the editor validates it (bounds, generation 1, no cycles), but hierarchy
// is not applied to rendering: every entity is placed at its own Transform
// position.
// Deliberately separate from engine::Vec3 (engine/graphics/box_view.hpp):
// scene documents are graphics-agnostic data, and this module has no
// dependency on the rendering library. Callers that need a Box/Vec3 convert
// this themselves (see apps/native_playground/scene.hpp).
struct SceneVec3 {
    f32 x{};
    f32 y{};
    f32 z{};
};

struct TransformComponent {
    SceneVec3 position;
};

struct RenderableComponent {
    u32 mesh{};
    u32 material{};
    bool visible{true};
};

struct SceneEntity {
    std::optional<std::string> name;
    std::optional<int> parent; // validated index into the document's entities
    std::optional<TransformComponent> transform;
    std::optional<RenderableComponent> renderable;
};

struct SceneDocument {
    std::vector<SceneEntity> entities;
};

// Throws std::runtime_error, with a message naming the first problem found,
// on anything the editor's own validator would also reject: wrong or
// missing format, a non-object entity, an unrecognized component name, a
// malformed Transform/Renderable/Name, more than 1024 entities, or an
// out-of-range, wrong-generation, or cyclic parent reference.
[[nodiscard]] SceneDocument parse_scene_document(std::string_view text);

// Inverse of parse_scene_document for the fields SceneDocument models: writes
// compact "format 1" JSON — {"format":1,"entities":[{"name"?,"parent"?,
// "components":{"Transform"?,"Renderable"?}}]} — that parse_scene_document,
// and the editor's own parseSceneText/deserializeScene
// (apps/editor/src/scene/SceneSerializer.ts), can read back. A name is
// written only as the entity-level "name" field, never duplicated into a
// "Name" component; both readers accept that form. Because SceneDocument
// does not retain the editor's other component types (Rotation, Scale,
// Velocity, Acceleration, RigidBody, Collider, Health, AIState, Pedestrian,
// Vehicle, AnimationState) or the "Name" component's own payload shape,
// round-tripping an arbitrary editor export through parse then serialize
// reproduces only name, parent, Transform and Renderable, not a
// byte-for-byte copy.
[[nodiscard]] std::string serialize_scene_document(const SceneDocument& document);

} // namespace engine
