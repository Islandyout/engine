import { bondOf, hourOf, phrase, type Person, type World } from "../../eden/mind";
import { DAY } from "../../eden/earth";
import { CUSTOM_AT, NORM_TEXT, standing, standingWord, type NormId } from "../../eden/norms";
import type { VoiceConfig } from "./edenVoice";

// Eden's panel: what the Creator sees and touches while the garden runs. Built with the DOM API only (never innerHTML: names, journals and
// the Creator's own words only ever go through textContent, per this repo's house rule). Mounted directly on <body>, a sibling of #app,
// not inside it: style.css's `.player-mode` rule hides header/nav/.dock/footer *inside* #app so an exported standalone player shows a bare
// canvas -- this panel needs to stay visible there, which it only does by living outside that subtree.
//
// Three tabs: Life (what each person is doing, and what has happened), Minds (why they chose what they chose, what they remember, how they
// feel about each other), Creator (words that change the world). A bar above them sets the speed of time and saves the world.

export const SPEEDS = [0, 1, 3, 10, 30, 100] as const;
export const SPEED_LABELS = ["⏸", "1×", "3×", "10×", "30×", "100×"];

export interface PanelHandlers {
  speed(index: number): void;
  save(): void;
  newWorld(): void;
  creator(text: string): void;
  voice(config: VoiceConfig): void;
  voiceTest(): void;
  follow(id: string): void; // the camera goes to this person
  slot(action: "keep" | "return", n: number): void; // keep this moment, or go back to a moment kept
  walk(on: boolean): void; // the Creator walks the world as a hunter, or goes back to watching
}

