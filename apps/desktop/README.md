# BTAI Engine desktop app

The editor and the games in their own window (Electron), served from local files, with the laptop's graphics card doing the drawing.
An AI (Claude over MCP, or any script) can drive it through a local control port.

## Quickest start (no build)

```sh
git clone https://github.com/Islandyout/engine.git && cd engine/apps/desktop
npm install
npm start -- --remote      # runs the published site (needs internet), same app, GPU and control port
```

## Run from a local build

```sh
bash tools/build_editor.sh          # builds build/site (needs emsdk)
cd apps/desktop && npm install
npm start                           # the editor; Engine > Games opens a game
npm start -- --game jianghu-road    # straight into a game
```

As root (containers) add `--no-sandbox` on the command line. Options: `--site <dir>`, `--control-port <n>`, `--no-control`, `--kiosk`, `--software`, `--devtools`.

## Is the graphics card used?

Help > GPU status shows the renderer. A name with `llvmpipe`, `SwiftShader` or "software" means the processor is drawing and games will be slow;
the app warns when that happens. On Linux Mint: Menu > Driver Manager and install the recommended NVIDIA driver (or use Mesa for AMD/Intel);
on a laptop with two GPUs run with the discrete one (`prime-select nvidia`, or `DRI_PRIME=1 npm start`).

## AI control

The app writes the port and a token to `~/.config/btai-desktop/control.json` (mode 0600). Requests need `Authorization: Bearer <token>`
and refuse browsers (any `Origin`). Add the MCP server to Claude Code:

```sh
claude mcp add btai-engine -- node /path/to/apps/desktop/mcp.mjs
```

Tools: `engine_status`, `engine_gpu`, `engine_screenshot`, `engine_load`, `engine_get_scene`, `engine_set_scene`, `engine_command`,
`engine_play`, `engine_stop`, `engine_key`, `engine_wait`, `engine_log`, `engine_eval`.

Command line: `node btai.mjs status | gpu | log | play | stop | load <game|editor> | screenshot <file> | key <key> [ms] | scene get|set <file> | eval <js> | command '{"command":"spawn_entity","name":"Cube","transform":[0,1,0]}'`.

## Ship a game as its own app

```sh
node build_game_app.mjs jianghu-road        # AppImage + .deb in dist-games/jianghu-road
node build_game_app.mjs jianghu-road --dir  # unpacked folder only
```

The game opens full screen with no menu and no control port. `npm run dist` packages the editor itself.

## Tests

`npm test` (arguments, static server path safety, control port auth and routing).
