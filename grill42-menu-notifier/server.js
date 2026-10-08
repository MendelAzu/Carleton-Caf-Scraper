require('dotenv').config();

const express = require('express');
const path = require('path');
const { scrapeMenu } = require('./services/scraper');
const { sendMenuEmail, sendTestEmail } = require('./services/email');
const { connectToDatabase, getSubscriberCount, subscribeEmail } = require('./services/subscriptions');
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

app.post('/api/subscribe', async (request, response) => {
  const email = String(request.body?.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: 'Enter a valid email address.' });
  }
  try {
    const result = await subscribeEmail(email);
    response.json({
      ...result,
      message: result.subscribed ? 'You are subscribed to menu notifications.' : 'This email is already subscribed.'
    });
  } catch (error) {
    console.error(`[server] Subscription save failed: ${error.stack || error.message}`);
    response.status(500).json({ error: 'Could not save your subscription. Please try again later.' });
  }
});

app.post('/api/test-email', async (request, response) => {
  const email = String(request.body?.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: 'Enter a valid subscribed email address.' });
  }
  try {
    const menu = currentMenu || await runMenuCheck();
    await sendTestEmail(menu, email);
    response.json({ message: `Test email sent to ${email}.` });
  } catch (error) {
    console.error(`[server] Test email failed: ${error.stack || error.message}`);
    response.status(500).json({ error: error.message });
  }
});

app.get('/api/status', async (request, response) => {
  try {
    response.json({
      lastCheck,
      nextScheduledCheck: getNextScheduledCheck(),
      timezone,
      subscriberCount: await getSubscriberCount()
    });
  } catch (error) {
    console.error(`[server] Status request failed: ${error.stack || error.message}`);
    response.status(500).json({ error: 'Could not load subscription status.' });
  }
});

async function startServer() {
  await connectToDatabase();
  startScheduler(({ scheduledKey }) => runMenuCheck({ sendEmail: true, scheduledKey }));
  app.listen(port, () => {
    console.log(`Grill 42 Menu Notifier listening at http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error(`[server] Startup failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
