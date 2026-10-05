// The editor chrome's icons and small DOM helpers (0.77.0, out of main.ts).

// Small, hand-drawn, dependency-free icon set (no external icon font/CDN,
// consistent with this project's zero-external-asset constraints for the
// editor chrome). Each entry is the inner markup of a 0 0 16 16 viewBox svg.
export const ICONS = {
  play: '<path d="M4 3l9 5-9 5V3z"/>',
  pause: '<rect x="4" y="3" width="3" height="10"/><rect x="9" y="3" width="3" height="10"/>',
  stop: '<rect x="4" y="4" width="8" height="8"/>',
  plus: '<path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  copy: '<rect x="3" y="6" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6 6V4.5A1.5 1.5 0 0 1 7.5 3H12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  trash:
    '<path d="M3 4h10M6.3 4V2.6h3.4V4M4.6 4l.6 9a1 1 0 0 0 1 .9h3.6a1 1 0 0 0 1-.9l.6-9" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
  undo: '<path d="M5 4L2 7l3 3M2 7h7a4 4 0 1 1 0 8h-1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
  redo: '<path d="M11 4l3 3-3 3M14 7H7a4 4 0 1 0 0 8h1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
  save: '<path d="M3 3h7.4L13 5.6V13H3V3z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M5 3v3.6h4.4V3M5 10h6" fill="none" stroke="currentColor" stroke-width="1.1"/>',
  open: '<path d="M2 5.4A1.4 1.4 0 0 1 3.4 4h2.3l1 1.3h5.9A1.4 1.4 0 0 1 14 6.7v4.9A1.4 1.4 0 0 1 12.6 13H3.4A1.4 1.4 0 0 1 2 11.6V5.4z" fill="none" stroke="currentColor" stroke-width="1.15"/>',
  search:
    '<circle cx="6.6" cy="6.6" r="3.8" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M9.6 9.6L13.5 13.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  grid: '<path d="M2 2h12v12H2z M2 6.4h12M2 10.6h12M6.4 2v12M10.6 2v12" fill="none" stroke="currentColor" stroke-width="1"/>',
  target:
    '<circle cx="8" cy="8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 1.2v2.4M8 12.4v2.4M1.2 8h2.4M12.4 8h2.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  cube: '<path d="M8 1.6l5.6 3v6.8L8 14.4l-5.6-3V4.6L8 1.6z" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M2.4 4.6L8 7.6l5.6-3M8 7.6v6.8" fill="none" stroke="currentColor" stroke-width="1.05"/>',
  child:
    '<path d="M4.2 2v5.4a2 2 0 0 0 2 2h5.4M9 7l2.6 2.4L9 11.8" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>',
  external:
    '<path d="M4.6 11.4L11.4 4.6M6.6 4.6h4.8v4.8" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>',
} as const;
export type IconName = keyof typeof ICONS;
// For static template strings (trusted, hardcoded content only).
export function iconHtml(name: IconName, extraClass = ""): string {
  return `<svg class="icon ${extraClass}" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}
// For DOM built at runtime, so user-provided text never flows through innerHTML.
export function iconEl(name: IconName, extraClass = ""): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", `icon ${extraClass}`.trim());
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML = ICONS[name];
  return svg;
}
export function textSpan(text: string, className = ""): HTMLSpanElement {
  const span = document.createElement("span");
  if (className) span.className = className;
  span.textContent = text;
  return span;
}
