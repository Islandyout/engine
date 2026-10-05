// On a failed browser test: the error and a screenshot of every open page go
// to build/browser-evidence/, which CI uploads, so a failure on a runner
// can be read without reproducing it.
const fs = require("node:fs/promises");

async function saveFailure(name, error, browser) {
  try {
    await fs.mkdir("build/browser-evidence", { recursive: true });
    await fs.writeFile(`build/browser-evidence/${name}-failure.txt`, `${error && error.stack ? error.stack : String(error)}\n`);
    let n = 0;
    for (const context of browser ? browser.contexts() : [])
      for (const page of context.pages()) {
        await page.screenshot({ path: `build/browser-evidence/${name}-failure-${n++}.png`, timeout: 20000 }).catch(() => undefined);
        const log = await page.evaluate(() => document.querySelector("#log")?.textContent ?? "").catch(() => "");
        if (log) await fs.writeFile(`build/browser-evidence/${name}-failure-${n - 1}-log.txt`, log);
      }
  } catch {
    // Evidence is best effort; the original error still fails the test.
  }
}

module.exports = { saveFailure };
