// Frame time of the Eden page with 2 people and with 60, in headless Chromium. This is a measurement, not a pass/fail test: it prints a
// table and, with EDEN_PERF_OUT=<file>, writes the same numbers as JSON. Read docs/EDEN_PERFORMANCE.md for what the numbers can and
// cannot say: headless Chromium draws with SwiftShader (software GL) on the CPU, so a wall-clock frame rate here is a floor for what a
// machine with a graphics card would do, and on a shared or busy machine it also depends on what else is running.
//
//   node tests/browser/eden_perf.cjs            (after bash tools/build_editor.sh, from the repository root)
//
// Besides wall-clock frame times it reads each browser process's CPU time (CDP SystemInfo.getProcessInfo) before and after each window,
// so the CPU spent per frame by the page's own code (renderer process) and by the software GL (gpu process) can be told apart, and
// stays meaningful when the machine is busy and wall-clock frames are slow.
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const WINDOW_MS = Number(process.env.EDEN_PERF_SECONDS ?? 40) * 1000;
const PEOPLE = Number(process.env.EDEN_PERF_PEOPLE ?? 60);

(async () => {
  const root = path.resolve(process.env.SITE_ROOT || "build/site");
  const server = http.createServer(async (req, res) => {
    const p = new URL(req.url, "http://localhost").pathname.replace(/^\/engine\//, "");
    const file = path.resolve(root, p);
    if (!file.startsWith(root + path.sep)) return res.writeHead(404).end();
    try {
      res.setHeader("Content-Type", { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".glb": "model/gltf-binary" }[path.extname(file)] || "application/octet-stream");
      res.end(await fs.readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
  try {
    const context = await browser.newContext({ viewport: { width: 960, height: 540 }, userAgent: "Mozilla/5.0 BTAIDesktop" });
    let page = await context.newPage();
    page.setDefaultTimeout(300000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const cdp = await browser.newBrowserCDPSession();
    await page.goto(`http://127.0.0.1:${server.address().port}/engine/eden.html`);
    await page.waitForFunction(() => typeof window.edenDebug === "function" && window.edenDebug().length >= 2);
    const startFrames = () => {
      const t = document.querySelector(".eden-tutorial button");
      if (t) t.click();
      window.__frames = [];
      let last = performance.now();
      const tick = (now) => {
        window.__frames.push(now - last);
        last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    await page.evaluate(startFrames);
    const cpu = async () => {
      const { processInfo } = await cdp.send("SystemInfo.getProcessInfo");
      const sum = {};
      for (const p of processInfo) {
        const type = String(p.type).toLowerCase();
        sum[type] = (sum[type] ?? 0) + p.cpuTime;
      }
      return sum;
    };
    const measure = async (label) => {
      await page.evaluate(() => (window.__frames.length = 0));
      const c0 = await cpu();
      const w0 = Date.now();
      await page.waitForTimeout(WINDOW_MS);
      const wall = (Date.now() - w0) / 1000;
      const c1 = await cpu();
      const frames = await page.evaluate(() => window.__frames.slice());
      const sorted = frames.slice().sort((a, b) => a - b);
      const pct = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? NaN;
      const n = frames.length;
      const cpuMs = (type) => (n ? (((c1[type] ?? 0) - (c0[type] ?? 0)) * 1000) / n : NaN);
      return {
        label,
        people: await page.evaluate(() => window.edenDebug().length),
        frames: n,
        fps: +(n / wall).toFixed(2),
        frameMs: { mean: +(frames.reduce((s, v) => s + v, 0) / Math.max(1, n)).toFixed(0), p50: +pct(0.5).toFixed(0), p95: +pct(0.95).toFixed(0), max: +Math.max(...frames, 0).toFixed(0) },
        cpuMsPerFrame: { renderer: +cpuMs("renderer").toFixed(1), gpu: +cpuMs("gpu").toFixed(1), browser: +cpuMs("browser").toFixed(1) },
        // What does not depend on the machine: the work handed to the graphics card for one frame, and what is held in its memory.
        gpuWork: await page.evaluate(async () => {
          const el = document.getElementById("stats-panel");
          if (!el) return undefined;
          el.hidden = false;
          await new Promise((r) => setTimeout(r, 12000));
          const text = el.textContent ?? "";
          const num = (re) => Number((text.match(re) ?? [])[1]);
          return { drawCalls: num(/Draw calls\s+(\d+)/), triangles: num(/Triangles\s+(\d+)/), geometries: num(/(\d+) geometries/), textures: num(/(\d+) textures/), entities: num(/Entities\s+(\d+)/) };
        }),
      };
    };
    const results = [];
    await page.waitForTimeout(5000);
    results.push(await measure("2 people"));
    // The crowd: the page's own save with the people added by tools/eden/crowd.ts (the Creator's form stops at the garden's limit), loaded in a
    // fresh page. Same size window, same camera.
    await page.evaluate(() => [...document.querySelectorAll(".eden-panel button")].find((b) => b.textContent === "Save").click());
    const save = await page.evaluate(() => localStorage.getItem("eden-world-v1"));
    const { execFileSync } = require("node:child_process");
    const os = require("node:os");
    const tmp = path.join(os.tmpdir(), `eden-perf-${process.pid}.json`);
    await fs.writeFile(tmp, save);
    const crowd = execFileSync(path.resolve("apps/editor/node_modules/.bin/tsx"), [path.resolve("tools/eden/crowd.ts"), tmp, String(PEOPLE)], { cwd: path.resolve("apps/editor"), maxBuffer: 1 << 28 }).toString();
    await page.close();
    const crowdContext = await browser.newContext({ viewport: { width: 960, height: 540 }, userAgent: "Mozilla/5.0 BTAIDesktop" });
    await crowdContext.addInitScript((text) => localStorage.setItem("eden-world-v1", text), crowd);
    page = await crowdContext.newPage();
    page.setDefaultTimeout(300000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/engine/eden.html`);
    await page.waitForFunction((n) => typeof window.edenDebug === "function" && window.edenDebug().length >= n, PEOPLE);
    await page.evaluate(startFrames);
    await page.waitForTimeout(15000);
    results.push(await measure(`${PEOPLE} people`));
    console.log(JSON.stringify({ results, errors: errors.slice(0, 3) }, null, 1));
    if (process.env.EDEN_PERF_OUT) await fs.writeFile(process.env.EDEN_PERF_OUT, JSON.stringify({ results, errors }, null, 1));
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
