import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const require = createRequire(import.meta.url);
const { parseArgs } = require("../args.js");
const { resolveInside, startStaticServer } = require("../staticServer.js");
const { createControlServer } = require("../control.js");

test("parseArgs: defaults, kiosk turns control off, bad values fail", () => {
  assert.equal(parseArgs([]).controlPort, 47800);
  const k = parseArgs(["--kiosk", "--game", "jianghu-road", "--no-sandbox"]);
  assert.equal(k.control, false);
  assert.equal(k.game, "jianghu-road");
  assert.throws(() => parseArgs(["--control-port", "99999"]), /port/);
  assert.throws(() => parseArgs(["--game", "../x"]), /--game/);
});

test("resolveInside keeps paths in the root", () => {
  const root = path.resolve("/srv/site");
  assert.equal(resolveInside(root, "/engine/a.html"), path.join(root, "a.html"));
  assert.equal(resolveInside(root, "/engine/"), path.join(root, "index.html"));
  assert.equal(resolveInside(root, "/engine/../etc/passwd"), undefined);
  assert.equal(resolveInside(root, "/engine/%2e%2e/etc/passwd"), undefined);
  assert.equal(resolveInside(root, "/a%00b"), undefined);
  assert.equal(resolveInside(root, "/%E0%A4%A"), undefined);
});

const request = (port, method, p, { headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: p, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject);
    req.end(body);
  });

test("static server serves files and refuses escapes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "btai-site-"));
  fs.writeFileSync(path.join(root, "index.html"), "hi");
  const { server, port } = await startStaticServer(root);
  try {
    assert.equal((await request(port, "GET", "/engine/")).text, "hi");
    assert.equal((await request(port, "GET", "/engine/missing.html")).status, 404);
    assert.equal((await request(port, "GET", "/engine/..%2f..%2fetc/passwd")).status, 404);
  } finally {
    server.close();
  }
});

test("control server: token, origin, routing, errors", async () => {
  const calls = [];
  const actions = {
    status: () => ({ ok: 1 }),
    command: (c) => (calls.push(c), { ok: true }),
    load: () => {
      throw Object.assign(new Error("unknown game"), { status: 400 });
    },
  };
  const server = createControlServer({ token: "secret", actions });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const auth = { Authorization: "Bearer secret" };
  try {
    assert.equal((await request(port, "GET", "/status")).status, 401);
    assert.equal((await request(port, "GET", "/status", { headers: { Authorization: "Bearer wrong" } })).status, 401);
    assert.equal((await request(port, "GET", "/status", { headers: { ...auth, Origin: "http://evil" } })).status, 403);
    assert.equal(JSON.parse((await request(port, "GET", "/status", { headers: auth })).text).ok, 1);
    assert.equal((await request(port, "GET", "/nope", { headers: auth })).status, 404);
    assert.equal((await request(port, "POST", "/command", { headers: auth, body: "{bad" })).status, 400);
    await request(port, "POST", "/command", { headers: auth, body: JSON.stringify({ command: { command: "spawn_entity" } }) });
    assert.deepEqual(calls, [{ command: "spawn_entity" }]);
    const bad = await request(port, "POST", "/load", { headers: auth, body: JSON.stringify({ game: "x" }) });
    assert.equal(bad.status, 400);
    assert.match(bad.text, /unknown game/);
  } finally {
    server.close();
  }
});
