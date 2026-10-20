// UI kit widgets for action RPGs: the pieces the older kit lacked. Each is drawn in the six styles through
// the same Paint toolkit as the rest of the kit (see uiKit.ts), so a scene never mixes looks.
//
//   Skill bar         keyed ability slots with cooldown sweeps (Genshin, Ghost of Tsushima, Elden Ring's quick items)
//   Resource bar      a labelled bar a script feeds: qi, focus, rage, stamina (Sekiro's posture, Hades' magick)
//   Status effects    buff and debuff chips with timers (Elden Ring, Monster Hunter)
//   Target frame      the locked enemy: name, health with a damage trail, poise (Sekiro, Dark Souls, Witcher)
//   Damage direction  an arc towards whatever just hit you (Call of Duty, Ghost of Tsushima)
//   Death screen      a fade, a title and a way back (YOU DIED, Hades, Dark Souls)
//   Character sheet   a panel of stats and progress bars (Skyrim, Witcher, Diablo)
//   Quest log         the journal: active, finished and waiting goals (Witcher, Skyrim, Genshin)
//   Skill tree        passive perks bought with points, linked by what they need (Path of Exile, Skyrim, Elden Ring)
//
// Script-fed widgets take their data from the UI text (and value) that a script sets with ui.set_text and
// ui.set_value; the format is in docs/UI_KIT.md.
import { registerDraw } from "./uiDraws";
import { ITEM_TINT, iconNames, lootIcon, roundRect } from "./uiKit";
import { rarityColors } from "./lootView";
import type { Draw, IconName, Paint, UIData, UIHit } from "./uiKit";
import type { UIRect } from "./uiLayout";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
// An accent that is not plain white (Minimal's), so a highlight still reads.
const accentOf = (p: Paint, fallback = "#ffd54a") => (p.k.accent === "#ffffff" ? fallback : p.k.accent);

// Menus sit over the world and hold a lot of text, so a quiet skin's see-through plate gets a dark backing.
function backing(p: Paint, x: number, y: number, w: number, h: number) {
  if (p.k.frame !== "soft") return;
  p.shape(x, y, w, h);
  p.ctx.fillStyle = "rgba(8, 10, 16, 0.78)";
  p.ctx.fill();
}

// ---- Skill bar ----

const skillIcons: IconName[] = ["star", "arrow", "sword", "gem"];
const sampleSkills = (time: number): NonNullable<UIData["skills"]> => [
  { key: "1", state: 0 },
  { key: "2", state: 0.55 + 0.4 * Math.sin(time) * 0.5 },
  { key: "3", state: -3 },
  { key: "4", state: -2 },
];

const skillBar: Draw = (p, r, d, o) => {
  const { ctx: c, k, s } = p;
  const slots = (o.preview ? sampleSkills(d.time) : d.skills ?? []).filter((slot) => slot.state !== -1);
  if (!slots.length) return;
  const gap = 8 * s;
  const cap = 15 * s; // room for the key cap under each slot
  const size = Math.min(r.height - cap, (r.width - gap * (slots.length - 1)) / slots.length);
  const total = slots.length * size + (slots.length - 1) * gap;
  const x0 = r.left + (r.width - total) / 2;
  const gold = accentOf(p);
  slots.forEach((slot, i) => {
    const x = x0 + i * (size + gap);
    const y = r.top;
    const ready = slot.state === 0;
    const locked = slot.state === -2;
    const short = slot.state === -3;
    const last = i === slots.length - 1 && slots.length >= 4; // the ultimate
    // The plate: lit while ready, dark otherwise.
    c.beginPath();
    if (k.frame === "bubble" || k.frame === "soft") roundRect(c, x, y, size, size, 8 * s);
    else p.shape(x, y, size, size);
    c.fillStyle = ready ? (k.frame === "bubble" ? "rgba(74, 132, 255, 0.95)" : k.panelHi) : k.panel;
    c.fill();
    c.lineWidth = (ready ? 2 : 1) * s;
    c.strokeStyle = ready ? (last ? gold : k.accent === "#ffffff" ? k.text : k.accent) : k.edge === "rgba(255, 255, 255, 0)" ? "rgba(255,255,255,0.25)" : k.edge;
    c.stroke();
    // The glyph.
    const tint = locked ? k.dim : short ? k.danger : ready ? (last ? gold : k.text) : k.dim;
    p.icon(locked ? "lock" : (skillIcons[i % skillIcons.length] ?? "star"), x + size / 2, y + size / 2, size * 0.5, tint);
    // The cooldown sweeping away clockwise, with its seconds-ish remainder.
    if (slot.state > 0) {
      c.save();
      c.beginPath();
      if (k.frame === "bubble" || k.frame === "soft") roundRect(c, x, y, size, size, 8 * s);
      else p.shape(x, y, size, size);
      c.clip();
      c.fillStyle = "rgba(0, 0, 0, 0.58)";
      c.beginPath();
      c.moveTo(x + size / 2, y + size / 2);
      c.arc(x + size / 2, y + size / 2, size, -Math.PI / 2, -Math.PI / 2 + clamp01(slot.state) * Math.PI * 2);
      c.closePath();
      c.fill();
      c.restore();
    }
    // The key cap.
    const label = slot.key;
    const w = Math.max(14 * s, p.measure(label, 10, { raw: true }) + 10 * s);
    const kx = x + size / 2 - w / 2;
    const ky = y + size + 3 * s;
    c.beginPath();
    roundRect(c, kx, ky, w, 12 * s, 3 * s);
    c.fillStyle = "rgba(0, 0, 0, 0.7)";
    c.fill();
    c.lineWidth = s;
    c.strokeStyle = ready ? (k.accent === "#ffffff" ? k.text : k.accent) : "rgba(255,255,255,0.28)";
    c.stroke();
    p.text(label, x + size / 2, ky + 6.5 * s, 10, { align: "center", raw: true, weight: 800, color: ready ? k.text : k.dim, plain: true });
  });
};

