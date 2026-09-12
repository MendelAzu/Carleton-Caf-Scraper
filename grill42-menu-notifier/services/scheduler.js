const cron = require('node-cron');
const { DateTime } = require('luxon');

const timezone = process.env.TIMEZONE || 'America/Toronto';
const schedules = (process.env.CHECK_SCHEDULES || '1 11 * * *;31 16 * * *')
  .split(';').map((schedule) => schedule.trim()).filter(Boolean);
let nextScheduledCheck = null;
const completedRuns = new Set();

function getNextScheduledCheck() {
  return nextScheduledCheck;
}

function updateNextScheduledCheck() {
  const now = DateTime.now().setZone(timezone);
  const candidates = schedules.map((expression) => {
    const match = expression.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
    if (!match) return null;
    let candidate = now.set({ hour: Number(match[2]), minute: Number(match[1]), second: 0, millisecond: 0 });
    if (candidate <= now) candidate = candidate.plus({ days: 1 });
    return candidate;
  }).filter(Boolean).sort((a, b) => a.toMillis() - b.toMillis())[0];
  nextScheduledCheck = candidates ? candidates.toISO() : null;
}

function startScheduler(onCheck) {
  schedules.forEach((expression) => {
    if (!cron.validate(expression)) {
      console.error(`[scheduler] Invalid cron expression: ${expression}`);
      return;
    }
    cron.schedule(expression, async () => {
      const key = `${DateTime.now().setZone(timezone).toFormat('yyyy-LL-dd-HH-mm')}:${expression}`;
      if (completedRuns.has(key)) return;
      completedRuns.add(key);
      try {
        await onCheck({ scheduled: true, scheduledKey: key });
      } catch (error) {
        console.error(`[scheduler] Scheduled check failed: ${error.message}`);
      } finally {
        updateNextScheduledCheck();
      }
    }, { timezone });
  });
  updateNextScheduledCheck();
  console.log(`[scheduler] Active in ${timezone}: ${schedules.join(' | ')}`);
}

module.exports = { startScheduler, getNextScheduledCheck, schedules, timezone };
