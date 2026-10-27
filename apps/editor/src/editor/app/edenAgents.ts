import { fuzzyRank } from "../fuzzy";
import { EDEN_LANDMARKS, EDEN_PLACES } from "../../eden/places";
import { actionOf, makePerson, step, type Person, type Thing, type World } from "../../eden/mind";
import type { Ctx } from "./context";

// Eden: drives Adam & Eve's Lua scripts (tools/eden/lua/{adam,eve}.lua) from
// mind.ts's local, deterministic simulation -- plain code, no network and no
// AI model, ticked here every half second -- and gives the Creator a small
// panel to speak to them and to bring new things into the garden ("let
// there be..."). mind.ts owns what they want and where they go; this module
// only ever turns that into editor_ui_event broadcasts, the one channel the
// sandboxed Lua VM can receive anything through at all (source/engine/
// script/script.cpp's open_sandboxed_libs opens no io/os/package -- a
// script could never reach a brain of its own, local or remote).

// The only things "let there be..." can bring into the garden -- Eden's own
// grove trees and garden animals (see build_eden.ts's prefabs), not an
// arbitrary catalog dump. A request that doesn't fuzzy-match one of these
// fails loudly with this same list as the reason, per the house rule (no
// silent fallback) and the Creator's own call on unfulfillable requests.
const CREATABLE = ["Deer", "Fox", "Alpaca", "Oak Tree", "Pine Tree", "Bush", "Rock"];
// Each one's mind.ts AFFORDANCES kind, so something the Creator conjures is
// a real thing to Adam & Eve too -- a new deer is a creature they can
// actually notice, not just a model that showed up.
const CREATABLE_KIND: Record<string, string> = {
  Deer: "deer", Fox: "fox", Alpaca: "alpaca", "Oak Tree": "tree", "Pine Tree": "tree", Bush: "bush", Rock: "rock",
};

// mind.ts's actionOf() vocabulary, mapped onto whatever "Man (casual)"/
// "Woman (casual)" actually have, exactly the same mechanism F48 built for
// "attack"/"blast"/"sit". Tried in order, case-insensitively, first match
// wins; the two models don't share a clip set (talk/Wave vs sit/Clapping),
// so this list has to cover both.
//
// Exported, not registered into C.actionClipSynonyms from here: that Map
// isn't created until deep inside main.ts's startEditor(), well after every
// install*(C) call (including this module's) has already run -- these
// entries get merged into main.ts's own literal instead.
export const EDEN_ACTION_CLIPS: [string, string[]][] = [
  ["rest", ["sit", "idle"]],
  ["wander", ["walk"]],
  ["observe", ["idle"]],
  ["flee", ["run", "walk"]],
  ["talk_to_other", ["talk", "idle"]],
  ["play_together", ["clapping", "wave", "idle"]],
  ["forage", ["clapping", "idle"]],
  ["drink_from_river", ["sit", "idle"]],
];

// True only for a scene that actually carries Eden's own characters --
// found by the exact "eden_target_adam" on_ui name adam.lua listens for,
// not by any metadata the serialized scene doesn't reliably keep. Other
// games share this same bundle and must never see the Creator panel.
function isEdenScene(C: Ctx): boolean {
  for (const entity of C.doc.scene.eachAlive()) {
    const script = C.doc.scene.resolve(entity, "Script");
    if (script?.source.includes("eden_target_adam")) return true;
  }
  return false;
}

interface Panel {
  root: HTMLElement;
  log: HTMLElement;
  speakForm: HTMLFormElement;
  speakInput: HTMLInputElement;
  createForm: HTMLFormElement;
  createInput: HTMLInputElement;
}