// ---- Resource bar ----

// Text: "Qi", then a readout such as "120 / 500", then an optional #rrggbb colour. Value: 0 to 1.
const resourceBar: Draw = (p, r, d, o) => {
  const { k, s } = p;
  const [label = "", readout = "", tint = ""] = o.text.split("\n");
  if (!label && !readout) return;
  const value = o.preview ? o.value || 0.6 : o.value;
  const color = /^#[0-9a-f]{6}$/i.test(tint.trim()) ? tint.trim() : k.accent === "#ffffff" ? k.shield : k.stamina === "#ffffff" ? k.shield : k.stamina;
  const { left: x, top: y, width: w, height: h } = r;
  const barH = Math.max(6 * s, h * 0.24);
  const barY = y + h - barH - 2 * s;
  p.text(label, x + (k.frame === "slant" ? 8 * s : 0), y + (h - barH) * 0.5, 13, { weight: 800, raw: k.frame === "ornate" || k.frame === "soft" });
  if (readout) p.text(readout, x + w, y + (h - barH) * 0.5, 12, { align: "right", raw: true, color: k.dim });
  if (k.frame === "bracket") p.brackets(x - 4 * s, barY - 4 * s, w + 8 * s, barH + 8 * s, k.edge);
  p.bar(x, barY, w, barH, value, color, { segments: k.frame === "chamfer" ? 24 : 0 });
};

// ---- Status effects ----

interface Status {
  name: string;
  seconds: number;
  kind: "good" | "bad" | "neutral";
  total: number;
}
function parseStatus(text: string): Status[] {
  const out: Status[] = [];
  for (const line of text.split("\n")) {
    const [name = "", seconds = "", kind = "neutral", total = ""] = line.split("|").map((part) => part.trim());
    if (!name) continue;
    out.push({ name, seconds: Number(seconds) || 0, kind: kind === "good" || kind === "bad" ? kind : "neutral", total: Number(total) || 0 });
  }
  return out;
}

// Text: one effect a line, "Name|seconds|good or bad|total seconds" (seconds 0: no timer). Listed top down.
const statusEffects: Draw = (p, r, d, o) => {
  const { ctx: c, k, s } = p;
  const effects = parseStatus(o.preview ? o.text || "Burning|4|bad|6\nQi shield|12|good|20\nWounded|0|bad" : o.text);
  if (!effects.length) return;
  const rowH = 24 * s;
  const gap = 5 * s;
  const good = k.stamina === "#ffffff" ? "#7fe0d4" : k.stamina;
  effects.slice(0, Math.max(1, Math.floor((r.height + gap) / (rowH + gap)))).forEach((e, i) => {
    const y = r.top + i * (rowH + gap);
    const color = e.kind === "bad" ? k.danger : e.kind === "good" ? good : k.dim;
    const label = e.seconds > 0 ? `${Math.ceil(e.seconds)}s` : "";
    const w = Math.min(r.width, rowH + 10 * s + p.measure(e.name, 12, { raw: true }) + (label ? p.measure(label, 11, { raw: true }) + 14 * s : 6 * s));
    p.panel(r.left, y, w, rowH);
    p.icon(e.kind === "bad" ? "skull" : e.kind === "good" ? "star" : "gem", r.left + rowH * 0.62, y + rowH / 2, rowH * 0.5, color);
    p.text(e.name, r.left + rowH + 2 * s, y + rowH / 2, 12, { raw: true, max: w - rowH - 8 * s });
    if (label) p.text(label, r.left + w - 8 * s, y + rowH / 2, 11, { align: "right", raw: true, color: k.dim, plain: true });
    if (e.total > 0 && e.seconds > 0) {
      // A thin timer along the foot of the pill.
      c.fillStyle = color;
      c.fillRect(r.left + 3 * s, y + rowH - 3 * s, (w - 6 * s) * clamp01(e.seconds / e.total), 2 * s);
    }
  });
};

// ---- Target frame ----

