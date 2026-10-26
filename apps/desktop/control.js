// The control port: a small HTTP API on 127.0.0.1 that lets an AI (through mcp.mjs), a script or `btai.mjs` drive the app: look at the
// window, load a game or a scene, run an editing command, play and stop, press keys, read the page's log. Every call needs the token the
// app wrote to its control file (anything else on the machine that can reach the port still cannot use it without reading that file).
// The app's real work is in `actions`; this file only routes, checks and answers, so it can be tested without a window.
const http = require("node:http");
const crypto = require("node:crypto");

const MAX_BODY = 80 * 1024 * 1024; // a whole scene can be tens of megabytes

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("body too large"), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const sameToken = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Routes: [method, path, handler(body, query) => result]. A result with `png` (a Buffer) is sent as an image, anything else as JSON.
function routes(actions) {
  return {
    "GET /status": () => actions.status(),
    "GET /gpu": () => actions.gpu(),
    "GET /log": (_b, q) => actions.log(q.get("clear") === "1"),
    "GET /scene": () => actions.getScene(),
    "POST /scene": (b) => actions.loadScene(b.scene),
    "POST /command": (b) => actions.command(b.command),
    "POST /load": (b) => actions.load(b),
    "POST /eval": (b) => actions.evalJs(String(b.js ?? "")),
    "POST /screenshot": async () => ({ png: await actions.screenshot() }),
    "POST /play": () => actions.play(),
    "POST /stop": () => actions.stop(),
    "POST /key": (b) => actions.key(b),
    "POST /wait": async (b) => {
      const ms = Math.min(Math.max(Number(b.ms) || 0, 0), 120000);
      await new Promise((r) => setTimeout(r, ms));
      return { waited: ms };
    },
  };
}

function createControlServer({ token, actions }) {
  const table = routes(actions);
  return http.createServer(async (req, res) => {
    const send = (status, body, type = "application/json") => {
      res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
      res.end(body);
    };
    try {
      // A browser page on this machine must not be able to call the port: no CORS headers are sent, and a request that names an Origin is refused.
      if (req.headers.origin) return send(403, JSON.stringify({ error: "browsers may not use the control port" }));
      const auth = String(req.headers.authorization ?? "");
      if (!auth.startsWith("Bearer ") || !sameToken(auth.slice(7), token)) return send(401, JSON.stringify({ error: "missing or wrong token" }));
      const url = new URL(req.url, "http://x");
      const handler = table[`${req.method} ${url.pathname}`];
      if (!handler) return send(404, JSON.stringify({ error: `no such call: ${req.method} ${url.pathname}`, calls: Object.keys(table) }));
      let body = {};
      if (req.method === "POST") {
        const text = await readBody(req);
        if (text.trim()) {
          try {
            body = JSON.parse(text);
          } catch {
            return send(400, JSON.stringify({ error: "the body is not JSON" }));
          }
        }
      }
      const result = await handler(body, url.searchParams);
      if (result && result.png) return send(200, result.png, "image/png");
      send(200, JSON.stringify(result ?? { ok: true }));
    } catch (e) {
      send(e.status ?? 500, JSON.stringify({ error: String(e && e.message ? e.message : e) }));
    }
  });
}

module.exports = { createControlServer };
