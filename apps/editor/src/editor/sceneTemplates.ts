// Starting points for a new scene (0.77.0): New offers these instead of only
// an empty scene. Each is a small, playable scene document that shows the
// components a kind of game is built from. Components are written as just
// the fields that differ from the defaults; templateScene() fills the rest.
import { defaultComponent } from "../authoring/CommandInterpreter";

type Components = Record<string, unknown>;
interface Entity {
  name: string;
  components: Components;
}
export interface SceneTemplate {
  id: string;
  name: string;
  description: string;
  scene: { format: 1; name: string; entities: Entity[] };
}

const at = (x: number, y: number, z: number) => ({ Transform: { position: { x, y, z } } });
const size = (x: number, y: number, z: number) => ({ Scale: { value: { x, y, z } } });
const color = (r: number, g: number, b: number) => ({ Material: { color: { x: r, y: g, z: b }, roughness: 0.8, metalness: 0 } });
const solid = { Collider: { type: "AABB" } };
const box = (name: string, p: [number, number, number], s: [number, number, number], c: [number, number, number], extra: Components = {}): Entity => ({
  name,
  components: { ...at(...p), ...size(...s), Renderable: { mesh: 0, material: 0, visible: true }, ...color(...c), ...solid, ...extra },
});
const environment: Entity = {
  name: "Environment",
  components: { Environment: { sky: "Procedural", shadows: true, sunElevation: 40, sunAzimuth: 135 } },
};
const ground = (half = 30): Entity => box("Ground", [0, -0.5, 0], [half * 2, 1, half * 2], [0.35, 0.45, 0.32]);
const crates = (count: number): Entity[] =>
  Array.from({ length: count }, (_, i) => box(`Crate ${i + 1}`, [-8 + i * 4, 0.5, -6 - (i % 2) * 3], [1, 1, 1], [0.6, 0.45, 0.3]));

export const sceneTemplates: SceneTemplate[] = [
  { id: "blank", name: "Empty scene", description: "Nothing at all.", scene: { format: 1, name: "Untitled", entities: [] } },
  {
    id: "third-person",
    name: "Third-person starter",
    description: "A walking character with a follow camera, ground, sky and something to bump into.",
    scene: {
      format: 1,
      name: "Third-person starter",
      entities: [
        environment,
        ground(),
        ...crates(5),
        {
          name: "Player",
          components: {
            ...at(0, 0.9, 4),
            ...size(1, 1.8, 1),
            Renderable: { mesh: 132, material: 0, visible: true },
            Player: {},
            RigidBody: { mass: 70, dynamic: true },
            Collider: { type: "AABB" },
            CharacterController: { mode: "ThirdPerson" },
            CameraFollow: { offset: { x: 0, y: 3, z: 6 }, orbit: true },
          },
        },
      ],
    },
  },
  {
    id: "first-person",
    name: "First-person starter",
    description: "First-person movement and weapons, with targets that take damage.",
    scene: {
      format: 1,
      name: "First-person starter",
      entities: [
        environment,
        ground(),
        ...crates(3),
        {
          name: "Player",
          components: {
            ...at(0, 0.9, 6),
            ...size(0.6, 1.8, 0.6),
            Player: {},
            RigidBody: { mass: 70, dynamic: true },
            Collider: { type: "AABB" },
            CharacterController: { mode: "FirstPerson" },
            Weapons: {},
            Health: { current: 100, max: 100 },
          },
        },
        ...[-4, 0, 4].map((x, i) =>
          box(`Target ${i + 1}`, [x, 1, -10], [1, 2, 0.3], [0.8, 0.25, 0.2], {
            Health: { current: 50, max: 50 },
            Script: { source: 'function on_death() log("Target down") end', props: {} },
          }),
        ),
      ],
    },
  },
  {
    id: "racing",
    name: "Racing starter",
    description: "A drivable car, a follow camera and a ring of barriers.",
    scene: {
      format: 1,
      name: "Racing starter",
      entities: [
        environment,
        ground(80),
        {
          name: "Player Car",
          components: {
            ...at(0, 0.65, 0),
            ...size(1.8, 1.3, 4),
            Renderable: { mesh: 98, material: 0, visible: true },
            Player: {},
            Vehicle: { archetype: 0 },
            CameraFollow: { offset: { x: 0, y: 3, z: 8 } },
          },
        },
        ...Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return box(`Barrier ${i + 1}`, [Math.cos(a) * 45, 1, Math.sin(a) * 45], [10, 2, 0.6], [0.85, 0.85, 0.85], {
            Rotation: { euler: { x: 0, y: -a + Math.PI / 2, z: 0 } },
          });
        }),
      ],
    },
  },
  {
    id: "space",
    name: "Space starter",
    description: "A star system with a planet and moon, a ship on the pad and a landing site.",
    scene: {
      format: 1,
      name: "Space starter",
      entities: [
        { name: "Star System", components: { SpaceSystem: {} } },
        box("Landing Pad", [0, 0.2, 0], [20, 0.4, 20], [0.25, 0.27, 0.3]),
        {
          name: "Ship",
          components: { ...at(0, 2, 0), ...size(6, 2, 8), Renderable: { mesh: 0, material: 0, visible: true }, Spaceship: {} },
        },
        {
          name: "Player",
          components: {
            ...at(6, 0.9, 6),
            ...size(0.6, 1.8, 0.6),
            Renderable: { mesh: 132, material: 0, visible: true },
            Player: {},
            RigidBody: { mass: 70, dynamic: true },
            Collider: { type: "AABB" },
            CharacterController: { mode: "ThirdPerson" },
            CameraFollow: { offset: { x: 0, y: 3, z: 6 }, orbit: true },
          },
        },
      ],
    },
  },
];

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function merge(base: unknown, over: unknown): unknown {
  if (!isPlain(base) || !isPlain(over)) return over === undefined ? base : over;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = merge(base[k], v);
  return out;
}

// The template as a complete scene document: every component is its
// defaults with the template's fields on top.
export function templateScene(template: SceneTemplate) {
  return {
    ...template.scene,
    entities: template.scene.entities.map((e) => ({
      name: e.name,
      components: Object.fromEntries(
        Object.entries(e.components).map(([type, value]) => {
          let base: unknown = {};
          try {
            base = defaultComponent(type as never);
          } catch {
            base = {};
          }
          return [type, merge(structuredClone(base), value)];
        }),
      ),
    })),
  };
}