// What each target frame showed a moment ago, for the damage trail (the trail only drains).
const trails = new Map<string, { value: number; ghost: number; time: number }>();

// Text: name, then a subtitle (realm, level), then the poise 0 to 1. Value: health 0 to 1. No text: hidden.
const targetFrame: Draw = (p, r, d, o) => {
  const { k, s } = p;
  const [name = "", subtitle = "", poiseText = ""] = o.text.split("\n");
  if (!name) return;
  const value = clamp01(o.preview ? o.value || 0.64 : o.value);
  const poise = clamp01(Number(poiseText) || (o.preview ? 0.4 : 0));
  const key = `${r.left | 0},${r.top | 0}`;
  const t = trails.get(key) ?? { value, ghost: value, time: d.time };
  const dt = Math.max(0, Math.min(0.25, d.time - t.time));
  t.ghost = value >= t.ghost ? value : Math.max(value, t.ghost - 0.4 * dt - (t.time + 0.45 > d.time ? 0 : 0.3 * dt));
  if (value < t.value) t.time = d.time;
  t.value = value;
  t.time = d.time;
  trails.set(key, t);
  const { left: x, top: y, width: w, height: h } = r;
  if (k.frame !== "ornate" && k.frame !== "soft") p.panel(x, y, w, h);
  const pad = 12 * s + (k.frame === "slant" ? 8 * s : 0);
  const inner = w - pad * 2;
  p.text(name, x + pad, y + h * 0.26, 15, { weight: 800, raw: k.frame === "ornate" || k.frame === "soft", max: inner * 0.7 });
  if (subtitle) p.text(subtitle, x + w - pad, y + h * 0.26, 11, { align: "right", raw: true, color: k.dim, max: inner * 0.4 });
  const barH = Math.max(8 * s, h * 0.2);
  const barY = y + h * 0.48;
  p.bar(x + pad, barY, inner, barH, value, k.frame === "ornate" ? k.health : k.danger, { ghost: t.ghost, segments: k.frame === "chamfer" ? 16 : 0 });
  if (poise > 0) p.bar(x + pad + inner * 0.15, barY + barH + 5 * s, inner * 0.7, 4 * s, poise, k.frame === "ornate" ? k.accent : k.stamina);
};

// ---- Damage direction ----

// Text: the bearing of the hit in degrees from straight ahead, clockwise (90 is from your right). Fades in a second.
const damageDirection: Draw = (p, r, d, o) => {
  const { ctx: c, k, s } = p;
  const age = o.preview ? 0.2 : o.textAge;
  if (age > 1.1) return;
  const angle = o.preview ? ((d.time * 60) % 360) : Number(o.text);
  if (!Number.isFinite(angle) || (!o.preview && !o.text.trim())) return;
  const alpha = o.preview ? 1 : Math.max(0, 1 - age / 1.1);
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const radius = Math.min(r.width, r.height) / 2 - 12 * s;
  const a = (angle * Math.PI) / 180 - Math.PI / 2;
  c.save();
  c.globalAlpha = alpha;
  c.lineCap = k.round ? "round" : "butt";
  c.lineWidth = 12 * s;
  c.strokeStyle = k.danger;
  if (k.glow) {
    c.shadowColor = k.danger;
    c.shadowBlur = k.glow * s;
  }
  c.beginPath();
  c.arc(cx, cy, radius, a - 0.3, a + 0.3);
  c.stroke();
  c.lineWidth = 3 * s;
  c.strokeStyle = "rgba(255,255,255,0.8)";
  c.beginPath();
  c.arc(cx, cy, radius + 10 * s, a - 0.22, a + 0.22);
  c.stroke();
  c.restore();
};

// ---- Death screen ----

