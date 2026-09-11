const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve('build/field-lab');
  const evidence = path.resolve('build/browser-evidence');
  await fs.mkdir(evidence, { recursive: true });
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const server = http.createServer(async (req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname;
    if (!['/', '/index.html', '/engine.js', '/lab.js', '/style.css'].includes(name)) {
      res.writeHead(404).end(); return;
    }
    const file = name === '/' ? 'index.html' : name.slice(1);
    try {
      const data = await fs.readFile(path.join(root, file));
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] }).end(data);
    } catch { res.writeHead(500).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch();
    for (const [name, viewport] of [['desktop', {width: 1365, height: 1000}],
                                    ['mobile', {width: 390, height: 844}]]) {
      const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:' + server.address().port);
      await page.waitForFunction(() => document.querySelector('#status').textContent.includes('connected'));
      await page.locator('#new-field').click();
      await page.waitForFunction(() => document.querySelector('#seed').textContent === '2');
      await page.locator('#record').click();
      const start = await page.locator('#position').textContent();
      await page.getByRole('button', {name: 'Move right', exact: true}).click();
      await page.waitForFunction(start => document.querySelector('#position').textContent !== start, start);
      await page.locator('#spawn').click();
      await page.waitForFunction(() => document.querySelector('#entities').textContent === '7');
      await page.locator('#record').click();
      await page.locator('#replay').click();
      await page.waitForFunction(() => document.querySelector('#replay-status').textContent.startsWith('Verified:'), null, {timeout: 35000});
      await page.screenshot({path: path.join(evidence, name + '-replay.png'), fullPage: true});
      await page.locator('#reset').click();
      await page.waitForFunction(() => document.querySelector('#entities').textContent === '6');
      await page.locator('#lock').click();
      await page.waitForFunction(() => document.querySelector('#lock-value').textContent === 'ON');
      const blocked = await page.locator('#position').textContent();
      const tick = await page.locator('#ticks').textContent();
      await page.getByRole('button', {name: 'Move right', exact: true}).click();
      await page.waitForFunction(tick => Number(document.querySelector('#ticks').textContent.replaceAll(',', '')) > Number(tick.replaceAll(',', '')) + 12, tick);
      assert.equal(await page.locator('#position').textContent(), blocked);
      await page.locator('#demo').click();
      await page.waitForFunction(() => document.querySelector('#mode-label').textContent === 'REPLAY COMPLETE', null, {timeout: 15000});
      assert.equal(await page.locator('#score').textContent(), '4');
      assert.equal(await page.locator('#ticks').textContent(), '361');
      await page.locator('#camera').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal page overflow');
      await page.screenshot({path: path.join(evidence, name + '-guided.png'), fullPage: true});
      assert.deepEqual(errors, [], 'No browser JavaScript errors');
      await page.close();
      console.log(name + ': startup, touch movement, spawn, replay match, reset, input blocking, guided run, layout passed');
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
