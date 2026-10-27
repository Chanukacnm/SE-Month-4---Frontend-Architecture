// Usage: node lh.mjs <outDir> [mobile|desktop]
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';

const outDir = path.resolve(process.argv[2]);
const formFactor = process.argv[3] ?? 'mobile';
const BASE = 'http://localhost:4173';
const PAGES = [
  ['login', '/login', false],
  ['dashboard', '/', true],
  ['users', '/users', true],
  ['onboard', '/users/onboard', true],
  ['notifications', '/notifications', true],
];
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-sandbox'],
});

const session = JSON.stringify({
  state: { user: { id: 'adm_1', name: 'Alex Admin', email: 'admin@adminflow.io', role: 'admin' }, token: 'demo' },
  version: 0,
});

const summary = [];
for (const [name, route, auth] of PAGES) {
  const page = await browser.newPage();
  await page.goto(BASE + '/login');
  await page.evaluate((s, auth) => {
    localStorage.clear();
    if (auth) localStorage.setItem('adminflow-auth', s);
  }, session, auth);

  const result = await lighthouse(
    BASE + route,
    { output: 'html', logLevel: 'error', disableStorageReset: true, onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] },
    formFactor === 'desktop' ? desktopConfig : undefined,
    page,
  );
  const file = path.join(outDir, `lighthouse-${formFactor}-${name}.html`);
  fs.writeFileSync(file, result.report);
  const c = result.lhr.categories;
  const failing = Object.values(result.lhr.audits)
    .filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'manual' && a.scoreDisplayMode !== 'notApplicable')
    .map((a) => `${a.id}(${a.score})`);
  const row = {
    page: name,
    perf: Math.round(c.performance.score * 100),
    a11y: Math.round(c.accessibility.score * 100),
    bp: Math.round(c['best-practices'].score * 100),
    seo: Math.round(c.seo.score * 100),
    lcp: result.lhr.audits['largest-contentful-paint'].displayValue,
    cls: result.lhr.audits['cumulative-layout-shift'].displayValue,
    tbt: result.lhr.audits['total-blocking-time'].displayValue,
    failing: failing.join(' '),
  };
  summary.push(row);
  console.log(JSON.stringify(row));
  await page.close();
}
fs.writeFileSync(path.join(outDir, `summary-${formFactor}.json`), JSON.stringify(summary, null, 2));
await browser.close();
