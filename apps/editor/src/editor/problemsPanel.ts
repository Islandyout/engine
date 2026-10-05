// The Problems panel (0.77.0): runs the content checks over the scene and
// lists what it finds, each entry selecting its entity.
import { checkContent, formatIssue, type CheckedEntity, type ContentIssue } from "./contentCheck";
import type { EntityRef } from "../scene/Components";
import type { Scene } from "../scene/Scene";

export interface ProblemsContext {
  scene(): Scene;
  modelExists(id: number): boolean;
  select(ref: EntityRef): void;
}

export class ProblemsPanel {
  issues: ContentIssue[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly list: HTMLElement,
    private readonly context: ProblemsContext,
  ) {}

  private entities(): CheckedEntity[] {
    const scene = this.context.scene();
    return scene.eachAlive().map((ref, index) => ({
      index,
      name: scene.resolve(ref, "Name")?.value ?? `Entity ${index}`,
      components: Object.fromEntries(
        scene.effectiveComponentNames(ref).map((type) => [type, scene.resolve(ref, type as never) as unknown as Record<string, unknown>]),
      ),
    }));
  }

  run(): ContentIssue[] {
    this.issues = checkContent(this.entities(), { modelExists: this.context.modelExists });
    this.list.replaceChildren();
    const note = (text: string) => {
      const item = document.createElement("li");
      item.className = "hint";
      item.textContent = text;
      this.list.append(item);
    };
    if (!this.issues.length) note("No problems found.");
    for (const issue of this.issues.slice(0, 50)) {
      const item = document.createElement("li");
      const link = document.createElement("button");
      link.className = "problem";
      link.textContent = formatIssue(issue);
      link.title = "Select this entity";
      link.onclick = () => {
        const ref = this.context.scene().eachAlive()[issue.index];
        if (ref) this.context.select(ref);
      };
      item.append(link);
      this.list.append(item);
    }
    if (this.issues.length > 50) note(`…and ${this.issues.length - 50} more`);
    return this.issues;
  }

  // Runs a moment after the last edit, not on every keystroke.
  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), 400);
  }

  issuesFor(entity: EntityRef, type: string): string[] {
    const index = this.context
      .scene()
      .eachAlive()
      .findIndex((e) => e.index === entity.index && e.generation === entity.generation);
    return this.issues.filter((i) => i.index === index && i.component === type).map((i) => i.message);
  }
}
