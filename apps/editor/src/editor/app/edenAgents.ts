import * as THREE from "three";
import { findPoseBones } from "../poses";
import { creatureMotion, gazeOf, lookOf, newMemory, personMotion, walkStyle, type MotionMemory, type PoseName } from "../../eden/motion";
import { createTalk, type Talk } from "./edenTalk";
import { EdenSound } from "./edenSound";
import { EdenWildlife } from "./edenWildlife";
import { PLAN_SYSTEM, parsePlan, situationOf } from "../../eden/llmPlan";
import { adoptPlan } from "../../eden/reason";
import { createScreens, type Screens } from "./edenScreens";
import { hearWalker, nearbyPeople, noteFirstWord } from "../../eden/chat";
import { actionOf, applySpokenIntent, creatureHurt, giveMeat, giveToPerson, shareKill, walkerSlew, routeAround, tally, phrase, ADULT_AGE, AFFORDANCES, hourOf, isNight, make, makePerson, step, type Person, type Thing, type World } from "../../eden/mind";
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
  ["rest", ["idle"]],
  ["wander", ["walk"]],
  ["carry_walk", ["ual_walk_carry_loop", "walk"]],
  ["flee", ["run", "walk"]],
  ["observe", ["idle"]],
  ["talk_to_other", ["talk", "idle"]],
  ["play_together", ["clapping", "ual_yes", "idle"]],
  // The hunter bodies carry the shared clip library (combat, locomotion and the Universal Animation Library 2), so work looks like work.
  ["eat", ["ual_consume", "clapping", "idle"]],
  ["drink", ["ual_consume", "sit", "idle"]],
  ["harvest", ["ual_farm_harvest", "clapping", "idle"]],
  ["plant", ["ual_farm_plant_seed", "clapping", "idle"]],
  ["chop", ["ual_tree_chopping_loop", "clapping", "idle"]],
  ["wash", ["ual_farm_watering", "sit", "idle"]],
  ["craft", ["idle"]],
  ["lie_down", ["ual_lay_to_idle", "idle"]],
  ["get_up", ["ual_lay_to_idle", "idle"]],
  ["fish", ["idle"]],
  ["Wave", ["Wave", "ual_yes", "idle"]],
  ["HitRecieve", ["HitRecieve", "hit_chest", "idle"]],
  ["Death", ["Death", "death"]],
];
// The actions that go on until the person does something else, not once.
export const EDEN_LOOPING_ACTIONS = new Set(["eat", "drink", "harvest", "plant", "chop", "wash", "carry_walk"]);

// What each thing a person does at its place looks like with the whole body (poses.ts).
const forcedPose = new Set<number>(); // bodies a debug call has posed by hand

const TICK_MS = 250;
// Seconds of sim time a single step of the minds covers when the bodies are not keeping up (above 3x).
const FAST_STEP = 0.75;
const WORLD_RADIUS = 190;
// Where the river and lake surface sits (build_eden.ts RIVER_LEVEL).
const WATER_LEVEL = -0.4;
// The lake is too deep to walk into (its water reaches about 22 m from its centre; people keep to its bank).
const LAKE_NOGO = [{ x: EDEN_PLACES.lake!.x, z: EDEN_PLACES.lake!.z, r: 26 }];
const SAVE_KEY = "eden-world-v1";
const AUTOSAVE_MS = 20_000;
const DEFAULT_SPEED = 2; // index into SPEEDS: 3x

const PLACE_NAME: Record<string, string> = {};
for (const place of Object.values(EDEN_PLACES)) PLACE_NAME[place.kind] = place.name;
const KIND_NAME: Record<string, string> = { ...PLACE_NAME, campfire: "the fire", shelter: "the shelter", tree: "a tree", "fruit tree": "a fruit tree", bush: "a bush", rock: "a rock", grave: "a grave", deer: "a deer", fox: "a fox", alpaca: "an alpaca", wolf: "a wolf", dog: "a dog", stag: "a stag", cow: "a cow", donkey: "a donkey", horse: "a horse", barrel: "the barrel", table: "the table", lantern: "the lantern", chest: "the chest", shelf: "the shelf", shrine: "the shrine", artwork: "a painted stone", weir: "a weir", snare: "a snare", library: "the library", "tree of life": "the Tree of Life", "tree of knowledge": "the Tree of Knowledge" };

const VERB: Record<string, string> = { make: "sets about making something near", invent: "tries something new near", create: "sits down to make something near", ponder: "sits to think near", read: "goes to read at", gather: "goes to gather wood at", fire: "makes a fire", build: "starts building a shelter", stash: "goes to put food away at", forage: "goes to gather food at", warm: "goes to warm up at", share: "goes to share food with", comfort: "goes to sit with", plant: "goes to plant a seed", craft: "makes a spear", hunt: "hunts", tame: "tries to win over", fish: "goes fishing at", mourn: "goes to sit at", eat: "goes to eat at", drink: "goes to drink at", rest: "goes to rest at", sleep: "goes to sleep at", look: "goes to look at", play: "goes to play at", talk: "goes to talk with", wander: "wanders off", flee: "runs from", linger: "pauses", furnish: "makes something for the home near", improve: "raises the roof into a proper hut at", carve: "carves a keepsake for", gift: "gives a keepsake to", trade: "trades with", pray: "prays at", teach: "teaches", steal: "takes food from", fetch: "fetches something for the Walker from" };