// A small floating panel, built with the DOM API (never innerHTML -- user
// text, the Creator's own and Adam/Eve's own "say" lines alike, only ever
// goes through textContent, per this repo's own house rule). Mounted
// directly on <body>, a sibling of #app, not inside it: style.css's
// `.player-mode` rule hides header/nav/.dock/footer *inside* #app so an
// exported standalone player (build/site/eden.html, where the Creator
// actually watches and plays) shows a bare canvas -- this panel needs to
// stay visible there, which it only does by living outside that subtree.
function buildPanel(): Panel {
  const style = document.createElement("style");
  style.textContent = `
    .eden-panel { position: fixed; left: 12px; bottom: 12px; width: 340px; max-height: 44vh;
      display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 10px;
      background: rgba(18, 16, 14, 0.86); color: #ece4d2; font: 13px/1.4 system-ui, sans-serif;
      z-index: 50; box-shadow: 0 4px 18px rgba(0,0,0,0.35); }
    .eden-panel h3 { margin: 0 0 2px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #c9a24a; }
    .eden-log { flex: 1; min-height: 60px; max-height: 22vh; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; }
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
  // Clicks/drags/wheel on the panel must never reach the scene's own
  // camera-orbit/selection input, which listens on window regardless of
  // what was actually clicked.
  for (const type of ["pointerdown", "mousedown", "wheel", "keydown"]) root.addEventListener(type, (e) => e.stopPropagation());

  const title = document.createElement("h3");
  title.textContent = "Eden";
  root.appendChild(title);

  const log = document.createElement("div");
  log.className = "eden-log";
  root.appendChild(log);

  function makeForm(placeholder: string, buttonLabel: string): [HTMLFormElement, HTMLInputElement] {
    const form = document.createElement("form");
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;
    input.maxLength = 200;
    const button = document.createElement("button");
    button.type = "submit";
    button.textContent = buttonLabel;
    form.appendChild(input);
    form.appendChild(button);
    root.appendChild(form);
    return [form, input];
  }
  const [speakForm, speakInput] = makeForm("Speak to them...", "Speak");
  const [createForm, createInput] = makeForm("Let there be...", "Create");

  document.body.appendChild(root);
  return { root, log, speakForm, speakInput, createForm, createInput };
}

function appendLine(panel: Panel, text: string) {
  const line = document.createElement("div");
  line.textContent = text;
  panel.log.appendChild(line);
  while (panel.log.children.length > 60) panel.log.removeChild(panel.log.firstChild!);
  panel.log.scrollTop = panel.log.scrollHeight;
}

export function installEdenAgents(C: Ctx): void {
  let panel: Panel | undefined;
  let wasPlaying = false;
  let inEden = false;

  // A fresh World and a fresh pair of lives each time Play starts -- see
  // the "decided afresh" comment below. Seeded from the clock, not a fixed
  // number: mind.ts's own determinism (same seed, same life) is for
  // testing it in isolation (edenMind.test.ts), not for making every
  // playthrough identical here.
  let world: World | undefined;
  const lastSay: Partial<Record<string, string>> = {};
  let lastTick = 0;

  function buildWorld(): World {
    const things: Thing[] = [
      ...Object.values(EDEN_PLACES).map((p): Thing => ({ id: p.id, kind: p.kind, x: p.x, z: p.z, radius: p.radius })),
      ...EDEN_LANDMARKS.map((p): Thing => ({ id: p.id, kind: p.kind, x: p.x, z: p.z, radius: p.radius })),
    ];
    const seed = Date.now() | 0;
    const center = EDEN_PLACES.center!;
    const adam = makePerson("adam", center.x - 1, center.z, seed, { boldness: 0.6, sociability: 0.45, curiosity: 0.45, appetite: 0.5, patience: 0.7 });
    const eve = makePerson("eve", center.x + 1, center.z, seed + 1, { boldness: 0.5, sociability: 0.7, curiosity: 0.7, appetite: 0.5, patience: 0.5 });
    return { things, people: [adam, eve] };
  }

  // x,y,z,action -- adam.lua/eve.lua's own parse_target; the broadcast y is
  // never actually read (they only ever move horizontally and let their own
  // RigidBody's gravity settle them onto the real terrain height), so it's
  // always 0 here, same as it always was.
  function broadcast(person: Person) {
    const action = actionOf(person);
    C.runtime.ccall("editor_ui_event", null, ["string", "string"], [`eden_target_${person.id}`, `${person.x},0,${person.z},${action}`]);
    if (person.say && person.say !== lastSay[person.id] && panel) {
      appendLine(panel, `${person.id === "adam" ? "Adam" : "Eve"}: ${person.say}`);
    }
    lastSay[person.id] = person.say;
  }

  // No model generates a reply here -- mind.ts has none, and pretending one
  // exists would be exactly the silent fallback this repo's own house rule
  // (fail loudly, no silent fallback) rules out. Speaking is instead a
  // small, honest, mechanical gift of attention: it lifts mood and eases
  // the ache for company a little, for both of them.
  function speak(text: string) {
    const content = text.trim();
    if (!content || !panel || !world) return;
    appendLine(panel, `You: ${content}`);
    for (const person of world.people) {
      person.mood = Math.max(-1, Math.min(1, person.mood + 0.15));
      person.needs.social = Math.max(0, person.needs.social - 0.1);
    }
  }

  function create(text: string) {
    const query = text.trim();
    if (!query || !panel || !world) return;
    // "a deer", "let there be an oak tree": drop the lead-in and article so the name is what is ranked.
    const wanted = query.replace(/^(let there be\s+)?((a|an|the|some)\s+)?/i, "").trim();
    const [match] = wanted ? fuzzyRank(CREATABLE, wanted, (name) => name) : [];
    const center = EDEN_PLACES.center!;
    const x = center.x + (Math.random() - 0.5) * 4;
    const z = center.z + (Math.random() - 0.5) * 4;
    if (!match) {
      appendLine(panel, `✗ Nothing like "${query}" exists yet. Try: ${CREATABLE.join(", ")}.`);
      return;
    }
    C.runtime.ccall("editor_ui_event", null, ["string", "string"], ["eden_create", `${match},${x},0,${z}`]);
    world.things.push({ id: `created-${Date.now()}`, kind: CREATABLE_KIND[match]!, x, z, radius: 2 });
    appendLine(panel, `✦ A ${match} appears in the garden.`);
  }

  function mountPanel() {
    panel = buildPanel();
    const p = panel;
    p.speakForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = p.speakInput.value;
      p.speakInput.value = "";
      speak(text);
    });
    p.createForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = p.createInput.value;
      p.createInput.value = "";
      create(text);
    });
  }

  // Decided afresh each time Play starts, because the editor can switch
  // scenes between plays: only an Eden scene mounts the panel and ticks the
  // simulation.
  setInterval(() => {
    if (C.doc.mode !== "play") {
      wasPlaying = false;
      world = undefined;
      if (panel) panel.root.style.display = "none";
      return;
    }
    if (!wasPlaying) {
      wasPlaying = true;
      inEden = isEdenScene(C);
      if (inEden) {
        if (!panel) mountPanel();
        if (panel) panel.root.style.display = "";
        world = buildWorld();
        lastTick = performance.now();
      } else if (panel) {
        panel.root.style.display = "none";
      }
    }
    if (!inEden || !world) return;
    const now = performance.now();
    // Real seconds since the last tick, capped so a stalled/backgrounded
    // tab doesn't make them leap a day's needs in one step when it wakes.
    const dt = Math.min(2, (now - lastTick) / 1000);
    lastTick = now;
    try {
      step(world, dt);
      for (const person of world.people) broadcast(person);
    } catch (error) {
      C.log(`Eden tick failed: ${String(error)}`);
    }
  }, 500);
}
