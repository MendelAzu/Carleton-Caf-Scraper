require('dotenv').config();

const express = require('express');
const path = require('path');
const { scrapeMenu } = require('./services/scraper');
const { getRecipientEmail, saveRecipientEmail, sendMenuEmail, sendTestEmail } = require('./services/email');
const { startScheduler, getNextScheduledCheck, timezone } = require('./services/scheduler');

const app = express();
const port = Number(process.env.PORT || 3000);
const source = process.env.DINING_HALL_URL || 'https://carleton.mydininghub.ca/en/location/teraanga-commons-dining-hall';
let currentMenu = null;
let lastCheck = { time: null, success: null, message: 'No menu check has run yet.' };
const processedScheduledKeys = new Set();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function runMenuCheck({ sendEmail = false, scheduledKey = null } = {}) {
  if (scheduledKey && processedScheduledKeys.has(scheduledKey)) return currentMenu;
  if (scheduledKey) processedScheduledKeys.add(scheduledKey);

  try {
    const menu = await scrapeMenu(source);
    currentMenu = menu;
    lastCheck = {
      time: menu.checkedAt,
      success: true,
      message: menu.items.length ? `Menu retrieved: ${menu.items.length} item(s).` : 'No menu items were found.'
    };
    if (sendEmail) await sendMenuEmail(menu, menu.checkedAt);
    return menu;
  } catch (error) {
    lastCheck = { time: new Date().toISOString(), success: false, message: error.message };
    console.error(`[server] Menu check failed: ${error.stack || error.message}`);
    throw error;
  }
}

app.get('/api/menu', (request, response) => {
  response.json(currentMenu || { station: 'The Grill 42', items: [], checkedAt: null, source, message: 'No menu has been retrieved yet.' });
});

app.post('/api/check-menu', async (request, response) => {
  try {
    response.json(await runMenuCheck());
  } catch (error) {
    response.status(502).json({ error: error.message, status: lastCheck });
  }
});

app.post('/api/save-email', (request, response) => {
  const email = String(request.body?.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: 'Enter a valid email address.' });
  }
  saveRecipientEmail(email);
  response.json({ email, message: 'Email address saved.' });
});

app.post('/api/test-email', async (request, response) => {
  try {
    const menu = currentMenu || await runMenuCheck();
    await sendTestEmail(menu);
    response.json({ message: `Test email sent to ${getRecipientEmail()}.` });
  } catch (error) {
    console.error(`[server] Test email failed: ${error.stack || error.message}`);
    response.status(500).json({ error: error.message });
  }
});

app.get('/api/status', (request, response) => {
  response.json({ lastCheck, nextScheduledCheck: getNextScheduledCheck(), timezone, recipient: getRecipientEmail() });
});

startScheduler(({ scheduledKey }) => runMenuCheck({ sendEmail: true, scheduledKey }));

app.listen(port, () => {
  console.log(`Grill 42 Menu Notifier listening at http://localhost:${port}`);
});
