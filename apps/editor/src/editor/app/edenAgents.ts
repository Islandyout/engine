import { actionOf, AFFORDANCES, hourOf, makePerson, step, type Person, type Thing, type World } from "../../eden/mind";
import { SEASON_NAMES } from "../../eden/earth";
import { runCreatorCommand } from "../../eden/creator";
import { worldFromJson, worldToJson } from "../../eden/persist";
import { DRINK_SPOT, EDEN_LANDMARKS, EDEN_PLACES } from "../../eden/places";
import { generateHeights, sampleHeight } from "../terrain";
import { buildEdenPanel, SPEEDS, type EdenPanel } from "./edenUi";
import type { Ctx } from "./context";

// Eden: runs the minds of Adam and Eve (src/eden/mind.ts) on this machine, with no network and no AI model, and drives their Lua scripts
// (tools/eden/lua/{adam,eve}.lua) from what they decide. The Lua VM can only receive an event name and a string payload, through
// editor_ui_event, so each new decision goes to the person's script as "x,y,z,action,speed"; the body walks there on its own paths and
// physics, and this module reads where the body actually is before every step so the mind never drifts from it.
//
// The Creator's panel (edenUi.ts) shows what they are doing and why, sets the speed of time, saves the world, and takes words that change
// it (creator.ts). Above 3x the bodies cannot keep up with the minds, so the minds walk themselves and the bodies are put where they are.

const PEOPLE = [
  { id: "adam", name: "Adam", sex: "m", personality: { boldness: 0.55, sociability: 0.45, curiosity: 0.7, appetite: 0.6, patience: 0.5 } },
  { id: "eve", name: "Eve", sex: "f", personality: { boldness: 0.4, sociability: 0.75, curiosity: 0.6, appetite: 0.45, patience: 0.65 } },
] as const;

// What each of the minds' actions plays on a model: names tried in order, first match wins, like F48's "attack"/"blast"/"sit".
// Exported, not registered into C.actionClipSynonyms from here: that Map isn't created until deep inside main.ts's startEditor(), well
// after every install*(C) call has already run -- these entries get merged into main.ts's own literal instead.
export const EDEN_ACTION_CLIPS: [string, string[]][] = [
  ["rest", ["sit", "idle"]],
  ["wander", ["walk"]],
  ["flee", ["run", "walk"]],
  ["observe", ["idle"]],
  ["talk_to_other", ["talk", "idle"]],
  ["play_together", ["clapping", "wave", "idle"]],
  ["forage", ["clapping", "idle"]],
  ["drink_from_river", ["sit", "idle"]],
];

const TICK_MS = 250;
// Seconds of sim time a single step of the minds covers when the bodies are not keeping up (above 3x).
const FAST_STEP = 0.75;
const SAVE_KEY = "eden-world-v1";
const AUTOSAVE_MS = 20_000;
const DEFAULT_SPEED = 2; // index into SPEEDS: 3x

const PLACE_NAME: Record<string, string> = {};
for (const place of Object.values(EDEN_PLACES)) PLACE_NAME[place.kind] = place.name;
const KIND_NAME: Record<string, string> = { ...PLACE_NAME, campfire: "the fire", shelter: "the shelter", tree: "a tree", "fruit tree": "a fruit tree", bush: "a bush", rock: "a rock", deer: "a deer", fox: "a fox", alpaca: "an alpaca", "tree of life": "the Tree of Life", "tree of knowledge": "the Tree of Knowledge" };

const VERB: Record<string, string> = { gather: "goes to gather wood at", fire: "makes a fire", build: "starts building a shelter", stash: "goes to put food away at", forage: "goes to gather food at", warm: "goes to warm up at", share: "goes to share food with", eat: "goes to eat at", drink: "goes to drink at", rest: "goes to rest at", sleep: "goes to sleep at", look: "goes to look at", play: "goes to play at", talk: "goes to talk with", wander: "wanders off", flee: "runs from", linger: "pauses" };

