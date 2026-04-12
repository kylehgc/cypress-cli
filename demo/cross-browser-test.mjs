import { chromium, firefox, webkit } from 'playwright';

const TEST_URL = 'http://localhost:5555/demo/driver-test.html';

async function testBrowser(browserType, name) {
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage();
  const consoleMsgs = [];
  const errors = [];
  page.on('console', (msg) => consoleMsgs.push('[' + msg.type() + '] ' + msg.text()));
  page.on('pageerror', (err) => errors.push(err.message));

  try {
    await page.goto(TEST_URL, { waitUntil: 'load' });
    await page.waitForFunction(
      () => {
        const log = document.getElementById('log');
        if (!log) return false;
        const text = log.innerText;
        return text.includes('ALL EXTENDED TESTS PASSED') || text.includes('FATAL');
      },
      { timeout: 30000 },
    );
    const logText = await page.innerText('#log');
    const mvpPassed = logText.includes('ALL MVP TESTS PASSED');
    const extPassed = logText.includes('ALL EXTENDED TESTS PASSED');
    const passed = mvpPassed && extPassed;
    console.log('\n' + '='.repeat(60));
    console.log('Browser: ' + name + ' (' + browser.version() + ')');
    console.log('MVP: ' + (mvpPassed ? 'PASS' : 'FAIL'));
    console.log('Extended: ' + (extPassed ? 'PASS' : 'FAIL'));
    console.log('Result: ' + (passed ? 'PASS' : 'FAIL'));
    console.log('='.repeat(60));
    console.log(logText);
    if (errors.length > 0) {
      console.log('\n--- Page Errors ---');
      errors.forEach((m) => console.log(m));
    }
    return { name, version: browser.version(), passed, mvpPassed, extPassed };
  } catch (err) {
    let logText = '';
    try { logText = await page.innerText('#log'); } catch {}
    console.log('\n' + '='.repeat(60));
    console.log('Browser: ' + name);
    console.log('Result: FAIL (' + err.message.split('\n')[0] + ')');
    console.log('='.repeat(60));
    if (logText) console.log(logText);
    if (consoleMsgs.length > 0) {
      console.log('\n--- Console ---');
      consoleMsgs.slice(0, 30).forEach((m) => console.log(m));
    }
    if (errors.length > 0) {
      console.log('\n--- Page Errors ---');
      errors.forEach((m) => console.log(m));
    }
    return { name, version: 'unknown', passed: false };
  } finally {
    await browser.close();
  }
}

const results = [];
results.push(await testBrowser(chromium, 'Chromium'));
results.push(await testBrowser(firefox, 'Firefox'));
results.push(await testBrowser(webkit, 'WebKit'));

console.log('\n' + '='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
for (const r of results) {
  console.log('  ' + r.name + ' (' + r.version + '): ' + (r.passed ? 'PASS' : 'FAIL'));
}
process.exit(results.every((r) => r.passed) ? 0 : 1);
