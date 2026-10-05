// The README's screenshots, step two: render.ts's HTML pages become PNGs with Playwright's chromium.
// Not part of the gates (it needs a browser): run it when a view changes, and commit the PNGs.
//
//   npm install --no-save playwright-core && npx playwright-core install chromium   # once
//   node docs/screens/shoot.mjs
//
// Env: CHROMIUM=<path to a chromium binary> to use one that is already on the machine.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const here = import.meta.dirname;
const pages = mkdtempSync(join(tmpdir(), 'tab-recap-screens-'));

try {
    execFileSync(process.execPath, ['--no-warnings', join(here, 'render.ts'), pages], { stdio: 'inherit' });
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
    const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1000, height: 800 } });
    const page = await context.newPage();
    for (const file of readdirSync(pages).filter((name) => name.endsWith('.html')).toSorted()) {
        await page.goto(pathToFileURL(join(pages, file)).href);
        const png = join(here, file.replace(/\.html$/, '.png'));
        await page.locator('body').screenshot({ path: png });
        process.stdout.write(`${png}\n`);
    }
    await browser.close();
} finally {
    rmSync(pages, { recursive: true, force: true });
}
