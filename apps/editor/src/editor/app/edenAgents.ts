import { fuzzyRank } from "../fuzzy";
import type { Ctx } from "./context";

// Eden: polls the live Supabase brain (eden-tick, cron'd every 3 minutes)
// for Adam & Eve's current decisions and drives their Lua scripts
// (tools/eden/lua/{adam,eve}.lua) accordingly, and gives the Creator a
// small panel to speak to them and to bring new things into the garden
// ("let there be..."). This is the one and only place in the codebase that
// talks to an external API at runtime -- every other `fetch` call anywhere
// in apps/editor only loads bundled local assets at load time (confirmed
// before writing this). It has to live here, in the unsandboxed TS host,
// because the Lua VM has zero network capability by construction
// (source/engine/script/script.cpp's open_sandboxed_libs opens no io/os/
// package at all) -- scripts can only ever receive an event name and a
// string payload, through editor_ui_event, the same broadcast channel UI
// widgets already use.
//
// Plain fetch() against PostgREST, not the supabase-js SDK: this project
// has exactly one runtime dependency (three) by design, and a handful of
// REST calls don't earn a new one.

// "adam and eve" project -- moved here from the original "Nomad" project
// (douglytjshdaunvooyyn) after that account's own email became
// unrecoverable mid-Phase-1b; same schema, redeployed fresh.
const SUPABASE_URL = "https://zqglqioespsqmndcxlbe.supabase.co";
// Public, RLS-scoped anon key (read-only by policy on every eden_* table
// except the Creator-write ones -- see the migration). Safe to embed, the
// same as any Supabase project's anon key is meant to be used directly in a
// browser.
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxZ2xxaW9lc3BzcW1uZGN4bGJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNjUwMTMsImV4cCI6MjEwODY0MTAxM30.Mna3jNNSI443eN6qruvipJE3vOqfKEeA60upDOeH508";

const ENTITIES = ["adam", "eve"] as const;
type EntityId = (typeof ENTITIES)[number];
const DISPLAY_NAME: Record<EntityId, string> = { adam: "Adam", eve: "Eve" };

// This action vocabulary doesn't literally name any model's own clips
// except "idle"/"walk" (which resolve directly, no entry needed) -- these
// map eden-tick's decision.action onto whatever "Man (casual)"/"Woman
// (casual)" actually have, exactly the same mechanism F48 built for
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
  ["approach_other", ["walk"]],
  ["talk_to_other", ["talk", "idle"]],
  ["play_together", ["clapping", "wave", "idle"]],
  ["respond_to_creator", ["talk", "idle"]],
  ["forage", ["clapping", "idle"]],
  ["drink_from_river", ["sit", "idle"]],
];

// The only things "let there be..." can bring into the garden -- Eden's own
// grove trees and garden animals (see build_eden.ts's prefabs), not an
// arbitrary catalog dump. A request that doesn't fuzzy-match one of these
// fails loudly with this same list as the reason, per the house rule (no
// silent fallback) and the Creator's own call on unfulfillable requests.
const CREATABLE = ["Deer", "Fox", "Alpaca", "Oak Tree", "Pine Tree", "Bush", "Rock"];

interface EntityStateRow {
  entity_id: EntityId;
  current_action: string;
  current_location: string;
  last_tick_at: string;
}
interface LocationRow {
  id: string;
  x: number;
  y: number;
}
interface ExchangeRow {
  speaker_id: EntityId;
  listener_id: EntityId;
  content: string;
  created_at: string;
}
interface ConversationRow {
  entity_id: EntityId;
  role: "creator" | "agent";
  content: string;
  created_at: string;
}

