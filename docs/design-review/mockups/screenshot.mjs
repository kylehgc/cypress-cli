// Usage: node mockups/screenshot.mjs <url> <output-path> [--scroll-bottom]
import { chromium } from 'playwright';

const [, , url, output, ...flags] = process.argv;
if (!url || !output) {
	console.error(
		'Usage: node mockups/screenshot.mjs <url> <output-path> [--scroll-bottom]',
	);
	process.exit(1);
}

const scrollBottom = flags.includes('--scroll-bottom');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(url, { waitUntil: 'networkidle' });

if (scrollBottom) {
	await page.keyboard.press('End');
	await page.waitForTimeout(500);
}

await page.screenshot({ path: output, fullPage: false });
await browser.close();
console.log(`Screenshot saved: ${output}`);
