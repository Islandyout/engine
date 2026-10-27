#!/usr/bin/env node
// An MCP server (stdio, newline-delimited JSON-RPC) for the running BTAI Engine desktop app: it gives an AI the tools to look at the
// window, load a game or a scene, run editing commands, play, press keys and read the page's log. Add it to Claude Code with:
//   claude mcp add btai-engine -- node /path/to/apps/desktop/mcp.mjs
// (or to any client that starts MCP servers over stdio). The app must be running (npm start --prefix apps/desktop).
import { createInterface } from "node:readline";
import { call } from "./control_client.mjs";

const SERVER = { name: "btai-engine", version: "0.1.0" };
const obj = (properties = {}, required = []) => ({ type: "object", properties, required, additionalProperties: false });

const TOOLS = [
  { name: "engine_status", description: "What the app is showing: the page, whether the graphics card is in use, and the editor's mode, scene name and entity count.", inputSchema: obj(), run: () => call("GET", "/status") },
  { name: "engine_gpu", description: "Whether the laptop's graphics card is drawing (accelerated) or the processor is (software rendering, slow), with the renderer name and advice.", inputSchema: obj(), run: () => call("GET", "/gpu") },
  { name: "engine_screenshot", description: "A picture of the app window as it is now. Use it to check what a scene or game really looks like.", inputSchema: obj(), run: async () => ({ image: (await call("POST", "/screenshot", {})).png }) },
  { name: "engine_load", description: "Open the editor (editor: true) or a game from the Games library by its folder name (game: \"jianghu-road\").", inputSchema: obj({ game: { type: "string" }, editor: { type: "boolean" } }), run: (a) => call("POST", "/load", a) },
  { name: "engine_get_scene", description: "The scene open in the editor, as the engine's scene JSON (entities with their components).", inputSchema: obj(), run: () => call("GET", "/scene") },
  { name: "engine_set_scene", description: "Replace the editor's scene with this scene JSON (same format as games/*/scene.json). Stops play first.", inputSchema: obj({ scene: { type: "object" } }, ["scene"]), run: (a) => call("POST", "/scene", a) },
  { name: "engine_command", description: "Run one authoring command on the open scene (the engine's CommandInterpreter: spawn_entity, set_component, and so on; see apps/editor/src/authoring/CommandInterpreter.ts). Returns { ok, entity?, error? }.", inputSchema: obj({ command: { type: "object" } }, ["command"]), run: (a) => call("POST", "/command", a) },
  { name: "engine_play", description: "Start playing the open scene.", inputSchema: obj(), run: () => call("POST", "/play", {}) },
  { name: "engine_stop", description: "Stop playing and return to editing.", inputSchema: obj(), run: () => call("POST", "/stop", {}) },
  { name: "engine_key", description: "Press a key in the page: tap it, or hold it for ms milliseconds (movement keys), or send action down/up.", inputSchema: obj({ key: { type: "string" }, ms: { type: "number" }, action: { type: "string", enum: ["tap", "hold", "down", "up"] } }, ["key"]), run: (a) => call("POST", "/key", a) },
  { name: "engine_wait", description: "Wait (milliseconds, at most 120000) for the game to run before looking again.", inputSchema: obj({ ms: { type: "number" } }, ["ms"]), run: (a) => call("POST", "/wait", a) },
  { name: "engine_log", description: "The page's console messages and errors since the last clear (a scene or Lua script problem shows up here).", inputSchema: obj({ clear: { type: "boolean" } }), run: (a) => call("GET", `/log${a.clear ? "?clear=1" : ""}`) },
  { name: "engine_eval", description: "Run JavaScript in the page (an expression, or a function body with return). The result must be plain data. For reading state the other tools do not cover.", inputSchema: obj({ js: { type: "string" } }, ["js"]), run: (a) => call("POST", "/eval", a) },
];

const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
const fail = (id, code, message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") return reply(id, { protocolVersion: params?.protocolVersion ?? "2024-11-05", capabilities: { tools: {} }, serverInfo: SERVER });
  if (method === "ping") return reply(id, {});
  if (method === "tools/list") return reply(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
  if (method === "tools/call") {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) return fail(id, -32602, `unknown tool ${params?.name}`);
    try {
      const out = await tool.run(params.arguments ?? {});
      if (out && out.image) return reply(id, { content: [{ type: "image", data: out.image.toString("base64"), mimeType: "image/png" }] });
      return reply(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
    } catch (e) {
      // A tool's own failure is a result the AI can read and act on, not a protocol error.
      return reply(id, { isError: true, content: [{ type: "text", text: String(e.message ?? e) }] });
    }
  }
  if (id !== undefined) fail(id, -32601, `no such method ${method}`);
}

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return fail(null, -32700, "parse error");
  }
  void handle(msg);
});