function describe(person: Person, world: World): string {
  const i = person.intent;
  if (!i) return "";
  const target = i.kind === "talk" || i.kind === "share" ? world.people.find((p) => p.id === i.targetId)?.name : KIND_NAME[world.things.find((t) => t.id === i.targetId)?.kind ?? ""];
  return target ? `${VERB[i.kind]} ${target}` : VERB[i.kind]!;
}

function moodWord(m: number): string {
  return m > 0.55 ? "delighted" : m > 0.2 ? "content" : m > -0.2 ? "calm" : m > -0.55 ? "uneasy" : "miserable";
}
function needWord(p: Person): string {
  const n = p.needs;
  if (n.thirst > 0.75) return "thirsty";
  if (n.hunger > 0.75) return "hungry";
  if (n.energy > 0.75) return "tired";
  if (n.social > 0.75) return "lonely";
  if (n.joy > 0.8) return "bored";
  return "";
}

// True only for a scene that actually carries Eden's own characters -- found by the exact "eden_target_adam" on_ui name adam.lua listens
// for, not by any metadata the serialized scene doesn't reliably keep. Other games share this same bundle and must never see the panel.
function isEdenScene(C: Ctx): boolean {
  for (const entity of C.doc.scene.eachAlive()) {
    const script = C.doc.scene.resolve(entity, "Script");
    if (script?.source.includes("eden_target_adam")) return true;
  }
  return false;
}

