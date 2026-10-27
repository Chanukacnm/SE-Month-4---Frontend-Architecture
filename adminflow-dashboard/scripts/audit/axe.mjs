// Usage: node axe.mjs <outFile.json>
// Runs axe-core (WCAG 2.0/2.1 A+AA rules) over every page and interactive state, in light and dark themes,
// plus scripted keyboard checks.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const BASE = 'http://localhost:4173';
const out = process.argv[2] ?? 'axe.json';

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function setTheme(theme) {
  await page.evaluate((t) => localStorage.setItem('adminflow-theme', JSON.stringify({ state: { theme: t }, version: 0 })), theme);
}
async function login() {
  await page.evaluate(() =>
    localStorage.setItem(
      'adminflow-auth',
      JSON.stringify({ state: { user: { id: 'adm_1', name: 'Alex Admin', email: 'admin@adminflow.io', role: 'admin' }, token: 'demo' }, version: 0 }),
    ),
  );
}
async function axe(label) {
  await page.evaluate(axeSource);
  const res = await page.evaluate(() =>
    window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } }),
  );
  const v = res.violations.map((x) => ({ id: x.id, impact: x.impact, nodes: x.nodes.length, sample: x.nodes[0]?.target.join(' ') }));
  results.push({ state: label, violations: v, passes: res.passes.length, incomplete: res.incomplete.map((x) => x.id) });
  console.log(`${label}: ${v.length} violations ${v.map((x) => `${x.id}[${x.impact}]x${x.nodes} @ ${x.sample}`).join(' | ')}`);
}

const results = [];
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
};

for (const theme of ['light', 'dark']) {
  await page.goto(BASE + '/login');
  await page.evaluate(() => localStorage.clear());
  await setTheme(theme);
  await page.goto(BASE + '/login', { waitUntil: 'networkidle0' });
  await axe(`${theme} /login`);

  // Login validation errors
  await page.click('button[type=submit]');
  await wait(200);
  await axe(`${theme} /login (validation errors)`);

  await login();
  for (const route of ['/', '/users', '/users/onboard', '/notifications', '/does-not-exist']) {
    await page.goto(BASE + route, { waitUntil: 'networkidle0' });
    await wait(900);
    await axe(`${theme} ${route}`);
  }

  // Users: create modal + validation
  await page.goto(BASE + '/users?new=1', { waitUntil: 'networkidle0' });
  await wait(900);
  await page.click('button[form=user-form]');
  await wait(300);
  await axe(`${theme} /users create modal (errors)`);

  // Delete dialog
  await page.keyboard.press('Escape');
  await wait(200);
  await page.click('button[aria-label^="Delete "]');
  await wait(300);
  await axe(`${theme} /users delete dialog`);
  await page.keyboard.press('Escape');

  // Notification popover
  await page.click('button[aria-controls][aria-label^="Notifications"]');
  await wait(200);
  await axe(`${theme} notification popover`);
  await page.keyboard.press('Escape');

  // Mobile drawer
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await wait(900);
  await axe(`${theme} mobile dashboard`);
  await page.click('button[aria-controls="mobile-nav"]');
  await wait(300);
  await axe(`${theme} mobile drawer open`);
  await page.setViewport({ width: 1280, height: 900 });

  // Wizard step 2 with errors
  await page.goto(BASE + '/users/onboard', { waitUntil: 'networkidle0' });
  await wait(900);
  await page.type('input[autocomplete=name]', 'Test Person');
  await page.type('input[type=email]', 'test.person@example.com');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Continue')).click());
  await wait(300);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Continue')).click());
  await wait(300);
  await axe(`${theme} wizard step 2 (errors)`);
}

// ---------- Keyboard / focus checks (light theme) ----------
await setTheme('light');
await page.goto(BASE + '/login');
await page.evaluate(() => localStorage.removeItem('adminflow-auth'));
await page.goto(BASE + '/users', { waitUntil: 'networkidle0' });
check('Protected route redirects to /login when signed out', page.url().endsWith('/login'), page.url());

// Keyboard login
await page.goto(BASE + '/login', { waitUntil: 'networkidle0' });
await page.keyboard.press('Tab');
const skip = await page.evaluate(() => document.activeElement?.textContent);
check('First Tab stop is the skip link', skip?.includes('Skip to main content'), skip);
await page.focus('input[type=email]');
await page.keyboard.type('admin@adminflow.io');
await page.keyboard.press('Tab');
await page.keyboard.type('wrong');
await page.keyboard.press('Enter');
await wait(1200);
const errFocus = await page.evaluate(() => document.activeElement?.getAttribute('autocomplete'));
check('Failed login moves focus back to password', errFocus === 'current-password', errFocus);
const alertShown = await page.evaluate(() => !!document.querySelector('[role=alert]')?.textContent.includes('Invalid'));
check('Failed login shows role=alert message', alertShown);
await page.click('input[autocomplete=current-password]', { clickCount: 3 });
await page.keyboard.type('Admin@123');
await page.keyboard.press('Enter');
await wait(1500);
check('Keyboard login returns user to the originally requested page (/users)', page.url() === BASE + '/users', page.url());
await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
await wait(900);
const metrics = await page.evaluate(() => document.querySelectorAll('article h3').length);
check('Dashboard renders 4 metric cards', metrics === 4, String(metrics));

