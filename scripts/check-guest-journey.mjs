import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const liveOnly = process.argv.includes('--live');
const origin = liveOnly ? new URL(process.env.LIVE_SITE || 'https://rocktober-dun.vercel.app').origin : 'http://127.0.0.1:4319';
let server, browser;
const releases = [];
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const matching = (path, method = 'GET') => response =>
  new URL(response.url()).pathname === path && response.request().method() === method;
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function startLocal() {
  server = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: '4319', NODE_ENV: 'test', DEVELOPMENT_STORE: 'memory', APP_ORIGIN: origin },
    stdio: 'ignore'
  });
  for (let i = 0; i < 50; i++) {
    if (server.exitCode !== null) throw new Error('Local memory server exited');
    try { if ((await fetch(`${origin}/api/health`)).ok) return; } catch {}
    await pause(200);
  }
  throw new Error('Local memory server did not start');
}

async function waitForPublishedCalendar() {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/rocktober.ics`, {
        cache: 'no-store', signal: AbortSignal.timeout(5000)
      });
      if (response.ok && (await response.text()).includes('DTSTART:20261101T000000Z')) {
        const homepage = await fetch(origin, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
        const text = await homepage.text();
        if (homepage.ok && text.includes('mobile-nav') && !text.includes('id="gameCanvas"')) {
          const arcade = await fetch(origin + '/arcade', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
          const roll = await fetch(origin + '/roll-call', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
          if (arcade.ok && roll.ok && (await arcade.text()).includes('id="gameCanvas"') && (await roll.text()).includes('id="costumeForm"')) return;
        }
      }
    } catch {}
    await pause(2000);
  }
  throw new Error('The three-page deployment was not ready within 120 seconds');
}

async function localJourney() {
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const other = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const a = await mobile.newPage(), b = await other.newPage();
  const runtimeErrors = [];
  a.on('pageerror', error => runtimeErrors.push(error.message));
  b.on('pageerror', error => runtimeErrors.push(error.message));

  // Make the very first community request deliberately slow. Start must wait
  // for its ownership cookie instead of racing it with a second new session.
  const initialSeen = deferred(), releaseInitial = deferred();
  releases.push(releaseInitial.resolve);
  let heldInitial = false, startRequests = 0;
  await mobile.route('**/api/community', async route => {
    if (!heldInitial) {
      heldInitial = true;
      initialSeen.resolve();
      await releaseInitial.promise;
    }
    await route.continue();
  });
  a.on('request', request => {
    if (new URL(request.url()).pathname === '/api/runs/start') startRequests++;
  });
  await a.goto(origin + '/arcade', { waitUntil: 'domcontentloaded' });
  await a.bringToFront();
  await Promise.race([initialSeen.promise, pause(5000).then(() => { throw new Error('Initial community bootstrap was not requested'); })]);
  const startedResponse = a.waitForResponse(matching('/api/runs/start', 'POST'));
  await a.locator('#startGame').tap();
  await a.waitForFunction(() => document.getElementById('startGame').textContent.includes('Opening'));
  assert.equal(startRequests, 0, 'Game start must wait for the first community session');
  releaseInitial.resolve();
  const started = await startedResponse;
  assert.equal(started.status(), 201, 'First-visit game must start a verified run');
  const opened = await started.json();
  await mobile.unroute('**/api/community');
  await a.waitForFunction(() => document.getElementById('startGame').textContent === 'Pause run');

  await a.locator('#leftButton').tap();
  await pause(80);
  await a.keyboard.press('ArrowRight');
  await pause(80);
  await a.locator('#startGame').tap();
  await a.waitForFunction(() => document.getElementById('startGame').textContent === 'Resume run');
  const pausedScore = await a.locator('#rockScore').textContent();
  await pause(350);
  assert.equal(await a.locator('#rockScore').textContent(), pausedScore, 'Pause must freeze the game');
  await a.locator('#startGame').tap();
  await a.waitForFunction(() => document.getElementById('startGame').textContent === 'Pause run');
  await a.waitForFunction(() => !document.getElementById('bankGame').disabled);
  await a.locator('#bankGame').tap();

  await a.locator('#playerName').fill('Local Arcade');
  const scoreResponse = a.waitForResponse(matching('/api/runs/finish', 'POST'));
  await a.locator('#submitScore').tap();
  const verified = await scoreResponse;
  assert.equal(verified.status(), 200, 'Banked score must pass server replay');
  const score = await verified.json();
  const replay = verified.request().postDataJSON();
  assert.equal(replay.runId, opened.id, 'Pause and resume must keep the same verified run');
  assert.ok(replay.actions.some(action => action.direction === -1), 'Touch lane movement must be recorded');
  assert.ok(replay.actions.some(action => action.direction === 1), 'Keyboard lane movement must be recorded');
  assert.ok(replay.endTick >= 60, 'At least one second of gameplay must be banked');
  assert.ok(score.score >= 5, 'Score must include verified survival points');
  await a.waitForFunction(() => document.getElementById('scoreStatus').textContent.includes('Verified:'));

  await b.goto(origin + '/arcade', { waitUntil: 'networkidle' });
  await b.waitForFunction(() => document.getElementById('leaderboardBody').textContent.includes('Local Arcade'));

  await a.goto(origin + '/roll-call', { waitUntil: 'networkidle' });
  await b.goto(origin + '/roll-call', { waitUntil: 'networkidle' });
  await a.locator('#guestName').fill('Local Specter');
  await a.locator('#costumeIdea').fill('Ghost');
  const addedResponse = a.waitForResponse(matching('/api/costumes', 'POST'));
  await a.locator('#costumeSubmit').tap();
  assert.equal((await addedResponse).status(), 200);
  await a.waitForFunction(() => document.querySelector('#rollList .entry-costume')?.textContent === 'Ghost');
  await b.locator('#refreshCommunity').click();
  await b.waitForFunction(() => document.getElementById('rollList').textContent.includes('Local Specter'));
  assert.equal(await b.locator('#deleteMyCostume').isVisible(), false, 'Other visitors must not get an owner-delete control');
  assert.equal(await b.locator('#rollList button').count(), 0, 'Shared rows must not contain delete controls');

  // Return a stale GET after a successful write. The queued refresh must then
  // fetch the updated costume rather than leave the old version on screen.
  const oldCommunity = await (await a.request.get(`${origin}/api/community`)).json();
  const staleSeen = deferred(), releaseStale = deferred();
  releases.push(releaseStale.resolve);
  let heldStale = false;
  await mobile.route('**/api/community', async route => {
    if (!heldStale) {
      heldStale = true;
      staleSeen.resolve();
      await releaseStale.promise;
      await route.fulfill({ status: 200, contentType: 'application/json',
        headers: { 'x-rocktober-test-stale': '1' }, body: JSON.stringify(oldCommunity) });
    } else await route.continue();
  });
  await a.locator('#refreshCommunity').tap();
  await Promise.race([staleSeen.promise, pause(5000).then(() => { throw new Error('Stale GET race was not exercised'); })]);
  await a.locator('#costumeIdea').fill('Vampire');
  const updatedResponse = a.waitForResponse(matching('/api/costumes', 'POST'));
  await a.locator('#costumeSubmit').tap();
  assert.equal((await updatedResponse).status(), 200);
  const freshResponse = a.waitForResponse(response => matching('/api/community')(response) && !response.headers()['x-rocktober-test-stale']);
  releaseStale.resolve();
  assert.equal((await freshResponse).status(), 200, 'A fresh GET must run after the stale response');
  await a.waitForFunction(() => document.querySelector('#rollList .entry-costume')?.textContent === 'Vampire');
  await mobile.unroute('**/api/community');
  await b.locator('#refreshCommunity').click();
  await b.waitForFunction(() => document.querySelector('#rollList .entry-costume')?.textContent === 'Vampire');

  const deniedDelete = await b.request.delete(`${origin}/api/costumes`, { headers: { Origin: origin }, data: {} });
  assert.equal(deniedDelete.status(), 200);
  assert.equal((await deniedDelete.json()).deleted, false, 'A second visitor cannot delete the owner’s costume');

  await b.locator('#guestName').fill('Local Visitor');
  await b.locator('#costumeIdea').fill('f**k');
  const blockedResponse = b.waitForResponse(matching('/api/costumes', 'POST'));
  await b.locator('#costumeSubmit').click();
  const blocked = await blockedResponse;
  assert.equal(blocked.status(), 400);
  assert.equal((await blocked.json()).error, 'profanity');
  await b.waitForFunction(() => document.getElementById('costumeStatus').classList.contains('error'));
  assert.ok((await b.locator('#costumeStatus').textContent()).trim(), 'Profanity rejection must show a readable error');
  assert.ok(!(await b.locator('#rollList').textContent()).includes('f**k'), 'Rejected text must not reach the guest book');

  const removedResponse = a.waitForResponse(matching('/api/costumes', 'DELETE'));
  await a.locator('#deleteMyCostume').tap();
  assert.equal((await removedResponse).status(), 200);
  await a.waitForFunction(() => document.querySelectorAll('#rollList .roll-entry').length === 0);
  assert.deepEqual(runtimeErrors, [], 'Guest journey must not throw browser runtime errors');
  console.log(JSON.stringify({ verified: true, environment: 'local-memory', checks: [
    'first-visit session ordering', 'touch and keyboard movement', 'mobile pause/resume',
    'bank and verified score submission', 'second-browser leaderboard', 'shared costume add/update',
    'stale GET after-write refresh', 'owner-only controls and deletion', 'visible profanity rejection'
  ] }));
  await mobile.close();
  await other.close();
}

async function publicReadOnly() {
  const routes = ['/', '/arcade', '/roll-call'];
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const blockedWrites = [], failures = [], errors = [];
    await context.route('**/*', route => {
      if (!['GET', 'HEAD'].includes(route.request().method())) {
        blockedWrites.push(new URL(route.request().url()).pathname);
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => {
      if (new URL(response.url()).origin === origin && response.status() >= 400) {
        failures.push(`${new URL(response.url()).pathname}: ${response.status()}`);
      }
    });
    for (const [index, path] of routes.entries()) {
      const response = await page.goto(origin + path, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200, `Public ${path} must be accessible without login`);
      if (path === '/') {
        assert.equal(await page.locator('form,canvas,#rollList,#leaderboardBody').count(), 0, 'Home must remain a concise party page');
        assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname.startsWith('/api/')).length), 0, 'Home must not fetch the shared backend');
        if (viewport.width < 600) assert.ok(await page.evaluate(() => document.documentElement.scrollHeight) <= viewport.height * 3.5, 'Phone homepage must stay compact');
        const google = new URL(await page.locator('a.calendar-link').getAttribute('href'));
        assert.equal(google.origin, 'https://calendar.google.com');
        assert.equal(google.searchParams.get('action'), 'TEMPLATE');
        assert.equal(google.searchParams.get('text'), 'Rocktober');
        assert.equal(google.searchParams.get('dates').split('/')[0], '20261101T000000Z');
        assert.equal(google.searchParams.get('ctz'), 'America/New_York');
        assert.equal(await page.locator('a.calendar-download').getAttribute('href'), '/rocktober.ics');
      } else if (path === '/arcade') {
        await page.waitForFunction(() => document.getElementById('leaderboardConnection').classList.contains('live'));
        assert.equal(await page.locator('#gameCanvas').count(), 1);
        assert.equal(await page.locator('#costumeForm').count(), 0);
      } else {
        await page.waitForFunction(() => document.getElementById('communityConnection').classList.contains('live'));
        assert.equal(await page.locator('#costumeForm').count(), 1);
        assert.equal(await page.locator('canvas').count(), 0);
      }
      await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
      const instagram = page.locator('a[href^="https://www.instagram.com/"]');
      assert.ok(await instagram.count() >= 1, 'Every page must retain its Instagram link');
      for (const link of await instagram.all()) {
        const url = new URL(await link.getAttribute('href'));
        assert.equal(url.pathname.replace(/\/+$/, ''), '/rocktober_ss119_4');
        assert.equal((await link.textContent()).trim(), 'Instagram');
        assert.equal(await link.locator('img[src="/assets/instagram.svg"]').count(), 1);
      }
      assert.ok(!(await page.locator('body').innerText()).toLowerCase().includes('rocktober_ss119_4'));
      for (const selector of ['.masthead nav', '.mobile-nav']) {
        assert.equal(await page.locator(`${selector} a[aria-current="page"]`).count(), 1);
        assert.equal(await page.locator(`${selector} a[aria-current="page"]`).getAttribute('href'), path);
      }
      const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.ok(dimensions.width <= dimensions.viewport + 1, `Public ${path} must fit ${viewport.width}px`);
      const navSelector = viewport.width < 600 ? '.mobile-nav' : '.masthead nav';
      const target = routes[(index + 1) % routes.length];
      await page.locator(`${navSelector} a[href="${target}"]`).click();
      await page.waitForURL(url => url.pathname === target);
      await page.waitForLoadState('networkidle');
    }
    const health = await page.request.get(`${origin}/api/health`);
    assert.equal(health.status(), 200);
    const state = await health.json();
    assert.equal(state.configured, true);
    assert.equal(state.mode, 'shared');
    const calendar = await page.request.get(`${origin}/rocktober.ics`);
    assert.equal(calendar.status(), 200);
    assert.ok((await calendar.text()).includes('DTSTART:20261101T000000Z'));
    assert.deepEqual(blockedWrites, [], 'Read-only inspection must not attempt production writes');
    assert.deepEqual(failures, [], 'All three public pages must load their resources');
    assert.deepEqual(errors, [], 'All three public pages must have no browser errors');
    console.log(JSON.stringify({ verified: true, environment: 'public-read-only', viewport: viewport.width,
      checks: ['three public pages', 'compact home without backend fetch', 'separate arcade and roll call',
        'correct current-page tabs', 'real page navigation', 'artwork and Instagram logos',
        'calendar details', 'shared backend status', 'no overflow', 'no browser errors', 'no writes'] }));
    await context.close();
  }
}

try {
  if (!liveOnly) await startLocal(); else await waitForPublishedCalendar();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  if (liveOnly) await publicReadOnly(); else await localJourney();
} finally {
  for (const release of releases) release();
  await browser?.close();
  server?.kill('SIGTERM');
}