// Text: a title, a line under it, then the button's label. No text: hidden. The button sends the script
// on_ui("<this widget's name>", "respawn").
const deathScreen: Draw = (p, r, d, o, hits) => {
  const { ctx: c, k, s } = p;
  const [title = "", line = "", button = "Respawn"] = o.text.split("\n");
  if (!title) return;
  const age = o.preview ? 2 : o.textAge;
  const a = clamp01(age / 1.2);
  const area: UIRect = o.preview ? r : { left: 0, top: 0, width: d.width, height: d.height };
  c.save();
  c.globalAlpha = a;
  const g = c.createRadialGradient(area.left + area.width / 2, area.top + area.height / 2, area.height * 0.1, area.left + area.width / 2, area.top + area.height / 2, Math.max(area.width, area.height) * 0.7);
  g.addColorStop(0, "rgba(0, 0, 0, 0.55)");
  g.addColorStop(1, "rgba(0, 0, 0, 0.9)");
  c.fillStyle = g;
  c.fillRect(area.left, area.top, area.width, area.height);
  const cx = area.left + area.width / 2;
  const cy = area.top + area.height * 0.44;
  const size = Math.min(56, area.height / 9);
  const red = k.frame === "ornate" ? accentOf(p) : k.danger;
  p.text(title, cx, cy, size, { align: "center", weight: 800, color: red, raw: k.frame === "ornate" || k.frame === "soft" });
  // Gold rules either side, as in the souls games; a plain rule elsewhere.
  c.fillStyle = k.frame === "ornate" ? k.accent : "rgba(255,255,255,0.35)";
  const rule = Math.min(area.width * 0.3, 360 * s);
  c.fillRect(cx - rule, cy + size * 0.8, rule * 2, Math.max(1, s));
  if (line) p.text(line, cx, cy + size * 1.25, 15, { align: "center", raw: true, color: k.dim, max: area.width * 0.7 });
  if (button) {
    const bw = Math.max(160 * s, p.measure(button, 15) + 56 * s);
    const bh = 42 * s;
    const bx = cx - bw / 2;
    const by = cy + size * 1.25 + 36 * s;
    const hot = !!d.pointer && d.pointer.x >= bx && d.pointer.x <= bx + bw && d.pointer.y >= by && d.pointer.y <= by + bh;
    p.panel(bx, by, bw, bh, hot);
    p.text(button, cx, by + bh / 2, 15, { align: "center", weight: 800 });
    if (age > 1.4) hits.push({ left: bx, top: by, width: bw, height: bh, action: "event:respawn" } as UIHit);
  }
  c.restore();
};

// ---- Character sheet ----

// Text: a title, a subtitle, then rows. "# Section", "Label|Value", or "bar|Label|0 to 1|readout". The X sends
// on_ui("<name>", "close").
const characterSheet: Draw = (p, r, d, o, hits) => {
  const { k, s } = p;
  const text = o.preview ? o.text || "Character\nGolden Core realm\n# Cultivation\nbar|Qi|0.62|310 / 500\n# Attributes\nDamage|x1.6\nSpeed|+10%\nHealth|220\nMana|150" : o.text;
  const [title = "", subtitle = "", ...rows] = text.split("\n");
  if (!title) return;
  const { left: x, top: y, width: w, height: h } = r;
  backing(p, x, y, w, h);
  p.panel(x, y, w, h);
  const pad = 18 * s + (k.frame === "slant" ? 8 * s : 0);
  p.text(title, x + pad, y + 28 * s, 20, { weight: 800, raw: k.frame === "ornate" || k.frame === "soft" });
  if (subtitle) p.text(subtitle, x + pad, y + 52 * s, 12, { raw: true, color: k.dim });
  // The close X.
  const cs = 24 * s;
  p.text("x", x + w - pad - cs / 2, y + 28 * s, 18, { align: "center", color: k.dim, raw: true });
  hits.push({ left: x + w - pad - cs, top: y + 12 * s, width: cs, height: cs, action: "event:close" } as UIHit);
  let row = y + 78 * s;
  const step = 26 * s;
  for (const line of rows) {
    if (row > y + h - 16 * s) break;
    if (line.startsWith("#")) {
      row += 6 * s;
      p.text(line.slice(1).trim(), x + pad, row, 11, { weight: 800, color: accentOf(p), raw: false });
      p.ctx.fillStyle = k.edge === "rgba(255, 255, 255, 0)" ? "rgba(255,255,255,0.18)" : k.edge;
      p.ctx.fillRect(x + pad, row + 9 * s, w - pad * 2, Math.max(1, s * 0.8));
      row += step;
      continue;
    }
    const parts = line.split("|");
    if (parts[0] === "bar") {
      const [, label = "", value = "0", readout = ""] = parts;
      p.text(label, x + pad, row, 13, { raw: true });
      if (readout) p.text(readout, x + w - pad, row, 12, { align: "right", raw: true, color: k.dim });
      p.bar(x + pad, row + 10 * s, w - pad * 2, 6 * s, Number(value) || 0, k.stamina === "#ffffff" ? k.shield : k.stamina);
      row += step + 10 * s;
    } else {
      const [label = "", value = ""] = parts;
      p.text(label, x + pad, row, 13, { raw: true, color: k.dim });
      p.text(value, x + w - pad, row, 13, { align: "right", raw: true, weight: 700 });
      row += step;
    }
  }
};

// ---- Tabs ----

// A row of tabs: "tabs|<active, from 1>|Label|Label...". A click sends event:tab:<n>. Returns the height it used (0: no tabs).
function drawTabs(p: Paint, d: UIData, hits: UIHit[], line: string | undefined, x: number, y: number, w: number): number {
  if (!line || !line.startsWith("tabs|")) return 0;
  const [, active = "1", ...labels] = line.split("|");
  if (!labels.length) return 0;
  const { k, s } = p;
  const h = 28 * s, gap = 6 * s;
  const tw = Math.min(130 * s, (w - gap * (labels.length - 1)) / labels.length);
  labels.forEach((label, i) => {
    const tx = x + i * (tw + gap);
    const on = Number(active) === i + 1;
    const over = !!d.pointer && d.pointer.x >= tx && d.pointer.x <= tx + tw && d.pointer.y >= y && d.pointer.y <= y + h;
    p.panel(tx, y, tw, h, on || over);
    p.text(label, tx + tw / 2, y + h / 2, 12, { align: "center", raw: true, weight: on ? 800 : 600, color: on ? k.text : k.dim, max: tw - 8 * s });
    hits.push({ left: tx, top: y, width: tw, height: h, action: `event:tab:${i + 1}` } as UIHit);
  });
  return h + 10 * s;
}