function describe(person: Person, world: World): string {
  const i = person.intent;
  if (!i) return "";
  if (i.kind === "eat" && !i.targetId) return "eats what they are carrying";
  const target = ["talk", "share", "comfort", "gift", "trade", "teach", "steal", "carve"].includes(i.kind) ? world.people.find((p) => p.id === i.targetId)?.name : KIND_NAME[world.things.find((t) => t.id === i.targetId)?.kind ?? ""];
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
  const rescued = new Map<string, number>();
  const lastGesture = new Map<string, number>();
  const woundSeen = new Map<string, number>();
  const gesture = (id: string, clip: string) => {
    if (performance.now() - (lastGesture.get(id) ?? -1e9) < 15_000) return;
    lastGesture.set(id, performance.now());
    ui(`eden_gesture_${id}`, clip);
  };
  let walking = false; // the Creator is walking the world as a hunter
  let youBody = -1;
  const talkHistory = new Map<string, { role: string; content: string }[]>(); // the last turns of each conversation with the Walker
  const sound = new EdenSound(() => inEden && C.doc.mode === "play");
  let soundAt = 0;
  let snowCover = 0; // 0 bare .. 1 white: builds while it snows, melts when it is mild
  let plannerBusy = false;
  let plannerAt = 0;
  let wildlife: EdenWildlife | undefined; // birds and leaping fish: scenery, made the first time a world is played
  let screens: Screens | undefined; // map, journal and pack (M, L, I), made the first time you walk
  const notes: string[] = []; // what the Walker has done, kept with the save
  let talk: Talk | undefined; // the box for talking with people (E), made the first time you walk
  const paceOf = new Map<string, number>(); // how fast each person's walk clip plays (a limp is slower)
  const motionMem = new Map<string, MotionMemory>(); // what each person's body was last doing (motion.ts)
  const placedPrefab = new Map<string, string>(); // which body each placed thing has (a young one's, until it grows up)
  const clipSent = new Map<string, string>(); // the clip each creature was last told to play
  const holdPose = new Map<string, { pose: PoseName; until: number }>(); // a pose someone keeps for a moment (a wave, talking), over what they are doing
  const pack = { meat: 0, water: 0, wood: 0, fruit: 0 }; // what you carry to give away: Q gathers it where it is, H hands it to whoever needs it
  const packText = () => Object.entries(pack).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(", ");
  const bodyObjectOf = (p: Person) => {
    const index = ORIGINAL.has(p.id) ? bodyIndex(p.name) : (bodyIndexById.get(p.id) ?? -1);
    return index >= 0 ? C.objects[index] : undefined;
  };
  C.actionLoops = EDEN_LOOPING_ACTIONS;
  C.edenBody = (index, who) => bodyIndexById.set(who, index);
  // The hunter killed a creature: the people's world loses it too, and the hunter eats a little.
  C.edenHurt = (thingId) => {
    if (world) creatureHurt(world, thingId);
  };
  C.edenSlain = (thingId) => {
    if (!world) return;
    const at = world.things.findIndex((t) => t.id === thingId);
    if (at < 0) return;
    const thing = world.things[at]!;
    world.things.splice(at, 1);
    placedThings.delete(thingId);
    tally(world, "slainByYou");
    walkerSlew(world, thing);
    shareKill(world, thing);
    panel?.lifeLog(`You killed ${phrase(thing)}.${AFFORDANCES[thing.kind]?.prey ? " Meat: you feel stronger." : ""}`);
    if (AFFORDANCES[thing.kind]?.prey) {
      ui("eden_player_heal", "35");
      pack.meat++;
      panel?.lifeLog(`You keep the meat (${pack.meat}). Press H beside someone to hand it over.`);
    }
  };
  // Typed words to someone beside you: they answer from who they are (eden/chat.ts), and the free voice may put it in their own words.
  function sayToPerson(id: string, text: string) {
    const w = world;
    const person = w?.people.find((q) => q.id === id);
    if (!w || !person || !panel) return;
    noteFirstWord(w, person);
    const answer = hearWalker(w, person, text, Math.random);
    holdPose.set(id, { pose: /^(hi|hello|hey|greetings|good )/i.test(text.trim()) ? "wave" : "talk", until: performance.now() + 7000 });
    panel.lifeLog(`You to ${person.name}: "${text}"`);
    const show = (said: string) => {
      talk?.reply(person.name, said);
      panel?.lifeLog(`${person.name}: "${said}"`);
    };
    if (answer.gaveFood) {
      ui("eden_player_heal", "20");
      panel.lifeLog(`${person.name} gave you some food.`);
    }
    const history = (talkHistory.get(id) ?? []) as { role: "user" | "assistant"; content: string }[];
    talkHistory.set(id, history);
    const remember = (said: string) => {
      history.push({ role: "user", content: text }, { role: "assistant", content: said });
      if (history.length > 12) history.splice(0, history.length - 12);
    };
    if (voice.ready) {
      talk?.thinking(person.name);
      // Words the rules did not understand go to the voice as a real conversation; what they did understand it only puts in their own words.
      const reply = answer.fallback ? voice.chat(person, history, text, w).then((r) => r ?? answer.reply) : voice.reword(person, undefined, answer.reply, w, true).then((t) => t?.text ?? answer.reply);
      void reply.then((said) => {
        remember(said);
        show(said);
      });
    } else {
      remember(answer.reply);
      show(answer.reply);
    }
  }
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
  // Different people look different: the model and clothes are picked by who they are, and size follows age.
  const MEN = 5;
  const WOMEN = 4;
  const bodyPrefab = (p: Person) => {
    const h = [...p.id].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 7);
    const n = 1 + (h % (p.sex === "m" ? MEN : WOMEN)); // the same face and clothes from birth to old age
    if (p.age < 4) return `Child (${p.sex === "m" ? "boy" : "girl"}) ${n}`;
    if (p.age >= 55) return `Elder (${p.sex === "m" ? "man" : "woman"}) ${n}`;
    return `${p.age < 14 ? "Youth" : "Villager"} (${p.sex === "m" ? (p.age < 14 ? "boy" : "man") : p.age < 14 ? "girl" : "woman"}) ${n}`;
  };

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
    const created: World = { things, people, radius: WORLD_RADIUS, noGo: LAKE_NOGO };
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
      const stock = AFFORDANCES[kind]?.stock;
      for (let i = 0; i < count; i++) make(created, kind, place.x + i * 2 - count, place.z + (i % 2) * 3, { radius: 2, ...(stock !== undefined ? { stock, maxStock: stock } : {}) });
    };
    herd("deer", "meadow", 3);
    herd("deer", "south_meadow", 4);
    herd("deer", "east_woods", 3);
    herd("deer", "highlands", 3);
    herd("horse", "south_meadow", 3);
    herd("alpaca", "meadow", 2);
    herd("wolf", "highlands", 2);
    herd("dog", "east_woods", 2);
    herd("stag", "highlands", 2);
    herd("stag", "east_woods", 2);
    herd("cow", "south_meadow", 3);
    herd("donkey", "orchard", 2);
    herd("dog", "orchard", 1);
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
    world.strangers = true;
    if (world.walker) {
      Object.assign(pack, world.walker.pack);
      notes.splice(0, notes.length, ...(world.walker.notes ?? []));
    }
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
      world.walker = { pack: { ...pack }, notes: notes.slice(-200) };
      localStorage.setItem(SAVE_KEY, worldToJson(world));
      lastSave = performance.now();
      panel?.setSaved("saved");
    } catch (e) {
      panel?.setSaved("could not save");
      panel?.lifeLog(`Could not save the world: ${String(e)}`);
    }
  }

  // What if: three places to keep the world as it is, and come back to.
  const SLOT_KEY = "eden-world-v1-slot-";
  function slotDays(): (number | undefined)[] {
    return [1, 2, 3].map((n) => {
      try {
        const text = localStorage.getItem(SLOT_KEY + n);
        return text ? Math.floor(((JSON.parse(text) as { clock?: number }).clock ?? 0) / 1440) + 1 : undefined;
      } catch {
        return undefined;
      }
    });
  }
  function keepSlot(n: number) {
    if (!world) return;
    try {
      world.walker = { pack: { ...pack }, notes: notes.slice(-200) };
      localStorage.setItem(SLOT_KEY + n, worldToJson(world));
      panel?.lifeLog(`Kept this moment as ${n} (day ${Math.floor((world.clock ?? 0) / 1440) + 1}).`);
      panel?.setSlots(slotDays());
    } catch (e) {
      panel?.lifeLog(`Could not keep it: ${String(e)}`);
    }
  }
  function returnSlot(n: number) {
    let loaded: World;
    try {
      const text = localStorage.getItem(SLOT_KEY + n);
      if (!text) {
        panel?.lifeLog(`Nothing is kept as ${n}.`);
        return;
      }
      loaded = worldFromJson(text);
    } catch (e) {
      panel?.lifeLog(`Could not go back to ${n}: ${String(e)}`);
      return;
    }
    for (const id of [...placedThings]) ui("eden_remove", id);
    placedThings.clear();
    for (const id of [...placedPeople.keys()]) ui("eden_remove", id);
    placedPeople.clear();
    bodyIndexById.clear();
    announcedDead.clear();
    lastMoved.clear();
    sent.clear();
    world = loaded;
    world.strangers = true;
    if (world.walker) {
      Object.assign(pack, world.walker.pack);
      notes.splice(0, notes.length, ...(world.walker.notes ?? []));
    }
    knownPeople.clear();
    for (const p of world.people) knownPeople.add(p.id);
    for (const d of world.dead ?? []) announcedDead.add(d.person.id);
    for (const p of world.people) snap(p);
    lastRain = -1;
    lastHour = -1;
    panel?.lifeLog(`Back to the moment kept as ${n} (day ${Math.floor((world.clock ?? 0) / 1440) + 1}).`);
    save();
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
    world.strangers = true;
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
      // A young one that has grown up is swapped for an adult's body.
      if (thing.prefab && placedThings.has(thing.id) && placedPrefab.get(thing.id) && placedPrefab.get(thing.id) !== thing.prefab) {
        ui("eden_remove", thing.id);
        placedThings.delete(thing.id);
        lastMoved.delete(thing.id);
        clipSent.delete(thing.id);
      }
      if (thing.prefab && !placedThings.has(thing.id)) {
        placedThings.add(thing.id);
        placedPrefab.set(thing.id, thing.prefab);
        ui("eden_place", `${thing.id},${thing.prefab},${thing.x},${groundY(thing.x, thing.z)},${thing.z},${thing.id}`);
        // A body whose script had not started yet misses its first "who are you"; tell it again.
        for (const wait of [1500, 5000]) setTimeout(() => ui("eden_tell", thing.id), wait);
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
      // Its clip and pace, from what it is doing and how fast (motion.ts): grazing, watching, a walk matched to its feet, a run.
      const cm = SPEEDS[speed]! <= 3 ? creatureMotion(thing, w.clock ?? 0) : undefined;
      if (cm) {
        const key = `${cm.clip}@${cm.scale.toFixed(1)}`;
        if (clipSent.get(thing.id) !== key) {
          clipSent.set(thing.id, key);
          ui("eden_clip", `${thing.id}|${key}`);
        }
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
    // The sky follows the weather: how hard it rains (or the flurries of snow), the mist, and the wind that moves the trees.
    const wx = w.weather;
    const rain = wx?.raining ? (wx.snowing ? 0.2 : wx.rainAmount) : 0;
    const fog = wx?.fog ?? 0;
    const wind = wx?.windMs ?? 0;
    const key = Math.round(rain * 10) * 10000 + Math.round(fog * 10) * 100 + Math.round(wind);
    if (key !== lastRain) {
      lastRain = key;
      ui("eden_weather", `${(rain * 0.9).toFixed(2)},${(0.1 + fog * 0.6).toFixed(2)},${(Math.cos(wx?.windDir ?? 0) * wind).toFixed(1)},${(Math.sin(wx?.windDir ?? 0) * wind).toFixed(1)}`);
    }
  }

  function tick() {
    if (!world || !panel) return;
    const w = world;
    // The hunter: once its body has said which it is, the camera follows it; prey run from them, and a wolf or fox that gets close bites.
    if (walking && youBody < 0) {
      const index = bodyIndexById.get("you");
      if (index !== undefined) {
        youBody = index;
        C.playerIndex = index;
      }
    }
    // What the people have said and done for you since the last look: requests, errands brought, errands that failed.
    for (const ev of w.walkerEvents?.splice(0) ?? []) {
      const who = w.people.find((q) => q.id === ev.who);
      if (!who) continue;
      holdPose.set(who.id, { pose: "talk", until: performance.now() + 4000 });
      if (ev.kind === "asked") panel.lifeLog(`${who.name}: "${ev.text}" (find ${ev.item === "food" ? "meat or fruit" : ev.item} with Q or a kill, then H beside them)`);
      else if (ev.kind === "delivered") {
        panel.lifeLog(`${who.name} brought you ${ev.item}. "${ev.text}"`);
        if (ev.item === "wood") pack.wood += 1;
        else ui("eden_player_heal", ev.item === "water" ? "8" : "15");
        talk?.reply(who.name, ev.text);
      } else {
        panel.lifeLog(`${who.name}: "${ev.text}"`);
        talk?.reply(who.name, ev.text);
      }
    }
    // Sound, about once a second: the engine's own wind, rain and birds by the weather and the hour, and ours (crickets, water, fire, voices).
    if (performance.now() - soundAt > 1000) {
      soundAt = performance.now();
      const you = walking && youBody >= 0 ? C.objects[youBody] : undefined;
      const at = you ? { x: you.position.x, z: you.position.z } : { x: w.people[0]?.x ?? 0, z: w.people[0]?.z ?? 0 };
      const nearest = (test: (t: Thing) => boolean) => w.things.reduce((best, t) => (test(t) ? Math.min(best, Math.hypot(t.x - at.x, t.z - at.z) - t.radius) : best), Infinity);
      const dark = isNight(w.clock ?? 0);
      const season = w.weather?.season ?? 1;
      const raining = !!w.weather?.raining;
      sound.update({ dark, season, raining, listener: at, waterDistance: nearest((t) => !!AFFORDANCES[t.kind]?.water), fireDistance: nearest((t) => t.kind === "campfire" && (t.fuel ?? 0) > 0), wolfNear: w.things.some((t) => t.kind === "wolf" && Math.hypot(t.x - at.x, t.z - at.z) < 70) });
      let water: { x: number; z: number; y: number } | undefined;
      let waterGap = 45;
      for (const t of w.things) {
        if (!AFFORDANCES[t.kind]?.water) continue;
        const gap = Math.hypot(t.x - at.x, t.z - at.z) - t.radius;
        if (gap < waterGap) (waterGap = gap), (water = { x: t.x, z: t.z, y: WATER_LEVEL });
      }
      // Snow settles on the ground while it falls and goes when the air warms: the terrain is lightened toward white (more by day, so it does not glow at night).
      const wxNow = w.weather;
      snowCover = Math.max(0, Math.min(1, snowCover + (wxNow?.snowing ? 0.02 : (wxNow?.tempC ?? 10) > 2 ? -0.004 * Math.min(6, (wxNow?.tempC ?? 10) - 1) : 0)));
      const snowGlow = snowCover * (dark ? 0.12 : 0.34);
      for (const { mesh } of C.terrainMeshes.values()) {
        const material = mesh.material;
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        material.emissive.setRGB(0.88, 0.94, 1);
        material.emissiveIntensity = snowGlow;
      }
      // The optional planner: one person at a time with something to work out is asked, and their answer is checked before it is believed.
      if (voice.ready && voice.config.plan && !plannerBusy && performance.now() - plannerAt > 45000 && SPEEDS[speed]! <= 3) {
        const home = w.things.find((t) => t.kind === "shelter") ?? { x: 0, z: 0 };
        const trouble = (q: Person) => w.things.some((t) => AFFORDANCES[t.kind]?.predator && q.memory.has(t.id) && Math.hypot(t.x - home.x, t.z - home.z) < 80);
        const candidates = w.people.filter((q) => q.age >= ADULT_AGE && !q.plan && !q.team && q.intent?.kind !== "sleep" && q.needs.hunger < 0.6 && q.needs.thirst < 0.6 && (trouble(q) || q.personality.curiosity > 0.6));
        const who = candidates.find(trouble) ?? candidates[Math.floor(Math.random() * candidates.length)];
        if (who) {
          plannerBusy = true;
          plannerAt = performance.now();
          panel?.voiceStatus(`Asking for a plan for ${who.name}…`);
          void voice.plan(PLAN_SYSTEM, `You are ${who.name}.\n${situationOf(w, who)}\nWhat will you do next?`).then((text) => {
            plannerBusy = false;
            if (!text || !world) return panel?.voiceStatus(`No plan came back for ${who.name}.`);
            const result = parsePlan(world, who, text);
            if (!result.plan) {
              tally(world, "plansRejected");
              return panel?.voiceStatus(`${who.name}'s proposed plan was thrown out: ${result.error}.`);
            }
            if (who.plan || who.team) return;
            adoptPlan(world, who, result.plan);
            panel?.voiceStatus(`${who.name} has a plan: ${result.plan.goal}.`);
            panel?.lifeLog(`${who.name} thinks it through: ${result.plan.goal}.`);
          });
        }
      }
      wildlife ??= new EdenWildlife(C.scene);
      wildlife.update({ x: at.x, z: at.z, ground: groundY(at.x, at.z), hour: solarHour(w.clock ?? 0), rain: w.weather?.rainAmount ?? 0, season: w.weather?.season ?? 1, water });
      const folk = w.people.filter((q) => Math.hypot(q.x - at.x, q.z - at.z) < 25).length;
      ui("eden_ambient", `${at.x.toFixed(1)},${at.z.toFixed(1)},${groundY(at.x, at.z).toFixed(2)},${solarHour(w.clock ?? 0).toFixed(2)},${(w.weather?.tempC ?? 15).toFixed(1)},${(w.weather?.rainAmount ?? 0).toFixed(2)},${w.weather?.snowing ? 1 : 0}`);
      ui("eden_sounds", `${dark || raining ? 0 : [0.55, 0.4, 0.22, 0.08][season]},${Math.min(0.5, folk / 7)}`);
    }
    if (!walking) talk?.hint(undefined);
    if (walking && youBody >= 0) {
      const you = C.objects[youBody];
      if (you) {
        w.visitor = { x: you.position.x, z: you.position.z };
        const near = nearbyPeople(w, you.position.x, you.position.z);
        const asking = near.filter((q) => q.asks);
        const hintParts = [near.length === 0 ? "" : near.length === 1 ? `talk to ${near[0]!.name}` : `talk (${near.length} people near)`];
        if (asking.length) hintParts.push(`${asking.map((q) => `${q.name} asks for ${q.asks!.item}`).join(", ")} · H gives`);
        else if (near.length && packText()) hintParts.push("H gives");
        hintParts.push(`Q gathers${packText() ? ` · you carry ${packText()}` : ""}`);
        talk?.hint(hintParts.filter(Boolean).join(" · "));
        for (const t of w.things) {
          const danger = AFFORDANCES[t.kind]?.danger ?? (t.mob?.state === "attack" ? 0.5 : undefined);
          if (danger && Math.hypot(t.x - you.position.x, t.z - you.position.z) < 2.6) ui("eden_player_hurt", String(Math.round(9 * danger)));
        }
      }
    }
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
      panel.setHeader(`Eden · ${SEASON_NAMES[weather.season]} · ${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.floor((hour % 1) * 60)).padStart(2, "0")} · ${Math.round(weather.tempC)}°C${weather.raining ? (weather.snowing ? " · snow" : weather.rainAmount > 0.7 ? " · heavy rain" : weather.rainAmount < 0.4 ? " · drizzle" : " · rain") : weather.fog > 0.45 ? " · mist" : ""}${weather.windMs > 7 ? " · windy" : ""}${isNight(w.clock ?? 0) ? ` · ${moonName(w.clock ?? 0)}` : ""}`);
    }

    for (const person of w.people) {
      // A body that has gone through the ground (or fallen from a cliff edge) is put back on it, and the Creator is told once.
      const body = bodyObjectOf(person);
      if (body && body.position.y < groundY(body.position.x, body.position.z) - 1.5 && performance.now() - (rescued.get(person.id) ?? -1e9) > 1500) {
        if (!rescued.has(person.id)) panel.lifeLog(`${person.name} had fallen through the ground and was lifted back.`);
        rescued.set(person.id, performance.now());
        snap(person);
      }
      // Small gestures that show how they are: a wave as two start to talk, a flinch when they are hurt.
      if (!fast && simSeconds > 0) {
        if (person.intent?.kind === "talk" && person.intent.arrived && described.get(person.id) !== "talking") gesture(person.id, "Wave");
        const wound = person.wound ?? 0;
        if (wound > (woundSeen.get(person.id) ?? 0) + 0.1) gesture(person.id, "HitRecieve");
        woundSeen.set(person.id, wound);
      }
      if (!knownPeople.has(person.id)) {
        knownPeople.add(person.id);
        panel.lifeLog(`✶ ${person.name} was born${person.mother ? ` to ${w.people.find((q) => q.id === person.mother)?.name ?? "their mother"}` : ""}.`);
      }
      const intent = person.intent;
      {
        const at = ORIGINAL.has(person.id) ? bodyIndex(person.name) : (bodyIndexById.get(person.id) ?? -1);
        const held = holdPose.get(person.id);
        if (held && held.until < performance.now()) holdPose.delete(person.id);
        const mem = motionMem.get(person.id) ?? newMemory();
        motionMem.set(person.id, mem);
        const mo = personMotion(person, w, mem, held && held.until >= performance.now() ? held.pose : undefined);
        const walkingNow = !!intent && !intent.arrived;
        const style = walkStyle(person, w);
        const pose = fast ? undefined : walkingNow ? style.pose : mo.pose;
        const gaze = fast ? undefined : gazeOf(person, w);
        const faceTo = (x: number, z: number) => {
          const me = at >= 0 ? C.objects[at] : undefined;
          if (!me) return;
          const want = Math.atan2(x - me.position.x, z - me.position.z);
          me.rotation.y += Math.max(-0.35, Math.min(0.35, Math.atan2(Math.sin(want - me.rotation.y), Math.cos(want - me.rotation.y))));
        };
        // Someone being talked to turns to face you; two people talking turn to face each other.
        if (at >= 0 && held && walking && youBody >= 0 && C.objects[youBody]) faceTo(C.objects[youBody]!.position.x, C.objects[youBody]!.position.z);
        else if (at >= 0 && gaze && !walkingNow && (gaze.why === "the person they are talking with" || gaze.why === "the Walker")) {
          const other = w.people.find((q) => q.x === gaze.x && q.z === gaze.z);
          const ob = other ? (ORIGINAL.has(other.id) ? bodyIndex(other.name) : (bodyIndexById.get(other.id) ?? -1)) : -1;
          if (ob >= 0 && C.objects[ob]) faceTo(C.objects[ob]!.position.x, C.objects[ob]!.position.z);
          else faceTo(gaze.x, gaze.z);
        }
        if (at >= 0 && !forcedPose.has(at)) {
          C.edenPoses ??= new Map();
          if (pose) C.edenPoses.set(at, pose);
          else C.edenPoses.delete(at);
        }
        if (at >= 0) {
          C.edenBodies ??= new Map();
          const gazeAt = gaze ? { x: gaze.x, z: gaze.z } : undefined;
          // A person's own spot is where the mind has them; the body is nearly there, which is near enough to look at.
          C.edenBodies.set(at, { look: lookOf(person, w), gaze: gazeAt });
        }
        paceOf.set(person.id, style.pace);
      }
      if (intent && !fast && simSeconds > 0) {
        const action = actionOf(person);
        const loaded = person.carry.wood + person.carry.food >= 1 || person.carrying ? 1 : 0;
        const pace = paceOf.get(person.id) ?? 1;
        const key = `${intent.kind}|${intent.targetId ?? ""}|${intent.arrived}|${Math.round(intent.x)}|${Math.round(intent.z)}|${loaded}|${pace}`;
        if (sent.get(person.id) !== key) {
          sent.set(person.id, key);
          // Where the body should walk, and how fast; it stays at the spot, and plays the action, once there.
          const via = routeAround(w, person.x, person.z, intent.x, intent.z);
          ui(`eden_target_${person.id}`, `${intent.x},0,${intent.z},${action},${intent.speed},${via ? via.x.toFixed(1) : "-"},${via ? via.z.toFixed(1) : "-"},${loaded},${pace}`);
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
        sound.speak(walking && youBody >= 0 && C.objects[youBody] ? { x: C.objects[youBody]!.position.x, z: C.objects[youBody]!.position.z } : { x: w.people[0]?.x ?? 0, z: w.people[0]?.z ?? 0 }, person, person.sex, person.age, plain);
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
    if ((panel.tab() === "minds" || panel.tab() === "chronicle") && now - lastMinds > 700) {
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
        slot: (action, n) => (action === "keep" ? keepSlot(n) : returnSlot(n)),
        walk: (on) => {
          if (!world) return;
          walking = on;
          if (!on) (world.visitor = undefined), talk?.close();
          if (on) talk ??= createTalk({ say: sayToPerson, close: () => undefined });
          if (on && !screens) {
            screens = createScreens();
            screens.tutorial();
          }
          if (!on) screens?.close();
          for (const e of C.doc.scene.eachAlive()) {
            const f = C.doc.scene.resolve(e, "CameraFollow");
            if (f) f.target = on ? "" : "Adam";
          }
          if (on) {
            // The hunter is brought into the world beside whoever is first among the people; once it says which body it is, the camera follows it.
            const beside = world.people[0];
            const x = (beside?.x ?? 0) + 3;
            const z = (beside?.z ?? 2) + 2;
            ui("eden_place", `you,Hunter,${x},${groundY(x, z) + 1},${z},you`);
            for (const wait of [1200, 3000, 7000]) setTimeout(() => walking && !bodyIndexById.has("you") && ui("eden_tell", "you"), wait);
            panel?.lifeLog("You walk the world as a hunter. W A S D move, J strikes, K sweeps, F kicks, X rolls, G looses an arrow. E talks to someone beside you (try \"bring me water\"), Q gathers water, wood or fruit, H hands them what they need.");
          } else {
            ui("eden_remove", "you");
            bodyIndexById.delete("you");
            youBody = -1;
            C.playerIndex = -1;
            panel?.lifeLog("You watch from above again.");
          }
        },
        follow: (id) => {
          // The camera follows whoever is named: Adam and Eve by their own names, anyone else as the scene's "player" body.
          const person = world?.people.find((q) => q.id === id);
          if (!person) return;
          const index = ORIGINAL.has(id) ? bodyIndex(person.name) : (bodyIndexById.get(id) ?? -1);
          if (index < 0) return;
          for (const e of C.doc.scene.eachAlive()) {
            const f = C.doc.scene.resolve(e, "CameraFollow");
            if (f) f.target = "";
          }
          C.playerIndex = index;
          panel?.lifeLog(`Watching ${person.name}.`);
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
    const logLife = panel.lifeLog.bind(panel);
    panel.lifeLog = (text) => {
      if (walking) notes.push(text);
      if (notes.length > 200) notes.splice(0, notes.length - 200);
      logLife(text);
    };
    panel.setSpeed(speed);
    panel.setSlots(slotDays());
    window.addEventListener("keydown", (e) => {
      if (e.code !== "KeyE" || e.repeat || !walking || !world || youBody < 0 || !talk || talk.isOpen()) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const you = C.objects[youBody];
      if (!you) return;
      const near = nearbyPeople(world, you.position.x, you.position.z);
      if (!near.length) return panel?.lifeLog("No one is near enough to talk to.");
      C.releasePointer?.();
      talk.open(near.map((q) => ({ id: q.id, name: q.name, note: `${moodWord(q.mood)}${needWord(q) ? `, ${needWord(q)}` : ""}` })));
    }, true);
    // A pad: A talks, X gathers, Y hands over, Back opens the map. (Walking itself is the engine's own pad support.)
    const padHeld = new Set<number>();
    const padKeys: Record<number, string> = { 0: "KeyE", 2: "KeyQ", 3: "KeyH", 8: "KeyM", 9: "KeyL" };
    setInterval(() => {
      if (!walking || typeof navigator.getGamepads !== "function") return;
      for (const pad of navigator.getGamepads()) {
        if (!pad) continue;
        for (const [i, code] of Object.entries(padKeys)) {
          const down = pad.buttons[Number(i)]?.pressed ?? false;
          if (down && !padHeld.has(Number(i))) window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));
          if (down) padHeld.add(Number(i));
          else padHeld.delete(Number(i));
        }
      }
    }, 80);
    const screenKeys: Record<string, "map" | "journal" | "pack"> = { KeyM: "map", KeyL: "journal", KeyI: "pack" };
    window.addEventListener("keydown", (e) => {
      if (e.repeat || !walking || !screens || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Escape" && screens.isOpen()) return screens.close();
      const tab = screenKeys[e.code];
      if (tab) screens.toggle(tab);
    }, true);
    window.addEventListener("keydown", (e) => {
      if (e.code !== "KeyN" || e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      panel?.lifeLog(sound.toggle() ? "Sound on." : "Sound off. (N turns it back on)");
    }, true);
    // Q gathers what is here: water from the river or lake, wood where it lies, fruit from the grove.
    window.addEventListener("keydown", (e) => {
      if (e.code !== "KeyQ" || e.repeat || !walking || !world || youBody < 0) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const you = C.objects[youBody];
      if (!you) return;
      let best: { t: Thing; d: number } | undefined;
      for (const t of world.things) {
        const a = AFFORDANCES[t.kind];
        if (!a || !(a.water || a.wood || ((a.food ?? 0) > 0 && !a.fish && (t.stock === undefined || t.stock > 0)))) continue;
        const d = Math.hypot(t.x - you.position.x, t.z - you.position.z) - t.radius;
        if (d < 4.5 && (!best || d < best.d)) best = { t, d };
      }
      if (!best) return panel?.lifeLog("Nothing here to gather. Water, wood and fruit are gathered at the river or lake, where wood lies, and at the grove.");
      const a = AFFORDANCES[best.t.kind]!;
      if (a.water) {
        pack.water = 3;
        panel?.lifeLog("You fill your waterskin.");
      } else if (a.wood) {
        pack.wood += 2;
        panel?.lifeLog(`You gather wood (${pack.wood}).`);
      } else {
        if (best.t.stock !== undefined) best.t.stock -= 1;
        pack.fruit += 1;
        panel?.lifeLog(`You pick fruit (${pack.fruit}).`);
      }
    }, true);
    // H hands over what the nearest person needs most (or what they asked you for).
    window.addEventListener("keydown", (e) => {
      if (e.code !== "KeyH" || e.repeat || !walking || !world || youBody < 0) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const you = C.objects[youBody];
      if (!you) return;
      let near: Person | undefined;
      let best = 4;
      for (const q of world.people) {
        const d = Math.hypot(q.x - you.position.x, q.z - you.position.z);
        if (d < best) ((best = d), (near = q));
      }
      if (!near) return panel?.lifeLog("No one is near enough.");
      // What they asked for first, then what they need most.
      const wants: ("water" | "meat" | "fruit" | "wood")[] = [];
      if (near.asks && near.asks.item !== "protect") wants.push(near.asks.item === "food" ? "meat" : near.asks.item, ...(near.asks.item === "food" ? (["fruit"] as const) : []));
      if (near.needs.thirst > 0.5) wants.push("water");
      if (near.needs.hunger > 0.4) wants.push("meat", "fruit");
      if (near.cold > 0.5 && near.carry.wood < 1) wants.push("wood");
      for (const item of wants) {
        if (pack[item] <= 0) continue;
        const ok = item === "meat" ? giveMeat(world, near) : giveToPerson(world, near, item === "fruit" ? "food" : item);
        if (!ok) continue;
        pack[item]--;
        panel?.lifeLog(`You gave ${item} to ${near.name}.`);
        return;
      }
      panel?.lifeLog(wants.length ? `You have nothing ${near.name} needs (you carry ${packText() || "nothing"}).` : `${near.name} needs nothing you can give.`);
    }, true);
    window.addEventListener("pagehide", save);
    // For the desktop app's tools and for tests: where each mind says a person is, where their body is, and where the ground is under it.
    if (navigator.userAgent.includes("BTAIDesktop")) {
      (window as unknown as { edenYou: unknown }).edenYou = () => {
        const index = bodyIndexById.get("you") ?? -1;
        const o = index >= 0 ? C.objects[index] : undefined;
        return o ? { at: [o.position.x, o.position.y, o.position.z], playerIndex: C.playerIndex, index } : undefined;
      };
      (window as unknown as { edenThings: unknown }).edenThings = () => (world?.things ?? []).filter((t) => t.prefab).map((t) => ({ id: t.id, kind: t.kind, x: t.x, z: t.z }));
      (window as unknown as { edenYouAt: unknown }).edenYouAt = (x: number, z: number) => ui("eden_player_on", `${x},${groundY(x, z)},${z}`);
      (window as unknown as { edenBoxes: unknown }).edenBoxes = () =>
        C.doc.scene.eachAlive().flatMap((e, i) => {
          const o = C.objects[i];
          if (!o || !o.visible) return [];
          let box = false;
          o.traverse((n) => {
            const g = (n as unknown as { geometry?: { type?: string } }).geometry;
            if (g?.type === "BoxGeometry") box = true;
          });
          const sc = o.scale;
          return box ? [{ name: C.doc.scene.resolve(e, "Name")?.value, at: [o.position.x, o.position.y, o.position.z].map((v) => Math.round(v * 10) / 10), size: [sc.x, sc.y, sc.z].map((v) => Math.round(v * 10) / 10) }] : [];
        });
      (window as unknown as { edenGesture: unknown }).edenGesture = (id: string, clip: string) => ui(`eden_gesture_${id}`, clip);
      (window as unknown as { edenPut: unknown }).edenPut = (id: string, x: number, z: number) => {
        const person = world?.people.find((q) => q.id === id);
        if (!person) return false;
        person.x = x;
        person.z = z;
        person.intent = undefined;
        snap(person);
        return true;
      };
      (window as unknown as { edenPose: unknown }).edenPose = (name: string, pose: PoseName | "", yaw?: number) => {
        const at = bodyIndex(name);
        if (at < 0) return false;
        C.edenPoses ??= new Map();
        C.edenPoseHeld ??= new Set();
        if (yaw !== undefined && C.objects[at]) C.objects[at]!.rotation.y = yaw;
        if (pose) (forcedPose.add(at), C.edenPoseHeld.add(at), C.edenPoses.set(at, pose));
        else (forcedPose.delete(at), C.edenPoseHeld.delete(at), C.edenPoses.delete(at));
        return true;
      };
      (window as unknown as { edenCreatures: unknown }).edenCreatures = () =>
        (world?.things ?? []).filter((t) => t.mob).map((t) => {
          const i = bodyIndexById.get(t.id) ?? -1;
          const a = i >= 0 ? C.animStates[i] : undefined;
          return { id: t.id, kind: t.kind, state: t.mob?.state, speed: +(t.mob?.speed ?? 0).toFixed(2), told: clipSent.get(t.id), playing: a?.current, scale: a?.current ? +(a.actions.get(a.current)?.timeScale ?? 1).toFixed(2) : undefined };
        });
      (window as unknown as { edenSpawn: unknown }).edenSpawn = (prefab: string, x: number, z: number) => {
        const id = `dbg-${prefab}`;
        ui("eden_place", `${id},${prefab},${x},${groundY(x, z) + 1},${z},${id}`);
        for (const wait of [1500, 5000]) setTimeout(() => ui("eden_tell", id), wait);
        return id;
      };
      (window as unknown as { edenMake: unknown }).edenMake = (kind: string, x: number, z: number, extra?: Record<string, unknown>) => (world ? make(world, kind, x, z, { radius: 1, ...extra }).id : undefined);
      (window as unknown as { edenMind: unknown }).edenMind = (id: string, patch: Record<string, unknown>) => {
        const person = world?.people.find((q) => q.id === id);
        if (!person) return false;
        Object.assign(person, patch);
        return true;
      };
      (window as unknown as { edenBones: unknown }).edenBones = (name: string) => {
        const o = C.objects[bodyIndex(name)];
        if (!o) return undefined;
        const out: Record<string, string> = {};
        const bones = findPoseBones(o);
        for (const [k, b] of Object.entries(bones)) if (b && typeof b === "object") out[k] = `${b.name}: ${o.worldToLocal(b.getWorldPosition(new THREE.Vector3())).toArray().map((n) => n.toFixed(2)).join(",")} parent=${b.parent?.name}`;
        return out;
      };
      (window as unknown as { edenDebug: unknown }).edenDebug = () =>
        (world?.people ?? []).map((p) => {
          const index = ORIGINAL.has(p.id) ? bodyIndex(p.name) : (bodyIndexById.get(p.id) ?? -1);
          const o = index >= 0 ? C.objects[index] : undefined;
          return { name: p.name, mind: [p.x, p.z], body: o ? [o.position.x, o.position.y, o.position.z] : undefined, ground: o ? groundY(o.position.x, o.position.z) : groundY(p.x, p.z), clip: index >= 0 ? C.animStates[index]?.current : undefined, yaw: o ? o.rotation.y : undefined };
        });
    }
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
      wildlife?.dispose();
      wildlife = undefined;
      if (snowCover > 0) {
        snowCover = 0;
        for (const { mesh } of C.terrainMeshes.values()) if (mesh.material instanceof THREE.MeshStandardMaterial) mesh.material.emissiveIntensity = 0;
      }
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
    if (inEden && walking && world && screens?.isOpen()) {
      const you = youBody >= 0 ? C.objects[youBody] : undefined;
      screens.refresh({ world, you: you ? { x: you.position.x, z: you.position.z } : undefined, pack, notes });
    }
  }, TICK_MS);
}
