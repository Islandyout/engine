// Talks to a running BTAI Engine desktop app over its control port. Used by btai.mjs (a command line) and mcp.mjs (an MCP server).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Where the app wrote its port and token: $BTAI_CONTROL, else the app's config folder.
export function controlFile() {
  if (process.env.BTAI_CONTROL) return process.env.BTAI_CONTROL;
  const config = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(config, "btai-desktop", "control.json");
}

export function readControl(file = controlFile()) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`BTAI Engine is not running (no control file at ${file}). Start it with: npm start --prefix apps/desktop`);
  }
  const { port, token } = JSON.parse(text);
  return { port, token };
}

// One call. `body` (for POST) is sent as JSON. Resolves to parsed JSON, or { png: Buffer } for an image; rejects with the app's own message.
export async function call(method, path, body, control = readControl()) {
  const res = await fetch(`http://127.0.0.1:${control.port}${path}`, {
    method,
    headers: { Authorization: `Bearer ${control.token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.headers.get("content-type")?.startsWith("image/png")) return { png: Buffer.from(await res.arrayBuffer()) };
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}
