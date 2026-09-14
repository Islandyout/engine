import { Scene } from "../scene/Scene";
import {
  CommandInterpreter,
  type CommandResult,
  type AuthoringStorage,
} from "../authoring/CommandInterpreter";
import {
  deserializeScene,
  serializeScene,
  validateSceneDocument,
  type SceneDocument,
} from "../scene/SceneSerializer";
import type { EntityRef } from "../scene/Components";

export class EditorDocument {
  readonly scene = new Scene();
  readonly commands: CommandInterpreter;
  constructor(storage?: AuthoringStorage) {
    const files = new Map<string, string>();
    this.commands = new CommandInterpreter(
      this.scene,
      storage ?? {
        read: (path) => files.get(path) ?? null,
        write: (path, text) => {
          files.set(path, text);
        },
      },
    );
  }
  project = "Untitled project";
  name = "Untitled scene";
  selection: EntityRef | undefined;
  mode: "edit" | "play" | "pause" = "edit";
  private undoStack: SceneDocument[] = [];
  private redoStack: SceneDocument[] = [];
  private saved = JSON.stringify(serializeScene(this.scene));
  get dirty() {
    return JSON.stringify(serializeScene(this.scene)) !== this.saved;
  }
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  execute(command: unknown): CommandResult {
    if (this.mode !== "edit")
      return { ok: false, error: "Stop playback before editing" };
    const before = serializeScene(this.scene);
    const result = this.commands.execute(command);
    if (
      result.ok &&
      JSON.stringify(before) !== JSON.stringify(serializeScene(this.scene))
    ) {
      this.undoStack.push(before);
      if (this.undoStack.length > 100) this.undoStack.shift();
      this.redoStack = [];
    }
    if (result.entity && this.scene.alive(result.entity))
      this.selection = result.entity;
    if (this.selection && !this.scene.alive(this.selection))
      this.selection = undefined;
    return result;
  }
  load(data: unknown) {
    if (this.mode !== "edit") throw new Error("Stop playback before loading");
    validateSceneDocument(data);
    deserializeScene(this.scene, data);
    this.name = data.name ?? "Untitled scene";
    this.selection = undefined;
    this.undoStack = [];
    this.redoStack = [];
    this.markSaved();
  }
  save() {
    return serializeScene(this.scene, this.name);
  }
  markSaved() {
    this.saved = JSON.stringify(serializeScene(this.scene));
  }
  undo() {
    this.restore(this.undoStack, this.redoStack);
  }
  redo() {
    this.restore(this.redoStack, this.undoStack);
  }
  private restore(from: SceneDocument[], to: SceneDocument[]) {
    if (this.mode !== "edit") return;
    const next = from.pop();
    if (!next) return;
    to.push(serializeScene(this.scene));
    deserializeScene(this.scene, next);
    this.selection = undefined;
  }
  duplicate(): CommandResult {
    if (
      this.mode !== "edit" ||
      !this.selection ||
      !this.scene.alive(this.selection)
    )
      return { ok: false, error: "Select an entity in edit mode" };
    const before = serializeScene(this.scene);
    const refs = this.scene.eachAlive();
    const source =
      before.entities[
        refs.findIndex((e) => e.index === this.selection!.index)
      ]!;
    const next = structuredClone(before);
    const copy = structuredClone(source);
    copy.name = (copy.name ?? "Entity") + " copy";
    copy.components.Name = { value: copy.name };
    next.entities.push(copy);
    validateSceneDocument(next);
    deserializeScene(this.scene, next);
    this.undoStack.push(before);
    this.redoStack = [];
    this.selection = this.scene.eachAlive().at(-1);
    return { ok: true, entity: this.selection };
  }
}
