import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
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
let testStage = 'browser startup';

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
  await locator.evaluate(element => {
    let ancestor = element;
    while (ancestor) {
      if (getComputedStyle(ancestor).position === 'fixed') return;
      ancestor = ancestor.parentElement;
    }
    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  });
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

const routes = ['/', '/arcade', '/roll-call'];

async function verifyPage(page, path, viewport) {
  testStage = `${viewport.label}: page ${path}`;
  const header = page.locator('.masthead nav');
  const mobile = page.locator('.mobile-nav');
  assert.equal(await header.locator('a[href="/"],a[href="/arcade"],a[href="/roll-call"]').count(), 3);
  assert.equal(await mobile.locator('a').count(), 3);
  for (const nav of [header, mobile]) {
    assert.equal(await nav.locator('a[aria-current="page"]').count(), 1, 'Only the current page gets aria-current');
    assert.equal(await nav.locator('a[aria-current="page"]').getAttribute('href'), path);
  }
  assert.equal(await mobile.isVisible(), viewport.mobile, 'Bottom navigation should be phone-only');
  if (viewport.mobile) {
    for (const link of await mobile.locator('a').all()) {
      const box = await link.boundingBox();
      assert.ok(box.height >= 44, 'Mobile page tabs must have comfortable tap targets');
      await checkHitTarget(link, `${viewport.label}: bottom page tab`);
    }
  }
  if (path === '/') {
    assert.equal(await page.locator('#batTrigger,#batFlightLayer,img[src="/assets/bat-flight.svg"]').count(), 0, 'Interactive bats must be removed');
    assert.equal(await page.locator('img[src="/assets/bat.svg"]').count(), 1, 'The static header brand remains');
    assert.equal(await page.locator('canvas,form,#leaderboardBody,#rollList').count(), 0, 'Party page must stay focused on party details');
    const apiResources = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname.startsWith('/api/')).length);
    assert.equal(apiResources, 0, 'Party details must load without community or game API requests');
    assert.equal(await page.locator('#days,#hours,#minutes,#seconds').count(), 4);
    if (viewport.width === 390) {
      const warning = await page.locator('.rock-warning').boundingBox();
      const tabs = await mobile.boundingBox();
      assert.ok(warning.y + warning.height <= tabs.y + 1,
        `Rock warning must fit the first phone screen: y=${warning.y}, height=${warning.height}, navTop=${tabs.y}`);
    }
    if (viewport.mobile) {
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      assert.ok(height <= viewport.height * 3.5, `Party page is too long for a phone: ${height}px`);
    }
  } else if (path === '/arcade') {
    assert.equal(await page.locator('#gameCanvas,#leaderboardBody,#scoreForm').count(), 3);
    assert.equal(await page.locator('#costumeForm,#rollList').count(), 0, 'Arcade must not include the costume form');
  } else {
    assert.equal(await page.locator('#costumeForm,#rollList').count(), 2);
    assert.equal(await page.locator('canvas,#scoreForm,#leaderboardBody').count(), 0, 'Roll call must not include the game');
  }
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(dimensions.width <= dimensions.viewport + 1, `${viewport.label} ${path} has horizontal overflow`);
  if (viewport.mobile) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => Math.abs(scrollY + innerHeight - document.documentElement.scrollHeight) < 2);
    const footer = await page.locator('.flyer-footer').boundingBox();
    const tabs = await mobile.boundingBox();
    assert.ok(footer.y + footer.height <= tabs.y + 1, 'Fixed navigation must not cover the footer');
  }
}


try {
  await waitForServer();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const viewport of [
    { label: 'desktop', width: 1440, height: 1000, mobile: false },
    { label: 'phone', width: 390, height: 844, mobile: true },
    { label: 'small-phone', width: 320, height: 740, mobile: true }
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce',
      isMobile: viewport.mobile, hasTouch: viewport.mobile
    });
    await context.route('https://www.instagram.com/**', route => route.fulfill({
      status: 200, contentType: 'text/html', body: '<!doctype html><title>Instagram navigation intercepted</title>'
    }));
    await context.route('https://calendar.google.com/**', route => route.fulfill({
      status: 200, contentType: 'text/html', body: '<!doctype html><title>Google Calendar navigation intercepted</title>'
    }));
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    for (const [index, path] of routes.entries()) {
      const response = await page.goto(origin + path, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200, `${path} must be a real page`);
      await verifyPage(page, path, viewport);
      const target = routes[(index + 1) % routes.length];
      const navigation = viewport.mobile ? '.mobile-nav' : '.masthead nav';
      const link = page.locator(`${navigation} a[href="${target}"]`);
      await checkHitTarget(link, `${viewport.label}: ${path} to ${target}`);
      await link.click();
      await page.waitForURL(url => url.pathname === target);
      await page.waitForLoadState('networkidle');
      assert.equal(await page.locator(`${navigation} a[aria-current="page"]`).getAttribute('href'), target);
    }
    await page.goto(origin, { waitUntil: 'networkidle' });
    testStage = `${viewport.label}: Instagram and calendars`;
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


    assert.deepEqual(runtimeErrors, [], 'All three pages must avoid runtime errors');
    console.log(JSON.stringify({ viewport: viewport.label, verified: true,
      checks: ['real three-page navigation', 'correct current-page states', 'phone bottom tabs',
        'focused compact party page without backend fetch', 'separate arcade and roll-call forms',
        'Instagram links and logos', 'Google Calendar popup', 'ICS download', 'no overflow or hidden footer'] }));
    await context.close();
  }
} catch (error) {
  const message = String(error?.message || 'Browser check failed')
    .replace(/https?:\/\/\S+/g, '[URL]').replace(/[^\x20-\x7e]/g, ' ').replace(/\s+/g, ' ');
  const diagnosis = `${testStage}: ${message}`.slice(0, 250);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `diag=${diagnosis}\n`);
  throw error;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