function readSave(): string | undefined {
  try {
    return localStorage.getItem(SAVE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function installEdenAgents(C: Ctx): void {
  let panel: EdenPanel | undefined;
  let world: World | undefined;
  let speed = DEFAULT_SPEED;
  const sent = new Map<string, string>(); // what each person's script was last told
  const spoken = new Map<string, string>();
  const described = new Map<string, string>();
  // What the people have built or the Creator has made that is already in the scene (thing id), so each is put there once and a spent fire
  // is taken away.
  const placedThings = new Set<string>();
  let lastHour = -1;
  let lastRain = -1;
  let lastSave = 0;
  let lastMinds = 0;

  const ui = (kind: string, value: string) => C.runtime.ccall("editor_ui_event", null, ["string", "string"], [kind, value]);
  const bodyIndex = (name: string) => C.doc.scene.eachAlive().findIndex((e) => C.doc.scene.resolve(e, "Name")?.value === name);
  function bodyPosition(name: string): [number, number, number] | undefined {
    const index = bodyIndex(name);
    const object = index >= 0 ? C.objects[index] : undefined;
    return object ? [object.position.x, object.position.y, object.position.z] : undefined;
  }

  function freshWorld(): World {
    const things: Thing[] = [];
    // The mind's radius is how near counts as "at" a place, not the place's own size (EDEN_PLACES.radius is the terrain feature).
    for (const place of Object.values(EDEN_PLACES)) {
      const at = place.id === "river_bend" ? DRINK_SPOT : place;
      things.push({ id: place.id, kind: place.kind, x: at.x, z: at.z, radius: 3 });
    }
    // The two landmark trees stand where the scene put them; they are there to be looked at and, for the Tree of Life, eaten from.
    for (const landmark of EDEN_LANDMARKS) {
      const stock = AFFORDANCES[landmark.kind]?.stock;
      things.push({ id: landmark.id, kind: landmark.kind, x: landmark.x, z: landmark.z, radius: 3, stock, maxStock: stock });
    }
    const people = PEOPLE.map((p, i) => {
      const at = bodyPosition(p.name) ?? [0, 0, 0];
      return makePerson(p.id, at[0], at[2], 1000 + i * 77, p.personality, { name: p.name, sex: p.sex, age: 20 });
    });
    // radius: the garden's own edge (the terrain is 80 m across), so a person searching for water does not wander off the map.
    return { things, people, radius: 36 };
  }

  // The terrain's height under (x, z): Lua's ray cast sees only solid objects and a flat ground, not the sculpted terrain, so the host works
  // it out from the Terrain component once and tells Lua where the ground is.
  let ground: { heights: Float32Array; resolution: number; size: number } | undefined;
  function groundY(x: number, z: number): number {
    if (!ground) {
      for (const e of C.doc.scene.eachAlive()) {
        const t = C.doc.scene.resolve(e, "Terrain");
        if (t) {
          ground = { heights: generateHeights(t), resolution: t.resolution, size: t.size };
          break;
        }
      }
    }
    return ground ? sampleHeight(ground.heights, ground.resolution, ground.size, x, z) : 0;
  }

  function snap(person: { id: string; x: number; z: number }) {
    ui(`eden_snap_${person.id}`, `${person.x},${groundY(person.x, person.z)},${person.z}`);
    sent.delete(person.id);
  }

  function startWorld() {
    const text = readSave();
    let loaded: World | undefined;
    if (text) {
      try {
        loaded = worldFromJson(text);
      } catch (e) {
        // A damaged save is said so, not silently replaced.
        panel?.lifeLog(`The saved world could not be read (${String(e)}). Starting a new one.`);
        C.log(`Eden: ${String(e)}`);
      }
    }
    world = loaded ?? freshWorld();
    sent.clear();
    spoken.clear();
    described.clear();
    placedThings.clear();
    lastRain = -1;
    lastHour = -1;
    if (loaded) {
      // Put the bodies where the saved people are.
      for (const p of world.people) snap(p);
      panel?.lifeLog(`Carried on from the saved world (day ${Math.floor((world.clock ?? 0) / 1440) + 1}).`);
      panel?.setSaved("loaded");
    }
  }

  function save() {
    if (!world) return;
    try {
      localStorage.setItem(SAVE_KEY, worldToJson(world));
      lastSave = performance.now();
      panel?.setSaved("saved");
    } catch (e) {
      panel?.setSaved("could not save");
      panel?.lifeLog(`Could not save the world: ${String(e)}`);
    }
  }

  function newWorld() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // nothing to remove
    }
    // Take away what was built, put the people back where they began, and start again.
    for (const id of [...placedThings]) ui("eden_remove", id);
    placedThings.clear();
    world = freshWorld();
    for (const p of world.people) {
      p.x = 0;
      p.z = 0;
      snap(p);
    }
    panel?.lifeLog("A new world begins.");
    panel?.setSaved("new world");
  }

  function creatorCommand(text: string) {
    if (!world || !panel) return;
    const result = runCreatorCommand(world, text);
    panel.creatorLog(`${text.trim() ? `${text.trim()} → ` : ""}${result.message}`, result.ok);
    if (!result.ok) return;
    panel.lifeLog(`✦ ${result.message}`);
    for (const m of result.moved ?? []) snap(m);
    save();
  }

  // What the people make and the Creator makes goes into the scene; the sky and the rain follow the clock and the weather.
  function sync(w: World, hour: number) {
    for (const thing of w.things) {
      if (thing.prefab && !placedThings.has(thing.id)) {
        placedThings.add(thing.id);
        ui("eden_place", `${thing.id},${thing.prefab},${thing.x},${groundY(thing.x, thing.z)},${thing.z}`);
      }
    }
    for (const id of [...placedThings]) {
      if (!w.things.some((t) => t.id === id)) {
        placedThings.delete(id);
        ui("eden_remove", id);
      }
    }
    if (Math.floor(hour * 4) !== lastHour) {
      lastHour = Math.floor(hour * 4);
      ui("eden_time", String(hour));
    }
    const rainNow = w.weather?.raining ? 1 : 0;
    if (rainNow !== lastRain) {
      lastRain = rainNow;
      ui("eden_weather", `${rainNow * 0.7},${rainNow * 0.25}`);
    }
  }

  function tick() {
    if (!world || !panel) return;
    const w = world;
    const simSeconds = (TICK_MS / 1000) * SPEEDS[speed]!;
    const fast = SPEEDS[speed]! > 3;
    if (simSeconds > 0) {
      if (!fast) {
        // The bodies are where physics and paths put them; the minds start from there.
        for (const person of w.people) {
          const at = bodyPosition(person.name);
          if (at) {
            person.x = at[0];
            person.z = at[2];
          }
        }
        step(w, simSeconds, { externalMotion: true });
      } else {
        // Too fast for the bodies: the minds walk themselves, and the bodies are put where they are.
        for (let left = simSeconds; left > 0; left -= FAST_STEP) step(w, Math.min(FAST_STEP, left));
        for (const person of w.people) snap(person);
      }
    }

    const hour = hourOf(w.clock ?? 0);
    sync(w, hour);
    const weather = w.weather;
    if (weather) {
      panel.setHeader(`Eden · ${SEASON_NAMES[weather.season]} · ${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.floor((hour % 1) * 60)).padStart(2, "0")} · ${Math.round(weather.tempC)}°C${weather.raining ? " · rain" : ""}`);
    }

    for (const person of w.people) {
      const intent = person.intent;
      if (intent && !fast && simSeconds > 0) {
        const action = actionOf(person);
        const key = `${intent.kind}|${intent.targetId ?? ""}|${intent.arrived}|${Math.round(intent.x)}|${Math.round(intent.z)}`;
        if (sent.get(person.id) !== key) {
          sent.set(person.id, key);
          // Where the body should walk, and how fast; it stays at the spot, and plays the action, once there.
          ui(`eden_target_${person.id}`, `${intent.x},0,${intent.z},${action},${intent.speed}`);
        }
      }
      const text = describe(person, w);
      if (text && described.get(person.id) !== text && intent?.kind !== "linger" && !fast) {
        described.set(person.id, text);
        panel.lifeLog(`${person.name} ${text}.`);
      }
      if (person.say && spoken.get(person.id) !== person.say) {
        spoken.set(person.id, person.say);
        panel.lifeLog(`${person.name}: "${person.say}"`);
      }
      const carrying = person.carry.wood || person.carry.food ? ` · carrying ${[person.carry.wood ? `${person.carry.wood} wood` : "", person.carry.food ? `${person.carry.food} food` : ""].filter(Boolean).join(", ")}` : "";
      const need = needWord(person);
      panel.lifeStatus(person.id, person.name, `${moodWord(person.mood)}${need ? `, ${need}` : ""}${text ? ` · ${text}` : ""}${carrying}${person.cold > 0.5 ? " · cold" : ""}${person.health < 0.9 ? " · hurt" : ""}`);
    }

    const now = performance.now();
    if (panel.tab() === "minds" && now - lastMinds > 700) {
      lastMinds = now;
      panel.renderMinds(w);
    }
    if (now - lastSave > AUTOSAVE_MS) save();
  }

  function setSpeed(index: number) {
    speed = index;
    panel?.setSpeed(index);
    // Coming back down from fast time, the bodies carry on from where they were put.
    sent.clear();
  }

  function mountPanel() {
    panel = buildEdenPanel({ speed: setSpeed, save, newWorld, creator: creatorCommand });
    panel.setSpeed(speed);
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") save();
    });
  }

  // Decided afresh each time Play starts, because the editor can switch scenes between plays: only an Eden scene mounts the panel and runs.
  let wasPlaying = false;
  let inEden = false;
  setInterval(() => {
    if (C.doc.mode !== "play") {
      if (wasPlaying && inEden) save();
      wasPlaying = false;
      if (panel) panel.root.style.display = "none";
      return;
    }
    if (!wasPlaying) {
      wasPlaying = true;
      inEden = isEdenScene(C);
      if (inEden && !panel) mountPanel();
      if (panel) panel.root.style.display = inEden ? "" : "none";
      if (inEden) {
        startWorld();
        lastSave = performance.now();
      }
    }
    if (inEden) tick();
  }, TICK_MS);
}
