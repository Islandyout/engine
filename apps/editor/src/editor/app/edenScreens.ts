// The Walker's own screens: a map (M), a journal (L) and a pack with who knows you (I), and the first-time tutorial. They are plain DOM built
// with textContent, closed by the same key or Esc, and they stop the keys typed in them from reaching the game.
import type { Person, Thing, World } from "../../eden/mind";
import { EDEN_PLACES } from "../../eden/places";
import { DISCOVERIES, QUESTIONS } from "../../eden/culture";

export interface ScreensData {
  world: World;
  you?: { x: number; z: number };
  pack: { meat: number; water: number; wood: number; fruit: number };
  notes: string[]; // what you have done, newest last
}

export interface Screens {
  open(tab?: "map" | "journal" | "pack"): void;
  close(): void;
  isOpen(): boolean;
  toggle(tab: "map" | "journal" | "pack"): void;
  refresh(data: ScreensData): void;
  tutorial(force?: boolean): void;
}

const CSS = `
  .eden-screens { position: fixed; right: 12px; top: 12px; width: min(420px, calc(100vw - 24px)); max-height: calc(100vh - 24px); z-index: 62; display: none; flex-direction: column; gap: 6px;
    padding: 10px 12px; border-radius: 10px; background: rgba(18, 16, 14, 0.94); color: #ece4d2; font: 13px/1.45 system-ui, sans-serif; box-shadow: 0 4px 22px rgba(0,0,0,0.5); }
  .eden-screens.open { display: flex; }
  .eden-screens .tabs { display: flex; gap: 4px; }
  .eden-screens button { background: rgba(255,255,255,0.1); border: none; border-radius: 6px; color: inherit; font: inherit; padding: 3px 9px; cursor: pointer; }
  .eden-screens button.on { background: #c9a24a; color: #1a1510; font-weight: 600; }
  .eden-screens .body { overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
  .eden-screens canvas { width: 100%; aspect-ratio: 1; border-radius: 8px; background: #1d2418; }
  .eden-screens h4 { margin: 6px 0 2px; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #c9a24a; }
  .eden-screens .dim { color: #a89d85; }
  .eden-screens .row { display: flex; justify-content: space-between; gap: 8px; }
  .eden-screens .bar { height: 6px; background: rgba(255,255,255,0.14); border-radius: 3px; overflow: hidden; flex: 1; align-self: center; }
  .eden-screens .bar > div { height: 100%; background: #c9a24a; }
  .eden-tutorial { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(520px, calc(100vw - 24px)); z-index: 70; display: none; flex-direction: column; gap: 8px;
    padding: 16px 18px; border-radius: 12px; background: rgba(18, 16, 14, 0.96); color: #ece4d2; font: 14px/1.5 system-ui, sans-serif; box-shadow: 0 8px 36px rgba(0,0,0,0.6); }
  .eden-tutorial.open { display: flex; }
  .eden-tutorial h3 { margin: 0; color: #c9a24a; letter-spacing: 0.06em; text-transform: uppercase; font-size: 13px; }
  .eden-tutorial kbd { background: rgba(255,255,255,0.14); border-radius: 4px; padding: 0 6px; font: 600 12px ui-monospace, monospace; color: #c9a24a; }
  .eden-tutorial button { align-self: flex-end; background: #c9a24a; border: none; border-radius: 6px; color: #1a1510; font: 600 13px system-ui; padding: 5px 14px; cursor: pointer; }
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
};

const THING_COLOUR: Record<string, string> = { river: "#4a7fb0", lake: "#3f6f9f", barrel: "#6f5a3a", shelter: "#b58b4a", campfire: "#e0732e", grave: "#8a8a8a", shrine: "#d9c27a", tree: "#3f6b34", grove: "#4f8a3c", bush: "#5a8a3a", wolf: "#c25b4a", fox: "#c27a3a" };
const KEY = "eden-tutorial-seen";

export function createScreens(): Screens {
  const style = el("style");
  style.textContent = CSS;
  document.head.append(style);
  const root = el("div", "eden-screens");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Your map, journal and pack");
  const tabs = el("div", "tabs");
  const body = el("div", "body");
  const canvas = el("canvas");
  canvas.width = 420;
  canvas.height = 420;
  root.append(tabs, body);
  document.body.append(root);
  for (const type of ["keydown", "keyup", "keypress", "pointerdown", "wheel"] as const) root.addEventListener(type, (e) => e.stopPropagation());

  let tab: "map" | "journal" | "pack" = "map";
  let latest: ScreensData | undefined;
  let open = false;
  const buttons = new Map<string, HTMLButtonElement>();
  for (const [key, label] of [["map", "Map (M)"], ["journal", "Journal (L)"], ["pack", "Pack (I)"]] as const) {
    const b = el("button", undefined, label);
    b.addEventListener("click", () => select(key));
    buttons.set(key, b);
    tabs.append(b);
  }
  const close = el("button", undefined, "Close");
  close.style.marginLeft = "auto";
  close.addEventListener("click", () => hide());
  tabs.append(close);

  function select(key: "map" | "journal" | "pack") {
    tab = key;
    for (const [k, b] of buttons) b.classList.toggle("on", k === key);
    render();
  }
  function hide() {
    open = false;
    root.classList.remove("open");
  }

  function drawMap(data: ScreensData) {
    const g = canvas.getContext("2d");
    if (!g) return;
    const R = (data.world.radius ?? 190) * 1.05;
    const S = canvas.width;
    const px = (x: number) => S / 2 + (x / R) * (S / 2);
    const pz = (z: number) => S / 2 + (z / R) * (S / 2);
    g.clearRect(0, 0, S, S);
    g.fillStyle = "#26301f";
    g.fillRect(0, 0, S, S);
    g.strokeStyle = "rgba(255,255,255,0.07)";
    for (let i = 1; i < 8; i++) {
      g.beginPath();
      g.moveTo((S * i) / 8, 0);
      g.lineTo((S * i) / 8, S);
      g.moveTo(0, (S * i) / 8);
      g.lineTo(S, (S * i) / 8);
      g.stroke();
    }
    // The places, by name.
    g.font = "11px system-ui";
    g.textAlign = "center";
    for (const place of Object.values(EDEN_PLACES)) {
      g.fillStyle = "rgba(201,162,74,0.16)";
      g.beginPath();
      g.arc(px(place.x), pz(place.z), Math.max(6, (place.radius / R) * (S / 2)), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(236,228,210,0.75)";
      g.fillText(place.name.replace(/^the /, ""), px(place.x), pz(place.z) + 3);
    }
    for (const t of data.world.things as Thing[]) {
      const colour = THING_COLOUR[t.kind];
      if (!colour) continue;
      g.fillStyle = colour;
      g.fillRect(px(t.x) - 2, pz(t.z) - 2, 4, 4);
    }
    // Creatures, small.
    g.fillStyle = "#cfc6b2";
    for (const t of data.world.things as Thing[]) if (t.mob) g.fillRect(px(t.x) - 1, pz(t.z) - 1, 2, 2);
    // The people.
    g.textAlign = "left";
    for (const p of data.world.people as Person[]) {
      g.fillStyle = p.stranger ? "#d9a0e0" : p.age < 4 ? "#f0e0a0" : "#f4ede0";
      g.beginPath();
      g.arc(px(p.x), pz(p.z), 3.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(244,237,224,0.9)";
      g.fillText(p.name, px(p.x) + 5, pz(p.z) + 3);
    }
    if (data.you) {
      g.fillStyle = "#5fb4ff";
      g.beginPath();
      g.moveTo(px(data.you.x), pz(data.you.z) - 6);
      g.lineTo(px(data.you.x) + 5, pz(data.you.z) + 4);
      g.lineTo(px(data.you.x) - 5, pz(data.you.z) + 4);
      g.closePath();
      g.fill();
      g.fillStyle = "#5fb4ff";
      g.fillText("you", px(data.you.x) + 7, pz(data.you.z) + 3);
    }
  }

  function render() {
    body.replaceChildren();
    if (!latest) return;
    const data = latest;
    if (tab === "map") {
      body.append(canvas, el("div", "dim", "North is up, east to the right. Blue is you, pale dots are people, small grey ones are animals; red is danger."));
      drawMap(data);
    } else if (tab === "journal") {
      body.append(el("h4", undefined, "What you have done"));
      if (!data.notes.length) body.append(el("div", "dim", "Nothing yet. Talk to someone (E), help them (H), gather (Q), hunt."));
      for (const n of data.notes.slice(-25)) body.append(el("div", undefined, n));
      body.append(el("h4", undefined, "What the people know"));
      const knowledge = Object.entries(data.world.knowledge ?? {});
      if (!knowledge.length) body.append(el("div", "dim", "Nothing worked out yet. Thinking people count, keep seed, read the stars."));
      for (const [id, k] of knowledge) body.append(el("div", undefined, `${DISCOVERIES.find((d) => d.id === id)?.name ?? id}: found by ${k.byName}`));
      body.append(el("h4", undefined, "What they believe"));
      const tenets = data.world.tenets ?? [];
      if (!tenets.length) body.append(el("div", "dim", "No one has settled on an answer yet."));
      for (const t of tenets) {
        const followers = (data.world.people as Person[]).filter((p) => p.faith?.[t.question] === t.id).map((p) => p.name);
        body.append(el("div", undefined, `${QUESTIONS.find((q) => q.id === t.question)?.asked ?? t.question} "${t.text}" (${followers.length ? followers.join(", ") : "no one now"})`));
      }
      body.append(el("h4", undefined, "What they have made"));
      const works = (data.world.works ?? []).filter((w) => w.quality > 0.5 || w.kind === "book").slice(-12);
      if (!works.length) body.append(el("div", "dim", "No songs, stories, paintings or books yet."));
      for (const w of works) body.append(el("div", undefined, `${w.title} (${w.kind}, ${w.byName})`));
      body.append(el("h4", undefined, "What has happened in the land"));
      const chronicle = data.world.chronicle ?? [];
      if (!chronicle.length) body.append(el("div", "dim", "Nothing has been written yet."));
      for (const c of chronicle.slice(-25)) body.append(el("div", undefined, c.text));
    } else {
      body.append(el("h4", undefined, "You carry"));
      const items = Object.entries(data.pack).filter(([, n]) => n > 0);
      if (!items.length) body.append(el("div", "dim", "Nothing. Q gathers water at the river, wood where it lies, fruit at the grove; a kill gives meat."));
      for (const [k, n] of items) {
        const row = el("div", "row");
        row.append(el("span", undefined, k), el("span", undefined, String(n)));
        body.append(row);
      }
      body.append(el("h4", undefined, "Who knows you"));
      const known = (data.world.people as Person[]).filter((p) => (p.walkerTrust ?? 0) > 0 || p.walkerFacts?.name).sort((a, b) => (b.walkerTrust ?? 0) - (a.walkerTrust ?? 0));
      if (!known.length) body.append(el("div", "dim", "No one yet. Press E beside someone."));
      for (const p of known) {
        const row = el("div", "row");
        row.append(el("span", undefined, `${p.name}${p.walkerFacts?.name ? ` (knows you as ${p.walkerFacts.name})` : ""}${p.asks ? ` · asks for ${p.asks.item}` : ""}${p.errand ? " · on an errand" : ""}`));
        const bar = el("div", "bar");
        const fill = el("div");
        fill.style.width = `${Math.round(100 * (p.walkerTrust ?? 0))}%`;
        bar.append(fill);
        row.append(bar);
        body.append(row);
      }
    }
  }

  const tut = el("div", "eden-tutorial");
  tut.setAttribute("role", "dialog");
  tut.setAttribute("aria-label", "How to walk the world");
  tut.append(el("h3", undefined, "Walking the world"));
  const lines: [string, string][] = [
    ["W A S D", "walk (hold Shift to run, Space to jump)"],
    ["J K F X", "spear strike, sweep, kick, roll (R guards, G looses an arrow)"],
    ["E", "talk to someone beside you; type, or use the buttons. Try \"bring me water\", \"follow me\", \"my name is...\""],
    ["Q", "gather water, wood or fruit where it is; kills give meat"],
    ["H", "hand what someone asks for, or needs most, to the nearest person"],
    ["M  L  I", "map, journal, pack"],
    ["N", "sound on and off"],
  ];
  for (const [k, text] of lines) {
    const p = el("div");
    p.append(el("kbd", undefined, k), document.createTextNode(`  ${text}`));
    tut.append(p);
  }
  tut.append(el("div", "dim", "People have lives of their own: they get hungry, quarrel, make up, and some will ask you for help. A pad works too: the d-pad is E, H, Q and the map."));
  const ok = el("button", undefined, "Got it");
  ok.addEventListener("click", () => tut.classList.remove("open"));
  tut.append(ok);
  for (const type of ["keydown", "keyup", "pointerdown"] as const) tut.addEventListener(type, (e) => e.stopPropagation());
  document.body.append(tut);

  return {
    isOpen: () => open,
    open(key) {
      open = true;
      root.classList.add("open");
      select(key ?? tab);
    },
    close: hide,
    toggle(key) {
      if (open && tab === key) hide();
      else this.open(key);
    },
    refresh(data) {
      latest = data;
      if (open) render();
    },
    tutorial(force) {
      let seen = false;
      try {
        seen = localStorage.getItem(KEY) === "1";
      } catch {
        /* not remembered */
      }
      if (seen && !force) return;
      tut.classList.add("open");
      ok.focus();
      try {
        localStorage.setItem(KEY, "1");
      } catch {
        /* not remembered */
      }
    },
  };
}
