import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

// Only a local, in-memory site is tested. No production guest or score data.
const port = 4317;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('../', import.meta.url),
  env: { ...process.env, PORT: String(port), NODE_ENV: 'test',
    DEVELOPMENT_STORE: 'memory', APP_ORIGIN: origin },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverOutput = '';
for (const stream of [server.stdout, server.stderr]) {
  stream.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-4000); });
}
let browser;

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (server.exitCode !== null) throw new Error(`Local server exited: ${serverOutput}`);
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Local server did not start: ${serverOutput}`);
}

async function checkHitTarget(locator, label) {
  await locator.scrollIntoViewIfNeeded();
  const hit = await locator.evaluate(link => {
    const rect = link.getBoundingClientRect();
    const element = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      receivesClick: element === link || link.contains(element),
      interceptedBy: element ? `${element.tagName}.${element.className?.baseVal ?? element.className}` : 'nothing'
    };
  });
  assert.ok(hit.receivesClick, `${label} is covered by ${hit.interceptedBy}`);
}

try {
  await waitForServer();
  browser = await chromium.launch({ channel: 'chrome', headless: true });

  for (const viewport of [
    { label: 'desktop', width: 1440, height: 1000 },
    { label: 'mobile', width: 390, height: 844 }
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'reduce',
      isMobile: viewport.label === 'mobile',
      hasTouch: viewport.label === 'mobile'
    });
    // A real click opens a popup, but Instagram itself is never contacted.
    await context.route('https://www.instagram.com/**', route => route.fulfill({
      status: 200, contentType: 'text/html',
      body: '<!doctype html><title>Instagram navigation intercepted</title>'
    }));
    await context.route('https://calendar.google.com/**', route => route.fulfill({
      status: 200, contentType: 'text/html',
      body: '<!doctype html><title>Google Calendar navigation intercepted</title>'
    }));
    const page = await context.newPage();
    const homepage = await page.goto(origin, { waitUntil: 'networkidle' });
    assert.equal(homepage.status(), 200, 'Local homepage must return HTTP 200');

    const links = await page.locator('.masthead a[href^="#"]').evaluateAll(nodes =>
      nodes.map(node => ({ href: node.getAttribute('href'), text: node.innerText.trim() }))
    );
    assert.equal(links.length, 4, 'Brand plus all three header section links must exist');

    for (const link of links) {
      await page.goto(origin, { waitUntil: 'networkidle' });
      const locator = page.locator(`.masthead a[href="${link.href}"]`);
      assert.equal(await page.locator(link.href).count(), 1, `${link.href} target must exist`);
      await checkHitTarget(locator, `${viewport.label}: ${link.text}`);
      await locator.click({ timeout: 5000 });
      await page.waitForFunction(hash => location.hash === hash, link.href);
      assert.equal(new URL(page.url()).hash, link.href, `${link.text} should navigate`);
    }

    await page.goto(origin, { waitUntil: 'networkidle' });
    const instagram = page.locator('a[href^="https://www.instagram.com/"]');
    assert.equal(await instagram.count(), 2, 'Header and footer Instagram links must exist');
    const destination = await instagram.first().getAttribute('href');
    const instagramUrl = new URL(destination);
    assert.equal(instagramUrl.origin, 'https://www.instagram.com');
    assert.equal(instagramUrl.pathname.replace(/\/+$/, ''), '/rocktober_ss119_4', 'Instagram must use the updated account');
    const username = new URL(destination).pathname.replaceAll('/', '');
    const visibleText = await page.locator('body').innerText();
    assert.ok(!visibleText.toLowerCase().includes(username.toLowerCase()), 'Instagram username must not appear in visible copy');

    for (let index = 0; index < 2; index++) {
      const link = instagram.nth(index);
      assert.equal((await link.textContent()).trim(), 'Instagram', 'Instagram source label must be exactly Instagram');
      assert.equal((await link.innerText()).trim().toLowerCase(), 'instagram', 'Instagram rendered label must contain only Instagram');
      assert.equal(await link.getAttribute('href'), destination);
      const logo = link.locator('img[src="/assets/instagram.svg"]');
      assert.equal(await logo.count(), 1, 'Each Instagram link must include its logo');
      assert.ok(await logo.evaluate(image => image.complete && image.naturalWidth > 0), 'Instagram logo must load');
      await checkHitTarget(link, `${viewport.label}: Instagram link ${index + 1}`);
      const popupPromise = context.waitForEvent('page', { timeout: 5000 });
      await link.click({ timeout: 5000 });
      const popup = await popupPromise;
      await popup.waitForURL(destination, { timeout: 5000 });
      assert.equal(popup.url(), destination, 'Instagram click must open its real destination');
      await popup.close();
    }

    const calendar = page.locator('a.calendar-link');
    const calendarUrl = new URL(await calendar.getAttribute('href'));
    assert.equal(calendarUrl.origin, 'https://calendar.google.com');
    assert.equal(calendarUrl.searchParams.get('action'), 'TEMPLATE');
    assert.equal(calendarUrl.searchParams.get('text'), 'Rocktober');
    assert.equal(calendarUrl.searchParams.get('dates').split('/')[0], '20261101T000000Z');
    assert.equal(calendarUrl.searchParams.get('ctz'), 'America/New_York');
    assert.ok(calendarUrl.searchParams.get('location').includes('Sloan Street Apartments'));
    assert.ok(calendarUrl.searchParams.get('location').includes('Clemson'));
    assert.ok(calendarUrl.searchParams.get('details').includes('Swell'));
    assert.ok(calendarUrl.searchParams.get('details').includes('DJ Campbell'));
    assert.equal(await calendar.getAttribute('download'), null);
    await checkHitTarget(calendar, `${viewport.label}: Google Calendar`);
    const calendarPopupPromise = context.waitForEvent('page', { timeout: 5000 });
    await calendar.click();
    const calendarPopup = await calendarPopupPromise;
    await calendarPopup.waitForURL(url => url.origin === calendarUrl.origin, { timeout: 5000 });
    assert.equal(new URL(calendarPopup.url()).searchParams.get('dates'), calendarUrl.searchParams.get('dates'));
    await calendarPopup.close();

    const calendarDownload = page.locator('a.calendar-download');
    assert.equal(await calendarDownload.getAttribute('href'), '/rocktober.ics');
    assert.equal(await calendarDownload.getAttribute('download'), 'rocktober.ics');
    const downloading = page.waitForEvent('download');
    await calendarDownload.click();
    const download = await downloading;
    assert.equal(download.suggestedFilename(), 'rocktober.ics');
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const calendarText = Buffer.concat(chunks).toString('utf8');
    assert.ok(calendarText.includes('DTSTART:20261101T000000Z'), 'Calendar must start at Halloween 8 PM Eastern');

    const dimensions = await page.evaluate(() => ({
      viewport: innerWidth, width: document.documentElement.scrollWidth
    }));
    assert.ok(dimensions.width <= dimensions.viewport + 1,
      `${viewport.label} has horizontal overflow: ${JSON.stringify(dimensions)}`);
    console.log(JSON.stringify({ viewport: viewport.label, verified: true,
      checks: ['header hit targets', 'all section-link clicks', 'both Instagram popups',
        'Instagram logos and updated account', 'Instagram-only labels', 'no visible username',
        'prefilled Google Calendar popup', 'ICS download and date', 'no horizontal overflow'] }));
    await context.close();
  }
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
