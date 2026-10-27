import { actionOf, applySpokenIntent, ADULT_AGE, AFFORDANCES, hourOf, isNight, make, makePerson, step, type Person, type Thing, type World } from "../../eden/mind";
import { moonName, SEASON_NAMES, solarHour } from "../../eden/earth";
import { runCreatorCommand } from "../../eden/creator";
import { worldFromJson, worldToJson } from "../../eden/persist";
import { DRINK_SPOT, EDEN_LANDMARKS, EDEN_PLACES } from "../../eden/places";
import { generateHeights, sampleHeight } from "../terrain";
import { buildEdenPanel, SPEEDS, type EdenPanel } from "./edenUi";
import { loadVoice, saveVoice, Voice } from "./edenVoice";
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
const WORLD_RADIUS = 190;
const SAVE_KEY = "eden-world-v1";
const AUTOSAVE_MS = 20_000;
const DEFAULT_SPEED = 2; // index into SPEEDS: 3x

const PLACE_NAME: Record<string, string> = {};
for (const place of Object.values(EDEN_PLACES)) PLACE_NAME[place.kind] = place.name;
const KIND_NAME: Record<string, string> = { ...PLACE_NAME, campfire: "the fire", shelter: "the shelter", tree: "a tree", "fruit tree": "a fruit tree", bush: "a bush", rock: "a rock", grave: "a grave", deer: "a deer", fox: "a fox", alpaca: "an alpaca", wolf: "a wolf", horse: "a horse", "tree of life": "the Tree of Life", "tree of knowledge": "the Tree of Knowledge" };

const VERB: Record<string, string> = { gather: "goes to gather wood at", fire: "makes a fire", build: "starts building a shelter", stash: "goes to put food away at", forage: "goes to gather food at", warm: "goes to warm up at", share: "goes to share food with", comfort: "goes to sit with", plant: "goes to plant a seed", craft: "makes a spear", hunt: "hunts", fish: "goes fishing at", mourn: "goes to sit at", eat: "goes to eat at", drink: "goes to drink at", rest: "goes to rest at", sleep: "goes to sleep at", look: "goes to look at", play: "goes to play at", talk: "goes to talk with", wander: "wanders off", flee: "runs from", linger: "pauses" };

function describe(person: Person, world: World): string {
  const i = person.intent;
  if (!i) return "";
  if (i.kind === "eat" && !i.targetId) return "eats what they are carrying";
  const target = i.kind === "talk" || i.kind === "share" || i.kind === "comfort" ? world.people.find((p) => p.id === i.targetId)?.name : KIND_NAME[world.things.find((t) => t.id === i.targetId)?.kind ?? ""];
  return target ? `${VERB[i.kind]} ${target}` : VERB[i.kind]!;
}

