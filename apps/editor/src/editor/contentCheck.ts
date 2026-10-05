// Content checks (0.77.0): before Play, and on demand from the toolbar, the
// editor looks through every entity for authoring mistakes the game would
// otherwise swallow silently -- a stop with a bad hour, an instance of a
// model that doesn't exist, an Animator state with no clip, a follow target
// nobody is named -- and lists them with the entity to fix.
import { parseAnimatorGraph } from "./animator";
import { parseModelInstances } from "./modelInstances";
import { parseRoutineStops } from "./routineStops";
import { parseSpaceBodies } from "./spaceView";
import { parseScatter } from "./terrain";

export interface CheckedEntity {
  index: number;
  name: string;
  components: Record<string, Record<string, unknown> | undefined>;
}

export interface ContentIssue {
  index: number;
  entity: string;
  component: string;
  message: string;
}

export interface CheckContext {
  // True when a catalog model with this id exists.
  modelExists(id: number): boolean;
}

const text = (v: unknown) => (typeof v === "string" ? v : "");

export function checkContent(entities: readonly CheckedEntity[], context: CheckContext): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const names = new Set(entities.map((e) => e.name));
  for (const e of entities) {
    const add = (component: string, message: string) => issues.push({ index: e.index, entity: e.name, component, message });
    const c = e.components;
    if (c.Renderable) {
      const mesh = Number(c.Renderable.mesh ?? 0);
      if (mesh >= 1 && !context.modelExists(mesh)) add("Renderable", `model ${mesh} isn't in the catalog`);
    }
    if (c.Routine) {
      const { stops, errors } = parseRoutineStops(text(c.Routine.stops));
      for (const message of errors) add("Routine", message);
      if (!stops.length && !errors.length) add("Routine", "has no stops, so it never moves");
      if (Number(c.Routine.speed ?? 1) <= 0) add("Routine", "walk speed must be above 0");
    }
    if (c.ModelInstances) {
      const { instances, errors } = parseModelInstances(text(c.ModelInstances.instances));
      for (const message of errors.slice(0, 5)) add("ModelInstances", message);
      const missing = [...new Set(instances.map((i) => i.model))].filter((id) => !context.modelExists(id));
      if (missing.length) add("ModelInstances", `unknown model${missing.length > 1 ? "s" : ""} ${missing.join(", ")}`);
    }
    if (c.Terrain) {
      const { rules, errors } = parseScatter(text(c.Terrain.scatter));
      for (const message of errors.slice(0, 5)) add("Terrain", `scatter: ${message}`);
      const missing = [...new Set(rules.map((r) => r.model))].filter((id) => !context.modelExists(id));
      if (missing.length) add("Terrain", `scatter uses unknown model${missing.length > 1 ? "s" : ""} ${missing.join(", ")}`);
    }
    if (c.Animator) {
      const { errors } = parseAnimatorGraph(text(c.Animator.graph));
      for (const message of errors) add("Animator", message);
    }
    if (c.SpaceSystem) {
      const { bodies, errors } = parseSpaceBodies(text(c.SpaceSystem.bodies));
      for (const message of errors) add("SpaceSystem", message);
      const site = text(c.SpaceSystem.siteBody);
      if (site && !bodies.some((b) => b.name === site)) add("SpaceSystem", `site body "${site}" isn't one of the bodies`);
    }
    for (const [component, field] of [
      ["CameraFollow", "target"],
      ["Driver", "target"],
    ] as const) {
      const target = text(c[component]?.[field]).trim();
      if (target && !names.has(target)) add(component, `target "${target}" doesn't match any entity's name`);
    }
    if (c.AICombat) {
      for (const point of text(c.AICombat.patrol)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean))
        if (!names.has(point)) add("AICombat", `patrol point "${point}" doesn't match any entity's name`);
    }
    if (c.Script && !text(c.Script.source).trim()) add("Script", "is empty");
  }
  return issues;
}

export function formatIssue(issue: ContentIssue) {
  return `${issue.entity} · ${issue.component}: ${issue.message}`;
}
