// Shared guest-book and leaderboard client. Each page only needs its own markup.
const $ = id => document.getElementById(id);
const form = $('costumeForm');
const nameInput = $('guestName');
const costumeInput = $('costumeIdea');
const submitButton = $('costumeSubmit');
const deleteButton = $('deleteMyCostume');
const randomButton = $('randomCostume');
const status = $('costumeStatus');
const costumeList = $('rollList');
const leaderboardBody = $('leaderboardBody');
const hasCommunity = Boolean(costumeList || leaderboardBody || $('gameCanvas'));

let connected = false;
let busy = false;
let refreshPending = null;
let refreshQueued = false;
let mine = null;
let networkError = false;
let lastCostumeRender = null;
let lastLeaderboardRender = null;

function setStatus(message, error = false) {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('error', error);
}
function updateControls() {
  [nameInput, costumeInput, submitButton, randomButton].filter(Boolean).forEach(element => {
    element.disabled = !connected || busy;
  });
  if (deleteButton) {
    deleteButton.disabled = busy || !connected;
    deleteButton.hidden = !mine;
  }
  if (submitButton) submitButton.textContent = busy ? 'Sending…' : mine ? 'Update my costume' : 'Add my costume +';
}
function connection(label, online) {
  for (const id of ['communityConnection', 'leaderboardConnection']) {
    const element = $(id);
    if (!element) continue;
    element.textContent = label;
    element.classList.toggle('live', online);
    element.classList.toggle('offline', !online);
  }
}
async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(path, {
      credentials: 'same-origin', cache: 'no-store', ...options, signal: controller.signal,
    });
    let data;
    try { data = await response.json(); }
    catch { throw new Error('The crypt is unavailable right now. Try again shortly.'); }
    if (!response.ok) throw new Error(data.message || 'The request could not be completed.');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The crypt took too long to answer. Please try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
function renderCostumes(entries) {
  if (!costumeList) return;
  mine = entries.find(entry => entry.mine) || null;
  const signature = JSON.stringify(entries.map(({ id, name, costume, mine }) => ({ id, name, costume, mine })));
  if (signature === lastCostumeRender) { updateControls(); return; }
  lastCostumeRender = signature;
  const scrollTop = costumeList.scrollTop;
  costumeList.replaceChildren();
  const count = $('entryCount');
  if (count) count.textContent = `${entries.length} ${entries.length === 1 ? 'costume' : 'costumes'}`;
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-list';
    empty.textContent = 'The guest book is quiet… be the first apparition.';
    costumeList.append(empty);
  }
  entries.forEach(entry => {
    const row = document.createElement('div'); row.className = 'roll-entry';
    const copy = document.createElement('div'); copy.className = 'entry-copy';
    const name = document.createElement('span'); name.className = 'entry-name'; name.textContent = entry.name;
    const costume = document.createElement('span'); costume.className = 'entry-costume'; costume.textContent = entry.costume;
    copy.append(name, costume); row.append(copy);
    if (entry.mine) {
      const stamp = document.createElement('span'); stamp.className = 'mine-stamp'; stamp.textContent = 'YOU';
      row.append(stamp);
    }
    costumeList.append(row);
  });
  costumeList.scrollTop = scrollTop;
  if (mine && nameInput && costumeInput && !nameInput.value && !costumeInput.value) {
    nameInput.value = mine.name;
    costumeInput.value = mine.costume;
  }
  updateControls();
}
function renderLeaderboard(entries) {
  if (!leaderboardBody) return;
  const signature = JSON.stringify(entries.slice(0, 10).map(({ rank, name, score }) => ({ rank, name, score })));
  if (signature === lastLeaderboardRender) return;
  lastLeaderboardRender = signature;
  leaderboardBody.replaceChildren();
  if (!entries.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td'); cell.colSpan = 3; cell.className = 'empty-score';
    cell.textContent = 'No ghosts on the board yet. Set the first score.';
    row.append(cell); leaderboardBody.append(row);
    return;
  }
  entries.slice(0, 10).forEach((entry, index) => {
    const row = document.createElement('tr');
    for (const value of [String(entry.rank || index + 1).padStart(2, '0'), entry.name, Number(entry.score).toLocaleString()]) {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    }
    leaderboardBody.append(row);
  });
}
async function refreshOnce() {
  try {
    const data = await api('/api/community');
    connected = true;
    connection('Shared · live', true);
    renderCostumes(data.costumes || []);
    renderLeaderboard(data.leaderboard || []);
    if (networkError) setStatus('Back in touch with the crypt.');
    networkError = false;
  } catch (error) {
    connected = false;
    connection('Reconnecting…', false);
    setStatus(error.message, true);
    networkError = true;
    if (costumeList && !costumeList.querySelector('.roll-entry')) {
      const empty = costumeList.querySelector('p');
      if (empty) empty.textContent = 'The guest book is temporarily unavailable. Please check back.';
      lastCostumeRender = null;
    }
    updateControls();
  }
}
function refresh(afterWrite = false) {
  if (!hasCommunity) return Promise.resolve();
  if (refreshPending) {
    if (afterWrite === true) refreshQueued = true;
    return refreshPending;
  }
  refreshPending = (async () => {
    do {
      refreshQueued = false;
      await refreshOnce();
    } while (refreshQueued);
  })().finally(() => { refreshPending = null; });
  return refreshPending;
}
if (form && nameInput && costumeInput) form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !connected) return;
  const name = nameInput.value.trim(), costume = costumeInput.value.trim();
  if (!name || !costume) return;
  busy = true; updateControls();
  try {
    await api('/api/costumes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, costume }),
    });
    setStatus('You’re in the guest book. The crypt approves.');
    await refresh(true);
  } catch (error) { setStatus(error.message, true); }
  finally { busy = false; updateControls(); }
});
if (deleteButton) deleteButton.addEventListener('click', async () => {
  if (busy || !connected || !mine) return;
  busy = true; updateControls();
  try {
    await api('/api/costumes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    mine = null;
    if (nameInput) nameInput.value = '';
    if (costumeInput) costumeInput.value = '';
    setStatus('Your entry has left the crypt.');
    await refresh(true);
  } catch (error) { setStatus(error.message, true); }
  finally { busy = false; updateControls(); }
});
const ideas = ['Mothman', 'A haunted Clemson tiger', 'Vampire rock star', 'Ghost with a day job', 'Swamp creature', 'Cursed fortune teller', 'Disco skeleton', 'Werewolf in a cardigan', 'The world’s tiniest gargoyle', 'Possessed marching band'];
if (randomButton && costumeInput) randomButton.addEventListener('click', () => {
  costumeInput.value = ideas[Math.floor(Math.random() * ideas.length)];
  costumeInput.focus();
});
$('refreshCommunity')?.addEventListener('click', () => refresh());
if (hasCommunity) {
  window.addEventListener('rocktober:refresh', () => refresh(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  setInterval(() => { if (!document.hidden && !busy) refresh(); }, 20000);
}
// The arcade waits for this cookie-setting request before opening a verified run.
// Pages with no shared widgets do not fetch or poll the backend.
window.rocktoberSessionReady = hasCommunity ? refresh() : Promise.resolve();
