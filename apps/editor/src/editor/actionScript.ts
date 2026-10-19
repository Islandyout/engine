// The plain-text action language of the UI kit and the Objectives component:
// one action per line (several with ";"), optionally "<event> -> <action>" to
// answer only that event. Pure parsing, so it is tested without a browser.

export const actionVerbs = [
  "show", "hide", "toggle", "pause", "resume", "restart", "quit", "settings",
  "give", "take", "equip", "unequip", "select", "objective", "text", "script",
] as const;
export type ActionVerb = (typeof actionVerbs)[number];

export interface ParsedAction {
  // "" answers every event; otherwise the event it answers ("play", "item:Key", "choice:*"...).
  event: string;
  verb: ActionVerb;
  args: string;
}

// Parses action text. Unknown verbs are reported, not skipped, with their line.
export function parseActions(text: string): { actions: ParsedAction[]; errors: string[] } {
  const actions: ParsedAction[] = [];
  const errors: string[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    let event = "";
    let body = line;
    const arrow = line.indexOf("->");
    if (arrow >= 0) {
      event = line.slice(0, arrow).trim();
      body = line.slice(arrow + 2);
    }
    for (const part of body.split(";")) {
      const piece = part.trim();
      if (!piece) continue;
      const space = piece.search(/\s/);
      const verb = (space < 0 ? piece : piece.slice(0, space)).toLowerCase();
      const args = space < 0 ? "" : piece.slice(space + 1).trim();
      if (!(actionVerbs as readonly string[]).includes(verb)) {
        errors.push(`line ${i + 1}: unknown action "${verb}" (${actionVerbs.join(", ")})`);
        continue;
      }
      actions.push({ event, verb: verb as ActionVerb, args });
    }
  });
  return { actions, errors };
}

// Whether an action's event pattern answers `event` ("" always; a trailing * is a prefix match).
export function answers(pattern: string, event: string): boolean {
  if (pattern === "" || pattern === "*") return true;
  return pattern.endsWith("*") ? event.startsWith(pattern.slice(0, -1)) : pattern === event;
}

// "Key 2" -> ["Key", 2]; "Health Potion" -> ["Health Potion", 1].
export function nameAndCount(args: string): [string, number] {
  const m = /^(.*?)(?:\s+(\d+))?$/.exec(args.trim());
  return [(m?.[1] ?? args).trim(), m?.[2] ? Number(m[2]) : 1];
}

export type Goal =
  | { kind: "kill"; target: string; count: number }
  | { kind: "collect"; target: string; count: number }
  | { kind: "reach"; target: string; radius: number }
  | { kind: "interact"; target: string }
  | { kind: "script"; count: number };

export interface ObjectiveDef {
  id: string;
  title: string;
  detail: string;
  goal: Goal;
  onComplete: string; // action text (";" or newlines inside the line are not allowed; use ";")
}

export function parseGoal(text: string): Goal | string {
  const t = text.trim();
  if (t === "" || t.toLowerCase() === "script") return { kind: "script", count: 1 };
  const m = /^(kill|collect|reach|interact)\s+(.+)$/i.exec(t);
  if (!m) return `a goal is "kill <name|any> <n>", "collect <item> <n>", "reach <entity> [metres]", "interact <entity>" or "script" (got "${t}")`;
  const kind = m[1]!.toLowerCase();
  const rest = m[2]!;
  if (kind === "kill" || kind === "collect") {
    const [target, count] = nameAndCount(rest);
    if (!target) return `"${kind}" needs a target`;
    return { kind, target, count } as Goal;
  }
  if (kind === "reach") {
    const r = /^(.*?)(?:\s+(\d+(?:\.\d+)?))?$/.exec(rest.trim())!;
    return { kind: "reach", target: r[1]!.trim(), radius: r[2] ? Number(r[2]) : 3 };
  }
  return { kind: "interact", target: rest.trim() };
}

// "id | Title | Detail | goal | on complete" per line.
export function parseObjectives(text: string): { defs: ObjectiveDef[]; errors: string[] } {
  const defs: ObjectiveDef[] = [];
  const errors: string[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const [id = "", title = "", detail = "", goalText = "", onComplete = ""] = line.split("|").map((x) => x.trim());
    if (!id || /\s/.test(id)) {
      errors.push(`line ${i + 1}: an objective id is one word (got "${id}")`);
      return;
    }
    if (defs.some((d) => d.id === id)) {
      errors.push(`line ${i + 1}: the objective id "${id}" is used twice`);
      return;
    }
    const goal = parseGoal(goalText);
    if (typeof goal === "string") {
      errors.push(`line ${i + 1}: ${goal}`);
      return;
    }
    const actionErrors = parseActions(onComplete).errors;
    if (actionErrors.length) {
      errors.push(`line ${i + 1} (on complete): ${actionErrors.join("; ")}`);
      return;
    }
    defs.push({ id, title: title || id, detail, goal, onComplete });
  });
  return { defs, errors };
}

// How much of a goal is done (0..1) from what the game has counted.
export function goalFraction(goal: Goal, count: number): number {
  const need = goal.kind === "kill" || goal.kind === "collect" || goal.kind === "script" ? Math.max(goal.count, 1) : 1;
  return Math.max(0, Math.min(1, count / need));
}
