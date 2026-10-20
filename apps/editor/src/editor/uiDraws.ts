// Where UI kit widgets drawn outside uiKit.ts register themselves (uiKitRpg.ts), so the two files don't need
// each other while they load.
import type { Draw } from "./uiKit";

export const extraDraws = new Map<string, Draw>();
export function registerDraw(widget: string, draw: Draw) {
  extraDraws.set(widget, draw);
}
