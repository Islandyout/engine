import { fuzzyRank } from "../fuzzy";
import { actionOf, AFFORDANCES, makePerson, step, type Person, type Thing, type World } from "../../eden/mind";
import { CREATABLE, DRINK_SPOT, PLACES, PLACE_KINDS } from "../../eden/world";
import type { Ctx } from "./context";

// Eden: runs the minds of Adam and Eve (src/eden/mind.ts) on this machine, with no network and no AI model, and drives their Lua scripts
// (tools/eden/lua/{adam,eve}.lua) from what they decide. The Lua VM can only receive an event name and a string payload, through
// editor_ui_event, so each new decision goes to the person's script as "x,y,z,action,speed"; the body walks there on its own paths and
// physics, and this module reads where the body actually is before every step so the mind never drifts from it.
//
// A small panel (Eden scenes only) shows what each person is doing and lets the Creator say "let there be..." and bring something
// new into the garden.

const PEOPLE = [
  { id: "adam", name: "Adam", personality: { boldness: 0.55, sociability: 0.45, curiosity: 0.7, appetite: 0.6, patience: 0.5 } },
  { id: "eve", name: "Eve", personality: { boldness: 0.4, sociability: 0.75, curiosity: 0.6, appetite: 0.45, patience: 0.65 } },
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

// Sim seconds per real second. A person's day of needs is minutes long already; this makes a watcher see a whole life quickly.
const TIME_SCALE = 3;
const TICK_MS = 250;

const PLACE_NAME: Record<string, string> = {};
for (const [key, place] of Object.entries(PLACES)) PLACE_NAME[PLACE_KINDS[key as keyof typeof PLACES]] = place.name;
const KIND_NAME: Record<string, string> = { ...PLACE_NAME, tree: "a tree", bush: "a bush", rock: "a rock", deer: "a deer", fox: "a fox", alpaca: "an alpaca", "tree of life": "the Tree of Life", "tree of knowledge": "the Tree of Knowledge" };

const VERB: Record<string, string> = { eat: "goes to eat at", drink: "goes to drink at", rest: "goes to rest at", look: "goes to look at", play: "goes to play at", talk: "goes to talk with", wander: "wanders off", flee: "runs from", linger: "pauses" };

function describe(person: Person, thingKind: (id: string) => string | undefined): string {
  const i = person.intent;
  if (!i) return "";
  const name = i.kind === "talk" ? PEOPLE.find((p) => p.id === i.targetId)?.name : KIND_NAME[thingKind(i.targetId ?? "") ?? ""];
  return name ? `${VERB[i.kind]} ${name}` : VERB[i.kind]!;
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

interface Panel {
  root: HTMLElement;
  status: Record<string, HTMLElement>;
  log: HTMLElement;
  createForm: HTMLFormElement;
  createInput: HTMLInputElement;
}

// A small floating panel, built with the DOM API (never innerHTML -- user text only ever goes through textContent). Mounted directly on
// <body>, a sibling of #app, not inside it: style.css's `.player-mode` rule hides header/nav/.dock/footer *inside* #app so an exported
// standalone player shows a bare canvas -- this panel needs to stay visible there, which it only does by living outside that subtree.
function buildPanel(): Panel {
  const style = document.createElement("style");
  style.textContent = `
    .eden-panel { position: fixed; left: 12px; bottom: 12px; width: 340px; max-height: 44vh;
      display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 10px;
      background: rgba(18, 16, 14, 0.86); color: #ece4d2; font: 13px/1.4 system-ui, sans-serif;
      z-index: 50; box-shadow: 0 4px 18px rgba(0,0,0,0.35); }
    .eden-panel h3 { margin: 0 0 2px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #c9a24a; }
    .eden-status > div { white-space: pre-wrap; }
    .eden-status b { color: #c9a24a; font-weight: 600; }
    .eden-log { flex: 1; min-height: 40px; max-height: 18vh; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; color: #cfc6b2; }
    .eden-log > div { white-space: pre-wrap; word-break: break-word; }
    .eden-panel form { display: flex; gap: 6px; }
    .eden-panel input { flex: 1; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18);
      border-radius: 6px; color: inherit; font: inherit; padding: 5px 8px; }
    .eden-panel button { background: #c9a24a; border: none; border-radius: 6px; color: #1a1510;
      font: inherit; font-weight: 600; padding: 5px 10px; cursor: pointer; }
    .eden-panel button:hover { background: #d9b45f; }
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.className = "eden-panel";
  // Clicks/drags/wheel on the panel must never reach the scene's own camera-orbit/selection input, which listens on window.
  for (const type of ["pointerdown", "mousedown", "wheel", "keydown"]) root.addEventListener(type, (e) => e.stopPropagation());

  const title = document.createElement("h3");
  title.textContent = "Eden";
  root.appendChild(title);

  const statusBox = document.createElement("div");
  statusBox.className = "eden-status";
  const status: Record<string, HTMLElement> = {};
  for (const person of PEOPLE) {
    const line = document.createElement("div");
    status[person.id] = line;
    statusBox.appendChild(line);
  }
  root.appendChild(statusBox);

  const log = document.createElement("div");
  log.className = "eden-log";
  root.appendChild(log);

  const form = document.createElement("form");
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Let there be...";
  input.maxLength = 120;
  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Create";
  form.appendChild(input);
  form.appendChild(button);
  root.appendChild(form);

  document.body.appendChild(root);
  return { root, status, log, createForm: form, createInput: input };
}

function setStatus(line: HTMLElement, name: string, text: string) {
  line.replaceChildren();
  const who = document.createElement("b");
  who.textContent = name;
  line.append(who, document.createTextNode(` ${text}`));
}

function appendLine(panel: Panel, text: string) {
  const line = document.createElement("div");
  line.textContent = text;
  panel.log.appendChild(line);
  while (panel.log.children.length > 60) panel.log.removeChild(panel.log.firstChild!);
  panel.log.scrollTop = panel.log.scrollHeight;
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

export function installEdenAgents(C: Ctx): void {
  let panel: Panel | undefined;
  let world: World | undefined;
  const sent = new Map<string, string>(); // what each person's script was last told
  const spoken = new Map<string, string>();
  const described = new Map<string, string>();
  let nextCreated = 1;
  // Meals a thing held when it was made, so a used-up bush grows back.
  const fullStock = new Map<string, number>();
  let regrow = 0;

  const bodyIndex = (name: string) => C.doc.scene.eachAlive().findIndex((e) => C.doc.scene.resolve(e, "Name")?.value === name);
  function bodyPosition(name: string): [number, number, number] | undefined {
    const index = bodyIndex(name);
    const object = index >= 0 ? C.objects[index] : undefined;
    return object ? [object.position.x, object.position.y, object.position.z] : undefined;
  }

  function startWorld() {
    const things: Thing[] = [];
    for (const [key, place] of Object.entries(PLACES)) {
      const at = key === "river_bend" ? DRINK_SPOT : place;
      things.push({ id: key, kind: PLACE_KINDS[key as keyof typeof PLACES], x: at.x, z: at.z, radius: 3 });
    }
    // The two landmark trees stand where the scene put them; they are there to be looked at and, for the Tree of Life, eaten from.
    for (const [name, kind] of [["Tree of Life", "tree of life"], ["Tree of Knowledge", "tree of knowledge"]] as const) {
      const at = bodyPosition(name);
      if (at) things.push({ id: kind, kind, x: at[0], z: at[2], radius: 3, stock: AFFORDANCES[kind]?.stock });
    }
    for (const thing of things) if (thing.stock !== undefined) fullStock.set(thing.id, thing.stock);
    const people = PEOPLE.map((p, i) => {
      const at = bodyPosition(p.name) ?? [0, 0, 0];
      return makePerson(p.id, at[0], at[2], 1000 + i * 77, p.personality);
    });
    world = { things, people };
    sent.clear();
    spoken.clear();
    described.clear();
  }

  function create(text: string) {
    const query = text.trim();
    if (!query || !panel || !world) return;
    // "a deer", "let there be an oak tree": drop the lead-in and article so the name is what is ranked.
    const wanted = query.replace(/^(let there be\s+)?((a|an|the|some)\s+)?/i, "").trim();
    const [match] = wanted ? fuzzyRank(CREATABLE, wanted, ([name]) => name) : [];
    if (!match) {
      appendLine(panel, `✗ Nothing like "${query}" exists yet. Try: ${CREATABLE.map(([n]) => n).join(", ")}.`);
      return;
    }
    const [prefab, kind] = match;
    // Near the garden's center, where the people usually are, with a little scatter.
    const centre = PLACES.center;
    const x = centre.x + (Math.random() - 0.5) * 12;
    const z = centre.z + (Math.random() - 0.5) * 12;
    C.runtime.ccall("editor_ui_event", null, ["string", "string"], ["eden_create", `${prefab},${x},0,${z}`]);
    const id = `created-${nextCreated++}`;
    const stock = AFFORDANCES[kind]?.stock;
    world.things.push({ id, kind, x, z, radius: 2, stock });
    if (stock !== undefined) fullStock.set(id, stock);
    appendLine(panel, `✦ ${KIND_NAME[kind] ? KIND_NAME[kind]!.replace(/^a /, "A ") : prefab} appears in the garden.`);
  }

  function tick() {
    if (!world || !panel) return;
    const w = world;
    // The bodies are where physics and paths put them; the minds start from there.
    for (const person of w.people) {
      const name = PEOPLE.find((p) => p.id === person.id)!.name;
      const at = bodyPosition(name);
      if (at) {
        person.x = at[0];
        person.z = at[2];
      }
    }
    const dt = (TICK_MS / 1000) * TIME_SCALE;
    step(w, dt, { externalMotion: true });

    // Used-up food grows back, one meal at a time.
    regrow += dt;
    if (regrow > 90) {
      regrow = 0;
      for (const t of w.things) {
        const full = fullStock.get(t.id);
        if (full !== undefined && t.stock !== undefined && t.stock < full) t.stock += 1;
      }
    }

    const kindOf = (id: string) => w.things.find((t) => t.id === id)?.kind;
    for (const person of w.people) {
      const entry = PEOPLE.find((p) => p.id === person.id)!;
      const intent = person.intent;
      if (intent) {
        const action = actionOf(person);
        const key = `${intent.kind}|${intent.targetId ?? ""}|${intent.arrived}|${Math.round(intent.x)}|${Math.round(intent.z)}`;
        if (sent.get(person.id) !== key) {
          sent.set(person.id, key);
          // Where the body should walk, and how fast; it stays at the spot, and plays the action, once there.
          C.runtime.ccall("editor_ui_event", null, ["string", "string"], [`eden_target_${person.id}`, `${intent.x},0,${intent.z},${action},${intent.speed}`]);
        }
        const text = describe(person, kindOf);
        if (text && described.get(person.id) !== text && intent.kind !== "linger") {
          described.set(person.id, text);
          appendLine(panel, `${entry.name} ${text}.`);
        }
      }
      if (person.say && spoken.get(person.id) !== person.say) {
        spoken.set(person.id, person.say);
        appendLine(panel, `${entry.name}: "${person.say}"`);
      }
      const doing = intent ? (intent.arrived ? "" : "") + describe(person, kindOf) : "";
      const need = needWord(person);
      setStatus(panel.status[person.id]!, entry.name, `${moodWord(person.mood)}${need ? `, ${need}` : ""}${doing ? ` · ${doing}` : ""}${person.health < 0.9 ? ` · hurt` : ""}`);
    }
  }

  // Decided afresh each time Play starts, because the editor can switch scenes between plays: only an Eden scene mounts the panel and runs.
  let wasPlaying = false;
  let inEden = false;
  function mountPanel() {
    panel = buildPanel();
    const p = panel;
    p.createForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = p.createInput.value;
      p.createInput.value = "";
      create(text);
    });
  }

  setInterval(() => {
    if (C.doc.mode !== "play") {
      wasPlaying = false;
      if (panel) panel.root.style.display = "none";
      return;
    }
    if (!wasPlaying) {
      wasPlaying = true;
      inEden = isEdenScene(C);
      if (inEden && !panel) mountPanel();
      if (panel) panel.root.style.display = inEden ? "" : "none";
      if (inEden) startWorld();
    }
    if (inEden) tick();
  }, TICK_MS);
}
