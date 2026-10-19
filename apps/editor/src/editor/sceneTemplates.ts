// Starting points for a new scene: New offers these instead of only
// an empty scene. Each is a small, playable scene document that shows the
// components a kind of game is built from. Components are written as just
// the fields that differ from the defaults; templateScene() fills the rest.
import { migrateHud } from "../scene/hudMigration";
import { defaultComponent } from "../authoring/CommandInterpreter";
import type { UIWidget } from "../scene/Components";
import { widgetInfo } from "./uiKit";

// A UI kit widget's catalog place and text.
function widgetPlace(widget: UIWidget) {
  const kit = widgetInfo(widget);
  return { anchor: kit.anchor, offsetX: kit.offsetX, offsetY: kit.offsetY, text: kit.text, value: kit.value };
}

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
// A game camera following the Player (CameraFollow only drives an entity
// that has a Camera).
const followCamera = (offset: { x: number; y: number; z: number }, extra: Components = {}): Entity => ({
  name: "Camera",
  components: { Camera: { fov: 55 }, CameraFollow: { offset, ...extra } },
});
const environment: Entity = {
  name: "Environment",
  components: { Environment: { sky: "Procedural", shadows: true, sunElevation: 40, sunAzimuth: 135 } },
};
// Below y = 0 a body would be lifted onto the ground plane; a kinematic body
// stays put and is still solid.
const fixed = { RigidBody: { dynamic: false } };
const ground = (half = 30): Entity => box("Ground", [0, -0.5, 0], [half * 2, 1, half * 2], [0.35, 0.45, 0.32], fixed);
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
          },
        },
        followCamera({ x: 0, y: 3, z: 6 }, { orbit: true }),
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
            Health: { current: 100, maximum: 100 },
          },
        },
        ...[-4, 0, 4].map((x, i) =>
          box(`Target ${i + 1}`, [x, 1, -10], [1, 2, 0.3], [0.8, 0.25, 0.2], {
            Health: { current: 50, maximum: 50 },
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
            Renderable: { mesh: 219, material: 0, visible: true },
            Player: {},
            Vehicle: { archetype: 0 },
          },
        },
        followCamera({ x: 0, y: 3, z: 8 }),
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
          },
        },
        followCamera({ x: 0, y: 3, z: 6 }, { orbit: true }),
      ],
    },
  },
  {
    id: "dojo",
    name: "Martial-arts dojo",
    description: "Hand-to-hand combat: you against two AI fighters, with combos, kicks, specials, dodges, blocks and parries.",
    scene: {
      format: 1,
      name: "Dojo",
      entities: [
        { name: "Environment", components: { Environment: { sky: "Procedural", shadows: true, sunElevation: 32, sunAzimuth: 120 } } },
        box("Floor", [0, -0.5, 0], [24, 1, 24], [0.55, 0.4, 0.26], fixed),
        { name: "Mat", components: { ...at(0, 0.03, 0), ...size(12, 0.06, 12), ...fixed, Renderable: { mesh: 0, material: 0, visible: true }, ...color(0.7, 0.15, 0.12) } },
        ...[
          [-12, 0, 0, 24],
          [12, 0, 0, 24],
          [0, -12, 24, 0],
          [0, 12, 24, 0],
        ].map(([x, z, w, d], i) => box(`Wall ${i + 1}`, [x!, 1, z!], [w ? w : 0.4, 2, d ? d : 0.4], [0.82, 0.76, 0.62])),
        ...[
          [-6.5, -6.5],
          [6.5, -6.5],
          [-6.5, 6.5],
          [6.5, 6.5],
        ].map(([x, z], i) => box(`Pillar ${i + 1}`, [x!, 1.5, z!], [0.5, 3, 0.5], [0.35, 0.12, 0.08])),
        box("Training Dummy", [-4, 0.9, 3], [0.6, 1.8, 0.6], [0.75, 0.6, 0.4], {
          Health: { current: 9999, maximum: 9999 },
          Script: { source: "function on_damaged(amount) world.heal(self.id, amount) end", props: {} },
        }),
        {
          name: "Player",
          components: {
            ...at(0, 0.9, 4),
            ...size(0.6, 1.8, 0.6),
            // Facing the opponents (-z).
            Rotation: { euler: { x: 0, y: Math.PI, z: 0 } },
            Renderable: { mesh: 132, material: 0, visible: true },
            Player: {},
            RigidBody: { mass: 70, dynamic: true },
            Collider: { type: "AABB" },
            CharacterController: { mode: "ThirdPerson" },
            Health: { current: 200, maximum: 200 },
            Melee: { team: 0, ai: false, energy: 40 },
          },
        },
        // The offset turns with the Player: -z is behind one facing -z.
        followCamera({ x: 0, y: 1.9, z: -4.2 }, { orbit: true, lookHeight: 1.1 }),
        ...[
          { name: "Sparring Partner", x: -2.5, aggression: 0.45, skill: 0.3 },
          { name: "Sensei", x: 2.5, aggression: 0.7, skill: 0.75 },
        ].map(({ name, x, aggression, skill }) => ({
          name,
          components: {
            ...at(x, 0.9, -3),
            ...size(0.6, 1.8, 0.6),
            Rotation: { euler: { x: 0, y: Math.PI, z: 0 } },
            Renderable: { mesh: 175, material: 0, visible: true },
            RigidBody: { mass: 70, dynamic: true },
            Collider: { type: "AABB" },
            Health: { current: 120, maximum: 120 },
            Melee: { team: 1, ai: true, aggression, skill },
          },
        })),
        {
          name: "Controls",
          components: {
            UI: {
              text: "J / click punch · K / right-click heavy · F kick · Q special (+W, +S, S then W) · X dodge · R block · T lock on · Shift run",
              anchor: "bottom-center",
              offsetY: -16,
              fontSize: 14,
              color: { x: 1, y: 1, z: 1 },
              opacity: 0.8,
            },
          },
        },
      ],
    },
  },
  {
    id: "combat-range",
    name: "Combat range",
    description:
      "Third-person shooting: an over-the-shoulder camera, every imported gun held in two hands, aim assist on a gamepad or touch screen, hostile targets down three lanes, and a sparring ring with sword, sword and shield, dagger and bare-hand fighters.",
    scene: {
      format: 1,
      name: "Combat range",
      entities: [
        { name: "Environment", components: { Environment: { sky: "Procedural", shadows: true, sunElevation: 38, sunAzimuth: 150 } } },
        ground(45),
        // Three lanes downrange (-z), split by low walls, with cover.
        ...[-6, 6].map((x, i) => box(`Lane Wall ${i + 1}`, [x, 0.5, -20], [0.4, 1, 30], [0.62, 0.6, 0.55], fixed)),
        ...[
          [-9, -9],
          [0, -14],
          [9, -9],
          [-3, -24],
          [4, -28],
        ].map(([x, z], i) => box(`Cover ${i + 1}`, [x!, 0.6, z!], [2, 1.2, 0.6], [0.5, 0.42, 0.3], fixed)),
        box("Backstop", [0, 3, -37], [20, 6, 1], [0.4, 0.38, 0.36], fixed),
        // Hostile targets: soldiers (team 1) that hold still until shot.
        ...[
          [-9, -12],
          [0, -18],
          [9, -12],
          [-3, -30],
          [5, -33],
        ].map(([x, z], i) => ({
          name: `Target ${i + 1}`,
          components: {
            ...at(x!, 0.9, z!),
            ...size(0.6, 1.8, 0.6),
            Renderable: { mesh: 132, material: 0, visible: true },
            Material: { color: { x: 0.85, y: 0.25, z: 0.2 }, keepTextures: true, parts: "" },
            RigidBody: { mass: 70, dynamic: true },
            Collider: { type: "AABB" },
            Health: { current: 100, maximum: 100 },
            AICombat: { team: 1, behavior: "Guard", sightRange: 4, hearingRange: 0, moveSpeed: 1.2, meleeDamage: 4, useCover: false },
            // What a target drops when it goes down.
            LootDrop: { dropWeapon: false, table: "1 ammo 24\n0.35 health 25\n0.2 item Coin 10 rarity=Uncommon" },
          },
        })),
        // The range staff (team 0, the Player's side), on the pedestrian rig:
        // a rifle and a revolver in their hands.
        ...[
          { name: "Range Officer", mesh: 248, x: -12, loadout: "carbine: model=rifle held=carbine-2 mode=auto rpm=700 damage=20 mag=30" },
          { name: "Instructor", mesh: 249, x: 12, loadout: "revolver: model=pistol held=revolver-1 rpm=150 damage=60 mag=6" },
        ].map(({ name, mesh, x, loadout }) => ({
          name,
          components: {
            ...at(x, 0.9, -2),
            ...size(0.6, 1.8, 0.6),
            Rotation: { euler: { x: 0, y: Math.PI, z: 0 } },
            Renderable: { mesh, material: 0, visible: true },
            RigidBody: { mass: 70, dynamic: true },
            Collider: { type: "AABB" },
            AICombat: { team: 0, behavior: "Guard", sightRange: 1, hearingRange: 0 },
            Weapons: { loadout },
          },
        })),
        {
          name: "Player",
          components: {
            ...at(0, 0.9, 0),
            ...size(0.6, 1.8, 0.6),
            // Facing downrange (-z).
            Rotation: { euler: { x: 0, y: Math.PI, z: 0 } },
            Renderable: { mesh: 132, material: 0, visible: true },
            Player: {},
            RigidBody: { mass: 70, dynamic: true },
            Collider: { type: "AABB" },
            CharacterController: { mode: "ThirdPerson" },
            Health: { current: 200, maximum: 200 },
            Weapons: {
              loadout: [
                "pistol: model=pistol held=pistol-1 mode=semi rpm=380 damage=34 mag=12 reserve=-1 reload=1.3 spread=1.6 aim_spread=0.3 recoil=1.8 range=120 falloff=30 zoom=0.85 equip=0.3",
                "smg: model=smg held=smg-2 mode=auto rpm=850 damage=17 mag=32 reserve=192 reload=1.8 spread=2.6 aim_spread=0.6 recoil=0.6 range=90 falloff=25 zoom=0.85",
                "rifle: model=rifle held=rifle-2 mode=auto rpm=620 damage=24 mag=30 reserve=180 reload=2.1 spread=2.2 aim_spread=0.35 recoil=0.9 range=200 falloff=45 zoom=0.75",
                "shotgun: model=shotgun held=shotgun-1 mode=semi rpm=80 pellets=9 damage=12 mag=6 reserve=36 reload=0.5 per_shell spread=6 aim_spread=4.5 recoil=4.5 range=45 falloff=10 min_damage=0.2 zoom=0.9 equip=0.5",
                "sniper: model=sniper held=sniper-2 mode=semi rpm=45 damage=95 mag=5 reserve=25 reload=2.6 spread=3 aim_spread=0.05 recoil=3.5 range=400 falloff=200 zoom=0.35 equip=0.6",
              ].join("\n"),
              aimAssist: 0.6,
            },
          },
        },
        followCamera({ x: 0, y: 2.2, z: -4 }, { orbit: true, lookHeight: 1.4 }),
        // The gun wall behind the firing line: all forty guns, by class.
        box("Gun Wall", [0, 1.6, 8.2], [26, 3.2, 0.2], [0.3, 0.32, 0.34], fixed),
        ...Array.from({ length: 40 }, (_, i) => ({
          name: `Wall Gun ${i + 1}`,
          components: {
            ...at(-11.25 + (i % 10) * 2.5, 2.6 - Math.floor(i / 10) * 0.6, 7.95),
            Rotation: { euler: { x: 0, y: Math.PI / 2, z: 0 } },
            Renderable: { mesh: 262 + i, material: 0, visible: true },
          },
        })),
        // The sparring ring: one loadout each, fighting each other.
        { name: "Ring", components: { ...at(30, 0.03, -6), ...size(10, 0.06, 10), ...fixed, Renderable: { mesh: 0, material: 0, visible: true }, ...color(0.55, 0.16, 0.12) } },
        ...[
          { name: "Sword and Shield", x: 28, z: -8, team: 2, rightHand: 205, leftHand: 212 },
          { name: "Sword", x: 32, z: -8, team: 3, rightHand: 205, leftHand: 0 },
          { name: "Dagger", x: 28, z: -4, team: 3, rightHand: 0, leftHand: 203 },
          { name: "Bare Hands", x: 32, z: -4, team: 2, rightHand: 0, leftHand: 0 },
        ].map(({ name, x, z, team, rightHand, leftHand }) => ({
          name,
          components: {
            ...at(x, 0.9, z),
            ...size(0.6, 1.8, 0.6),
            Renderable: { mesh: 132, material: 0, visible: true },
            RigidBody: { mass: 70, dynamic: true },
            Collider: { type: "AABB" },
            Health: { current: 400, maximum: 400 },
            Melee: { team, ai: true, aggression: 0.5, skill: 0.6, rightHand, leftHand, shield: leftHand === 212, style: rightHand ? "Sword" : "Martial arts" },
          },
        })),
        // The loot corner, left of the firing line: a supply crate (hold E),
        // a chest that opens only with the Range Key, and pickups.
        {
          name: "Supply Crate",
          components: {
            ...at(-16, 0, -4),
            Renderable: { mesh: 183, material: 0, visible: true },
            Container: {
              table: "1 ammo 60\n1 health 50\n1 weapon carbine: model=rifle held=carbine-3 mode=auto rpm=700 damage=22 mag=30 reserve=90 rarity=Rare",
              hold: 0.6,
              key: "",
            },
          },
        },
        {
          name: "Armory Chest",
          components: {
            ...at(-21, 0, -4),
            Renderable: { mesh: 183, material: 0, visible: true },
            Container: {
              table: "1 weapon marksman: model=sniper held=sniper-4 mode=semi rpm=45 damage=110 mag=5 reserve=20 zoom=0.35 rarity=Legendary\n1 item Coin 50 rarity=Epic",
              hold: 0,
              key: "Range Key",
            },
          },
        },
        {
          name: "Range Key",
          components: { ...at(-24, 0.2, 1), Pickup: { kind: "Item", item: "Range Key", amount: 1, rarity: "Epic", press: false, respawn: 0 } },
        },
        {
          name: "Shotgun Pickup",
          components: {
            ...at(-16, 0.2, 1),
            Pickup: { kind: "Weapon", weapon: "pump: model=shotgun held=shotgun-3 mode=semi rpm=70 pellets=9 damage=12 mag=6 reserve=24", rarity: "Uncommon", press: true, respawn: 20 },
          },
        },
        { name: "Ammo Pickup", components: { ...at(-18.5, 0.2, 1), Pickup: { kind: "Ammo", amount: 60, rarity: "Common", press: false, respawn: 15 } } },
        { name: "Medkit", components: { ...at(-21, 0.2, 1), Pickup: { kind: "Health", amount: 50, rarity: "Uncommon", press: false, respawn: 30 } } },
        // The UI kit (uiKit.ts), Modern style; the crosshair, ammo, health
        // and loot prompts draw by default.
        ...(
          [
            ["Minimap", "always"],
            ["Compass", "always"],
            ["Kill feed", "always"],
            ["Damage numbers", "always"],
            ["Hotbar", "always"],
            ["Pause menu", "pause"],
          ] as const
        ).map(([widget, visibleWhen]) => ({
          name: `HUD ${widget}`,
          components: { UI: { kind: "Widget", widget, style: "Modern", visibleWhen, ...widgetPlace(widget) } },
        })),
        {
          name: "Controls",
          components: {
            UI: {
              text: "Left click fire · right click aim · R reload · 1-8 weapons · E pick up / hold E open · V shoulder · Shift run",
              anchor: "top-center",
              offsetY: 58,
              fontSize: 14,
              color: { x: 1, y: 1, z: 1 },
              opacity: 0.8,
            },
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
  // A template carries the HUD widgets it needs as real entities (hudMigration.ts adds them).
  return migrateHud({
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
  } as never).document;
}
