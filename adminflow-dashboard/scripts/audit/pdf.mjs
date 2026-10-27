// Usage: node pdf.mjs <reportsDir> <out.pdf>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';

const dir = path.resolve(process.argv[2]);
const outFile = path.resolve(process.argv[3]);
const mobile = JSON.parse(fs.readFileSync(path.join(dir, 'summary-mobile.json'), 'utf8'));
const desktop = JSON.parse(fs.readFileSync(path.join(dir, 'summary-desktop.json'), 'utf8'));
const ROUTES = { login: '/login', dashboard: '/', users: '/users', onboard: '/users/onboard', notifications: '/notifications' };

const rows = (data) =>
  data
    .map(
      (r) =>
        `<tr><th>${r.page}<small>${ROUTES[r.page]}</small></th>${[r.perf, r.a11y, r.bp, r.seo].map((s) => `<td class="${s >= 90 ? 'g' : 'o'}">${s}</td>`).join('')}<td>${r.lcp}</td><td>${r.tbt}</td><td>${r.cls}</td></tr>`,
    )
    .join('');
const table = (title, data) => `<h2>${title}</h2><table><thead><tr><th>Page</th><th>Perf.</th><th>A11y</th><th>Best pr.</th><th>SEO</th><th>LCP</th><th>TBT</th><th>CLS</th></tr></thead><tbody>${rows(data)}</tbody></table>`;

const cover = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font:14px/1.5 system-ui,Segoe UI,sans-serif;color:#0f172a;margin:48px}
h1{font-size:26px;margin:0}h2{font-size:17px;margin:28px 0 8px}
p.meta{color:#475569;margin:4px 0 0}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #e2e8f0;padding:7px 8px;text-align:left}
thead th{background:#f1f5f9;font-size:12px;text-transform:uppercase;letter-spacing:.03em}
tbody th small{display:block;font-weight:400;color:#64748b;font-family:monospace}
td.g{color:#047857;font-weight:700}td.o{color:#b45309;font-weight:700}
ul{padding-left:18px}
</style></head><body>
<h1>AdminFlow Dashboard — Lighthouse Report</h1>
<p class="meta">Month 4 · Frontend Architecture · Generated ${new Date().toISOString().slice(0, 10)} · Lighthouse 12.2.1 · Chrome (headless)</p>
<p class="meta">Target: Performance ≥ 90 on every page. Production build (<code>npm run build</code> + <code>vite preview</code>), authenticated session for protected routes.</p>
${table('Mobile (Moto G Power emulation, 4× CPU slowdown, slow 4G)', mobile)}
${table('Desktop preset', desktop)}
<h2>Optimisations behind these scores</h2>
<ul>
<li>Route-level code splitting with <code>React.lazy</code> — each page is its own chunk; forms/validation (react-hook-form + zod) never load on the initial request.</li>
<li>Vendor chunking (react / data / forms) for long-term caching.</li>
<li>Dependency-free SVG line chart instead of a charting library (~100 kB saved on the dashboard).</li>
<li>System font stack — no web-font requests; inline SVG icons — no icon font.</li>
<li>Skeleton placeholders with fixed dimensions → CLS ≈ 0.</li>
<li>React Query caching + <code>keepPreviousData</code> to avoid refetch flicker; memoised presentational components.</li>
</ul>
<p class="meta">The following pages contain the full Lighthouse report for each page (mobile first, then desktop).</p>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const merged = await PDFDocument.create();

async function addPdf(bytes) {
  const doc = await PDFDocument.load(bytes);
  const pages = await merged.copyPages(doc, doc.getPageIndices());
  pages.forEach((p) => merged.addPage(p));
}

await page.setContent(cover, { waitUntil: 'load' });
await addPdf(await page.pdf({ format: 'A4', printBackground: true }));

for (const ff of ['mobile', 'desktop']) {
  for (const name of Object.keys(ROUTES)) {
    const file = path.join(dir, `lighthouse-${ff}-${name}.html`);
    await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle0' });
    await addPdf(await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '8mm', right: '8mm' } }));
    console.log('added', ff, name);
  }
}
fs.writeFileSync(outFile, await merged.save());
console.log('wrote', outFile, merged.getPageCount(), 'pages');
await browser.close();
