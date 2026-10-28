// Talking with the people while you walk the world: E beside someone opens a box to type to them; if more than one is near, you choose
// whom first. Everything typed or said goes in with textContent, never as HTML.
export interface TalkChoice {
  id: string;
  name: string;
  note: string; // how they are, in a few words
}

export interface TalkHandlers {
  say(id: string, text: string): void;
  close(): void;
}

export interface Talk {
  isOpen(): boolean;
  open(choices: TalkChoice[]): void;
  hint(text: string | undefined): void;
  thinking(name: string): void;
  reply(name: string, text: string): void;
  close(): void;
}

const CSS = `
  .eden-talk { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); width: min(520px, calc(100vw - 24px)); z-index: 60; display: none;
    flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 10px; background: rgba(18, 16, 14, 0.93); color: #ece4d2; font: 14px/1.45 system-ui, sans-serif;
    box-shadow: 0 4px 22px rgba(0,0,0,0.5); }
  .eden-talk.open { display: flex; }
  .eden-talk h3 { margin: 0; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: #c9a24a; }
  .eden-talk .log { max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
  .eden-talk .you { color: #9ec4ff; }
  .eden-talk .them { color: #ece4d2; }
  .eden-talk .wait { color: #a89d85; font-style: italic; }
  .eden-talk .choices { display: flex; flex-direction: column; gap: 4px; }
  .eden-talk button { background: rgba(255,255,255,0.1); border: none; border-radius: 6px; color: inherit; font: inherit; padding: 5px 9px; cursor: pointer; text-align: left; }
  .eden-talk button:hover, .eden-talk button:focus-visible { background: rgba(255,255,255,0.22); outline: none; }
  .eden-talk .row { display: flex; gap: 6px; }
  .eden-talk input { flex: 1; min-width: 0; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; color: inherit; font: inherit; padding: 5px 8px; }
  .eden-talk .tools { display: flex; gap: 6px; justify-content: flex-end; }
  .eden-talk-hint { position: fixed; left: 50%; bottom: 70px; transform: translateX(-50%); z-index: 55; display: none; padding: 4px 12px; border-radius: 14px;
    background: rgba(18, 16, 14, 0.8); color: #ece4d2; font: 13px system-ui, sans-serif; pointer-events: none; }
  .eden-talk-hint.on { display: block; }
  .eden-talk-hint b { color: #c9a24a; }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createTalk(handlers: TalkHandlers): Talk {
  const style = el("style");
  style.textContent = CSS;
  document.head.append(style);

  const root = el("div", "eden-talk");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Talking");
  const title = el("h3");
  const log = el("div", "log");
  log.setAttribute("aria-live", "polite");
  const choices = el("div", "choices");
  const row = el("div", "row");
  const input = el("input");
  input.type = "text";
  input.maxLength = 200;
  input.placeholder = "Say something… (Enter sends, Esc leaves)";
  input.setAttribute("aria-label", "What you say");
  const send = el("button", undefined, "Say");
  row.append(input, send);
  const tools = el("div", "tools");
  const back = el("button", undefined, "Someone else");
  const leave = el("button", undefined, "Leave");
  tools.append(back, leave);
  root.append(title, choices, log, row, tools);

  const hintBox = el("div", "eden-talk-hint");
  document.body.append(root, hintBox);

  // The game must not hear the keys typed here (W A S D would walk the hunter off).
  for (const type of ["keydown", "keyup", "keypress"] as const) root.addEventListener(type, (e) => e.stopPropagation());

  let open = false;
  let target: TalkChoice | undefined;
  let list: TalkChoice[] = [];

  const line = (cls: string, text: string) => {
    const p = el("div", cls, text);
    log.append(p);
    log.scrollTop = log.scrollHeight;
    return p;
  };
  const talkTo = (c: TalkChoice) => {
    target = c;
    title.textContent = `Talking with ${c.name}`;
    choices.style.display = "none";
    log.style.display = "";
    row.style.display = "";
    back.style.display = list.length > 1 ? "" : "none";
    log.replaceChildren();
    line("wait", c.note);
    input.value = "";
    input.focus();
  };
  const choose = () => {
    target = undefined;
    title.textContent = "Who do you want to talk to?";
    choices.replaceChildren();
    list.forEach((c, i) => {
      const b = el("button", undefined, `${i + 1}. ${c.name} — ${c.note}`);
      b.addEventListener("click", () => talkTo(c));
      choices.append(b);
    });
    choices.style.display = "";
    log.style.display = "none";
    row.style.display = "none";
    back.style.display = "none";
    (choices.firstElementChild as HTMLElement | null)?.focus();
  };
  const submit = () => {
    const text = input.value.trim();
    if (!text || !target) return;
    input.value = "";
    line("you", `You: ${text}`);
    handlers.say(target.id, text);
  };
  const close = () => {
    if (!open) return;
    open = false;
    root.classList.remove("open");
    input.blur();
    handlers.close();
  };

  send.addEventListener("click", submit);
  back.addEventListener("click", choose);
  leave.addEventListener("click", close);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    // 1..9 pick from the list when it is showing.
    if (choices.style.display !== "none" && /^[1-9]$/.test(e.key)) {
      const c = list[Number(e.key) - 1];
      if (c) talkTo(c);
    }
  });

  return {
    isOpen: () => open,
    open(found) {
      if (!found.length) return;
      list = found;
      open = true;
      root.classList.add("open");
      hintBox.classList.remove("on");
      if (found.length === 1) talkTo(found[0]!);
      else choose();
    },
    hint(text) {
      hintBox.replaceChildren();
      if (!text || open) return hintBox.classList.remove("on");
      const key = el("b", undefined, "E");
      hintBox.append(key, document.createTextNode(` ${text}`));
      hintBox.classList.add("on");
    },
    thinking(name) {
      line("wait", `${name} thinks…`).dataset.thinking = "1";
    },
    reply(name, text) {
      log.querySelectorAll('[data-thinking="1"]').forEach((n) => n.remove());
      line("them", `${name}: ${text}`);
    },
    close,
  };
}
