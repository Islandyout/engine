// Serves the built site on 127.0.0.1 under /engine/ (the base the pages were built for). Only that folder: no path leaves it.
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".wasm": "application/wasm", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2",
};

// The file a URL path names inside `root`, or undefined when it names nothing there (or something outside).
function resolveInside(root, urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath);
  } catch {
    return undefined;
  }
  if (p.includes("\0")) return undefined;
  p = p.replace(/^\/engine(\/|$)/, "/");
  if (p === "/" || p === "") p = "/index.html";
  const file = path.resolve(root, "." + p);
  return file === root || file.startsWith(root + path.sep) ? file : undefined;
}

// `preferredPort` keeps the page's origin the same from one launch to the next, so what a game keeps in the browser (a saved world) is
// still there next time; if that port is busy a free one is used instead.
function startStaticServer(root, preferredPort = 0) {
  const base = path.resolve(root);
  const server = http.createServer(async (req, res) => {
    const file = resolveInside(base, new URL(req.url, "http://x").pathname);
    if (!file) return void res.writeHead(404).end();
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  const listen = (port) =>
    new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port, root: base }));
    });
  return listen(preferredPort).catch((e) => {
    if (e.code === "EADDRINUSE" && preferredPort !== 0) return listen(0);
    throw e;
  });
}
module.exports = { startStaticServer, resolveInside };
