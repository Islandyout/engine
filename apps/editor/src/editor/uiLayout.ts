// Screen-space layout for UI elements (0.54.0): where an element's box
// sits for its anchor, offset and size, plus slider hit math. Pure so it
// can be unit tested; main.ts's drawHud() does the actual painting.
import type { UIAnchor, UIKind } from "../scene/Components";

export const uiPadding = 16;

export interface UIRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Size used when an element's width/height is 0 ("auto"). Text and Button
// size to their label; the rest use these defaults.
export function autoSize(kind: UIKind, textWidth: number, fontSize: number): { width: number; height: number } {
  switch (kind) {
    case "Text":
      return { width: textWidth, height: fontSize };
    case "Button":
      return { width: textWidth + 28, height: fontSize + 18 };
    case "Toggle":
      return { width: fontSize + 8 + (textWidth > 0 ? textWidth + 8 : 0), height: fontSize + 8 };
    case "Bar":
      return { width: 200, height: 16 };
    case "Slider":
      return { width: 200, height: 20 };
    case "Panel":
    case "Image":
      return { width: 200, height: 120 };
  }
}

export function anchorFractions(anchor: UIAnchor): { x: number; y: number } {
  return {
    x: anchor.includes("left") ? 0 : anchor.includes("right") ? 1 : 0.5,
    y: anchor.includes("top") ? 0 : anchor.includes("bottom") ? 1 : 0.5,
  };
}

// The element's box: the anchor point (inset by uiPadding from the screen
// edges it's attached to), aligned so the box stays on screen, then moved
// by the offset (+x right, +y down).
export function layoutRect(
  anchor: UIAnchor,
  screenWidth: number,
  screenHeight: number,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
): UIRect {
  const f = anchorFractions(anchor);
  const x = f.x * screenWidth + (f.x === 0 ? uiPadding : f.x === 1 ? -uiPadding : 0);
  const y = f.y * screenHeight + (f.y === 0 ? uiPadding : f.y === 1 ? -uiPadding : 0);
  return { left: x - width * f.x + offsetX, top: y - height * f.y + offsetY, width, height };
}

export function contains(rect: UIRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

// A slider's value (0..1) for a pointer at screen x.
export function sliderValue(rect: UIRect, x: number): number {
  if (rect.width <= 0) return 0;
  return Math.min(1, Math.max(0, (x - rect.left) / rect.width));
}
