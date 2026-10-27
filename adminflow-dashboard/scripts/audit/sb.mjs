// Loads every story, waits for render + play function, reports errors and axe violations.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const BASE = 'http://localhost:6006';
const index = await (await fetch(`${BASE}/index.json`)).json();
const stories = Object.values(index.entries).filter((e) => e.type === 'story');

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
let failures = 0;
const components = new Set();
for (const s of stories) {
  components.add(s.title);
  const errors = [];
  const onErr = (e) => errors.push(e.message);
  page.on('pageerror', onErr);
  await page.goto(`${BASE}/iframe.html?id=${s.id}&viewMode=story`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1200)); // allow play functions to finish
  const state = await page.evaluate(() => ({
    error: document.body.classList.contains('sb-show-errordisplay') ? document.querySelector('#error-message')?.textContent : null,
    empty: document.querySelector('#storybook-root')?.childElementCount === 0 && !document.querySelector('[role=dialog]'),
  }));
  await page.evaluate(axeSource);
  const axe = await page.evaluate(() =>
    window.axe.run(document.querySelector('#storybook-root').parentElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    }),
  );
  page.off('pageerror', onErr);
  const v = axe.violations.map((x) => `${x.id}x${x.nodes.length}`);
  const ok = !state.error && !state.empty && errors.length === 0 && v.length === 0;
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${s.id}${state.error ? ' ERR:' + state.error : ''}${state.empty ? ' EMPTY' : ''}${errors.length ? ' PAGEERR:' + errors.join(';') : ''}${v.length ? ' AXE:' + v.join(',') : ''}`);
}
console.log(`\n${stories.length} stories across ${components.size} components, ${failures} failing`);
await browser.close();
