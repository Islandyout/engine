// BTAI Engine as a desktop app: the same editor and player as the web page, in a window of its own, so the laptop's GPU draws it, the files
// are local (no download wait) and an AI or a script can drive it over the control port (control.js, mcp.mjs, btai.mjs).
const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const { parseArgs } = require("./args");
const { startStaticServer } = require("./staticServer");
const { createControlServer } = require("./control");
const pkg = require("./package.json");

// A packaged game (build_game_app.mjs) names its game in package.json: it opens that game full screen, with no menu and no control port.
const packagedGame = pkg.btai && pkg.btai.game;
let opts;
try {
  opts = parseArgs(process.argv.slice(app.isPackaged ? 1 : 2));
} catch (e) {
  console.error(String(e.message));
  process.exit(2);
}
if (packagedGame) Object.assign(opts, { game: opts.game ?? packagedGame, kiosk: true, control: false });

// The graphics card: ask for it plainly. (Chromium otherwise puts some Linux GPU/driver pairs on a blocklist and draws in software.)
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
// (Running as root, as in a container, Chromium refuses to start unless the command line says --no-sandbox: `electron . --no-sandbox`. A
// normal user needs nothing.)

// One folder per app name, whatever the product name says: the control file's place is the same for every tool that looks for it.
app.setPath("userData", path.join(app.getPath("appData"), pkg.name));

let win;
let site; // { port, root }
let control; // { server, port, token, file }
const logBuffer = [];
let gpuCache;

const siteRoot = () => {
  const candidates = [opts.site, process.env.BTAI_SITE, app.isPackaged ? path.join(process.resourcesPath, "site") : undefined, path.join(__dirname, "../../build/site")].filter(Boolean);
  return candidates.map((p) => path.resolve(p)).find((p) => fs.existsSync(path.join(p, "index.html")));
};

// --remote runs the live published site instead of local files (no emsdk build needed); the app, GPU and control port are the same.
const REMOTE_BASE = "https://islandyout.github.io/engine/";
const baseUrl = () => (opts.remote ? REMOTE_BASE : `http://127.0.0.1:${site.port}/engine/`);
const isOurs = (url) => url.startsWith(baseUrl()) || (!opts.remote && url.startsWith(`http://127.0.0.1:${site.port}/`));
let remoteGames = [];
const gameUrl = (slug) => `${baseUrl()}${slug}.html`;

function readGames() {
  if (opts.remote) return remoteGames;
  try {
    return JSON.parse(fs.readFileSync(path.join(site.root, "games.json"), "utf8")).games ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------------------------------------------- the graphics card --
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i;
async function gpuReport(force = false) {
  if (gpuCache && !force) return gpuCache;
  const features = app.getGPUFeatureStatus();
  let info = {};
  try {
    info = await app.getGPUInfo("basic");
  } catch {
    // the process may not have reported yet
  }
  let webgl = { renderer: "", vendor: "" };
  if (win && !win.isDestroyed()) {
    webgl = await win.webContents
      .executeJavaScript(`(() => {
        const gl = document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl");
        if (!gl) return { renderer: "", vendor: "", none: true };
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR) };
      })()`)
      .catch(() => webgl);
  }
  const device = (info.gpuDevice ?? []).find((d) => d.active) ?? (info.gpuDevice ?? [])[0] ?? {};
  const accelerated = !webgl.none && webgl.renderer !== "" && !SOFTWARE.test(webgl.renderer) && !String(features.webgl ?? "").startsWith("disabled");
  gpuCache = {
    accelerated,
    renderer: webgl.renderer,
    vendor: webgl.vendor,
    device: { vendorId: device.vendorId, deviceId: device.deviceId, driverVendor: device.driverVendor, driverVersion: device.driverVersion },
    features,
    advice: accelerated
      ? "The graphics card is drawing the game."
      : "The game is being drawn by the processor (software rendering), which is slow. On Linux Mint: open Driver Manager (Menu, then Driver Manager) and install the recommended driver, restart, and run this again. With both an integrated and a dedicated card, make sure this app runs on the dedicated one (NVIDIA: `prime-select nvidia`, or run with `__NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia`).",
  };
  return gpuCache;
}

async function warnIfSoftware() {
  const gpu = await gpuReport(true);
  if (gpu.accelerated) {
    win.setTitle(`${pkg.productName} · GPU: ${gpu.renderer}`);
    return;
  }
  win.setTitle(`${pkg.productName} · software rendering (slow)`);
  if (opts.software || opts.kiosk) return;
  const choice = await dialog.showMessageBox(win, {
    type: "warning",
    title: "No graphics card in use",
    message: "The game is drawn by the processor, not the graphics card.",
    detail: gpu.advice + "\n\nRenderer: " + (gpu.renderer || "none"),
    buttons: ["Open GPU status", "Continue anyway"],
    defaultId: 1,
  });
  if (choice.response === 0) openGpuStatus();
}

function openGpuStatus() {
  const w = new BrowserWindow({ width: 1000, height: 800, title: "GPU status", webPreferences: { sandbox: true } });
  w.setMenuBarVisibility(false);
  void w.loadURL("chrome://gpu");
}

// ----------------------------------------------------------------------------------------------------------------------- the window --
function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: "#0e1316",
    title: pkg.productName,
    fullscreen: opts.kiosk,
    autoHideMenuBar: false, // always shown (Engine > Editor is how a game is left); a kiosk has no menu at all
    show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} BTAIDesktop/${pkg.version}`);
  win.once("ready-to-show", () => win.show());
  win.webContents.on("console-message", (event, ...legacy) => {
    // Electron 35 and later send one details object; older versions sent (level, message, line, sourceId).
    const d = legacy.length >= 3 ? { level: legacy[0], message: legacy[1], lineNumber: legacy[2], sourceId: legacy[3] } : event;
    logBuffer.push({ time: Date.now(), level: d.level, message: String(d.message).slice(0, 4000), source: d.sourceId, line: d.lineNumber });
    if (logBuffer.length > 800) logBuffer.shift();
  });
  win.webContents.on("render-process-gone", (_e, details) => logBuffer.push({ time: Date.now(), level: "error", message: `the page's process ended: ${details.reason}` }));
  // The page may open only what this app serves; anything else goes to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    // The Games library's Play button opens a game with window.open: here that is this window going to the game.
    if (isOurs(url)) void win.loadURL(url);
    else if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!isOurs(url)) {
      event.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => callback(["fullscreen", "pointerLock", "clipboard-sanitized-write", "media"].includes(permission)));
  win.webContents.on("did-finish-load", () => {
    gpuCache = undefined;
    void warnIfSoftware();
    if (opts.devtools) win.webContents.openDevTools({ mode: "detach" });
  });
  win.on("closed", () => (win = undefined));
  return win;
}