// ---- Quest log ----

// Text: a title, then one quest a line, "state|Title|Detail" with state active, done or todo. The X sends close.
const questLog: Draw = (p, r, d, o, hits) => {
  const { ctx: c, k, s } = p;
  const text = o.preview ? o.text || "Journal\nactive|Meet Elder Mu|Speak with the elder inside the sect gate.\ntodo|Gather qi|Hold M to meditate.\ndone|Enter the sect|You passed the gate." : o.text;
  const [title = "", ...allRest] = text.split("\n");
  if (!title) return;
  const { left: x, top: y, width: w, height: h } = r;
  backing(p, x, y, w, h);
  p.panel(x, y, w, h);
  const pad = 18 * s + (k.frame === "slant" ? 8 * s : 0);
  p.text(title, x + pad, y + 28 * s, 20, { weight: 800, raw: k.frame === "ornate" || k.frame === "soft" });
  const cs = 24 * s;
  p.text("x", x + w - pad - cs / 2, y + 28 * s, 18, { align: "center", color: k.dim, raw: true });
  hits.push({ left: x + w - pad - cs, top: y + 12 * s, width: cs, height: cs, action: "event:close" } as UIHit);
  const gold = accentOf(p);
  const tabsUsed = drawTabs(p, d, hits, allRest[0], x + pad, y + 46 * s, w - pad * 2);
  const rest = tabsUsed ? allRest.slice(1) : allRest;
  let row = y + 62 * s + tabsUsed;
  for (const line of rest) {
    const [state = "todo", name = "", detail = ""] = line.split("|");
    const active = state === "active";
    const done = state === "done";
    const lines = active && detail ? p.wrap(detail, w - pad * 2 - 26 * s, 12) : [];
    const need = (active ? 28 : 24) * s + lines.length * 16 * s;
    if (row + need > y + h - 10 * s) break;
    // The marker: a diamond for the active goal, a tick for finished ones, a ring for those waiting.
    const mx = x + pad + 8 * s;
    if (active) p.diamond(mx, row, 6 * s, gold);
    else if (done) {
      c.strokeStyle = k.dim;
      c.lineWidth = 2 * s;
      c.beginPath();
      c.moveTo(mx - 5 * s, row);
      c.lineTo(mx - 1 * s, row + 4 * s);
      c.lineTo(mx + 6 * s, row - 5 * s);
      c.stroke();
    } else {
      c.strokeStyle = k.dim;
      c.lineWidth = 1.5 * s;
      c.beginPath();
      c.arc(mx, row, 5 * s, 0, Math.PI * 2);
      c.stroke();
    }
    p.text(name, x + pad + 26 * s, row, active ? 15 : 13, { raw: true, weight: active ? 800 : 600, color: active ? k.text : k.dim, max: w - pad * 2 - 26 * s });
    lines.forEach((l, i) => p.text(l, x + pad + 26 * s, row + 20 * s + i * 16 * s, 12, { raw: true, color: k.dim, plain: true }));
    row += need;
  }
};

// ---- Skill tree ----

