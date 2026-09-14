import type { EntityRef, Vec3 } from "../scene/Components";
export type TransformMode = "translate" | "rotate" | "scale";
export interface TransformSnapshot {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}
export function transformCommand(
  entity: EntityRef,
  mode: TransformMode,
  before: TransformSnapshot,
  after: TransformSnapshot,
) {
  const key =
    mode === "translate"
      ? "position"
      : mode === "rotate"
        ? "rotation"
        : "scale";
  const a = before[key],
    b = after[key];
  if (a.x === b.x && a.y === b.y && a.z === b.z) return null;
  const type =
    mode === "translate"
      ? "Transform"
      : mode === "rotate"
        ? "Rotation"
        : "Scale";
  const field =
    mode === "translate" ? "position" : mode === "rotate" ? "euler" : "value";
  return {
    command: "set_component",
    entity,
    type,
    value: { [field]: { x: b.x, y: b.y, z: b.z } },
  };
}
