// The editor's Games library: every game published from the repository's
// games/ folder (tools/build_games.mjs writes ./games.json) plus the scenes a
// user saved into "My games" in this browser. Pure data helpers first (unit
// tested), then the overlay DOM.

export interface GameEntry {
  slug: string;
  name: string;
  genre: string;
  description: string;
  accent: string;
  group: "engine" | "mine" | "folder";
  page: string;
  scene: string;
}

export interface LocalGame {
  id: string;
  name: string;
  savedAt: number;
  scene: string;
}

const GROUPS = new Set(["engine", "mine", "folder"]);
const COLOR = /^#[0-9a-fA-F]{3,8}$/;

// Validates games.json; drops malformed rows instead of failing the panel.
export function parseGamesIndex(value: unknown): GameEntry[] {
  const list = (value as { games?: unknown })?.games;
  if (!Array.isArray(list)) return [];
  const out: GameEntry[] = [];
  for (const raw of list) {
    const g = raw as Record<string, unknown>;
    if (typeof g?.slug !== "string" || typeof g.name !== "string") continue;
    if (!/^[a-z0-9-]+$/.test(g.slug)) continue;
    out.push({
      slug: g.slug,
      name: g.name,
      genre: typeof g.genre === "string" ? g.genre : "",
      description: typeof g.description === "string" ? g.description : "",
      accent: typeof g.accent === "string" && COLOR.test(g.accent) ? g.accent : "#8ab4ff",
      group: GROUPS.has(g.group as string) ? (g.group as GameEntry["group"]) : "folder",
      page: `${g.slug}.html`,
      scene: `games/${g.slug}.json`,
    });
  }
  return out;
}

const STORE_KEY = "game-engine-editor:my-games";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class LocalGames {
  constructor(private readonly store: KeyValueStore) {}

  list(): LocalGame[] {
    try {
      const value = JSON.parse(this.store.getItem(STORE_KEY) ?? "[]");
      return Array.isArray(value)
        ? value.filter((g) => typeof g?.id === "string" && typeof g.scene === "string")
        : [];
    } catch {
      return [];
    }
  }

  // Saves under `name`, replacing an existing game with the same name.
  save(name: string, scene: string, now = Date.now()): LocalGame {
    const trimmed = name.trim() || "Untitled game";
    const games = this.list().filter((g) => g.name !== trimmed);
    const game = { id: `g${now.toString(36)}${games.length}`, name: trimmed, savedAt: now, scene };
    games.unshift(game);
    this.store.setItem(STORE_KEY, JSON.stringify(games));
    return game;
  }

  remove(id: string) {
    this.store.setItem(STORE_KEY, JSON.stringify(this.list().filter((g) => g.id !== id)));
  }
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "my-game";
}

// The game.json a user drops next to a downloaded scene in games/my-games/<slug>/.
export function manifestFor(name: string): string {
  return JSON.stringify({ name, genre: "", description: "", scene: "scene.json" }, null, 2);
}

export interface LibraryHooks {
  currentScene(): string;
  projectName(): string;
  openScene(text: string, name: string): void;
  log(message: string): void;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function button(label: string, onClick: () => void, kind = "") {
  const b = document.createElement("button");
  b.className = `btn btn-sm ${kind}`.trim();
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function card(title: string, sub: string, text: string, accent: string, actions: HTMLElement[]) {
  const c = document.createElement("div");
  c.className = "game-card";
  c.style.setProperty("--card-accent", accent);
  const h = document.createElement("h3");
  h.textContent = title;
  const g = document.createElement("span");
  g.className = "game-genre";
  g.textContent = sub;
  const p = document.createElement("p");
  p.textContent = text;
  const row = document.createElement("div");
  row.className = "game-actions";
  row.append(...actions);
  c.append(h, g, p, row);
  return c;
}

// Builds (once) and shows the library overlay.
export function openGamesLibrary(root: HTMLElement, hooks: LibraryHooks, store: KeyValueStore = localStorage) {
  let overlay = root.querySelector<HTMLDivElement>("#games-library");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "games-library";
    overlay.className = "games-library";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Games library");
    root.appendChild(overlay);
  }
  const local = new LocalGames(store);
  const close = () => overlay!.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  const panel = document.createElement("div");
  panel.className = "games-panel";
  const head = document.createElement("div");
  head.className = "games-head";
  const title = document.createElement("h2");
  title.textContent = "Games";
  head.append(title, button("Close", close, "btn-ghost"));
  panel.append(head);

  const section = (name: string, hint: string) => {
    const s = document.createElement("section");
    const h = document.createElement("h4");
    h.textContent = name;
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = hint;
    const grid = document.createElement("div");
    grid.className = "games-grid";
    s.append(h, p, grid);
    panel.append(s);
    return grid;
  };
  const engineGrid = section("Engine games", "Games built on this engine, from the repository's games/ folder.");
  const mineGrid = section("My games", "Games you added under games/my-games/ (see games/README.md).");
  const browserGrid = section("In this browser", "Scenes saved from the editor. Download one and put it in games/my-games/<name>/ to publish it.");

  const save = button("Save current scene to My games", () => {
    const name = prompt("Game name", hooks.projectName()) ?? "";
    if (!name) return;
    local.save(name, hooks.currentScene());
    renderLocal();
  });
  browserGrid.parentElement!.insertBefore(save, browserGrid);

  const renderLocal = () => {
    browserGrid.replaceChildren();
    const games = local.list();
    if (!games.length) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "Nothing saved yet.";
      browserGrid.append(p);
    }
    for (const g of games) {
      browserGrid.append(
        card(g.name, new Date(g.savedAt).toLocaleString(), "Saved in this browser.", "#8b93a0", [
          button("Edit", () => {
            hooks.openScene(g.scene, g.name);
            close();
          }, "btn-primary"),
          button("Download", () => {
            download("scene.json", g.scene);
            download("game.json", manifestFor(g.name));
          }),
          button("Delete", () => {
            if (confirm(`Delete "${g.name}" from this browser?`)) {
              local.remove(g.id);
              renderLocal();
            }
          }, "btn-danger-hover"),
        ]),
      );
    }
  };
  renderLocal();

  const loading = document.createElement("p");
  loading.className = "hint";
  loading.textContent = "Loading…";
  engineGrid.append(loading);
  fetch("./games.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((index) => {
      const games = parseGamesIndex(index);
      engineGrid.replaceChildren();
      mineGrid.replaceChildren();
      for (const g of games) {
        const grid = g.group === "engine" ? engineGrid : mineGrid;
        grid.append(
          card(g.name, g.genre, g.description, g.accent, [
            button("Play", () => window.open(g.page, "_blank"), "btn-primary"),
            button("Edit", () => {
              fetch(g.scene)
                .then((r) => r.text())
                .then((text) => {
                  hooks.openScene(text, g.name);
                  close();
                })
                .catch((error) => hooks.log(`Could not open ${g.name}: ${String(error)}`));
            }),
          ]),
        );
      }
      if (!mineGrid.children.length) {
        const p = document.createElement("p");
        p.className = "hint";
        p.textContent = "None yet — add a folder under games/my-games/.";
        mineGrid.append(p);
      }
    })
    .catch(() => {
      loading.textContent = "No games.json here — run tools/build_editor.sh (it publishes the games/ folder).";
    });

  overlay.replaceChildren(panel);
}
