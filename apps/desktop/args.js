// Command-line options of the desktop app, parsed on their own so they can be tested.
//   --site <dir>          the built site to serve (default: the app's own, or build/site in a checkout)
//   --game <slug>         open this game (a folder name under games/) instead of the editor
//   --control-port <n>    the control port (default 47800; the next free one when busy)
//   --no-control          do not open the control port
//   --remote              run the live published site instead of local files (no build needed)
//   --kiosk               a game, full screen, no menu, no control port (what a packaged game uses)
//   --software            allow software rendering without the warning
//   --devtools            open the developer tools
function parseArgs(argv) {
  const out = { site: undefined, game: undefined, controlPort: 47800, control: true, kiosk: false, software: false, remote: false, devtools: false, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--site") out.site = argv[++i];
    else if (a === "--game") out.game = argv[++i];
    else if (a === "--control-port") out.controlPort = Number(argv[++i]);
    else if (a === "--no-control") out.control = false;
    else if (a === "--kiosk") (out.kiosk = true), (out.control = false);
    else if (a === "--remote") out.remote = true;
    else if (a === "--software") out.software = true;
    else if (a === "--devtools") out.devtools = true;
    else if (a === "--no-sandbox") continue; // Chromium's own switch: it has already read it
    else out.rest.push(a);
  }
  if (!Number.isInteger(out.controlPort) || out.controlPort < 1 || out.controlPort > 65535) throw new Error("--control-port must be a port number");
  if (out.game !== undefined && !/^[a-z0-9-]+$/.test(out.game)) throw new Error("--game must be a game's folder name (letters, digits, dashes)");
  return out;
}
module.exports = { parseArgs };
