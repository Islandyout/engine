// Animator (0.51.0): a small animation state machine, authored as text on
// the Animator component and run once per fixed-tick batch during Play.
//
//   state idle clip=Idle                  -- clip defaults to the state name
//   state run clip=Run speed=1.2          -- playback speed multiplier
//   state attack clip=Attack once         -- plays once (default: loop)
//   start idle                            -- default: the first state
//   idle -> run when speed > 0.5 fade 0.25
//   run -> idle when speed <= 0.5
//   any -> attack when trigger attack
//   attack -> idle when end               -- once the clip has finished
//   event attack 0.4 hit                  -- on_anim_event("hit") at 40%
//
// Conditions are joined with `and`: `param OP number` (OP is one of
// > < >= <= == !=), `param` / `not param` (a boolean), `trigger name`
// (consumed when the transition fires) and `end`. Parameters come from
// scripts (anim.set / anim.trigger) plus three the editor fills in every
// tick: `speed` (ground speed), `grounded` and `vy` (vertical speed).
// Transitions are checked in authored order; `any` transitions never
// re-enter the state they'd leave from. `#` and `--` start comments.

export type ParamValue = number | boolean;

export type Condition =
  | { kind: "compare"; param: string; op: ">" | "<" | ">=" | "<=" | "==" | "!="; value: number }
  | { kind: "flag"; param: string; negate: boolean }
  | { kind: "trigger"; name: string }
  | { kind: "end" };

export interface AnimatorState {
  name: string;
  clip: string;
  loop: boolean;
  speed: number;
}

export interface AnimatorTransition {
  from: string; // a state name, or "any"
  to: string;
  conditions: Condition[];
  fade: number;
}

export interface AnimatorEvent {
  state: string;
  at: number; // normalized clip time, 0..1
  name: string;
}

export interface AnimatorGraph {
  states: Map<string, AnimatorState>;
  start: string;
  transitions: AnimatorTransition[];
  events: AnimatorEvent[];
}

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseCondition(text: string): Condition | string {
  const words = text.trim().split(/\s+/);
  if (words.length === 1 && words[0] === "end") return { kind: "end" };
  if (words.length === 2 && words[0] === "trigger" && identifier.test(words[1]!))
    return { kind: "trigger", name: words[1]! };
  if (words.length === 2 && words[0] === "not" && identifier.test(words[1]!))
    return { kind: "flag", param: words[1]!, negate: true };
  if (words.length === 1 && identifier.test(words[0]!))
    return { kind: "flag", param: words[0]!, negate: false };
  if (words.length === 3 && identifier.test(words[0]!)) {
    const op = words[1]!;
    const value = Number(words[2]);
    if ([">", "<", ">=", "<=", "==", "!="].includes(op) && Number.isFinite(value))
      return { kind: "compare", param: words[0]!, op: op as ">", value };
  }
  return `can't read condition "${text.trim()}"`;
}