export interface EdenPanel {
  root: HTMLElement;
  setHeader(text: string): void;
  setSpeed(index: number): void;
  setSaved(text: string): void;
  setSlots(days: (number | undefined)[]): void; // the day each kept moment was from
  lifeStatus(id: string, name: string, text: string): void;
  lifeStatusRemove(id: string): void;
  lifeLog(text: string): void;
  creatorLog(text: string, ok: boolean): void;
  voiceStatus(text: string): void;
  tab(): "life" | "minds" | "chronicle" | "creator";
  renderMinds(world: World): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const CSS = `
  .eden-panel { position: fixed; left: 12px; bottom: 12px; width: 380px; height: min(60vh, 520px); display: flex; flex-direction: column; gap: 6px;
    padding: 10px 12px; border-radius: 10px; background: rgba(18, 16, 14, 0.88); color: #ece4d2; font: 13px/1.4 system-ui, sans-serif;
    z-index: 50; box-shadow: 0 4px 18px rgba(0,0,0,0.35); }
  .eden-panel h3 { margin: 0; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: #c9a24a; }
  .eden-bar, .eden-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
  .eden-panel button { background: rgba(255,255,255,0.1); border: none; border-radius: 6px; color: inherit; font: inherit; padding: 3px 8px; cursor: pointer; }
  .eden-panel button:hover { background: rgba(255,255,255,0.2); }
  .eden-panel button.on { background: #c9a24a; color: #1a1510; font-weight: 600; }
  .eden-saved { margin-left: auto; font-size: 11px; color: #a89d85; align-self: center; }
  .eden-pane { display: none; flex-direction: column; gap: 4px; overflow-y: auto; flex: 1; min-height: 0; }
  .eden-pane.on { display: flex; }
  .eden-status { flex: none; }
  .eden-status b { color: #c9a24a; font-weight: 600; }
  .eden-log { display: flex; flex-direction: column; gap: 2px; color: #cfc6b2; overflow-y: auto; flex: 1; min-height: 60px; }
  .eden-journal { display: flex; flex-direction: column; gap: 2px; color: #cfc6b2; max-height: 24vh; overflow-y: auto; }
  .eden-log > div, .eden-journal > div, .eden-pane > div { white-space: pre-wrap; word-break: break-word; }
  .eden-bars { display: grid; grid-template-columns: 62px 1fr; gap: 2px 8px; align-items: center; }
  .eden-meter { height: 7px; background: rgba(255,255,255,0.12); border-radius: 4px; overflow: hidden; }
  .eden-meter > div { height: 100%; background: #c9a24a; }
  .eden-meter.bad > div { background: #c25b4a; }
  .eden-sub { margin-top: 4px; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #a89d85; }
  .eden-ok { color: #a9cf8a; } .eden-no { color: #e0907c; }
  .eden-panel form { display: flex; gap: 6px; }
  .eden-panel input { flex: 1; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; color: inherit; font: inherit; padding: 5px 8px; }
`;

export function buildEdenPanel(handlers: PanelHandlers, initialVoice: VoiceConfig): EdenPanel {
  const style = el("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = el("div", "eden-panel");
  // Clicks/drags/wheel on the panel must never reach the scene's own camera-orbit/selection input, which listens on window.
  for (const type of ["pointerdown", "mousedown", "wheel", "keydown"]) root.addEventListener(type, (e) => e.stopPropagation());

  const title = el("h3", undefined, "Eden");
  root.appendChild(title);

  // Time and saving
  const bar = el("div", "eden-bar");
  const speedButtons = SPEED_LABELS.map((label, i) => {
    const b = el("button", undefined, label);
    b.title = i === 0 ? "Pause" : `${SPEEDS[i]}× time`;
    b.addEventListener("click", () => handlers.speed(i));
    bar.appendChild(b);
    return b;
  });
  const saveButton = el("button", undefined, "Save");
  saveButton.addEventListener("click", () => handlers.save());
  const newButton = el("button", undefined, "New world");
  let sure = 0;
  newButton.addEventListener("click", () => {
    // Starting again throws the world away: ask twice.
    if (performance.now() - sure < 4000) {
      sure = 0;
      newButton.textContent = "New world";
      handlers.newWorld();
    } else {
      sure = performance.now();
      newButton.textContent = "Sure? Click again";
      setTimeout(() => {
        if (performance.now() - sure >= 4000) newButton.textContent = "New world";
      }, 4100);
    }
  });
  let walking = false;
  const walkButton = el("button", undefined, "Walk the world");
  walkButton.title = "Be a hunter in the world: W A S D move, Shift runs, J strikes, K sweeps, F kicks, X rolls, G looses an arrow";
  walkButton.addEventListener("click", () => {
    walking = !walking;
    walkButton.blur(); // so the keys go to the game, not to this button
    walkButton.textContent = walking ? "Watch from above" : "Walk the world";
    walkButton.classList.toggle("on", walking);
    handlers.walk(walking);
  });
  const saved = el("span", "eden-saved");
  bar.append(saveButton, newButton, walkButton, saved);
  root.appendChild(bar);

  // Tabs
  const tabs = el("div", "eden-tabs");
  const panes: Record<string, HTMLElement> = { life: el("div", "eden-pane"), minds: el("div", "eden-pane"), chronicle: el("div", "eden-pane"), creator: el("div", "eden-pane") };
  const tabButtons: Record<string, HTMLButtonElement> = {};
  let current: "life" | "minds" | "chronicle" | "creator" = "life";
  for (const [key, label] of [["life", "Life"], ["minds", "Minds"], ["chronicle", "Chronicle"], ["creator", "Creator"]] as const) {
    const b = el("button", undefined, label);
    b.addEventListener("click", () => select(key));
    tabButtons[key] = b;
    tabs.appendChild(b);
  }
  function select(key: "life" | "minds" | "chronicle" | "creator") {
    current = key;
    for (const k of Object.keys(panes)) {
      panes[k]!.classList.toggle("on", k === key);
      tabButtons[k]!.classList.toggle("on", k === key);
    }
  }
  root.appendChild(tabs);
  for (const pane of Object.values(panes)) root.appendChild(pane);

  // Life
  const statusBox = el("div", "eden-status");
  const log = el("div", "eden-log");
  panes.life!.append(statusBox, log);
  const statusLines = new Map<string, HTMLElement>();

  // Minds
  let slotsRef: HTMLButtonElement[] = [];
  const mindsView = el("div");
  const chronicleView = el("div");
  panes.chronicle!.appendChild(chronicleView);
  panes.minds!.appendChild(mindsView);
  let selected: string | undefined;

  // Creator
  const help = el("div", undefined, 'Say it in words: "let there be a deer by the river", "rain", "make it winter", "heal Adam", "feed Eve", "move Adam to the overlook", "make Eve bolder", "tell Adam well done".');
  help.style.color = "#a89d85";
  const form = el("form");
  const input = el("input");
  input.type = "text";
  input.placeholder = "Let there be...";
  input.maxLength = 160;
  const go = el("button", undefined, "Do");
  go.type = "submit";
  form.append(input, go);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = "";
    handlers.creator(text);
  });
  const chips = el("div", "eden-bar");
  for (const word of ["Rain", "Clear", "Winter", "Spring", "A deer", "A fruit tree", "Heal both", "Feed both"]) {
    const b = el("button", undefined, word);
    b.addEventListener("click", () => handlers.creator(word));
    chips.appendChild(b);
  }
  // Make a person: name, sex, child or grown, and a tilt of character, sent as the same commands you could type.
  const personBox = el("form", "eden-bar");
  const pName = el("input");
  pName.type = "text";
  pName.maxLength = 20;
  pName.required = true;
  pName.placeholder = "Name";
  pName.setAttribute("aria-label", "New person's name");
  const pKind = el("select");
  for (const [v, label] of [["woman", "Woman"], ["man", "Man"], ["girl", "Girl"], ["boy", "Boy"]]) pKind.append(new Option(label, v));
  const pTrait = el("select");
  pTrait.append(new Option("No tilt", ""));
  for (const t of ["bolder", "shyer", "friendlier", "quieter", "curious", "calmer", "patient", "hasty"]) pTrait.append(new Option(t, t));
  const pGo = el("button", undefined, "Make person");
  pGo.type = "submit";
  personBox.append(pName, pKind, pTrait, pGo);
  personBox.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = pName.value.trim().replace(/[^A-Za-z]/g, "");
    if (!name) return pName.reportValidity();
    handlers.creator(`a ${pKind.value} named ${name}`);
    if (pTrait.value) handlers.creator(`make ${name} ${pTrait.value}`);
    pName.value = "";
  });
  const creatorLines = el("div", "eden-log");
  // The optional free voice: reword their lines using Ollama on this laptop or a free endpoint. Off until switched on; the plain speech always works.
  const voiceBox = el("details");
  voiceBox.appendChild(el("summary", undefined, "Voice (optional, free)"));
  const voiceHelp = el("div", undefined, "Rewords their lines using a free model: Ollama on this laptop (start it with OLLAMA_ORIGINS=*) or any free OpenAI-compatible service. Off by default; the plain speech always works.");
  voiceHelp.style.color = "#a89d85";
  const on = el("input");
  on.type = "checkbox";
  on.checked = initialVoice.enabled;
  const onLabel = el("label");
  onLabel.append(on, document.createTextNode(" Use the voice"));
  const planOn = el("input");
  planOn.type = "checkbox";
  planOn.checked = initialVoice.plan === true;
  const planLabel = el("label");
  planLabel.append(planOn, document.createTextNode(" Let it help people plan (slow on a laptop; every plan is checked against the map and the clock first)"));
  const urlInput = el("input");
  urlInput.type = "text";
  urlInput.value = initialVoice.url;
  urlInput.placeholder = "Endpoint";
  const modelInput = el("input");
  modelInput.type = "text";
  modelInput.value = initialVoice.model;
  modelInput.placeholder = "Model";
  const keyInput = el("input");
  keyInput.type = "password";
  keyInput.value = initialVoice.key;
  keyInput.placeholder = "Key (only if the service needs one; kept in this browser)";
  const voiceStatus = el("div", undefined, "");
  const apply = () => handlers.voice({ enabled: on.checked, url: urlInput.value.trim(), model: modelInput.value.trim(), key: keyInput.value.trim(), plan: planOn.checked });
  const voiceButtons = el("div", "eden-bar");
  const voiceSave = el("button", undefined, "Save");
  voiceSave.addEventListener("click", apply);
  const voiceTest = el("button", undefined, "Test");
  voiceTest.addEventListener("click", () => {
    apply();
    handlers.voiceTest();
  });
  voiceButtons.append(voiceSave, voiceTest);
  voiceBox.append(voiceHelp, onLabel, planLabel, urlInput, modelInput, keyInput, voiceButtons, voiceStatus);
  // What if: keep the world as it is now, try something, and go back. Three places to keep.
  const slotBox = el("div", "eden-bar");
  slotBox.appendChild(el("span", undefined, "What if:"));
  const slotButtons: HTMLButtonElement[] = [];
  for (let n = 1; n <= 3; n++) {
    const keep = el("button", undefined, `Keep ${n}`);
    keep.title = "Keep the world as it is now";
    keep.addEventListener("click", () => handlers.slot("keep", n));
    const back = el("button", undefined, `Back to ${n}`);
    back.title = "Go back to the moment kept here (what has happened since is lost)";
    back.disabled = true;
    back.addEventListener("click", () => handlers.slot("return", n));
    slotButtons.push(back);
    slotBox.append(keep, back);
  }
  panes.creator!.append(help, form, chips, personBox, slotBox, creatorLines, voiceBox);
  slotsRef = slotButtons;

  document.body.appendChild(root);
  select("life");

  function addLine(box: HTMLElement, text: string, className?: string, keep = 60) {
    const line = el("div", className, text);
    box.appendChild(line);
    while (box.children.length > keep) box.removeChild(box.firstChild!);
    box.scrollTop = box.scrollHeight;
  }

  function meter(label: string, value: number, bad: boolean, box: HTMLElement) {
    box.appendChild(el("span", undefined, label));
    const m = el("div", bad ? "eden-meter bad" : "eden-meter");
    const fill = el("div");
    fill.style.width = `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
    m.appendChild(fill);
    box.appendChild(m);
  }

  const clockText = (t: number) => {
    const days = Math.floor(t / DAY);
    const h = hourOf(t);
    return `day ${days + 1}, ${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;
  };

  return {
    root,
    setHeader: (text) => (title.textContent = text),
    setSpeed: (index) => speedButtons.forEach((b, i) => b.classList.toggle("on", i === index)),
    setSaved: (text) => (saved.textContent = text),
    setSlots(days) {
      slotsRef.forEach((b, i) => {
        const day = days[i];
        b.disabled = day === undefined;
        b.textContent = day === undefined ? `Back to ${i + 1}` : `Back to ${i + 1} (day ${day})`;
      });
    },
    lifeStatus(id, name, text) {
      let line = statusLines.get(id);
      if (!line) {
        line = el("div");
        statusLines.set(id, line);
        statusBox.appendChild(line);
      }
      line.replaceChildren();
      const who = el("b", undefined, name);
      who.title = "Watch them";
      who.style.cursor = "pointer";
      who.addEventListener("click", () => handlers.follow(id));
      line.append(who, document.createTextNode(` ${text}`));
    },
    lifeStatusRemove(id) {
      statusLines.get(id)?.remove();
      statusLines.delete(id);
    },
    lifeLog: (text) => addLine(log, text),
    creatorLog: (text, ok) => addLine(creatorLines, text, ok ? "eden-ok" : "eden-no", 30),
    voiceStatus: (text) => (voiceStatus.textContent = text),
    tab: () => current,
    renderMinds(world) {
      chronicleView.replaceChildren();
      // Who is to whom: friends in green, those at odds in red, partners in gold; thicker where there is more trust.
      if (world.people.length > 1) {
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "-120 -95 240 190");
        svg.setAttribute("width", "100%");
        const at = (i: number) => ({ x: 70 * Math.cos((i / world.people.length) * Math.PI * 2 - Math.PI / 2), y: 62 * Math.sin((i / world.people.length) * Math.PI * 2 - Math.PI / 2) });
        world.people.forEach((a, i) => {
          world.people.forEach((b, j) => {
            if (j <= i) return;
            const ab = a.relations.get(b.id);
            const ba = b.relations.get(a.id);
            if (!ab || !ba) return;
            const mean = (ab.affinity + ba.affinity) / 2;
            const line = document.createElementNS(NS, "line");
            line.setAttribute("x1", String(at(i).x));
            line.setAttribute("y1", String(at(i).y));
            line.setAttribute("x2", String(at(j).x));
            line.setAttribute("y2", String(at(j).y));
            line.setAttribute("stroke", bondOf(a, b) === "partner" ? "#e0b050" : mean > 0.5 ? "#5fe08a" : mean > 0.1 ? "#8fb89a" : mean > -0.2 ? "#777" : "#e06060");
            line.setAttribute("stroke-width", String(0.6 + 3 * ((ab.trust + ba.trust) / 2)));
            svg.appendChild(line);
          });
        });
        world.people.forEach((p, i) => {
          const c = document.createElementNS(NS, "circle");
          c.setAttribute("cx", String(at(i).x));
          c.setAttribute("cy", String(at(i).y));
          c.setAttribute("r", String(p.age < 4 ? 5 : 8));
          c.setAttribute("fill", p.sex === "f" ? "#c98ab8" : "#7aa6d6");
          svg.appendChild(c);
          const t = document.createElementNS(NS, "text");
          t.setAttribute("x", String(at(i).x));
          t.setAttribute("y", String(at(i).y + 20));
          t.setAttribute("text-anchor", "middle");
          t.setAttribute("font-size", "9");
          t.setAttribute("fill", "#e8e0cf");
          t.textContent = p.name;
          svg.appendChild(t);
        });
        chronicleView.appendChild(el("div", "eden-sub", "Who they are to one another"));
        chronicleView.appendChild(svg);
      }
      const events = world.chronicle ?? [];
      chronicleView.appendChild(el("div", "eden-sub", events.length ? `What has happened (${events.length})` : "Nothing of note has happened yet."));
      for (const e of [...events].reverse().slice(0, 120)) chronicleView.appendChild(el("div", undefined, `${clockText(e.t)} · ${e.text}`));
      mindsView.replaceChildren();
      if (!world.people.length) return;
      if (!selected || !world.people.some((p) => p.id === selected)) selected = world.people[0]!.id;
      const who = el("div", "eden-bar");
      for (const p of world.people) {
        const b = el("button", p.id === selected ? "on" : undefined, p.name);
        b.addEventListener("click", () => {
          selected = p.id;
          this.renderMinds(world);
        });
        who.appendChild(b);
      }
      mindsView.appendChild(who);
      const p: Person = world.people.find((q) => q.id === selected)!;
      mindsView.appendChild(el("div", undefined, `${p.name}, ${p.sex === "f" ? "woman" : "man"}, ${p.age.toFixed(1)} years · health ${Math.round(p.health * 100)}%`));

      mindsView.appendChild(el("div", "eden-sub", "How they are"));
      const bars = el("div", "eden-bars");
      meter("hunger", p.needs.hunger, p.needs.hunger > 0.8, bars);
      meter("thirst", p.needs.thirst, p.needs.thirst > 0.8, bars);
      meter("tired", p.needs.energy, p.needs.energy > 0.85, bars);
      meter("lonely", p.needs.social, p.needs.social > 0.85, bars);
      meter("bored", p.needs.joy, false, bars);
      meter("cold", p.cold, p.cold > 0.7, bars);
      meter("mood", (p.mood + 1) / 2, p.mood < -0.3, bars);
      mindsView.appendChild(bars);
      {
        const everyone = [...world.people, ...(world.dead ?? []).map((d) => d.person)];
        const nameOf = (id?: string) => everyone.find((q) => q.id === id)?.name;
        const kin = [
          nameOf(p.mother) ? `mother ${nameOf(p.mother)}` : "",
          nameOf(p.father) ? `father ${nameOf(p.father)}` : "",
          ...everyone.filter((q) => q.mother === p.id || q.father === p.id).map((q) => `child ${q.name}`),
          ...world.people.filter((q) => q !== p && bondOf(p, q) === "partner").map((q) => `partner ${q.name}`),
        ].filter(Boolean);
        if (kin.length) mindsView.appendChild(el("div", undefined, `Family: ${kin.join(", ")}`));
      }
      if (p.illness) mindsView.appendChild(el("div", undefined, `Ill (${Math.round(p.illness.severity * 100)}%)`));
      if (p.wound) mindsView.appendChild(el("div", undefined, `Wounded (${Math.round(p.wound * 100)}%)`));
      if ((p.clothing ?? 0) > 0.1) mindsView.appendChild(el("div", undefined, `Wearing a cloak (${Math.round((p.clothing ?? 0) * 100)}%)`));
      if (p.pregnant) mindsView.appendChild(el("div", undefined, "Carrying a child."));
      if (p.story) mindsView.appendChild(el("div", undefined, p.story));
      mindsView.appendChild(el("div", undefined, `Standing among the others: ${standingWord(standing(world, p))}`));
      for (const [id, n] of Object.entries(world.norms ?? {})) if (n.strength >= CUSTOM_AT) mindsView.appendChild(el("div", undefined, `Custom: ${NORM_TEXT[id as NormId]}`));
      if (p.role) mindsView.appendChild(el("div", undefined, `Known as the ${p.role}.`));
      const good = Object.entries(p.skills ?? {}).filter(([, v]) => v > 0.1).sort((x, y) => y[1] - x[1]);
      if (good.length) mindsView.appendChild(el("div", undefined, `Skills: ${good.map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(", ")}`));
      const care = Object.entries(p.values ?? {}).filter(([, v]) => v > 0.65).map(([k]) => k);
      if (care.length) mindsView.appendChild(el("div", undefined, `Cares about: ${care.join(", ")}`));
      const feelings = Object.entries(p.emotions ?? {}).filter(([, v]) => (v ?? 0) > 0.1).sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0));
      if ((p.grief ?? 0) > 0.1) feelings.unshift(["grief", p.grief ?? 0]);
      if (feelings.length) mindsView.appendChild(el("div", undefined, `Feeling: ${feelings.map(([k, v]) => `${k} ${Math.round((v ?? 0) * 100)}%`).join(", ")}`));
      if (p.carry.wood || p.carry.food) mindsView.appendChild(el("div", undefined, `Carrying ${p.carry.wood} wood, ${p.carry.food} food.`));

      if (p.plan) mindsView.appendChild(el("div", undefined, `Plan: ${p.plan.goal} (${Math.min(p.plan.stepAt + 1, p.plan.steps.length)}/${p.plan.steps.length}: ${p.plan.steps[Math.min(p.plan.stepAt, p.plan.steps.length - 1)]?.label ?? ""}). ${p.plan.why}`));
      if (p.goals.length) {
        mindsView.appendChild(el("div", "eden-sub", "What they want to do"));
        for (const g of p.goals) mindsView.appendChild(el("div", undefined, `${g.kind}${g.target ? ` (${g.target})` : ""} · ${Math.round(g.progress * 100)}%`));
      }

      mindsView.appendChild(el("div", "eden-sub", "What they weighed"));
      for (const c of p.lastChoice) {
        const target = c.target ? (world.things.find((t) => t.id === c.target) ? phrase(world.things.find((t) => t.id === c.target)) : (world.people.find((q) => q.id === c.target)?.name ?? c.target)) : "";
        mindsView.appendChild(el("div", undefined, `${c.chosen ? "▶" : "·"} ${c.kind}${target ? ` ${target}` : ""}  ${c.score.toFixed(2)}`));
      }

      if (p.relations.size) {
        mindsView.appendChild(el("div", "eden-sub", "How they feel about others"));
        for (const [id, r] of p.relations) {
          const other = world.people.find((q) => q.id === id)?.name ?? id;
          mindsView.appendChild(el("div", undefined, `${other}: ${r.affinity > 0.5 ? "fond" : r.affinity > 0.1 ? "friendly" : r.affinity > -0.2 ? "neutral" : "cool"} (${r.affinity.toFixed(2)}), trust ${Math.round(r.trust * 100)}%, familiarity ${Math.round(r.familiarity * 100)}%`));
        }
      }

      const thoughts = Object.entries(p.beliefs ?? {}).flatMap(([id, tags]) => tags.map((t) => `${world.people.find((q) => q.id === id)?.name ?? id} is ${t === "quarrelsome" ? "quick to anger" : t}`));
      if (thoughts.length || p.lessons) {
        mindsView.appendChild(el("div", "eden-sub", "What they have come to believe"));
        for (const t of thoughts) mindsView.appendChild(el("div", undefined, t));
        if (p.lessons?.prepare) mindsView.appendChild(el("div", undefined, `Prepare early for winter (${Math.round(p.lessons.prepare * 100)}%)`));
        if (p.lessons?.careful) mindsView.appendChild(el("div", undefined, `Keep away from danger (${Math.round(p.lessons.careful * 100)}%)`));
      }

      const places = [...p.memory.entries()]
        .map(([id, m]) => ({ id, m, thing: world.things.find((t) => t.id === id) }))
        .filter((x) => x.thing)
        .sort((a, b) => Math.abs(b.m.feeling) - Math.abs(a.m.feeling))
        .slice(0, 6);
      if (places.length) {
        mindsView.appendChild(el("div", "eden-sub", "What they remember of the world"));
        for (const x of places) mindsView.appendChild(el("div", undefined, `${phrase(x.thing)}${world.names?.[x.id] ? ` (${world.names[x.id]!.name})` : ""}: ${x.m.feeling > 0.3 ? "likes" : x.m.feeling < -0.3 ? "dreads" : "no strong feeling"} (${x.m.feeling.toFixed(2)}), been ${x.m.visits}×`));
      }

      const big = p.journal.filter((j) => (j.w ?? 0) >= 0.6 && !/^Talked with| said: | told me: /.test(j.text)).slice(-12);
      if (big.length) {
        mindsView.appendChild(el("div", "eden-sub", "The big moments of their life"));
        for (const j of big) mindsView.appendChild(el("div", undefined, `${clockText(j.t)} · ${j.text}`));
      }
      mindsView.appendChild(el("div", "eden-sub", "Their journal"));
      const journal = el("div", "eden-journal");
      for (const j of p.journal.slice(-14)) journal.appendChild(el("div", undefined, `${clockText(j.t)} · ${j.text}`));
      mindsView.appendChild(journal);
      journal.scrollTop = journal.scrollHeight;
    },
  };
}
