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

const batTrigger = $('batTrigger');
const batLayer = $('batFlightLayer');
if (batTrigger && batLayer) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const flights = new Set();
  let resetCaption;
  let releases = 0;
  const messages = [
    'You woke the colony. They know where the party is.',
    'Six bats loose. The crypt keeper is going to hear about this.',
    'No vampires were harmed. Their sleep schedule was.',
  ];
  function clearFlights() {
    for (const flight of flights) flight.cancel();
    flights.clear();
    batLayer.replaceChildren();
  }
  batTrigger.addEventListener('click', () => {
    clearFlights();
    clearTimeout(resetCaption);
    $('batStatus').textContent = messages[releases++ % messages.length];
    $('batCaption').textContent = 'Spooked!';
    batTrigger.classList.add('is-awake');
    resetCaption = setTimeout(() => {
      $('batCaption').textContent = 'Wake the bats';
      batTrigger.classList.remove('is-awake');
    }, 2200);
    if (reducedMotion.matches || typeof batLayer.animate !== 'function') return;

    const bounds = batLayer.getBoundingClientRect();
    const perch = batTrigger.getBoundingClientRect();
    const width = Math.max(1, bounds.width - 44);
    const height = Math.max(1, bounds.height - 28);
    const startX = Math.min(width, Math.max(0, perch.left - bounds.left + 16));
    const startY = Math.min(height, Math.max(0, perch.top - bounds.top + 8));
    const destinations = [[.03,.08],[.08,.82],[.36,.02],[.48,.91],[.76,.06],[.91,.84]];
    destinations.forEach(([x, y], index) => {
      const bat = document.createElement('img');
      bat.className = 'flying-bat';
      bat.src = '/assets/bat-flight.svg';
      bat.alt = '';
      bat.width = 44;
      bat.height = 26;
      batLayer.append(bat);
      const endX = x * width, endY = y * height;
      const angle = index % 2 ? 13 : -17;
      const flight = bat.animate([
        { transform: `translate(${startX}px,${startY}px) scale(.4) rotate(0deg)`, opacity: 0 },
        { transform: `translate(${startX + (endX-startX)*.3}px,${startY + (endY-startY)*.15}px) scale(.85,.6) rotate(${angle}deg)`, opacity: 1, offset: .25 },
        { transform: `translate(${startX + (endX-startX)*.65}px,${startY + (endY-startY)*.7}px) scale(1,.95) rotate(${-angle}deg)`, opacity: .9, offset: .65 },
        { transform: `translate(${endX}px,${endY}px) scale(.55,.5) rotate(${angle}deg)`, opacity: 0 },
      ], { duration: 1100 + index * 90, easing: 'ease-out' });
      flights.add(flight);
      flight.finished.catch(() => {}).finally(() => {
        flights.delete(flight);
        bat.remove();
      });
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearFlights();
  });
}