// Text: a title, a subtitle (the points to spend), then "node|id|Name|state|col|row|requires|cost|icon|Detail". Links run from
// each node's requirement; a click on an available node sends event:node:<id>; the X sends close (Path of Exile, Skyrim, Elden Ring).
const skillTree: Draw = (p, r, d, o, hits) => {
  const { ctx: c, k, s } = p;
  const text = o.preview
    ? o.text || "Cultivation tree\n3 insight\nnode|a|Iron Body|learned|0|0||1|cross|Health +15%\nnode|b|Diamond Body|available|0|1|a|2|shield|Health +30%\nnode|c|Keen Edge|available|1|0||1|sword|Damage +10%\nnode|e|Sword Heart|locked|1|1|c|2|star|Crit +8%\nnode|f|Deep Well|available|2|0||1|bolt|Mana +20%"
    : o.text;
  const [title = "", subtitle = "", ...rows] = text.split("\n");
  if (!title) return;
  interface Node { id: string; name: string; state: string; col: number; row: number; need: string; cost: number; icon: IconName; detail: string }
  const nodes: Node[] = [];
  for (const line of rows) {
    const [kind, id = "", name = "", state = "locked", col = "0", row = "0", need = "", cost = "0", icon = "star", ...detail] = line.split("|");
    if (kind !== "node" || !id || !Number.isFinite(Number(col)) || !Number.isFinite(Number(row))) continue;
    nodes.push({ id, name, state, col: Number(col), row: Number(row), need, cost: Number(cost) || 0, icon: (iconNames.has(icon) ? icon : "star") as IconName, detail: detail.join("|") });
  }
  if (!nodes.length) return;
  const { left: x, top: y, width: w, height: h } = r;
  backing(p, x, y, w, h);
  p.panel(x, y, w, h);
  const pad = 18 * s + (k.frame === "slant" ? 8 * s : 0);
  p.text(title, x + pad, y + 28 * s, 20, { weight: 800, raw: k.frame === "ornate" || k.frame === "soft" });
  if (subtitle) p.text(subtitle, x + pad, y + 52 * s, 12, { raw: true, color: accentOf(p) });
  const cs = 24 * s;
  p.text("x", x + w - pad - cs / 2, y + 28 * s, 18, { align: "center", color: k.dim, raw: true });
  hits.push({ left: x + w - pad - cs, top: y + 12 * s, width: cs, height: cs, action: "event:close" } as UIHit);
  const cols = Math.max(...nodes.map((n) => n.col)) + 1;
  const tiers = Math.max(...nodes.map((n) => n.row)) + 1;
  const footer = 56 * s;
  const top = y + 84 * s;
  const areaW = w - pad * 2;
  const areaH = h - (top - y) - footer - 8 * s;
  const size = Math.min(54 * s, areaW / cols - 12 * s, areaH / tiers - 12 * s);
  const at = (n: Node) => ({ x: x + pad + (areaW / cols) * (n.col + 0.5), y: top + (areaH / tiers) * (n.row + 0.5) });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const gold = accentOf(p);
  // Links first, so the plates sit on top; one that leads into a learned node is lit.
  for (const n of nodes) {
    const from = byId.get(n.need);
    if (!from) continue;
    const a = at(from), b = at(n);
    c.strokeStyle = n.state === "learned" ? gold : k.edge === "rgba(255, 255, 255, 0)" ? "rgba(255, 255, 255, 0.28)" : k.edge;
    c.globalAlpha = n.state === "learned" ? 1 : 0.7;
    c.lineWidth = 2.5 * s;
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
    c.globalAlpha = 1;
  }
  let hovered: Node | undefined;
  for (const n of nodes) {
    const { x: cx, y: cy } = at(n);
    const bx = cx - size / 2, by = cy - size / 2;
    const over = !!d.pointer && d.pointer.x >= bx && d.pointer.x <= bx + size && d.pointer.y >= by && d.pointer.y <= by + size;
    if (over) hovered = n;
    const learned = n.state === "learned", open = n.state === "available";
    c.beginPath();
    if (k.round) roundRect(c, bx, by, size, size, 8 * s);
    else p.shape(bx, by, size, size);
    c.fillStyle = learned ? gold : over && open ? k.panelHi : "rgba(0, 0, 0, 0.45)";
    c.globalAlpha = learned ? 0.9 : 1;
    c.fill();
    c.globalAlpha = 1;
    c.lineWidth = (open ? 2 : 1.2) * s;
    c.strokeStyle = learned || open ? gold : "rgba(255, 255, 255, 0.14)";
    c.stroke();
    p.icon(n.state === "locked" ? "lock" : n.icon, cx, cy, size * 0.44, learned ? "#10131a" : open ? k.text : k.dim);
    if (open && n.cost > 0) p.text(String(n.cost), bx + size - 4 * s, by + size - 6 * s, 11, { align: "right", weight: 800, color: gold, raw: true });
    p.text(n.name, cx, by + size + 11 * s, 11, { align: "center", raw: true, color: learned || open ? k.text : k.dim, max: areaW / cols - 6 * s });
    if (open) hits.push({ left: bx, top: by, width: size, height: size, action: `event:node:${n.id}` } as UIHit);
  }
  const shown = hovered ?? nodes.find((n) => n.state === "available") ?? nodes[0]!;
  const fy = y + h - footer + 14 * s;
  c.fillStyle = k.edge === "rgba(255, 255, 255, 0)" ? "rgba(255,255,255,0.18)" : k.edge;
  c.fillRect(x + pad, fy - 14 * s, areaW, Math.max(1, s * 0.8));
  const status = shown.state === "learned" ? "Learned" : shown.state === "available" ? `Click to learn · ${shown.cost} insight` : `Locked${byId.get(shown.need) ? ": needs " + byId.get(shown.need)!.name : ""}`;
  p.text(shown.name, x + pad, fy + 4 * s, 14, { weight: 800, raw: true });
  p.text(status, x + w - pad, fy + 4 * s, 11, { align: "right", raw: true, color: shown.state === "available" ? gold : k.dim });
  if (shown.detail) p.text(shown.detail, x + pad, fy + 24 * s, 12, { raw: true, color: k.dim, plain: true, max: areaW });
};

// ---- Shop window ----