// Route change focus
await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
await wait(800);
await page.click('nav[aria-label=Main] a[href="/users"]');
await wait(1200);
const focused = await page.evaluate(() => document.activeElement?.tagName + ':' + document.activeElement?.textContent);
check('Route change moves focus to page h1', focused.startsWith('H1:Users'), focused);
const title = await page.title();
check('Route change updates document title', title === 'Users · AdminFlow', title);

// Debounced search
let calls = 0;
page.on('framenavigated', () => calls++);
await page.focus('input[type=search]');
await page.keyboard.type('priya', { delay: 40 });
await wait(1500);
const urlQ = new URL(page.url()).searchParams.get('q');
check('Debounced search writes final query to URL', urlQ === 'priya', urlQ);
const rows = await page.evaluate(() => [...document.querySelectorAll('tbody th[scope=row]')].map((t) => t.textContent));
check('Search filters table rows', rows.length > 0 && rows.every((r) => r.toLowerCase().includes('priya')), rows.slice(0, 3).join(', '));

// Sorting announces via aria-sort
await page.goto(BASE + '/users', { waitUntil: 'networkidle0' });
await wait(900);
await page.evaluate(() => [...document.querySelectorAll('th button')].find((b) => b.textContent.startsWith('Name')).click());
await wait(1000);
const sortAttr = await page.evaluate(() => [...document.querySelectorAll('th')].find((t) => t.textContent.startsWith('Name')).getAttribute('aria-sort'));
check('Sortable header exposes aria-sort', sortAttr === 'ascending', sortAttr);

// Modal focus trap + restore
const editBtn = 'button[aria-label^="Edit "]';
await page.focus(editBtn);
const triggerLabel = await page.evaluate(() => document.activeElement.getAttribute('aria-label'));
await page.keyboard.press('Enter');
await wait(300);
const inDialog = await page.evaluate(() => !!document.activeElement.closest('[role=dialog]'));
check('Opening modal moves focus inside dialog', inDialog);
for (let i = 0; i < 15; i++) await page.keyboard.press('Tab');
const stillIn = await page.evaluate(() => !!document.activeElement.closest('[role=dialog]'));
check('Tab is trapped inside modal', stillIn);
const inert = await page.evaluate(() => document.getElementById('root').hasAttribute('inert'));
check('Background is inert while modal is open', inert);
await page.keyboard.press('Escape');
await wait(300);
const restored = await page.evaluate(() => document.activeElement.getAttribute('aria-label'));
check('Escape closes modal and restores focus to trigger', restored === triggerLabel, `${restored}`);

// Optimistic edit
await page.click(editBtn);
await wait(300);
const nameInput = await page.$('[role=dialog] input[autocomplete=off]');
await nameInput.click({ clickCount: 3 });
await page.keyboard.type('Optimistic Name');
await page.click('button[form=user-form]');
await wait(60);
const optimistic = await page.evaluate(() => [...document.querySelectorAll('tbody th')].some((t) => t.textContent.includes('Optimistic Name')));
check('Edit shows in table before server responds (optimistic)', optimistic);
await wait(1200);

// Delete dialog initial focus on Cancel
await page.click('button[aria-label^="Delete "]');
await wait(300);
const delFocus = await page.evaluate(() => document.activeElement.textContent);
check('Delete dialog focuses Cancel first', delFocus === 'Cancel', delFocus);
const role = await page.evaluate(() => document.querySelector('[role=alertdialog]') !== null);
check('Delete confirmation uses role=alertdialog', role);
await page.keyboard.press('Escape');

// Tabs keyboard
await page.goto(BASE + '/notifications', { waitUntil: 'networkidle0' });
await wait(800);
await page.focus('[role=tab][aria-selected=true]');
await page.keyboard.press('ArrowRight');
const tabSel = await page.evaluate(() => document.activeElement.getAttribute('aria-selected') + ':' + document.activeElement.textContent);
check('Tabs: ArrowRight moves and selects next tab', tabSel.startsWith('true:Unread'), tabSel);

// Wizard billing rule jumps back to step 2
await page.goto(BASE + '/users/onboard', { waitUntil: 'networkidle0' });
await wait(800);
await page.type('input[autocomplete=name]', 'Wiz User');
await page.type('input[type=email]', 'wiz.user@example.com');
const clickText = (t) => page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t)).click(), t);
await clickText('Continue');
await wait(300);
const h2 = await page.evaluate(() => document.activeElement.textContent);
check('Wizard focuses step heading on Next', h2.includes('Step 2'), h2);
const dept = await page.$$('main select');
await dept[1].select('Sales');
await page.evaluate(() => document.querySelector('input[value=billing]').click());
await clickText('Continue');
await wait(300);
const blocked = await page.evaluate(() => document.querySelector('h2[tabindex]')?.textContent + ' | ' + !!document.body.textContent.includes('Only admins can be given billing access'));
check('Wizard blocks Access step when non-admin gets billing (cross-field Zod refine)', blocked.includes('Step 2') && blocked.endsWith('true'), blocked);
await page.select('main select', 'admin');
await clickText('Continue');
await wait(300);
await page.evaluate(() => [...document.querySelectorAll('label')].find((l) => l.textContent.includes('I confirm')).click());
await clickText('Create and invite');
await wait(1500);
check('Wizard submit creates user and navigates to /users', page.url().endsWith('/users'), page.url());

fs.writeFileSync(out, JSON.stringify({ results, checks }, null, 2));
const total = results.reduce((n, r) => n + r.violations.length, 0);
console.log(`\nTOTAL axe violations: ${total} across ${results.length} states; checks passed ${checks.filter((c) => c.ok).length}/${checks.length}`);
await browser.close();