function moodWord(m: number): string {
  return m > 0.55 ? "delighted" : m > 0.2 ? "content" : m > -0.2 ? "calm" : m > -0.55 ? "uneasy" : "miserable";
}
function needWord(p: Person): string {
  const n = p.needs;
  if ((p.grief ?? 0) > 0.4) return "grieving";
  const e = p.emotions;
  if (e && (e.fear ?? 0) > 0.5) return "frightened";
  if (e && (e.anger ?? 0) > 0.5) return "angry";
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
  // The bodies of people who were not in the scene at the start (children born here, people the Creator brought): the entity index each
  // reported (person.lua says "eden_body"), and which prefab is standing for them now (a child is replaced by an adult body when they grow up).
  const bodyIndexById = new Map<string, number>();
  const placedPeople = new Map<string, string>();
  const knownPeople = new Set<string>();
  const announcedDead = new Set<string>();
  const lastMoved = new Map<string, [number, number]>();
  C.edenBody = (index, who) => bodyIndexById.set(who, index);
  const voice = new Voice(loadVoice(), (text) => panel?.voiceStatus(text) ?? C.log(`Eden voice: ${text}`));

  const ui = (kind: string, value: string) => C.runtime.ccall("editor_ui_event", null, ["string", "string"], [kind, value]);
  const bodyIndex = (name: string) => C.doc.scene.eachAlive().findIndex((e) => C.doc.scene.resolve(e, "Name")?.value === name);
  function bodyPosition(name: string): [number, number, number] | undefined {
    const index = bodyIndex(name);
    const object = index >= 0 ? C.objects[index] : undefined;
    return object ? [object.position.x, object.position.y, object.position.z] : undefined;
  }

  const ORIGINAL = new Map<string, string>(PEOPLE.map((p) => [p.id, p.name]));
  function positionOf(person: Person): [number, number, number] | undefined {
    const original = ORIGINAL.get(person.id);
    if (original) return bodyPosition(original);
    const index = bodyIndexById.get(person.id);
    const object = index !== undefined ? C.objects[index] : undefined;
    return object ? [object.position.x, object.position.y, object.position.z] : undefined;
  }
  const bodyPrefab = (p: Person) => `${p.age < ADULT_AGE ? "Child" : "Villager"} (${p.age < ADULT_AGE ? (p.sex === "m" ? "boy" : "girl") : p.sex === "m" ? "man" : "woman"})`;

  function freshWorld(): World {
    const things: Thing[] = [];
    // The mind's radius is how near counts as "at" a place, not the place's own size (EDEN_PLACES.radius is the terrain feature).
    for (const place of Object.values(EDEN_PLACES)) {
      const at = place.id === "river_bend" ? DRINK_SPOT : (place.stand ?? place);
      const stock = AFFORDANCES[place.kind]?.stock;
      things.push({ id: place.id, kind: place.kind, x: at.x, z: at.z, radius: 3, ...(stock !== undefined ? { stock, maxStock: stock } : {}) });
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
    // radius: the world's own edge (the terrain is 400 m across), so a person searching for water does not wander off the map.
    const created: World = { things, people, radius: WORLD_RADIUS };
    // Berry bushes in the woods and meadows, so there is something to find on the way.
    for (const id of ["east_woods", "south_meadow", "pinewood", "meadow"]) {
      const place = EDEN_PLACES[id]!;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + id.length;
        make(created, "bush", place.x + Math.cos(a) * place.radius * 0.5, place.z + Math.sin(a) * place.radius * 0.5, { radius: 2, stock: 4, maxStock: 4 });
      }
    }
    // Herds of deer in the meadows and woods, so there is something living to watch and, in time, to hunt; horses on the grass; wolves in the hills.
    const herd = (kind: string, id: string, count: number) => {
      const place = EDEN_PLACES[id]!;
      for (let i = 0; i < count; i++) make(created, kind, place.x + i * 2 - count, place.z + (i % 2) * 3, { radius: 2 });
    };
    herd("deer", "meadow", 3);
    herd("deer", "south_meadow", 4);
    herd("deer", "east_woods", 3);
    herd("deer", "highlands", 3);
    herd("horse", "south_meadow", 3);
    herd("alpaca", "meadow", 2);
    herd("wolf", "highlands", 2);
    return created;
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
    placedPeople.clear();
    bodyIndexById.clear();
    knownPeople.clear();
    announcedDead.clear();
    lastMoved.clear();
    for (const p of world.people) knownPeople.add(p.id);
    for (const d of world.dead ?? []) announcedDead.add(d.person.id);
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
    for (const id of [...placedPeople.keys()]) ui("eden_remove", id);
    placedPeople.clear();
    bodyIndexById.clear();
    announcedDead.clear();
    lastMoved.clear();
    world = freshWorld();
    knownPeople.clear();
    for (const p of world.people) knownPeople.add(p.id);
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
    // Creatures that have walked on.
    for (const thing of w.things) {
      if (!thing.mob || !placedThings.has(thing.id)) continue;
      const last = lastMoved.get(thing.id);
      if (!last || Math.hypot(thing.x - last[0], thing.z - last[1]) > 0.3) {
        lastMoved.set(thing.id, [thing.x, thing.z]);
        ui("eden_move", `${thing.id},${thing.x},${groundY(thing.x, thing.z)},${thing.z}`);
      }
    }
    // Bodies for people who were not in the scene at the start; a child's is swapped for an adult's when they grow up.
    for (const person of w.people) {
      if (ORIGINAL.has(person.id)) continue;
      const want = bodyPrefab(person);
      const have = placedPeople.get(person.id);
      if (have !== want) {
        if (have) {
          ui("eden_remove", person.id);
          bodyIndexById.delete(person.id);
        }
        placedPeople.set(person.id, want);
        ui("eden_place", `${person.id},${want},${person.x},${groundY(person.x, person.z)},${person.z},${person.id}`);
        sent.delete(person.id);
      }
    }
    // Those who have died: the body lies down (Adam and Eve's own) or is taken away, and the Creator is told.
    for (const d of w.dead ?? []) {
      if (announcedDead.has(d.person.id)) continue;
      announcedDead.add(d.person.id);
      panel?.lifeStatusRemove(d.person.id);
      panel?.lifeLog(`✝ ${d.person.name} died of ${d.cause}, aged ${d.person.age.toFixed(0)}.`);
      if (ORIGINAL.has(d.person.id)) ui(`eden_die_${d.person.id}`, "");
      else if (placedPeople.has(d.person.id)) {
        ui("eden_remove", d.person.id);
        placedPeople.delete(d.person.id);
      }
    }
    if (Math.floor(hour * 4) !== lastHour) {
      lastHour = Math.floor(hour * 4);
      ui("eden_time", String(solarHour(w.clock ?? 0)));
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
          const at = positionOf(person);
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
      panel.setHeader(`Eden · ${SEASON_NAMES[weather.season]} · ${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.floor((hour % 1) * 60)).padStart(2, "0")} · ${Math.round(weather.tempC)}°C${weather.raining ? " · rain" : ""}${isNight(w.clock ?? 0) ? ` · ${moonName(w.clock ?? 0)}` : ""}`);
    }

    for (const person of w.people) {
      if (!knownPeople.has(person.id)) {
        knownPeople.add(person.id);
        panel.lifeLog(`✶ ${person.name} was born${person.mother ? ` to ${w.people.find((q) => q.id === person.mother)?.name ?? "their mother"}` : ""}.`);
      }
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
        const plain = person.say;
        spoken.set(person.id, plain);
        if (voice.ready && !fast) {
          // The free voice may reword it; if it cannot in time, the plain line stands.
          const listener = w.people.find((q) => q !== person && q.say && q.say !== plain && Math.hypot(q.x - person.x, q.z - person.z) < 6);
          const panelRef = panel;
          void voice.reword(person, listener, plain, w).then((t) => {
            const said = t?.text ?? plain;
            (person.spoken ??= []).push(said);
            if (person.spoken.length > 3) person.spoken.shift();
            panelRef.lifeLog(`${person.name}: "${said}"`);
            if (t?.intent && world) applySpokenIntent(world, person, listener, t.intent);
          });
        } else {
          (person.spoken ??= []).push(plain);
          if (person.spoken.length > 3) person.spoken.shift();
          panel.lifeLog(`${person.name}: "${plain}"`);
        }
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
    panel = buildEdenPanel(
      {
        speed: setSpeed,
        save,
        newWorld,
        creator: creatorCommand,
        voice: (config) => {
          voice.config = config;
          saveVoice(config);
          panel?.voiceStatus(config.enabled ? "Voice on." : "Voice off. Plain speech.");
        },
        voiceTest: () => {
          if (!world) return;
          const [a, b] = world.people;
          if (!a) return;
          panel?.voiceStatus("Asking…");
          void voice.reword(a, b, "I am glad you are here.", world, true).then((t) => panel?.voiceStatus(t ? `It says: "${t.text}"` : voice.ready ? "No answer (see above)." : "The voice is off."));
        },
      },
      voice.config,
    );
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