async function restGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`Eden fetch failed (${res.status}): ${path}`);
  return res.json() as Promise<T>;
}
async function restInsert(path: string, rows: unknown): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Eden insert failed (${res.status}): ${path} ${await res.text()}`);
}

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
// text, the Creator's own and Adam/Eve's generated dialogue alike, only
// ever goes through textContent, per this repo's own house rule). Mounted
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
    input.maxLength = 300;
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
  let edenChecked = false;
  // Locations are near-static (re-seeded only between phases, never live),
  // so fetched once rather than every poll.
  let locations: Map<string, LocationRow> | undefined;
  const lastTick: Partial<Record<EntityId, string>> = {};
  let lastExchangeSeen = "";
  let lastConversationSeen = "";
  let polling = false;

  function worldPosition(locationId: string): [number, number, number] | undefined {
    const loc = locations?.get(locationId);
    if (!loc) return undefined;
    // eden_locations' own (x, y) columns map onto world (x, 0, z) -- the
    // broadcast y is never actually read: adam.lua/eve.lua only ever move
    // horizontally (self.vx/vz) and let their own RigidBody's gravity
    // settle them onto the real terrain height at each new (x, z), flat
    // ground or the Phase 1b biome's sculpted one alike.
    return [loc.x, 0, loc.y];
  }

  async function pollOnce() {
    if (!locations) {
      const rows = await restGet<LocationRow[]>("eden_locations?select=id,x,y");
      locations = new Map(rows.map((r) => [r.id, r]));
    }

    const states = await restGet<EntityStateRow[]>(
      "eden_entity_state?select=entity_id,current_action,current_location,last_tick_at",
    );
    for (const state of states) {
      if (lastTick[state.entity_id] === state.last_tick_at) continue; // no new decision since last poll
      lastTick[state.entity_id] = state.last_tick_at;
      const pos = worldPosition(state.current_location);
      if (!pos) {
        C.log(`Eden: ${state.entity_id}'s location "${state.current_location}" isn't in eden_locations -- skipped`);
        continue;
      }
      const value = `${pos[0]},${pos[1]},${pos[2]},${state.current_action}`;
      C.runtime.ccall("editor_ui_event", null, ["string", "string"], [`eden_target_${state.entity_id}`, value]);
    }

    const exchanges = await restGet<ExchangeRow[]>(
      `eden_exchanges?select=speaker_id,listener_id,content,created_at&order=created_at.asc${
        lastExchangeSeen ? `&created_at=gt.${encodeURIComponent(lastExchangeSeen)}` : "&limit=0"
      }`,
    );
    for (const ex of exchanges) {
      if (panel) appendLine(panel, `${DISPLAY_NAME[ex.speaker_id]} → ${DISPLAY_NAME[ex.listener_id]}: ${ex.content}`);
      lastExchangeSeen = ex.created_at;
    }
    if (!lastExchangeSeen) {
      const seed = await restGet<ExchangeRow[]>("eden_exchanges?select=created_at&order=created_at.desc&limit=1");
      if (seed[0]) lastExchangeSeen = seed[0].created_at;
    }

    const replies = await restGet<ConversationRow[]>(
      `eden_conversations?select=entity_id,role,content,created_at&role=eq.agent&order=created_at.asc${
        lastConversationSeen ? `&created_at=gt.${encodeURIComponent(lastConversationSeen)}` : "&limit=0"
      }`,
    );
    for (const reply of replies) {
      if (panel) appendLine(panel, `${DISPLAY_NAME[reply.entity_id]}: ${reply.content}`);
      lastConversationSeen = reply.created_at;
    }
    if (!lastConversationSeen) {
      const seed = await restGet<ConversationRow[]>(
        "eden_conversations?select=created_at&role=eq.agent&order=created_at.desc&limit=1",
      );
      if (seed[0]) lastConversationSeen = seed[0].created_at;
    }
  }

  async function speak(text: string) {
    const content = text.trim();
    if (!content) return;
    if (panel) appendLine(panel, `You: ${content}`);
    await restInsert(
      "eden_conversations",
      ENTITIES.map((entity_id) => ({ entity_id, role: "creator", content })),
    );
  }

  async function create(text: string) {
    const query = text.trim();
    if (!query || !panel) return;
    const [match] = fuzzyRank(CREATABLE, query, (name) => name);
    const center = worldPosition("center") ?? [0, 0, 0];
    const at: [number, number, number] = [center[0] + (Math.random() - 0.5) * 4, center[1], center[2] + (Math.random() - 0.5) * 4];
    if (!match) {
      appendLine(panel, `✗ Nothing like "${query}" exists yet. Try: ${CREATABLE.join(", ")}.`);
      await restInsert("eden_creator_commands", [
        { raw_text: query, status: "failed", result_description: `No match among: ${CREATABLE.join(", ")}.`, resolved_at: new Date().toISOString() },
      ]);
      return;
    }
    C.runtime.ccall("editor_ui_event", null, ["string", "string"], ["eden_create", `${match},${at[0]},${at[1]},${at[2]}`]);
    appendLine(panel, `✦ A ${match} appears in the garden.`);
    await restInsert("eden_creator_commands", [
      { raw_text: query, status: "fulfilled", result_description: `Spawned ${match}.`, resolved_at: new Date().toISOString() },
    ]);
  }

  setInterval(() => {
    if (C.doc.mode !== "play" || polling) return;
    if (!edenChecked) {
      edenChecked = true;
      if (isEdenScene(C)) {
        panel = buildPanel();
        const p = panel;
        p.speakForm.addEventListener("submit", (e) => {
          e.preventDefault();
          const text = p.speakInput.value;
          p.speakInput.value = "";
          void speak(text).catch((error) => appendLine(p, `(speaking failed: ${String(error)})`));
        });
        p.createForm.addEventListener("submit", (e) => {
          e.preventDefault();
          const text = p.createInput.value;
          p.createInput.value = "";
          void create(text).catch((error) => appendLine(p, `(creation failed: ${String(error)})`));
        });
      }
    }
    polling = true;
    pollOnce()
      .catch((error) => C.log(`Eden brain poll failed: ${String(error)}`))
      .finally(() => (polling = false));
  }, 15_000);
}
