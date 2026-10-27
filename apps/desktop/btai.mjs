#!/usr/bin/env node
// A command line for the running BTAI Engine desktop app (see control.js for the calls).
//   btai.mjs status | gpu | log [--clear] | play | stop
//   btai.mjs load <game-slug> | load editor
//   btai.mjs screenshot <file.png>
//   btai.mjs eval "<javascript>"
//   btai.mjs key <key> [ms]
//   btai.mjs scene get [file.json] | scene set <file.json>
//   btai.mjs command '<json command>'
import { readFileSync, writeFileSync } from "node:fs";
import { call } from "./control_client.mjs";

const [verb, ...args] = process.argv.slice(2);
const show = (v) => console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
const usage = () => {
  console.error(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 11).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(2);
};

try {
  switch (verb) {
    case "status": case "gpu": show(await call("GET", `/${verb}`)); break;
    case "log": show(await call("GET", `/log${args.includes("--clear") ? "?clear=1" : ""}`)); break;
    case "play": case "stop": show(await call("POST", `/${verb}`, {})); break;
    case "load": if (!args[0]) usage(); show(await call("POST", "/load", args[0] === "editor" ? { editor: true } : { game: args[0] })); break;
    case "screenshot": {
      if (!args[0]) usage();
      writeFileSync(args[0], (await call("POST", "/screenshot", {})).png);
      console.log(`saved ${args[0]}`);
      break;
    }
    case "eval": if (!args[0]) usage(); show((await call("POST", "/eval", { js: args[0] })).result); break;
    case "key": if (!args[0]) usage(); show(await call("POST", "/key", { key: args[0], ms: args[1] ? Number(args[1]) : undefined })); break;
    case "scene":
      if (args[0] === "get") {
        const scene = await call("GET", "/scene");
        if (args[1]) (writeFileSync(args[1], JSON.stringify(scene)), console.log(`saved ${args[1]}`));
        else show(scene);
      } else if (args[0] === "set" && args[1]) show(await call("POST", "/scene", { scene: JSON.parse(readFileSync(args[1], "utf8")) }));
      else usage();
      break;
    case "command": if (!args[0]) usage(); show(await call("POST", "/command", { command: JSON.parse(args[0]) })); break;
    default: usage();
  }
} catch (e) {
  console.error(String(e.message ?? e));
  process.exit(1);
}
