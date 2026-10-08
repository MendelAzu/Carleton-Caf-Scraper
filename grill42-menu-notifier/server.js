require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const { DateTime } = require('luxon');
const path = require('path');
const { scrapeMenu } = require('./services/scraper');
const { sendMenuEmail, sendTestEmail } = require('./services/email');
const { connectToDatabase, getSubscriberCount, subscribeEmail } = require('./services/subscriptions');
const { startScheduler, getNextScheduledCheck, schedules, timezone } = require('./services/scheduler');

const app = express();
const port = Number(process.env.PORT || 3000);
const source = process.env.DINING_HALL_URL || 'https://carleton.mydininghub.ca/en/location/teraanga-commons-dining-hall';
let currentMenu = null;
let lastCheck = { time: null, success: null, message: 'No menu check has run yet.' };
const processedScheduledKeys = new Set();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function isAuthorizedCron(request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.get('authorization') || '';
  if (!secret || !authorization.startsWith('Bearer ')) return false;

  const provided = Buffer.from(authorization.slice('Bearer '.length));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function isExpectedCronSchedule(expression) {
  const match = expression && expression.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
  if (!match) return false;

  const now = DateTime.now().setZone(timezone);
  return schedulesForCron().some((schedule) => {
    const [minute, hour] = schedule.split(/\s+/).map(Number);
    const expectedUtc = now.set({ hour, minute, second: 0, millisecond: 0 }).toUTC();
    return expectedUtc.minute === Number(match[1]) && expectedUtc.hour === Number(match[2]);
  });
}

function schedulesForCron() {
  return schedules.filter((schedule) => /^\d+\s+\d+\s+\*\s+\*\s+\*$/.test(schedule));
}

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

app.get('/api/menu', async (request, response) => {
  try {
    response.json(currentMenu || await runMenuCheck());
  } catch (error) {
    response.status(502).json({ error: error.message, status: lastCheck });
  }
});

app.get('/api/cron', async (request, response) => {
  if (!isAuthorizedCron(request)) {
    return response.status(401).json({ error: 'Unauthorized.' });
  }

  const expression = request.get('x-vercel-cron-schedule');
  if (!isExpectedCronSchedule(expression)) {
    return response.json({ skipped: true, message: 'This UTC cron schedule does not match a local menu-check time today.' });
  }

  const scheduledKey = `${DateTime.now().setZone(timezone).toFormat('yyyy-LL-dd-HH-mm')}:${expression}`;
  try {
    response.json(await runMenuCheck({ sendEmail: true, scheduledKey }));
  } catch (error) {
    response.status(502).json({ error: error.message, status: lastCheck });
  }
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

if (require.main === module) {
  startServer().catch((error) => {
    console.error(`[server] Startup failed: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { app, runMenuCheck };