// A list window for buying, selling and crafting. Text: a title, a subtitle (what you have), an optional tabs line, then
// "row|id|Name|icon|right|state|Detail" (state ok, locked or sold): a click on an ok row sends event:pick:<id>, a tab
// event:tab:<n>, and "page|n|pages" adds previous and next buttons (event:page:-1 and event:page:1).
const shopWindow: Draw = (p, r, d, o, hits) => {
  const { k, s } = p;
  const text = o.preview
    ? o.text || "Merchant Lin\n42 silver\ntabs|1|Buy|Sell\nrow|elixir|Qi Elixir|potion|20 silver|ok|Restores qi\nrow|dew|Jade Dew Pill|pill|14 silver|ok|Heals and cures\nrow|pill|Breakthrough Pill|pill|120 silver|locked|Needed to break through"
    : o.text;
  const lines = text.split("\n");
  const [title = "", subtitle = ""] = lines;
  if (!title) return;
  const rest = lines.slice(2);
  const { left: x, top: y, width: w, height: h } = r;
  backing(p, x, y, w, h);
  p.panel(x, y, w, h);
  const pad = 18 * s + (k.frame === "slant" ? 8 * s : 0);
  p.text(title, x + pad, y + 28 * s, 20, { weight: 800, raw: k.frame === "ornate" || k.frame === "soft" });
  if (subtitle) p.text(subtitle, x + w - pad - 34 * s, y + 28 * s, 13, { align: "right", raw: true, color: accentOf(p) });
  const cs = 24 * s;
  p.text("x", x + w - pad - cs / 2, y + 28 * s, 18, { align: "center", color: k.dim, raw: true });
  hits.push({ left: x + w - pad - cs, top: y + 12 * s, width: cs, height: cs, action: "event:close" } as UIHit);
  const tabLine = rest[0]?.startsWith("tabs|") ? rest[0] : undefined;
  let top = y + 50 * s + drawTabs(p, d, hits, tabLine, x + pad, y + 46 * s, w - pad * 2);
  if (!tabLine) top = y + 56 * s;
  type Row = { id: string; name: string; icon: string; right: string; state: string; detail: string };
  const rows: Row[] = [];
  let pageLine: string[] | undefined;
  for (const line of rest) {
    const parts = line.split("|");
    if (parts[0] === "row" && parts[1]) rows.push({ id: parts[1], name: parts[2] ?? "", icon: parts[3] ?? "gem", right: parts[4] ?? "", state: parts[5] ?? "ok", detail: parts.slice(6).join("|") });
    else if (parts[0] === "page") pageLine = parts;
  }
  const footer = 46 * s;
  const rowH = 46 * s, gap = 6 * s;
  const fit = Math.max(1, Math.floor((y + h - footer - top + gap) / (rowH + gap)));
  let hovered: Row | undefined;
  rows.slice(0, fit).forEach((row, i) => {
    const ry = top + i * (rowH + gap);
    const over = !!d.pointer && d.pointer.x >= x + pad && d.pointer.x <= x + w - pad && d.pointer.y >= ry && d.pointer.y <= ry + rowH;
    const usable = row.state === "ok";
    if (over) hovered = row;
    p.panel(x + pad, ry, w - pad * 2, rowH, over && usable);
    const icon = (iconNames.has(row.icon) ? row.icon : lootIcon(3, row.name)) as IconName;
    p.icon(icon, x + pad + 26 * s, ry + rowH / 2, 22 * s, usable ? (ITEM_TINT[icon] ?? k.text) : k.dim);
    p.text(row.name, x + pad + 52 * s, ry + rowH / 2 - 7 * s, 14, { raw: true, weight: 700, color: usable ? k.text : k.dim, max: w - pad * 2 - 190 * s });
    p.text(row.detail, x + pad + 52 * s, ry + rowH / 2 + 11 * s, 11, { raw: true, color: k.dim, plain: true, max: w - pad * 2 - 190 * s });
    p.text(row.right, x + w - pad - 14 * s, ry + rowH / 2, 13, { align: "right", raw: true, weight: 800, color: row.state === "locked" ? k.danger : row.state === "sold" ? k.dim : accentOf(p) });
    if (usable) hits.push({ left: x + pad, top: ry, width: w - pad * 2, height: rowH, action: `event:pick:${row.id}` } as UIHit);
  });
  if (!rows.length) p.text("Nothing here.", x + w / 2, top + 30 * s, 13, { align: "center", color: k.dim, raw: true });
  if (pageLine) {
    const [, at = "1", of = "1"] = pageLine;
    const by = y + h - 34 * s;
    p.button(x + pad, by, 70 * s, 26 * s, "Prev", !!d.pointer && d.pointer.x >= x + pad && d.pointer.x <= x + pad + 70 * s && d.pointer.y >= by && d.pointer.y <= by + 26 * s, hits, "event:page:-1", 12);
    p.button(x + pad + 80 * s, by, 70 * s, 26 * s, "Next", !!d.pointer && d.pointer.x >= x + pad + 80 * s && d.pointer.x <= x + pad + 150 * s && d.pointer.y >= by && d.pointer.y <= by + 26 * s, hits, "event:page:1", 12);
    p.text(`${at} / ${of}`, x + pad + 170 * s, by + 13 * s, 12, { raw: true, color: k.dim });
  }
  const shown = hovered ?? rows[0];
  if (shown && shown.detail) p.text(shown.detail, x + w - pad, y + h - 20 * s, 12, { align: "right", raw: true, color: k.dim, plain: true, max: w - pad * 2 - 190 * s });
};

