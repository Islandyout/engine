// What the inspector remembers between selections: which component cards
// are open (per component type, so collapsing Particles once keeps it
// collapsed on every entity) and the property filter. Kept in the viewer's
// browser only; the inspector works the same when storage is unavailable.

const KEY = "game-engine-editor:inspector-open";

// Open by default: the components most edits are about. The rest start
// collapsed until opened once.
const MAIN = new Set(["Transform", "Renderable", "Player", "CharacterController", "Vehicle", "Script", "Camera", "Environment", "Terrain"]);

export type OpenState = Record<string, boolean>;

export function loadOpenState(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): OpenState {
  try {
    const parsed = JSON.parse(storage?.getItem(KEY) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "boolean")) as OpenState;
  } catch {
    return {};
  }
}

export function saveOpenState(state: OpenState, storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private windows and blocked storage: the state lasts this session.
  }
}

// Whether a card starts open: always when it has a problem to show, else
// as last left, else open only for the main components.
export function cardOpen(type: string, state: OpenState, hasIssues: boolean): boolean {
  if (hasIssues) return true;
  return state[type] ?? MAIN.has(type);
}

// Every card open or closed at once (the inspector's Expand all / Collapse all).
export function setAll(state: OpenState, types: readonly string[], open: boolean): OpenState {
  const next = { ...state };
  for (const type of types) next[type] = open;
  return next;
}
