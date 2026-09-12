const $ = (selector) => document.querySelector(selector);
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function formatDate(value) {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function setStatus(message, isError = false) {
  const element = $('#action-status');
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
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
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
  if (status.recipient) { $('#email').value = status.recipient; $('#saved-recipient').textContent = status.recipient; }
}

$('#email-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await request('/api/save-email', { method: 'POST', body: JSON.stringify({ email: $('#email').value }) });
    $('#saved-recipient').textContent = result.email; setStatus(result.message);
  } catch (error) { setStatus(error.message, true); }
});

$('#check-menu').addEventListener('click', async (event) => {
  const button = event.currentTarget; button.disabled = true; setStatus('Checking the dining hall menu...');
  try { await request('/api/check-menu', { method: 'POST' }); await refresh(); setStatus('Menu check completed.'); } catch (error) { setStatus(error.message, true); } finally { button.disabled = false; }
});

$('#test-email').addEventListener('click', async (event) => {
  const button = event.currentTarget; button.disabled = true; setStatus('Sending test email...');
  try { const result = await request('/api/test-email', { method: 'POST' }); setStatus(result.message); } catch (error) { setStatus(error.message, true); } finally { button.disabled = false; }
});

refresh().catch((error) => setStatus(error.message, true));