export function parseAnimatorGraph(text: string): { graph?: AnimatorGraph; errors: string[] } {
  const errors: string[] = [];
  const states = new Map<string, AnimatorState>();
  const transitions: AnimatorTransition[] = [];
  const events: AnimatorEvent[] = [];
  let start: string | undefined;
  text.split("\n").forEach((raw, index) => {
    const line = raw.replace(/(#|--).*$/, "").trim();
    if (!line) return;
    const where = `line ${index + 1}`;
    const words = line.split(/\s+/);
    if (words[0] === "state") {
      const name = words[1];
      if (!name || !identifier.test(name)) return void errors.push(`${where}: state needs a name`);
      if (states.has(name)) return void errors.push(`${where}: state "${name}" is defined twice`);
      const state: AnimatorState = { name, clip: name, loop: true, speed: 1 };
      for (const option of words.slice(2)) {
        if (option === "once") state.loop = false;
        else if (option === "loop") state.loop = true;
        else if (option.startsWith("clip=") && option.length > 5) state.clip = option.slice(5);
        else if (option.startsWith("speed=") && Number.isFinite(Number(option.slice(6))) && Number(option.slice(6)) > 0)
          state.speed = Number(option.slice(6));
        else errors.push(`${where}: unknown state option "${option}"`);
      }
      states.set(name, state);
    } else if (words[0] === "start") {
      if (!words[1]) errors.push(`${where}: start needs a state name`);
      else start = words[1];
    } else if (words[0] === "event") {
      const at = Number(words[2]);
      if (words.length !== 4 || !Number.isFinite(at) || at < 0 || at > 1)
        return void errors.push(`${where}: expected "event <state> <0..1> <name>"`);
      events.push({ state: words[1]!, at, name: words[3]! });
    } else if (words[1] === "->") {
      const from = words[0]!;
      const to = words[2];
      if (!to) return void errors.push(`${where}: transition needs a target state`);
      let rest = words.slice(3).join(" ");
      let fade = 0.2;
      const fadeMatch = /\bfade\s+(\S+)\s*$/.exec(rest);
      if (fadeMatch) {
        fade = Number(fadeMatch[1]);
        if (!Number.isFinite(fade) || fade < 0) return void errors.push(`${where}: fade must be a number of seconds`);
        rest = rest.slice(0, fadeMatch.index).trim();
      }
      const conditions: Condition[] = [];
      if (rest) {
        if (!rest.startsWith("when ")) return void errors.push(`${where}: expected "when" after the target state`);
        for (const part of rest.slice(5).split(/\band\b/)) {
          const condition = parseCondition(part);
          if (typeof condition === "string") errors.push(`${where}: ${condition}`);
          else conditions.push(condition);
        }
      }
      transitions.push({ from, to, conditions, fade });
    } else {
      errors.push(`${where}: expected state, start, event or "a -> b"`);
    }
  });
  if (states.size === 0) errors.push("no states defined");
  start ??= states.keys().next().value;
  if (start !== undefined && !states.has(start)) errors.push(`start state "${start}" is not defined`);
  for (const t of transitions) {
    if (t.from !== "any" && !states.has(t.from)) errors.push(`transition from unknown state "${t.from}"`);
    if (!states.has(t.to)) errors.push(`transition to unknown state "${t.to}"`);
  }
  for (const e of events) if (!states.has(e.state)) errors.push(`event on unknown state "${e.state}"`);
  if (errors.length || start === undefined) return { errors };
  return { graph: { states, start, transitions, events }, errors };
}

export interface AnimatorStep {
  // Set when the machine entered a new state this step.
  entered?: { state: AnimatorState; fade: number };
  // Animation events whose time was crossed this step, in order.
  events: string[];
}

export class AnimatorRuntime {
  readonly params = new Map<string, ParamValue>();
  private readonly triggers = new Set<string>();
  private currentName: string;
  // Seconds of clip time played in the current state (already scaled by speed).
  private clipTime = 0;

  constructor(private readonly graph: AnimatorGraph) {
    this.currentName = graph.start;
  }

  get current(): AnimatorState {
    return this.graph.states.get(this.currentName)!;
  }

  set(name: string, value: ParamValue) {
    this.params.set(name, value);
  }

  trigger(name: string) {
    this.triggers.add(name);
  }

  // Advances by dt seconds. `clipDuration` is the current clip's length in
  // seconds (unknown or 0: events and `end` never fire for it).
  step(dt: number, clipDuration: number | undefined): AnimatorStep {
    const result: AnimatorStep = { events: [] };
    const state = this.current;
    const before = this.clipTime;
    this.clipTime += dt * state.speed;
    const duration = clipDuration && clipDuration > 0 ? clipDuration : undefined;
    if (duration) {
      for (const event of this.graph.events) {
        if (event.state !== state.name) continue;
        const at = event.at * duration;
        if (state.loop) {
          // Count every loop crossing of `at` in (before, clipTime].
          const first = Math.floor((before - at) / duration) + 1;
          const last = Math.floor((this.clipTime - at) / duration);
          for (let k = Math.max(first, 0); k <= last; k++) result.events.push(event.name);
        } else if (before < at && this.clipTime >= at) {
          result.events.push(event.name);
        }
      }
    }
    const ended = duration !== undefined && this.clipTime >= duration;
    for (const transition of this.graph.transitions) {
      if (transition.from !== state.name && !(transition.from === "any" && transition.to !== state.name)) continue;
      if (!transition.conditions.every((c) => this.holds(c, ended))) continue;
      for (const c of transition.conditions) if (c.kind === "trigger") this.triggers.delete(c.name);
      this.currentName = transition.to;
      this.clipTime = 0;
      result.entered = { state: this.current, fade: transition.fade };
      break;
    }
    return result;
  }

  private holds(condition: Condition, ended: boolean): boolean {
    switch (condition.kind) {
      case "end":
        return ended;
      case "trigger":
        return this.triggers.has(condition.name);
      case "flag": {
        const value = Boolean(this.params.get(condition.param));
        return condition.negate ? !value : value;
      }
      case "compare": {
        const raw = this.params.get(condition.param);
        const value = typeof raw === "boolean" ? (raw ? 1 : 0) : (raw ?? 0);
        switch (condition.op) {
          case ">":
            return value > condition.value;
          case "<":
            return value < condition.value;
          case ">=":
            return value >= condition.value;
          case "<=":
            return value <= condition.value;
          case "==":
            return value === condition.value;
          case "!=":
            return value !== condition.value;
        }
      }
    }
  }
}

// Parameter values arrive from Lua as text (anim.set's emit): booleans as
// "true"/"false", everything else as a number.
export function parseParamValue(text: string): ParamValue | undefined {
  if (text === "true") return true;
  if (text === "false") return false;
  const number = Number(text);
  return text.trim() !== "" && Number.isFinite(number) ? number : undefined;
}
