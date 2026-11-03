const $ = (selector) => document.querySelector(selector);
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function formatDate(value) {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('error', isError);
}

function renderMenu(menu) {
  $('#menu-time').textContent = menu.checkedAt ? formatDate(menu.checkedAt) : 'No check yet';
  const container = $('#menu-items');
  if (!menu.items?.length) {
    container.innerHTML = '<p class="empty">No menu items were found for this check.</p>';
    return;
  }
  container.innerHTML = menu.items.map((item) => `<div class="menu-item"><strong>${escapeHtml(item.name)}</strong>${item.description ? `<span>${escapeHtml(item.description)}</span>` : ''}</div>`).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
}

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  } catch (error) {
    throw new Error('Cannot connect to the server. Start it with npm start, then open http://localhost:3000.');
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

async function refresh() {
  const [menu, status] = await Promise.all([request('/api/menu'), request('/api/status')]);
  renderMenu(menu);
  $('#next-check').textContent = formatDate(status.nextScheduledCheck);
  $('#last-status').textContent = status.lastCheck.message;
  $('#last-status').classList.toggle('error', status.lastCheck.success === false);
  $('#timezone').textContent = `Server time zone: ${status.timezone}`;
}

$('#email-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await request('/api/subscribe', { method: 'POST', body: JSON.stringify({ email: $('#email').value }) });
    setStatus($('#action-status'), result.message);
    await refresh();
  } catch (error) { setStatus($('#action-status'), error.message, true); } finally { button.disabled = false; }
});

$('#unsubscribe-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const status = $('#unsubscribe-status');
  button.disabled = true;
  try {
    const result = await request('/api/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ email: $('#unsubscribe-email').value })
    });
    setStatus(status, result.message);
  } catch (error) {
    setStatus(status, error.message, true);
  } finally {
    button.disabled = false;
  }
});

refresh().catch((error) => setStatus($('#action-status'), error.message, true));