function loadSpec(spec) {
  if (spec.game) {
    const slug = String(spec.game), games = readGames();
    if (!/^[a-z0-9-]+$/.test(slug) || !games.some((g) => g.slug === slug))
      throw Object.assign(new Error(`unknown game "${slug}"; have: ${games.map((g) => g.slug).join(", ")}`), { status: 400 });
    return win.loadURL(gameUrl(slug));
  }
  if (spec.editor || (!spec.url && !spec.game)) return win.loadURL(baseUrl());
  const url = String(spec.url);
  if (!isOurs(url)) throw Object.assign(new Error("only pages of this app can be loaded"), { status: 400 });
  return win.loadURL(url);
}

function buildMenu() {
  if (opts.kiosk) return Menu.setApplicationMenu(null);
  const games = readGames();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "&Engine",
        submenu: [
          { label: "Editor (leave the game)", accelerator: "CmdOrCtrl+Home", click: () => win?.loadURL(baseUrl()) },
          { label: "Back", accelerator: "Alt+Left", click: () => win?.webContents.navigationHistory.canGoBack() && win.webContents.navigationHistory.goBack() },
          { label: "Games", submenu: games.map((g) => ({ label: g.name, click: () => win?.loadURL(gameUrl(g.slug)) })) },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "&View",
        submenu: [{ role: "reload" }, { role: "forceReload" }, { role: "togglefullscreen" }, { type: "separator" }, { role: "toggleDevTools" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }],
      },
      {
        label: "&Help",
        submenu: [
          { label: "GPU status (is the graphics card in use?)", click: async () => {
              const g = await gpuReport(true);
              await dialog.showMessageBox(win, { type: g.accelerated ? "info" : "warning", title: "GPU status", message: g.accelerated ? "Graphics card in use" : "Software rendering", detail: `${g.renderer || "no WebGL"}\n\n${g.advice}` });
            } },
          { label: "Full Chromium GPU page", click: openGpuStatus },
          { label: "Control port for AI tools", click: () => dialog.showMessageBox(win, { type: "info", title: "Control port", message: control ? `Listening on 127.0.0.1:${control.port}` : "The control port is off", detail: control ? `The token and port are in:\n${control.file}\n\nUse apps/desktop/mcp.mjs (an MCP server) or apps/desktop/btai.mjs (a command line) to drive the app.` : "Start without --no-control to turn it on." }) },
        ],
      },
    ]),
  );
}

// --------------------------------------------------------------------------------------------------------------------- control actions --
const noHook = () => Object.assign(new Error("this page has no control hook (open the editor or a game first)"), { status: 409 });
async function page(js) {
  if (!win) throw Object.assign(new Error("the window is closed"), { status: 409 });
  return win.webContents.executeJavaScript(js, true);
}
async function hook(call) {
  const result = await page(`window.btai ? (${call}) : "__nohook__"`);
  if (result === "__nohook__") throw noHook();
  return result;
}

