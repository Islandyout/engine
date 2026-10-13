// Every authoring-console command with a starting point to edit, for the
// console's command search. Entities are { "index": n, "generation": g }
// (list_entities prints them).
export interface CommandTemplate {
  name: string;
  about: string;
  example: Record<string, unknown>;
}

const entity = { index: 0, generation: 0 };

export const commandTemplates: readonly CommandTemplate[] = [
  { name: "list_entities", about: "Every entity with its index and name", example: { command: "list_entities" } },
  { name: "describe_entity", about: "One entity's components", example: { command: "describe_entity", entity } },
  { name: "spawn_entity", about: "A new entity at a position", example: { command: "spawn_entity", name: "Box", transform: [0, 0, 0] } },
  { name: "destroy_entity", about: "Delete an entity", example: { command: "destroy_entity", entity } },
  { name: "rename_entity", about: "Change an entity's name", example: { command: "rename_entity", entity, name: "New name" } },
  { name: "reparent_entity", about: "Parent an entity to another (null to clear)", example: { command: "reparent_entity", entity, parent: null } },
  { name: "set_transform", about: "Move an entity", example: { command: "set_transform", entity, position: [0, 0, 0] } },
  { name: "set_velocity", about: "Set an entity's velocity", example: { command: "set_velocity", entity, velocity: [0, 0, 0] } },
  { name: "set_physics", about: "Dynamic or fixed, and mass", example: { command: "set_physics", entity, dynamic: true, mass: 1 } },
  { name: "set_ai_state", about: "Set an AI's state", example: { command: "set_ai_state", entity, state: "Idle" } },
  { name: "trigger_animation", about: "Play a clip on a model", example: { command: "trigger_animation", entity, clip: "Idle", looping: true } },
  { name: "attach_component", about: "Add a component with its defaults", example: { command: "attach_component", entity, type: "Health" } },
  { name: "set_component", about: "Replace a component's value", example: { command: "set_component", entity, type: "Health", value: { current: 100, maximum: 100 } } },
  { name: "remove_component", about: "Remove a component", example: { command: "remove_component", entity, type: "Health" } },
  { name: "create_prefab", about: "Make a prefab from an entity", example: { command: "create_prefab", entity, name: "Crate" } },
  { name: "place_instance", about: "Place a prefab instance", example: { command: "place_instance", prefab: "Crate", transform: [0, 0, 0] } },
  { name: "unlink_instance", about: "Detach an instance from its prefab", example: { command: "unlink_instance", entity } },
  { name: "save_scene", about: "Save the scene in this browser", example: { command: "save_scene", path: "my-scene" } },
  { name: "load_scene", about: "Load a scene saved in this browser", example: { command: "load_scene", path: "my-scene" } },
];