// ---- Quick slots ----

// Text: one "KEY|icon|count|Label" a line: consumables on keys, in a row of plates with their counts (Elden Ring's quick items).
const quickSlots: Draw = (p, r, d, o) => {
  const { ctx: c, k, s } = p;
  const text = o.preview ? o.text || "H|potion|3|Qi Elixir\nZ|pill|2|Jade Dew\n8|bolt|12|Arrows" : o.text;
  const slots = text.split("\n").map((l) => l.split("|")).filter((q) => q[0] && q[1]);
  if (!slots.length) return;
  const cell = Math.min(r.height - 22 * s, 46 * s);
  const gap = 8 * s;
  const total = slots.length * cell + (slots.length - 1) * gap;
  const x0 = r.left + r.width - total;
  slots.forEach(([key = "", iconName = "gem", count = "0", label = ""], i) => {
    const x = x0 + i * (cell + gap);
    const y = r.top;
    const n = Number(count) || 0;
    p.panel(x, y, cell, cell, false);
    const icon = (iconNames.has(iconName) ? iconName : "gem") as IconName;
    c.globalAlpha = n > 0 ? 1 : 0.35;
    p.icon(icon, x + cell / 2, y + cell / 2 - 2 * s, cell * 0.5, ITEM_TINT[icon] ?? k.text);
    c.globalAlpha = 1;
    p.text(String(n), x + cell - 5 * s, y + cell - 8 * s, 12, { align: "right", weight: 800, raw: true, color: n > 0 ? k.text : k.danger });
    p.key(d.padConnected ? (padOf[key] ?? key) : key, x + cell / 2, y + cell + 11 * s, 16);
    void label;
  });
};
// A few default gamepad buttons for the keys the kit shows.
const padOf: Record<string, string> = { H: "LB", Z: "RB" };

// ---- Key hints ----

// Text: one "KEY|Label" per line. Drawn as a single right-aligned row of key caps and labels on a plate, so the keys that open
// the menus read as part of the HUD instead of loose text (the prompt rows of Genshin, Ghost of Tsushima and Elden Ring).
const keyHints: Draw = (p, r, d, o) => {
  const { k, s } = p;
  const text = o.preview ? o.text || "I|Bag\nC|Character\nJ|Journal\nM|Map" : o.text;
  const items = text
    .split("\n")
    .map((line) => line.split("|"))
    .filter((parts) => parts[0] && parts[1])
    .map(([key, label, pad]) => [d.padConnected && pad ? pad : key, label] as [string, string]);
  if (!items.length) return;
  const { left: x, top: y, width: w, height: h } = r;
  // More than four hints wrap onto a second plate above the first, so the row never reaches the skill bar.
  const perRow = items.length > 4 ? Math.ceil(items.length / 2) : items.length;
  const rows: [string, string][][] = [];
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
  const plateH = rows.length > 1 ? (h - 6 * s) / rows.length : h;
  const cap = Math.min(plateH - 14 * s, 22 * s);
  const size = cap / s;
  const gap = 14 * s, inner = 7 * s, pad = 12 * s;
  rows.forEach((row, ri) => {
    const widths = row.map(([key, label]) => Math.max(cap, p.measure(key, size * 0.55, { raw: true }) + 10 * s) + inner + p.measure(label, 12, { raw: true }));
    const total = widths.reduce((a, b) => a + b, 0) + gap * (row.length - 1) + pad * 2;
    const left = x + w - total;
    const top = y + ri * (plateH + 6 * s);
    backing(p, left, top, total, plateH);
    p.panel(left, top, total, plateH);
    let cx = left + pad;
    row.forEach(([key, label], i) => {
      const kw = Math.max(cap, p.measure(key, size * 0.55, { raw: true }) + 10 * s);
      p.key(key, cx + kw / 2, top + plateH / 2, size);
      p.text(label, cx + kw + inner, top + plateH / 2, 12, { raw: true, color: k.dim, plain: true });
      cx += widths[i]! + gap;
    });
  });
};

registerDraw("Key hints", keyHints);
registerDraw("Shop window", shopWindow);
registerDraw("Quick slots", quickSlots);
registerDraw("Skill bar", skillBar);
registerDraw("Resource bar", resourceBar);
registerDraw("Status effects", statusEffects);
registerDraw("Target frame", targetFrame);
registerDraw("Damage direction", damageDirection);
registerDraw("Death screen", deathScreen);
registerDraw("Character sheet", characterSheet);
registerDraw("Quest log", questLog);
registerDraw("Skill tree", skillTree);
