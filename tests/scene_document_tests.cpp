#include "engine/scene/scene_document.hpp"

#include <iostream>
#include <stdexcept>

namespace {
void check(bool pass, const char *message) {
    if (!pass)
        throw std::runtime_error{message};
}
bool rejects(std::string_view text) {
    try {
        static_cast<void>(engine::parse_scene_document(text));
        return false;
    } catch (const std::runtime_error &) {
        return true;
    }
}
} // namespace

int main() {
    try {
        using namespace engine;

        // A document shaped like the BTAI editor's own SceneSerializer.ts output.
        const auto document = parse_scene_document(R"({
            "format": 1,
            "name": "sample",
            "entities": [
                {
                    "name": "Player",
                    "components": {
                        "Transform": {"position": {"x": 1, "y": 2, "z": 3}},
                        "Renderable": {"mesh": 2, "material": 5, "visible": true}
                    }
                },
                {
                    "components": {
                        "Transform": {"position": {"x": -4, "y": 0, "z": 8.5}},
                        "Health": {"current": 100, "maximum": 100}
                    }
                },
                {
                    "parent": {"index": 0, "generation": 1},
                    "components": {}
                }
            ]
        })");
        check(document.entities.size() == 3, "parses all entities");
        check(document.entities[0].name == "Player", "captures entity name");
        check(document.entities[0].transform.has_value(), "captures Transform");
        check(document.entities[0].transform->position.x == 1.0F &&
                  document.entities[0].transform->position.z == 3.0F,
              "captures Transform position");
        check(document.entities[0].renderable.has_value() &&
                  document.entities[0].renderable->material == 5,
              "captures Renderable fields");
        check(document.entities[1].transform.has_value() &&
                  !document.entities[1].renderable.has_value(),
              "Health-only entity still yields its Transform, ignoring the opaque component");
        check(document.entities[2].parent.has_value() && *document.entities[2].parent == 0,
              "captures a valid parent reference");

        // Defaults: Renderable fields are optional.
        const auto defaulted = parse_scene_document(R"({
            "format": 1,
            "entities": [{"components": {"Renderable": {}}}]
        })");
        check(defaulted.entities[0].renderable.has_value() &&
                  defaulted.entities[0].renderable->visible,
              "Renderable defaults to visible with zeroed mesh/material");

        check(rejects(R"({"format": 2, "entities": []})"), "rejects wrong format");
        check(rejects(R"({"format": 1})"), "rejects missing entities array");
        check(rejects("not json"), "rejects malformed JSON");
        check(rejects(R"({"format": 1, "entities": [{"components": {"Nonsense": {}}}]})"),
              "rejects unknown component names");
        check(rejects(R"({"format": 1, "entities": [{"components": {"Transform": {}}}]})"),
              "rejects a Transform missing its position");
        check(rejects(
                  R"({"format": 1, "entities": [{"components": {"Transform": {"position": {"x": 0, "y": 0, "z": "bad"}}}}]})"),
              "rejects a non-numeric position field");
        check(rejects(
                  R"({"format": 1, "entities": [
                        {"parent": {"index": 1, "generation": 1}, "components": {}},
                        {"parent": {"index": 0, "generation": 1}, "components": {}}
                    ]})"),
              "rejects a cyclic parent reference");
        check(rejects(
                  R"({"format": 1, "entities": [{"parent": {"index": 5, "generation": 1}, "components": {}}]})"),
              "rejects an out-of-range parent index");
        check(rejects(R"({"format": 1, "entities": {}})"), "rejects a non-array entities field");
        check(rejects(R"([1, 2, 3])"), "rejects a non-object document");

        // A "Parent" component embedded inside `components` is tolerated
        // (the editor itself skips it there; hierarchy travels through the
        // entity-level "parent" field instead).
        static_cast<void>(parse_scene_document(
            R"({"format": 1, "entities": [{"components": {"Parent": "anything"}}]})"));

        std::cout << "Scene document parsing, validation and rejection cases passed.\n";
    } catch (const std::exception &e) {
        std::cerr << e.what() << '\n';
        return 1;
    }
}