const actions = {
  async status() {
    const pageStatus = await page(`window.btai ? window.btai.status() : null`).catch(() => null);
    return { app: pkg.productName, version: pkg.version, url: win?.webContents.getURL(), title: win?.getTitle(), controlPort: control?.port, gpu: gpuCache ? { accelerated: gpuCache.accelerated, renderer: gpuCache.renderer } : undefined, page: pageStatus };
  },
  gpu: () => gpuReport(true),
  log(clear) {
    const out = logBuffer.slice();
    if (clear) logBuffer.length = 0;
    return { messages: out };
  },
  getScene: () => hook("window.btai.getScene()"),
  loadScene: (scene) => hook(`window.btai.loadScene(${JSON.stringify(scene)})`),
  command: (command) => hook(`window.btai.execute(${JSON.stringify(command)})`),
  play: () => hook("window.btai.play()"),
  stop: () => hook("window.btai.stop()"),
  async load(spec) {
    await loadSpec(spec);
    return actions.status();
  },
  // `js` is an expression (`document.title`) or a function body with return statements; either may await. The result must be plain data.
  async evalJs(js) {
    let source;
    try {
      new vm.Script(`(async () => (${js}\n))`);
      source = `(async () => (${js}\n))()`;
    } catch {
      source = `(async () => { ${js}\n })()`;
    }
    return { result: await page(source) };
  },
  async screenshot() {
    if (!win) throw Object.assign(new Error("the window is closed"), { status: 409 });
    const image = await win.webContents.capturePage();
    return image.toPNG();
  },
  // A key pressed in the page: { key: "w", ms: 300 } holds it for ms; { key: "Enter" } taps it; { key: "w", action: "down" | "up" }.
  async key(spec) {
    const key = String(spec.key ?? "");
    if (!key) throw Object.assign(new Error("key is required"), { status: 400 });
    const named = { " ": "Space", space: "Space", enter: "Enter", return: "Enter", escape: "Escape", esc: "Escape", tab: "Tab", shift: "ShiftLeft", ctrl: "ControlLeft", alt: "AltLeft", up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", backspace: "Backspace" };
    const lower = key.toLowerCase();
    const code = spec.code ?? named[lower] ?? (/^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : /^[0-9]$/.test(key) ? `Digit${key}` : key);
    const send = (type) => page(`(() => { const e = new KeyboardEvent("${type}", { key: ${JSON.stringify(key.length === 1 ? key : code)}, code: ${JSON.stringify(code)}, bubbles: true, cancelable: true }); window.dispatchEvent(e); })()`);
    const action = spec.action ?? (spec.ms ? "hold" : "tap");
    if (action === "down" || action === "hold" || action === "tap") await send("keydown");
    if (action === "hold") await new Promise((r) => setTimeout(r, Math.min(Number(spec.ms) || 0, 30000)));
    else if (action === "tap") await new Promise((r) => setTimeout(r, 60));
    if (action === "up" || action === "hold" || action === "tap") await send("keyup");
    return { key, code, action };
  },
};

// -------------------------------------------------------------------------------------------------------------------------- start up --
async function startControl() {
  if (!opts.control) return;
  const token = crypto.randomBytes(24).toString("hex");
  const server = createControlServer({ token, actions });
  for (let port = opts.controlPort; port < opts.controlPort + 20; port++) {
    const ok = await new Promise((resolve) => {
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => resolve(true));
    });
    if (ok) {
      const file = path.join(app.getPath("userData"), "control.json");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ port, token, pid: process.pid }), { mode: 0o600 });
      control = { server, port, token, file };
      console.log(`control port 127.0.0.1:${port} (token in ${file})`);
      return;
    }
  }
  console.error("no free control port: the app runs without one");
}

app.on("second-instance", (_e, argv) => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  try {
    const next = parseArgs(argv.slice(app.isPackaged ? 1 : 2));
    if (next.game) void win.loadURL(gameUrl(next.game));
  } catch {
    // a malformed second launch just focuses the window
  }
});

if (!app.requestSingleInstanceLock()) app.quit();
else
  app.whenReady().then(async () => {
    const root = opts.remote ? undefined : siteRoot();
    if (!root && !opts.remote) {
      dialog.showErrorBox("No built site", "The engine's built site was not found.\n\nIn a checkout, build it first (tools/build_editor.sh, which needs the Emscripten SDK), or pass --site <folder>.");
      return app.quit();
    }
    if (opts.remote) {
      try {
        const res = await fetch(`${REMOTE_BASE}games.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        remoteGames = (await res.json()).games ?? [];
      } catch (e) {
        dialog.showErrorBox("Cannot reach the published site", `${REMOTE_BASE}\n\n${e.message}\n\nCheck the internet connection, or build locally (see README).`);
        return app.quit();
      }
    } else site = await startStaticServer(root);
    createWindow();
    buildMenu();
    await startControl();
    await win.loadURL(opts.game ? gameUrl(opts.game) : baseUrl());
  });

app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  try {
    if (control) fs.rmSync(control.file, { force: true });
    control?.server.close();
    site?.server.close();
  } catch {
    // shutting down
  }
});
