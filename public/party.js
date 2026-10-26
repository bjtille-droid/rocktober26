// Party-page effects stay separate from the shared guest book and arcade client.
const $ = id => document.getElementById(id);
const partyTime = new Date('2026-10-31T20:00:00-04:00').getTime();
const countdownParts = ['days', 'hours', 'minutes', 'seconds'].map(id => $(id));

function redirectLegacySection() {
  const routes = { '#game': '/arcade', '#costumes': '/roll-call' };
  const destination = routes[window.location.hash];
  if (destination) window.location.replace(destination);
}
redirectLegacySection();
window.addEventListener('hashchange', redirectLegacySection);

function updateCountdown() {
  const seconds = Math.max(0, Math.floor((partyTime - Date.now()) / 1000));
  const values = [Math.floor(seconds / 86400), Math.floor(seconds % 86400 / 3600), Math.floor(seconds % 3600 / 60), seconds % 60];
  countdownParts.forEach((element, index) => {
    if (element) element.textContent = String(values[index]).padStart(2, '0');
  });
  if (!seconds && $('countdown-label')) $('countdown-label').textContent = 'The door is open';
}
if (countdownParts.some(Boolean)) {
  updateCountdown();
  setInterval(updateCountdown, 1000);
}
$('pledgeButton')?.addEventListener('click', event => {
  const button = event.currentTarget;
  button.textContent = '✓ The crypt keeper accepts your offering';
  button.classList.add('accepted');
  button.setAttribute('aria-pressed', 'true');
});
