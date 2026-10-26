import type { Ctx } from "./context";

// Eden Phase 1a: polls the live Supabase brain (eden-tick, cron'd every 3
// minutes) for Adam & Eve's current decisions and drives their Lua scripts
// (tools/eden/lua/{adam,eve}.lua) accordingly. This is the one and only
// place in the codebase that talks to an external API at runtime -- every
// other `fetch` call anywhere in apps/editor only loads bundled local
// assets at load time (confirmed before writing this). It has to live
// here, in the unsandboxed TS host, because the Lua VM has zero network
// capability by construction (source/engine/script/script.cpp's
// open_sandboxed_libs opens no io/os/package at all) -- scripts can only
// ever receive a target position and an action name, through
// editor_ui_event, the same broadcast channel UI widgets already use.
//
// Plain fetch() against PostgREST, not the supabase-js SDK: this project
// has exactly one runtime dependency (three) by design, and a handful of
// REST GETs don't earn a new one.

const SUPABASE_URL = "https://douglytjshdaunvooyyn.supabase.co";
// Public, RLS-scoped anon key (read-only by policy on every eden_* table
// except the two Creator-write ones -- see the migration). Safe to embed,
// the same as any Supabase project's anon key is meant to be used directly
// in a browser.
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvdWdseXRqc2hkYXVudm9veXluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxOTgzMTYsImV4cCI6MjEwMjc3NDMxNn0.b5_t_rWkS5N6N_7-OxNAC6iJkk5h11bBrKn_969OCjc";

const ENTITIES = ["adam", "eve"] as const;
type EntityId = (typeof ENTITIES)[number];

// This phase's action vocabulary doesn't literally name any model's own
// clips except "idle"/"walk" (which resolve directly, no entry needed) --
// these map eden-tick's decision.action onto whatever "Man (casual)"/
// "Woman (casual)" actually have, exactly the same mechanism F48 built for
// "attack"/"blast"/"sit". Tried in order, case-insensitively, first match
// wins; the two models don't share a clip set (talk/Wave vs sit/Clapping),
// so this list has to cover both.
const EDEN_ACTION_CLIPS: [string, string[]][] = [
  ["rest", ["sit", "idle"]],
  ["wander", ["walk"]],
  ["observe", ["idle"]],
  ["approach_other", ["walk"]],
  ["talk_to_other", ["talk", "idle"]],
  ["play_together", ["clapping", "wave", "idle"]],
  ["respond_to_creator", ["talk", "idle"]],
];

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
  id: string;
  speaker_id: EntityId;
  listener_id: EntityId;
  content: string;
  created_at: string;
}

async function restGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`Eden brain fetch failed (${res.status}): ${path}`);
  return res.json() as Promise<T>;
}

export function installEdenAgents(C: Ctx): void {
  // Locations are near-static (re-seeded only between phases, never live),
  // so fetched once rather than every poll.
  let locations: Map<string, LocationRow> | undefined;
  const lastTick: Partial<Record<EntityId, string>> = {};
  let lastExchangeSeen = "";
  let polling = false;

  function worldPosition(locationId: string): [number, number, number] | undefined {
    const loc = locations?.get(locationId);
    if (!loc) return undefined;
    // Flat Phase 1a ground (Terrain height: 0 everywhere) -- eden_locations'
    // own (x, y) columns map onto world (x, 0, z), matching the same
    // convention Nomad's own locations table used for a 2D map.
    return [loc.x, 0, loc.y];
  }

  function clipFor(action: string): string {
    for (const [name, _candidates] of EDEN_ACTION_CLIPS) if (name === action) return action;
    return action;
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
      const value = `${pos[0]},${pos[1]},${pos[2]},${clipFor(state.current_action)}`;
      C.runtime.ccall("editor_ui_event", null, ["string", "string"], [`eden_target_${state.entity_id}`, value]);
    }

    // Phase 1a has no Dialogue-widget wiring yet (that's a Creator-UI/
    // Phase 2 concern) -- surfaced to the console so exchanges between Adam
    // and Eve are actually visible while validating this phase.
    const exchanges = await restGet<ExchangeRow[]>(
      `eden_exchanges?select=id,speaker_id,listener_id,content,created_at&order=created_at.asc${
        lastExchangeSeen ? `&created_at=gt.${encodeURIComponent(lastExchangeSeen)}` : "&limit=0"
      }`,
    );
    for (const ex of exchanges) {
      C.log(`Eden: ${ex.speaker_id} -> ${ex.listener_id}: ${ex.content}`);
      lastExchangeSeen = ex.created_at;
    }
    if (!lastExchangeSeen && exchanges.length === 0) {
      // First poll, nothing to diff against yet -- seed the watermark to
      // "now" via the most recent existing row, if any, so we don't dump
      // the whole history on the very first tick.
      const seed = await restGet<ExchangeRow[]>("eden_exchanges?select=created_at&order=created_at.desc&limit=1");
      if (seed[0]) lastExchangeSeen = seed[0].created_at;
    }
  }

  setInterval(() => {
    if (C.doc.mode !== "play" || polling) return;
    polling = true;
    pollOnce()
      .catch((error) => C.log(`Eden brain poll failed: ${String(error)}`))
      .finally(() => (polling = false));
  }, 15_000);

  // Extend the shared synonym map once, at install time -- same mechanism
  // and the same Map instance F48's "attack"/"blast"/"sit" already live on.
  for (const [action, candidates] of EDEN_ACTION_CLIPS) C.actionClipSynonyms.set(action, candidates);
}
